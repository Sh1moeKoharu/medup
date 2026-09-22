import { ROLES, type Role } from "./roles"
import { instanteDeLaClinica } from "./zona-horaria"

/**
 * Notas de atención: cómo se componen y quién lee cuáles. Funciones puras.
 *
 * ── TRES TEXTOS DISTINTOS ───────────────────────────────────────────────────
 * La clínica pidió separar lo que antes iba revuelto:
 *
 *   · la NOTA DE ATENCIÓN (esta): qué revisó el médico y qué hizo, con la
 *     fecha de la atención. Va al expediente.
 *   · las NOTAS PARA ENFERMERÍA: el `notes` de la orden médica. Van a la
 *     bandeja de Enfermería.
 *   · las INDICACIONES de cada medicamento, en su renglón. Van a la receta.
 *
 * ── ENFERMERÍA NO LEE LA NOTA DEL MÉDICO ────────────────────────────────────
 * «A Enfermería sólo le debe llegar la receta, no las notas de atención.»
 * Enfermería sigue escribiendo y leyendo SUS notas (lo que aplicó y cómo
 * reaccionó el paciente); las del médico no le llegan ni en la lista, ni por
 * id, ni impresas.
 */

export const LARGO_MINIMO_NOTA = 5

export type NotaEstructurada = {
  findings?: string | null
  procedures?: string | null
  content?: string | null
}

/** El texto completo de la nota, como se imprime y como lo guardan las notas libres. */
export function componerContenido(n: NotaEstructurada): string {
  const revision = String(n.findings ?? "").trim()
  const hecho = String(n.procedures ?? "").trim()
  const libre = String(n.content ?? "").trim()
  const partes = [revision ? `Revisión: ${revision}` : "", hecho ? `Lo que se hizo: ${hecho}` : "", libre].filter(Boolean)
  return partes.join("\n\n")
}

/**
 * Por qué la nota no vale, o null. Con estructura, las dos partes; sin ella,
 * el texto libre.
 */
export function revisarNota(n: NotaEstructurada): string | null {
  const estructurada = n.findings !== undefined || n.procedures !== undefined
  if (estructurada) {
    if (String(n.findings ?? "").trim().length < LARGO_MINIMO_NOTA) return "Escribe qué revisaste (al menos cinco caracteres)."
    if (String(n.procedures ?? "").trim().length < LARGO_MINIMO_NOTA) return "Escribe qué hiciste (al menos cinco caracteres)."
    return null
  }
  if (String(n.content ?? "").trim().length < LARGO_MINIMO_NOTA) return "La nota tiene que decir algo (al menos cinco caracteres)."
  return null
}

/**
 * La fecha de la atención. Un día a secas es ese día a mediodía en la clínica
 * (así no se corre de fecha al verlo en otra zona). No se aceptan fechas
 * futuras: la nota es de algo que ya pasó.
 */
export function fechaDeAtencion(valor: unknown, ahora: Date = new Date()): { fecha: Date | null; error: string | null } {
  if (valor === undefined || valor === null || String(valor).trim() === "") return { fecha: null, error: null }
  const v = String(valor).trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? instanteDeLaClinica(v, "12:00:00") : new Date(v)
  if (Number.isNaN(d.getTime())) return { fecha: null, error: "La fecha de atención debe ir como 2026-09-14." }
  if (d.getTime() > ahora.getTime() + 24 * 3600 * 1000) return { fecha: null, error: "La fecha de atención no puede ser futura." }
  return { fecha: d, error: null }
}

/** ¿Este rol puede leer esta nota? El permiso general está en api-policy. */
export function puedeLeerNota(rol: Role | null, nota: { author_role?: string | null }): boolean {
  if (!rol) return false
  if (rol === ROLES.NURSE) return nota.author_role === ROLES.NURSE
  return ([ROLES.ADMIN, ROLES.DOCTOR, ROLES.AUDITOR] as Role[]).includes(rol)
}

/** Filtro que se añade a la consulta de notas según quién pregunta. */
export function filtroDeLectura(rol: Role | null): Record<string, unknown> {
  return rol === ROLES.NURSE ? { author_role: ROLES.NURSE } : {}
}
