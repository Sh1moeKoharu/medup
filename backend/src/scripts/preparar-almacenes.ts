import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  AREAS,
  CLAVE_AREA_ALMACEN,
  ETIQUETA_AREA,
  NOMBRE_ALMACEN_ENFERMERIA,
  areaDeAlmacen,
} from "../lib/almacenes"

/**
 * Deja los dos almacenes listos: Farmacia y Enfermería.
 *
 *     npx medusa exec ./src/scripts/preparar-almacenes.ts                (simula)
 *     npx medusa exec ./src/scripts/preparar-almacenes.ts confirm        (ejecuta)
 *     npx medusa exec ./src/scripts/preparar-almacenes.ts confirm farmacia=sloc_XXX
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────
 * 1. Marca como FARMACIA la ubicación de inventario que ya existía (la única,
 *    en las instalaciones actuales). Con varias sin marcar hay que indicar
 *    cuál con `farmacia=<id>`; no se adivina.
 * 2. Crea "Almacén de Enfermería" si no hay ninguna ubicación con ese área.
 * 3. Reporta los lotes y asientos que hayan quedado SIN almacén tras la
 *    migración, y con `confirm` los asigna a Farmacia si —y sólo si— fue
 *    posible determinarla. Es el caso de una base con varias ubicaciones
 *    previas, donde la migración no pudo rellenar sola.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 * No mueve existencia entre almacenes. Todo lo que había queda en Farmacia;
 * lo que deba estar en Enfermería se pasa con una requisición, que deja
 * rastro en el kardex de los dos.
 *
 * Simula por omisión. Sin `confirm` no escribe nada.
 */
export default async function prepararAlmacenes({ container, args }: ExecArgs) {
  const lista = args ?? []
  const confirmado = lista.includes("confirm")
  const farmaciaElegida = lista.find((a) => a.startsWith("farmacia="))?.slice("farmacia=".length)

  const locationService: any = container.resolve(Modules.STOCK_LOCATION)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventarioService: any = container.resolve("medical_inventory")
  const movimientosService: any = container.resolve("inventory_movements")

  console.log("")
  console.log("=== ALMACENES ===")
  console.log(`Modo: ${confirmado ? "EJECUTAR" : "SIMULACIÓN (sin cambios)"}`)
  console.log("")

  const ubicaciones: any[] = await locationService.listStockLocations({}, { take: 100 })

  for (const u of ubicaciones) {
    const area = areaDeAlmacen(u)
    console.log(`   ${u.name.padEnd(28)} ${u.id}  ${area ? ETIQUETA_AREA[area] : "— sin área —"}`)
  }
  console.log("")

  // ── 1. Farmacia ───────────────────────────────────────────────────────────
  let farmacia = ubicaciones.find((u) => areaDeAlmacen(u) === AREAS.FARMACIA) ?? null

  if (!farmacia) {
    const sinArea = ubicaciones.filter((u) => !areaDeAlmacen(u))
    const candidata = farmaciaElegida
      ? ubicaciones.find((u) => u.id === farmaciaElegida)
      : sinArea.length === 1
        ? sinArea[0]
        : null

    if (!candidata) {
      console.log(
        sinArea.length
          ? `   Hay ${sinArea.length} ubicaciones sin área. Indica cuál es Farmacia: farmacia=<id>`
          : "   No hay ninguna ubicación de inventario. Crea una en Ajustes → Ubicaciones y vuelve a correr."
      )
      console.log("")
      return
    }

    console.log(`   Farmacia   -> "${candidata.name}" (${candidata.id})`)
    if (confirmado) {
      // Firma del módulo: (id, cambios). Un solo objeto con `id` dentro se
      // toma como SELECTOR y no escribe nada, sin avisar.
      await locationService.updateStockLocations(candidata.id, {
        metadata: { ...(candidata.metadata ?? {}), [CLAVE_AREA_ALMACEN]: AREAS.FARMACIA },
      })
    }
    farmacia = candidata
  } else {
    console.log(`   Farmacia   = "${farmacia.name}" (ya marcada)`)
  }

  // ── 2. Enfermería ─────────────────────────────────────────────────────────
  let enfermeria = ubicaciones.find((u) => areaDeAlmacen(u) === AREAS.ENFERMERIA) ?? null

  if (!enfermeria) {
    console.log(`   Enfermería -> se crea "${NOMBRE_ALMACEN_ENFERMERIA}"`)
    if (confirmado) {
      const [creada] = await locationService.createStockLocations([
        {
          name: NOMBRE_ALMACEN_ENFERMERIA,
          metadata: { [CLAVE_AREA_ALMACEN]: AREAS.ENFERMERIA },
        },
      ])
      enfermeria = creada
    }
  } else {
    console.log(`   Enfermería = "${enfermeria.name}" (ya existe)`)
  }

  // ── 3. Lo que quedó sin almacén ───────────────────────────────────────────
  const { data: lotesSinAlmacen } = await query.graph({
    entity: "medical_batch",
    fields: ["id", "batch_number", "quantity"],
    filters: { stock_location_id: null },
  })
  const { data: asientosSinAlmacen } = await query.graph({
    entity: "inventory_movement",
    fields: ["id"],
    filters: { stock_location_id: null },
  })

  console.log("")
  console.log(`   Lotes sin almacén   : ${lotesSinAlmacen?.length ?? 0}`)
  console.log(`   Asientos sin almacén: ${asientosSinAlmacen?.length ?? 0}`)

  if ((lotesSinAlmacen?.length || asientosSinAlmacen?.length) && farmacia) {
    console.log(`   -> se asignan a Farmacia ("${farmacia.name}")`)
    if (confirmado) {
      for (const l of lotesSinAlmacen ?? []) {
        await inventarioService.updateMedicalBatches({ id: l.id, stock_location_id: farmacia.id })
      }
      for (const a of asientosSinAlmacen ?? []) {
        await movimientosService.updateInventoryMovements({ id: a.id, stock_location_id: farmacia.id })
      }
    }
  }

  console.log("")
  console.log(
    confirmado
      ? "   Listo. Comprueba la suma de existencias con sumar-existencias.ts."
      : "   Nada se escribió. Repite con `confirm` para aplicar."
  )
  console.log("")
}
