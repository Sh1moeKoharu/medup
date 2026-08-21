import { MedusaService } from "@medusajs/framework/utils";
import { BusinessAgreement } from "./models/b2b-agreement";

class B2bAgreementsModuleService extends MedusaService({
    BusinessAgreement,
}) {}

export default B2bAgreementsModuleService;
