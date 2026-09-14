import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { NOMBRE_INVITADO_POS, POS_GUEST_EMAIL } from "../lib/pos-guest"

/**
 * Le pone nombre a la ficha «invitado» del punto de venta.
 *
 *     npx medusa exec ./src/scripts/nombrar-invitado-pos.ts            (simula)
 *     npx medusa exec ./src/scripts/nombrar-invitado-pos.ts confirm    (ejecuta)
 *
 * ── QUÉ ARREGLA ─────────────────────────────────────────────────────────────
 * Esa ficha se creaba sin nombre. Las pantallas de Medusa enseñan el nombre del
 * cliente y, cuando no hay, caen al correo, así que la tabla de Pedidos del
 * panel mostraba `noreply+pos-guest@agilo.com` en la columna Paciente de toda
 * venta de mostrador. El dato es correcto pero se lee como un error.
 *
 * Con nombre, esa misma columna dice «Venta de mostrador», que es exactamente
 * lo que esa venta es.
 *
 * ── POR QUÉ HACE FALTA UN SCRIPT ────────────────────────────────────────────
 * El punto de venta ya la crea con nombre, así que una instalación nueva sale
 * bien sola. Esto es para las que ya existen: la ficha se creó una vez, hace
 * meses, y no se vuelve a crear nunca.
 *
 * No toca nada más. No cambia el correo, que es lo que identifica a la ficha en
 * todo el sistema, ni la borra: borrarla rompería toda venta que empiece sin
 * paciente asignado, que es el caso normal en el mostrador.
 */
export default async function nombrarInvitadoPos({ container, args }: ExecArgs) {
  const confirmado = (args ?? []).includes("confirm")
  const customerService: any = container.resolve(Modules.CUSTOMER)

  const encontrados = await customerService.listCustomers({ email: POS_GUEST_EMAIL })

  console.log("")
  console.log("=== NOMBRE DE LA FICHA INVITADO DEL POS ===")
  console.log(`Modo: ${confirmado ? "EJECUTAR" : "SIMULACIÓN (no se escribe nada)"}`)
  console.log("")

  if (!encontrados.length) {
    console.log(`No existe ninguna ficha con ${POS_GUEST_EMAIL}.`)
    console.log("La crea el punto de venta la primera vez que se cobra sin paciente,")
    console.log("y desde ahora nace ya con nombre. No hay nada que hacer.")
    console.log("")
    return
  }

  const pendientes = encontrados.filter(
    (c: any) => c.first_name !== NOMBRE_INVITADO_POS.first_name ||
      c.last_name !== NOMBRE_INVITADO_POS.last_name
  )

  if (!pendientes.length) {
    console.log(`Ya se llama "${NOMBRE_INVITADO_POS.first_name} ${NOMBRE_INVITADO_POS.last_name}". Nada que hacer.`)
    console.log("")
    return
  }

  for (const c of pendientes) {
    const actual = [c.first_name, c.last_name].filter(Boolean).join(" ") || "(sin nombre)"
    console.log(`   ${c.id}   ${actual}  →  ${NOMBRE_INVITADO_POS.first_name} ${NOMBRE_INVITADO_POS.last_name}`)
  }
  console.log("")

  if (!confirmado) {
    console.log("Simulación. Para ejecutar:")
    console.log("   npx medusa exec ./src/scripts/nombrar-invitado-pos.ts confirm")
    console.log("")
    return
  }

  // La firma es (ids, datos), no un arreglo de objetos con `id` dentro. Con la
  // otra forma revienta con "Cannot read properties of undefined".
  await customerService.updateCustomers(
    pendientes.map((c: any) => c.id),
    { ...NOMBRE_INVITADO_POS }
  )

  console.log(`LISTO. ${pendientes.length} ficha(s) con nombre.`)
  console.log("")
}
