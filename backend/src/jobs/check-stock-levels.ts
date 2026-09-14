import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { estadoDePoliticas } from "../lib/existencias";
import { destinatariosPorRol } from "../lib/personal-servidor";
import { ROLES } from "../lib/roles";

/**
 * Revisión diaria de desabasto: qué presentaciones están bajo su mínimo.
 *
 * Compara la existencia activa de cada (presentación, almacén) contra la
 * política de `stock_policy` y avisa a quien compra: Almacén (Farmacia) y
 * Administración, por rol (ver lib/personal-servidor.ts). Sin políticas no
 * hay nada que revisar y no molesta a nadie.
 *
 * Este job SÓLO avisa. No genera pedidos ni mueve existencia.
 */
export default async function checkStockLevelsJob(container: MedusaContainer) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    logger.info("Revisión diaria de mínimos de existencia...");

    try {
        const bajoMinimo = (await estadoDePoliticas(container)).filter((p) => p.below_min);

        if (!bajoMinimo.length) {
            logger.info("Ninguna presentación está bajo su mínimo.");
            return;
        }

        for (const p of bajoMinimo) {
            logger.warn(
                `DESABASTO: ${p.title} en ${p.stock_location_name ?? p.stock_location_id}: ` +
                    `${p.current_quantity} de un mínimo de ${p.min_quantity} (faltan ${p.shortage}).`
            );
        }

        const destinatarios = await destinatariosPorRol(
            container,
            [ROLES.ADMIN, ROLES.PHARMACY],
            process.env.ALERTAS_EMAIL
        );

        if (!destinatarios.length) {
            logger.error(
                `[DESABASTO] Hay ${bajoMinimo.length} presentación(es) bajo mínimo, pero ninguna ` +
                    `cuenta de Administración o Farmacia tiene correo de aviso y ALERTAS_EMAIL no ` +
                    `está configurada: NO se envió ningún aviso. Pon un correo de aviso en ` +
                    `Ajustes → Personal.`
            );
            return;
        }

        const filas = bajoMinimo
            .map(
                (p) =>
                    `<tr><td>${p.title}</td><td>${p.stock_location_name ?? ""}</td>` +
                    `<td align="right">${p.current_quantity}</td><td align="right">${p.min_quantity}</td>` +
                    `<td align="right">${p.shortage}</td></tr>`
            )
            .join("");

        const html =
            `<p>${bajoMinimo.length} presentación(es) están por debajo de su mínimo.</p>` +
            `<table border="1" cellpadding="4"><tr><th>Presentación</th><th>Almacén</th>` +
            `<th>Existencia</th><th>Mínimo</th><th>Faltan</th></tr>${filas}</table>`;

        const notificationModuleService = container.resolve(Modules.NOTIFICATION);
        for (const destinatario of destinatarios) {
            try {
                await notificationModuleService.createNotifications({
                    to: destinatario,
                    channel: "email",
                    template: "stock-below-minimum",
                    data: {
                        subject: `Altus: ${bajoMinimo.length} presentación(es) bajo mínimo`,
                        html,
                        count: bajoMinimo.length,
                    },
                });
                logger.info(`Aviso de desabasto enviado a ${destinatario}.`);
            } catch (err) {
                logger.error(`[DESABASTO] No se pudo enviar el aviso a ${destinatario}: ${err}`);
            }
        }
    } catch (error) {
        logger.error(`Falló la revisión de mínimos: ${error}`);
    }
}

export const config = {
    name: "check-stock-levels",
    schedule: "0 6 * * *", // Diario a las 6:00, antes de que abra el mostrador
};
