import { MedusaService } from "@medusajs/framework/utils";
import { InventoryMovement } from "./models/inventory-movement";

class InventoryMovementsModuleService extends MedusaService({
    InventoryMovement,
}) {}

export default InventoryMovementsModuleService;
