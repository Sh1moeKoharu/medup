import { defineMiddlewares } from "@medusajs/medusa";
import { MedusaRequest, MedusaResponse, NextFunction } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs";
import AuditLogsModuleService from "../modules/audit-logs/service";

// Middleware para interceptar acciones en admin
const auditLogInterceptor = (req: MedusaRequest, res: MedusaResponse, next: NextFunction) => {
    // Continuamos la ejecución normal de Medusa
    next();

    // Hook al evento finish para saber si la petición fue exitosa
    res.on("finish", async () => {
        try {
            // Solo auditar métodos de modificación y respuestas exitosas (< 400)
            if (["POST", "PUT", "DELETE"].includes(req.method) && res.statusCode >= 200 && res.statusCode < 400) {
                const auditService: AuditLogsModuleService = req.scope.resolve(AUDIT_LOGS_MODULE);
                
                const actorId = (req as any).auth_context?.actor_id || "unknown";
                const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

                // Guardar payload (sin contraseñas)
                let payload = { ...req.body };
                if (payload.password) payload.password = "***";

                let actionEndpoint = req.originalUrl;
                if (actionEndpoint.includes("/auth/user/emailpass")) {
                    actionEndpoint = "Inicio de Sesión";
                }

                await auditService.createAuditLogs({
                    user_id: actorId,
                    user_email: payload.email || "unknown", 
                    method: req.method,
                    endpoint: actionEndpoint,
                    ip_address: typeof ipAddress === "string" ? ipAddress : ipAddress[0],
                    payload: payload,
                });
            }
        } catch (error) {
            console.error("Failed to write to audit log:", error);
        }
    });
};

export default defineMiddlewares({
    routes: [
        {
            matcher: "/admin/customers",
            method: "GET",
            middlewares: [
                (req, res, next) => {
                    next();
                },
            ],
        },
        {
            matcher: "/admin/products",
            method: "GET",
            middlewares: [
                (req, res, next) => {
                    console.log("[DEBUG] /admin/products fields:", req.queryConfig?.fields);
                    next();
                },
            ],
        },
        {
            matcher: "/admin/*",
            method: "ALL",
            middlewares: [auditLogInterceptor],
        },
        {
            matcher: "/auth/*",
            method: "ALL",
            middlewares: [auditLogInterceptor],
        }
    ],
});
