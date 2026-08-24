import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  FALLBACK_ROLE_FOR_LEGACY_USERS,
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
}

type ActorAwareRequest = MedusaRequest & {
  [ACTOR_CACHE]?: RequestActor | null
  auth_context?: { actor_id?: string; actor_type?: string }
}

/**
 * Resuelve al usuario autenticado (id, correo y rol canónico).
 *
 * El rol vive en `user.metadata.role` (módulo USER), no en el JWT, así que hay
 * que ir por el usuario. El resultado se cachea en el request para no repetir
 * la consulta cuando varios guards coinciden en la misma ruta.
 *
 * Devuelve `null` si no hay sesión o si el actor no es un usuario de admin.
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

        resolved = {
          id: user.id,
          email: user.email ?? null,
          name: displayName,
          role:
            stored === undefined || stored === null || stored === ""
              ? FALLBACK_ROLE_FOR_LEGACY_USERS
              : normalizeRole(stored),
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
      return deny(res, "No se pudo determinar tu rol en el sistema.", null)
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
