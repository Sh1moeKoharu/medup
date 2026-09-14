import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REQUISITIONS_MODULE } from "../../../../../modules/requisitions";
import RequisitionsModuleService from "../../../../../modules/requisitions/service";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { puedeRecibirse } from "../../../../../lib/requisiciones";

/**
 * POST /admin/requisitions/:id/receive — Enfermería confirma que lo tiene.
 *
 * No mueve existencia: el medicamento ya entró al almacén de destino al
 * surtir. Esto deja constancia de quién lo recibió y cuándo, que es lo que
 * cierra el circuito ante una diferencia.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);
        const id = req.params.id;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien recibe. Vuelve a iniciar sesión." });
        }

        const [requisicion] = await service.listRequisitions({ id });
        if (!requisicion) {
            return res.status(404).json({ error: "Requisición no encontrada." });
        }
        if (!puedeRecibirse(requisicion.status)) {
            return res.status(400).json({
                error: `Esta requisición está "${requisicion.status}"; sólo se recibe lo que Farmacia ya surtió por completo.`,
            });
        }

        const actualizada = await service.updateRequisitions({
            id,
            status: "received",
            received_by_id: actor.id,
            received_by_name: actor.name,
            received_at: new Date(),
        });

        res.json({ requisition: actualizada, recibida_por: actor.email ?? actor.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
