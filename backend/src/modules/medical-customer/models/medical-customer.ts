import { model } from "@medusajs/framework/utils";

export const MedicalCustomer = model.define("medical_customer", {
    id: model.id().primaryKey(),
    customer_type: model.enum(["b2c", "b2b"]).default("b2c"),
    employee_number: model.text().nullable(),
    company_name: model.text().nullable(),
    medical_history: model.json().nullable(),
    insurance_policy: model.text().nullable(),
    /** Las aseguranzas del paciente: [{ insurance_id, policy_number }] (ver lib/aseguranzas.ts). */
    insurances: model.json().nullable(),
});
