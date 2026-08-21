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
            fields: ["id", "batch_number", "expiration_date", "quantity", "variant_id", "status"],
        });

        if (!expiredBatches) return;

        const expiringToBeBlocked = expiredBatches.filter((b: any) => {
            const expDate = new Date(b.expiration_date);
            // Sólo lotes activos: los que ya están en cuarentena o destruidos
            // no se vuelven a procesar en cada corrida diaria.
            return expDate < today && b.quantity > 0 && b.status === "active";
        });

        if (expiringToBeBlocked.length > 0) {
            logger.warn(`Found ${expiringToBeBlocked.length} expired batches with stock. Blocking them...`);
            
            // BLOQUEAR NO ES DESTRUIR.
            //
            // Antes esto ponía `quantity = 0`, lo que mentía sobre la
            // existencia física: las unidades siguen en el anaquel hasta que
            // alguien las destruye, y un lote en 0 es indistinguible de uno
            // agotado por ventas. Ahora se pasa a cuarentena conservando la
            // cantidad; el FEFO ignora todo lote que no esté `active`.
            //
            // La salida real del inventario ocurre en la destrucción sanitaria
            // (POST /admin/medical-batches/:id/destroy), que es un acto
            // autorizado por una persona y ESE sí asienta en el libro mayor.
            for (const batch of expiringToBeBlocked) {
                await medicalInventoryService.updateMedicalBatches({
                    id: batch.id,
                    status: "quarantined",
                    quarantined_at: new Date(),
                });
            }

            logger.info(`${expiringToBeBlocked.length} lote(s) caducado(s) pasaron a cuarentena. Pendientes de destrucción sanitaria autorizada.`);

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
