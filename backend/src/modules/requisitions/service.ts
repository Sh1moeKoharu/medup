import { MedusaService } from "@medusajs/framework/utils";
import { Requisition } from "./models/requisition";
import { RequisitionItem } from "./models/requisition-item";

class RequisitionsModuleService extends MedusaService({
    Requisition,
    RequisitionItem,
}) {}

export default RequisitionsModuleService;
