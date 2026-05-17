import { model } from "@medusajs/framework/utils";

export const CashSession = model.define("cash_session", {
    id: model.id().primaryKey(),
    opened_at: model.dateTime(),
    closed_at: model.dateTime().nullable(),
    opening_amount: model.bigNumber().default(0),     // Fondo de caja inicial (en unidad monetaria, ej. pesos)
    expected_closing_amount: model.bigNumber().nullable(), // Calculado al cierre
    actual_closing_amount: model.bigNumber().nullable(),   // Lo que el cajero contó
    difference: model.bigNumber().nullable(),              // Sobrante (+) / Faltante (-)
    cashier_id: model.text(),                         // ID del usuario/admin que abrió
    cashier_name: model.text(),                       // Nombre del cajero
    sales_channel_id: model.text().nullable(),        // Canal de ventas
    status: model.enum(["open", "closed"]).default("open"),
    notes: model.text().nullable(),                   // Observaciones del cierre
});
