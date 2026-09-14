import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Busca —y arregla— textos con la codificación rota.
 *
 *     npx medusa exec ./src/scripts/revisar-textos.ts            (sólo informa)
 *     npx medusa exec ./src/scripts/revisar-textos.ts confirm    (arregla)
 *
 * ── QUÉ ES ESTO ─────────────────────────────────────────────────────────────
 * En la barra lateral del panel se leía «Cl<?>nica Altus»: la í se había
 * perdido. No era cosa de cómo se pinta, era el DATO. Guardado estaba el
 * carácter de reemplazo U+FFFD, que es lo que queda cuando unos bytes se leen
 * con una codificación que no es la suya.
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 * De teclear texto con acentos en una consola de Windows. Ningún script del
 * repositorio escribe esos nombres —se comprobó—, así que se pusieron a mano al
 * montar el servidor. La consola de Windows no habla UTF-8 por omisión, y lo
 * que llega al otro lado ya viene roto: no hay forma de recuperarlo después,
 * porque el byte original se perdió al escribirse.
 *
 * Por eso este script existe y por eso los valores buenos van AQUÍ, en un
 * archivo del repositorio que sí está en UTF-8. Poner el nombre de la clínica
 * deja de pasar por una consola.
 *
 * ── QUÉ REVISA ──────────────────────────────────────────────────────────────
 * El nombre de la tienda y el canal de venta, que es donde apareció. Y de paso
 * avisa de cualquier otro sitio donde encuentre el mismo síntoma, para que no
 * haya que descubrirlo mirando pantallas.
 */

/** Los valores correctos. Se editan aquí, nunca en una consola. */
const TIENDA = "Clínica Altus"
const CANAL_DESCRIPCION = "Punto de venta de la clínica"

/**
 * Las tres formas en que se ve una codificación rota:
 *   · U+FFFD, el rombo con el interrogante: el byte ya se perdió
 *   · «Ã©», «Ã­»…: UTF-8 leído como latin-1
 *   · «â€™», «Â»: comillas y espacios de Word pasados por el mismo camino
 */
const ROTO = /[�]|Ã[-¿]|â€|Â[-¿]/

const marcar = (texto?: string | null): string =>
  texto && ROTO.test(texto) ? `${JSON.stringify(texto)}  ← ROTO` : JSON.stringify(texto ?? null)

export default async function revisarTextos({ container, args }: ExecArgs) {
  const confirmado = (args ?? []).includes("confirm")

  const storeService: any = container.resolve(Modules.STORE)
  const channelService: any = container.resolve(Modules.SALES_CHANNEL)
  const productService: any = container.resolve(Modules.PRODUCT)
  const customerService: any = container.resolve(Modules.CUSTOMER)

  console.log("")
  console.log("=== REVISIÓN DE CODIFICACIÓN ===")
  console.log(`Modo: ${confirmado ? "ARREGLAR" : "SÓLO INFORMAR"}`)
  console.log("")

  const arreglos: string[] = []

  // ── Tienda ────────────────────────────────────────────────────────────────
  const [tienda] = await storeService.listStores({})
  if (tienda) {
    console.log(`Tienda        ${marcar(tienda.name)}`)
    if (tienda.name !== TIENDA) {
      arreglos.push(`tienda: ${JSON.stringify(tienda.name)} → ${JSON.stringify(TIENDA)}`)
      if (confirmado) await storeService.updateStores(tienda.id, { name: TIENDA })
    }
  }

  // ── Canal de venta ────────────────────────────────────────────────────────
  const canales = await channelService.listSalesChannels({})
  for (const c of canales) {
    console.log(`Canal         ${marcar(c.name)}  /  ${marcar(c.description)}`)
    if (ROTO.test(c.description ?? "")) {
      arreglos.push(`canal ${c.name}: ${JSON.stringify(c.description)} → ${JSON.stringify(CANAL_DESCRIPCION)}`)
      if (confirmado) await channelService.updateSalesChannels(c.id, { description: CANAL_DESCRIPCION })
    }
  }

  // ── El resto: sólo se avisa ───────────────────────────────────────────────
  //
  // No se tocan solos. Un nombre de producto o de paciente lo tiene que
  // corregir alguien que sepa cómo se escribe de verdad; adivinarlo sería
  // inventarse el dato de un expediente.
  const sospechosos: string[] = []

  for (const p of await productService.listProducts({}, { take: 500 })) {
    for (const campo of ["title", "subtitle", "description"] as const) {
      if (ROTO.test((p as any)[campo] ?? "")) {
        sospechosos.push(`producto ${p.id}  ${campo}: ${JSON.stringify((p as any)[campo])}`)
      }
    }
  }

  for (const c of await customerService.listCustomers({}, { take: 500 })) {
    for (const campo of ["first_name", "last_name", "company_name"] as const) {
      if (ROTO.test((c as any)[campo] ?? "")) {
        sospechosos.push(`paciente ${c.id}  ${campo}: ${JSON.stringify((c as any)[campo])}`)
      }
    }
  }

  console.log("")
  if (sospechosos.length) {
    console.log(`── A MANO: ${sospechosos.length} texto(s) rotos que este script NO toca`)
    sospechosos.forEach((s) => console.log(`   ! ${s}`))
    console.log("")
    console.log("   Un nombre de producto o de paciente lo corrige alguien que sepa")
    console.log("   cómo se escribe. Adivinarlo sería inventarse un expediente.")
    console.log("")
  } else {
    console.log("Productos y pacientes: sin problemas de codificación.")
    console.log("")
  }

  if (!arreglos.length) {
    console.log("Nada que arreglar.")
    console.log("")
    return
  }

  console.log(`── ${confirmado ? "ARREGLADO" : "SE ARREGLARÍA"}: ${arreglos.length}`)
  arreglos.forEach((a) => console.log(`   ${confirmado ? "✓" : "→"} ${a}`))
  console.log("")

  if (!confirmado) {
    console.log("Para aplicarlo:")
    console.log("   npx medusa exec ./src/scripts/revisar-textos.ts confirm")
    console.log("")
  }
}
