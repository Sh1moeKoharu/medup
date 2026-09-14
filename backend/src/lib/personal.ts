import { Role, normalizeRole } from "./roles"
import { DOMINIO_INTERNO } from "./usuarios"

/**
 * Lo que una cuenta de personal lleva encima además del rol.
 *
 * Todo vive en `user.metadata`, igual que el rol, porque el modelo de usuario
 * es de Medusa y no se le añaden columnas. Las claves están aquí para que
 * ningún otro archivo tenga que conocerlas por su nombre.
 *
 * Este archivo es PURO a propósito —sin base de datos, sin contenedor— porque
 * lo importa también la pantalla del panel, que se compila para el navegador.
 * Lo que necesita el servidor está en `personal-servidor.ts`.
 *
 * ── NÚMERO DE EMPLEADO ──────────────────────────────────────────────────────
 * El identificador que la clínica usa para su gente, y que aparece en cada
 * asiento de la bitácora junto al usuario. Un usuario se puede renombrar; el
 * número de empleado es el que la administración reconoce en un reporte.
 *
 * Es ÚNICO entre todas las cuentas, incluidas las dadas de baja: reutilizar el
 * número de alguien que se fue mezclaría su historial con el de la persona
 * nueva. La unicidad se comprueba en el alta y en la edición, contra la lista
 * completa.
 *
 * ── CORREO DE AVISO ─────────────────────────────────────────────────────────
 * Se entra con nombre de usuario, y lo guardado es `caja@sigh.local`, que no es
 * un buzón. Cuando el sistema tiene que avisar a alguien —lotes caducados, una
 * baja de inventario— necesita una dirección de verdad. Esa es ésta. Es
 * opcional: quien no la tenga, simplemente no recibe avisos.
 */
export const CLAVE_NUMERO_EMPLEADO = "employee_number"
export const CLAVE_CORREO_AVISO = "notification_email"
/**
 * Reservada para la fase de bloqueo de cuentas. Se lee desde ya para que el
 * resto del código no tenga que cambiar cuando exista: una cuenta bloqueada
 * no recibe avisos.
 */
export const CLAVE_BLOQUEADA = "blocked"

/**
 * Forma admitida: de 1 a 12 letras, dígitos o guiones. Se guarda en
 * mayúsculas para que `a-12` y `A-12` sean el mismo número.
 */
export const FORMA_NUMERO_EMPLEADO = /^[A-Z0-9-]{1,12}$/

export function normalizarNumeroDeEmpleado(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase()
}

/** Explica por qué un número no vale, o devuelve null si vale. */
export function revisarNumeroDeEmpleado(valor: unknown): string | null {
  const numero = normalizarNumeroDeEmpleado(valor)
  if (!numero) {
    return "Escribe el número de empleado."
  }
  if (!FORMA_NUMERO_EMPLEADO.test(numero)) {
    return (
      "El número de empleado admite sólo letras, dígitos y guiones, " +
      "hasta 12 caracteres."
    )
  }
  return null
}

export type UsuarioConMetadata = {
  id?: string
  email?: string | null
  metadata?: Record<string, unknown> | null
}

export function numeroDeEmpleado(user: UsuarioConMetadata | null | undefined): string | null {
  const valor = user?.metadata?.[CLAVE_NUMERO_EMPLEADO]
  const numero = normalizarNumeroDeEmpleado(valor)
  return numero || null
}

export function estaBloqueado(user: UsuarioConMetadata | null | undefined): boolean {
  return user?.metadata?.[CLAVE_BLOQUEADA] === true
}

const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Explica por qué un correo de aviso no vale, o null si vale (o está vacío). */
export function revisarCorreoDeAviso(valor: unknown): string | null {
  const correo = String(valor ?? "").trim().toLowerCase()
  if (!correo) return null
  if (!FORMA_CORREO.test(correo)) {
    return "El correo de aviso no tiene forma de correo."
  }
  if (correo.endsWith("@" + DOMINIO_INTERNO)) {
    return `Un correo @${DOMINIO_INTERNO} no es un buzón: ahí no llega nada.`
  }
  return null
}

/**
 * A qué dirección se le avisa a esta persona.
 *
 * Primero el correo de aviso, si lo tiene. Si no, el propio identificador de
 * la cuenta cuando ES un correo de verdad —cuentas anteriores al cambio a
 * nombres de usuario—. Nunca `@sigh.local`.
 */
export function correoDeAviso(user: UsuarioConMetadata | null | undefined): string | null {
  const explicito = String(user?.metadata?.[CLAVE_CORREO_AVISO] ?? "").trim().toLowerCase()
  if (explicito && FORMA_CORREO.test(explicito)) {
    return explicito
  }

  const identificador = String(user?.email ?? "").trim().toLowerCase()
  if (
    identificador &&
    FORMA_CORREO.test(identificador) &&
    !identificador.endsWith("@" + DOMINIO_INTERNO)
  ) {
    return identificador
  }

  return null
}

/**
 * Direcciones de las cuentas activas que tienen alguno de estos roles.
 *
 * Función pura, para poder probarla sin base de datos. Sin duplicados, sin
 * cuentas bloqueadas, sin cuentas sin buzón.
 */
export function resolverDestinatarios(
  usuarios: UsuarioConMetadata[],
  roles: Role[]
): string[] {
  const vistos = new Set<string>()

  for (const u of usuarios) {
    if (estaBloqueado(u)) continue

    const rol = normalizeRole(u.metadata?.role)
    if (!rol || !roles.includes(rol)) continue

    const correo = correoDeAviso(u)
    if (correo) vistos.add(correo)
  }

  return [...vistos]
}

/**
 * Quién, de esta lista, tiene ya el número. Ignora la cuenta `exceptoId`
 * (la que se está editando). Devuelve el identificador de la cuenta dueña, o
 * null si el número está libre.
 */
export function quienTieneElNumeroEntre(
  usuarios: UsuarioConMetadata[],
  numero: string,
  exceptoId?: string
): string | null {
  const buscado = normalizarNumeroDeEmpleado(numero)
  const dueño = usuarios.find((u) => u.id !== exceptoId && numeroDeEmpleado(u) === buscado)
  if (!dueño) return null
  return dueño.email ?? dueño.id ?? "otra cuenta"
}
