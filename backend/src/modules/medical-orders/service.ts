import { MedusaService } from "@medusajs/framework/utils";
import { MedicalOrder } from "./models/medical-order";
import { MedicalOrderAdjustment } from "./models/medical-order-adjustment";
import { MedicalOrderItem } from "./models/medical-order-item";

class MedicalOrdersModuleService extends MedusaService({
    MedicalOrder,
    MedicalOrderItem,
    MedicalOrderAdjustment,
}) {}

export default MedicalOrdersModuleService;
