import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CLINICAL_NOTES_MODULE } from "../../../../../modules/clinical-notes";
import ClinicalNotesModuleService from "../../../../../modules/clinical-notes/service";
import { htmlNota } from "../../../../../lib/documentos";
import { membreteDeLaClinica } from "../../../../../lib/membrete";
import { ROLES, ROLE_LABELS, Role, normalizeRole } from "../../../../../lib/roles";
import { resolveRequestRole } from "../../../../../lib/require-role";

/** Quién puede imprimir una nota de atención: los mismos que pueden leerla. */
const PUEDEN_LEER_NOTAS: Role[] = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.AUDITOR];

/**
 * GET /admin/documents/nota/:id — la nota de atención para el expediente.
 * Contenido clínico: Caja y Farmacia no la obtienen.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const rol = await resolveRequestRole(req);
        if (!rol || !PUEDEN_LEER_NOTAS.includes(rol)) {
            return res.status(403).json({ type: "not_allowed", error: "La nota de atención es contenido clínico; tu rol no la consulta." });
        }

        const service: ClinicalNotesModuleService = req.scope.resolve(CLINICAL_NOTES_MODULE);
        const [nota] = await service.listClinicalNotes({ id: req.params.id });
        if (!nota) {
            return res.status(404).json({ error: "Nota de atención no encontrada." });
        }

        const html = htmlNota({
            membrete: await membreteDeLaClinica(req.scope as any),
            folio: nota.id,
            fecha: nota.created_at,
            paciente: nota.customer_name || nota.customer_id,
            autor: nota.author_name || nota.author_id,
            rol_autor: ROLE_LABELS[normalizeRole(nota.author_role) ?? "doctor"],
            contenido: nota.content,
            orden_folio: nota.medical_order_id,
        });

        if (!html) {
            return res.status(400).json({ error: "La nota está vacía; no hay nada que imprimir." });
        }

        res.json({ html, title: `Nota de atención ${nota.id}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
