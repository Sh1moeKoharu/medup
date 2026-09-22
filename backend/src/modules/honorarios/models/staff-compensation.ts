import { model } from "@medusajs/framework/utils";

/**
 * Cómo se le paga a una persona del personal: pago fijo por turno, pago por
 * hora en turno y un porcentaje base sobre lo que se le atribuye. Las reglas
 * por horario (`staff_commission_rule`) cambian el porcentaje según el día y la
 * hora: un médico puede cobrar 20 % de día y 30 % de noche.
 *
 * Una fila por persona, de cualquier perfil (lo pidió la clínica: comisiones
 * «de otros usuarios además del médico»). La fijan Administración y RH; la
 * persona no la consulta (ver api-policy.ts).
 *
 * Qué se le atribuye a cada perfil está en lib/nomina-servidor.ts.
 */
export const StaffCompensation = model.define("staff_compensation", {
    id: model.id().primaryKey(),
    user_id: model.text().unique(),
    user_name: model.text().nullable(),
    role: model.text().nullable(),
    /** Pesos por turno trabajado. */
    fixed_per_shift: model.float().default(0),
    /** Pesos por hora en turno. */
    hourly_rate: model.float().default(0),
    /** Porcentaje cuando ninguna regla por horario aplica. 0 a 100. */
    default_percent: model.float().default(0),
    notes: model.text().nullable(),
});
