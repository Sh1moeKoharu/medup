/**
 * Unidad de compra y unidad de venta.
 *
 * Se compra por caja y se vende por tableta. La existencia se lleva SIEMPRE en
 * unidades de venta, que es lo que se descuenta al cobrar y al surtir; la
 * unidad de compra y el factor se guardan en el lote para que el alta se
 * capture como viene en la factura y para que el valorizado pueda volver a
 * cajas si hace falta.
 *
 *   3 cajas × 20 tabletas por caja = 60 unidades de venta
 *
 * Con factor 1 (se compra y se vende igual) no cambia nada.
 */

export const FACTOR_POR_OMISION = 1

/** Explica por qué un factor no vale, o null si vale. */
export function revisarFactor(valor: unknown): string | null {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) {
    return `Las unidades por unidad de compra deben ser un número mayor que 0 (recibido: ${String(valor)}).`
  }
  if (!Number.isInteger(n)) {
    return "Las unidades por unidad de compra deben ser un número entero."
  }
  return null
}

/**
 * Cuántas unidades de venta son `cantidadCompra` unidades de compra.
 * Lanza si el factor o la cantidad no valen: es un error de captura, no un
 * caso a tolerar en silencio.
 */
export function unidadesDeVenta(cantidadCompra: number, factor: number = FACTOR_POR_OMISION): number {
  const problema = revisarFactor(factor)
  if (problema) throw new Error(problema)
  if (!Number.isFinite(cantidadCompra) || cantidadCompra <= 0) {
    throw new Error(`La cantidad comprada debe ser mayor que 0 (recibido: ${String(cantidadCompra)}).`)
  }
  return cantidadCompra * factor
}

/**
 * Costo por unidad de VENTA a partir del costo por unidad de COMPRA.
 * El kardex y el valorizado trabajan por unidad de venta.
 */
export function costoPorUnidadDeVenta(costoCompra: number, factor: number = FACTOR_POR_OMISION): number {
  const problema = revisarFactor(factor)
  if (problema) throw new Error(problema)
  return costoCompra / factor
}
