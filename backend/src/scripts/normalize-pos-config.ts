import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Deja UNA sola configuración de punto de venta: un canal, una región con la
 * moneda correcta y una ubicación de inventario.
 *
 *   npx medusa exec ./src/scripts/normalize-pos-config.ts
 *   npx medusa exec ./src/scripts/normalize-pos-config.ts apply
 *   npx medusa exec ./src/scripts/normalize-pos-config.ts apply currency=mxn region=reg_01… location=sloc_01…
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * El asistente del POS permite crear región, canal y ubicación desde cualquier
 * dispositivo, así que pasar por él varias veces genera duplicados — y a veces
 * con la moneda equivocada, lo que hace que todos los precios salgan en otra
 * divisa sin que nada lo advierta.
 *
 * Además, mientras exista más de una opción de cada cosa, el POS seguirá
 * mostrándole el asistente al cajero en lugar de configurarse solo.
 *
 * ── CRITERIO DE SEGURIDAD ───────────────────────────────────────────────────
 * NO se elimina nada que tenga datos colgando. Una región con pedidos o una
 * ubicación con existencias registradas se conservan y se reportan: borrarlas
 * dejaría el historial apuntando a algo que ya no existe.
 *
 * Cuando no se indica cuál conservar, se elige la que MÁS datos tenga asociados
 * — es la que está realmente en uso — y a igualdad, la más antigua.
 */

type Recurso = { id: string; name?: string; created_at?: Date; [k: string]: any }

function elegir(lista: Recurso[], usos: Map<string, number>, elegidoManual?: string): Recurso {
  if (elegidoManual) {
    const encontrado = lista.find((x) => x.id === elegidoManual)
    if (!encontrado) {
      throw new Error(`No existe el id indicado: ${elegidoManual}`)
    }
    return encontrado
  }

  return [...lista].sort((a, b) => {
    const ua = usos.get(a.id) ?? 0
    const ub = usos.get(b.id) ?? 0
    if (ua !== ub) return ub - ua
    return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  })[0]
}

export default async function normalizePosConfig({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const apply = execArgs.includes("apply")
  const valor = (clave: string) =>
    execArgs.find((a) => a.startsWith(`${clave}=`))?.split("=")[1]

  const monedaDeseada = (valor("currency") ?? "mxn").toLowerCase()
  const regionElegida = valor("region")
  const ubicacionElegida = valor("location")
  const canalElegido = valor("channel")

  const regionService: any = container.resolve(Modules.REGION)
  const channelService: any = container.resolve(Modules.SALES_CHANNEL)
  const locationService: any = container.resolve(Modules.STOCK_LOCATION)
  const query: any = container.resolve("query")

  // ── Uso real de cada recurso ──────────────────────────────────────────────
  const usosRegion = new Map<string, number>()
  const usosUbicacion = new Map<string, number>()

  const { data: ordenes } = await query.graph({
    entity: "order",
    fields: ["id", "region_id"],
    pagination: { take: 10000 },
  })
  for (const o of ordenes || []) {
    if (o.region_id) {
      usosRegion.set(o.region_id, (usosRegion.get(o.region_id) ?? 0) + 1)
    }
  }

  try {
    const { data: niveles } = await query.graph({
      entity: "inventory_level",
      fields: ["id", "location_id"],
      pagination: { take: 10000 },
    })
    for (const n of niveles || []) {
      if (n.location_id) {
        usosUbicacion.set(n.location_id, (usosUbicacion.get(n.location_id) ?? 0) + 1)
      }
    }
  } catch {
    // Sin niveles de inventario registrados; se sigue.
  }

  const regiones: Recurso[] = await regionService.listRegions({})
  const canales: Recurso[] = await channelService.listSalesChannels({})
  const ubicaciones: Recurso[] = await locationService.listStockLocations({})

  console.log("")
  console.log("=== CONFIGURACIÓN DEL PUNTO DE VENTA ===")
  console.log(`Modo: ${apply ? "APLICAR" : "SIMULACIÓN (sin cambios)"}`)
  console.log("")

  const aConservar = {
    region: regiones.length ? elegir(regiones, usosRegion, regionElegida) : null,
    canal: canales.length ? elegir(canales, new Map(), canalElegido) : null,
    ubicacion: ubicaciones.length
      ? elegir(ubicaciones, usosUbicacion, ubicacionElegida)
      : null,
  }

  const bloqueados: string[] = []
  const aEliminar: { tipo: string; recurso: Recurso; servicio: any; metodo: string }[] = []

  const reportar = (
    titulo: string,
    lista: Recurso[],
    conservado: Recurso | null,
    usos: Map<string, number>,
    etiquetaUso: string,
    servicio: any,
    metodo: string,
    extra?: (r: Recurso) => string
  ) => {
    console.log(`── ${titulo} (${lista.length})`)
    for (const r of lista) {
      const n = usos.get(r.id) ?? 0
      const marca = conservado?.id === r.id ? "CONSERVAR" : "eliminar "
      const uso = n ? `  ${n} ${etiquetaUso}` : ""
      console.log(
        `   ${marca}  ${r.id.slice(0, 24).padEnd(26)} ${(r.name ?? "(sin nombre)").padEnd(24)}${extra ? extra(r) : ""}${uso}`
      )

      if (conservado?.id !== r.id) {
        if (n > 0) {
          bloqueados.push(
            `${titulo}: "${r.name}" tiene ${n} ${etiquetaUso}; no se elimina para no dejar registros huérfanos.`
          )
        } else {
          aEliminar.push({ tipo: titulo, recurso: r, servicio, metodo })
        }
      }
    }
    console.log("")
  }

  reportar("Regiones", regiones, aConservar.region, usosRegion, "pedido(s)", regionService, "softDeleteRegions",
    (r) => ` ${String(r.currency_code ?? "").toUpperCase().padEnd(5)}`)
  reportar("Canales de venta", canales, aConservar.canal, new Map(), "", channelService, "softDeleteSalesChannels")
  reportar("Ubicaciones", ubicaciones, aConservar.ubicacion, usosUbicacion, "nivel(es) de inventario",
    locationService, "softDeleteStockLocations")

  // ── Moneda ────────────────────────────────────────────────────────────────
  const monedaActual = String(aConservar.region?.currency_code ?? "").toLowerCase()
  const cambiarMoneda = !!aConservar.region && monedaActual !== monedaDeseada

  if (cambiarMoneda) {
    console.log(`── Moneda: "${aConservar.region!.name}" pasa de ${monedaActual.toUpperCase()} a ${monedaDeseada.toUpperCase()}`)
    console.log("")
  } else if (aConservar.region) {
    console.log(`── Moneda: ya es ${monedaActual.toUpperCase()}; sin cambios.`)
    console.log("")
  }

  if (bloqueados.length) {
    console.log("⚠️  NO SE ELIMINAN (tienen datos asociados):")
    bloqueados.forEach((b) => console.log(`   ${b}`))
    console.log("")
    console.log("   Si de verdad sobran, indica cuál conservar para que el resto")
    console.log("   quede libre, por ejemplo:  ... apply region=<id>")
    console.log("")
  }

  if (!apply) {
    console.log("Simulación. Para aplicar:")
    console.log("   npx medusa exec ./src/scripts/normalize-pos-config.ts apply")
    return
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────
  if (cambiarMoneda) {
    await regionService.updateRegions(aConservar.region!.id, {
      currency_code: monedaDeseada,
    })
    console.log(`   ✓ Moneda actualizada a ${monedaDeseada.toUpperCase()}`)
  }

  for (const item of aEliminar) {
    await item.servicio[item.metodo]([item.recurso.id])
    console.log(`   ✓ ${item.tipo}: "${item.recurso.name}" eliminado`)
  }

  const quedan = {
    regiones: regiones.length - aEliminar.filter((x) => x.tipo === "Regiones").length,
    canales: canales.length - aEliminar.filter((x) => x.tipo === "Canales de venta").length,
    ubicaciones: ubicaciones.length - aEliminar.filter((x) => x.tipo === "Ubicaciones").length,
  }

  console.log("")
  console.log(`Estado final: ${quedan.canales} canal(es), ${quedan.regiones} región(es), ${quedan.ubicaciones} ubicación(es)`)

  if (quedan.regiones === 1 && quedan.canales === 1 && quedan.ubicaciones === 1) {
    console.log("El POS ya se configurará solo: el cajero no verá el asistente.")
  } else {
    console.log("Mientras haya más de uno de algo, el POS seguirá pidiendo elegir.")
  }
}
