import { Module } from "@medusajs/framework/utils";
import InventoryMovementsModuleService from "./service";

export const INVENTORY_MOVEMENTS_MODULE = "inventory_movements";

export default Module(INVENTORY_MOVEMENTS_MODULE, {
    service: InventoryMovementsModuleService,
});
