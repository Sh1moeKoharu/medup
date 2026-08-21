import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Revisión diaria de caducidades: avisa a 90 / 60 / 30 días.
 *
 * La versión anterior consultaba `entity: "medical_inventory"` pidiendo
 * `product_variant.*`. Ninguno de los dos existe — la entidad real es
 * `medical_batch` y no tiene esa relación — así que el job no reportaba nunca
 * nada y las alertas de caducidad estaban muertas en silencio.
 *
 * Este job SÓLO avisa. El bloqueo de lo ya vencido lo hace
 * `block-expired-batches`, y la salida física la hace la destrucción sanitaria.
 */
export default async function checkExpirationsJob(container: MedusaContainer) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    logger.info("Revisión diaria de caducidades (90/60/30 días)...");

    try {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 90);

        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: [
                "id",
                "batch_number",
                "expiration_date",
                "quantity",
                "variant_id",
                "status",
            ],
            filters: {
                expiration_date: { $lte: horizon.toISOString() },
            },
        });

        const now = new Date();
        const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        const tiers = { expired: 0, d30: 0, d60: 0, d90: 0 };

        for (const b of batches || []) {
            if (Number(b.quantity) <= 0 || b.status === "destroyed") {
                continue;
            }

            const daysLeft = Math.floor(
                (new Date(b.expiration_date).getTime() - startOfToday.getTime()) /
                    86400000
            );

            if (daysLeft < 0) tiers.expired++;
            else if (daysLeft <= 30) tiers.d30++;
            else if (daysLeft <= 60) tiers.d60++;
            else tiers.d90++;
        }

        const total = tiers.expired + tiers.d30 + tiers.d60 + tiers.d90;

        if (!total) {
            logger.info("Sin lotes próximos a caducar en los próximos 90 días.");
            return;
        }

        if (tiers.expired) {
            logger.error(
                `CADUCADOS: ${tiers.expired} lote(s) con existencia ya vencidos. ` +
                    `Deben estar en cuarentena — revisa el job block-expired-batches.`
            );
        }
        if (tiers.d30) {
            logger.warn(`CRÍTICO: ${tiers.d30} lote(s) caducan en 30 días o menos.`);
        }
        if (tiers.d60) {
            logger.warn(`ATENCIÓN: ${tiers.d60} lote(s) caducan entre 31 y 60 días.`);
        }
        if (tiers.d90) {
            logger.info(`AVISO: ${tiers.d90} lote(s) caducan entre 61 y 90 días.`);
        }
    } catch (error) {
        logger.error(`Falló la revisión de caducidades: ${error}`);
    }
}

export const config = {
    name: "check-expirations",
    schedule: "0 0 * * *", // Diario a medianoche
};
