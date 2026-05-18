import { Module } from "@medusajs/framework/utils";
import CashSessionModuleService from "./service";

export const CASH_SESSION_MODULE = "cash_session";

export default Module(CASH_SESSION_MODULE, {
    service: CashSessionModuleService,
});
