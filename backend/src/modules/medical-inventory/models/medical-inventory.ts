import { model } from "@medusajs/framework/utils";

export const MedicalBatch = model.define("medical_batch", {
    id: model.id().primaryKey(),
    batch_number: model.text(), // Número de lote (LOTE-123)
    expiration_date: model.dateTime(), // Fecha de caducidad
    quantity: model.number().default(0), // Cantidad actual de stock físico en este lote
    reserved_quantity: model.number().default(0), // Cantidad reservada temporalmente (por surtir en caja)
    variant_id: model.text(), // ID de la variante asociada
    shelf_location: model.text().nullable(),

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
