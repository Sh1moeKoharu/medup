import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * La ruta con la que se abrió la aplicación, guardada antes de que el
 * enrutado la pierda.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * Al cargar en frío, la sesión está en `loading` y ningún grupo protegido del
 * Stack está activo: la única pantalla disponible es `index`, así que el
 * navegador reemplaza la dirección pedida por `/` ANTES de que la sesión se
 * resuelva. Cuando `index` por fin redirige, ya no sabe a dónde quería ir el
 * usuario y lo manda al inicio de su rol. Resultado: ningún enlace directo
 * funciona, y recargar con F5 en mitad de un corte de caja devuelve al
 * catálogo.
 *
 * ── LA SOLUCIÓN ─────────────────────────────────────────────────────────────
 * Este módulo se evalúa antes de que se pinte nada, cuando la dirección aún es
 * la pedida. Se guarda aquí y `index` la reclama —una sola vez— cuando la
 * sesión y la configuración ya permiten navegar. Si hay que pasar por el
 * inicio de sesión, la ruta espera hasta después.
 *
 * Se guarda como ruta relativa (`/orders?x=1`), nunca con dominio.
 */

/** Rutas que no tiene sentido restaurar: son las de paso o las de inicio. */
const NO_RESTAURABLES = new Set(['/', '/index', '/login', '/setup-wizard', '/sin-pos', '/+not-found']);

let pendiente: string | null = null;

function normalizar(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  let r = ruta.trim();
  if (!r.startsWith('/')) r = `/${r}`;
  // Sin barra final ni «/index» explícito, para comparar bien.
  const [pathname, resto = ''] = r.split(/(?=[?#])/, 2);
  const limpio = pathname.replace(/\/+$/, '') || '/';
  if (NO_RESTAURABLES.has(limpio)) return null;
  return `${limpio}${resto}`;
}

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
  pendiente = normalizar(window.location.pathname + window.location.search + window.location.hash);
} else {
  // En nativo la dirección inicial llega de forma asíncrona (enlace profundo).
  Linking.getInitialURL()
    .then((url) => {
      if (!url || pendiente !== null) return;
      const { path, queryParams } = Linking.parse(url);
      const query = queryParams ? new URLSearchParams(queryParams as Record<string, string>).toString() : '';
      pendiente = normalizar(`${path ?? ''}${query ? `?${query}` : ''}`);
    })
    .catch(() => undefined);
}

/**
 * La ruta pedida al abrir la app, o `null`. NO la olvida: quien la reclame
 * debe llamar a `olvidarRutaInicial` cuando compruebe que ya esta en ella.
 * Se hace asi porque una orden de navegacion lanzada mientras el navegador se
 * recompone puede perderse sin aviso; consumirla antes de tiempo dejaria al
 * usuario en la pantalla de inicio sin segunda oportunidad.
 */
export function verRutaInicial(): string | null {
  return pendiente;
}

export function olvidarRutaInicial() {
  pendiente = null;
}

/** Sólo para pruebas. */
export function _fijarRutaInicialParaPruebas(ruta: string | null) {
  pendiente = normalizar(ruta);
}
