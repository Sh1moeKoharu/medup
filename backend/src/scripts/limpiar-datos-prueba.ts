import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { B2B_AGREEMENTS_MODULE } from "../modules/b2b-agreements"
import { MEDICAL_CUSTOMER_MODULE } from "../modules/medical-customer"
import { TEST_USERS } from "../lib/test-users"
import { normalizeRole, ROLES } from "../lib/roles"

/**
 * ⚠️ SCRIPT DESTRUCTIVO — deja el sistema listo para el cliente.
 *
 *   npx medusa exec ./src/scripts/limpiar-datos-prueba.ts           (simulación)
 *   npx medusa exec ./src/scripts/limpiar-datos-prueba.ts confirm   (ejecuta)
 *
 * Borra lo que se sembró para probar y no debe llegar a producción:
 *
 *   · Las seis cuentas @sigh.test. Su contraseña está escrita en el repositorio,
 *     que es PÚBLICO, y una de ellas es de administrador. Dejarlas equivale a
 *     publicar seis credenciales válidas del sistema de la clínica.
 *   · Los pacientes @paciente.test y su expediente.
 *   · Los convenios de empresas ficticias (*.test).
 *
 * ── LA GUARDA QUE IMPORTA ───────────────────────────────────────────────────
 * Se niega a borrar si no existe YA un administrador real. Borrar el último
 * administrador deja a todo el mundo fuera y sin camino de vuelta: las
 * invitaciones están cerradas y la escritura de usuarios nativa también, así
 * que recuperarlo exigiría tocar la base a mano.
 *
 * Crea primero el administrador real:
 *
 *     cd ~/altus/backend
 *     npx medusa user -e director@clinica.mx -p 'UnaClaveLargaYUnica'
 *
 * y después entra al panel a asignarle el rol en Ajustes → Personal.
 *
 * ── ANTES DE BORRAR ─────────────────────────────────────────────────────────
 * Guarda un respaldo JSON en `.backups/`. No devuelve las cuentas por sí solo
 * —las identidades de acceso no se restauran con un copiar y pegar— pero deja
 * constancia de qué había, que es lo que hace falta si algo se echa de menos.
 */

const DOMINIO_USUARIOS = "@sigh.test"
const DOMINIO_PACIENTES = "@paciente.test"

export default async function limpiarDatosPrueba({ container, args }: ExecArgs) {
  const confirmado = (args ?? []).includes("confirm")

  const userService: any = container.resolve(Modules.USER)
  const customerService: any = container.resolve(Modules.CUSTOMER)
  const authService: any = container.resolve(Modules.AUTH)
  const agreementService: any = container.resolve(B2B_AGREEMENTS_MODULE)
  const medicalCustomerService: any = container.resolve(MEDICAL_CUSTOMER_MODULE)

  console.log("")
  console.log("=== LIMPIEZA DE DATOS DE PRUEBA ===")
  console.log(`Modo: ${confirmado ? "EJECUTAR (borra de verdad)" : "SIMULACION (no se toca nada)"}`)
  console.log("")

  // ── Qué hay ───────────────────────────────────────────────────────────────
  const todosLosUsuarios = await userService.listUsers({})
  const correosPrueba = new Set(TEST_USERS.map((u) => u.email.toLowerCase()))

  const usuariosPrueba = todosLosUsuarios.filter((u: any) => {
    const correo = String(u.email ?? "").toLowerCase()
    return correo.endsWith(DOMINIO_USUARIOS) || correosPrueba.has(correo)
  })

  const usuariosReales = todosLosUsuarios.filter(
    (u: any) => !usuariosPrueba.some((p: any) => p.id === u.id)
  )

  const adminsReales = usuariosReales.filter(
    (u: any) => normalizeRole((u.metadata as any)?.role) === ROLES.ADMIN
  )

  const todosLosClientes = await customerService.listCustomers({})
  const clientesPrueba = todosLosClientes.filter((c: any) =>
    String(c.email ?? "").toLowerCase().endsWith(DOMINIO_PACIENTES)
  )

  let conveniosPrueba: any[] = []
  try {
    const convenios = await agreementService.listBusinessAgreements({})
    conveniosPrueba = convenios.filter((a: any) =>
      String(a.contact_email ?? "").toLowerCase().endsWith(".test")
    )
  } catch {
    // El módulo puede no tener nada registrado todavía.
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log("SE VA A BORRAR")
  console.log(`   Cuentas de prueba : ${usuariosPrueba.length}`)
  usuariosPrueba.forEach((u: any) => console.log(`      ${u.email}`))
  console.log(`   Pacientes de prueba: ${clientesPrueba.length}`)
  console.log(`   Convenios ficticios: ${conveniosPrueba.length}`)
  conveniosPrueba.forEach((a: any) => console.log(`      ${a.company_name}`))
  console.log("")

  console.log("SE CONSERVA")
  console.log(`   Cuentas reales     : ${usuariosReales.length}`)
  usuariosReales.forEach((u: any) =>
    console.log(`      ${String(u.email).padEnd(34)} ${(u.metadata as any)?.role ?? "sin rol"}`)
  )
  console.log(`   Pacientes reales   : ${todosLosClientes.length - clientesPrueba.length}`)
  console.log("")

  // ── La guarda ─────────────────────────────────────────────────────────────
  if (usuariosPrueba.length > 0 && adminsReales.length === 0) {
    console.log("═══════════════════════════════════════════════════════════════")
    console.log(" NO SE BORRA NADA.")
    console.log("")
    console.log(" No existe ningún administrador real. Si se borraran ahora las")
    console.log(" cuentas de prueba, nadie podría volver a entrar al sistema: las")
    console.log(" invitaciones están cerradas y la gestión nativa de usuarios")
    console.log(" también, así que recuperarlo exigiría tocar la base a mano.")
    console.log("")
    console.log(" Crea primero el administrador real:")
    console.log("")
    console.log("    cd ~/altus/backend")
    console.log("    npx medusa user -e director@clinica.mx -p 'UnaClaveLargaYUnica'")
    console.log("")
    console.log(" Entra al panel con esa cuenta, ve a Ajustes → Personal y")
    console.log(" asígnale el rol de Administrador. Después vuelve a ejecutar")
    console.log(" este script.")
    console.log("═══════════════════════════════════════════════════════════════")
    console.log("")
    return
  }

  if (!confirmado) {
    console.log("Simulación. Para ejecutar de verdad:")
    console.log("   npx medusa exec ./src/scripts/limpiar-datos-prueba.ts confirm")
    console.log("")
    return
  }

  // ── Respaldo ──────────────────────────────────────────────────────────────
  const dirRespaldo = path.resolve(process.cwd(), ".backups")
  fs.mkdirSync(dirRespaldo, { recursive: true })
  const archivo = path.join(dirRespaldo, `datos-prueba-borrados-${Date.now()}.json`)
  fs.writeFileSync(
    archivo,
    JSON.stringify(
      { usuarios: usuariosPrueba, clientes: clientesPrueba, convenios: conveniosPrueba },
      null,
      2
    )
  )
  console.log(`Respaldo: ${archivo}`)
  console.log("")

  // ── Borrado ───────────────────────────────────────────────────────────────
  let errores = 0

  for (const a of conveniosPrueba) {
    try {
      await agreementService.deleteBusinessAgreements([a.id])
      console.log(`   - convenio  ${a.company_name}`)
    } catch (e: any) {
      errores++
      console.error(`   ! convenio  ${a.company_name}: ${e?.message ?? e}`)
    }
  }

  for (const c of clientesPrueba) {
    // El expediente médico va antes que el cliente: al revés quedaría un
    // expediente apuntando a un paciente que ya no existe.
    try {
      const expedientes = await medicalCustomerService.listMedicalCustomers({
        customer_id: c.id,
      })
      if (expedientes?.length) {
        await medicalCustomerService.deleteMedicalCustomers(
          expedientes.map((e: any) => e.id)
        )
      }
    } catch {
      // Sin expediente asociado; se continúa con el cliente.
    }

    try {
      await customerService.deleteCustomers([c.id])
    } catch (e: any) {
      errores++
      console.error(`   ! paciente  ${c.email}: ${e?.message ?? e}`)
    }
  }
  console.log(`   - ${clientesPrueba.length} paciente(s) de prueba`)

  for (const u of usuariosPrueba) {
    // Primero la identidad de acceso: si se borra el usuario y queda la
    // identidad, el correo sigue ocupado y no se puede volver a dar de alta.
    try {
      const identidades = await authService.listAuthIdentities({
        provider_identities: { entity_id: u.email },
      })
      if (identidades?.length) {
        await authService.deleteAuthIdentities(identidades.map((i: any) => i.id))
      }
    } catch (e: any) {
      console.error(`   ! identidad ${u.email}: ${e?.message ?? e}`)
    }

    try {
      await userService.deleteUsers([u.id])
      console.log(`   - cuenta    ${u.email}`)
    } catch (e: any) {
      errores++
      console.error(`   ! cuenta    ${u.email}: ${e?.message ?? e}`)
    }
  }

  // ── Comprobación final ────────────────────────────────────────────────────
  const restantes = await userService.listUsers({})
  const quedanPrueba = restantes.filter((u: any) =>
    String(u.email ?? "").toLowerCase().endsWith(DOMINIO_USUARIOS)
  )

  console.log("")
  if (errores === 0 && quedanPrueba.length === 0) {
    console.log("LISTO. No queda ninguna cuenta de prueba.")
  } else {
    console.log(`Terminado con ${errores} error(es).`)
    if (quedanPrueba.length) {
      console.log(`ATENCION: siguen existiendo ${quedanPrueba.length} cuenta(s) de prueba:`)
      quedanPrueba.forEach((u: any) => console.log(`   ${u.email}`))
    }
  }
  console.log("")
  console.log(`Cuentas activas: ${restantes.length}`)
  restantes.forEach((u: any) =>
    console.log(`   ${String(u.email).padEnd(34)} ${(u.metadata as any)?.role ?? "sin rol"}`)
  )
  console.log("")
}
