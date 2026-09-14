import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { resolveRequestActor } from "../../../../../lib/require-role";

/**
 * POST /admin/medical-orders/:id/cancel — Cancelar una receta.
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────────────
 * `medical_order.status` contempla `cancelled` desde la primera migración, y
 * NINGUNA ruta podía alcanzarlo. Una receta emitida por error se quedaba
 * `pending` para siempre en la bandeja de Farmacia, sin forma de retirarla.
 *
 * ── SÓLO SE CANCELA LO QUE NO SE HA SURTIDO ─────────────────────────────────
 * Una orden ya `dispensed` significa que el medicamento salió físicamente del
 * anaquel y hay un asiento de salida en el kardex. "Cancelarla" no devolvería
 * nada al inventario; lo que corresponde entonces es registrar una devolución
 * (`entry_return`), que es otro acto, con su propia autorización y su propio
 * asiento. Anular la orden sin más dejaría el kardex diciendo que salió algo
 * de una receta que consta como inexistente.
 *
 * Body: { motivo?: string }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersService: MedicalOrdersModuleService =
            req.scope.resolve(MEDICAL_ORDERS_MODULE);

        const orderId = req.params.id;
        const { motivo } = (req.body ?? {}) as { motivo?: string };

        const actor = await resolveRequestActor(req);

        if (!actor) {
            return res.status(401).json({
                error: "No se pudo identificar a quien cancela. Vuelve a iniciar sesión.",
            });
        }

        const order = await medicalOrdersService.retrieveMedicalOrder(orderId);

        if (!order) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }

        if (order.status === "cancelled") {
            return res.status(400).json({
                error: "Esta orden ya estaba cancelada.",
            });
        }

        if (order.status !== "pending") {
            return res.status(400).json({
                error:
                    `No se puede cancelar una orden "${order.status}": el medicamento ya ` +
                    "salió del inventario. Si hay que devolverlo, regístralo como entrada " +
                    "por devolución en el almacén.",
            });
        }

        // Quién cancela y por qué queda en las observaciones: la bitácora
        // registra la llamada, pero el expediente debe poder leerse solo.
        const nota = [
            order.notes,
            `[Cancelada por ${actor.name}${motivo ? `: ${motivo}` : ""}]`,
        ]
            .filter(Boolean)
            .join("\n");

        const updated = await medicalOrdersService.updateMedicalOrders({
            id: orderId,
            status: "cancelled",
            notes: nota,
        });

        return res.json({
            medical_order: updated,
            cancelada_por: actor.email ?? actor.id,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
