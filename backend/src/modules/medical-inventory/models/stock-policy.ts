import { model } from "@medusajs/framework/utils";

/**
 * Mínimo y máximo de existencia por presentación y almacén.
 *
 * Va aparte del lote a propósito: el mínimo es de la PRESENTACIÓN en un
 * almacén ("nunca menos de 50 tabletas de paracetamol en Farmacia"), no de
 * un lote concreto, que va y viene.
 *
 * Una fila por (variante, almacén). El job diario `check-stock-levels`
 * compara la suma de los lotes activos contra el mínimo y avisa; el máximo
 * es orientativo para quien compra y no bloquea nada.
 */
export const StockPolicy = model
    .define("stock_policy", {
        id: model.id().primaryKey(),
        variant_id: model.text(),
        stock_location_id: model.text(),
        min_quantity: model.number().default(0),
        max_quantity: model.number().nullable(),
    })
    .indexes([
        {
            on: ["variant_id", "stock_location_id"],
            unique: true,
            where: "deleted_at IS NULL",
        },
    ]);
