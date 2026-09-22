/**
 * Reglas de los renglones de una receta. Funciones puras.
 */

export const LARGO_MINIMO_INDICACIONES = 3

type Renglon = { variant_id?: unknown; quantity?: unknown; instructions?: unknown }

/**
 * Por qué los renglones no valen, o null.
 *
 * `exigirIndicaciones`: lo que receta el médico no puede ir sin indicaciones
 * (cómo y cada cuánto). El material que añade Enfermería al aplicar —guantes,
 * jeringas— no las lleva, así que la regla es del médico.
 */
export function revisarRenglonesDeReceta(renglones: Renglon[], opciones: { exigirIndicaciones: boolean }): string | null {
  for (const [i, r] of renglones.entries()) {
    const n = i + 1
    if (!r || typeof r.variant_id !== "string" || !r.variant_id) {
      return `El renglón ${n} no dice qué medicamento es.`
    }
    const cantidad = Number(r.quantity)
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return `El renglón ${n} necesita una cantidad entera de al menos 1.`
    }
    if (opciones.exigirIndicaciones && String(r.instructions ?? "").trim().length < LARGO_MINIMO_INDICACIONES) {
      return `El renglón ${n} no tiene indicaciones. Escribe cómo y cada cuánto se toma o se aplica.`
    }
  }
  return null
}
