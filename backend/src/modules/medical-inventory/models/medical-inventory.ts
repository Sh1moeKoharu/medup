import { model } from "@medusajs/framework/utils";

export const MedicalBatch = model.define("medical_batch", {
    id: model.id().primaryKey(),
    batch_number: model.text(), // Número de lote (LOTE-123)
    expiration_date: model.dateTime(), // Fecha de caducidad
    quantity: model.number().default(0), // Cantidad actual de stock físico en este lote
    /**
     * ⚠️ EN DESUSO. Ningún código la escribe desde que surtir descuenta.
     *
     * Existía para apartar stock al surtir una orden médica, a la espera de que
     * caja lo cobrara. Ese cobro nunca se construyó —el POS no conoce las
     * órdenes médicas—, así que la reserva no se liberaba jamás y el disponible
     * (`quantity - reserved_quantity`) se erosionaba hasta reportar cero con el
     * anaquel lleno.
     *
     * Hoy dispensar descuenta directamente (ver la ruta /dispense). La columna
     * se conserva porque quitarla exige una migración y no aporta nada, pero
     * NO debe volver a escribirse sin resolver antes quién la libera.
     *
     * Las reservas que quedaron escritas por la versión anterior son
     * huérfanas —nadie las liberará nunca— y se ponen a cero solas al
     * desplegar: ver la migración Migration20260906031500. Antes esto era un
     * UPDATE que alguien debía acordarse de ejecutar a mano.
     */
    reserved_quantity: model.number().default(0),
    variant_id: model.text(), // ID de la variante asociada
    shelf_location: model.text().nullable(),

    /**
     * En qué almacén está el lote. Es un `stock_location` de Medusa; ver
     * `lib/almacenes.ts`. Nulable en la base sólo por la migración (las filas
     * anteriores se rellenan con el almacén que ya existía); el código lo
     * exige siempre.
     */
    stock_location_id: model.text().nullable(),

    /**
     * Datos de la compra, como vienen en la factura. Ver `lib/unidades.ts`:
     * la existencia (`quantity`) se lleva en unidades de VENTA, y estos campos
     * dicen cómo se compró.
     */
    purchase_date: model.dateTime().nullable(),
    /** "caja", "frasco", "blíster"… Lo que se compra. */
    purchase_unit: model.text().nullable(),
    /** "tableta", "ml", "pieza"… Lo que se vende y se descuenta. */
    sale_unit: model.text().nullable(),
    /** Cuántas unidades de venta trae una unidad de compra. 1 si son iguales. */
    units_per_purchase: model.number().default(1),

    /**
     * Situación del lote. Bloquear NO es destruir:
     *
     *  · active      Vendible. Es el único estado que el FEFO puede tomar.
     *  · quarantined Caducado y bloqueado por el job diario. Las unidades SIGUEN
     *                físicamente en el anaquel, así que `quantity` se conserva:
     *                ponerla en 0 al bloquear mentía sobre la existencia física
     *                y volvía el lote indistinguible de uno agotado por ventas.
     *  · destroyed   Destrucción sanitaria ya ejecutada y autorizada por una
     *                persona. Aquí sí `quantity` llega a 0, y ese sí es un
     *                movimiento de salida en el libro mayor (exit_expiry).
     */
    status: model.enum(["active", "quarantined", "destroyed"]).default("active"),
    /** Cuándo se bloqueó por caducidad (para el reporte de destrucción). */
    quarantined_at: model.dateTime().nullable(),
});
