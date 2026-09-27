import { MedusaService } from "@medusajs/framework/utils";
import { AltusPackage } from "./models/package";

class PaquetesModuleService extends MedusaService({
    AltusPackage,
}) {}

export default PaquetesModuleService;
