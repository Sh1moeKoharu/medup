import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../modules/medical-orders/service";

/** GET /admin/medical-orders/:id — la orden con sus renglones y sus ajustes. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;

        const order = await medicalOrdersService
            .retrieveMedicalOrder(orderId, { relations: ["items"] })
            .catch(() => null);

        if (!order) {
            return res.status(404).json({ error: "Orden médica no encontrada." });
        }

        const ajustes = await medicalOrdersService.listMedicalOrderAdjustments({ order_id: orderId }, { order: { created_at: "ASC" } });
        res.json({ medical_order: { ...order, ajustes } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
