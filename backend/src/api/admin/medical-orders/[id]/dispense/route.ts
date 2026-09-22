import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { planificarFefo, aplicarFefo, PlanFefo } from "../../../../../lib/fefo";
import { recordInventoryMovement } from "../../../../../lib/inventory-ledger";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { conCandado } from "../../../../../lib/candado";
import { almacenDeFarmacia } from "../../../../../lib/almacenes";

/**
 * POST /admin/medical-orders/:id/dispense — Farmacia surte una receta.
 *
 * ── SURTIR SACA EL MEDICAMENTO DEL INVENTARIO ───────────────────────────────
 * Antes esto no descontaba: incrementaba `medical_batch.reserved_quantity`,
 * dejando el stock intacto y apartado a la espera de que caja lo cobrara.
 *
 * Ese cobro NUNCA existió. El punto de venta no tiene ninguna referencia a las
 * órdenes médicas —comprobado en todo el frontend—, así que la promesa de la
 * pantalla de farmacia ("la orden pasará a caja") describía un puente que no
 * está construido. Consecuencia: la reserva no se liberaba jamás y el
 * disponible (`quantity - reserved_quantity`) se erosionaba de forma monótona
 * hasta reportar cero con el anaquel lleno.
 *
 * Ahora surtir descuenta, que además es lo que ocurre físicamente: cuando
 * Farmacia entrega el medicamento, éste ya salió del anaquel. Si hay que
 * cobrarlo, eso es facturación, y no es asunto del inventario.
 *
 * ── TODO O NADA ─────────────────────────────────────────────────────────────
 * Antes se marcaba la orden como `dispensed` AUNQUE no hubiera existencia, y el
 * faltante se devolvía en un `warnings` que nadie miraba. Quedaba una receta
 * afirmando estar surtida sin haberlo estado.
 *
 * Ahora se comprueba TODA la receta antes de tocar nada. Si un solo renglón no
 * alcanza, se responde 409 con el detalle y no se modifica ni el inventario ni
 * el estado de la orden.
 *
 * Body: sin cuerpo.
 */
/**
 * Con candado por orden: dos clics seguidos sobre la misma orden descontaban el
 * inventario dos veces (los dos pasaban «está pendiente» antes de que el primero
 * la marcara). Ver lib/candado.ts.
 */
export const POST = (req: MedusaRequest, res: MedusaResponse) =>
    conCandado(req.scope as any, `medical-order:${req.params.id}`, () => procesar(req, res));

const procesar = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;

        // Quién surte: dato obligatorio del expediente. Un movimiento de
        // inventario sin responsable no es auditable.
        const actor = await resolveRequestActor(req);

        if (!actor) {
            return res.status(401).json({
                error: "No se pudo identificar a quien surte. Vuelve a iniciar sesión.",
            });
        }

        const order = await medicalOrdersService.retrieveMedicalOrder(orderId, {
            relations: ["items"],
        });

        if (!order) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }

        if (order.status !== "pending") {
            return res.status(400).json({
                error: `Esta orden está "${order.status}"; sólo se pueden surtir las pendientes.`,
            });
        }
        if ((order as any).recipient_area === "nursing") {
            return res.status(400).json({
                error: "Esta orden va a Enfermería: la aplica Enfermería en consulta, desde su bandeja.",
            });
        }

        // ── De qué almacén sale ─────────────────────────────────────────────
        // Farmacia surte de Farmacia. Lo que Enfermería consume en consulta
        // sale de su propio almacén, por su propio circuito (fase 3).
        const farmacia = await almacenDeFarmacia(req.scope as any);
        if (!farmacia) {
            return res.status(500).json({
                error: "No hay un almacén de Farmacia configurado. Ejecuta preparar-almacenes.ts.",
            });
        }

        // ── 1. Planificar TODA la receta antes de tocar nada ─────────────────
        const planes: { item: any; plan: PlanFefo }[] = [];
        const faltantes: {
            variant_id: string;
            product_title: string | null;
            solicitado: number;
            faltante: number;
        }[] = [];

        for (const item of order.items) {
            const plan = await planificarFefo(req.scope as any, item.variant_id, item.quantity, farmacia.id);
            planes.push({ item, plan });

            if (!plan.alcanza) {
                faltantes.push({
                    variant_id: item.variant_id,
                    product_title: item.product_title ?? null,
                    solicitado: item.quantity,
                    faltante: plan.faltante,
                });
            }
        }

        if (faltantes.length) {
            return res.status(409).json({
                error: `No hay existencia suficiente en ${farmacia.name} para surtir la receta completa.`,
                detalle: faltantes,
                message:
                    "No se modificó el inventario ni el estado de la orden. " +
                    "Registra la entrada que falte, o cancela la orden si ya no procede.",
            });
        }

        // ── 2. Aplicar y asentar ────────────────────────────────────────────
        // El descuento y el asiento no son atómicos entre sí; es la limitación
        // conocida del libro mayor (ver lib/inventory-ledger.ts). Un fallo al
        // asentar queda registrado con nivel ERROR y todos los datos, para poder
        // reconstruirlo a mano.
        let asientosFallidos = 0;

        for (const { item, plan } of planes) {
            const aplicadas = await aplicarFefo(req.scope as any, plan);

            for (const a of aplicadas) {
                const ok = await recordInventoryMovement(req.scope as any, {
                    variant_id: item.variant_id,
                    stock_location_id: farmacia.id,
                    variant_title: item.product_title ?? null,
                    batch_id: a.lote.id,
                    batch_number: a.lote.batch_number ?? null,
                    expiration_date: a.lote.expiration_date ?? null,
                    quantity_delta: -a.cantidad,
                    quantity_after: a.saldoResultante,
                    type: "exit_sale",
                    reason: "Salida por dispensación de orden médica (FEFO)",
                    reference_type: "medical_order",
                    reference_id: orderId,
                    user_id: actor.id,
                    user_email: actor.email,
                });

                if (!ok) {
                    asientosFallidos++;
                }
            }
        }

        // ── 3. Marcar la orden ──────────────────────────────────────────────
        const updatedOrder = await medicalOrdersService.updateMedicalOrders({
            id: orderId,
            status: "dispensed",
            dispensed_by_id: actor.id,
            dispensed_by_name: actor.name,
            dispensed_at: new Date(),
        } as any);

        return res.json({
            medical_order: updatedOrder,
            dispensado_por: actor.email ?? actor.id,
            lotes: planes.flatMap(({ item, plan }) =>
                plan.asignaciones.map((a) => ({
                    product_title: item.product_title,
                    batch_number: a.lote.batch_number,
                    cantidad: a.cantidad,
                    saldo_restante: a.saldoResultante,
                }))
            ),
            // Se informa, pero no se falla: el medicamento YA se entregó. El
            // aviso sirve para que alguien reconstruya el asiento desde el log.
            ...(asientosFallidos
                ? {
                      advertencia:
                          `${asientosFallidos} movimiento(s) no se pudieron asentar en el ` +
                          `kardex. El stock sí se descontó. Revisa el registro del servidor.`,
                  }
                : {}),
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
