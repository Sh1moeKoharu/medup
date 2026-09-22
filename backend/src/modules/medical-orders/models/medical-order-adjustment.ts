import { model } from "@medusajs/framework/utils";

/**
 * Ajuste de un renglón de una orden médica: quién cambió qué, cuánto había,
 * cuánto quedó y por qué.
 *
 * La clínica pidió que, si Enfermería o Farmacia quitan o reducen algo de lo
 * que recetó el médico, quede registro auditable con el motivo (al menos 20
 * caracteres). Antes sólo se añadía una línea al texto de observaciones de la
 * orden, que cualquiera podía confundir con una nota del médico.
 *
 * Append-only, como el kardex: un ajuste no se edita ni se borra. Campos
 * desnormalizados a propósito: se lee solo aunque cambien nombres.
 */
export const MedicalOrderAdjustment = model.define("medical_order_adjustment", {
    id: model.id().primaryKey(),
    order_id: model.text(),
    variant_id: model.text(),
    product_title: model.text().nullable(),
    quantity_before: model.number(),
    quantity_after: model.number(),
    reason: model.text().nullable(),
    actor_id: model.text(),
    actor_name: model.text().nullable(),
    actor_role: model.text().nullable(),
});
