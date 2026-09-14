import { MedusaService } from "@medusajs/framework/utils";
import { MedicalBatch } from "./models/medical-inventory";
import { StockPolicy } from "./models/stock-policy";

class MedicalInventoryModuleService extends MedusaService({
    MedicalBatch,
    StockPolicy,
}) { }

export default MedicalInventoryModuleService;
