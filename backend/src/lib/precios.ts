import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Escribir el precio de venta de una variante.
 *
 * Lo usa el alta de lote cuando el producto tiene margen automático (ver
 * `lib/margen.ts`). Se respeta la moneda que la variante ya tenía; si no
 * tenía ninguna, se escribe en MXN, que es la de la clínica.
 */

export type PrecioActual = {
  amount: number
  currency_code: string
}

export async function precioActualDeVariante(
  container: MedusaContainer,
  variantId: string
): Promise<PrecioActual | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "prices.amount", "prices.currency_code"],
    filters: { id: variantId },
  })
  const precios: any[] = (data?.[0] as any)?.prices ?? []
  const mxn = precios.find((p) => String(p.currency_code).toLowerCase() === "mxn")
  const elegido = mxn ?? precios[0]
  return elegido ? { amount: Number(elegido.amount), currency_code: String(elegido.currency_code).toLowerCase() } : null
}

/**
 * Deja la variante con este precio de venta. Devuelve lo que quedó escrito.
 *
 * Medusa v2 guarda los importes en la unidad normal de la moneda: 13 son
 * trece pesos, no trece centavos.
 */
export async function actualizarPrecioDeVariante(
  container: MedusaContainer,
  variantId: string,
  amount: number,
  currencyCode?: string
): Promise<PrecioActual> {
  const actual = currencyCode ? null : await precioActualDeVariante(container, variantId)
  const currency_code = (currencyCode ?? actual?.currency_code ?? "mxn").toLowerCase()

  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: [{ id: variantId, prices: [{ amount, currency_code }] }],
    },
  })

  return { amount, currency_code }
}
