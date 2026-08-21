import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../../../modules/medical-orders/service";
import { MEDICAL_INVENTORY_MODULE } from "../../../../../modules/medical-inventory";
import MedicalInventoryModuleService from "../../../../../modules/medical-inventory/service";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const medicalInventoryService: MedicalInventoryModuleService = req.scope.resolve(MEDICAL_INVENTORY_MODULE);

        const orderId = req.params.id;

        // Recuperar la orden con items
        const order = await medicalOrdersService.retrieveMedicalOrder(orderId, {
            relations: ["items"]
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ error: "Order is not pending" });
        }

        // Lógica de "Surtir"
        // 1. Marcar la orden como 'dispensed'
        const updatedOrder = await medicalOrdersService.updateMedicalOrders({
            id: orderId,
            status: "dispensed",
        });

        // 2. Por cada item, apartar (reservar) la cantidad del inventario de lotes FEFO
        const errors = [];
        for (const item of order.items) {
            // Obtener lotes activos de esta variante, ordenados por caducidad (FEFO)
            // Sólo lotes activos: reservar contra un lote caducado en
            // cuarentena prometería stock que no se puede dispensar.
            const batches = await medicalInventoryService.listMedicalBatches({
                variant_id: item.variant_id,
                status: "active"
            });
            
            // Ordenamos por fecha de caducidad (FEFO)
            batches.sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());

            let remainingToReserve = item.quantity;
            for (const batch of batches) {
                if (remainingToReserve <= 0) break;

                const availableInBatch = batch.quantity - batch.reserved_quantity;
                if (availableInBatch > 0) {
                    const reserving = Math.min(availableInBatch, remainingToReserve);
                    
                    await medicalInventoryService.updateMedicalBatches({
                        id: batch.id,
                        reserved_quantity: batch.reserved_quantity + reserving
                    });
                    
                    remainingToReserve -= reserving;
                }
            }

            if (remainingToReserve > 0) {
                errors.push(`Not enough stock to reserve for ${item.product_title || item.variant_id}. Missing: ${remainingToReserve}`);
            }
        }

        res.json({ 
            medical_order: updatedOrder,
            warnings: errors.length > 0 ? errors : undefined
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
