import { model } from "@medusajs/framework/utils";
import { MedicalOrderItem } from "./medical-order-item";

export const MedicalOrder = model.define("medical_order", {
    id: model.id().primaryKey(),
    status: model.enum(["pending", "dispensed", "cancelled"]).default("pending"),
    creator_id: model.text(), // ID del médico o enfermero (admin_user.id)
    creator_name: model.text().nullable(),
    creator_role: model.enum(["doctor", "nurse", "admin"]).default("doctor"),
    customer_id: model.text(), // ID del paciente (customer)
    customer_name: model.text().nullable(), // Nombre del paciente para fácil búsqueda
    notes: model.text().nullable(), // Observaciones
    items: model.hasMany(() => MedicalOrderItem, {
        mappedBy: "order",
    }),
});
