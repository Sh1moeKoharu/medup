import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type VariantLabel = {
  variant_title: string | null
  product_title: string | null
  /** Lo que conviene mostrar en pantalla: "Producto — Variante". */
  label: string
}

/**
 * Resuelve nombres legibles para un conjunto de variantes.
 *
 * Los lotes guardan `variant_id` como texto plano. Existe un link
 * ProductVariant↔MedicalBatch (`src/links/medical-inventory.ts`), pero los lotes
 * se dan de alta con `createMedicalBatches` sin poblar la tabla de links, así
 * que `batch.product_variant` viene vacío. Se consultan las variantes por id,
 * que funciona haya links o no.
 *
 * Nunca lanza: un reporte no debe caerse porque falte un nombre. Las variantes
 * que no se resuelvan quedan con su id como etiqueta.
 */
export async function fetchVariantLabels(
  container: any,
  variantIds: string[]
): Promise<Map<string, VariantLabel>> {
  const result = new Map<string, VariantLabel>()

  const unique = [...new Set(variantIds.filter(Boolean))]
  if (!unique.length) {
    return result
  }

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "sku", "product.title"],
      filters: { id: unique },
    })

    for (const v of variants || []) {
      const productTitle = (v as any).product?.title ?? null
      const variantTitle = v.title ?? null
      result.set(v.id, {
        variant_title: variantTitle,
        product_title: productTitle,
        label:
          [productTitle, variantTitle].filter(Boolean).join(" — ") ||
          (v as any).sku ||
          v.id,
      })
    }
  } catch {
    // Se devuelve lo que se haya podido resolver; el llamador usa el id como
    // respaldo para las que falten.
  }

  return result
}
