import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createCustomersWorkflow,
  createDefaultsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateSalesChannelsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { assertNotProduction } from "../lib/test-users"
import nombrarInvitadoPos from "./nombrar-invitado-pos"
import prepararAlmacenes from "./preparar-almacenes"
import revisarTextos from "./revisar-textos"
import runBlockExpired from "./run-block-expired"
import seedCatalogoDemo from "./seed-catalogo-demo"
import seedCustomers from "./seed-customers"
import seedTestUsers from "./seed-test-users"

/**
 * DEMO COMPLETA: deja una base recién migrada con todo lo necesario para usar
 * y enseñar el sistema, en un solo comando.
 *
 *   SIGH_ALLOW_TEST_SEED=1 npm run seed:demo      (en el servidor, modo producción)
 *   npm run seed:demo                              (en desarrollo)
 *
 * ── LAS DOS MITADES ─────────────────────────────────────────────────────────
 * 1. ESTRUCTURA (aquí, sin servidor): tienda, moneda, región, canal de venta,
 *    los dos almacenes, las seis cuentas de prueba, el catálogo con lotes de
 *    caducidades escalonadas, los pacientes con expediente y los convenios.
 *
 * 2. ACTIVIDAD (pruebas/sembrar-actividad.mjs, CONTRA EL SERVIDOR): un día de
 *    trabajo de cada perfil —recetas, traspasos, bajas, ventas, cortes, notas,
 *    turnos y comisión—.
 *
 * La actividad no se escribe desde aquí a propósito. La bitácora la escribe el
 * servidor en cada petición, y el kardex, el FEFO y la cuenta del paciente
 * viven en las rutas. Crear ventas o recetas directamente en la base daría
 * pantallas con datos pero una bitácora vacía y un kardex que no cuadra: una
 * demostración de algo que el sistema no hace. Por la API, cada registro queda
 * exactamente como si lo hubiera hecho esa persona.
 *
 * Si al terminar la estructura el servidor responde, la actividad se lanza sola.
 * Si no, se dice cómo lanzarla.
 *
 * ── SE PUEDE REPETIR ────────────────────────────────────────────────────────
 * La estructura es idempotente: busca antes de crear. La actividad deja una
 * marca en la tienda y no se repite salvo que se pida con `otra-vez`.
 *
 * ⚠️ Crea seis cuentas con la contraseña pública de pruebas, una de ellas de
 * administrador. Sólo para bases de demostración. Para quitarlas antes de meter
 * datos reales: scripts/limpiar-datos-prueba.ts.
 */

const NOMBRE_TIENDA = "Clínica Altus"
const NOMBRE_REGION = "México"
const NOMBRE_CANAL = "Mostrador"
const DESCRIPCION_CANAL = "Punto de venta de la clínica"
const NOMBRE_ALMACEN = "Almacén principal"
/** La ficha con la que el punto de venta cobra lo que no es de un paciente. Ver frontend/api/hooks/draft-orders.tsx. */
const CORREO_INVITADO_POS = "noreply+pos-guest@agilo.com"

const titulo = (texto: string) => {
  console.log("")
  console.log(`━━━ ${texto} ${"━".repeat(Math.max(0, 66 - texto.length))}`)
}

export default async function seedDemoCompleto({ container, args }: ExecArgs) {
  assertNotProduction("seed-demo-completo")
  const lista = args ?? []
  const soloEstructura = lista.includes("solo-estructura")

  console.log("")
  console.log("══════════════════════════════════════════════════════════════════════")
  console.log("  DEMO COMPLETA DE ALTUS")
  console.log("══════════════════════════════════════════════════════════════════════")

  // ── 1. Lo que Medusa necesita para vender ─────────────────────────────────
  titulo("1 · Tienda, moneda, región, canal y almacén")
  await base(container)

  // ── 2. Lo que ya existía, en el orden en que depende una cosa de otra ─────
  // Cada script es el mismo que se corre suelto; aquí sólo se encadenan.
  titulo("2 · Cuentas de prueba")
  await seedTestUsers({ container, args: [] } as any)

  titulo("3 · Almacenes de Farmacia y Enfermería")
  await prepararAlmacenes({ container, args: ["confirm"] } as any)

  titulo("4 · Catálogo con lotes de caducidades escalonadas")
  await seedCatalogoDemo({ container, args: [] } as any)

  titulo("5 · Pacientes con expediente y convenios")
  await seedCustomers({ container, args: [] } as any)

  titulo("6 · Textos de la clínica y ficha de mostrador")
  await revisarTextos({ container, args: ["confirm"] } as any)
  await nombrarInvitadoPos({ container, args: ["confirm"] } as any)

  // El lote vencido del catálogo pasa a cuarentena ya, sin esperar al trabajo
  // de cada mañana: así Farmacia tiene uno que destruir desde el primer día.
  titulo("7 · Cuarentena de lo que ya caducó")
  await runBlockExpired({ container } as any)

  // ── 3. La actividad, contra el servidor ───────────────────────────────────
  titulo("8 · Un día de trabajo de cada perfil")
  if (soloEstructura) {
    console.log("   Pediste sólo la estructura. Para la actividad, con el servidor arrancado:")
    console.log("      npm run seed:actividad")
    return
  }

  const baseUrl = process.env.ALTUS_API_URL || process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  let responde = false
  try {
    responde = (await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(4000) })).ok
  } catch {
    responde = false
  }

  if (!responde) {
    console.log(`   El servidor no responde en ${baseUrl}. La estructura quedó lista.`)
    console.log("   Arranca el servidor y luego, en esta misma carpeta:")
    console.log("      npm run seed:actividad")
    console.log("")
    return
  }

  const script = path.join(process.cwd(), "pruebas", "sembrar-actividad.mjs")
  const hijo = spawnSync(process.execPath, [script, ...lista.filter((a) => a === "otra-vez")], {
    stdio: "inherit",
    env: { ...process.env, ALTUS_API_URL: baseUrl },
  })
  if (hijo.status !== 0) {
    throw new Error("La actividad no terminó. La estructura sí quedó; revisa el mensaje de arriba y vuelve a lanzar `npm run seed:actividad`.")
  }
}

/**
 * Tienda, moneda, región, canal de venta y almacén principal.
 *
 * Es lo que el asistente del punto de venta pedía crear a mano la primera vez.
 * Sin esto no hay dónde poner precios, ni desde dónde vender, ni almacén que
 * marcar como Farmacia. Todo busca antes de crear.
 */
async function base(container: ExecArgs["container"]) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storeService: any = container.resolve(Modules.STORE)
  const regionService: any = container.resolve(Modules.REGION)
  const channelService: any = container.resolve(Modules.SALES_CHANNEL)
  const locationService: any = container.resolve(Modules.STOCK_LOCATION)
  const customerService: any = container.resolve(Modules.CUSTOMER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)

  // Tienda, canal por omisión, perfil de envío y llave publicable: lo que
  // Medusa crea al primer arranque. Si ya existen, no hace nada.
  await createDefaultsWorkflow(container).run()

  // ── Canal de venta ──
  let canales = await channelService.listSalesChannels({})
  let canal = canales.find((c: any) => c.name === NOMBRE_CANAL)
  if (!canal) {
    const porOmision = canales.find((c: any) => c.name === "Default Sales Channel")
    if (porOmision && canales.length === 1) {
      await updateSalesChannelsWorkflow(container).run({
        input: { selector: { id: porOmision.id }, update: { name: NOMBRE_CANAL, description: DESCRIPCION_CANAL } },
      })
      console.log(`   Canal       ${NOMBRE_CANAL} (se renombró el de Medusa)`)
    } else {
      await createSalesChannelsWorkflow(container).run({
        input: { salesChannelsData: [{ name: NOMBRE_CANAL, description: DESCRIPCION_CANAL }] },
      })
      console.log(`   Canal       ${NOMBRE_CANAL} (creado)`)
    }
    canales = await channelService.listSalesChannels({})
    canal = canales.find((c: any) => c.name === NOMBRE_CANAL)
  } else {
    console.log(`   Canal       ${NOMBRE_CANAL} (ya estaba)`)
  }

  // ── Región con pesos ──
  let regiones = await regionService.listRegions({}, { relations: ["countries"] })
  let region = regiones.find((r: any) => r.currency_code === "mxn")
  if (!region) {
    const conMexico = regiones.find((r: any) => (r.countries ?? []).some((c: any) => c.iso_2 === "mx"))
    if (conMexico) {
      throw new Error(`México ya pertenece a la región «${conMexico.name}», que no es en pesos. Corrígelo en el panel antes de sembrar.`)
    }
    await createRegionsWorkflow(container).run({
      input: { regions: [{ name: NOMBRE_REGION, currency_code: "mxn", countries: ["mx"], automatic_taxes: true }] },
    })
    regiones = await regionService.listRegions({}, { relations: ["countries"] })
    region = regiones.find((r: any) => r.currency_code === "mxn")
    console.log(`   Región      ${NOMBRE_REGION}, MXN (creada)`)
  } else {
    console.log(`   Región      ${region.name}, MXN (ya estaba)`)
  }

  // ── Almacén principal, que preparar-almacenes marcará como Farmacia ──
  let ubicaciones = await locationService.listStockLocations({})
  let almacen = ubicaciones.find((u: any) => u.name === NOMBRE_ALMACEN) ?? (ubicaciones.length === 1 ? ubicaciones[0] : null)
  if (!almacen && ubicaciones.length === 0) {
    await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: NOMBRE_ALMACEN }] } })
    ubicaciones = await locationService.listStockLocations({})
    almacen = ubicaciones.find((u: any) => u.name === NOMBRE_ALMACEN)
    console.log(`   Almacén     ${NOMBRE_ALMACEN} (creado)`)
  } else if (almacen) {
    console.log(`   Almacén     ${almacen.name} (ya estaba)`)
  } else {
    console.log(`   Almacén     hay ${ubicaciones.length} ubicaciones y ninguna se llama «${NOMBRE_ALMACEN}»; se deja como está`)
  }

  // El canal tiene que poder vender desde ese almacén.
  if (almacen && canal) {
    const { data: enlaces } = await query.graph({
      entity: "stock_location",
      fields: ["id", "sales_channels.id"],
      filters: { id: almacen.id },
    })
    const yaEnlazado = (enlaces?.[0]?.sales_channels ?? []).some((c: any) => c.id === canal.id)
    if (!yaEnlazado) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: almacen.id, add: [canal.id] } })
      console.log(`   Enlace      ${NOMBRE_CANAL} vende desde ${almacen.name}`)
    }
  }

  // ── Tienda: nombre, pesos y valores por omisión ──
  const [tienda] = await storeService.listStores({}, { relations: ["supported_currencies"] })
  if (tienda) {
    const monedas = (tienda.supported_currencies ?? []).map((m: any) => m.currency_code)
    const metadata = tienda.metadata ?? {}
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: tienda.id },
        update: {
          name: NOMBRE_TIENDA,
          supported_currencies: monedas.includes("mxn")
            ? tienda.supported_currencies.map((m: any) => ({ currency_code: m.currency_code, is_default: m.currency_code === "mxn" }))
            : [{ currency_code: "mxn", is_default: true }],
          default_sales_channel_id: canal?.id,
          default_region_id: region?.id,
          default_location_id: almacen?.id,
          // El pie del ticket sólo si no se configuró ya: no se pisa lo que puso la clínica.
          metadata: metadata.recibo
            ? metadata
            : { ...metadata, recibo: { nombre: "", direccion: "", telefono: "", rfc: "XAXX010101000", pie: "Gracias por su compra" } },
        },
      },
    })
    console.log(`   Tienda      ${NOMBRE_TIENDA}, pesos por omisión`)
  }

  // ── La ficha de mostrador, con nombre ──
  const [invitado] = await customerService.listCustomers({ email: CORREO_INVITADO_POS })
  if (!invitado) {
    await createCustomersWorkflow(container).run({
      input: { customersData: [{ email: CORREO_INVITADO_POS, first_name: "Venta", last_name: "de mostrador" }] },
    })
    console.log("   Mostrador   ficha «Venta de mostrador» (creada)")
  }

  logger.info("Base lista")
}
