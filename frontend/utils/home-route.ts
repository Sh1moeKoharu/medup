import { GRUPO_POR_ROL, INICIO_POR_ROL, PANTALLAS_DE_GRUPO, RUTA_SIN_POS } from '@/constants/acceso';
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

/**
 * Convierte la ruta que pidio el usuario (un enlace directo, o la que tenia al
 * recargar) en la ruta a la que de verdad hay que ir.
 *
 * Una ruta "a secas" como `/cart` se prefija con el grupo del rol, porque el
 * mismo nombre existe en varios grupos y el enrutador tomaria el primero. Las
 * rutas fuera de grupo (`/orders/abc`, `/checkout/…`) se dejan tal cual: la
 * guarda de cada grupo y los permisos del servidor deciden si procede.
 *
 * Si el rol no tiene grupo (auditoria), o la ruta ya trae grupo, no se toca.
 */
export function resolverRutaParaRol(rutaPedida: string, role?: string | null): string {
  const canonical = normalizeRole(role);
  if (!canonical) return RUTA_SIN_POS;

  const grupo = GRUPO_POR_ROL[canonical];
  if (!grupo) return rutaPedida;

  const [pathname] = rutaPedida.split(/(?=[?#])/, 1);
  const segmentos = pathname.split('/').filter(Boolean);
  if (segmentos.length !== 1 || segmentos[0].startsWith('(')) return rutaPedida;

  const pantallas = PANTALLAS_DE_GRUPO[grupo] ?? [];
  if (!pantallas.includes(segmentos[0])) return rutaPedida;

  return `/${grupo}${rutaPedida}`;
}
