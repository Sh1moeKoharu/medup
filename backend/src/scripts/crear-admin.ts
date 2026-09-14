import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as crypto from "crypto"
import { ROLES, ROLE_LABELS, normalizeRole } from "../lib/roles"
import { TEST_USERS } from "../lib/test-users"
import { aIdentificador, aUsuario, revisarUsuario } from "../lib/usuarios"

/**
 * Crea la cuenta de administrador real del cliente.
 *
 *   npx medusa exec ./src/scripts/crear-admin.ts usuario=director
 *   npx medusa exec ./src/scripts/crear-admin.ts usuario=director nombre=Ana apellido=Torres
 *   npx medusa exec ./src/scripts/crear-admin.ts usuario=director clave='LaQueYoElija'
 *
 * ── POR QUÉ ESTE SCRIPT Y NO `npx medusa user` ──────────────────────────────
 * `medusa user` crea la cuenta pero NO le pone rol, y en este sistema el rol
 * vive en `user.metadata.role`: sin él la cuenta entra, pero los permisos la
 * tratan como una cuenta heredada. Había que entrar al panel a asignarlo a
 * mano, que es justo el paso que se olvida.
 *
 * ── LA CONTRASEÑA SE GENERA AQUÍ ────────────────────────────────────────────
 * Por omisión la genera este script, en el servidor, con el generador
 * criptográfico del sistema. Así nunca viaja por correo ni por un chat, y
 * nadie la eligió pensando en algo memorable.
 *
 * Se imprime UNA sola vez. No queda guardada en ningún lado en texto plano:
 * lo que se almacena es su hash. Si se pierde, no se recupera — se genera otra.
 */

/**
 * Alfabeto sin caracteres que se confunden al dictar o copiar a mano:
 * ni O/0, ni l/I/1. La contraseña se va a teclear en tabletas del mostrador.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_@#%+="
const LONGITUD = 20

function generarClave(): string {
  // randomInt del módulo crypto: sin sesgo de módulo y sin Math.random.
  let salida = ""
  for (let i = 0; i < LONGITUD; i++) {
    salida += ALFABETO[crypto.randomInt(0, ALFABETO.length)]
  }
  return salida
}

export default async function crearAdmin({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const valor = (clave: string) => {
    const encontrado = execArgs.find((a) => a.startsWith(`${clave}=`))
    return encontrado ? encontrado.slice(clave.length + 1) : undefined
  }

  // Se sigue admitiendo `correo=` para no romper notas de instalación
  // antiguas: si lo que llega trae arroba, se guarda tal cual.
  const tecleado = (valor("usuario") ?? valor("correo") ?? valor("email"))
    ?.trim()
    .toLowerCase()
  const nombre = valor("nombre") ?? "Administrador"
  const apellido = valor("apellido") ?? ""
  const claveManual = valor("clave") ?? valor("password")

  console.log("")
  console.log("=== ALTA DE ADMINISTRADOR ===")
  console.log("")

  if (!tecleado) {
    console.error("Falta el usuario. Uso:")
    console.error("   npx medusa exec ./src/scripts/crear-admin.ts usuario=director")
    console.error("")
    console.error("Opcionales: nombre=Ana apellido=Torres clave='LaQueYoElija'")
    return
  }

  if (!tecleado.includes("@")) {
    const problema = revisarUsuario(tecleado)
    if (problema) {
      console.error(problema)
      return
    }
  }

  const correo = aIdentificador(tecleado)
  const usuario = aUsuario(correo)

  // Las cuentas de prueba llevan contraseña pública en el repositorio. Crear el
  // administrador real reusando uno de esos nombres sería repetir justo el
  // problema que este script existe para cerrar.
  if (TEST_USERS.some((u) => u.username === usuario)) {
    console.error("")
    console.error(`"${usuario}" es una de las cuentas de PRUEBA, cuya contraseña está`)
    console.error("en el repositorio. El administrador real necesita un usuario propio.")
    return
  }

  if (claveManual && claveManual.length < 12) {
    console.error("")
    console.error("Esa contraseña tiene menos de 12 caracteres.")
    console.error("Omite `clave=` y deja que el servidor genere una fuerte.")
    return
  }

  const userService: any = container.resolve(Modules.USER)
  const authService: any = container.resolve(Modules.AUTH)

  // ── ¿Ya existe? ───────────────────────────────────────────────────────────
  const existentes = await userService.listUsers({ email: correo })
  if (existentes?.length) {
    const u = existentes[0]
    const rolActual = normalizeRole((u.metadata as any)?.role)

    if (rolActual === ROLES.ADMIN) {
      console.log(`La cuenta ${correo} ya existe y ya es Administrador.`)
      console.log("No se toca. Si olvidaste la contraseña, cámbiala desde el panel")
      console.log("con otra cuenta de administrador.")
      console.log("")
      return
    }

    // Existe con otro rol: se asciende, sin tocar su contraseña.
    await userService.updateUsers([
      { id: u.id, metadata: { ...(u.metadata ?? {}), role: ROLES.ADMIN } },
    ])
    console.log(`La cuenta ${correo} ya existía con rol "${rolActual ?? "sin rol"}".`)
    console.log(`Se le asignó el rol Administrador. Su contraseña NO se modificó.`)
    console.log("")
    return
  }

  // ── Alta ──────────────────────────────────────────────────────────────────
  const clave = claveManual ?? generarClave()

  const { success, error } = await authService.register("emailpass", {
    body: { email: correo, password: clave },
  } as any)

  if (!success) {
    console.error(`No se pudo registrar ${correo}: ${error}`)
    return
  }

  const [authIdentity] = await authService.listAuthIdentities({
    provider_identities: { entity_id: correo },
  })

  if (!authIdentity) {
    console.error(`Se registró ${correo} pero no se encontró su identidad de acceso.`)
    console.error("Revisa el estado antes de continuar; la cuenta puede haber quedado a medias.")
    return
  }

  const [user] = await userService.createUsers([
    {
      email: correo,
      first_name: nombre,
      last_name: apellido,
      metadata: { role: ROLES.ADMIN },
    },
  ])

  await authService.updateAuthIdentities([
    { id: authIdentity.id, app_metadata: { user_id: user.id } },
  ])

  // ── Se muestra una sola vez ───────────────────────────────────────────────
  const marco = "═".repeat(64)
  console.log(marco)
  console.log("")
  console.log("  Cuenta creada. Esta contraseña NO se vuelve a mostrar.")
  console.log("")
  console.log(`     Usuario     : ${usuario}`)
  console.log(`     Contraseña  : ${clave}`)
  console.log(`     Rol         : ${ROLE_LABELS[ROLES.ADMIN]}`)
  console.log("")
  console.log(`  Se escribe sólo "${usuario}", tanto en el punto de venta como en el`)
  console.log(`  panel. Por dentro queda guardado como ${correo}.`)
  console.log("")
  console.log("  Guárdala AHORA en un gestor de contraseñas.")
  console.log("  El sistema sólo almacena su hash: si se pierde, no se recupera.")
  console.log("")
  console.log("  No la mandes por correo ni por chat. Si tienes que dictarla,")
  console.log("  el alfabeto evita los caracteres que se confunden (O/0, l/I/1).")
  console.log("")
  console.log(marco)
  console.log("")
  console.log("Siguiente paso: entra al panel con esta cuenta para comprobar que")
  console.log("funciona, y sólo entonces borra las cuentas de prueba:")
  console.log("   npx medusa exec ./src/scripts/limpiar-datos-prueba.ts")
  console.log("")
}
