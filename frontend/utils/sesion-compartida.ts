import { Platform } from 'react-native';

/**
 * Salir del punto de venta cierra el panel, y salir del panel cierra el punto
 * de venta, en el mismo navegador.
 *
 * ── POR QUÉ HACÍA FALTA ─────────────────────────────────────────────────────
 * Administración entra a los dos, y cada uno guarda la sesión a su manera: el
 * punto de venta, un token en el almacenamiento del navegador; el panel, una
 * cookie de sesión del servidor. Salir de uno no tocaba el otro, así que quien
 * cerraba sesión en el panel y se iba seguía con el punto de venta abierto con
 * su cuenta de administrador.
 *
 * ── LA SEÑAL ES UNA COOKIE, NO EL ALMACENAMIENTO ────────────────────────────
 * El almacenamiento del navegador es por ORIGEN, y el origen incluye el
 * puerto: en desarrollo el punto de venta (8081) y el panel (4173) no lo
 * comparten. Las cookies son por HOST, sin puerto, así que las ven los dos. En
 * el servidor da igual —nginx sirve los dos en el mismo origen—, pero así la
 * misma pieza funciona en los dos sitios y se puede probar aquí.
 *
 * Quien sale escribe `altus_salida` con la hora. Cada lado recuerda desde
 * cuándo tiene su sesión, y si ve una salida POSTERIOR, cierra la suya. Una
 * salida anterior a su entrada no dice nada: es de una sesión que ya acabó.
 *
 * ⚠️ El panel hace lo mismo desde el script que inyecta
 * `backend/medusa-config.ts` (bloque `data-altus-sesion`). El nombre de la
 * cookie tiene que coincidir en los dos.
 */

const COOKIE_SALIDA = 'altus_salida';

/** Treinta días: un punto de venta cerrado tiene que enterarse al volver a abrirse. */
const DURACION_SEGUNDOS = 60 * 60 * 24 * 30;

const esNavegador = () => Platform.OS === 'web' && typeof document !== 'undefined';

/** Hora de la última salida en este navegador, o 0 si no hay. */
export const leerSalida = (): number => {
  if (!esNavegador()) return 0;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_SALIDA}=(\\d+)`));
  return m ? Number(m[1]) : 0;
};

/** Deja constancia de que se salió ahora, para que el panel lo vea. */
export const marcarSalida = (): void => {
  if (!esNavegador()) return;
  const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_SALIDA}=${Date.now()}; path=/; max-age=${DURACION_SEGUNDOS}; SameSite=Lax${seguro}`;
};

/**
 * Cierra la sesión del panel en el servidor.
 *
 * Es el mismo puente que usa `abrirSesionDelPanel` en utils/panel.ts, al revés:
 * la cookie del panel la emite el backend y viaja a cualquier puerto del host,
 * así que borrarla desde aquí la borra para el panel. Nunca lanza: si no hay
 * red, la señal de la cookie hace que el panel se cierre igual al revisarla.
 */
export const cerrarSesionDelPanel = async (medusaUrl: string): Promise<void> => {
  if (!esNavegador() || !medusaUrl) return;
  try {
    await fetch(`${medusaUrl.replace(/\/+$/, '')}/auth/session`, { method: 'DELETE', credentials: 'include' });
  } catch {
    // Sin respuesta: la cookie `altus_salida` basta para que el panel salga.
  }
};

/** Cada cuánto se revisa la señal mientras hay sesión abierta. */
export const INTERVALO_REVISION_MS = 2000;
