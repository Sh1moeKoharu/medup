import { MedusaService } from "@medusajs/framework/utils";
import { MedicalOrder } from "./models/medical-order";
import { MedicalOrderItem } from "./models/medical-order-item";

class MedicalOrdersModuleService extends MedusaService({
    MedicalOrder,
    MedicalOrderItem,
}) {}

export default MedicalOrdersModuleService;
