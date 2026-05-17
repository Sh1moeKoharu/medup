import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/core-flows";

export default async function consolidateBatches({ container }: { container: MedusaContainer }) {
    const logger = container.resolve("logger");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const medicalInventoryService = container.resolve("medical_inventory");
    const productModuleService = container.resolve(Modules.PRODUCT);

    logger.info("Starting EXACT duplicate product consolidation...");

    try {
        const { data: products } = await query.graph({
            entity: "product",
            fields: ["id", "title", "metadata", "variants.*"],
        });

        if (!products || products.length === 0) return;

        const { data: allBatches } = await query.graph({
            entity: "medical_batch",
            fields: ["id", "batch_number", "expiration_date", "quantity", "variant_id"],
        });
        
        const batchesByVariant = new Map();
        for (const batch of (allBatches || [])) {
            if (!batchesByVariant.has(batch.variant_id)) {
                batchesByVariant.set(batch.variant_id, []);
            }
            batchesByVariant.get(batch.variant_id).push(batch);
        }

        // EXACT MATCH GROUPING
        const productsMap = new Map();
        for (const product of products) {
            const titleKey = product.title.toLowerCase().trim();
            if (!productsMap.has(titleKey)) {
                productsMap.set(titleKey, []);
            }
            productsMap.get(titleKey).push(product);
        }

        let consolidatedProductsCount = 0;
        let productsToDelete: string[] = [];

        for (const [title, groupedProducts] of productsMap.entries()) {
            if (groupedProducts.length > 1) {
                logger.info(`Found ${groupedProducts.length} EXACT duplicates for: ${title}`);

                const masterProduct = groupedProducts[0];
                const masterVariantId = masterProduct.variants?.[0]?.id;

                if (!masterVariantId) continue;

                for (let i = 1; i < groupedProducts.length; i++) {
                    const duplicateProduct = groupedProducts[i];
                    const duplicateVariantId = duplicateProduct.variants?.[0]?.id;

                    if (duplicateProduct.metadata && duplicateProduct.metadata.lote && duplicateProduct.metadata.caducidad) {
                        try {
                            await medicalInventoryService.createMedicalBatches({
                                batch_number: String(duplicateProduct.metadata.lote),
                                expiration_date: new Date(String(duplicateProduct.metadata.caducidad)),
                                quantity: Number(duplicateProduct.metadata.cantidad_recibida) || 0,
                                variant_id: masterVariantId
                            });
                        } catch (e) {}
                    }

                    if (duplicateVariantId) {
                        const duplicateBatches = batchesByVariant.get(duplicateVariantId) || [];
                        for (const batch of duplicateBatches) {
                            try {
                                await medicalInventoryService.createMedicalBatches({
                                    batch_number: batch.batch_number,
                                    expiration_date: new Date(batch.expiration_date),
                                    quantity: Number(batch.quantity),
                                    variant_id: masterVariantId
                                });
                            } catch (e) {}
                        }
                    }

                    productsToDelete.push(duplicateProduct.id);
                    consolidatedProductsCount++;
                }
            }
        }

        if (productsToDelete.length > 0) {
            logger.info(`Deleting ${productsToDelete.length} duplicate products...`);
            await deleteProductsWorkflow(container).run({
                input: { ids: productsToDelete }
            });
            logger.info("Successfully deleted duplicate products.");
        }

        logger.info(`Consolidation finished! Consolidated ${consolidatedProductsCount} duplicates.`);

    } catch (error) {
        logger.error(`Consolidation error: ${error}`);
    }
}
