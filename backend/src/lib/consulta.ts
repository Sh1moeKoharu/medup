import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"

/**
 * La CONSULTA es un producto de precio variable: Caja pone el importe al cobrar.
 *
 * ── POR QUÉ UN PRODUCTO ─────────────────────────────────────────────────────
 * Sin él, la consulta se cobraba fuera del sistema o se colaba como un
 * "descuento al revés". Como producto entra al ticket, al corte de caja y a los
 * reportes igual que un medicamento. Se distingue por su `handle` (`consulta`)
 * y por dos marcas en `metadata`:
 *
 *   altus_consulta        → es la consulta médica
 *   altus_precio_variable → el precio lo decide Caja en cada cobro
 *
 * Las mismas marcas viajan en el RENGLÓN de la cuenta cuando Enfermería aplica
 * una orden (lib/cuentas-de-paciente.ts), para que el punto de venta sepa qué
 * renglón se edita y el servidor qué renglón no puede cobrarse en cero.
 *
 * ── PRECIO VARIABLE ≠ PRECIO LIBRE ──────────────────────────────────────────
 * El precio del producto en el panel es la REFERENCIA con la que entra al
 * carrito. Caja lo cambia renglón por renglón (el pedido en borrador de Medusa
 * admite `unit_price` por renglón). Lo que no se admite es cobrar en cero: un
 * renglón de precio variable sin importe detiene el cobro con 409 y dice cuál.
 */

export const HANDLE_CONSULTA = "consulta"
export const CLAVE_CONSULTA = "altus_consulta"
export const CLAVE_PRECIO_VARIABLE = "altus_precio_variable"

export const MARCAS_DE_CONSULTA = { [CLAVE_CONSULTA]: true, [CLAVE_PRECIO_VARIABLE]: true }

type Meta = Record<string, unknown> | null | undefined

export type RenglonConPrecio = {
  title?: string | null
  product_title?: string | null
  unit_price?: number | string | null
  quantity?: number | string | null
  metadata?: Meta
  variant?: { product?: { metadata?: Meta } | null } | null
  product?: { metadata?: Meta } | null
}

const metaDe = (r: RenglonConPrecio): Meta[] => [r.metadata, r.variant?.product?.metadata, r.product?.metadata]

/** ¿El precio de este renglón lo decide Caja? Vale la marca en el renglón o en su producto. */
export function esPrecioVariable(r: RenglonConPrecio): boolean {
  return metaDe(r).some((m) => !!m?.[CLAVE_PRECIO_VARIABLE])
}

/** ¿Es la consulta médica? */
export function esConsulta(r: RenglonConPrecio): boolean {
  return metaDe(r).some((m) => !!m?.[CLAVE_CONSULTA])
}

/** Renglones de precio variable que siguen en cero: no se pueden cobrar así. */
export function renglonesSinPrecio(items: RenglonConPrecio[]): string[] {
  return items
    .filter((r) => esPrecioVariable(r) && (Number(r.quantity ?? 1) || 0) > 0 && (Number(r.unit_price) || 0) <= 0)
    .map((r) => r.product_title || r.title || "Consulta")
}

/** Por qué no se puede cobrar todavía, o null. Función pura. */
export function motivoPrecioPendiente(items: RenglonConPrecio[]): string | null {
  const sin = renglonesSinPrecio(items)
  if (!sin.length) return null
  const lista = [...new Set(sin)].join(", ")
  return `Falta poner el precio de: ${lista}. En el cobro, toca el renglón y escribe el importe.`
}

/** La presentación del producto Consulta, o null si no se ha dado de alta (ver scripts/preparar-consulta.ts). */
export async function varianteDeConsulta(container: MedusaContainer): Promise<{ variant_id: string; title: string } | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "variants.id"],
    filters: { handle: HANDLE_CONSULTA },
  })
  const producto = (data ?? [])[0]
  const variante = producto?.variants?.[0]
  if (!producto || producto.status !== "published" || !variante) return null
  return { variant_id: variante.id, title: producto.title }
}

/**
 * Guard para `convert-to-order`: un pedido en borrador con un renglón de precio
 * variable en cero no se cobra. Sólo actúa sobre borradores; si no puede leer
 * el pedido, no estorba.
 *
 * Se lee con `getOrderDetailWorkflow`, no con `query.graph`: el precio que Caja
 * pone es una EDICIÓN del pedido, y el grafo devuelve el renglón como nació
 * (en cero) aunque la edición ya esté confirmada. El flujo de detalle es el
 * que aplica las ediciones, igual que hace el panel de Medusa.
 */
export function requirePreciosPuestos() {
  return async function requirePreciosPuestosMiddleware(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const id = req.params.id
    if (!id) return next()
    let pedido: any = null
    try {
      const { result } = await getOrderDetailWorkflow(req.scope as any).run({
        input: {
          order_id: id,
          fields: ["id", "status", "items.*", "items.detail.*", "items.metadata", "items.variant.product.metadata"],
        },
      })
      pedido = result ?? null
    } catch {
      return next()
    }
    if (!pedido || pedido.status !== "draft") return next()
    const motivo = motivoPrecioPendiente(pedido.items ?? [])
    if (motivo) {
      return res.status(409).json({ type: "precio_pendiente", message: motivo })
    }
    return next()
  }
}
