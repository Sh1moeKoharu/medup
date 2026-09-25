import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow, updateProductsWorkflow } from "@medusajs/core-flows"
import { HANDLE_CONSULTA, MARCAS_DE_CONSULTA } from "../lib/consulta"

/**
 * Da de alta el producto CONSULTA, de precio variable.
 *
 *     npx medusa exec ./src/scripts/preparar-consulta.ts                    (simula)
 *     npx medusa exec ./src/scripts/preparar-consulta.ts confirm            (crea, precio 0)
 *     npx medusa exec ./src/scripts/preparar-consulta.ts confirm precio=350 (crea o corrige el precio)
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────
 * Crea el producto `consulta` (publicado, en el canal del punto de venta, sin
 * inventario) con las marcas de lib/consulta.ts. Si ya existe, le asegura las
 * marcas y, si se pasa `precio=`, le pone ese precio de referencia.
 *
 * El precio de referencia es con el que la consulta entra al carrito y a la
 * cuenta del paciente; Caja lo cambia en cada cobro. Con 0, Caja está obligada
 * a ponerlo: el servidor no cobra un renglón de precio variable en cero.
 *
 * Simula por omisión. Sin `confirm` no escribe nada.
 */
export default async function prepararConsulta({ container, args }: ExecArgs) {
  const lista = args ?? []
  const confirmado = lista.includes("confirm")
  const precioArg = lista.find((a) => a.startsWith("precio="))?.slice("precio=".length)
  const precio = precioArg === undefined ? null : Number(precioArg)
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) {
    console.log(`El precio no es válido: ${precioArg}`)
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const canales: any = container.resolve(Modules.SALES_CHANNEL)
  const [canal] = await canales.listSalesChannels({}, { take: 1 })
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "metadata", "variants.id", "variants.prices.amount", "variants.prices.currency_code"],
    filters: { handle: HANDLE_CONSULTA },
  })
  const existente = (data ?? [])[0]

  console.log(`\nProducto CONSULTA (handle «${HANDLE_CONSULTA}»)`)
  console.log(`  Canal de venta: ${canal?.name ?? "NINGUNO"}`)
  if (existente) {
    const actual = (existente.variants?.[0] as any)?.prices?.find((p: any) => p.currency_code === "mxn")?.amount
    console.log(`  Ya existe (${existente.status}); precio de referencia actual: ${actual ?? "sin precio"}`)
    console.log(`  Marcas: ${JSON.stringify(existente.metadata ?? {})}`)
  } else {
    console.log(`  No existe: se crearía con precio de referencia ${precio ?? 0}`)
  }
  if (!confirmado) {
    console.log("\nSimulación. Añade `confirm` para escribir.")
    return
  }

  if (existente) {
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: existente.id },
        update: { status: "published" as any, metadata: { ...(existente.metadata ?? {}), ...MARCAS_DE_CONSULTA, tipo: "servicio" } },
      },
    })
    if (precio !== null && existente.variants?.[0]?.id) {
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: existente.id },
          update: { variants: [{ id: existente.variants[0].id, prices: [{ amount: precio, currency_code: "mxn" }] }] } as any,
        },
      })
    }
    console.log(`\nListo: marcas aseguradas${precio !== null ? ` y precio de referencia ${precio}` : ""}.`)
    return
  }

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Consulta",
          handle: HANDLE_CONSULTA,
          description: "Consulta médica. El precio lo pone Caja al cobrar.",
          status: "published" as any,
          sales_channels: canal ? [{ id: canal.id }] : undefined,
          metadata: { ...MARCAS_DE_CONSULTA, tipo: "servicio" },
          options: [{ title: "Presentación", values: ["Default"] }],
          variants: [
            {
              title: "Default",
              options: { Presentación: "Default" },
              manage_inventory: false,
              prices: [{ amount: precio ?? 0, currency_code: "mxn" }],
            },
          ],
        },
      ],
    },
  })
  console.log(`\nListo: producto Consulta creado con precio de referencia ${precio ?? 0}.`)
}
