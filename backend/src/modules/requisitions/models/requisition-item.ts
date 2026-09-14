import { model } from "@medusajs/framework/utils";
import { Requisition } from "./requisition";

export const RequisitionItem = model.define("requisition_item", {
    id: model.id().primaryKey(),
    variant_id: model.text(),
    /** Desnormalizado: el renglón se lee solo aunque el producto cambie de nombre. */
    product_title: model.text().nullable(),
    /** En unidades de venta, como la existencia. */
    quantity_requested: model.number().default(1),
    /** Lo que Farmacia ya surtió. Puede quedar por debajo de lo pedido. */
    quantity_dispatched: model.number().default(0),
    requisition: model.belongsTo(() => Requisition, {
        mappedBy: "items",
    }),
});
