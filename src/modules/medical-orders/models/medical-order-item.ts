import { model } from "@medusajs/framework/utils";
import { MedicalOrder } from "./medical-order";

export const MedicalOrderItem = model.define("medical_order_item", {
    id: model.id().primaryKey(),
    variant_id: model.text(), // ID del producto/medicamento
    product_title: model.text().nullable(), // Guardar el nombre para fácil acceso sin inner joins complejos en UI
    quantity: model.number().default(1),
    instructions: model.text().nullable(), // Indicaciones (ej. "Tomar 1 tableta cada 8 horas")
    order: model.belongsTo(() => MedicalOrder, {
        mappedBy: "items",
    }),
});
