import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/core-flows"

/**
 * Vincula productos a un canal de venta.
 *
 *   npx medusa exec ./src/scripts/link-products-to-channel.ts          (simulación)
 *   npx medusa exec ./src/scripts/link-products-to-channel.ts apply
 *   npx medusa exec ./src/scripts/link-products-to-channel.ts apply sc_01ABC…
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * El POS lista productos filtrando por `sales_channel_id`:
 *
 *     useProducts({ sales_channel_id: settings.data?.sales_channel?.id, … })
 *
 * El importador del Excel creaba los productos sin asociarlos a ningún canal,
 * así que el catálogo estaba en la base pero el POS mostraba cero: pedía "los
 * del canal X" y ninguno pertenecía a X. En el panel sí se veían, porque ahí no
 * se aplica ese filtro — de ahí que el problema pareciera intermitente.
 *
 * El importador ya asocia el canal al crear. Este script es para reparar lo que
 * se importó antes.
 *
 * Sin argumento de canal usa el único que exista; si hay varios, exige elegir
 * en lugar de adivinar.
 */
export default async function linkProductsToChannel({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const apply = execArgs.includes("apply")
  const channelArg = execArgs.find((a) => a.startsWith("sc_"))

  const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)
  const productService: any = container.resolve(Modules.PRODUCT)
  const query: any = container.resolve("query")

  const channels = await salesChannelService.listSalesChannels({})

  if (!channels.length) {
    throw new Error(
      "No hay ningún canal de venta. Créalo desde el asistente del POS o el panel."
    )
  }

  let channel = channelArg
    ? channels.find((c: any) => c.id === channelArg)
    : channels.length === 1
      ? channels[0]
      : null

  if (!channel) {
    console.log("")
    console.log("Hay varios canales de venta; indica cuál usar:")
    channels.forEach((c: any) => console.log(`   ${c.id}   ${c.name}`))
    console.log("")
    console.log("   npx medusa exec ./src/scripts/link-products-to-channel.ts apply <id>")
    return
  }

  // Se consultan los productos junto con sus canales para saber cuáles ya están
  // vinculados: volver a vincular uno existente falla.
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "sales_channels.id"],
    pagination: { take: 5000 },
  })

  const sinVincular = (products || []).filter(
    (p: any) => !(p.sales_channels || []).some((sc: any) => sc?.id === channel.id)
  )

  console.log("")
  console.log("=== VINCULAR PRODUCTOS AL CANAL DE VENTA ===")
  console.log(`Canal: ${channel.name} (${channel.id})`)
  console.log(`Modo:  ${apply ? "APLICAR" : "SIMULACIÓN (sin cambios)"}`)
  console.log("")
  console.log(`   Productos totales        : ${products?.length ?? 0}`)
  console.log(`   Ya vinculados a este canal: ${(products?.length ?? 0) - sinVincular.length}`)
  console.log(`   Por vincular             : ${sinVincular.length}`)
  console.log("")

  if (!sinVincular.length) {
    console.log("Todos los productos ya están en el canal. Nada que hacer.")
    return
  }

  if (!apply) {
    sinVincular.slice(0, 5).forEach((p: any) => console.log(`   · ${p.title}`))
    if (sinVincular.length > 5) {
      console.log(`   … y ${sinVincular.length - 5} más`)
    }
    console.log("")
    console.log("Simulación. Para aplicar:")
    console.log("   npx medusa exec ./src/scripts/link-products-to-channel.ts apply")
    return
  }

  // En lotes: enviar miles de ids en una sola llamada agota memoria y deja el
  // trabajo a medias sin saber por dónde iba.
  const TAMANO_LOTE = 200
  let vinculados = 0

  for (let i = 0; i < sinVincular.length; i += TAMANO_LOTE) {
    const lote = sinVincular.slice(i, i + TAMANO_LOTE)
    await linkProductsToSalesChannelWorkflow(container).run({
      input: {
        id: channel.id,
        add: lote.map((p: any) => p.id),
      },
    })
    vinculados += lote.length
    console.log(`   ${vinculados}/${sinVincular.length}`)
  }

  console.log("")
  console.log(`Listo. ${vinculados} producto(s) vinculado(s) a "${channel.name}".`)
  console.log("Recarga el POS: el catálogo debería aparecer.")
}
