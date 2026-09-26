import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addDraftOrderPromotionWorkflow,
  beginDraftOrderEditWorkflow,
  cancelDraftOrderEditWorkflow,
  confirmDraftOrderEditWorkflow,
  createProductTypesWorkflow,
  createPromotionsWorkflow,
  getOrderDetailWorkflow,
  removeDraftOrderPromotionsWorkflow,
  updatePromotionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { ASEGURANZAS_MODULE } from "../modules/aseguranzas"
import { resolveRequestRole } from "./require-role"
import { ROLES } from "./roles"

/**
 * Aseguranzas: descuento obligatorio, automático y SÓLO a medicamentos.
 *
 * ── LA REGLA DEL CLIENTE ────────────────────────────────────────────────────
 * «Según la aseguranza se aplica un descuento diferente. Sólo al costo del
 * medicamento, no a la consulta. No se deben aplicar descuentos generales.
 * Ese descuento debe ser obligatorio.»
 *
 * ── CÓMO SE CUMPLE ──────────────────────────────────────────────────────────
 * · Cada aseguranza tiene detrás una PROMOCIÓN de Medusa (porcentaje, por
 *   renglón) cuya regla de destino es «producto de tipo Medicamento». Medusa
 *   hace la resta y el ticket, el corte y los reportes la ven como descuento.
 * · Qué es medicamento lo dice el TIPO de producto (Medicamento / Insumo /
 *   Servicio; ver scripts/preparar-tipos-de-producto.ts). Lo que no tenga
 *   tipo Medicamento no recibe descuento: consulta, insumos, servicios.
 * · Al cobrar, el servidor resuelve la aseguranza del paciente y la aplica si
 *   falta (`requireAseguranzaResuelta`). Si tiene varias, Caja tiene que
 *   elegir una antes; si no tiene ninguna, no hay descuento.
 * · Los códigos de promoción sueltos ("descuentos generales") no entran por
 *   el punto de venta: `requireSinDescuentosGenerales` los rechaza.
 *
 * Funciones puras arriba; lo que toca la base, abajo.
 */

export const TIPO_MEDICAMENTO = "Medicamento"
export const TIPOS_DE_PRODUCTO = [TIPO_MEDICAMENTO, "Insumo", "Servicio"] as const
export const PREFIJO_CODIGO = "ASEG-"
/** En el pedido: qué aseguranza se aplicó, para el ticket y para no volver a preguntar. */
export const CLAVE_ASEGURANZA = "altus_aseguranza"

export type Aseguranza = {
  id: string
  name: string
  discount_percent: number
  status: "active" | "inactive" | string
  valid_from?: Date | string | null
  valid_until?: Date | string | null
  promotion_id?: string | null
  promotion_code?: string | null
}

export type AseguranzaDePaciente = { insurance_id: string; policy_number: string | null }

export type AseguranzaAplicada = { id: string; name: string; discount_percent: number; policy_number: string | null }

/** El código de la promoción de una aseguranza: fijo por id, sobrevive a un cambio de nombre. */
export function codigoDe(id: string): string {
  return PREFIJO_CODIGO + id.replace(/[^A-Za-z0-9]/g, "").slice(-10).toUpperCase()
}

export function esCodigoDeAseguranza(code: string | null | undefined): boolean {
  return typeof code === "string" && code.startsWith(PREFIJO_CODIGO)
}

/** Por qué la aseguranza no vale, o null. */
export function revisarAseguranza(a: { name?: unknown; discount_percent?: unknown }): string | null {
  if (String(a.name ?? "").trim().length < 2) return "El nombre de la aseguranza es obligatorio."
  const p = Number(a.discount_percent)
  if (!Number.isFinite(p) || p <= 0 || p > 100) return "El porcentaje de descuento va de 1 a 100."
  return null
}

/** Activa y dentro de su vigencia. */
export function vigente(a: Aseguranza, ahora: Date = new Date()): boolean {
  if (a.status !== "active") return false
  const t = ahora.getTime()
  if (a.valid_from && new Date(a.valid_from).getTime() > t) return false
  if (a.valid_until && new Date(a.valid_until).getTime() < t) return false
  return true
}

/** La lista de aseguranzas de un paciente, limpia; o el error si no tiene forma. */
export function normalizarAseguranzasDePaciente(valor: unknown): { lista: AseguranzaDePaciente[]; error: string | null } {
  if (valor === null || valor === undefined) return { lista: [], error: null }
  if (!Array.isArray(valor)) return { lista: [], error: "Las aseguranzas del paciente van como lista." }
  const vistas = new Set<string>()
  const lista: AseguranzaDePaciente[] = []
  for (const v of valor) {
    const id = String((v as any)?.insurance_id ?? "").trim()
    if (!id) return { lista: [], error: "Cada aseguranza del paciente lleva su insurance_id." }
    if (vistas.has(id)) continue
    vistas.add(id)
    const poliza = String((v as any)?.policy_number ?? "").trim()
    lista.push({ insurance_id: id, policy_number: poliza || null })
  }
  return { lista, error: null }
}

/**
 * Cuál aseguranza se aplica al cobro. Con una, ésa; con varias, la que Caja
 * eligió; sin elegir, no se puede cobrar todavía. Una elegida que el paciente
 * no tiene se rechaza.
 */
export function resolverAseguranza(
  vigentes: (Aseguranza & { policy_number?: string | null })[],
  elegidaId?: string | null
): { aseguranza: (Aseguranza & { policy_number?: string | null }) | null; error: string | null; type: string | null } {
  if (!vigentes.length) return { aseguranza: null, error: null, type: null }
  if (elegidaId) {
    const elegida = vigentes.find((a) => a.id === elegidaId)
    if (!elegida) {
      return { aseguranza: null, error: "La aseguranza elegida no es de este paciente o ya no está vigente. Elige otra.", type: "aseguranza_ajena" }
    }
    return { aseguranza: elegida, error: null, type: null }
  }
  if (vigentes.length === 1) return { aseguranza: vigentes[0], error: null, type: null }
  return {
    aseguranza: null,
    error: `El paciente tiene ${vigentes.length} aseguranzas (${vigentes.map((a) => a.name).join(", ")}). Elige con cuál se cobra antes de continuar.`,
    type: "aseguranza_pendiente",
  }
}

/** Códigos de promoción que no son de aseguranza: los "descuentos generales" que no deben entrar. */
export function codigosAjenos(codes: (string | null | undefined)[]): string[] {
  return [...new Set(codes.filter((c): c is string => typeof c === "string" && c.length > 0 && !esCodigoDeAseguranza(c)))]
}

// ─── Lo que toca la base ───────────────────────────────────────────────────

/** El tipo de producto Medicamento; se crea si no existe. */
export async function tipoDeProducto(container: MedusaContainer, valor: string): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product_type", fields: ["id", "value"], filters: { value: valor } })
  const existente = (data ?? [])[0]
  if (existente) return existente.id
  const { result } = await createProductTypesWorkflow(container).run({ input: { product_types: [{ value: valor }] } })
  return result[0].id
}

/**
 * Crea o corrige la promoción de Medusa de una aseguranza: porcentaje por
 * renglón, sólo a productos de tipo Medicamento, por código (no automática:
 * la aplica el servidor al cobrar, a quien la tiene). Devuelve id y código.
 */
export async function sincronizarPromocion(container: MedusaContainer, aseg: Aseguranza): Promise<{ promotion_id: string; promotion_code: string }> {
  const code = aseg.promotion_code || codigoDe(aseg.id)
  const status = aseg.status === "active" ? "active" : "inactive"
  if (aseg.promotion_id) {
    await updatePromotionsWorkflow(container).run({
      input: {
        promotionsData: [{ id: aseg.promotion_id, status, application_method: { value: Number(aseg.discount_percent) } as any }],
      },
    })
    return { promotion_id: aseg.promotion_id, promotion_code: code }
  }
  const tipoId = await tipoDeProducto(container, TIPO_MEDICAMENTO)
  const { result } = await createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        {
          code,
          type: "standard",
          status,
          is_automatic: false,
          application_method: {
            type: "percentage",
            value: Number(aseg.discount_percent),
            target_type: "items",
            // «across»: el porcentaje sobre el total de los renglones que aplican.
            // Con «each» Medusa exige un tope de unidades por renglón, que aquí no tiene sentido.
            allocation: "across",
            target_rules: [{ attribute: "items.product.type_id", operator: "in", values: [tipoId] }],
          },
        } as any,
      ],
    },
  })
  return { promotion_id: result[0].id, promotion_code: code }
}

/** Las aseguranzas VIGENTES de un paciente, con su número de póliza. */
export async function aseguranzasVigentesDe(container: MedusaContainer, customerId: string): Promise<(Aseguranza & { policy_number: string | null })[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["id", "medical_customer.insurances"], filters: { id: customerId } })
  const { lista } = normalizarAseguranzasDePaciente(((data ?? [])[0]?.medical_customer as any)?.insurances)
  if (!lista.length) return []
  const service: any = container.resolve(ASEGURANZAS_MODULE)
  const todas: Aseguranza[] = await service.listInsurances({ id: lista.map((l) => l.insurance_id) })
  return lista
    .map((l) => {
      const a = todas.find((x) => x.id === l.insurance_id)
      return a && vigente(a) ? { ...a, policy_number: l.policy_number } : null
    })
    .filter((a): a is Aseguranza & { policy_number: string | null } => !!a)
}

/** El pedido con sus ajustes (códigos aplicados) y su cliente, con las ediciones aplicadas. */
async function pedidoParaAseguranza(container: MedusaContainer, orderId: string): Promise<any | null> {
  try {
    const { result } = await getOrderDetailWorkflow(container).run({
      input: { order_id: orderId, fields: ["id", "status", "customer_id", "metadata", "items.*", "items.adjustments.*"] },
    })
    return result ?? null
  } catch {
    return null
  }
}

function codigosAplicados(pedido: any): string[] {
  const codes = (pedido?.items ?? []).flatMap((i: any) => (i.adjustments ?? []).map((a: any) => a.code))
  return [...new Set(codes.filter((c: any) => typeof c === "string" && c))] as string[]
}

/**
 * Aplica (o quita, con null) la aseguranza a un pedido en borrador: retira
 * cualquier código de aseguranza anterior, añade el de ésta y lo anota en el
 * pedido para el ticket. Es idempotente.
 */
export async function aplicarAseguranza(
  container: MedusaContainer,
  orderId: string,
  aseg: (Aseguranza & { policy_number?: string | null }) | null
): Promise<AseguranzaAplicada | null> {
  const pedido = await pedidoParaAseguranza(container, orderId)
  if (!pedido) throw new Error("No se encontró el pedido.")
  const aplicados = codigosAplicados(pedido).filter(esCodigoDeAseguranza)
  const deseado = aseg ? aseg.promotion_code || codigoDe(aseg.id) : null

  const sobran = aplicados.filter((c) => c !== deseado)
  const falta = !!deseado && !aplicados.includes(deseado)
  if (sobran.length || falta) {
    // Las promociones de un borrador se cambian dentro de una EDICIÓN del
    // pedido, igual que sus renglones: se abre, se cambia y se confirma. Si
    // ya había una abierta (el punto de venta a medio paso), se reutiliza.
    let abiertaAqui = true
    try {
      await beginDraftOrderEditWorkflow(container).run({ input: { order_id: orderId } })
    } catch {
      abiertaAqui = false
    }
    try {
      if (sobran.length) {
        await removeDraftOrderPromotionsWorkflow(container).run({ input: { order_id: orderId, promo_codes: sobran } })
      }
      if (falta) {
        await addDraftOrderPromotionWorkflow(container).run({ input: { order_id: orderId, promo_codes: [deseado as string] } })
      }
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

  const aplicada: AseguranzaAplicada | null = aseg
    ? { id: aseg.id, name: aseg.name, discount_percent: Number(aseg.discount_percent), policy_number: aseg.policy_number ?? null }
    : null
  const pedidos: any = container.resolve(Modules.ORDER)
  await pedidos.updateOrders([{ id: orderId, metadata: { ...(pedido.metadata ?? {}), [CLAVE_ASEGURANZA]: aplicada } }])
  return aplicada
}

/**
 * Guard para `convert-to-order`: descuentos generales fuera, y la aseguranza
 * del paciente puesta. Con una sola, se aplica aquí mismo si faltaba
 * (obligatoria, no depende de que Caja se acuerde); con varias, Caja debe
 * elegir antes (409). Sin aseguranza, se cobra íntegro.
 */
export function requireAseguranzaResuelta() {
  return async function requireAseguranzaResueltaMiddleware(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const id = req.params.id
    if (!id) return next()
    const pedido = await pedidoParaAseguranza(req.scope as any, id)
    if (!pedido || pedido.status !== "draft") return next()

    const ajenos = codigosAjenos(codigosAplicados(pedido))
    if (ajenos.length) {
      return res.status(409).json({
        type: "descuento_no_permitido",
        message: `Este cobro lleva un descuento general (${ajenos.join(", ")}). No se aplican descuentos generales: sólo la aseguranza del paciente. Quítalo para cobrar.`,
      })
    }
    if (!pedido.customer_id) return next()

    const vigentes = await aseguranzasVigentesDe(req.scope as any, pedido.customer_id)
    const elegida = pedido.metadata?.[CLAVE_ASEGURANZA]?.id ?? null
    const { aseguranza, error, type } = resolverAseguranza(vigentes, elegida)
    if (error) {
      return res.status(409).json({ type, message: error, aseguranzas: vigentes.map((a) => ({ id: a.id, name: a.name, discount_percent: a.discount_percent })) })
    }
    try {
      // Idempotente: si ya está aplicada, no toca nada.
      await aplicarAseguranza(req.scope as any, id, aseguranza)
    } catch (e: any) {
      return res.status(409).json({ type: "aseguranza_no_aplicada", message: `No se pudo aplicar la aseguranza: ${e?.message ?? e}` })
    }
    return next()
  }
}

/**
 * Guard para añadir promociones a un pedido en borrador: por el punto de venta
 * no entran códigos sueltos. Las aseguranzas se aplican desde el cobro, con
 * su ruta; Administración conserva las promociones para el panel.
 */
export function requireSinDescuentosGenerales() {
  return async function requireSinDescuentosGeneralesMiddleware(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const rol = await resolveRequestRole(req)
    if (rol === ROLES.ADMIN) return next()
    const codes: string[] = (req.body as any)?.promo_codes ?? []
    const ajenos = codigosAjenos(codes)
    if (ajenos.length || codes.some(esCodigoDeAseguranza)) {
      return res.status(409).json({
        type: "descuento_no_permitido",
        message: "No se aplican descuentos generales. La aseguranza del paciente se aplica desde el cobro, y sólo a los medicamentos.",
      })
    }
    return next()
  }
}
