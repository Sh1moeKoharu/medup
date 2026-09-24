import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CLINICAL_NOTES_MODULE } from "../../../../modules/clinical-notes";
import ClinicalNotesModuleService from "../../../../modules/clinical-notes/service";
import { puedeLeerNota } from "../../../../lib/notas-clinicas";
import { corregirNota } from "../../../../lib/notas-clinicas-servidor";
import { resolveRequestActor, resolveRequestRole } from "../../../../lib/require-role";

/** GET /admin/clinical-notes/:id */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: ClinicalNotesModuleService = req.scope.resolve(CLINICAL_NOTES_MODULE);
        const [nota] = await service.listClinicalNotes({ id: req.params.id });
        // A quien no la puede leer se le responde como si no existiera.
        if (!nota || !puedeLeerNota(await resolveRequestRole(req), nota)) {
            return res.status(404).json({ error: "Nota de atención no encontrada." });
        }
        res.json({ clinical_note: nota });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * PUT /admin/clinical-notes/:id  { findings?, procedures?, content?, attended_at? }
 *
 * Corrige sin borrar: la versión anterior queda en `revisions` (ver
 * lib/notas-clinicas.ts). Sólo el autor, o Administración.
 */
export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { content, findings, procedures, attended_at } = (req.body ?? {}) as any;
        const { nota, status, error } = await corregirNota(req.scope as any, await resolveRequestActor(req), req.params.id, {
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
