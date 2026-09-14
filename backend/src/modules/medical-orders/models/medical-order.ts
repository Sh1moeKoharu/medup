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

    /**
     * A quién va la orden. Es lo que decide en qué bandeja aparece y de qué
     * almacén sale el medicamento:
     *
     *   nursing   Enfermería la surte en consulta, de su almacén, y el consumo
     *             se carga a la CUENTA del paciente para que Caja lo cobre.
     *             Es el caso normal de una consulta.
     *   pharmacy  Farmacia la surte en mostrador, de su almacén. El paciente
     *             se lleva el medicamento.
     */
    recipient_area: model.enum(["nursing", "pharmacy"]).default("nursing"),

    /** Quién la surtió (Farmacia o Enfermería) y cuándo. */
    dispensed_by_id: model.text().nullable(),
    dispensed_by_name: model.text().nullable(),
    dispensed_at: model.dateTime().nullable(),

    /**
     * El pedido en borrador del paciente al que se cargó el consumo. Es el
     * enlace entre la orden médica y el cobro: Caja ve estos renglones al
     * cobrar la consulta. Sólo lo llevan las órdenes surtidas por Enfermería.
     */
    draft_order_id: model.text().nullable(),

    items: model.hasMany(() => MedicalOrderItem, {
        mappedBy: "order",
    }),
});
