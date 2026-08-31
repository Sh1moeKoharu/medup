import { model } from "@medusajs/framework/utils";

export const AuditLog = model.define("audit_log", {
    id: model.id().primaryKey(),
    user_id: model.text().nullable(),
    user_email: model.text().nullable(),
    /**
     * Rol del actor AL MOMENTO de la acción.
     *
     * Se guarda desnormalizado a propósito: si mañana a esa persona le cambian
     * el rol, el asiento debe seguir diciendo con qué autoridad actuó entonces.
     * Es parte de la trazabilidad que exige la NOM-024-SSA3-2012 §6.6.1.
     */
    user_role: model.text().nullable(),
    method: model.text(), // POST, PUT, DELETE
    endpoint: model.text(), // e.g. /admin/products/123
    ip_address: model.text().nullable(),
    payload: model.json().nullable(), // The request body or new state

    /**
     * Encadenamiento por huella digital. Ver lib/audit-chain.ts.
     *
     * `hash` se calcula sobre el contenido de ESTE asiento mas `prev_hash`, de
     * modo que modificar, borrar o reordenar un asiento rompe la cadena y el
     * verificador dice donde. Es el minimo verificable del documento
     * inalterable que pide la NOM-024-SSA3-2012 6.6.2.
     *
     * Nulables porque los asientos anteriores a esta migracion no la tienen: la
     * cadena arranca en el primero que se escriba despues.
     */
    prev_hash: model.text().nullable(),
    hash: model.text().nullable(),
});
