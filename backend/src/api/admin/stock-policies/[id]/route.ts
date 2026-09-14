import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_INVENTORY_MODULE } from "../../../../modules/medical-inventory";

/** DELETE /admin/stock-policies/:id — quita el mínimo/máximo de esa presentación en ese almacén. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
    try {
        const service: any = req.scope.resolve(MEDICAL_INVENTORY_MODULE);
        const [politica] = await service.listStockPolicies({ id: req.params.id });
        if (!politica) {
            return res.status(404).json({ message: "No existe esa política de existencias." });
        }
        await service.softDeleteStockPolicies([req.params.id]);
        res.json({ id: req.params.id, deleted: true });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
