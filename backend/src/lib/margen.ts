/**
 * Margen automático: del costo al precio de venta.
 *
 * ── LO QUE HABÍA ────────────────────────────────────────────────────────────
 * `product.metadata.margen_automatico` se capturaba en el expediente del
 * medicamento y no lo leía nadie: el precio de venta se seguía escribiendo a
 * mano en la variante. El campo se llamaba "automático" y no hacía nada.
 *
 * ── LO QUE HACE AHORA ───────────────────────────────────────────────────────
 * Al dar de alta un lote con costo unitario, si el producto tiene margen, el
 * precio de venta se calcula de aquí y se escribe en la variante:
 *
 *     precio = costo × (1 + margen / 100)      redondeado a centavos
 *
 * Costo 10 y margen 30 dan 13. Sin costo, o sin margen, el precio no se toca.
 *
 * Función pura; escribir en la variante es cosa de `lib/precios.ts`.
 */

export function revisarMargen(valor: unknown): string | null {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) {
    return `El margen debe ser un porcentaje mayor o igual a 0 (recibido: ${String(valor)}).`
  }
  return null
}

/**
 * Precio de venta con margen, o null cuando falta el costo o el margen.
 * Un margen de 0 es válido: vende a costo.
 */
export function precioConMargen(costo: unknown, margen: unknown): number | null {
  const c = Number(costo)
  if (costo === null || costo === undefined || String(costo).trim() === "" || !Number.isFinite(c) || c < 0) {
    return null
  }
  if (margen === null || margen === undefined || String(margen).trim() === "") {
    return null
  }
  const m = Number(margen)
  if (!Number.isFinite(m) || m < 0) return null

  // Redondeo a centavos con corrección del error binario (1.005 → 1.01).
  return Math.round((c * (1 + m / 100) + Number.EPSILON) * 100) / 100
}
