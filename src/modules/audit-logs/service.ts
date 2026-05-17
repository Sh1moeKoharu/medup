import { MedusaService } from "@medusajs/framework/utils";
import { AuditLog } from "./models/audit-log";

class AuditLogsModuleService extends MedusaService({
    AuditLog,
}) {}

export default AuditLogsModuleService;
