import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../modules/medical-orders/service";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const orderId = req.params.id;

        const order = await medicalOrdersService.retrieveMedicalOrder(orderId, {
            relations: ["items"]
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        res.json({ medical_order: order });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
