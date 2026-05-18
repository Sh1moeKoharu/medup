import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function fefoBatchDeductionSubscriber({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const medicalInventoryService = container.resolve("medical_inventory");
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const orderId = data.id;

    logger.info(`📝 FEFO Deduction: Processing order ${orderId}`);

    try {
        // Fetch the order with its items to get variant IDs and quantities
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "items.*"],
            filters: { id: orderId }
        });

        if (!orders || orders.length === 0) return;
        const order = orders[0];

        const items = order.items || [];
        for (const item of items) {
            let remainingQuantityToDeduct = item?.quantity || 0;
            const variantId = item?.variant_id;

            if (!variantId) continue;

            // Fetch available batches for this variant
            const { data: batches } = await query.graph({
                entity: "medical_batch",
                fields: ["id", "quantity", "expiration_date"],
                filters: {
                    variant_id: variantId,
                    quantity: { $gt: 0 } // Only batches that have stock
                }
            });

            if (!batches || batches.length === 0) {
                logger.warn(`⚠️ FEFO: No stock batches found for variant ${variantId} (Item: ${item?.title || "Unknown"})`);
                continue;
            }

            // Sort batches: FEFO (First Expire First Out)
            const sortedBatches = batches.sort((a: any, b: any) => 
                new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
            );

            // Deduct from batches
            for (const batch of sortedBatches) {
                if (remainingQuantityToDeduct <= 0) break;

                const deduction = Math.min(batch.quantity, remainingQuantityToDeduct);
                remainingQuantityToDeduct -= deduction;
                const newQuantity = batch.quantity - deduction;

                // Update the batch
                await medicalInventoryService.updateMedicalBatches({
                    id: batch.id,
                    quantity: newQuantity
                });

                logger.info(`✅ FEFO: Deducted ${deduction} from batch ${batch.id} (New qty: ${newQuantity})`);
            }

            if (remainingQuantityToDeduct > 0) {
                logger.warn(`⚠️ FEFO: Not enough batch stock for variant ${variantId}. Missing ${remainingQuantityToDeduct} units.`);
            }
        }
    } catch (err) {
        logger.error(`❌ FEFO Deduction Error: ${err}`);
    }
}

export const config: SubscriberConfig = {
    event: "order.placed",
};
