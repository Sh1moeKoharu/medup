import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CLINICAL_NOTES_MODULE } from "../../../../modules/clinical-notes";
import ClinicalNotesModuleService from "../../../../modules/clinical-notes/service";
import { puedeLeerNota } from "../../../../lib/notas-clinicas";
import { resolveRequestRole } from "../../../../lib/require-role";

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
