import { MedusaService } from "@medusajs/framework/utils";
import { Insurance } from "./models/insurance";

class AseguranzasModuleService extends MedusaService({
    Insurance,
}) {}

export default AseguranzasModuleService;
