import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function migrateLotesJob({ container }: { container: MedusaContainer }) {
    const logger = container.resolve("logger");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const medicalInventoryService = container.resolve("medical_inventory");

    logger.info("Migrating old metadata Lotes to MedicalBatches...");

    try {
        // Fetch all products with their variants
        const { data: products } = await query.graph({
            entity: "product",
            fields: ["id", "title", "metadata", "variants.*"],
        });

        if (!products) return;

        let migratedCount = 0;

        for (const product of products) {
            if (product.metadata && product.metadata.lote && product.metadata.caducidad) {
                const variantId = product.variants?.[0]?.id;

                if (!variantId) {
                    logger.warn(`Product ${product.title} has metadata but no variants. Skipping.`);
                    continue;
                }

                // Create the batch
                await medicalInventoryService.createMedicalBatches({
                    batch_number: String(product.metadata.lote),
                    expiration_date: new Date(String(product.metadata.caducidad)),
                    quantity: Number(product.metadata.cantidad_recibida) || 100, // Default to 100 if they didn't specify
                    variant_id: variantId
                });

                migratedCount++;
                logger.info(`Migrated Lote ${product.metadata.lote} for ${product.title}`);
            }
        }

        logger.info(`Done! Migrated ${migratedCount} lotes.`);
    } catch (error) {
        logger.error(`Migration error: ${error}`);
    }
}
