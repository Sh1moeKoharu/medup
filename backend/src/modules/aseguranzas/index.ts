import { Module } from "@medusajs/framework/utils";
import AseguranzasModuleService from "./service";

export const ASEGURANZAS_MODULE = "aseguranzas";

export default Module(ASEGURANZAS_MODULE, {
    service: AseguranzasModuleService,
});
