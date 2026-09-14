/**
 * Variante WEB del esquema de color. Metro la prefiere sobre `useColorScheme.ts`
 * al compilar para navegador, así que es la que manda en el punto de venta.
 *
 * ── POR QUÉ DEVUELVE SIEMPRE "light" ────────────────────────────────────────
 * El POS es una interfaz clara y sólo clara: no hay una sola clase `dark:` en
 * `app/` ni en `components/`, `tailwind.config.js` no declara `darkMode`, y
 * todas las pantallas fijan `bg-white`. Por eso `useColorScheme.ts` ya devolvía
 * "light" de forma deliberada.
 *
 * Este archivo se quedó sin actualizar —viene de la plantilla de Expo— y seguía
 * leyendo el esquema del sistema. Consecuencia real: con el equipo en modo
 * oscuro, la barra de pestañas era lo ÚNICO que se enteraba. Se pintaba con el
 * tema oscuro de la navegación (fondo `#121212`) mientras el resto de la
 * pantalla seguía blanco, y ahí el color de la pestaña activa —`#282828`,
 * oscuro— quedaba encima de un fondo casi igual de oscuro: desaparecía. Las
 * inactivas, en gris claro `#B5B5B5`, sí resaltaban.
 *
 * De ahí venía lo que se reportó como "la pestaña activa se ve más apagada que
 * las inactivas": no era el icono ni la etiqueta, que reciben bien su color,
 * sino la barra pintada en oscuro bajo una aplicación clara.
 *
 * Si algún día se añade modo oscuro de verdad, esto vuelve a leer el sistema,
 * pero hay que hacerlo a la vez que las pantallas, no antes.
 */
export const useColorScheme = (): 'light' | 'dark' | null | undefined => {
  return 'light' as const;
};
