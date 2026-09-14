import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MEDICAL_INVENTORY_MODULE } from "../modules/medical-inventory"
import { nombresDeAlmacenes } from "./almacenes"
import { fetchVariantLabels } from "./variant-titles"

/**
 * Existencia vendible por presentación y almacén, y su comparación contra
 * los mínimos y máximos.
 *
 * La existencia es la suma de los lotes ACTIVOS: lo que está en cuarentena
 * sigue en el anaquel pero no se puede dispensar, así que no cuenta para
 * decidir si hay que comprar.
 *
 * Lo usan la ruta `/admin/stock-policies` (para enseñarlo) y el job diario
 * `check-stock-levels` (para avisar). Una sola forma de calcularlo.
 */

export const clave = (variantId: string, stockLocationId: string) => `${variantId}|${stockLocationId}`

export type FiltroExistencia = {
  variant_id?: string | null
  stock_location_id?: string | null
}

/** Suma de lotes activos, indexada por `variante|almacén`. */
export async function existenciaActiva(
  container: MedusaContainer,
  filtro: FiltroExistencia = {}
): Promise<Map<string, number>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const filters: Record<string, any> = { status: "active" }
  if (filtro.variant_id) filters.variant_id = filtro.variant_id
  if (filtro.stock_location_id) filters.stock_location_id = filtro.stock_location_id

  const { data: lotes } = await query.graph({
    entity: "medical_batch",
    fields: ["variant_id", "stock_location_id", "quantity"],
    filters,
  })

  const suma = new Map<string, number>()
  for (const l of lotes ?? []) {
    if (!l.stock_location_id) continue
    const k = clave(l.variant_id, l.stock_location_id)
    suma.set(k, (suma.get(k) ?? 0) + (Number(l.quantity) || 0))
  }
  return suma
}

export type EstadoDePolitica = {
  id: string
  variant_id: string
  title: string
  product_title: string | null
  stock_location_id: string
  stock_location_name: string | null
  min_quantity: number
  max_quantity: number | null
  current_quantity: number
  below_min: boolean
  above_max: boolean
  /** Cuánto falta para llegar al mínimo. 0 si no falta. */
  shortage: number
}

/** Cada política con su existencia actual y si está bajo mínimo. */
export async function estadoDePoliticas(
  container: MedusaContainer,
  filtro: FiltroExistencia = {}
): Promise<EstadoDePolitica[]> {
  const service: any = container.resolve(MEDICAL_INVENTORY_MODULE)

  const filters: Record<string, any> = {}
  if (filtro.variant_id) filters.variant_id = filtro.variant_id
  if (filtro.stock_location_id) filters.stock_location_id = filtro.stock_location_id

  const politicas: any[] = await service.listStockPolicies(filters, { take: 5000 })
  if (!politicas?.length) return []

  const [existencia, nombres, etiquetas] = await Promise.all([
    existenciaActiva(container, filtro),
    nombresDeAlmacenes(container),
    fetchVariantLabels(container, politicas.map((p) => p.variant_id)),
  ])

  return politicas
    .map((p) => {
      const actual = existencia.get(clave(p.variant_id, p.stock_location_id)) ?? 0
      const min = Number(p.min_quantity) || 0
      const max = p.max_quantity === null || p.max_quantity === undefined ? null : Number(p.max_quantity)
      const etiqueta = etiquetas.get(p.variant_id)
      return {
        id: p.id,
        variant_id: p.variant_id,
        title: etiqueta?.label ?? p.variant_id,
        product_title: etiqueta?.product_title ?? null,
        stock_location_id: p.stock_location_id,
        stock_location_name: nombres.get(p.stock_location_id) ?? null,
        min_quantity: min,
        max_quantity: max,
        current_quantity: actual,
        below_min: actual < min,
        above_max: max !== null && actual > max,
        shortage: Math.max(0, min - actual),
      }
    })
    .sort((a, b) => Number(b.below_min) - Number(a.below_min) || b.shortage - a.shortage)
}
