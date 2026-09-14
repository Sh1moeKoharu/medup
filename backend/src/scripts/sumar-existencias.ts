import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { nombresDeAlmacenes } from "../lib/almacenes"

/**
 * Suma de existencias por estado y por almacén.
 *
 *     npx medusa exec ./src/scripts/sumar-existencias.ts
 *
 * Es el número que se apunta ANTES de migrar a inventario por almacén y se
 * comprueba DESPUÉS: la migración no mueve nada, así que el total tiene que
 * ser el mismo. Si no lo es, no se despliega.
 *
 * Sólo lee.
 */
export default async function sumarExistencias({ container }: ExecArgs) {
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: lotes } = await query.graph({
    entity: "medical_batch",
    fields: ["id", "quantity", "status", "stock_location_id"],
  })

  const nombres = await nombresDeAlmacenes(container).catch(() => new Map<string, string>())

  const porEstado = new Map<string, { lotes: number; unidades: number }>()
  const porAlmacen = new Map<string, { lotes: number; unidades: number }>()
  let total = 0

  for (const l of lotes ?? []) {
    const u = Number(l.quantity) || 0
    total += u

    const e = porEstado.get(l.status) ?? { lotes: 0, unidades: 0 }
    e.lotes++
    e.unidades += u
    porEstado.set(l.status, e)

    const k = l.stock_location_id ?? "(sin almacén)"
    const a = porAlmacen.get(k) ?? { lotes: 0, unidades: 0 }
    a.lotes++
    a.unidades += u
    porAlmacen.set(k, a)
  }

  console.log("")
  console.log("=== EXISTENCIAS ===")
  console.log("")
  console.log(`   Lotes    : ${(lotes ?? []).length}`)
  console.log(`   Unidades : ${total}`)
  console.log("")
  console.log("   Por estado")
  for (const [estado, v] of porEstado) {
    console.log(`      ${estado.padEnd(14)} ${String(v.lotes).padStart(5)} lotes ${String(v.unidades).padStart(8)} u`)
  }
  console.log("")
  console.log("   Por almacén")
  for (const [id, v] of porAlmacen) {
    const nombre = nombres.get(id) ?? id
    console.log(`      ${nombre.padEnd(28)} ${String(v.lotes).padStart(5)} lotes ${String(v.unidades).padStart(8)} u`)
  }
  console.log("")
  console.log(`   Apunta este total antes de migrar y compáralo después: ${total} unidades.`)
  console.log("")
}
