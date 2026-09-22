import { model } from "@medusajs/framework/utils";

/**
 * Un pago de honorarios o nómina: a quién, por qué periodo, cuánto, y el
 * desglose con que se calculó, congelado. Si después cambia el esquema de la
 * persona, el pago sigue diciendo lo que se pagó y por qué.
 *
 * Un periodo no se paga dos veces a la misma persona: la ruta rechaza periodos
 * que se traslapen con uno ya pagado.
 */
export const StaffPayment = model.define("staff_payment", {
    id: model.id().primaryKey(),
    user_id: model.text(),
    user_name: model.text().nullable(),
    role: model.text().nullable(),
    period_from: model.dateTime(),
    period_to: model.dateTime(),
    amount: model.float(),
    breakdown: model.json().nullable(),
    paid_at: model.dateTime(),
    paid_by_id: model.text(),
    paid_by_name: model.text().nullable(),
    reference: model.text().nullable(),
    notes: model.text().nullable(),
});
