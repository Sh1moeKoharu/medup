import { Module } from "@medusajs/framework/utils";
import AuditLogsModuleService from "./service";

export const AUDIT_LOGS_MODULE = "audit_logs";

export default Module(AUDIT_LOGS_MODULE, {
    service: AuditLogsModuleService,
});
