import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CLINICAL_NOTES_MODULE } from "../../../modules/clinical-notes";
import ClinicalNotesModuleService from "../../../modules/clinical-notes/service";
import { filtroDeLectura } from "../../../lib/notas-clinicas";
import { escribirNota } from "../../../lib/notas-clinicas-servidor";
import { resolveRequestActor } from "../../../lib/require-role";

/**
 * Notas de atención.
 *
 *   GET  /admin/clinical-notes?customer_id=&medical_order_id=&author_id=
 *   POST /admin/clinical-notes  { customer_id, medical_order_id?,
 *                                 findings, procedures, attended_at? }   ← nota del médico
 *                               { customer_id, content, medical_order_id? } ← nota libre
 *
 * Quién las lee está en lib/api-policy.ts (Caja no) y, dentro, en
 * lib/notas-clinicas.ts: Enfermería sólo recibe las de Enfermería. El autor se
 * toma de la sesión, nunca del cuerpo.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: ClinicalNotesModuleService = req.scope.resolve(CLINICAL_NOTES_MODULE);
        const { customer_id, medical_order_id, author_id } = req.query as Record<string, string>;
        const actor = await resolveRequestActor(req);
        const filters: any = { ...filtroDeLectura(actor?.role ?? null) };
        if (customer_id) filters.customer_id = customer_id;
        if (medical_order_id) filters.medical_order_id = medical_order_id;
        if (author_id) filters.author_id = author_id;

        const notas = await service.listClinicalNotes(filters, { order: { created_at: "DESC" }, take: 500 });
        res.json({ clinical_notes: notas, count: notas.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { customer_id, content, medical_order_id, findings, procedures, attended_at } = (req.body ?? {}) as any;
        const { nota, status, error } = await escribirNota(req.scope as any, await resolveRequestActor(req), {
            customer_id,
            medical_order_id,
            content,
            findings,
            procedures,
            attended_at,
        });
        if (error) {
            return res.status(status ?? 400).json({ error });
        }
        res.json({ clinical_note: nota });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
