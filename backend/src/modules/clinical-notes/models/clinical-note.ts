import { model } from "@medusajs/framework/utils";

/**
 * Nota de atención: lo que el médico o Enfermería escribe de una consulta.
 *
 * Es contenido CLÍNICO. La leen quien atiende (médico, Enfermería),
 * Administración y Auditoría; Caja no. Se redacta en la bitácora igual que el
 * resto del expediente (ver lib/audit-redaction.ts) y se imprime como
 * documento para el expediente físico (GET /admin/documents/nota/:id).
 *
 * Campos desnormalizados a propósito (`customer_name`, `author_name`): la
 * nota debe poder leerse sola aunque el paciente o el autor cambien de nombre.
 */
export const ClinicalNote = model.define("clinical_note", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    customer_name: model.text().nullable(),
    author_id: model.text(),
    author_name: model.text().nullable(),
    author_role: model.enum(["doctor", "nurse", "admin"]).default("doctor"),
    /** Orden médica de la misma consulta, si la hubo. */
    medical_order_id: model.text().nullable(),
    /** Lo que se escribió. Nunca vacío. Con estructura, es la composición de lo de abajo. */
    content: model.text(),
    /** Qué revisó: exploración, signos, hallazgos. */
    findings: model.text().nullable(),
    /** Qué hizo: procedimiento, tratamiento, indicaciones dadas en consulta. */
    procedures: model.text().nullable(),
    /** Cuándo se atendió. Si falta, cuenta la fecha de captura (`created_at`). */
    attended_at: model.dateTime().nullable(),
    /** Versiones anteriores, la más reciente primero: corregir no borra lo escrito (ver lib/notas-clinicas.ts). */
    revisions: model.json().nullable(),
    edited_at: model.dateTime().nullable(),
    edited_by_id: model.text().nullable(),
    edited_by_name: model.text().nullable(),
});
