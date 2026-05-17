import { Module } from "@medusajs/framework/utils";
import MedicalOrdersModuleService from "./service";

export const MEDICAL_ORDERS_MODULE = "medical_orders";

export default Module(MEDICAL_ORDERS_MODULE, {
    service: MedicalOrdersModuleService,
});
