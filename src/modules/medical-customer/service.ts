import { MedusaService } from "@medusajs/framework/utils";
import { MedicalCustomer } from "./models/medical-customer";

class MedicalCustomerModuleService extends MedusaService({
    MedicalCustomer,
}) { }

export default MedicalCustomerModuleService;
