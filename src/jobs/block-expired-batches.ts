import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import * as fs from "fs";
import * as path from "path";

export default async function blockExpiredBatchesJob(
    container: MedusaContainer
) {
    const logger = container.resolve("logger");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const medicalInventoryService = container.resolve("medical_inventory");

    logger.info("Running daily expiration check to block expired batches...");

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today

        // Fetch expired batches that still have quantity > 0
        const { data: expiredBatches } = await query.graph({
            entity: "medical_batch",
            fields: ["id", "batch_number", "expiration_date", "quantity", "variant_id"],
        });

        if (!expiredBatches) return;

        const expiringToBeBlocked = expiredBatches.filter((b: any) => {
            const expDate = new Date(b.expiration_date);
            return expDate < today && b.quantity > 0;
        });

        if (expiringToBeBlocked.length > 0) {
            logger.warn(`Found ${expiringToBeBlocked.length} expired batches with stock. Blocking them...`);
            
            // Block the batches by setting their quantity to 0
            for (const batch of expiringToBeBlocked) {
                await medicalInventoryService.updateMedicalBatches({
                    id: batch.id,
                    quantity: 0
                });
            }

            logger.info(`Successfully set stock to 0 for ${expiringToBeBlocked.length} expired batches.`);

            const reportData = expiringToBeBlocked.map((b: any) => ({
                id: b.id,
                title: b.product_variant?.title || `Variante ${b.variant_id}`,
                lote: b.batch_number,
                caducidad: b.expiration_date,
                perdida: b.quantity
            }));

            // Generate report
            generateReport(reportData, logger);

            // Send notification
            const notificationModuleService = container.resolve(Modules.NOTIFICATION);
            if (notificationModuleService) {
                try {
                    await notificationModuleService.createNotifications({
                        to: "admin@example.com",
                        channel: "email",
                        template: "expired-batches-alert",
                        data: {
                            count: reportData.length,
                            report_path: path.join("reports", "destruccion-sanitaria")
                        }
                    });
                    logger.info("Sent expiration notification email.");
                } catch (notifErr) {
                    logger.error("Failed to send notification email", notifErr);
                }
            }

        } else {
            logger.info("Expiration check clear. No new expired batches found.");
        }
    } catch (error) {
        logger.error("Failed to run block-expired-batches job: " + error);
    }
}

function generateReport(expiredItems: any[], logger: any) {
    try {
        const reportsDir = path.resolve(process.cwd(), "reports", "destruccion-sanitaria");
        
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `destruccion_sanitaria_${dateStr}.csv`;
        const filePath = path.join(reportsDir, fileName);

        let csvContent = "ID Lote,Variante,Lote,Fecha de Caducidad,Unidades Perdidas\n";
        
        for (const item of expiredItems) {
            const safeTitle = `"${String(item.title).replace(/"/g, '""')}"`;
            const safeLote = `"${String(item.lote).replace(/"/g, '""')}"`;
            csvContent += `${item.id},${safeTitle},${safeLote},${item.caducidad},${item.perdida}\n`;
        }

        fs.writeFileSync(filePath, csvContent, "utf8");
        logger.info(`Sanitary destruction report saved to: ${filePath}`);
    } catch (err) {
        logger.error("Failed to generate sanitary destruction report", err);
    }
}

export const config = {
    name: "block-expired-batches",
    schedule: "0 0 * * *", // Run daily at midnight
};
