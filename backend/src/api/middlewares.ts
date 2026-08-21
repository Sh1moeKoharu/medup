import { defineMiddlewares } from "@medusajs/medusa";
import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs";
import AuditLogsModuleService from "../modules/audit-logs/service";
import { ROLES } from "../lib/roles";
import {
    denyReadOnlyMutations,
    requireRole,
    requireRoleForWrites,
    resolveRequestActor,
    stripPurchaseCosts,
} from "../lib/require-role";
import { redactForAudit } from "../lib/audit-redaction";

/**
 * Interceptor de bitácora.
 *
 * Dos correcciones respecto de la versión anterior:
 *
 * 1. IDENTIDAD REAL DEL ACTOR. Antes guardaba `payload.email`, que sólo existe
 *    en el cuerpo del login: en toda acción de administración la bitácora decía
 *    literalmente "unknown". Un registro que no identifica a quien actuó no
 *    sirve para el no repudio que exige la NOM-024-SSA3-2012 §6.6.1. Ahora la
 *    identidad se resuelve desde la SESIÓN.
 *
 * 2. REDACCIÓN DE DATOS SENSIBLES. Antes se guardaba `req.body` completo
 *    enmascarando sólo `password`, lo que duplicaba diagnósticos, alergias y
 *    posologías en texto plano dentro de `audit_log.payload`. Ver
 *    `lib/audit-redaction.ts`.
 */
const auditLogInterceptor = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    // Continuamos la ejecución normal de Medusa
    next();

    // Hook al evento finish para saber si la petición fue exitosa
    res.on("finish", async () => {
        try {
            // Solo auditar métodos de modificación y respuestas exitosas (< 400)
            if (["POST", "PUT", "DELETE"].includes(req.method) && res.statusCode >= 200 && res.statusCode < 400) {
                const auditService: AuditLogsModuleService = req.scope.resolve(AUDIT_LOGS_MODULE);

                const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

                const isLogin = req.originalUrl.includes("/auth/user/emailpass");
                const actionEndpoint = isLogin ? "Inicio de Sesión" : req.originalUrl;

                const payload = redactForAudit(req.body, actionEndpoint);

                // En el login todavía no hay sesión establecida, así que el
                // único identificador disponible es el correo que se intentó
                // usar. En cualquier otra ruta se ignora lo que diga el cuerpo
                // y se usa la sesión.
                const actor = await resolveRequestActor(req);
                const attemptedEmail = isLogin
                    ? ((req.body as Record<string, any>)?.email ?? null)
                    : null;

                await auditService.createAuditLogs({
                    user_id: actor?.id ?? null,
                    user_email: actor?.email ?? attemptedEmail,
                    user_role: actor?.role ?? null,
                    method: req.method,
                    endpoint: actionEndpoint,
                    ip_address: typeof ipAddress === "string" ? ipAddress : ipAddress[0],
                    payload: payload as Record<string, unknown> | null,
                });
            }
        } catch (error) {
            console.error("Failed to write to audit log:", error);
        }
    });
};

/**
 * TABLA DE POLÍTICAS DE ACCESO
 *
 * Criterio: restringir la ESCRITURA de forma estricta y la LECTURA sólo donde
 * el dato es sensible en sí mismo (staff, bitácora, costos de compra).
 * Sobre-restringir los GET rompe el admin para roles legítimos sin ganar
 * seguridad, porque `denyReadOnlyMutations` ya impide toda mutación al auditor.
 *
 * Los matchers se declaran SIN `methods` a propósito: así Medusa los monta con
 * `app.use(matcher)`, que hace match por prefijo y cubre las subrutas
 * (`/admin/staff` cubre `/admin/staff/:id`). El filtrado por verbo vive dentro
 * de cada middleware.
 */
export default defineMiddlewares({
    routes: [
        // ── Regla global: el auditor (solo lectura) no muta nada, en ninguna ruta.
        //    Una ruta nueva bajo /admin nace protegida por omisión.
        {
            matcher: "/admin/*",
            middlewares: [denyReadOnlyMutations()],
        },

        // ── Gestión de usuarios: dato sensible también en lectura.
        {
            matcher: "/admin/staff",
            middlewares: [requireRole(ROLES.ADMIN, ROLES.AUDITOR)],
        },

        // ── Bitácora de auditoría: sólo Administración y Auditoría.
        {
            matcher: "/admin/audit-logs",
            middlewares: [requireRole(ROLES.ADMIN, ROLES.AUDITOR)],
        },

        // ── Kardex: lo consultan Almacén, Administración y Auditoría.
        //    Médico y Enfermería no tienen por qué ver costos ni movimientos.
        {
            matcher: "/admin/inventory-movements",
            middlewares: [
                requireRole(ROLES.ADMIN, ROLES.PHARMACY, ROLES.AUDITOR, ROLES.CASHIER),
            ],
        },

        // ── Caja y cortes de turno: sólo Caja/Recepción y Admin operan.
        {
            matcher: "/admin/cash-sessions",
            middlewares: [requireRoleForWrites(ROLES.ADMIN, ROLES.CASHIER)],
        },

        // ── Órdenes médicas: las emite el área médica.
        //    (matcher estático: no alcanza a /admin/medical-orders/:id/...)
        {
            matcher: "/admin/medical-orders",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN)],
        },

        // ── Surtido/dispensación: es acto de Farmacia, no de quien receta.
        {
            matcher: "/admin/medical-orders/:id/dispense",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.PHARMACY, ROLES.ADMIN)],
        },

        // ── Lotes de inventario: los da de alta Farmacia.
        {
            matcher: "/admin/medical-batches",
            middlewares: [requireRoleForWrites(ROLES.ADMIN, ROLES.PHARMACY)],
        },

        // ── Inventario físico: cuenta y ajusta Almacén; autoriza Admin.
        {
            matcher: "/admin/inventory-counts",
            middlewares: [requireRole(ROLES.ADMIN, ROLES.PHARMACY)],
        },

        // ── Inventario valorizado: expone costos, así que va con los mismos
        //    roles que pueden ver precios de compra.
        {
            matcher: "/admin/inventory-reports",
            middlewares: [requireRole(ROLES.ADMIN, ROLES.PHARMACY, ROLES.AUDITOR)],
        },

        // ── Convenios empresariales: condición comercial, sólo Admin.
        {
            matcher: "/admin/b2b-agreements",
            middlewares: [requireRoleForWrites(ROLES.ADMIN)],
        },

        // ── Expediente del paciente: lo actualiza el área médica.
        {
            matcher: "/admin/medical-customers",
            middlewares: [
                requireRoleForWrites(
                    ROLES.ADMIN,
                    ROLES.DOCTOR,
                    ROLES.NURSE,
                    ROLES.PHARMACY
                ),
            ],
        },

        // ── Catálogo: sólo Admin y Farmacia escriben.
        //    Además de ser la regla correcta, esto evita que un rol que no ve
        //    los costos guarde el producto y los borre: el widget de farmacia
        //    reenvía `{...product.metadata}`, y ese metadata le llega filtrado.
        {
            matcher: "/admin/products",
            middlewares: [
                requireRoleForWrites(ROLES.ADMIN, ROLES.PHARMACY),
                stripPurchaseCosts(),
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
