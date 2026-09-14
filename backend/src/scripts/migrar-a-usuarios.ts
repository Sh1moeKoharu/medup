import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { DOMINIO_INTERNO, aIdentificador, revisarUsuario } from "../lib/usuarios"

/**
 * Convierte las cuentas que ya existen para que se entre con NOMBRE DE USUARIO.
 *
 *     npx medusa exec ./src/scripts/migrar-a-usuarios.ts            (simula)
 *     npx medusa exec ./src/scripts/migrar-a-usuarios.ts confirm    (ejecuta)
 *
 * ── POR QUÉ HACE FALTA UN SCRIPT Y NO BASTA CAMBIAR EL FORMULARIO ───────────
 * Una cuenta vive en DOS sitios a la vez:
 *
 *   · el perfil, con su `email`, que es lo que se enseña y por lo que se busca
 *   · la identidad de acceso, con su `entity_id`, que es contra lo que se
 *     compara al entrar
 *
 * Cambiar sólo uno deja la cuenta rota de una forma especialmente molesta: o
 * autentica pero no resuelve a ningún usuario, o resuelve pero ya no autentica.
 * En los dos casos la persona ve «el correo o la contraseña no son correctos» y
 * no hay nada en la contraseña que arreglar.
 *
 * ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
 * De `ana.torres@clinica.com.mx` saca el usuario `ana.torres` y lo guarda como
 * `ana.torres@sigh.local`, en los dos sitios. La contraseña NO se toca: el hash
 * vive en la identidad y sigue valiendo, así que nadie tiene que cambiarla.
 *
 * Lo que NO hace, a propósito:
 *
 *   · No toca la bitácora. Está encadenada por hash y los asientos ya escritos
 *     guardan el correo de entonces. Reescribirlos rompería la cadena, que es
 *     justo lo que la hace servir de algo. El historial queda mezclado y eso es
 *     correcto: dice con qué identificador se hizo cada cosa el día que se hizo.
 *   · No inventa un usuario cuando la parte izquierda del correo no vale como
 *     tal (acentos, mayúsculas raras, dos cuentas que colisionarían). Esas se
 *     listan para resolverlas a mano, porque elegir el nombre con el que alguien
 *     entra a diario no es decisión de un script.
 *
 * Simula por omisión. Sin `confirm` no escribe nada.
 */
export default async function migrarAUsuarios({ container, args }: ExecArgs) {
  const confirmado = (args ?? []).includes("confirm")

  const userService: any = container.resolve(Modules.USER)
  const authService: any = container.resolve(Modules.AUTH)

  const usuarios = await userService.listUsers({}, { take: 1000 })

  const yaHechas: string[] = []
  const porHacer: { id: string; de: string; a: string; usuario: string }[] = []
  const aMano: { correo: string; motivo: string }[] = []

  const destinos = new Map<string, string>()

  for (const u of usuarios) {
    const actual = String(u.email ?? "").trim().toLowerCase()
    if (!actual) {
      aMano.push({ correo: `(cuenta ${u.id} sin correo)`, motivo: "no tiene identificador" })
      continue
    }

    if (actual.endsWith(`@${DOMINIO_INTERNO}`)) {
      yaHechas.push(actual)
      continue
    }

    const propuesto = actual.split("@")[0]
    const problema = revisarUsuario(propuesto)
    if (problema) {
      aMano.push({ correo: actual, motivo: problema })
      continue
    }

    const destino = aIdentificador(propuesto)

    // Dos correos distintos pueden dar el mismo usuario: ana@clinica.mx y
    // ana@hospital.mx acabarían los dos en ana@sigh.local, y la columna tiene
    // índice único. Se para antes de escribir, no a mitad.
    const choca = destinos.get(destino)
    if (choca) {
      aMano.push({ correo: actual, motivo: `chocaría con ${choca}: los dos darían "${propuesto}"` })
      continue
    }
    destinos.set(destino, actual)

    porHacer.push({ id: u.id, de: actual, a: destino, usuario: propuesto })
  }

  // Y tampoco puede chocar con una cuenta que YA esté migrada.
  for (const p of [...porHacer]) {
    if (yaHechas.includes(p.a)) {
      porHacer.splice(porHacer.indexOf(p), 1)
      aMano.push({ correo: p.de, motivo: `"${p.usuario}" ya está ocupado` })
    }
  }

  console.log("")
  console.log("=== MIGRACIÓN A NOMBRES DE USUARIO ===")
  console.log(`Modo: ${confirmado ? "EJECUTAR" : "SIMULACIÓN (no se escribe nada)"}`)
  console.log("")

  if (yaHechas.length) {
    console.log(`── Ya migradas: ${yaHechas.length}`)
    yaHechas.forEach((c) => console.log(`   = ${c}`))
    console.log("")
  }

  console.log(`── Se van a convertir: ${porHacer.length}`)
  porHacer.forEach((p) => console.log(`   → ${p.de.padEnd(34)} entra como "${p.usuario}"`))
  console.log("")

  if (aMano.length) {
    console.log(`── HAY QUE RESOLVERLAS A MANO: ${aMano.length}`)
    aMano.forEach((p) => console.log(`   ! ${p.correo.padEnd(34)} ${p.motivo}`))
    console.log("")
    console.log("   Estas cuentas se quedan como están y siguen entrando con su")
    console.log("   correo completo. Cámbialas desde Ajustes → Personal.")
    console.log("")
  }

  if (!confirmado) {
    console.log("Simulación. Para ejecutar:")
    console.log("   npx medusa exec ./src/scripts/migrar-a-usuarios.ts confirm")
    console.log("")
    return
  }

  let errores = 0

  for (const p of porHacer) {
    try {
      // 1 · La identidad de acceso. Va PRIMERO: si algo falla, la cuenta sigue
      //     entrando con su correo de siempre, que es el estado seguro.
      //
      //     Se piden las identidades de PROVEEDOR directamente. Por
      //     `listAuthIdentities` no sirve: devuelve la identidad sin la
      //     relación cargada, así que `provider_identities` viene indefinido y
      //     revienta al leerlo.
      const identidades = await authService.listProviderIdentities({
        entity_id: p.de,
        provider: "emailpass",
      })

      if (!identidades.length) {
        errores++
        console.error(`   ! ${p.de}: no tiene identidad de acceso; se deja sin tocar`)
        continue
      }

      await authService.updateProviderIdentities([
        { id: identidades[0].id, entity_id: p.a },
      ])

      // 2 · El perfil.
      await userService.updateUsers([{ id: p.id, email: p.a }])

      console.log(`   ✓ ${p.de.padEnd(34)} → ${p.usuario}`)
    } catch (e: any) {
      errores++
      console.error(`   ! ${p.de}: ${e?.message ?? e}`)
    }
  }

  console.log("")
  if (errores === 0) {
    console.log(`LISTO. ${porHacer.length} cuenta(s) convertida(s).`)
    console.log("Las contraseñas no cambiaron: cada quien entra con la suya de siempre.")
  } else {
    console.log(`Terminado con ${errores} error(es). Revisa la lista de arriba.`)
  }
  console.log("")
}
