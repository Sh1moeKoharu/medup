import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { fetchVariantLabels } from "../../../../../lib/variant-titles";

/**
 * POST /admin/medical-orders/:id/items — ajustar los renglones de una orden.
 *
 * Body: { items: [{ variant_id, quantity, product_title?, instructions? }] }
 *
 * Enfermería, al aplicar una orden en consulta, añade lo que hizo falta (una
 * gasa, una jeringa) o corrige una cantidad. Cada renglón enviado SUSTITUYE al
 * de la misma presentación; con `quantity: 0` se quita. Sólo mientras la orden
 * está pendiente: lo surtido ya salió del inventario y ya está en la cuenta.
 *
 * Quién ajusta queda en las observaciones, para que el expediente se lea solo.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;
        const { items } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien ajusta. Vuelve a iniciar sesión." });
        }

        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ error: "Envía al menos un renglón en `items`." });
        }

        const order = await service.retrieveMedicalOrder(orderId, { relations: ["items"] });
        if (!order) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }
        if (order.status !== "pending") {
            return res.status(400).json({
                error: `Esta orden está "${order.status}"; sólo se ajustan las pendientes.`,
            });
        }

        const etiquetas = await fetchVariantLabels(req.scope, items.map((i: any) => i?.variant_id).filter(Boolean));
        const cambios: string[] = [];

        for (const it of items) {
            const cantidad = Number(it?.quantity);
            if (!it?.variant_id || !Number.isInteger(cantidad) || cantidad < 0) {
                return res.status(400).json({
                    error: `Cada renglón necesita presentación y una cantidad entera (0 para quitar). Recibido: ${JSON.stringify(it)}`,
                });
            }

            const existente = (order.items as any[]).find((r) => r.variant_id === it.variant_id);
            const titulo = it.product_title ?? existente?.product_title ?? etiquetas.get(it.variant_id)?.label ?? null;

            if (existente) {
                if (cantidad === 0) {
                    await service.deleteMedicalOrderItems([existente.id]);
                    cambios.push(`quitó ${titulo}`);
                } else {
                    await service.updateMedicalOrderItems({
                        id: existente.id,
                        quantity: cantidad,
                        ...(it.instructions !== undefined ? { instructions: it.instructions } : {}),
                    });
                    if (Number(existente.quantity) !== cantidad) {
                        cambios.push(`${titulo}: ${existente.quantity} → ${cantidad}`);
                    }
                }
            } else if (cantidad > 0) {
                await service.createMedicalOrderItems([
                    {
                        order_id: orderId,
                        variant_id: it.variant_id,
                        product_title: titulo,
                        quantity: cantidad,
                        instructions: it.instructions ?? null,
                    },
                ]);
                cambios.push(`añadió ${cantidad} × ${titulo}`);
            }
        }

        if (cambios.length) {
            const nota = [order.notes, `[Ajustó ${actor.name}: ${cambios.join("; ")}]`].filter(Boolean).join("\n");
            await service.updateMedicalOrders({ id: orderId, notes: nota });
        }

        const completa = await service.retrieveMedicalOrder(orderId, { relations: ["items"] });
        return res.json({ medical_order: completa, cambios });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};
