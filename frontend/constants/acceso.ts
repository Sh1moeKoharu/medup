import { ROLES, Role } from '@/constants/roles';

/**
 * QUÉ INTERFAZ LE TOCA A CADA ROL.
 *
 * ── POR QUÉ UNA SOLA TABLA ──────────────────────────────────────────────────
 * Antes había dos cosas separadas y ninguna completa: `getHomeRoute` decidía a
 * dónde mandar a cada quien al entrar, y los grupos de pantallas no validaban
 * nada. El resultado es lo que reportó el tester: un médico entraba y aparecía
 * en la interfaz de CAJA.
 *
 * Y no era un caso raro. `getHomeRoute` sólo reconocía médico y enfermería, y
 * TODO lo demás caía en caja por omisión: administrador, farmacia, auditoría y
 * cualquier cuenta cuyo rol no se pudiera interpretar. Un valor que no se
 * entiende debe llevar a una pantalla que lo diga, no a la caja registradora.
 *
 * Ahora el destino y el permiso salen de aquí, así que no pueden discrepar.
 *
 * ── ESTO NO ES LA SEGURIDAD ─────────────────────────────────────────────────
 * Es la interfaz. Lo que de verdad impide que un médico cobre son los permisos
 * del servidor (backend/src/lib/api-policy.ts), que se aplican sobre cada
 * llamada a la API. Esto evita que alguien acabe en una pantalla que no le
 * corresponde, no sustituye a aquello.
 */

/** Pantalla para quien no trabaja en el punto de venta. */
export const RUTA_SIN_POS = '/sin-pos';

/** A dónde va cada rol al entrar. */
export const INICIO_POR_ROL: Record<Role, string> = {
  [ROLES.ADMIN]: '/(tabs)/products',
  [ROLES.CASHIER]: '/(tabs)/products',
  [ROLES.PHARMACY]: '/(tabs)/products',
  [ROLES.DOCTOR]: '/(doctor)/products',
  [ROLES.NURSE]: '/(nurse)/products',
  // Auditoría / Dirección es de SOLO LECTURA: no cobra, no dispensa y no
  // prescribe. Su trabajo —reportes y bitácora— vive en el panel, no aquí.
  [ROLES.AUDITOR]: RUTA_SIN_POS,
};

/**
 * Quién puede estar en cada grupo de pantallas.
 *
 * El administrador entra en todos a propósito: es quien configura y quien
 * acompaña al personal cuando algo no funciona.
 */
export const ROLES_CAJA: Role[] = [ROLES.ADMIN, ROLES.CASHIER, ROLES.PHARMACY];
export const ROLES_MEDICO: Role[] = [ROLES.ADMIN, ROLES.DOCTOR];
export const ROLES_ENFERMERIA: Role[] = [ROLES.ADMIN, ROLES.NURSE];
