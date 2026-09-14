import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { REQUISITIONS_MODULE } from "../../../../modules/requisitions";
import RequisitionsModuleService from "../../../../modules/requisitions/service";
import { nombresDeAlmacenes } from "../../../../lib/almacenes";

/** GET /admin/requisitions/:id */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: RequisitionsModuleService = req.scope.resolve(REQUISITIONS_MODULE);
        const [requisicion] = await service.listRequisitions({ id: req.params.id }, { relations: ["items"] });
        if (!requisicion) {
            return res.status(404).json({ error: "Requisición no encontrada." });
        }
        const nombres = await nombresDeAlmacenes(req.scope as any);
        res.json({
            requisition: {
                ...requisicion,
                source_location_name: nombres.get(requisicion.source_location_id) ?? null,
                destination_location_name: nombres.get(requisicion.destination_location_id) ?? null,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
