import { model } from "@medusajs/framework/utils";

/**
 * Paquete: varios productos (y, si se quiere, la consulta) a un PRECIO
 * CERRADO, ligado a un especialista.
 *
 * El mismo «Nacimiento» puede existir para dos especialistas con precio
 * distinto: son dos paquetes. En Caja se añade entero al carrito y sus
 * renglones entran con el precio del paquete prorrateado (ver
 * lib/paquetes.ts): el inventario, la aseguranza y el ticket los ven como
 * renglones normales. La entidad se llama AltusPackage y la tabla
 * altus_package para no chocar con nada de Medusa.
 */
export const AltusPackage = model.define(
    { name: "AltusPackage", tableName: "altus_package" },
    {
        id: model.id().primaryKey(),
        name: model.text(),
        /** El médico al que corresponde (usuario), desnormalizado para leerse solo. */
        specialist_id: model.text().nullable(),
        specialist_name: model.text().nullable(),
        /** [{ variant_id, product_title, quantity }] */
        items: model.json(),
        includes_consultation: model.boolean().default(false),
        /** Precio cerrado del paquete completo. */
        price: model.float(),
        status: model.enum(["active", "inactive"]).default("active"),
        valid_from: model.dateTime().nullable(),
        valid_until: model.dateTime().nullable(),
        notes: model.text().nullable(),
    }
);
