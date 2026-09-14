import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { nombresDeAlmacenes } from "./almacenes"
import { diasRestantes, inicioDelDia, resumirTramos, tramoDe, type LoteProximo, type ResumenTramos } from "./caducidades"
import { fetchVariantLabels } from "./variant-titles"

/**
 * Los lotes que caducan en `days` días (o ya caducaron), con existencia.
 * Una sola consulta para la pantalla, el widget y la exportación: la
 * clasificación es la de lib/caducidades.ts y no puede discrepar entre ellas.
 */
export async function lotesProximosACaducar(
  container: MedusaContainer,
  opciones: { days?: number; stock_location_id?: string | null } = {}
): Promise<{ items: LoteProximo[]; summary: ResumenTramos; horizon_days: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const days = Math.min(Number(opciones.days) || 90, 365)

  const horizon = new Date()
  horizon.setDate(horizon.getDate() + days)

  const { data: batches } = await query.graph({
    entity: "medical_batch",
    fields: ["id", "batch_number", "expiration_date", "quantity", "variant_id", "shelf_location", "status", "stock_location_id"],
    filters: {
      expiration_date: { $lte: horizon.toISOString() },
      ...(opciones.stock_location_id ? { stock_location_id: opciones.stock_location_id } : {}),
    },
  })

  const relevantes = (batches ?? []).filter((b: any) => Number(b.quantity) > 0 && b.status !== "destroyed")

  const [labels, nombres] = await Promise.all([
    fetchVariantLabels(container, relevantes.map((b: any) => b.variant_id)),
    nombresDeAlmacenes(container),
  ])

  const hoy = inicioDelDia()
  const items: LoteProximo[] = relevantes
    .map((b: any) => {
      const dias = diasRestantes(b.expiration_date, hoy)
      const label = labels.get(b.variant_id)
      return {
        batch_id: b.id,
        batch_number: b.batch_number,
        variant_id: b.variant_id,
        title: label?.label ?? b.variant_id,
        product_title: label?.product_title ?? null,
        expiration_date: b.expiration_date,
        quantity: Number(b.quantity) || 0,
        shelf_location: b.shelf_location ?? null,
        stock_location_id: b.stock_location_id ?? null,
        stock_location_name: b.stock_location_id ? nombres.get(b.stock_location_id) ?? null : null,
        status: b.status,
        days_left: dias,
        tier: tramoDe(dias),
      }
    })
    .sort((a, b) => a.days_left - b.days_left)

  return { items, summary: resumirTramos(items), horizon_days: days }
}
