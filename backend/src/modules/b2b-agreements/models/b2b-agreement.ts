import { model } from "@medusajs/framework/utils";

/**
 * Convenio empresarial (B2B).
 *
 * ⚠️ POR QUÉ LA ENTIDAD NO SE LLAMA "B2BAgreement"
 *
 * El framework deriva DOS nombres a partir de la definición del modelo y, para
 * cadenas con dígitos, NO coinciden:
 *
 *   model.define("b2b_agreement", …)
 *      · dml.name    = "B2bAgreement"   -> MedusaService busca `b2bAgreementService`
 *      · entity.name = "B2bagreement"   -> el contenedor registra `b2bagreementService`
 *
 * El dígito de "b2b" rompe el round-trip del camelCase y cada mitad del
 * framework se queda con una variante distinta. Resultado: TODAS las rutas de
 * convenios fallaban en runtime con
 *   "Could not resolve 'b2bAgreementService'"
 * sin importar cómo se nombrara el export (se probaron B2BAgreement,
 * B2bAgreement, B2bagreement y b2bAgreement: los cuatro colapsan igual).
 *
 * Un nombre sin dígitos sí convierte de forma estable en ambos caminos, así que
 * la entidad se llama `BusinessAgreement`. `tableName` fija la tabla existente,
 * de modo que NO se requiere migración: la tabla sigue siendo `b2b_agreement`,
 * la ruta pública sigue siendo /admin/b2b-agreements y la clave del módulo
 * sigue siendo "b2b_agreements". Sólo cambia el nombre interno de la entidad.
 */
export const BusinessAgreement = model.define(
    { name: "BusinessAgreement", tableName: "b2b_agreement" },
    {
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
    }
);
