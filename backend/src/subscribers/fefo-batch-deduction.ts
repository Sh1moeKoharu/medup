import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../lib/inventory-ledger";
import { planificarFefo, aplicarFefo } from "../lib/fefo";
import { almacenDeFarmacia } from "../lib/almacenes";
import { CLAVE_CONSUMO_EN_CONSULTA } from "../lib/cuentas-de-paciente";

/**
 * Descuento de lotes por FEFO cuando se cobra una venta.
 *
 * La selección de lotes vive en `lib/fefo.ts`, compartida con la dispensación
 * de órdenes médicas. Antes estaba escrita aquí y otra vez allá, con criterios
 * distintos para decidir qué lote era elegible.
 *
 * ── POR QUÉ AQUÍ NO SE ABORTA POR FALTA DE STOCK ────────────────────────────
 * A diferencia de la dispensación, esto corre DESPUÉS de que la venta ya se
 * cobró. Negarse no desharía nada: sólo dejaría el kardex sin el movimiento.
 * Se descuenta lo que haya, se asienta, y el faltante se registra como aviso
 * para que alguien lo cuadre con un ajuste de inventario.
 */
export default async function fefoBatchDeductionSubscriber({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const orderId = data.id;

    logger.info(`FEFO: procesando la orden ${orderId}`);

    try {
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "items.*", "items.metadata"],
            filters: { id: orderId },
        });

        if (!orders || orders.length === 0) return;

        const items = orders[0].items || [];

        // Una venta del mostrador sale de Farmacia. Sin almacén de Farmacia no
        // se descuenta nada, y se dice: la venta ya está cobrada.
        const farmacia = await almacenDeFarmacia(container);
        if (!farmacia) {
            logger.error(
                `FEFO: no hay almacén de Farmacia configurado; la orden ${orderId} ` +
                    `NO se descontó del inventario. Ejecuta preparar-almacenes.ts y cuadra a mano.`
            );
            return;
        }

        for (const item of items) {
            const variantId = item?.variant_id;
            const cantidad = item?.quantity || 0;

            if (!variantId || cantidad <= 0) continue;

            // Lo que Enfermería aplicó en consulta ya salió de SU almacén al
            // aplicarlo (ver lib/cuentas-de-paciente.ts). Descontarlo otra vez
            // de Farmacia al cobrar la cuenta duplicaba la salida.
            if ((item as any)?.metadata?.[CLAVE_CONSUMO_EN_CONSULTA]) {
                logger.info(`FEFO: ${item?.title ?? variantId} ya se aplicó en consulta; no se descuenta de Farmacia.`);
                continue;
            }

            const plan = await planificarFefo(container, variantId, cantidad, farmacia.id);

            if (!plan.asignaciones.length) {
                logger.warn(
                    `FEFO: no hay lotes con existencia para la variante ${variantId} ` +
                        `(${item?.title ?? "sin título"}). No se descontó nada.`
                );
                continue;
            }

            const aplicadas = await aplicarFefo(container, plan);

            for (const a of aplicadas) {
                await recordInventoryMovement(container, {
                    variant_id: variantId,
                    stock_location_id: farmacia.id,
                    variant_title: item?.title ?? null,
                    batch_id: a.lote.id,
                    batch_number: a.lote.batch_number ?? null,
                    expiration_date: a.lote.expiration_date ?? null,
                    quantity_delta: -a.cantidad,
                    quantity_after: a.saldoResultante,
                    type: "exit_sale",
                    reason: "Salida por venta (FEFO)",
                    reference_type: "order",
                    reference_id: orderId,
                });

                logger.info(
                    `FEFO: -${a.cantidad} del lote ${a.lote.batch_number ?? a.lote.id} ` +
                        `(saldo ${a.saldoResultante})`
                );
            }

            if (!plan.alcanza) {
                logger.warn(
                    `FEFO: existencia insuficiente para la variante ${variantId}. ` +
                        `Faltaron ${plan.faltante} unidad(es); la venta ya estaba cobrada. ` +
                        `Cuadra la diferencia con un ajuste de inventario.`
                );
            }
        }
    } catch (err) {
        logger.error(`FEFO: fallo al descontar lotes de la orden ${orderId}: ${err}`);
    }
}

export const config: SubscriberConfig = {
    event: "order.placed",
};
