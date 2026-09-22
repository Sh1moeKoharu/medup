import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fetchVariantLabels } from "./variant-titles"

/**
 * Inventario actual valorizado. Lo usan la pantalla de existencias
 * (`GET /admin/inventory-reports/valuation`) y el reporte «inventario».
 *
 * El costo unitario NO se lee de `product.metadata.precio_compra` (un único
 * valor que se sobrescribe con cada compra y no refleja lo que realmente se
 * pagó). Se calcula como PROMEDIO PONDERADO sobre las entradas asentadas en el
 * libro mayor:
 *
 *     costo_promedio = Σ(unidades_entrada × costo_unitario) / Σ(unidades_entrada)
 *
 * El promedio se calcula con las entradas del MISMO almacén que se valoriza:
 * lo que costó lo que hay ahí.
 */

export type RenglonValorizado = {
  variant_id: string
  title: string
  stock_location_id: string | null
  units: number
  batches: number
  quarantined_units: number
  average_unit_cost: number | null
  total_value: number | null
  valued: boolean
}

export type ResumenValorizado = {
  total_units: number
  total_batches: number
  total_value: number | null
  valued_variants: number
  unvalued_variants: number
}

export async function valorizarInventario(
  container: MedusaContainer,
  opciones: { stock_location_id?: string | null; include_quarantined?: boolean; por_almacen?: boolean } = {}
): Promise<{ items: RenglonValorizado[]; summary: ResumenValorizado }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const stockLocationId = String(opciones.stock_location_id ?? "").trim()
  const filtro = stockLocationId ? { stock_location_id: stockLocationId } : {}
  // Con todos los almacenes, por omisión se suman; el reporte los separa.
  const separar = !!opciones.por_almacen

  const { data: batches } = await query.graph({
    entity: "medical_batch",
    fields: ["id", "batch_number", "variant_id", "quantity", "status", "expiration_date", "stock_location_id"],
    filters: filtro,
  })

  const { data: movements } = await query.graph({
    entity: "inventory_movement",
    fields: ["variant_id", "quantity_delta", "unit_cost", "type", "stock_location_id"],
    filters: filtro,
  })

  const claveDe = (variantId: string, almacen: string | null | undefined) => (separar ? `${almacen ?? ""}|${variantId}` : variantId)

  // ── Costo promedio ponderado ──────────────────────────────────────────────
  const costos = new Map<string, { units: number; value: number }>()
  for (const m of movements || []) {
    const cost = m.unit_cost
    const delta = Number(m.quantity_delta) || 0
    // Sólo entradas con costo conocido alimentan el promedio.
    if (cost === null || cost === undefined || delta <= 0) continue
    const k = claveDe(m.variant_id, m.stock_location_id)
    const acc = costos.get(k) ?? { units: 0, value: 0 }
    acc.units += delta
    acc.value += delta * Number(cost)
    costos.set(k, acc)
  }
  const promedio = (k: string): number | null => {
    const acc = costos.get(k)
    return !acc || acc.units <= 0 ? null : acc.value / acc.units
  }

  // ── Existencias ───────────────────────────────────────────────────────────
  const filas = new Map<string, Omit<RenglonValorizado, "title" | "average_unit_cost" | "total_value" | "valued">>()
  for (const b of batches || []) {
    if (b.status === "destroyed") continue
    if (b.status === "quarantined" && !opciones.include_quarantined) continue
    const units = Number(b.quantity) || 0
    if (units <= 0) continue

    const k = claveDe(b.variant_id, b.stock_location_id)
    const row = filas.get(k) ?? {
      variant_id: b.variant_id,
      stock_location_id: separar ? b.stock_location_id ?? null : stockLocationId || null,
      units: 0,
      batches: 0,
      quarantined_units: 0,
    }
    row.units += units
    row.batches += 1
    if (b.status === "quarantined") row.quarantined_units += units
    filas.set(k, row)
  }

  const labels = await fetchVariantLabels(container, [...filas.values()].map((r) => r.variant_id))

  const items: RenglonValorizado[] = [...filas.entries()]
    .map(([k, row]) => {
      const avg = promedio(k)
      return {
        ...row,
        title: labels.get(row.variant_id)?.label ?? row.variant_id,
        average_unit_cost: avg === null ? null : Number(avg.toFixed(4)),
        total_value: avg === null ? null : Number((avg * row.units).toFixed(2)),
        /** Sin costo asentado no se puede valorizar: se reporta aparte. */
        valued: avg !== null,
      }
    })
    .sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0))

  const summary = items.reduce<ResumenValorizado>(
    (acc, i) => {
      acc.total_units += i.units
      acc.total_batches += i.batches
      if (i.valued) {
        acc.total_value = (acc.total_value ?? 0) + (i.total_value ?? 0)
        acc.valued_variants += 1
      } else {
        acc.unvalued_variants += 1
      }
      return acc
    },
    { total_units: 0, total_batches: 0, total_value: 0, valued_variants: 0, unvalued_variants: 0 }
  )
  summary.total_value = Number((summary.total_value ?? 0).toFixed(2))

  return { items, summary }
}

/** Quita los costos para quien no debe verlos, y ordena por nombre para no delatarlos. */
export function sinCostos(r: { items: RenglonValorizado[]; summary: ResumenValorizado }): { items: RenglonValorizado[]; summary: ResumenValorizado } {
  return {
    items: r.items
      .map((i) => ({ ...i, average_unit_cost: null, total_value: null }))
      .sort((a, b) => a.title.localeCompare(b.title, "es")),
    summary: { ...r.summary, total_value: null },
  }
}

/**
 * Costo promedio de una presentación en un almacén, o null si no hay compras
 * con costo. Lo usa el traspaso para que lo que entra a Enfermería llegue con
 * su costo: sin él, Enfermería tenía existencia pero valía $0.
 */
export async function costoPromedio(container: MedusaContainer, variantId: string, stockLocationId: string): Promise<number | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "inventory_movement",
    fields: ["quantity_delta", "unit_cost"],
    filters: { variant_id: variantId, stock_location_id: stockLocationId },
  })
  let unidades = 0
  let valor = 0
  for (const m of data ?? []) {
    const delta = Number(m.quantity_delta) || 0
    if (m.unit_cost === null || m.unit_cost === undefined || delta <= 0) continue
    unidades += delta
    valor += delta * Number(m.unit_cost)
  }
  return unidades > 0 ? Number((valor / unidades).toFixed(4)) : null
}
