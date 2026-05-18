import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Auto-registra un movimiento de caja (tipo "sale") cuando una orden es completada.
 * 
 * NOTA: Este subscriber registra la venta con método de pago "other" por defecto.
 * El POS debe actualizar el movimiento con el método de pago correcto a través
 * del endpoint /admin/cash-sessions/:id/movements ANTES de completar la orden,
 * o el checkout del POS puede registrar el movimiento directamente.
 * 
 * Si prefieres que el POS registre el movimiento manualmente (recomendado),
 * puedes desactivar este subscriber.
 */
export default async function cashSessionOrderHandler({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const orderId = data.id;

    try {
        // Buscar sesión de caja abierta
        const { data: openSessions } = await query.graph({
            entity: "cash_session",
            fields: ["id"],
            filters: { status: "open" },
        });

        if (!openSessions || openSessions.length === 0) {
            logger.warn(`💰 Cash Session: No hay sesión de caja abierta para la orden ${orderId}. El movimiento no fue registrado.`);
            return;
        }

        const sessionId = openSessions[0].id;

        // Obtener el total de la orden
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "total", "currency_code"],
            filters: { id: orderId },
        });

        if (!orders || orders.length === 0) {
            logger.warn(`💰 Cash Session: Orden ${orderId} no encontrada`);
            return;
        }

        const order = orders[0];
        const cashSessionService = container.resolve("cash_session");

        // Verificar que no exista ya un movimiento para esta orden
        const { data: existingMovements } = await query.graph({
            entity: "cash_movement",
            fields: ["id"],
            filters: { order_id: orderId, session_id: sessionId },
        });

        if (existingMovements && existingMovements.length > 0) {
            logger.info(`💰 Cash Session: Movimiento ya existe para orden ${orderId}, saltando.`);
            return;
        }

        // Registrar el movimiento como tipo "sale" con método "cash" por defecto
        // El POS puede sobrescribir esto antes de completar la orden
        await cashSessionService.createCashMovements({
            session_id: sessionId,
            order_id: orderId,
            type: "sale",
            payment_method: "cash", // Default - el POS debe enviar el correcto
            amount: Number(order.total) || 0,
            reference: `Orden #${orderId.slice(-6)}`,
            description: "Venta registrada automáticamente",
            created_by: "system",
        });

        logger.info(`💰 Cash Session: Movimiento registrado para orden ${orderId} en sesión ${sessionId}`);
    } catch (err) {
        logger.error(`💰 Cash Session Error: ${err}`);
    }
}

export const config: SubscriberConfig = {
    event: "order.placed",
};
