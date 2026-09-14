import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { roleLabel } from "../lib/roles"
import { aIdentificador, aUsuario } from "../lib/usuarios"
import {
  CLAVE_NUMERO_EMPLEADO,
  normalizarNumeroDeEmpleado,
  numeroDeEmpleado,
  quienTieneElNumeroEntre,
  revisarNumeroDeEmpleado,
} from "../lib/personal"

/**
 * Número de empleado de las cuentas que ya existen.
 *
 *     npx medusa exec ./src/scripts/numerar-personal.ts                          (lista)
 *     npx medusa exec ./src/scripts/numerar-personal.ts usuario=caja numero=0003  (asigna)
 *
 * ── POR QUÉ NO LOS INVENTA ──────────────────────────────────────────────────
 * El número de empleado es el que la clínica ya usa para su gente en nómina y
 * en credenciales. Generar uno correlativo aquí daría un número que no
 * coincide con ninguno de esos, y después habría que cambiarlo a mano cuenta
 * por cuenta. Así que este script sólo dice quién no tiene, y asigna el que se
 * le indique. Uno por ejecución, para que cada asignación se lea entera.
 *
 * Lo mismo se puede hacer desde Ajustes → Personal → Editar. Esto existe para
 * el servidor, donde a veces no hay panel a mano.
 *
 * La bitácora NO se toca: los asientos ya escritos no llevan número, y añadirlo
 * ahora rompería su huella. Lo llevan los que se escriban a partir de aquí.
 */
export default async function numerarPersonal({ container, args }: ExecArgs) {
  const parametros = Object.fromEntries(
    (args ?? [])
      .filter((a) => a.includes("="))
      .map((a) => {
        const [k, ...v] = a.split("=")
        return [k.trim(), v.join("=").trim()]
      })
  ) as { usuario?: string; numero?: string }

  const userService: any = container.resolve(Modules.USER)
  const activos = await userService.listUsers({}, { take: 1000 })

  console.log("")
  console.log("=== NÚMERO DE EMPLEADO ===")
  console.log("")

  // ── Asignación ────────────────────────────────────────────────────────────
  if (parametros.usuario || parametros.numero) {
    if (!parametros.usuario || !parametros.numero) {
      console.log("   Hacen falta los dos: usuario=... numero=...")
      console.log("")
      return
    }

    const numero = normalizarNumeroDeEmpleado(parametros.numero)
    const problema = revisarNumeroDeEmpleado(numero)
    if (problema) {
      console.log(`   ${problema}`)
      console.log("")
      return
    }

    const identificador = aIdentificador(parametros.usuario.toLowerCase())
    const cuenta = activos.find(
      (u: any) => String(u.email ?? "").toLowerCase() === identificador
    )
    if (!cuenta) {
      console.log(`   No existe la cuenta "${aUsuario(identificador)}".`)
      console.log("")
      return
    }

    // Contra TODAS las cuentas, incluidas las dadas de baja: el número de
    // alguien que se fue no se recicla.
    const todas = await userService.listUsers({}, { take: 1000, withDeleted: true })
    const dueño = quienTieneElNumeroEntre(todas, numero, cuenta.id)
    if (dueño) {
      console.log(`   El número ${numero} ya lo tiene ${aUsuario(dueño)}.`)
      console.log("")
      return
    }

    const anterior = numeroDeEmpleado(cuenta)
    await userService.updateUsers([
      {
        id: cuenta.id,
        metadata: { ...(cuenta.metadata ?? {}), [CLAVE_NUMERO_EMPLEADO]: numero },
      },
    ])

    console.log(
      `   ${aUsuario(cuenta.email).padEnd(20)} ${anterior ? `Nº ${anterior} -> ` : ""}Nº ${numero}`
    )
    console.log("")
    return
  }

  // ── Listado ───────────────────────────────────────────────────────────────
  const sinNumero: any[] = []

  for (const u of activos) {
    const numero = numeroDeEmpleado(u)
    if (!numero) sinNumero.push(u)
    console.log(
      `   ${aUsuario(u.email).padEnd(20)} ${roleLabel((u.metadata as any)?.role).padEnd(22)} ${
        numero ? `Nº ${numero}` : "— sin número —"
      }`
    )
  }

  console.log("")
  if (sinNumero.length) {
    console.log(`   ${sinNumero.length} cuenta(s) sin número. Para asignar uno:`)
    console.log("")
    console.log(
      `      npx medusa exec ./src/scripts/numerar-personal.ts usuario=${aUsuario(
        sinNumero[0].email
      )} numero=0001`
    )
  } else {
    console.log("   Todas las cuentas tienen número de empleado.")
  }
  console.log("")
}
