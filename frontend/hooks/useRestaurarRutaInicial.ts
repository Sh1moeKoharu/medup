import { useAuthCtx } from '@/contexts/auth';
import { getHomeRoute, resolverRutaParaRol } from '@/utils/home-route';
import { olvidarRutaInicial, verRutaInicial } from '@/utils/ruta-inicial';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import * as React from 'react';

/** Mientras se esta en una de estas, el navegador aun no ha aterrizado. */
const RUTAS_DE_PASO = new Set(['/', '/index', '/login', '/setup-wizard']);

/**
 * Tope de ordenes de navegacion por sesion. Cubre dos cosas: que el navegador
 * se empenara en quedarse a medias, y una ruta pedida a la que el rol no puede
 * llegar (la guarda del grupo la desvia a su inicio y nunca "se llega").
 */
const MAX_INTENTOS = 3;

type EstadoNav = { index?: number; routes?: { name: string; state?: EstadoNav }[] } | undefined;

/**
 * Detecta el aterrizaje a medias que deja el inicio de sesion con el grupo de
 * Caja: el Stack tiene el grupo `(tabs)` como ruta enfocada pero SIN estado
 * interno. Se pinta la pestana inicial, pero la direccion del navegador queda
 * en la primera ruta alfabetica del grupo (`/activity`) y `usePathname` sigue
 * diciendo "/". Recargar en ese momento lleva a Actividad.
 *
 * Con los grupos de Medico y Enfermeria es un instante; con `(tabs)` se queda
 * asi (reproducido con Caja y con Administrador, con y sin enlace directo).
 * Un segundo reemplazo a la misma ruta deja el estado completo y correcto.
 */
function aterrizajeIncompleto(estado: EstadoNav): boolean {
  let s = estado;
  while (s?.routes?.length) {
    const ruta = s.routes[s.index ?? 0];
    if (!ruta) return false;
    if (!ruta.state) return ruta.name.startsWith('(');
    s = ruta.state;
  }
  return false;
}

/** `/(nurse)/recetas?x=1` → `/recetas`, que es lo que devuelve usePathname. */
const comoPathname = (ruta: string) => ruta.replace(/\/\([^)]+\)/g, '').split(/[?#]/)[0] || '/';

/**
 * Vuelve a la ruta con la que se abrio la aplicacion en cuanto se puede
 * navegar (ver utils/ruta-inicial.ts), y remata el aterrizaje cuando el
 * navegador lo deja a medias (ver arriba).
 *
 * ── POR QUE AQUI Y NO EN `index` ────────────────────────────────────────────
 * `index` solo lleva al inicio del rol. Restaurar desde ahi se probo y falla
 * en el caso que mas importa —tras iniciar sesion—, porque en ese instante el
 * navegador esta a medio recomponerse y la orden se pierde o cae en la pestana
 * equivocada. Este hook vive en la raiz, que sobrevive a todo.
 *
 * ── POR QUE NO SE CONSUME LA RUTA AL PRIMER INTENTO ─────────────────────────
 * Con Enfermeria, el reemplazo lanzado en el instante en que el grupo aparece
 * sin estado se perdia: el grupo terminaba de montarse en Productos y la ruta
 * pedida ya se habia olvidado. Ahora se insiste (hasta MAX_INTENTOS) mientras
 * la ruta actual no sea la pedida, y solo entonces se olvida.
 */
export function useRestaurarRutaInicial(listoParaNavegar: boolean) {
  const { state } = useAuthCtx();
  const router = useRouter();
  const pathname = usePathname();
  const navState = useRootNavigationState() as EstadoNav;
  const intentos = React.useRef(0);

  const autenticado = state.status === 'authenticated';
  const rol = autenticado ? state.user.role : undefined;
  const aMedias = aterrizajeIncompleto(navState);

  React.useEffect(() => {
    if (!autenticado || !listoParaNavegar) return;

    const enRutaDePaso = RUTAS_DE_PASO.has(pathname);
    if (!aMedias && enRutaDePaso) return;

    const pedida = verRutaInicial();
    if (pedida) {
      const destino = resolverRutaParaRol(pedida, rol);
      // Se olvida EN CUANTO se llega, sin mirar si el navegador aun se esta
      // recomponiendo. Con la condicion anterior (`&& !aMedias`) la ruta
      // seguia pendiente despues de haber llegado, y el primer toque del
      // usuario en otra pestana la reactivaba: se le devolvia a la ruta ya
      // servida. En el fallo que motivo todo esto la ruta actual es "/", no el
      // destino, asi que esta comparacion nunca lo enmascara.
      if (comoPathname(destino) === pathname) {
        olvidarRutaInicial();
        return;
      }
      if (intentos.current >= MAX_INTENTOS) {
        // No se llega: la guarda del grupo la desvia, o la ruta no existe para
        // este rol. Se deja de insistir y el usuario queda en su inicio.
        olvidarRutaInicial();
        return;
      }
      intentos.current += 1;
      router.replace(destino as any);
      return;
    }

    // Rematar el aterrizaje SOLO desde una ruta de paso.
    //
    // Sin esa condicion se disparaba tambien durante la navegacion normal: al
    // cambiar de pestana, el estado del navegador pasa un instante por
    // "grupo sin estado interno", el hook lo tomaba por un aterrizaje a medias
    // y devolvia al usuario al inicio. En la practica: pulsar Carrito o el
    // boton de escanear no llevaba a ninguna parte.
    //
    // El fallo real que esto cura ocurre con usePathname todavia en "/", asi
    // que exigirlo distingue un caso del otro.
    if (aMedias && enRutaDePaso && intentos.current < MAX_INTENTOS) {
      intentos.current += 1;
      router.replace(getHomeRoute(rol) as any);
    }
  }, [autenticado, listoParaNavegar, pathname, aMedias, rol, router]);

  // Cada sesion empieza con el contador limpio.
  React.useEffect(() => {
    if (!autenticado) intentos.current = 0;
  }, [autenticado]);
}
