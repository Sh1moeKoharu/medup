import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { planificarFefo, aplicarFefo, PlanFefo } from "../../../../../lib/fefo";
import { recordInventoryMovement } from "../../../../../lib/inventory-ledger";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { almacenDeEnfermeria } from "../../../../../lib/almacenes";
import { cargarALaCuenta } from "../../../../../lib/cuentas-de-paciente";

/**
 * POST /admin/medical-orders/:id/consume — Enfermería aplica una orden.
 *
 * Es el gemelo de /dispense para el otro destinatario:
 *
 *   · Sale del almacén de ENFERMERÍA, por caducidad más próxima, todo o nada
 *     (409 si a un renglón no le alcanza, sin tocar nada).
 *   · Y lo consumido SE CARGA A LA CUENTA DEL PACIENTE: un pedido en borrador
 *     a su nombre que Caja abre y cobra. Ese enlace es lo que faltaba: hasta
 *     hoy lo aplicado en consulta salía del inventario y no llegaba a ningún
 *     cobro (ver lib/cuentas-de-paciente.ts).
 *
 * Si el inventario se descuenta y la cuenta no se puede abrir, se responde
 * 200 con `advertencia`: el medicamento ya está aplicado y el kardex lo dice;
 * lo que falta es el cobro, y eso se avisa para que Caja lo cargue a mano.
 *
 * Body: sin cuerpo.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien aplica. Vuelve a iniciar sesión." });
        }

        const order = await service.retrieveMedicalOrder(orderId, { relations: ["items"] });
        if (!order) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }
        if (order.status !== "pending") {
            return res.status(400).json({ error: `Esta orden está "${order.status}"; sólo se aplican las pendientes.` });
        }
        if ((order as any).recipient_area !== "nursing") {
            return res.status(400).json({
                error: "Esta orden va a Farmacia: la surte Farmacia desde su bandeja, no Enfermería.",
            });
        }
        if (!order.items?.length) {
            return res.status(400).json({ error: "La orden no tiene renglones que aplicar." });
        }

        const enfermeria = await almacenDeEnfermeria(req.scope as any);
        if (!enfermeria) {
            return res.status(500).json({ error: "No hay almacén de Enfermería. Ejecuta preparar-almacenes.ts." });
        }

        // ── 1. Planificar todo antes de tocar nada ──────────────────────────
        const planes: { item: any; plan: PlanFefo }[] = [];
        const faltantes: { variant_id: string; product_title: string | null; solicitado: number; faltante: number }[] = [];

        for (const item of order.items) {
            const plan = await planificarFefo(req.scope as any, item.variant_id, item.quantity, enfermeria.id);
            planes.push({ item, plan });
            if (!plan.alcanza) {
                faltantes.push({ variant_id: item.variant_id, product_title: item.product_title ?? null, solicitado: item.quantity, faltante: plan.faltante });
            }
        }

        if (faltantes.length) {
            return res.status(409).json({
                error: `No hay existencia suficiente en ${enfermeria.name} para aplicar la orden completa.`,
                detalle: faltantes,
                message: "No se modificó el inventario ni la orden. Pide a Farmacia lo que falte con una requisición, o ajusta la orden.",
            });
        }

        // ── 2. Descontar y asentar ──────────────────────────────────────────
        let asientosFallidos = 0;
        const lotes: any[] = [];

        for (const { item, plan } of planes) {
            const aplicadas = await aplicarFefo(req.scope as any, plan);
            for (const a of aplicadas) {
                const ok = await recordInventoryMovement(req.scope as any, {
                    variant_id: item.variant_id,
                    stock_location_id: enfermeria.id,
                    variant_title: item.product_title ?? null,
                    batch_id: a.lote.id,
                    batch_number: a.lote.batch_number ?? null,
                    expiration_date: a.lote.expiration_date ?? null,
                    quantity_delta: -a.cantidad,
                    quantity_after: a.saldoResultante,
                    type: "exit_sale",
                    reason: "Aplicado en consulta por Enfermería (FEFO)",
                    reference_type: "medical_order",
                    reference_id: orderId,
                    user_id: actor.id,
                    user_email: actor.email,
                });
                if (!ok) asientosFallidos++;
                lotes.push({ product_title: item.product_title, batch_number: a.lote.batch_number, cantidad: a.cantidad, saldo_restante: a.saldoResultante });
            }
        }

        // ── 3. A la cuenta del paciente ─────────────────────────────────────
        let cuenta: any = null;
        let advertencia: string | null = null;
        try {
            cuenta = await cargarALaCuenta(
                req.scope as any,
                order.customer_id,
                order.items.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity }))
            );
        } catch (e: any) {
            advertencia =
                `El medicamento se aplicó y el inventario se descontó, pero NO se pudo cargar a la cuenta ` +
                `del paciente: ${e?.message ?? e}. Caja debe añadirlo a mano al cobrar.`;
            try {
                const logger: any = req.scope.resolve("logger");
                logger.error(`[CUENTA] Orden ${orderId}: ${advertencia}`);
            } catch {
                // el diagnóstico es opcional
            }
        }

        // ── 4. Marcar la orden ──────────────────────────────────────────────
        const updated = await service.updateMedicalOrders({
            id: orderId,
            status: "dispensed",
            dispensed_by_id: actor.id,
            dispensed_by_name: actor.name,
            dispensed_at: new Date(),
            draft_order_id: cuenta?.id ?? null,
        } as any);

        return res.json({
            medical_order: updated,
            aplicado_por: actor.email ?? actor.id,
            lotes,
            cuenta,
            ...(advertencia ? { advertencia } : {}),
            ...(asientosFallidos
                ? { advertencia_kardex: `${asientosFallidos} movimiento(s) no se pudieron asentar en el kardex. El stock sí se descontó.` }
                : {}),
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
