/**
 * Vocabulario canónico de roles del SIGH.
 *
 * ¿Por qué inglés y no español?
 *  1. El enum `creator_role` de `medical_order` ya está fijado en la base de
 *     datos como ('doctor','nurse','admin') vía check-constraint
 *     (Migration20260510081412). Cambiarlo a español exige una migración.
 *  2. Las rutas del POS son directorios de Expo Router: `(doctor)` y `(nurse)`.
 *  3. El framework (Medusa) es inglés.
 * Migrar a español costaría una migración de constraint + renombrar rutas sin
 * ganar nada. Se estandariza en inglés.
 *
 * REGLA: ningún archivo debe comparar contra un string de rol literal.
 * Siempre importar ROLES desde aquí.
 */
export const ROLES = {
  /** Administrador General: acceso total, configuración, gestión de usuarios. */
  ADMIN: "admin",
  /** Farmacia: inventario, surtido de órdenes, entradas. No borra históricos. */
  PHARMACY: "pharmacy",
  /** Caja / Recepción: cobros, tickets, corte de caja. No toca inventario. */
  CASHIER: "cashier",
  /** Médico: genera órdenes, consulta historial. No ve precios de compra. */
  DOCTOR: "doctor",
  /** Enfermería: genera órdenes. No ve precios de compra. */
  NURSE: "nurse",
  /** Auditor / Dirección: reportes y bitácora. SOLO LECTURA. */
  AUDITOR: "auditor",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES = Object.values(ROLES) as Role[]

/**
 * Roles que jamás deben mutar datos. Se aplica de forma global en
 * `denyReadOnlyMutations` sobre cualquier verbo distinto de GET/HEAD/OPTIONS.
 */
export const READ_ONLY_ROLES: Role[] = [ROLES.AUDITOR]

/**
 * Roles autorizados a ver costos de adquisición (precio de compra y margen).
 * La propuesta exige explícitamente que el médico NO vea precios de compra.
 */
export const ROLES_ALLOWED_TO_SEE_COST: Role[] = [
  ROLES.ADMIN,
  ROLES.PHARMACY,
  ROLES.AUDITOR,
]

/**
 * Roles admitidos como emisor de una orden médica.
 *
 * ESPEJO DE LA BASE DE DATOS: el check-constraint de `medical_order.creator_role`
 * (Migration20260510081412) sólo acepta ('doctor','nurse','admin'). Cualquier
 * otro valor revienta el INSERT, así que se valida antes de escribir.
 * Si algún día se amplía el enum, hay que migrar la constraint Y esta lista.
 */
export type MedicalOrderCreatorRole =
  | typeof ROLES.DOCTOR
  | typeof ROLES.NURSE
  | typeof ROLES.ADMIN

export const MEDICAL_ORDER_CREATOR_ROLES: MedicalOrderCreatorRole[] = [
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.ADMIN,
]

/**
 * Type guard: estrecha `Role` al subconjunto que la BD acepta como emisor,
 * para que TypeScript valide el INSERT en lugar de descubrirlo en runtime.
 */
export function isMedicalOrderCreatorRole(
  role: Role | null | undefined
): role is MedicalOrderCreatorRole {
  return !!role && (MEDICAL_ORDER_CREATOR_ROLES as Role[]).includes(role)
}

/** Etiquetas en español para la UI. La UI nunca define sus propias etiquetas. */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: "Administrador General",
  [ROLES.PHARMACY]: "Farmacia",
  [ROLES.CASHIER]: "Caja / Recepción",
  [ROLES.DOCTOR]: "Médico",
  [ROLES.NURSE]: "Enfermería",
  [ROLES.AUDITOR]: "Auditor / Dirección",
}

/**
 * Valores heredados antes de la unificación -> canónico.
 *
 * Contexto: la UI de staff creaba usuarios como "cajero"/"enfermero" mientras
 * el POS y los widgets comparaban contra "cashier"/"nurse", así que una
 * enfermera creada desde el admin nunca entraba a su vista.
 *
 * `scripts/migrate-roles.ts` reescribe estos valores en la BD.
 * `normalizeRole` los tolera en runtime para no romper sesiones vivas mientras
 * la migración no se haya corrido.
 */
const LEGACY_ROLE_ALIASES: Record<string, Role> = {
  cajero: ROLES.CASHIER,
  caja: ROLES.CASHIER,
  recepcion: ROLES.CASHIER,
  enfermero: ROLES.NURSE,
  enfermera: ROLES.NURSE,
  enfermeria: ROLES.NURSE,
  medico: ROLES.DOCTOR,
  farmacia: ROLES.PHARMACY,
  farmaceutico: ROLES.PHARMACY,
  administrador: ROLES.ADMIN,
}

/**
 * Rol asumido para usuarios SIN `metadata.role`.
 *
 * El admin de arranque creado por `npx medusa user -e ... -p ...` no tiene
 * metadata, y tratarlo como "sin acceso" dejaría al dueño fuera de su propio
 * sistema. Los usuarios sólo pueden ser creados por un admin, así que el
 * fallback no es una vía de escalación.
 *
 * Tras correr `migrate-roles.ts` (que estampa `admin` explícitamente en esos
 * usuarios) este fallback puede endurecerse a `null`.
 */
export const FALLBACK_ROLE_FOR_LEGACY_USERS: Role = ROLES.ADMIN

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value)
}

/**
 * Convierte cualquier valor almacenado en el rol canónico.
 * Devuelve `null` si el valor es desconocido (≠ ausente).
 */
export function normalizeRole(raw: unknown): Role | null {
  if (raw === null || raw === undefined) {
    return null
  }

  const value = String(raw).trim().toLowerCase()
  if (!value) {
    return null
  }

  if (isRole(value)) {
    return value
  }

  // Normaliza acentos ("médico" -> "medico") antes de buscar el alias.
  const deaccented = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return LEGACY_ROLE_ALIASES[deaccented] ?? null
}

export function roleLabel(raw: unknown): string {
  const role = normalizeRole(raw)
  return role ? ROLE_LABELS[role] : "Sin rol asignado"
}

export function isReadOnly(role: Role | null): boolean {
  return !!role && READ_ONLY_ROLES.includes(role)
}

export function canSeeCost(role: Role | null): boolean {
  return !!role && ROLES_ALLOWED_TO_SEE_COST.includes(role)
}
