import { model } from "@medusajs/framework/utils";

/**
 * Porcentaje de comisión para una franja: días de la semana y horas, en hora
 * de la clínica. Si `end_time` es menor que `start_time`, la franja cruza la
 * medianoche (22:00 a 06:00). La primera regla que coincide manda; si ninguna
 * coincide, se usa el porcentaje base de la persona.
 */
export const StaffCommissionRule = model.define("staff_commission_rule", {
    id: model.id().primaryKey(),
    user_id: model.text(),
    label: model.text().nullable(),
    /** Días en que aplica, 0 = domingo … 6 = sábado, separados por coma: "1,2,3,4,5". */
    days: model.text(),
    /** "HH:MM". */
    start_time: model.text(),
    end_time: model.text(),
    percent: model.float(),
});
