/**
 * Redacción de datos sensibles antes de escribirlos en la bitácora.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * El interceptor de auditoría guardaba `req.body` completo enmascarando sólo
 * `password`. Comprobado en una prueba real: al emitir una orden médica quedó
 * almacenado en `audit_log.payload`, en texto plano,
 *
 *   {"notes":"Paciente diabético tipo 2, alergia a penicilina",
 *    "items":[{"instructions":"1 tableta cada 12 horas con alimentos"}]}
 *
 * Diagnóstico, alergia y posología duplicados en una tabla secundaria. Bajo la
 * LFPDPPP son datos personales SENSIBLES, y §6.6.1 de la NOM-024-SSA3-2012 pide
 * confidencialidad además de trazabilidad.
 *
 * ── EL CRITERIO ─────────────────────────────────────────────────────────────
 * La bitácora debe registrar QUÉ pasó, QUIÉN lo hizo y SOBRE QUÉ recurso — no
 * conservar una copia del contenido clínico. El sistema de registro es la tabla
 * de dominio, no la bitácora.
 *
 * La propuesta pide "datos anteriores y nuevos". Eso se conserva para los
 * campos operativos (precios, cantidades, estados), que es donde la auditoría
 * realmente sirve; el contenido clínico se sustituye por un marcador que deja
 * ver QUE el campo cambió sin exponer su contenido.
 *
 * Se redacta por NOMBRE DE CLAVE, no por valor: es predecible y auditable.
 */

/** Marcador que sustituye al valor. Deja constancia de que el campo venía. */
export const REDACTED = "[REDACTADO]"

/**
 * Credenciales y secretos. Se redactan SIEMPRE, en cualquier ruta.
 * Comparación en minúsculas y por coincidencia parcial.
 */
const ALWAYS_SENSITIVE_KEYS = [
  "password",
  "contrasena",
  "contraseña",
  "token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "refresh_token",
  "client_secret",
]

/**
 * Datos personales sensibles o identificadores que no deben duplicarse en la
 * bitácora bajo ninguna ruta.
 */
const ALWAYS_PERSONAL_KEYS = [
  "medical_history",
  "historial_medico",
  "curp",
  "insurance_policy",
  "poliza",
  "diagnostico",
  "diagnosis",
  "alergia",
  "allergy",
  "padecimiento",
  "tratamiento",
]

/**
 * Claves sensibles SÓLO en contexto clínico.
 *
 * `notes` es el caso claro: en una orden médica lleva el cuadro del paciente,
 * pero en un corte de caja lleva "faltaron $50" y en un convenio lleva
 * condiciones comerciales. Redactarlas todas destruiría auditoría útil sin
 * ganar privacidad, así que se redactan sólo donde el contexto lo amerita.
 */
const CLINICAL_CONTEXT_KEYS = ["notes", "notas", "instructions", "indicaciones"]

/** Rutas cuyo cuerpo puede contener información clínica. */
const CLINICAL_ROUTES = ["/admin/medical-orders", "/admin/medical-customers"]

/** Tope de tamaño del payload almacenado, para que no crezca sin control. */
const MAX_PAYLOAD_CHARS = 8000

function matchesAny(key: string, patterns: string[]): boolean {
  const k = key.toLowerCase()
  return patterns.some((p) => k.includes(p))
}

export function isClinicalRoute(endpoint: string): boolean {
  return CLINICAL_ROUTES.some((route) => endpoint.startsWith(route))
}

function redactValue(value: unknown, clinical: boolean, depth: number): unknown {
  // Tope de profundidad: evita recursión infinita ante referencias cíclicas.
  if (depth > 8) {
    return REDACTED
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, clinical, depth + 1))
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const out: Record<string, unknown> = {}

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const sensitive =
      matchesAny(key, ALWAYS_SENSITIVE_KEYS) ||
      matchesAny(key, ALWAYS_PERSONAL_KEYS) ||
      (clinical && matchesAny(key, CLINICAL_CONTEXT_KEYS))

    out[key] = sensitive ? REDACTED : redactValue(val, clinical, depth + 1)
  }

  return out
}

/**
 * Devuelve una copia del cuerpo apta para almacenarse en la bitácora.
 *
 * @param body     Cuerpo de la petición.
 * @param endpoint Ruta, para decidir si aplica el contexto clínico.
 */
export function redactForAudit(body: unknown, endpoint: string): unknown {
  if (body === null || body === undefined) {
    return null
  }

  const clinical = isClinicalRoute(endpoint)

  let redacted: unknown
  try {
    redacted = redactValue(body, clinical, 0)
  } catch {
    // Si la redacción falla se guarda un marcador, nunca el original: es
    // preferible perder detalle de auditoría que filtrar un dato sensible.
    return { _error: "No se pudo redactar el cuerpo; se omitió por seguridad." }
  }

  // Recorte por tamaño. Se conserva constancia del recorte.
  const serialized = JSON.stringify(redacted)
  if (serialized && serialized.length > MAX_PAYLOAD_CHARS) {
    return {
      _truncated: true,
      _original_size: serialized.length,
      _preview: serialized.slice(0, MAX_PAYLOAD_CHARS),
    }
  }

  return redacted
}
