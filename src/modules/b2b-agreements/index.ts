import { Module } from "@medusajs/framework/utils";
import B2BAgreementsModuleService from "./service";

export const B2B_AGREEMENTS_MODULE = "b2b_agreements";

export default Module(B2B_AGREEMENTS_MODULE, {
    service: B2BAgreementsModuleService,
});
