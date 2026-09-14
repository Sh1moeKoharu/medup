/**
 * Nombres de usuario, no correos.
 *
 * ── QUÉ SE GUARDA DE VERDAD ─────────────────────────────────────────────────
 * La gente escribe `caja`. Lo que queda guardado es `caja@sigh.local`.
 *
 * Suena a rodeo y no lo es. Medusa aguanta perfectamente un identificador
 * pelado —el proveedor `emailpass` sólo comprueba que sea texto, y la columna
 * `email` del usuario es texto con índice único, sin validación de formato—,
 * así que por el lado del servidor `caja` a secas funcionaría.
 *
 * El que no lo aguanta es el FORMULARIO DE ACCESO DEL PANEL. Su esquema es
 *
 *     var LoginSchema = z.object({ email: z.string().email(), password: ... })
 *
 * y viene compilado dentro de `@medusajs/dashboard`. Un usuario sin arroba lo
 * rechaza el propio formulario, en el navegador, antes de mandar nada. Por ahí
 * entran administración, farmacia y auditoría.
 *
 * Se podría pelear con esa validación desde la inyección de HTML que ya usamos.
 * Pero sería adivinar la forma de un paquete compilado, y se rompería sola en
 * la primera actualización de Medusa, dejando fuera a tres perfiles.
 *
 * Con el sufijo no hay nada que pelear: el identificador ES un correo bien
 * formado, y quien escribe sólo ve su usuario. Si algún día la inyección del
 * panel fallara, esas tres personas todavía pueden entrar escribiendo
 * `usuario@sigh.local` completo. Eso es lo que hace la decisión reversible.
 *
 * ── POR QUÉ `.local` ────────────────────────────────────────────────────────
 * `.local` es un dominio reservado (RFC 6762) que no resuelve en internet, así
 * que ningún correo puede escaparse a un buzón real por accidente. Y deja claro
 * de un vistazo que eso no es una dirección a la que se pueda escribir: hoy el
 * sistema no manda correo a nadie del personal, ni para recuperar contraseña.
 */

/** El sufijo que se le añade a todo nombre de usuario. Un solo sitio. */
export const DOMINIO_INTERNO = "sigh.local"

/**
 * Qué se acepta como nombre de usuario.
 *
 * Minúsculas, dígitos, punto, guion y guion bajo. Ni espacios ni acentos ni
 * mayúsculas: es lo que se teclea a diario en un mostrador, a veces con prisa,
 * y todo lo que admita dos escrituras distintas de lo mismo acaba en una cuenta
 * duplicada o en alguien que no puede entrar.
 */
export const FORMA_USUARIO = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/

export const esUsuarioValido = (usuario: string): boolean =>
  FORMA_USUARIO.test(usuario)

/**
 * De lo que escribe la persona, a lo que se guarda.
 *
 * Es idempotente a propósito: pasarle algo que ya lleva arroba lo devuelve
 * igual. Así se puede llamar sin miedo desde sitios que reciben lo uno o lo
 * otro, como el alta de personal, sin tener que saber cuál de los dos les tocó.
 */
export const aIdentificador = (entrada: string): string => {
  const limpio = entrada.trim().toLowerCase()
  return limpio.includes("@") ? limpio : `${limpio}@${DOMINIO_INTERNO}`
}

/**
 * De lo guardado, a lo que se enseña.
 *
 * Sólo quita NUESTRO dominio. Una cuenta antigua con un correo de verdad se
 * sigue viendo entera, que es lo correcto: mientras queden cuentas sin migrar,
 * enseñar `juan` cuando lo guardado es `juan@clinica.com.mx` sería mentir sobre
 * con qué se entra.
 */
export const aUsuario = (identificador: string): string => {
  const sufijo = `@${DOMINIO_INTERNO}`
  return identificador.endsWith(sufijo)
    ? identificador.slice(0, -sufijo.length)
    : identificador
}

/**
 * Explica por qué no vale, en lugar de devolver un sí o un no.
 *
 * El mensaje se le enseña a quien está dando de alta a alguien, así que dice
 * qué hacer y no sólo que está mal.
 */
export const revisarUsuario = (usuario: string): string | null => {
  const u = usuario.trim()
  if (!u) return "Escribe un nombre de usuario."
  if (u.includes("@")) return "El nombre de usuario va sin arroba: escribe sólo la parte de la izquierda."
  if (u !== u.toLowerCase()) return "El nombre de usuario va en minúsculas."
  if (/\s/.test(u)) return "El nombre de usuario no lleva espacios."
  if (u.length < 3) return "El nombre de usuario necesita al menos 3 caracteres."
  if (u.length > 32) return "El nombre de usuario no puede pasar de 32 caracteres."
  if (!esUsuarioValido(u))
    return "Sólo se admiten letras sin acento, números, punto, guion y guion bajo."
  return null
}
