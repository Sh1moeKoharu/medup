import { ROLES, normalizeRole } from '@/constants/roles';

/**
 * Pantalla inicial que corresponde a cada rol.
 *
 * Vive aparte porque la necesitan dos lugares — el índice y el asistente de
 * configuración — y tenerla duplicada garantizaba que se desincronizaran.
 *
 * Se devuelve la ruta CON su grupo explícito. `/products` a secas es ambiguo:
 * hay tres rutas que lo definen —(tabs), (doctor) y (nurse)— y la navegación no
 * resuelve, dejando la pantalla congelada sin error.
 */
export function getHomeRoute(role?: string | null): string {
  const canonical = normalizeRole(role);

  if (canonical === ROLES.DOCTOR) {
    return '/(doctor)/products';
  }
  if (canonical === ROLES.NURSE) {
    return '/(nurse)/products';
  }
  return '/(tabs)/products';
}
