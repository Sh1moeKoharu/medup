import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, OrderStatus } from "@medusajs/framework/utils"
import {
  addDraftOrderItemsWorkflow,
  beginDraftOrderEditWorkflow,
  confirmDraftOrderEditWorkflow,
  createOrderWorkflow,
  getOrderDetailWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * La CUENTA del paciente: el pedido en borrador al que se carga lo que se
 * consume en consulta, para que Caja lo cobre.
 *
 * ── EL HUECO QUE CIERRA ─────────────────────────────────────────────────────
 * Hasta hoy, lo que Enfermería aplicaba en consulta salía del inventario y no
 * llegaba a ninguna parte: no había nada que uniera la orden médica con el
 * cobro. Aquí la unión es un pedido en borrador de Medusa —el mismo tipo de
 * pedido que el punto de venta usa como carrito— a nombre del paciente. Caja
 * lo abre desde la ficha del paciente y lo cobra con el flujo de siempre.
 *
 * ── CÓMO ────────────────────────────────────────────────────────────────────
 * Si el paciente ya tiene un pedido en borrador abierto, se le añaden los
 * renglones (edición: abrir → añadir → confirmar, como hace el panel). Si no,
 * se crea uno con ellos. Región y canal se toman del punto de venta
 * configurado: el primero de cada uno, que en una clínica es el único.
 */

export type RenglonDeConsumo = { variant_id: string; quantity: number }

export const CLAVE_CONSUMO_EN_CONSULTA = "altus_consumido_en_consulta"

export type CuentaPendiente = {
  id: string
  display_id: number | null
  status: string
  currency_code: string
  total: number
  created_at: string
  customer_id: string | null
  customer_name: string | null
  /** Tiene algo que Enfermería aplicó en consulta: es una cuenta de paciente, no un carrito de mostrador. */
  de_consulta: boolean
  items: { id: string; title: string; quantity: number; unit_price: number; variant_id: string | null }[]
}

function aCuenta(o: any): CuentaPendiente {
  const items = (o.items ?? []).map((i: any) => ({
    id: i.id,
    title: i.title,
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
    variant_id: i.variant_id ?? null,
    consumo: !!i.metadata?.[CLAVE_CONSUMO_EN_CONSULTA],
  }))
  const nombre = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim()
  return {
    id: o.id,
    display_id: o.display_id ?? null,
    status: o.status,
    currency_code: o.currency_code,
    total: Number(o.total) || 0,
    created_at: o.created_at,
    customer_id: o.customer_id ?? o.customer?.id ?? null,
    customer_name: nombre || null,
    de_consulta: !!o.metadata?.altus_cuenta_de_paciente || items.some((i: any) => i.consumo),
    items: items.map(({ consumo: _c, ...i }: any) => i),
  }
}

/**
 * TODAS las cuentas de paciente abiertas, la que más espera primero.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Caja tenía que saber de antemano qué paciente tenía cuenta, entrar a
 * Pacientes, buscarlo, abrir su ficha y ahí encontrar «Cobrar cuenta»: tres
 * pasos para llegar a la acción principal de su puesto. Esto alimenta una
 * lista «Por cobrar» en la propia pantalla de Caja, con el botón en la fila.
 *
 * Se distinguen de los carritos de mostrador —que también son pedidos en
 * borrador— por la marca de la cuenta o de sus renglones: sólo lo que
 * Enfermería aplicó es una cuenta de paciente.
 */
export async function cuentasPendientesTodas(container: MedusaContainer): Promise<CuentaPendiente[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { status: OrderStatus.DRAFT, is_draft_order: true } as any,
    pagination: { take: 200, order: { created_at: "ASC" } },
  })
  const ids = (data ?? []).map((o: any) => o.id)
  if (!ids.length) return []

  const cuentas = await Promise.all(ids.map((id: string) => cuentaPorId(container, id)))
  return cuentas
    .filter((c): c is CuentaPendiente => !!c && c.de_consulta)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
}

/**
 * Pedidos en borrador abiertos del paciente, el más reciente primero.
 *
 * Se leen por el MÓDULO de pedidos y no por `query.graph`: el módulo es el
 * que calcula cantidades y totales de un pedido (los renglones llevan su
 * cantidad en un detalle aparte); el grafo devolvía cantidad 0 y total 0.
 */
export async function cuentasPendientesDe(container: MedusaContainer, customerId: string): Promise<CuentaPendiente[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { customer_id: customerId, status: OrderStatus.DRAFT, is_draft_order: true } as any,
  })
  const ids = (data ?? []).map((o: any) => o.id)
  if (!ids.length) return []

  const cuentas = await Promise.all(ids.map((id: string) => cuentaPorId(container, id)))
  return cuentas
    .filter((c): c is CuentaPendiente => !!c)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

/**
 * Un pedido con sus totales calculados. Es el mismo camino que usa el panel
 * de Medusa para enseñar un pedido: `getOrderDetailWorkflow` hidrata los
 * renglones (cantidad, precio) y calcula el total; leer el módulo a secas
 * devuelve total 0.
 */
export async function cuentaPorId(container: MedusaContainer, orderId: string): Promise<CuentaPendiente | null> {
  try {
    const { result } = await getOrderDetailWorkflow(container).run({
      input: {
        order_id: orderId,
        // Los mismos campos que pide el panel de Medusa al abrir un pedido:
        // sin `*items.detail` la cantidad sale 0, y sin impuestos y ajustes el
        // total no se calcula.
        fields: [
          "id",
          "display_id",
          "status",
          "currency_code",
          "items.*",
          "items.detail.*",
          "items.tax_lines.*",
          "items.adjustments.*",
          "shipping_methods.*",
          "summary.*",
          "total",
          "created_at",
          // Para la lista «Por cobrar» de Caja: de quién es y si es de consulta.
          "customer_id",
          "customer.id",
          "customer.first_name",
          "customer.last_name",
          "metadata",
          "items.metadata",
        ],
      },
    })
    return result ? aCuenta(result) : null
  } catch {
    return null
  }
}

async function regionYCanal(container: MedusaContainer): Promise<{ region_id: string; currency_code: string; sales_channel_id: string }> {
  const regiones: any = container.resolve(Modules.REGION)
  const canales: any = container.resolve(Modules.SALES_CHANNEL)
  const [region] = await regiones.listRegions({}, { take: 1 })
  const [canal] = await canales.listSalesChannels({}, { take: 1 })
  if (!region || !canal) {
    throw new Error("No hay región o canal de venta configurados; no se puede abrir la cuenta del paciente.")
  }
  return { region_id: region.id, currency_code: region.currency_code, sales_channel_id: canal.id }
}

/**
 * Marca de cada renglón que Enfermería ya aplicó en consulta.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Al cobrar cualquier pedido, el suscriptor de ventas
 * (subscribers/fefo-batch-deduction.ts) descuenta sus renglones del almacén
 * de Farmacia. Lo que se aplicó en consulta YA salió del almacén de
 * Enfermería cuando se aplicó, así que sin esta marca el mismo medicamento se
 * descontaba dos veces: una en Enfermería al aplicar y otra en Farmacia al
 * cobrar. Se vio en el día simulado de la fase 8, en el kardex.
 *
 * Va en el renglón y no sólo en la cuenta porque Caja puede añadir a esa misma
 * cuenta algo de mostrador (un agua, un cubrebocas), y eso sí debe salir de
 * Farmacia al cobrar.
 */
const MARCA_CONSUMO = { [CLAVE_CONSUMO_EN_CONSULTA]: true }

/**
 * Carga renglones a la cuenta del paciente. Devuelve la cuenta resultante.
 * Lanza si no se puede: quien llama decide qué hacer con el inventario que
 * ya descontó (se informa, no se deshace: el medicamento ya se aplicó).
 */
export async function cargarALaCuenta(
  container: MedusaContainer,
  customerId: string,
  renglones: RenglonDeConsumo[]
): Promise<CuentaPendiente> {
  const validos = renglones.filter((r) => r.variant_id && Number(r.quantity) > 0)
  if (!validos.length) {
    throw new Error("No hay renglones que cargar a la cuenta.")
  }

  const [abierta] = await cuentasPendientesDe(container, customerId)

  if (abierta) {
    await beginDraftOrderEditWorkflow(container).run({ input: { order_id: abierta.id } })
    try {
      await addDraftOrderItemsWorkflow(container).run({
        input: { order_id: abierta.id, items: validos.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, metadata: MARCA_CONSUMO })) },
      })
      await confirmDraftOrderEditWorkflow(container).run({ input: { order_id: abierta.id, confirmed_by: "system" } })
    } catch (e) {
      // Si algo falla a medias, la edición no debe quedar abierta: bloquearía
      // el cobro en el punto de venta.
      try {
        const { cancelDraftOrderEditWorkflow } = await import("@medusajs/medusa/core-flows")
        await cancelDraftOrderEditWorkflow(container).run({ input: { order_id: abierta.id } })
      } catch {
        // La cancelación es el último recurso; el error original es el que importa.
      }
      throw e
    }
    return (await cuentaPorId(container, abierta.id)) ?? abierta
  }

  const clientes: any = container.resolve(Modules.CUSTOMER)
  const [cliente] = await clientes.listCustomers({ id: customerId })
  if (!cliente) {
    throw new Error("El paciente no existe.")
  }

  const base = await regionYCanal(container)
  const { result } = await createOrderWorkflow(container).run({
    input: {
      ...base,
      customer_id: customerId,
      email: cliente.email,
      status: OrderStatus.DRAFT,
      is_draft_order: true,
      items: validos.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, metadata: MARCA_CONSUMO })),
      metadata: { altus_cuenta_de_paciente: true },
      no_notification: true,
    } as any,
  })

  return (await cuentaPorId(container, result.id)) ?? { ...aCuenta(result), items: [] }
}
