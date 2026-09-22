import { ROLES, type Role } from "./roles"

/**
 * Los datos profesionales del médico que van en la receta: cédula,
 * universidad, especialidad, consultorio y logotipo.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * La receta impresa debe identificar a quien prescribe (NOM-004-SSA3-2012 y
 * el artículo 29 del Reglamento de Insumos para la Salud: nombre, cédula
 * profesional e institución que expidió el título). Hasta ahora sólo salía el
 * nombre. La clínica pidió que Administración lo capture al dar de alta al
 * médico, para que salga en cada receta sin volver a escribirlo.
 *
 * ── DÓNDE VIVE ──────────────────────────────────────────────────────────────
 * En `user.metadata.perfil_profesional`, un solo objeto, igual que el resto de
 * lo que la cuenta lleva encima (ver lib/personal.ts). El logotipo es una
 * dirección de imagen subida por `/admin/uploads`, no la imagen: el metadata
 * se lee en cada petición y no debe cargar kilobytes.
 *
 * Archivo PURO: lo importa también la pantalla del panel.
 */

export const CLAVE_PERFIL_PROFESIONAL = "perfil_profesional"

export type PerfilProfesional = {
  cedula_profesional?: string
  universidad?: string
  especialidad?: string
  cedula_especialidad?: string
  telefono?: string
  /** Si el consultorio no es la clínica, su nombre y domicilio. */
  consultorio_nombre?: string
  consultorio_direccion?: string
  logo_url?: string
}

const CAMPOS: (keyof PerfilProfesional)[] = [
  "cedula_profesional",
  "universidad",
  "especialidad",
  "cedula_especialidad",
  "telefono",
  "consultorio_nombre",
  "consultorio_direccion",
  "logo_url",
]

const LARGO_MAXIMO = 200

/** Deja sólo los campos conocidos, recortados y sin vacíos. */
export function normalizarPerfil(valor: unknown): PerfilProfesional {
  const entrada = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>
  const salida: PerfilProfesional = {}
  for (const campo of CAMPOS) {
    const texto = String(entrada[campo] ?? "").trim().slice(0, campo === "logo_url" ? 1000 : LARGO_MAXIMO)
    if (texto) salida[campo] = texto
  }
  return salida
}

/** La cédula profesional de la SEP: de 6 a 10 dígitos. */
export const FORMA_CEDULA = /^\d{6,10}$/

/** Por qué el perfil no vale para este rol, o null si vale. */
export function revisarPerfil(perfil: PerfilProfesional, rol: Role | null): string | null {
  if (perfil.cedula_profesional && !FORMA_CEDULA.test(perfil.cedula_profesional)) {
    return "La cédula profesional son de 6 a 10 dígitos, sin letras ni espacios."
  }
  if (perfil.cedula_especialidad && !FORMA_CEDULA.test(perfil.cedula_especialidad)) {
    return "La cédula de especialidad son de 6 a 10 dígitos, sin letras ni espacios."
  }
  if (perfil.logo_url && !/^(https?:\/\/|\/)/.test(perfil.logo_url)) {
    return "El logotipo debe ser una imagen subida al sistema."
  }
  if (rol === ROLES.DOCTOR) {
    if (!perfil.cedula_profesional) return "Un médico necesita su cédula profesional: sale en cada receta."
    if (!perfil.universidad) return "Un médico necesita la universidad que expidió su título: sale en cada receta."
  }
  return null
}

export function perfilDe(user: { metadata?: Record<string, unknown> | null } | null | undefined): PerfilProfesional {
  return normalizarPerfil(user?.metadata?.[CLAVE_PERFIL_PROFESIONAL])
}

/** ¿Tiene lo mínimo para firmar una receta? */
export function perfilCompleto(perfil: PerfilProfesional): boolean {
  return !!perfil.cedula_profesional && !!perfil.universidad
}
