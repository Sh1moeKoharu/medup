import { model } from "@medusajs/framework/utils";

/**
 * Porcentaje de comisión de un médico sobre lo cobrado de sus órdenes.
 *
 * Una fila por médico. La escribe SÓLO Administración y el médico no la ve
 * (ver api-policy.ts): es una condición de su contrato, no un dato de su
 * interfaz.
 */
export const DoctorCommission = model.define("doctor_commission", {
    id: model.id().primaryKey(),
    doctor_id: model.text().unique(),
    doctor_name: model.text().nullable(),
    /** Porcentaje, 0 a 100. */
    percent: model.float().default(0),
    notes: model.text().nullable(),
});
