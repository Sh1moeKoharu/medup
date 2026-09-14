import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REQUISITIONS_MODULE } from "../../../../../modules/requisitions";
import RequisitionsModuleService from "../../../../../modules/requisitions/service";
import { MEDICAL_INVENTORY_MODULE } from "../../../../../modules/medical-inventory";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { planificarFefo, aplicarFefo, PlanFefo } from "../../../../../lib/fefo";
import { recordInventoryMovement } from "../../../../../lib/inventory-ledger";
import { nombresDeAlmacenes } from "../../../../../lib/almacenes";
import { estadoTrasSurtir, planificarSurtido, puedeSurtirse, type Pedido } from "../../../../../lib/requisiciones";

/**
 * POST /admin/requisitions/:id/dispatch — Farmacia surte una requisición.
 *
 * Body: { items?: [{ item_id, cantidad }] }  — sin cuerpo, todo lo pendiente.
 *
 * ── EL TRASPASO SON DOS ASIENTOS ────────────────────────────────────────────
 * Por cada lote del que sale medicamento en Farmacia (FEFO: el que caduca
 * antes primero) se escribe `exit_transfer` en el almacén de origen, y la misma
 * cantidad entra al almacén de destino con el MISMO número de lote y caducidad,
 * con su `entry_transfer`. Si en el destino ya existe ese lote, se le suma; si
 * no, se crea. El kardex de los dos almacenes cuadra por construcción.
 *
 * ── TODO O NADA ─────────────────────────────────────────────────────────────
 * Se planifica el surtido completo antes de tocar nada. Si a un solo renglón
 * no le alcanza la existencia en Farmacia, se responde 409 con el detalle y no
 * se mueve nada. Quien surte puede entonces pedir menos con `items`.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const requisiciones: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);
        const inventario: any = req.scope.resolve(MEDICAL_INVENTORY_MODULE);
        const id = req.params.id;
        const { items: pedidos } = (req.body ?? {}) as { items?: Pedido[] };

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien surte. Vuelve a iniciar sesión." });
        }

        const [requisicion] = await requisiciones.listRequisitions({ id }, { relations: ["items"] });
        if (!requisicion) {
            return res.status(404).json({ error: "Requisición no encontrada." });
        }
        if (!puedeSurtirse(requisicion.status)) {
            return res.status(400).json({
                error: `Esta requisición está "${requisicion.status}"; sólo se surten las pendientes.`,
            });
        }

        const plan = planificarSurtido(requisicion.items as any, pedidos);
        if (!plan.ok) {
            return res.status(400).json({ error: plan.error });
        }

        const nombres = await nombresDeAlmacenes(req.scope as any);
        const origen = requisicion.source_location_id;
        const destino = requisicion.destination_location_id;

        // ── 1. Planificar en Farmacia antes de tocar nada ──────────────────
        const planes: { surtido: (typeof plan.surtir)[number]; fefo: PlanFefo }[] = [];
        const faltantes: { product_title: string | null; solicitado: number; faltante: number }[] = [];

        for (const surtido of plan.surtir) {
            const fefo = await planificarFefo(req.scope as any, surtido.renglon.variant_id, surtido.cantidad, origen);
            planes.push({ surtido, fefo });
            if (!fefo.alcanza) {
                faltantes.push({
                    product_title: surtido.renglon.product_title,
                    solicitado: surtido.cantidad,
                    faltante: fefo.faltante,
                });
            }
        }

        if (faltantes.length) {
            return res.status(409).json({
                error: `No hay existencia suficiente en ${nombres.get(origen) ?? "el almacén de origen"} para surtir lo pedido.`,
                detalle: faltantes,
                message: "No se movió nada. Registra la entrada que falte, o surte una cantidad menor indicando `items`.",
            });
        }

        // ── 2. Aplicar: salida en origen, entrada en destino ───────────────
        const movimientos: any[] = [];
        let asientosFallidos = 0;

        for (const { surtido, fefo } of planes) {
            const aplicadas = await aplicarFefo(req.scope as any, fefo);

            for (const a of aplicadas) {
                const salida = await recordInventoryMovement(req.scope as any, {
                    variant_id: surtido.renglon.variant_id,
                    stock_location_id: origen,
                    variant_title: surtido.renglon.product_title,
                    batch_id: a.lote.id,
                    batch_number: a.lote.batch_number,
                    expiration_date: a.lote.expiration_date,
                    quantity_delta: -a.cantidad,
                    quantity_after: a.saldoResultante,
                    type: "exit_transfer",
                    reason: `Traspaso a ${nombres.get(destino) ?? destino} por requisición`,
                    reference_type: "requisition",
                    reference_id: id,
                    user_id: actor.id,
                    user_email: actor.email,
                });
                if (!salida) asientosFallidos++;

                // El mismo lote en el destino: se suma si ya existe, se crea si no.
                const [origenLote] = await inventario.listMedicalBatches({ id: a.lote.id });
                const [existente] = await inventario.listMedicalBatches({
                    variant_id: surtido.renglon.variant_id,
                    batch_number: a.lote.batch_number,
                    stock_location_id: destino,
                    status: "active",
                });

                let loteDestino: any;
                if (existente) {
                    loteDestino = await inventario.updateMedicalBatches({
                        id: existente.id,
                        quantity: Number(existente.quantity) + a.cantidad,
                    });
                } else {
                    loteDestino = await inventario.createMedicalBatches({
                        batch_number: a.lote.batch_number,
                        expiration_date: a.lote.expiration_date,
                        quantity: a.cantidad,
                        variant_id: surtido.renglon.variant_id,
                        stock_location_id: destino,
                        purchase_unit: origenLote?.purchase_unit ?? null,
                        sale_unit: origenLote?.sale_unit ?? null,
                        units_per_purchase: origenLote?.units_per_purchase ?? 1,
                        shelf_location: null,
                    });
                }

                const entrada = await recordInventoryMovement(req.scope as any, {
                    variant_id: surtido.renglon.variant_id,
                    stock_location_id: destino,
                    variant_title: surtido.renglon.product_title,
                    batch_id: loteDestino.id,
                    batch_number: a.lote.batch_number,
                    expiration_date: a.lote.expiration_date,
                    quantity_delta: a.cantidad,
                    quantity_after: Number(loteDestino.quantity),
                    type: "entry_transfer",
                    reason: `Traspaso desde ${nombres.get(origen) ?? origen} por requisición`,
                    reference_type: "requisition",
                    reference_id: id,
                    user_id: actor.id,
                    user_email: actor.email,
                });
                if (!entrada) asientosFallidos++;

                movimientos.push({
                    product_title: surtido.renglon.product_title,
                    batch_number: a.lote.batch_number,
                    cantidad: a.cantidad,
                    saldo_origen: a.saldoResultante,
                    saldo_destino: Number(loteDestino.quantity),
                });
            }

            await requisiciones.updateRequisitionItems({
                id: surtido.renglon.id,
                quantity_dispatched: Number(surtido.renglon.quantity_dispatched || 0) + surtido.cantidad,
            });
        }

        // ── 3. Estado ───────────────────────────────────────────────────────
        const estado = estadoTrasSurtir(requisicion.items as any, plan.surtir);
        const actualizada = await requisiciones.updateRequisitions({
            id,
            status: estado,
            dispatched_by_id: actor.id,
            dispatched_by_name: actor.name,
            dispatched_at: new Date(),
        });

        const [completa] = await requisiciones.listRequisitions({ id }, { relations: ["items"] });

        return res.json({
            requisition: {
                ...(completa ?? actualizada),
                source_location_name: nombres.get(origen) ?? null,
                destination_location_name: nombres.get(destino) ?? null,
            },
            surtido_por: actor.email ?? actor.id,
            movimientos,
            ...(asientosFallidos
                ? {
                      advertencia:
                          `${asientosFallidos} asiento(s) del traspaso no se pudieron escribir en el ` +
                          `kardex. La existencia sí se movió. Revisa el registro del servidor.`,
                  }
                : {}),
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
