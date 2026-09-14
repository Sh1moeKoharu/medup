import { Platform } from 'react-native';

/**
 * Ir del punto de venta al panel de administración.
 *
 * Vive aparte porque lo necesitan dos sitios —la barra de sesión y el propio
 * inicio de sesión, que manda a Administración directo al panel— y tenerlo
 * duplicado garantizaba que se desincronizaran.
 */

/**
 * Dónde está el panel.
 *
 * En producción es el MISMO origen que el punto de venta, bajo /app, porque
 * nginx tiene los dos detrás. Ahí no hay nada que configurar.
 *
 * En desarrollo no: el panel que sirve `medusa develop` en el 9000 no carga
 * —ver la nota larga en `components/BarraDeSesion.tsx`— y el que funciona es el
 * compilado, que `npm run dev:panel` publica en otro puerto.
 */
export const urlDelPanel = (): string => {
  const base = __DEV__ ? (process.env.EXPO_PUBLIC_ADMIN_URL || '').replace(/\/+$/, '') : '';
  return `${base}/app`;
};

/**
 * Abre la sesión del panel con el token que el punto de venta ya tiene.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 * Los dos se autentican de formas distintas contra el mismo servidor: el punto
 * de venta pide un token y se lo guarda; el panel usa una cookie de sesión.
 * Entrar en uno no abría la sesión del otro, así que al pasar de uno a otro el
 * panel volvía a pedir usuario y contraseña. Pasaba también en producción, con
 * las dos cosas en el mismo origen: no era cuestión de puertos.
 *
 * `POST /auth/session` es el puente: recibe el token y responde con la cookie.
 * Las cookies no distinguen puertos, sólo el host, así que la que emite el
 * backend sirve para el panel esté donde esté.
 *
 * Nunca lanza. Distingue tres salidas, porque quien llama hace cosas
 * distintas con cada una:
 *
 *   abierta        la cookie ya está; se puede ir al panel.
 *   rechazada      el servidor cerró el panel a este rol (403). Ir sería
 *                  aterrizar en una pantalla de acceso que tampoco dejaría
 *                  pasar, así que quien llama debe decirlo aquí y no navegar.
 *   sin-respuesta  sin red, o el servidor no responde. Quien llama navega
 *                  igual y el panel pedirá las credenciales, que es lo que
 *                  pasaba antes: nadie se queda fuera.
 */
export type ResultadoDeSesionDelPanel = 'abierta' | 'rechazada' | 'sin-respuesta';

export const abrirSesionDelPanel = async (
  medusaUrl: string,
  apiKey: string,
): Promise<ResultadoDeSesionDelPanel> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'sin-respuesta';
  try {
    const respuesta = await fetch(`${medusaUrl.replace(/\/+$/, '')}/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (respuesta.ok) return 'abierta';
    if (respuesta.status === 403) return 'rechazada';
    return 'sin-respuesta';
  } catch {
    return 'sin-respuesta';
  }
};

/**
 * Abre la sesión del panel y va allí.
 *
 * Devuelve false —y NO navega— si el servidor rechazó a este rol. Es quien
 * llama el que decide cómo decirlo.
 */
export const irAlPanel = async (medusaUrl: string, apiKey: string): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const resultado = await abrirSesionDelPanel(medusaUrl, apiKey);
  if (resultado === 'rechazada') return false;
  window.location.href = urlDelPanel();
  return true;
};
