import { model } from "@medusajs/framework/utils";
import { RequisitionItem } from "./requisition-item";

/**
 * Requisición: Enfermería pide medicamento a Farmacia.
 *
 * Es el único camino por el que la existencia pasa de un almacén a otro. Al
 * surtirla, Farmacia descuenta de sus lotes (FEFO) y la misma cantidad entra
 * a Enfermería con el mismo número de lote y caducidad; quedan DOS asientos
 * en el kardex, `exit_transfer` en origen y `entry_transfer` en destino.
 *
 *   pending     pedida; nada o sólo parte se ha surtido
 *   dispatched  Farmacia surtió todo lo pedido; el medicamento ya está en el
 *               almacén de destino
 *   received    Enfermería confirmó que lo tiene en la mano
 *   cancelled   retirada antes de surtir nada
 */
export const Requisition = model.define("requisition", {
    id: model.id().primaryKey(),
    status: model.enum(["pending", "dispatched", "received", "cancelled"]).default("pending"),

    /** De dónde sale (Farmacia) y a dónde entra (Enfermería). `stock_location` de Medusa. */
    source_location_id: model.text(),
    destination_location_id: model.text(),

    requested_by_id: model.text(),
    requested_by_name: model.text().nullable(),

    dispatched_by_id: model.text().nullable(),
    dispatched_by_name: model.text().nullable(),
    dispatched_at: model.dateTime().nullable(),

    received_by_id: model.text().nullable(),
    received_by_name: model.text().nullable(),
    received_at: model.dateTime().nullable(),

    notes: model.text().nullable(),

    items: model.hasMany(() => RequisitionItem, {
        mappedBy: "requisition",
    }),
});
