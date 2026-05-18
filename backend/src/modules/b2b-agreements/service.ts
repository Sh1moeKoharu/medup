import { MedusaService } from "@medusajs/framework/utils";
import { B2BAgreement } from "./models/b2b-agreement";

class B2BAgreementsModuleService extends MedusaService({
    B2BAgreement,
}) {}

export default B2BAgreementsModuleService;
