/**
 * Tokens del sistema de diseño de Altus. FUENTE ÚNICA.
 *
 * Lo consumen dos sitios y por eso está en CommonJS:
 *  · `tailwind.config.js`, que lo carga con `require()` en tiempo de configuración de Node.
 *  · El código de la aplicación, con `import` — Metro lo resuelve igual.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Antes había ~75 colores escritos a mano dentro del JavaScript: los tintes de
 * la barra de pestañas, el `color=` de cada icono, el velo de la hoja inferior.
 * Las clases de Tailwind no llegan a esos sitios —y sobre componentes de
 * reanimated no llegan a ninguno—, así que el color se copiaba y se
 * desincronizaba. Aquí está una vez y se lee desde los dos mundos.
 *
 * Ver DESIGN-SYSTEM.md en la raíz del proyecto para el porqué de cada valor.
 */

// ── Neutros cálidos ─────────────────────────────────────────────────────────
//
// El lienzo NO es blanco puro. Un blanco clínico a pantalla completa deslumbra
// bajo la luz de un mostrador y aplana las tarjetas: si el fondo y la tarjeta
// son el mismo blanco, hace falta un borde para separarlos. Con el lienzo un
// punto por debajo, la tarjeta blanca se separa sola.
const LIENZO = '#FDFCFC';
const SUPERFICIE = '#F5F3F1';
const TARJETA = '#FFFFFF';

// Tinta cálida en vez de negro puro: sobre un lienzo crema, el #000 se ve como
// un agujero. #17150F conserva el contraste (17.6:1) sin ese corte.
const TINTA = '#17150F';

// ── POR QUÉ 200 Y 300 DAN UN SALTO TAN GRANDE ───────────────────────────────
//
// No es una rampa: son papeles distintos. Se miró cómo los usa el código de
// verdad. `gray-200` es relleno y borde —86 fondos y 73 bordes, ningún texto de
// peso—, mientras que `gray-300` es TEXTO en 65 sitios.
//
// Un tono intermedio que sirviera para las dos cosas dejaría esos 65 textos por
// debajo del mínimo legible, que es justo el fallo que veníamos a corregir. Así
// que 200 se queda claro para rellenos y 300 baja a tono de lectura.
const gris = {
  50: '#FAF9F7',
  100: '#F5F3F1', // superficie
  200: '#EBE8E4', // hairline, relleno inerte, estado deshabilitado
  300: '#6F6960', // texto terciario y borde de campo. 5.4:1 sobre tarjeta
  400: '#5C574F', // TEXTO SECUNDARIO. 6.5:1 (antes #888888 daba 3.5:1 y fallaba AA)
  500: '#4A453E',
  600: '#3A362F',
  700: '#2E2B25',
  800: '#23211C',
  900: '#1A1815',
};

// ── Acento de marca ─────────────────────────────────────────────────────────
//
// La ACCIÓN es tinta, no color: es lo que ya hacía la aplicación y es el punto
// medio entre las dos referencias. El azul queda para foco, selección y
// pestaña activa, donde su trabajo es decir "aquí estás", no "púlsame".
const acento = {
  200: '#E4EBF8',
  300: '#6E93D0',
  500: '#2F5FB5',
  700: '#264C91',
};

// ── Semánticos ──────────────────────────────────────────────────────────────
//
// Cuatro familias con la misma anatomía, que es la que ya usaban `InfoBanner` y
// `OrderStatus`: 200 es el fondo teñido, 500 el texto o icono ENCIMA de ese
// fondo, 300 el icono suelto sobre el lienzo y 700 el estado pulsado.
//
// Los valores están calculados para que la pareja 200/500 pase AA. La anterior
// no lo hacía: verde #469B3B sobre #B9F1B2 daba 2.6:1, ilegible de cerca.
//
// `scripts/verificar-tokens.mjs` comprueba estas parejas en cada ejecución.
const semantico = {
  success: { 200: '#E4F3E6', 300: '#4E9560', 500: '#2E6B3A', 700: '#245530' },
  warning: { 200: '#FDF3D9', 500: '#8A6410', 300: '#B08214', 700: '#6E500D' },
  error: { 200: '#FCE9E9', 300: '#D2555C', 500: '#B4232B', 700: '#921C23' },
  info: { 200: '#E3EDF6', 300: '#4C87B8', 500: '#1B6098', 700: '#154C79' },
};

/**
 * Valores crudos para el código que no puede usar clases.
 *
 * Regla: si estás escribiendo un `#` dentro de `app/` o `components/`, para y
 * usa esto. La única excepción es `utils/imprimir-recibo.ts`, que genera el
 * HTML del ticket en papel térmico — ahí el negro puro sí es lo correcto.
 */
const color = {
  lienzo: LIENZO,
  superficie: SUPERFICIE,
  tarjeta: TARJETA,
  tinta: TINTA,

  textoPrimario: TINTA,
  textoSecundario: gris[400],
  textoTerciario: gris[300],
  textoSobreTinta: TARJETA,

  borde: gris[200],
  bordeFuerte: gris[300],
  bordeFoco: acento[500],

  // Barra de pestañas. Antes '#282828' y '#B5B5B5' repetidos en tres layouts.
  pestanaActiva: TINTA,
  pestanaInactiva: gris[300],

  // Velo de diálogos y hojas. Cálido, no negro puro, para no ensuciar el crema.
  velo: 'rgba(23, 21, 15, 0.45)',

  iconoSuave: gris[300],
  iconoNeutro: gris[400],
  iconoExito: semantico.success[500],
  iconoAviso: semantico.warning[500],
  iconoError: semantico.error[500],
  iconoInfo: semantico.info[500],

  acento: acento[500],
};

/**
 * Escala tipográfica.
 *
 * ── POR QUÉ CADA TAMAÑO LLEVA SU PESO ───────────────────────────────────────
 * Es la forma que ya tenía el proyecto y NO se cambia: quitar el peso dejaría
 * en 400 todo lo que no lleve `font-*` explícito, incluidos los 43 títulos de
 * pantalla que hoy dependen del 600 de `text-4xl`. Lo que sí cambia es el peso
 * que lleva cada uno.
 *
 * El cambio de fondo: los títulos bajan a 300 —el peso ligero es lo que da el
 * aire editorial— y el cuerpo baja de 500 a 400, que es el peso de lectura.
 * Antes TODO el texto salía en 500 y por eso la pantalla se veía uniforme y
 * pesada, sin jerarquía.
 *
 * Los interlineados se dejan como estaban: cambiarlos movería la altura de fila
 * de las 13 listas virtualizadas del proyecto.
 */
const tipografia = {
  familia: ['Inter', 'system-ui', 'sans-serif'],
  escala: {
    // Display. Nuevos: antes la escala se acababa en 40 px.
    '6xl': ['3.5rem', { lineHeight: '4rem', fontWeight: '300', letterSpacing: '-0.07rem' }],
    '5xl': ['3rem', { lineHeight: '3.5rem', fontWeight: '300', letterSpacing: '-0.06rem' }],
    // Título de pantalla. 43 usos.
    '4xl': ['2.5rem', { lineHeight: '3.5rem', fontWeight: '300', letterSpacing: '-0.05rem' }],
    '3xl': ['2rem', { lineHeight: '3rem', fontWeight: '400' }],
    // Subtítulo de sección. 45 usos.
    '2xl': ['1.5rem', { lineHeight: '2.5rem', fontWeight: '400' }],
    xl: ['1.25rem', { lineHeight: '2rem', fontWeight: '500' }],
    lg: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '500' }],
    base: ['1rem', { lineHeight: '1.375rem', fontWeight: '400' }],
    sm: ['0.875rem', { lineHeight: '1.125rem', fontWeight: '400' }],
    xs: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
    '2xs': ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '400' }],
    '3xs': ['0.625rem', { lineHeight: '0.75rem', fontWeight: '400' }],
  },
};

/**
 * Formas. Sólo se tocan los dos radios que definen la identidad; el resto de la
 * escala de Tailwind se deja intacta.
 */
const radio = {
  xl: '0.875rem', // 14 px — botones, campos, tarjetas
  '2xl': '1.25rem', // 20 px — diálogos y hojas
};

/**
 * Elevación.
 *
 * UNA sola capa por sombra, a propósito: React Native no admite varias, y
 * tampoco admite sombras interiores. Escribir aquí la sombra de tres capas de
 * la referencia daría un resultado distinto en web y en el dispositivo.
 *
 * La separación por defecto de este sistema es el hairline, no la sombra. Las
 * sombras se reservan para lo que de verdad flota sobre el contenido.
 */
const sombra = {
  sm: '0 1px 3px rgba(23, 21, 15, 0.08)',
  card: '0 2px 8px rgba(23, 21, 15, 0.06)',
  dialog: '0 12px 32px rgba(23, 21, 15, 0.14)',
};

/**
 * La paleta tal y como la consume Tailwind.
 *
 * Se CONSERVAN los nombres que ya usaban las pantallas y se remapean sus
 * valores: así las 38 pantallas escritas mejoran sin editarlas. Y se completan
 * los escalones que faltaban —`gray-50` y `gray-500` a `900`—, que hasta ahora
 * caían al gris FRÍO por omisión de Tailwind en unas 85 apariciones.
 */
const paletaTailwind = {
  transparent: 'transparent',
  white: TARJETA,
  black: TINTA,
  canvas: LIENZO,
  surface: SUPERFICIE,
  gray: gris,
  primary: acento,
  // `active` es alias de `primary`: el `focus:border-active-500` que ya existe
  // en los campos hereda el acento de marca sin tocar ningún archivo.
  active: acento,
  success: semantico.success,
  warning: semantico.warning,
  error: semantico.error,
  info: semantico.info,
};

module.exports = { color, paletaTailwind, tipografia, radio, sombra };
