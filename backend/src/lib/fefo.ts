import { MedusaContainer } from "@medusajs/framework/types"
import { MEDICAL_INVENTORY_MODULE } from "../modules/medical-inventory"

/**
 * FEFO — First Expire, First Out. Punto ÚNICO de selección de lotes.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * La misma lógica estaba escrita DOS veces: en el subscriber que descuenta al
 * vender (`subscribers/fefo-batch-deduction.ts`) y en la ruta que surte órdenes
 * médicas (`api/admin/medical-orders/[id]/dispense`).
 *
 * Y ya habían divergido. La copia del subscriber filtraba `quantity > 0`; la de
 * dispensación no, y en su lugar calculaba el disponible restando una reserva.
 * Dos criterios distintos para decidir de qué lote sale un medicamento es
 * exactamente el tipo de diferencia que nadie nota hasta que el inventario no
 * cuadra y no hay forma de saber cuál de las dos tenía razón.
 *
 * ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
 * PLANIFICA, no escribe. Devuelve de qué lotes hay que sacar y cuánto de cada
 * uno; quien llama decide si aplica el plan y es responsable de asentar el
 * movimiento en el libro mayor (`lib/inventory-ledger.ts`).
 *
 * Separarlo así permite algo que antes no se podía: comprobar ANTES de tocar
 * nada si hay existencia suficiente, y abortar la operación entera en lugar de
 * dejarla a medias.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * Sólo lotes `active`. Un lote en cuarentena tiene existencia física pero está
 * bloqueado: prometerlo sería prometer algo que no se puede dispensar. Uno
 * `destroyed` ya salió del inventario.
 *
 * Entre los activos, sale primero el que caduca antes. Es lo que evita que un
 * lote próximo a vencer se quede en el anaquel mientras se vende uno nuevo.
 *
 * ── Y SÓLO DEL ALMACÉN QUE TOCA ─────────────────────────────────────────────
 * Desde que hay dos almacenes, el reparto es POR ALMACÉN: una venta del
 * mostrador sale de Farmacia y no toca lo que está en Enfermería aunque allí
 * haya existencia. Un lote sin almacén (no debería existir; ver la migración)
 * no se reparte nunca: nadie sabe dónde está físicamente.
 */

/** Lo mínimo que se necesita de un lote para repartir. */
export type LoteFefo = {
  id: string
  batch_number: string | null
  quantity: number
  expiration_date: Date | string
  variant_id: string
  stock_location_id: string | null
  status?: string
}

export type AsignacionFefo = {
  lote: LoteFefo
  /** Unidades a tomar de este lote. Siempre > 0. */
  cantidad: number
  /** Saldo del lote DESPUÉS de aplicar el plan. */
  saldoResultante: number
}

export type PlanFefo = {
  asignaciones: AsignacionFefo[]
  /** Unidades que NO se pudieron cubrir. 0 si alcanzó. */
  faltante: number
  /** Atajo legible: `faltante === 0`. */
  alcanza: boolean
  /** De qué almacén se planificó. */
  stock_location_id: string
}

/**
 * La regla entera, sin base de datos: reparte `cantidad` entre los lotes
 * ACTIVOS de ESE almacén, del que caduca antes al que caduca después.
 *
 * Se filtra aquí y no en la consulta para que el criterio viva en un solo
 * sitio, sea el mismo para todos los llamadores, y se pueda probar sin
 * levantar nada.
 */
export function repartirFefo(
  lotes: LoteFefo[],
  cantidad: number,
  stockLocationId: string
): PlanFefo {
  if (!stockLocationId || !Number.isFinite(cantidad) || cantidad <= 0) {
    return {
      asignaciones: [],
      faltante: Math.max(0, cantidad || 0),
      alcanza: cantidad <= 0,
      stock_location_id: stockLocationId,
    }
  }

  const disponibles = (lotes ?? [])
    .filter(
      (l) =>
        l.stock_location_id === stockLocationId &&
        (l.status === undefined || l.status === "active") &&
        Number(l.quantity) > 0
    )
    .sort(
      (a, b) =>
        new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
    )

  const asignaciones: AsignacionFefo[] = []
  let porCubrir = cantidad

  for (const lote of disponibles) {
    if (porCubrir <= 0) break

    const toma = Math.min(Number(lote.quantity), porCubrir)
    porCubrir -= toma

    asignaciones.push({
      lote,
      cantidad: toma,
      saldoResultante: Number(lote.quantity) - toma,
    })
  }

  return {
    asignaciones,
    faltante: porCubrir,
    alcanza: porCubrir === 0,
    stock_location_id: stockLocationId,
  }
}

/**
 * Reparte `cantidad` unidades de una variante entre sus lotes activos de un
 * almacén, del que caduca antes al que caduca después.
 *
 * No escribe nada. Si no hay existencia suficiente lo dice en `faltante` en vez
 * de lanzar: quien llama decide si eso es un error (dispensar) o un aviso
 * (venta ya cobrada, donde la orden existe y hay que registrar lo que se pueda).
 *
 * El almacén es obligatorio. Quien no sepa cuál es, que pregunte a
 * `lib/almacenes.ts` antes de llamar.
 */
export async function planificarFefo(
  container: MedusaContainer,
  variantId: string,
  cantidad: number,
  stockLocationId: string
): Promise<PlanFefo> {
  if (!variantId || !stockLocationId || !Number.isFinite(cantidad) || cantidad <= 0) {
    return repartirFefo([], cantidad, stockLocationId)
  }

  const service: any = container.resolve(MEDICAL_INVENTORY_MODULE)

  const lotes: LoteFefo[] = await service.listMedicalBatches({
    variant_id: variantId,
    status: "active",
    stock_location_id: stockLocationId,
  })

  return repartirFefo(lotes ?? [], cantidad, stockLocationId)
}

/**
 * Aplica un plan: descuenta cada lote. NO asienta en el libro mayor — eso lo
 * hace quien llama, porque sólo él sabe el tipo de movimiento, el motivo y la
 * referencia (`exit_sale` por venta, por dispensación, etc.).
 *
 * Devuelve las asignaciones aplicadas, para que el llamador las recorra al
 * asentar sin volver a calcular nada.
 */
export async function aplicarFefo(
  container: MedusaContainer,
  plan: PlanFefo
): Promise<AsignacionFefo[]> {
  const service: any = container.resolve(MEDICAL_INVENTORY_MODULE)

  for (const a of plan.asignaciones) {
    await service.updateMedicalBatches({
      id: a.lote.id,
      quantity: a.saldoResultante,
    })
  }

  return plan.asignaciones
}
