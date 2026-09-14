import { MedusaService } from "@medusajs/framework/utils";
import { ClinicalNote } from "./models/clinical-note";

class ClinicalNotesModuleService extends MedusaService({
    ClinicalNote,
}) {}

export default ClinicalNotesModuleService;
