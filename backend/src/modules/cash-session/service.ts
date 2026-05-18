import { MedusaService } from "@medusajs/framework/utils";
import { CashSession } from "./models/cash-session";
import { CashMovement } from "./models/cash-movement";

class CashSessionModuleService extends MedusaService({
    CashSession,
    CashMovement,
}) {}

export default CashSessionModuleService;
