import { INICIO_POR_ROL, RUTA_SIN_POS } from '@/constants/acceso';
import { normalizeRole } from '@/constants/roles';

/**
 * Pantalla inicial que corresponde a cada rol.
 *
 * Vive aparte porque la necesitan varios sitios —el índice, el asistente de
 * configuración y la guarda de rol— y tenerla duplicada garantizaba que se
 * desincronizaran. El destino sale de la tabla de acceso, la misma de la que
 * salen los permisos de cada grupo, así que no pueden discrepar.
 *
 * Se devuelve la ruta CON su grupo explícito. "/products" a secas es ambiguo:
 * hay tres rutas que lo definen —(tabs), (doctor) y (nurse)— y la navegación no
 * resuelve, dejando la pantalla congelada sin error.
 *
 * Un rol que no se reconoce NO cae en la caja registradora: va a una pantalla
 * que lo explica. Antes el valor por omisión era la interfaz de caja, y por eso
 * un médico entraba y aparecía cobrando.
 */
export function getHomeRoute(role?: string | null): string {
  const canonical = normalizeRole(role);
  if (!canonical) return RUTA_SIN_POS;
  return INICIO_POR_ROL[canonical] ?? RUTA_SIN_POS;
}
