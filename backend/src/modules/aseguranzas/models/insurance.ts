import { model } from "@medusajs/framework/utils";

/**
 * Aseguranza: quien paga parte de los MEDICAMENTOS del paciente.
 *
 * El descuento se aplica solo, en el cobro, únicamente a los renglones de tipo
 * Medicamento (ver lib/aseguranzas.ts): la consulta y los insumos van íntegros.
 * Cada aseguranza tiene detrás una promoción de Medusa (`promotion_id`) que es
 * la que hace la resta; esta tabla es lo que Administración ve y edita.
 */
export const Insurance = model.define("insurance", {
    id: model.id().primaryKey(),
    name: model.text(),
    /** Porcentaje que cubre sobre medicamentos: 0 < n ≤ 100. */
    discount_percent: model.float().default(0),
    status: model.enum(["active", "inactive"]).default("active"),
    valid_from: model.dateTime().nullable(),
    valid_until: model.dateTime().nullable(),
    notes: model.text().nullable(),
    /** La promoción de Medusa que aplica el descuento, y su código. */
    promotion_id: model.text().nullable(),
    promotion_code: model.text().nullable(),
});
