import { MedusaContainer } from "@medusajs/framework/types";

export default async function checkExpirationsJob(
    container: MedusaContainer
) {
    const logger = container.resolve("logger");
    const query = container.resolve("query");

    logger.info("Running daily expiration check...");

    try {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + 30); // 30 days notice

        // Query medical-inventory module items
        const { data: medicalInventories } = await query.graph({
            entity: "medical_inventory",
            fields: ["id", "expiration_date", "shelf_location", "product_variant.*"],
            filters: {
                expiration_date: {
                    $lte: thresholdDate.toISOString()
                }
            }
        });

        if (medicalInventories && medicalInventories.length > 0) {
            logger.warn(`CRITICAL: Found ${medicalInventories.length} items expiring within 30 days!`);
            // Here we would integrate with the Notifications Module (e.g. Resend) 
            // await notificationModuleService.createNotifications({...})
        } else {
            logger.info("Expiration check clear. No items expiring soon.");
        }
    } catch (error) {
        logger.error("Failed to run expiration check", error);
    }
}

export const config = {
    name: "check-expirations",
    schedule: "0 0 * * *", // Run daily at midnight
};
