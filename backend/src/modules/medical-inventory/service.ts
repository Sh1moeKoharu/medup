import { MedusaService } from "@medusajs/framework/utils";
import { MedicalBatch } from "./models/medical-inventory";

class MedicalInventoryModuleService extends MedusaService({
    MedicalBatch,
}) { }

export default MedicalInventoryModuleService;
