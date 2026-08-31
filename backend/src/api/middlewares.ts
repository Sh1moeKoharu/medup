import { defineMiddlewares } from "@medusajs/medusa";
import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs";
import AuditLogsModuleService from "../modules/audit-logs/service";
import { ROLES } from "../lib/roles";
import {
    blockRoute,
    blockWrites,
    denyReadOnlyMutations,
    requireRole,
    requireRoleExcept,
    requireRoleForMethods,
    requireRoleForWritesExcept,
    resolveRequestActor,
    stripPurchaseCosts,
} from "../lib/require-role";
import { API_POLICIES, findOverlappingPolicies } from "../lib/api-policy";
import { redactForAudit } from "../lib/audit-redaction";
import { GENESIS, calcularHuella, enFila } from "../lib/audit-chain";

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
 *
 * 3. ENCADENAMIENTO. Cada asiento guarda la huella del anterior, de forma que
 *    modificar, borrar o reordenar uno rompe la cadena y queda detectable. Ver
 *    `lib/audit-chain.ts` y el script `verificar-bitacora.ts`.
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

                const contenido = {
                    user_id: actor?.id ?? null,
                    user_email: actor?.email ?? attemptedEmail,
                    user_role: actor?.role ?? null,
                    method: req.method,
                    endpoint: actionEndpoint,
                    ip_address: (typeof ipAddress === "string" ? ipAddress : ipAddress[0]) ?? null,
                    payload: (payload ?? null) as Record<string, unknown> | null,
                };

                // Leer la huella previa y escribir el asiento van juntos y en
                // fila: si dos peticiones terminan a la vez, las dos leerian la
                // misma huella previa y la cadena quedaria bifurcada.
                await enFila(async () => {
                    const [ultimo] = await auditService.listAuditLogs(
                        {},
                        { order: { created_at: "DESC" }, take: 1 }
                    );

                    const huellaPrevia = ultimo?.hash ?? GENESIS;

                    await auditService.createAuditLogs({
                        ...contenido,
                        prev_hash: huellaPrevia,
                        hash: calcularHuella(contenido, huellaPrevia),
                    });
                });
            }
        } catch (error) {
            console.error("Failed to write to audit log:", error);
        }
    });
};

/**
 * La tabla de `lib/api-policy.ts` se traduce a middlewares. Se comprueba al
 * arrancar que no haya prefijos solapados: dos entradas donde una contiene a la
 * otra aplicarian ambas reglas y la mas restrictiva ganaria en silencio.
 */
const solapes = findOverlappingPolicies();
if (solapes.length) {
    throw new Error(
        "[POLITICA] Prefijos solapados en api-policy.ts:" + "\n  " + solapes.join("\n  ")
    );
}

const politicaDeRutas = API_POLICIES.flatMap((p) => {
    const entradas: any[] = [];

    // Lectura restringida: sólo donde el dato es sensible en sí mismo.
    if (p.read) {
        entradas.push({
            matcher: p.path,
            middlewares: [requireRoleExcept(p.except ?? [], ...p.read)],
        });
    }

    // Escritura: siempre lista explícita.
    entradas.push({
        matcher: p.path,
        middlewares: [requireRoleForWritesExcept(p.except ?? [], ...p.write)],
    });

    // Borrado, cuando debe ser más estricto que escribir. Se suma al guard
    // anterior en lugar de sustituirlo: si cualquiera de los dos deniega, la
    // petición se deniega.
    if (p.del) {
        entradas.push({
            matcher: p.path,
            middlewares: [requireRoleForMethods(["DELETE"], ...p.del)],
        });
    }

    return entradas;
});

export default defineMiddlewares({
    routes: [
        // ── Regla global: el auditor (solo lectura) no muta nada, en ninguna
        //    ruta. Una ruta nueva bajo /admin nace protegida por omisión.
        {
            matcher: "/admin/*",
            middlewares: [denyReadOnlyMutations()],
        },

        // ── Invitaciones cerradas. Ver blockRoute() para el motivo: esas
        //    rutas se saltan la autenticación global y reaplican la suya
        //    después de nuestros guards, así que no podemos autorizarlas bien.
        //    El alta de personal va por /admin/staff.
        {
            matcher: "/admin/invites",
            middlewares: [
                blockRoute(
                    "Las invitaciones están deshabilitadas. El alta de personal se hace en Ajustes → Personal."
                ),
            ],
        },

        // ── Gestión nativa de usuarios: sólo lectura. Ver blockWrites().
        //    El alta y baja de personal va por /admin/staff.
        {
            matcher: "/admin/users",
            middlewares: [
                blockWrites(
                    "La gestión de usuarios se hace en Ajustes → Personal."
                ),
            ],
        },

        // ── Permisos por recurso, generados desde la tabla única.
        ...politicaDeRutas,

        // ── Separación de funciones dentro de las órdenes médicas.
        //    Emitir es acto del área médica; surtir es acto de Farmacia.
        {
            matcher: "/admin/medical-orders",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN)],
        },
        {
            matcher: "/admin/medical-orders/:id/dispense",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.PHARMACY, ROLES.ADMIN)],
        },

        // ── Costos de adquisición fuera de la respuesta para quien no debe
        //    verlos. La propuesta lo exige para el perfil Médico.
        {
            matcher: "/admin/products",
            middlewares: [stripPurchaseCosts()],
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
