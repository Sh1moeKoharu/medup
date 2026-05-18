import { model } from "@medusajs/framework/utils";

export const CashMovement = model.define("cash_movement", {
    id: model.id().primaryKey(),
    session_id: model.text(),                          // FK a CashSession
    order_id: model.text().nullable(),                 // FK a la orden de Medusa (si aplica)
    type: model.enum(["sale", "refund", "cash_in", "cash_out"]),
    payment_method: model.enum(["cash", "card", "transfer", "other"]),
    amount: model.bigNumber(),                         // Monto (siempre positivo, el tipo indica dirección)
    reference: model.text().nullable(),                // Número de referencia/folio
    description: model.text().nullable(),              // Descripción del movimiento
    created_by: model.text().nullable(),               // Quién registró el movimiento
});
