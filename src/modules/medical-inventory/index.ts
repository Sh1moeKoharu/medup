import { Module } from "@medusajs/framework/utils";
import MedicalInventoryModuleService from "./service";

export const MEDICAL_INVENTORY_MODULE = "medical_inventory";

export default Module(MEDICAL_INVENTORY_MODULE, {
    service: MedicalInventoryModuleService,
});
