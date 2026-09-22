import { ROLES, type Role } from "./roles"

/**
 * Quitar o reducir lo que recetó el médico. Funciones puras.
 *
 * Regla de la clínica: si Enfermería o Farmacia quitan un producto de la
 * receta, o bajan su cantidad, queda registro auditable con el motivo, de al
 * menos 20 caracteres. «Ya no», «error» o una fila de puntos no explican nada
 * a quien revise después; 20 caracteres obligan a una frase.
 *
 * El médico y Administración ajustan sin motivo obligatorio (el médico corrige
 * su propia receta), pero su ajuste también queda registrado.
 */

export const LARGO_MINIMO_MOTIVO = 20

/** Quién necesita motivo para reducir. */
export const ROLES_CON_MOTIVO: Role[] = [ROLES.NURSE, ROLES.PHARMACY]

/** El motivo tal como se guarda: sin espacios de más. */
export function limpiarMotivo(valor: unknown): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim()
}

export type CambioDeRenglon = {
  variant_id: string
  antes: number
  despues: number
}

/** ¿Este cambio quita o reduce? */
export const reduce = (c: CambioDeRenglon) => c.despues < c.antes

/**
 * Por qué no se acepta el ajuste, o null.
 *
 *   · Enfermería y Farmacia: motivo de 20+ caracteres si algo baja.
 *   · Farmacia: sólo reduce o quita; no añade ni aumenta (surte lo recetado).
 */
export function revisarAjuste(rol: Role | null, cambios: CambioDeRenglon[], motivo: unknown): string | null {
  if (rol === ROLES.PHARMACY && cambios.some((c) => c.despues > c.antes)) {
    return "Farmacia sólo puede quitar o reducir renglones de una receta, no añadir."
  }
  const necesitaMotivo = !!rol && ROLES_CON_MOTIVO.includes(rol) && cambios.some(reduce)
  if (necesitaMotivo && limpiarMotivo(motivo).length < LARGO_MINIMO_MOTIVO) {
    return `Explica por qué se quita o se reduce (al menos ${LARGO_MINIMO_MOTIVO} caracteres). Queda en el registro de la receta.`
  }
  return null
}
