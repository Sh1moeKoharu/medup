import { model } from "@medusajs/framework/utils";

export const MedicalBatch = model.define("medical_batch", {
    id: model.id().primaryKey(),
    batch_number: model.text(), // Número de lote (LOTE-123)
    expiration_date: model.dateTime(), // Fecha de caducidad
    quantity: model.number().default(0), // Cantidad actual de stock físico en este lote
    reserved_quantity: model.number().default(0), // Cantidad reservada temporalmente (por surtir en caja)
    variant_id: model.text(), // ID de la variante asociada
    shelf_location: model.text().nullable(),
});
