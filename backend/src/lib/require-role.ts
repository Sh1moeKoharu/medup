import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { isPathCoveredByPolicy } from "./api-policy"
import { estaBloqueado, numeroDeEmpleado } from "./personal"
import {
  ROLES,
  Role,
  ROLE_LABELS,
  canSeeCost,
  isReadOnly,
  normalizeRole,
} from "./roles"

/**
 * Control de acceso basado en roles, del lado del servidor.
 *
 * Antes de esto el único "control" era `admin/widgets/auditor-guard.tsx`, que
 * inyectaba CSS y hacía `window.location.href`. Eso es cosmética de cliente: se
 * saltaba con F12 o llamando la API directamente. Todo lo que se aplique aquí
 * es lo único que cuenta como seguridad.
 *
 * ORDEN DE EJECUCIÓN (verificado en @medusajs/framework/dist/http/router.js):
 * el framework registra `app.use("/admin", authMiddleware)` ANTES del loop que
 * monta los middlewares definidos en `src/api/middlewares.ts`, por lo que
 * `req.auth_context` ya está poblado cuando corren estos guards.
 */

const ACTOR_CACHE = Symbol.for("sigh.resolved_actor")

/** Verbos que no mutan estado. */
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"]

/**
 * Claves de `product.metadata` que revelan costo de adquisición.
 * La propuesta exige que el médico no pueda ver precios de compra.
 */
const COST_METADATA_KEYS = ["precio_compra", "margen_automatico"]

/**
 * Identidad del usuario autenticado, resuelta desde la SESIÓN.
 *
 * Es la única fuente admisible de "quién hizo esto". Nunca debe tomarse del
 * cuerpo de la petición: un cliente puede afirmar cualquier identidad, y eso
 * destruye el no repudio que exige la NOM-024-SSA3-2012 §6.6.1.
 */
export type RequestActor = {
  id: string
  email: string | null
  /** Nombre para mostrar: "Nombre Apellido", o el correo si no hay nombre. */
  name: string
  role: Role | null
  /** Número de empleado, si la cuenta lo tiene. Va a la bitácora. */
  employee_number: string | null
  /** Bloqueada por Administración: no tiene acceso aunque su token siga vivo. */
  blocked: boolean
}

type ActorAwareRequest = MedusaRequest & {
  [ACTOR_CACHE]?: RequestActor | null
  auth_context?: { actor_id?: string; actor_type?: string }
}

/**
 * Cuentas ya avisadas, para no repetir el aviso en cada petición.
 *
 * Sin esto, un panel abierto genera decenas de líneas idénticas por minuto y el
 * registro deja de ser legible justo cuando hace falta leerlo.
 */
const CUENTAS_SIN_ROL_AVISADAS = new Set<string>()

/**
 * Deja constancia en el registro de que una cuenta quedó sin acceso por no
 * tener rol reconocible.
 *
 * Existe porque el síntoma es mudo: la persona sólo ve "no tienes acceso" y
 * quien administra no tiene forma de saber por qué. Con esta línea, un
 * `sudo altus registro` dice qué cuenta es y cómo repararla.
 *
 * Nunca lanza: es un diagnóstico, y un fallo al registrarlo no puede tumbar la
 * resolución de identidad.
 */
function avisarCuentaSinRol(
  req: MedusaRequest,
  actor: RequestActor,
  almacenado: unknown
): void {
  try {
    if (CUENTAS_SIN_ROL_AVISADAS.has(actor.id)) {
      return
    }
    CUENTAS_SIN_ROL_AVISADAS.add(actor.id)

    const quien = actor.email ?? actor.id
    const causa =
      almacenado === undefined || almacenado === null || String(almacenado).trim() === ""
        ? "no tiene rol asignado"
        : `tiene el rol desconocido "${String(almacenado)}"`

    const logger: any = req.scope.resolve("logger")
    logger.warn(
      `[ROLES] La cuenta ${quien} ${causa}, así que NO tiene acceso a ninguna ` +
        `operación. Asígnale uno en Ajustes → Personal, o ejecuta ` +
        `"npx medusa exec ./src/scripts/migrate-roles.ts" para ver todas las ` +
        `cuentas en esta situación. Si es el administrador: ` +
        `"npx medusa exec ./src/scripts/crear-admin.ts correo=${quien}".`
    )
  } catch {
    // El diagnóstico es opcional; la denegación no depende de él.
  }
}

/**
 * Resuelve al usuario autenticado (id, correo y rol canónico).
 *
 * El rol vive en `user.metadata.role` (módulo USER), no en el JWT, así que hay
 * que ir por el usuario. El resultado se cachea en el request para no repetir
 * la consulta cuando varios guards coinciden en la misma ruta.
 *
 * Devuelve `null` si no hay sesión o si el actor no es un usuario de admin.
 *
 * El `role` del actor puede ser `null` aunque la sesión sea válida: la cuenta
 * existe pero no tiene rol asignado, o tiene uno que no se reconoce. Eso NO es
 * un rol por omisión, es ausencia de permisos, y todos los guards deniegan.
 */
export async function resolveRequestActor(
  req: MedusaRequest
): Promise<RequestActor | null> {
  const request = req as ActorAwareRequest

  if (ACTOR_CACHE in request) {
    return request[ACTOR_CACHE] ?? null
  }

  let resolved: RequestActor | null = null

  try {
    const actorId = request.auth_context?.actor_id
    const actorType = request.auth_context?.actor_type

    // Sólo los usuarios de admin tienen rol. Un customer nunca pasa por aquí.
    if (actorId && (!actorType || actorType === "user")) {
      const userModuleService = req.scope.resolve(Modules.USER)
      const users = await userModuleService.listUsers({ id: actorId })
      const user = users?.[0]

      if (user) {
        const stored = (user.metadata as Record<string, unknown> | null)?.role
        const displayName =
          [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
          user.email ||
          user.id

        // Sin rol es SIN ACCESO, no "administrador". Ver el bloque
        // "NO HAY ROL POR OMISIÓN" en roles.ts: una omisión que escala
        // privilegios está al revés. `normalizeRole` ya devuelve null tanto
        // para el campo ausente como para un valor que no se reconoce.
        // Una cuenta BLOQUEADA se resuelve sin rol: todos los guards deniegan,
        // y `denyBlockedAccounts` lo dice con su propio mensaje. Así un token
        // emitido antes del bloqueo deja de servir en el acto.
        const bloqueada = estaBloqueado(user)
        resolved = {
          id: user.id,
          email: user.email ?? null,
          name: displayName,
          role: bloqueada ? null : normalizeRole(stored),
          employee_number: numeroDeEmpleado(user),
          blocked: bloqueada,
        }

        if (!resolved.role && !resolved.blocked) {
          avisarCuentaSinRol(req, resolved, stored)
        }
      }
    }
  } catch {
    // Ante cualquier fallo se devuelve null y el guard deniega. Nunca se
    // concede acceso por error de resolución.
    resolved = null
  }

  request[ACTOR_CACHE] = resolved
  return resolved
}

/**
 * Atajo cuando sólo interesa el rol. Comparte la caché con
 * `resolveRequestActor`, así que no genera consulta adicional.
 */
export async function resolveRequestRole(
  req: MedusaRequest
): Promise<Role | null> {
  const actor = await resolveRequestActor(req)
  return actor?.role ?? null
}

function deny(res: MedusaResponse, message: string, role: Role | null) {
  return res.status(403).json({
    type: "not_allowed",
    message,
    your_role: role ? ROLE_LABELS[role] : null,
  })
}

/**
 * Restringe una ruta a los roles indicados.
 *
 *   { matcher: "/admin/staff", methods: ["POST"], middlewares: [requireRole(ROLES.ADMIN)] }
 */
export function requireRole(...allowed: Role[]) {
  return requireRoleExcept([], ...allowed)
}

/**
 * Como `requireRole`, pero deja pasar rutas exactas concretas.
 *
 * Existe por `/admin/users/me`: la identidad del propio usuario. Restringir
 * `/admin/users` a Administrador es correcto —ahi se da de alta personal— pero
 * el prefijo arrastra tambien `/me`, que TODO el panel consulta para saber su
 * rol. Sin esta excepcion un cajero no podria ni cargar la pantalla de inicio.
 */
export function requireRoleExcept(exceptPaths: string[], ...allowed: Role[]) {
  const exentas = new Set(exceptPaths)

  return async function requireRoleMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    // `req.path` es relativo al punto de montaje del middleware, asi que se
    // compara tambien contra la URL original.
    const rutaCompleta = ((req as any).originalUrl ?? "").split("?")[0]
    if (exentas.has(rutaCompleta) || exentas.has(req.path)) {
      return next()
    }

    const role = await resolveRequestRole(req)

    if (!role) {
      return deny(
        res,
        "Tu cuenta no tiene un rol asignado, así que no puede realizar ninguna " +
          "operación. Pide a un administrador que te lo asigne en " +
          "Ajustes → Personal.",
        null
      )
    }

    if (!allowed.includes(role)) {
      const permitidos = allowed.map((r) => ROLE_LABELS[r]).join(", ")
      return deny(
        res,
        `Tu rol no tiene acceso a esta operación. Roles permitidos: ${permitidos}.`,
        role
      )
    }

    return next()
  }
}

/**
 * Igual que `requireRole`, pero deja pasar los verbos de lectura.
 *
 * Se usa para el caso habitual "cualquiera con sesión puede consultar, sólo
 * ciertos roles pueden modificar". Se monta SIN `methods` para que Medusa use
 * `app.use(matcher)` y el matcher cubra las subrutas por prefijo; el filtrado
 * por verbo ocurre aquí dentro en vez de depender del patrón de ruta.
 */
export function requireRoleForWrites(...allowed: Role[]) {
  return requireRoleForWritesExcept([], ...allowed)
}

export function requireRoleForWritesExcept(
  exceptPaths: string[],
  ...allowed: Role[]
) {
  const guard = requireRoleExcept(exceptPaths, ...allowed)

  return async function requireRoleForWritesMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (SAFE_METHODS.includes(req.method)) {
      return next()
    }
    return guard(req, res, next)
  }
}

/**
 * Restringe SOLO ciertos verbos a ciertos roles, dejando el resto como esté.
 *
 * Existe porque "poder escribir" y "poder borrar" no son lo mismo. Recepción da
 * de alta pacientes y corrige sus datos —es su trabajo en el mostrador— pero
 * eliminar el registro de un paciente es otra cosa: puede tener órdenes médicas
 * y compras colgando, y borrarlo deja el historial clínico apuntando a alguien
 * que ya no existe. La NOM-024-SSA3-2012 §6.6.2 pide justamente que el
 * expediente no se pueda destruir sin más.
 *
 * Se monta JUNTO al guard de escritura, no en su lugar: si cualquiera de los
 * dos deniega, la petición se deniega. La regla más restrictiva gana.
 */
export function requireRoleForMethods(methods: string[], ...allowed: Role[]) {
  const verbos = new Set(methods.map((m) => m.toUpperCase()))
  const guard = requireRole(...allowed)

  return async function requireRoleForMethodsMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (!verbos.has(req.method.toUpperCase())) {
      return next()
    }
    return guard(req, res, next)
  }
}

/**
 * Cierra una ruta por completo, para cualquiera.
 *
 * Existe por `/admin/invites`. Esas rutas se declaran `AUTHENTICATE = false` y
 * reaplican la autenticación en su propio middleware — el propio Medusa lo
 * documenta como una limitación conocida de su enrutado. El efecto es que
 * nuestros guards corren ANTES de que exista `auth_context`, así que no pueden
 * distinguir quién llama.
 *
 * Dejarla abierta sería grave: una invitación permite darse de alta como
 * usuario del panel, es decir escalar privilegios. Y no la necesitamos: el alta
 * de personal se hace en `/admin/staff`, que sí está protegida.
 *
 * Ante una ruta que no podemos autorizar correctamente y que no usamos, se
 * cierra en lugar de dejarla a medias.
 */
export function blockRoute(motivo: string) {
  return function blockRouteMiddleware(
    _req: MedusaRequest,
    res: MedusaResponse,
    _next: MedusaNextFunction
  ) {
    return res.status(403).json({
      type: "not_allowed",
      message: motivo,
    })
  }
}

/**
 * Cierra la ESCRITURA de una ruta para cualquiera, dejando la lectura abierta.
 *
 * Mismo motivo que `blockRoute`: las rutas nativas de usuarios se declaran
 * `AUTHENTICATE = false` y reaplican la autenticación en su propio middleware,
 * después de nuestros guards. Ahí no podemos saber quién llama, así que un
 * guard por rol denegaría a todos —incluido el administrador— dando la
 * impresión de funcionar cuando en realidad no distingue nada.
 *
 * Se cierra la escritura de forma explícita y se dice por qué. El alta y baja
 * de personal vive en `/admin/staff`, que sí es nuestra y sí se autoriza bien.
 */
export function blockWrites(motivo: string) {
  return function blockWritesMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (SAFE_METHODS.includes(req.method)) {
      return next()
    }
    return res.status(403).json({ type: "not_allowed", message: motivo })
  }
}

/**
 * Regla global: los roles de solo lectura (Auditor / Dirección) no pueden
 * ejecutar ningún verbo que mute estado, en ninguna ruta de /admin.
 *
 * Esto sustituye al guard cosmético de la UI. Se aplica una sola vez sobre
 * `/admin/*` en lugar de repetirlo ruta por ruta, para que una ruta nueva nazca
 * protegida por omisión.
 */
export function denyReadOnlyMutations() {
  return async function denyReadOnlyMutationsMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (SAFE_METHODS.includes(req.method)) {
      return next()
    }

    const role = await resolveRequestRole(req)

    if (isReadOnly(role)) {
      return deny(
        res,
        "Tu perfil es de solo lectura: puedes consultar reportes y bitácora, pero no modificar información.",
        role
      )
    }

    return next()
  }
}

function scrubCostFields(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(scrubCostFields)
    return
  }

  if (!node || typeof node !== "object") {
    return
  }

  const record = node as Record<string, unknown>

  if (record.metadata && typeof record.metadata === "object") {
    const metadata = record.metadata as Record<string, unknown>
    for (const key of COST_METADATA_KEYS) {
      if (key in metadata) {
        delete metadata[key]
      }
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      scrubCostFields(value)
    }
  }
}

/**
 * Elimina los costos de adquisición de la respuesta para roles que no deben
 * verlos (médico, enfermería, caja).
 *
 * NOTA DE ALCANCE: `precio_compra` y `margen_automatico` viven hoy en
 * `product.metadata`, que se devuelve entero en cualquier `GET /admin/products`.
 * Esto lo filtra en la salida, que es lo que hace cumplir el requisito hoy. La
 * corrección estructural — mover el costo a su propia tabla — pertenece al paso
 * del ledger de inventario, donde además hace falta para el costo promedio.
 * El riesgo de que un rol sin acceso guarde el producto y borre el costo se
 * cierra restringiendo la escritura de /admin/products a Admin y Farmacia.
 */
export function stripPurchaseCosts() {
  return async function stripPurchaseCostsMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const role = await resolveRequestRole(req)

    if (canSeeCost(role)) {
      return next()
    }

    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => {
      try {
        scrubCostFields(body)
      } catch {
        // Si el filtrado falla, se responde error en lugar de arriesgarse a
        // devolver los costos sin filtrar.
        res.status(500)
        return originalJson({
          message: "Error al filtrar campos sensibles de la respuesta.",
        })
      }
      return originalJson(body)
    }) as typeof res.json

    return next()
  }
}

/**
 * Cierra por omisión toda ruta de /admin que NO esté en la tabla de políticas.
 *
 * ── LA PROMESA QUE NO SE CUMPLÍA ────────────────────────────────────────────
 * `api-policy.ts` dice, textualmente, que "lo que no aparece aquí queda
 * restringido a Administrador — es la omisión segura, porque una ruta nueva de
 * Medusa nace cerrada en lugar de abierta".
 *
 * No era cierto. Los guards se generaban SÓLO para las rutas listadas, así que
 * una ruta ausente no recibía ninguno: cualquier usuario autenticado podía
 * escribir en ella. La cobertura actual de la tabla es completa contra Medusa
 * v2, así que no había hueco explotable — pero la garantía no existía, y es
 * justamente la que evita que la próxima actualización del framework abra uno
 * sin que nadie se entere.
 *
 * ── DÓNDE VA ────────────────────────────────────────────────────────────────
 * Al FINAL de la cadena de `middlewares.ts`. Si una política ya se pronunció
 * sobre la ruta, esto no interviene; sólo actúa sobre lo que nadie declaró.
 *
 * Se construye desde la misma tabla, así que no introduce una segunda fuente de
 * verdad: añadir una entrada a `API_POLICIES` la saca automáticamente de aquí.
 */
export function denyUnpoliciedWrites() {
  return async function denyUnpoliciedWritesMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (SAFE_METHODS.includes(req.method)) {
      return next()
    }

    const rutaCompleta = ((req as any).originalUrl ?? req.path ?? "").split("?")[0]

    if (isPathCoveredByPolicy(rutaCompleta)) {
      return next()
    }

    const role = await resolveRequestRole(req)

    if (role === ROLES.ADMIN) {
      return next()
    }

    // Se registra: una ruta que llega hasta aquí es una que nadie declaró, y
    // conviene enterarse para decidir a quién le toca en vez de dejarla
    // cerrada por accidente para siempre.
    try {
      const logger: any = req.scope.resolve("logger")
      logger.warn(
        `[POLITICA] ${req.method} ${rutaCompleta} no está en api-policy.ts. ` +
          `Se denegó por omisión (rol: ${role ?? "sin rol"}). Si es una ruta ` +
          `legítima, declárala en la tabla con los roles que le correspondan.`
      )
    } catch {
      // El diagnóstico es opcional; la denegación no depende de él.
    }

    return deny(
      res,
      "Esta operación no tiene permisos declarados en el sistema, así que sólo " +
        "un administrador puede realizarla.",
      role
    )
  }
}

/**
 * Claves del expediente que no deben salir hacia quien no atiende al paciente.
 *
 * Se enumeran por NOMBRE, igual que en `lib/audit-redaction.ts`: es predecible
 * y se revisa de un vistazo. Si mañana se añade un campo clínico al modelo,
 * hay que añadirlo aquí — por eso conviene que las dos listas se parezcan.
 */
const CLINICAL_KEYS = [
  "medical_history",
  "historial_medico",
  "insurance_policy",
  "poliza",
  "diagnostico",
  "alergias",
]

/** Roles que pueden ver el contenido clínico de un expediente. */
const ROLES_ALLOWED_TO_SEE_CLINICAL: Role[] = [
  ROLES.ADMIN,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.PHARMACY,
  ROLES.AUDITOR,
]
// Almacén, RH y Caja quedan fuera a propósito: no atienden al paciente.

function scrubClinicalFields(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(scrubClinicalFields)
    return
  }

  if (!node || typeof node !== "object") {
    return
  }

  const record = node as Record<string, unknown>

  for (const key of CLINICAL_KEYS) {
    if (key in record) {
      delete record[key]
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      scrubClinicalFields(value)
    }
  }
}

/**
 * Retira el contenido clínico de la respuesta para quien no debe verlo.
 *
 * ── POR QUÉ NO BASTA CON CERRAR /admin/medical-customers ────────────────────
 * El expediente vive en su propio módulo, pero está ENLAZADO al paciente
 * (`links/medical-customer.ts`). Eso significa que `medical_history` sigue
 * siendo alcanzable desde `/admin/customers` pidiendo la expansión del campo,
 * sin pasar por la ruta del expediente. Restringir sólo aquella daría una falsa
 * sensación de haber cerrado el acceso.
 *
 * Es el mismo mecanismo que `stripPurchaseCosts()`, con otra lista de claves:
 * se envuelve `res.json` y se limpia la respuesta antes de enviarla.
 *
 * ── ALCANCE ─────────────────────────────────────────────────────────────────
 * Filtra la SALIDA, que es lo que hace cumplir el requisito hoy. La corrección
 * estructural —que la consulta no traiga esos campos para empezar— exige tocar
 * cómo se expanden los links, y es un cambio bastante mayor.
 */
export function stripClinicalFields() {
  return async function stripClinicalFieldsMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const role = await resolveRequestRole(req)

    if (role && ROLES_ALLOWED_TO_SEE_CLINICAL.includes(role)) {
      return next()
    }

    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => {
      try {
        scrubClinicalFields(body)
      } catch {
        // Si el filtrado falla se responde error, nunca el dato sin filtrar.
        res.status(500)
        return originalJson({
          message: "Error al filtrar campos sensibles de la respuesta.",
        })
      }
      return originalJson(body)
    }) as typeof res.json

    return next()
  }
}

/**
 * El panel de administración es sólo de Administración.
 *
 * ── DÓNDE SE CIERRA ─────────────────────────────────────────────────────────
 * El panel necesita una cookie de sesión, y esa cookie se obtiene en un solo
 * sitio: `POST /auth/session`, con el token en la cabecera. Aquí se decide.
 * Ocultar el menú con CSS —que es lo que hace `menu-policy.ts`— no es
 * seguridad; esto sí, porque sin la cookie el panel no carga nada.
 *
 * El punto de venta no usa esa cookie: entra con el token y se lo guarda. Por
 * eso cerrar esto no lo afecta.
 *
 * ── LA BANDERA ──────────────────────────────────────────────────────────────
 * Se enciende con PANEL_SOLO_ADMINISTRACION=1. Nace APAGADA a propósito:
 * Farmacia y Auditoría todavía hacen su trabajo en el panel, y cerrarlo antes
 * de que tengan su interfaz en el punto de venta las deja sin herramienta. El
 * código y su prueba existen desde ahora para que encenderlo, cuando toque,
 * sea cambiar una variable y no escribir código con prisa.
 *
 * Con la bandera apagada no hace nada.
 */
export const BANDERA_PANEL_SOLO_ADMIN = "PANEL_SOLO_ADMINISTRACION"

export function panelCerradoAOtrosRoles(): boolean {
  return process.env[BANDERA_PANEL_SOLO_ADMIN] === "1"
}

export function requirePanelRole() {
  return async function requirePanelRoleMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    if (!panelCerradoAOtrosRoles()) {
      return next()
    }

    const actor = await resolveRequestActor(req)

    if (actor?.role === ROLES.ADMIN) {
      return next()
    }

    return deny(
      res,
      "El panel de administración es sólo para Administración. " +
        "Tu trabajo está en el punto de venta.",
      actor?.role ?? null
    )
  }
}

/**
 * Una cuenta bloqueada no entra a nada, ni a leer.
 *
 * Se monta al principio de /admin/*: las lecturas están abiertas a cualquier
 * autenticado, así que sin esto una cuenta bloqueada con token vivo seguiría
 * consultando el catálogo y los pacientes hasta que el token caducara.
 */
export function denyBlockedAccounts() {
  return async function denyBlockedAccountsMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const actor = await resolveRequestActor(req)
    if (actor?.blocked) {
      return res.status(403).json({
        type: "blocked",
        message: "Esta cuenta está bloqueada. Habla con Administración.",
      })
    }
    return next()
  }
}
