import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AREAS, listarAlmacenes } from "./almacenes"

/**
 * Cuánto hay de cada presentación en Enfermería y en Farmacia.
 *
 * Lo necesitan tres pantallas que antes no lo sabían:
 *   · el catálogo del médico, para no recetar lo que no hay (punto 19);
 *   · la bandeja de Enfermería, para ver dónde está cada medicamento y pedir
 *     a Farmacia lo que falte (puntos 21 y 22);
 *   · la emisión de la receta en el servidor, que lo comprueba.
 *
 * Cuenta lo DISPONIBLE: lotes activos con existencia. Es el mismo criterio que
 * el reparto FEFO (lib/fefo.ts): un lote en cuarentena existe pero no se
 * puede aplicar ni surtir, así que no se promete.
 */

export type ExistenciaPorArea = { nursing: number; pharmacy: number }

export type LoteParaContar = {
  variant_id: string
  quantity: number | string
  status?: string | null
  stock_location_id?: string | null
}

/** Pura: suma por presentación y área. `areas` traduce almacén → área. */
export function sumarPorArea(lotes: LoteParaContar[], areas: Map<string, string | null>): Map<string, ExistenciaPorArea> {
  const salida = new Map<string, ExistenciaPorArea>()
  for (const l of lotes) {
    if (l.status && l.status !== "active") continue
    const cantidad = Number(l.quantity) || 0
    if (cantidad <= 0) continue
    const area = l.stock_location_id ? areas.get(l.stock_location_id) : null
    if (area !== AREAS.ENFERMERIA && area !== AREAS.FARMACIA) continue
    const fila = salida.get(l.variant_id) ?? { nursing: 0, pharmacy: 0 }
    if (area === AREAS.ENFERMERIA) fila.nursing += cantidad
    else fila.pharmacy += cantidad
    salida.set(l.variant_id, fila)
  }
  return salida
}

export async function existenciasPorArea(container: MedusaContainer, variantIds: string[]): Promise<Map<string, ExistenciaPorArea>> {
  const ids = [...new Set(variantIds.filter(Boolean))]
  const salida = new Map<string, ExistenciaPorArea>()
  if (!ids.length) return salida

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: lotes }, almacenes] = await Promise.all([
    query.graph({
      entity: "medical_batch",
      fields: ["variant_id", "quantity", "status", "stock_location_id"],
      filters: { variant_id: ids, status: "active" },
    }),
    listarAlmacenes(container),
  ])
  const areas = new Map<string, string | null>(almacenes.map((a) => [a.id, a.area]))
  const sumas = sumarPorArea(lotes ?? [], areas)
  for (const id of ids) salida.set(id, sumas.get(id) ?? { nursing: 0, pharmacy: 0 })
  return salida
}

/**
 * Pura: qué renglones piden más de lo que hay entre los dos almacenes.
 * Suma por presentación: dos renglones del mismo medicamento cuentan juntos.
 */
export function renglonesSinExistencia(
  renglones: { variant_id: string; quantity: number; product_title?: string | null }[],
  existencias: Map<string, ExistenciaPorArea>
): { variant_id: string; product_title: string | null; solicitado: number; disponible: number }[] {
  const pedido = new Map<string, { cantidad: number; titulo: string | null }>()
  for (const r of renglones) {
    const actual = pedido.get(r.variant_id) ?? { cantidad: 0, titulo: r.product_title ?? null }
    actual.cantidad += Number(r.quantity) || 0
    pedido.set(r.variant_id, actual)
  }
  const faltan: { variant_id: string; product_title: string | null; solicitado: number; disponible: number }[] = []
  for (const [variant_id, { cantidad, titulo }] of pedido) {
    const e = existencias.get(variant_id) ?? { nursing: 0, pharmacy: 0 }
    const disponible = e.nursing + e.pharmacy
    if (cantidad > disponible) faltan.push({ variant_id, product_title: titulo, solicitado: cantidad, disponible })
  }
  return faltan
}
