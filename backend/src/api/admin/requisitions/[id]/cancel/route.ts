import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REQUISITIONS_MODULE } from "../../../../../modules/requisitions";
import RequisitionsModuleService from "../../../../../modules/requisitions/service";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { puedeCancelarse } from "../../../../../lib/requisiciones";

/**
 * POST /admin/requisitions/:id/cancel — retirar una requisición.
 *
 * Sólo se cancela lo que no ha movido nada. Si Farmacia ya surtió una parte,
 * ese medicamento está en Enfermería y "cancelar" no lo devolvería: lo que
 * corresponde es una requisición en sentido contrario o una baja, cada una
 * con su asiento.
 *
 * Body: { motivo?: string }
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);
        const id = req.params.id;
        const { motivo } = (req.body ?? {}) as { motivo?: string };

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar a quien cancela. Vuelve a iniciar sesión." });
        }

        const [requisicion] = await service.listRequisitions({ id }, { relations: ["items"] });
        if (!requisicion) {
            return res.status(404).json({ error: "Requisición no encontrada." });
        }
        if (requisicion.status === "cancelled") {
            return res.status(400).json({ error: "Esta requisición ya estaba cancelada." });
        }
        if (!puedeCancelarse(requisicion.status, requisicion.items as any)) {
            return res.status(400).json({
                error:
                    "No se puede cancelar: Farmacia ya surtió al menos una parte y ese medicamento " +
                    "está en el almacén de destino. Regístralo como baja o pide el traspaso de vuelta.",
            });
        }

        const nota = [requisicion.notes, `[Cancelada por ${actor.name}${motivo ? `: ${motivo}` : ""}]`]
            .filter(Boolean)
            .join("\n");

        const actualizada = await service.updateRequisitions({ id, status: "cancelled", notes: nota });

        res.json({ requisition: actualizada, cancelada_por: actor.email ?? actor.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
