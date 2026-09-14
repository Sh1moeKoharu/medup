import { Module } from "@medusajs/framework/utils";
import ClinicalNotesModuleService from "./service";

export const CLINICAL_NOTES_MODULE = "clinical_notes";

export default Module(CLINICAL_NOTES_MODULE, {
    service: ClinicalNotesModuleService,
});
