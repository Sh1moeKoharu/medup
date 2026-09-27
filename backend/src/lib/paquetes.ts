import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  addDraftOrderItemsWorkflow,
  beginDraftOrderEditWorkflow,
  cancelDraftOrderEditWorkflow,
  confirmDraftOrderEditWorkflow,
  getOrderDetailWorkflow,
  updateDraftOrderItemWorkflow,
} from "@medusajs/medusa/core-flows"
import { PAQUETES_MODULE } from "../modules/paquetes"
import { CLAVE_CONSULTA, varianteDeConsulta } from "./consulta"

/**
 * Paquetes: varios productos a precio cerrado, por especialista.
 *
 * ── CÓMO ENTRA AL CARRITO ───────────────────────────────────────────────────
 * No hay un "producto paquete". El paquete se despliega en sus renglones
 * reales —cada medicamento, cada insumo, la consulta si la incluye— con el
 * precio del paquete PRORRATEADO entre ellos según su precio de lista. Así
 * el inventario se descuenta renglón por renglón, la aseguranza descuenta
 * sólo a los medicamentos del paquete y el ticket enseña qué llevó.
 *
 * Los renglones llevan la marca del paquete en `metadata`; el punto de venta
 * no deja editarlos sueltos (ni cantidad ni precio): se quita el paquete
 * entero o nada.
 *
 * Funciones puras arriba; lo que toca la base, abajo.
 */

export const CLAVE_PAQUETE_ID = "altus_paquete_id"
export const CLAVE_PAQUETE = "altus_paquete"

export type RenglonDePaquete = { variant_id: string; product_title?: string | null; quantity: number }

export type Paquete = {
  id: string
  name: string
  specialist_id?: string | null
  specialist_name?: string | null
  items: RenglonDePaquete[]
  includes_consultation: boolean
  price: number
  status: "active" | "inactive" | string
  valid_from?: Date | string | null
  valid_until?: Date | string | null
}

/** Por qué el paquete no vale, o null. */
export function revisarPaquete(p: { name?: unknown; price?: unknown; items?: unknown; includes_consultation?: unknown }): string | null {
  if (String(p.name ?? "").trim().length < 2) return "El nombre del paquete es obligatorio."
  const precio = Number(p.price)
  if (!Number.isFinite(precio) || precio <= 0) return "El precio del paquete debe ser mayor que cero."
  const items = Array.isArray(p.items) ? p.items : []
  for (const r of items) {
    if (!String((r as any)?.variant_id ?? "").trim()) return "Cada renglón del paquete lleva un producto."
    const q = Number((r as any)?.quantity)
    if (!Number.isInteger(q) || q <= 0) return "La cantidad de cada renglón es un entero mayor que cero."
  }
  if (!items.length && !p.includes_consultation) return "Un paquete lleva al menos un producto o la consulta."
  return null
}

export function vigente(p: Paquete, ahora: Date = new Date()): boolean {
  if (p.status !== "active") return false
  const t = ahora.getTime()
  if (p.valid_from && new Date(p.valid_from).getTime() > t) return false
  if (p.valid_until && new Date(p.valid_until).getTime() < t) return false
  return true
}

const centavos = (n: number) => Math.round(n * 100) / 100

/**
 * Reparte el precio cerrado entre los renglones en proporción a su precio de
 * lista (precio × cantidad). Sin precios de lista, a partes iguales. Devuelve
 * el precio unitario de cada renglón, a centavos; la diferencia por redondeo
 * cae en un renglón de cantidad 1 si lo hay, para que la suma sea exacta.
 */
export function prorratear(precio: number, renglones: { variant_id: string; quantity: number; referencia: number }[]): { variant_id: string; quantity: number; unit_price: number }[] {
  if (!renglones.length) return []
  const pesos = renglones.map((r) => Math.max(0, Number(r.referencia) || 0) * r.quantity)
  const total = pesos.reduce((s, p) => s + p, 0)
  const partes = renglones.map((r, i) => (total > 0 ? (precio * pesos[i]) / total : precio / renglones.length))
  const salida = renglones.map((r, i) => ({ variant_id: r.variant_id, quantity: r.quantity, unit_price: centavos(partes[i] / r.quantity) }))
  const suma = salida.reduce((s, r) => s + r.unit_price * r.quantity, 0)
  const diferencia = centavos(precio - suma)
  if (diferencia !== 0) {
    const ajustable = salida.find((r) => r.quantity === 1) ?? salida[salida.length - 1]
    ajustable.unit_price = centavos(ajustable.unit_price + diferencia / ajustable.quantity)
  }
  return salida
}

// ─── Lo que toca la base ───────────────────────────────────────────────────

/** Precio de lista (mxn) de cada presentación, para prorratear. */
async function preciosDeLista(container: MedusaContainer, variantIds: string[]): Promise<Record<string, number>> {
  if (!variantIds.length) return {}
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product_variant", fields: ["id", "prices.amount", "prices.currency_code"], filters: { id: variantIds } })
  const salida: Record<string, number> = {}
  for (const v of (data ?? []) as any[]) {
    const p = (v.prices ?? []).find((x: any) => x.currency_code === "mxn") ?? (v.prices ?? [])[0]
    salida[v.id] = Number(p?.amount) || 0
  }
  return salida
}

async function renglonesDelPedido(container: MedusaContainer, orderId: string): Promise<{ status: string; items: any[] } | null> {
  try {
    const { result } = await getOrderDetailWorkflow(container).run({ input: { order_id: orderId, fields: ["id", "status", "items.*", "items.metadata"] } })
    return result ? { status: result.status, items: (result as any).items ?? [] } : null
  } catch {
    return null
  }
}

async function enEdicion(container: MedusaContainer, orderId: string, trabajo: () => Promise<void>): Promise<void> {
  let abiertaAqui = true
  try {
    await beginDraftOrderEditWorkflow(container).run({ input: { order_id: orderId } })
  } catch {
    abiertaAqui = false
  }
  try {
    await trabajo()
    await confirmDraftOrderEditWorkflow(container).run({ input: { order_id: orderId, confirmed_by: "system" } })
  } catch (e) {
    if (abiertaAqui) {
      try {
        await cancelDraftOrderEditWorkflow(container).run({ input: { order_id: orderId } })
      } catch {
        // el error original es el que importa
      }
    }
    throw e
  }
}

/** Añade el paquete entero al pedido en borrador. Un paquete sólo entra una vez por pedido. */
export async function agregarPaquete(container: MedusaContainer, orderId: string, paquete: Paquete): Promise<{ renglones: number }> {
  const pedido = await renglonesDelPedido(container, orderId)
  if (!pedido) throw new Error("No se encontró el pedido.")
  if (pedido.status !== "draft") throw new Error("El pedido ya se cobró.")
  if (pedido.items.some((i) => i.metadata?.[CLAVE_PAQUETE_ID] === paquete.id)) {
    throw new Error(`El paquete «${paquete.name}» ya está en el carrito.`)
  }

  const consulta = paquete.includes_consultation ? await varianteDeConsulta(container) : null
  if (paquete.includes_consultation && !consulta) {
    throw new Error("El paquete incluye consulta pero el producto Consulta no está dado de alta (scripts/preparar-consulta.ts).")
  }
  const renglones: { variant_id: string; quantity: number; referencia: number; metadata: Record<string, unknown> }[] = []
  const precios = await preciosDeLista(container, [...paquete.items.map((r) => r.variant_id), ...(consulta ? [consulta.variant_id] : [])])
  for (const r of paquete.items) {
    renglones.push({ variant_id: r.variant_id, quantity: Number(r.quantity), referencia: precios[r.variant_id] ?? 0, metadata: {} })
  }
  if (consulta) {
    // La consulta va a precio del paquete (prorrateado con su precio de
    // referencia), no variable: Caja no la edita suelta.
    renglones.push({ variant_id: consulta.variant_id, quantity: 1, referencia: precios[consulta.variant_id] ?? 0, metadata: { [CLAVE_CONSULTA]: true, altus_medico: paquete.specialist_name ?? null } })
  }
  const repartidos = prorratear(Number(paquete.price), renglones)
  const marca = { [CLAVE_PAQUETE_ID]: paquete.id, [CLAVE_PAQUETE]: paquete.name }

  await enEdicion(container, orderId, async () => {
    await addDraftOrderItemsWorkflow(container).run({
      input: {
        order_id: orderId,
        items: repartidos.map((r, i) => ({ variant_id: r.variant_id, quantity: r.quantity, unit_price: r.unit_price, metadata: { ...marca, ...renglones[i].metadata } })),
      },
    })
  })
  return { renglones: repartidos.length }
}

/** Quita del pedido todos los renglones de ese paquete. */
export async function quitarPaquete(container: MedusaContainer, orderId: string, packageId: string): Promise<{ renglones: number }> {
  const pedido = await renglonesDelPedido(container, orderId)
  if (!pedido) throw new Error("No se encontró el pedido.")
  if (pedido.status !== "draft") throw new Error("El pedido ya se cobró.")
  const suyos = pedido.items.filter((i) => i.metadata?.[CLAVE_PAQUETE_ID] === packageId)
  if (!suyos.length) return { renglones: 0 }
  await enEdicion(container, orderId, async () => {
    await updateDraftOrderItemWorkflow(container).run({
      input: { order_id: orderId, items: suyos.map((i) => ({ id: i.id, quantity: 0 })) },
    })
  })
  return { renglones: suyos.length }
}

export async function paquetePorId(container: MedusaContainer, id: string): Promise<Paquete | null> {
  const service: any = container.resolve(PAQUETES_MODULE)
  const [p] = await service.listAltusPackages({ id })
  return p ?? null
}
