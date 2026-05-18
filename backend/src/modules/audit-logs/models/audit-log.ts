import { model } from "@medusajs/framework/utils";

export const AuditLog = model.define("audit_log", {
    id: model.id().primaryKey(),
    user_id: model.text().nullable(),
    user_email: model.text().nullable(),
    method: model.text(), // POST, PUT, DELETE
    endpoint: model.text(), // e.g. /admin/products/123
    ip_address: model.text().nullable(),
    payload: model.json().nullable(), // The request body or new state
});
