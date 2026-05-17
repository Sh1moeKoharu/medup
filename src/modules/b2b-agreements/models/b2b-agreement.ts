import { model } from "@medusajs/framework/utils";

export const B2BAgreement = model.define("b2b_agreement", {
    id: model.id().primaryKey(),
    company_name: model.text(), // Nombre de la empresa (obligatorio)
    rfc: model.text().nullable(), // RFC fiscal
    contact_name: model.text().nullable(), // Nombre de contacto corporativo
    contact_email: model.text().nullable(), // Email de contacto
    contact_phone: model.text().nullable(), // Teléfono de contacto
    discount_percent: model.float().default(0), // Porcentaje de descuento del convenio
    credit_limit: model.float().default(0), // Límite de crédito en pesos
    payment_terms_days: model.number().default(30), // Días de plazo de pago
    status: model.enum(["active", "inactive"]).default("active"), // Estado del convenio
    valid_from: model.dateTime().nullable(), // Fecha de inicio de vigencia
    valid_until: model.dateTime().nullable(), // Fecha de fin de vigencia
    notes: model.text().nullable(), // Notas adicionales
});
