import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../../../modules/audit-logs";
import AuditLogsModuleService from "../../../modules/audit-logs/service";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const auditService: AuditLogsModuleService = req.scope.resolve(AUDIT_LOGS_MODULE);

        // Permitimos buscar/filtrar por action, email, etc.
        const logs = await auditService.listAuditLogs({}, {
            order: { created_at: "DESC" },
            take: 100 // Limitar a los ultimos 100
        });

        res.json({ audit_logs: logs });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
