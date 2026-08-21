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
});
