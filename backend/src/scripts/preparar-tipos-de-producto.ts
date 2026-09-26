import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/core-flows"
import { TIPOS_DE_PRODUCTO, TIPO_MEDICAMENTO, tipoDeProducto } from "../lib/aseguranzas"
import { HANDLE_CONSULTA } from "../lib/consulta"

/**
 * Da tipo a los productos: Medicamento, Insumo o Servicio.
 *
 *     npx medusa exec ./src/scripts/preparar-tipos-de-producto.ts           (simula)
 *     npx medusa exec ./src/scripts/preparar-tipos-de-producto.ts confirm   (ejecuta)
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * El descuento de una aseguranza se aplica SÓLO a los productos de tipo
 * Medicamento (lib/aseguranzas.ts). Los productos que ya existían no tienen
 * tipo, así que:
 *
 *   · crea los tres tipos si faltan;
 *   · la Consulta (y cualquier producto con metadata.tipo = "servicio") queda
 *     como Servicio;
 *   · todo lo demás sin tipo queda como MEDICAMENTO.
 *
 * Los insumos (guantes, abatelenguas, jeringas) los cambia Administración a
 * Insumo en la ficha del producto del panel: son pocos y sólo ella sabe
 * cuáles son. Mientras tanto reciben descuento como medicamento, que es el
 * error menos grave (el contrario cobraría de más al asegurado).
 *
 * Simula por omisión. Sin `confirm` no escribe nada. Lo que ya tiene tipo no
 * se toca.
 */
export default async function prepararTiposDeProducto({ container, args }: ExecArgs) {
  const confirmado = (args ?? []).includes("confirm")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const tipos: Record<string, string> = {}
  for (const t of TIPOS_DE_PRODUCTO) {
    if (confirmado) tipos[t] = await tipoDeProducto(container, t)
  }

  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "type_id", "metadata"], pagination: { take: 5000 } })
  const productos: any[] = data ?? []
  const sinTipo = productos.filter((p) => !p.type_id)
  const servicios = sinTipo.filter((p) => p.handle === HANDLE_CONSULTA || String(p.metadata?.tipo ?? "").toLowerCase() === "servicio")
  const medicamentos = sinTipo.filter((p) => !servicios.includes(p))

  console.log(`\nProductos: ${productos.length} · con tipo: ${productos.length - sinTipo.length} · sin tipo: ${sinTipo.length}`)
  console.log(`  → Servicio:    ${servicios.length}  (${servicios.map((p) => p.title).slice(0, 5).join(", ")}${servicios.length > 5 ? ", …" : ""})`)
  console.log(`  → Medicamento: ${medicamentos.length}`)
  if (!confirmado) {
    console.log("\nSimulación. Añade `confirm` para escribir.")
    return
  }

  const asignar = async (lista: any[], tipo: string) => {
    for (const p of lista) {
      await updateProductsWorkflow(container).run({ input: { selector: { id: p.id }, update: { type_id: tipos[tipo] } } })
    }
  }
  await asignar(servicios, "Servicio")
  await asignar(medicamentos, TIPO_MEDICAMENTO)
  console.log(`\nListo. Revisa en el panel qué productos son Insumo y cámbiales el tipo: no reciben descuento de aseguranza.`)
}
