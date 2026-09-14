import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { htmlReceta } from "../../../../../lib/documentos";
import { membreteDeLaClinica } from "../../../../../lib/membrete";
import { ROLE_LABELS, normalizeRole } from "../../../../../lib/roles";

/**
 * GET /admin/documents/receta/:id — la receta de una orden médica, lista
 * para imprimir. Responde `{ html, title }`; el punto de venta la manda a la
 * impresora con el mismo mecanismo que el ticket.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const [orden] = await service.listMedicalOrders({ id: req.params.id }, { relations: ["items"] });
        if (!orden) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }

        const html = htmlReceta({
            membrete: await membreteDeLaClinica(req.scope as any),
            folio: orden.id,
            fecha: orden.created_at,
            paciente: orden.customer_name || orden.customer_id,
            prescriptor: orden.creator_name || orden.creator_id,
            rol_prescriptor: ROLE_LABELS[normalizeRole(orden.creator_role) ?? "doctor"],
            destinatario: (orden as any).recipient_area ?? "nursing",
            renglones: (orden.items ?? []).map((i: any) => ({
                product_title: i.product_title,
                quantity: i.quantity,
                instructions: i.instructions,
            })),
            notas: orden.notes,
        });

        if (!html) {
            return res.status(400).json({ error: "La orden no tiene lo necesario para imprimir una receta." });
        }

        res.json({ html, title: `Receta ${orden.id}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
