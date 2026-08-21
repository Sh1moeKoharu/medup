/**
 * Vocabulario canónico de roles del SIGH — copia del cliente.
 *
 * ⚠️ FUENTE DE VERDAD: `backend/src/lib/roles.ts`.
 * Si cambias uno, cambia el otro. Están duplicados porque el POS y el backend
 * son paquetes npm independientes (no hay workspace compartido); consolidarlos
 * en un paquete `shared/` es trabajo pendiente.
 *
 * Este archivo sirve SÓLO para decidir qué pantallas mostrar. No es control de
 * acceso: los permisos reales los aplica el backend en `src/api/middlewares.ts`.
 */
export const ROLES = {
  ADMIN: 'admin',
  PHARMACY: 'pharmacy',
  CASHIER: 'cashier',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  AUDITOR: 'auditor',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES = Object.values(ROLES) as Role[];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: 'Administrador General',
  [ROLES.PHARMACY]: 'Farmacia',
  [ROLES.CASHIER]: 'Caja / Recepción',
  [ROLES.DOCTOR]: 'Médico',
  [ROLES.NURSE]: 'Enfermería',
  [ROLES.AUDITOR]: 'Auditor / Dirección',
};

/** Valores heredados anteriores a la unificación. Ver roles.ts del backend. */
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
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

export function normalizeRole(raw: unknown): Role | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (isRole(value)) {
    return value;
  }

  const deaccented = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return LEGACY_ROLE_ALIASES[deaccented] ?? null;
}

export function roleLabel(raw: unknown): string {
  const role = normalizeRole(raw);
  return role ? ROLE_LABELS[role] : 'Sin rol asignado';
}
