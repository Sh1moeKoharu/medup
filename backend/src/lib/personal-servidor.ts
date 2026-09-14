import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { Role } from "./roles"
import { quienTieneElNumeroEntre, resolverDestinatarios } from "./personal"

/**
 * La parte de `personal.ts` que necesita la base de datos.
 *
 * Va aparte porque `personal.ts` lo importa la pantalla del panel, que se
 * compila para el navegador, y ahí no puede entrar nada del framework.
 */

/**
 * A quién se le avisa, por rol.
 *
 * Sustituye a la dirección única de `ALERTAS_EMAIL`: los avisos van a las
 * PERSONAS que tienen ese trabajo, y cambian solas cuando cambia el personal.
 *
 * `respaldo` es la dirección de la variable de entorno, por si ninguna cuenta
 * con esos roles tiene correo de aviso. Que no quede nadie sin avisar es más
 * importante que la pureza del modelo.
 */
export async function destinatariosPorRol(
  container: MedusaContainer,
  roles: Role[],
  respaldo?: string | null
): Promise<string[]> {
  const userService: any = container.resolve(Modules.USER)
  const usuarios = await userService.listUsers({}, { take: 1000 })

  const destinatarios = resolverDestinatarios(usuarios ?? [], roles)

  const extra = String(respaldo ?? "").trim().toLowerCase()
  if (!destinatarios.length && extra) {
    destinatarios.push(extra)
  }

  return destinatarios
}

/**
 * ¿Otra cuenta ya tiene este número?
 *
 * Mira también las cuentas dadas de baja: su número no se recicla. Devuelve
 * el identificador de la cuenta que lo tiene, o null si está libre.
 */
export async function quienTieneElNumero(
  container: MedusaContainer,
  numero: string,
  exceptoId?: string
): Promise<string | null> {
  const userService: any = container.resolve(Modules.USER)
  const usuarios = await userService.listUsers({}, { take: 1000, withDeleted: true })
  return quienTieneElNumeroEntre(usuarios ?? [], numero, exceptoId)
}
