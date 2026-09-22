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
  /**
   * Farmacia: surte recetas y consulta existencias. Desde la etapa de roles
   * nuevos ya no da de alta lotes ni traspasa: eso es de Almacén.
   */
  PHARMACY: "pharmacy",
  /** Caja / Recepción: cobros, tickets, corte de caja. No toca inventario. */
  CASHIER: "cashier",
  /** Médico: genera órdenes, consulta historial. No ve precios de compra. */
  DOCTOR: "doctor",
  /** Enfermería: genera órdenes. No ve precios de compra. */
  NURSE: "nurse",
  /** Auditor / Dirección: reportes y bitácora. SOLO LECTURA. */
  AUDITOR: "auditor",
  /** Almacén: compras y lotes, requisiciones, conteos, bajas y costos. */
  WAREHOUSE: "warehouse",
  /** RH y contabilidad: nómina, comisiones y actividad. Sin datos clínicos. */
  HR: "hr",
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
  ROLES.WAREHOUSE,
  ROLES.AUDITOR,
  ROLES.HR,
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
  [ROLES.WAREHOUSE]: "Almacén",
  [ROLES.HR]: "RH y contabilidad",
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
  almacen: ROLES.WAREHOUSE,
  almacenista: ROLES.WAREHOUSE,
  rh: ROLES.HR,
  rrhh: ROLES.HR,
  "recursos humanos": ROLES.HR,
  contabilidad: ROLES.HR,
  contador: ROLES.HR,
}

/**
 * ── NO HAY ROL POR OMISIÓN ──────────────────────────────────────────────────
 *
 * Un usuario sin `metadata.role` NO tiene rol: `normalizeRole` devuelve null y
 * los guards de `require-role.ts` deniegan. No se asume ninguno.
 *
 * ANTES se asumía `admin`. La razón era buena —el administrador de arranque que
 * crea `npx medusa user` no lleva metadata, y tratarlo como "sin acceso" dejaba
 * al dueño fuera de su propio sistema— pero el precio era desproporcionado:
 * CUALQUIER cuenta que perdiera su rol quedaba ascendida a administrador en
 * silencio. Y se pierde con facilidad: bastaba un `updateUsers` que
 * reemplazara el metadata en vez de fusionarlo, que es exactamente el bug que
 * se corrigió en `/admin/staff/:id`.
 *
 * Una omisión que ESCALA privilegios está al revés. Ahora la omisión deniega.
 *
 * ── CÓMO SE DA DE ALTA UN ADMINISTRADOR ─────────────────────────────────────
 * Con `scripts/crear-admin.ts`, que sí estampa el rol. NO con `npx medusa user`,
 * que crea la cuenta sin rol y ahora la deja sin acceso. El mismo script repara
 * una cuenta existente que se haya quedado sin rol, así que también es la vía
 * de recuperación si alguien queda fuera.
 *
 * ── ANTES DE DESPLEGAR ESTE CAMBIO EN UN SERVIDOR VIVO ──────────────────────
 * Hay que estampar el rol de las cuentas que hoy dependen de la omisión:
 *
 *     npx medusa exec ./src/scripts/migrate-roles.ts          (simulación)
 *     npx medusa exec ./src/scripts/migrate-roles.ts apply
 *
 * La simulación lista exactamente qué cuentas están sin rol. Si no se corre,
 * esas cuentas pierden el acceso al reiniciar.
 */

/**
 * Rol que `migrate-roles.ts` estampa en las cuentas SIN rol.
 *
 * Es la contraparte de lo anterior: la omisión ya no concede nada en runtime,
 * pero la migración sigue necesitando decidir qué escribir en esas cuentas
 * heredadas, y ahí `admin` sigue siendo correcto — son el administrador de
 * arranque creado por CLI antes de que existiera este vocabulario.
 *
 * ⚠️ Se aplica SÓLO desde el script, que corre en simulación por omisión y
 * lista cada cuenta afectada antes de tocar nada. Nunca en una ruta HTTP.
 */
export const MIGRATION_ROLE_FOR_UNMARKED_USERS: Role = ROLES.ADMIN

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
