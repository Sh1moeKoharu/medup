import { defineMiddlewares } from "@medusajs/medusa";
import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs";
import AuditLogsModuleService from "../modules/audit-logs/service";
import { ROLES } from "../lib/roles";
import {
    blockRoute,
    blockWrites,
    denyBlockedAccounts,
    denyReadOnlyMutations,
    denyUnpoliciedWrites,
    requireRole,
    requireRoleExcept,
    requireRoleForMethods,
    requireRoleForWritesExcept,
    requirePanelRole,
    resolveRequestActor,
    stripClinicalFields,
    stripPurchaseCosts,
} from "../lib/require-role";
import { API_POLICIES, findOverlappingPolicies } from "../lib/api-policy";
import { redactForAudit } from "../lib/audit-redaction";
import { GENESIS, calcularHuella, enFila } from "../lib/audit-chain";
import { requireTurnoAbierto } from "../lib/turno";
import { requireSinPendientesDeEnfermeria } from "../lib/cobro-de-cuentas";
import { esLecturaSensible } from "../lib/bitacora";
import { rejectBlockedLogin } from "../lib/bloqueo";

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
            // Se auditan las escrituras y una lista corta de LECTURAS sensibles
            // (ficha de paciente, expediente, notas): quién miró un expediente
            // es la pregunta que hace un auditor. Ver lib/bitacora.ts. Sólo
            // respuestas exitosas (< 400): un intento denegado no movió nada.
            const esEscritura = ["POST", "PUT", "DELETE"].includes(req.method);
            const esLectura = esLecturaSensible(req.method, req.originalUrl);
            if ((esEscritura || esLectura) && res.statusCode >= 200 && res.statusCode < 400) {
                const auditService: AuditLogsModuleService = req.scope.resolve(AUDIT_LOGS_MODULE);

                const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

                const isLogin = req.originalUrl.includes("/auth/user/emailpass");
                const actionEndpoint = isLogin ? "Inicio de sesión" : req.originalUrl;

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
                    user_employee_number: actor?.employee_number ?? null,
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
        // ── Regla global: una cuenta bloqueada no entra a nada, ni a leer.
        {
            matcher: "/admin/*",
            middlewares: [denyBlockedAccounts()],
        },
        // ── Y tampoco obtiene un token nuevo.
        {
            matcher: "/auth/user/emailpass",
            methods: ["POST"],
            middlewares: [rejectBlockedLogin()],
        },

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

        // ── Registro público de identidades, cerrado.
        //
        //    `/auth/user/emailpass/register` viene ABIERTO de fábrica: permite a
        //    cualquiera, sin autenticarse, crear una identidad de acceso. Una
        //    identidad huérfana no da acceso al panel —no lleva `user_id` en su
        //    `app_metadata`— pero es escritura no autenticada en la tabla de
        //    autenticación, y no hay razón para dejarla abierta.
        //
        //    Estaba abierta porque el alta de personal la usaba llamándose a sí
        //    misma por HTTP. Ya no: `/admin/staff` crea la identidad por el
        //    módulo. Si algún día vuelve a hacer falta registrar desde fuera,
        //    hay que quitar este bloqueo A SABIENDAS.
        {
            matcher: "/auth/user/emailpass/register",
            middlewares: [
                blockRoute(
                    "El registro directo está deshabilitado. El alta de personal se hace en Ajustes → Personal."
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
        // Cancelar es acto de quien prescribe, no de quien surte: Farmacia no
        // retira una receta que no emitió. Sin esta regla, el prefijo
        // /admin/medical-orders la dejaría pasar.
        {
            matcher: "/admin/medical-orders/:id/cancel",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.ADMIN)],
        },

        // ── Cobrar exige turno de caja abierto (ver lib/turno.ts). Es la
        //    ruta con la que el punto de venta convierte el carrito en venta.
        //    Y antes que el turno: nada se cobra mientras Enfermería tenga
        //    algo sin aplicar al paciente (ver lib/cobro-de-cuentas.ts).
        {
            matcher: "/admin/draft-orders/:id/convert-to-order",
            methods: ["POST"],
            middlewares: [requireSinPendientesDeEnfermeria(), requireTurnoAbierto()],
        },
        // ── El ticket de un pedido en borrador tampoco sale mientras tanto.
        //    Los ya cobrados se reimprimen sin condición.
        {
            matcher: "/admin/receipts/:orderId",
            methods: ["GET"],
            middlewares: [requireSinPendientesDeEnfermeria()],
        },

        // ── Aplicar en consulta es acto de Enfermería; ajustar renglones, de
        //    quien atiende.
        {
            matcher: "/admin/medical-orders/:id/consume",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.NURSE, ROLES.ADMIN)],
        },
        {
            matcher: "/admin/medical-orders/:id/items",
            methods: ["POST"],
            // Farmacia entra sólo para quitar o reducir, con motivo: la ruta lo comprueba.
            middlewares: [requireRole(ROLES.NURSE, ROLES.DOCTOR, ROLES.PHARMACY, ROLES.ADMIN)],
        },

        // ── Requisiciones: Enfermería pide y recibe; Almacén surte.
        {
            matcher: "/admin/requisitions",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.NURSE, ROLES.ADMIN)],
        },
        {
            matcher: "/admin/requisitions/:id/dispatch",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.WAREHOUSE, ROLES.ADMIN)],
        },
        {
            matcher: "/admin/requisitions/:id/receive",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.NURSE, ROLES.ADMIN)],
        },
        {
            matcher: "/admin/requisitions/:id/cancel",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.NURSE, ROLES.ADMIN)],
        },

        // ── Destrucción sanitaria: acto de Almacén, no de Enfermería, aunque
        //    la política general de lotes la deje escribir (para sus bajas).
        {
            matcher: "/admin/medical-batches/:id/destroy",
            methods: ["POST"],
            middlewares: [requireRole(ROLES.WAREHOUSE, ROLES.ADMIN)],
        },

        // ── Costos de adquisición fuera de la respuesta para quien no debe
        //    verlos. La propuesta lo exige para el perfil Médico.
        {
            matcher: "/admin/products",
            middlewares: [stripPurchaseCosts()],
        },

        // ── Contenido clínico fuera de la respuesta para quien no atiende.
        //    Cerrar /admin/medical-customers no basta: el link con el paciente
        //    deja `medical_history` alcanzable desde /admin/customers pidiendo
        //    la expansión del campo.
        {
            matcher: "/admin/customers",
            middlewares: [stripClinicalFields()],
        },

        // ── El panel, sólo para Administración. Ver requirePanelRole(): se
        //    decide donde se emite la cookie de sesión, y nace apagado detrás
        //    de PANEL_SOLO_ADMINISTRACION hasta que los demás perfiles tengan
        //    su interfaz en el punto de venta.
        {
            matcher: "/auth/session",
            methods: ["POST"],
            middlewares: [requirePanelRole()],
        },

        // ── Omisión segura: lo que no está en la tabla, sólo Administrador.
        //    Va AL FINAL, después de todas las políticas: si alguna ya se
        //    pronunció sobre la ruta, esto no interviene.
        {
            matcher: "/admin/*",
            middlewares: [denyUnpoliciedWrites()],
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
