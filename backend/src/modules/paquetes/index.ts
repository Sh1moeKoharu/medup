import { Module } from "@medusajs/framework/utils";
import PaquetesModuleService from "./service";

export const PAQUETES_MODULE = "paquetes";

export default Module(PAQUETES_MODULE, {
    service: PaquetesModuleService,
});
