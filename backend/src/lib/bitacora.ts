import { normalizeRole } from "./roles"
import { aIdentificador } from "./usuarios"
import { normalizarNumeroDeEmpleado } from "./personal"

/**
 * Consultar la bitácora: qué filtros admite y qué lecturas se registran.
 *
 * ── FILTROS ─────────────────────────────────────────────────────────────────
 * `GET /admin/audit-logs` aceptaba cualquier cosa y devolvía siempre los
 * últimos 100. El comentario de la ruta afirmaba "permitimos buscar/filtrar
 * por action, email, etc." y no era cierto. Aquí está la traducción de la
 * consulta a filtros del módulo, en una función pura para poder probarla.
 *
 * ── LECTURAS SENSIBLES ──────────────────────────────────────────────────────
 * Sólo se registraban escrituras. Quién MIRÓ un expediente no quedaba en
 * ningún lado, y es exactamente la pregunta que hace un auditor. Se registra
 * una lista corta de lecturas —la ficha de un paciente, el expediente, las
 * notas de atención— y no todas las consultas: registrar cada GET engordaría
 * la bitácora sin decir nada útil.
 */

export const LIMITE_POR_OMISION = 50
export const LIMITE_MAXIMO = 200

export type ConsultaBitacora = {
  from?: string
  to?: string
  user_role?: string
  user_email?: string
  employee_number?: string
  method?: string
  endpoint?: string
  limit?: string | number
  offset?: string | number
}

export type FiltrosBitacora = {
  filters: Record<string, any>
  take: number
  skip: number
  /** Lo que se rechazó de la consulta, para responder 400. */
  error: string | null
}

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

function fecha(valor: string | undefined, finDeDia: boolean): string | null | undefined {
  if (!valor) return undefined
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  // Un día a secas ("2026-09-10") cubre el día entero.
  if (finDeDia && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    d.setUTCHours(23, 59, 59, 999)
  }
  return d.toISOString()
}

export function filtrosDeBitacora(q: ConsultaBitacora): FiltrosBitacora {
  const filters: Record<string, any> = {}

  const desde = fecha(q.from, false)
  const hasta = fecha(q.to, true)
  if (desde === null || hasta === null) {
    return { filters, take: LIMITE_POR_OMISION, skip: 0, error: "Las fechas deben ir como 2026-09-10 o en formato ISO." }
  }
  if (desde || hasta) {
    filters.created_at = {}
    if (desde) filters.created_at.$gte = desde
    if (hasta) filters.created_at.$lte = hasta
  }

  if (q.user_role) {
    const rol = normalizeRole(q.user_role)
    if (!rol) {
      return { filters, take: LIMITE_POR_OMISION, skip: 0, error: `Rol desconocido: "${q.user_role}".` }
    }
    filters.user_role = rol
  }

  if (q.user_email) {
    // Se acepta el usuario a secas ("caja") o el identificador completo.
    filters.user_email = aIdentificador(String(q.user_email).trim().toLowerCase())
  }

  if (q.employee_number) {
    filters.user_employee_number = normalizarNumeroDeEmpleado(q.employee_number)
  }

  if (q.method) {
    const m = String(q.method).toUpperCase()
    if (!METODOS.includes(m)) {
      return { filters, take: LIMITE_POR_OMISION, skip: 0, error: `Método desconocido: "${q.method}".` }
    }
    filters.method = m
  }

  if (q.endpoint) {
    // Por prefijo: "/admin/staff" trae también "/admin/staff/user_1".
    filters.endpoint = { $like: `${String(q.endpoint).trim()}%` }
  }

  const limite = Number(q.limit)
  const take = Number.isInteger(limite) && limite > 0 ? Math.min(limite, LIMITE_MAXIMO) : LIMITE_POR_OMISION
  const salto = Number(q.offset)
  const skip = Number.isInteger(salto) && salto > 0 ? salto : 0

  return { filters, take, skip, error: null }
}

/**
 * Lecturas que SÍ se registran. Prefijos; el resto de los GET no se anota.
 *
 *   · la ficha de un paciente concreto (no la lista: la lista es el buscador
 *     del mostrador y se consulta cien veces al día)
 *   · el expediente clínico
 *   · las notas de atención, en pantalla o impresas
 */
export const LECTURAS_SENSIBLES: RegExp[] = [
  /^\/admin\/customers\/[^/?]+/,
  /^\/admin\/medical-customers(\/|\?|$)/,
  /^\/admin\/clinical-notes(\/|\?|$)/,
  /^\/admin\/documents\/nota\//,
]

export function esLecturaSensible(method: string, url: string): boolean {
  if (method !== "GET") return false
  const ruta = String(url ?? "")
  return LECTURAS_SENSIBLES.some((p) => p.test(ruta))
}
