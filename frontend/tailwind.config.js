const { hairlineWidth } = require('nativewind/theme');
const { paletaTailwind, tipografia, radio, sombra } = require('./theme/tokens');

/**
 * Este archivo es un envoltorio: los valores viven en `theme/tokens.js`, que es
 * la fuente única y también la lee el código de la aplicación. Ver
 * DESIGN-SYSTEM.md en la raíz.
 *
 * ⚠️ `colors` va dentro de `extend` A PROPÓSITO. Sacarlo de ahí reemplazaría la
 * paleta entera de Tailwind y dejaría sin color los ~90 sitios que todavía usan
 * `red-*`, `blue-*`, `purple-*` o `amber-*` — sin ningún error, sólo texto
 * invisible. Esas familias se irán sustituyendo por las semánticas, y hasta
 * entonces tienen que seguir existiendo.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './App.tsx',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './contexts/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './theme/**/*.{js,ts}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    // Reemplaza la escala de Tailwind a propósito: el sistema tiene sus doce
    // tamaños y no queremos los cuarenta y tantos de la librería.
    fontSize: tipografia.escala,
    extend: {
      fontFamily: {
        sans: tipografia.familia,
      },
      colors: paletaTailwind,
      borderRadius: {
        ...radio,
        '4xl': '2rem',
      },
      boxShadow: sombra,
      height: {
        hairline: hairlineWidth(),
        13.5: '3.375rem',
        // Altura mínima táctil. 44 px es el mínimo de las guías de iOS y
        // Android; en un mostrador se pulsa deprisa y con guantes.
        toque: '2.75rem',
      },
      minHeight: {
        toque: '2.75rem',
      },
    },
  },
  plugins: [],
};
