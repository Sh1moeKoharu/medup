import { Module } from "@medusajs/framework/utils";
import HonorariosModuleService from "./service";

export const HONORARIOS_MODULE = "honorarios";

export default Module(HONORARIOS_MODULE, {
    service: HonorariosModuleService,
});
