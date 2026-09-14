import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../../../modules/audit-logs";
import AuditLogsModuleService from "../../../modules/audit-logs/service";
import { filtrosDeBitacora } from "../../../lib/bitacora";

/**
 * GET /admin/audit-logs
 *
 *   ?from=2026-09-01&to=2026-09-10      rango de fechas (un día a secas cubre el día entero)
 *   &user_role=cashier                  rol que tenía al actuar
 *   &user_email=caja                    usuario (a secas o identificador completo)
 *   &employee_number=0003
 *   &method=POST&endpoint=/admin/staff  por prefijo
 *   &limit=50&offset=0                  paginación (tope 200 por página)
 *
 * Responde `{ audit_logs, count, limit, offset }`. Antes devolvía siempre los
 * últimos 100 e ignoraba cualquier filtro; la traducción de la consulta está
 * en lib/bitacora.ts para que se pueda probar sola.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const auditService: AuditLogsModuleService = req.scope.resolve(AUDIT_LOGS_MODULE);

        const { filters, take, skip, error } = filtrosDeBitacora(req.query as any);
        if (error) {
            return res.status(400).json({ error });
        }

        const [logs, count] = await auditService.listAndCountAuditLogs(filters, {
            order: { created_at: "DESC" },
            take,
            skip,
        });

        res.json({ audit_logs: logs, count, limit: take, offset: skip });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
