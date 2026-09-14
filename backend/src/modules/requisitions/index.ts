import { Module } from "@medusajs/framework/utils";
import RequisitionsModuleService from "./service";

export const REQUISITIONS_MODULE = "requisitions";

export default Module(REQUISITIONS_MODULE, {
    service: RequisitionsModuleService,
});
