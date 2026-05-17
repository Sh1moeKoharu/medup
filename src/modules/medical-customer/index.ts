import { Module } from "@medusajs/framework/utils";
import MedicalCustomerModuleService from "./service";

export const MEDICAL_CUSTOMER_MODULE = "medical_customer";

export default Module(MEDICAL_CUSTOMER_MODULE, {
    service: MedicalCustomerModuleService,
});
