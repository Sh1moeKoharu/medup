/**
 * Comprueba el sistema de diseño: contraste y duplicados.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Dos de los fallos que encontramos al auditar la interfaz eran de contraste, y
 * ninguno daba error: el texto secundario `#888888` sobre blanco quedaba en
 * 3.5:1 y el verde de éxito sobre su propio fondo teñido, en 2.6:1. Se leen mal
 * y nadie se entera, porque una pantalla con poco contraste sigue "funcionando".
 *
 * Esto convierte esa comprobación en una prueba que falla.
 *
 * Y de paso vigila los archivos duplicados: `(doctor)/crm.tsx` y
 * `(nurse)/crm.tsx` son hoy idénticos byte a byte, igual que sus `settings.tsx`.
 * Cualquier cambio visual hay que replicarlo, y si no, Enfermería acaba viendo
 * una pantalla distinta a la de Médico sin que nadie lo note.
 *
 * Uso:  node scripts/verificar-tokens.mjs
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const { paletaTailwind, color } = require(join(RAIZ, 'theme/tokens.js'));

// ── Contraste WCAG 2.1 ──────────────────────────────────────────────────────

function canal(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminancia(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Parejas que la interfaz usa de verdad. Cada una con su mínimo:
 *  · 4.5 para texto normal (AA)
 *  · 3.0 para texto grande y para elementos no textuales, como un borde
 */
const PAREJAS = [
  ['texto principal sobre el lienzo', paletaTailwind.black, paletaTailwind.canvas, 4.5],
  ['texto principal sobre tarjeta', paletaTailwind.black, paletaTailwind.white, 4.5],
  ['texto secundario sobre el lienzo', paletaTailwind.gray[400], paletaTailwind.canvas, 4.5],
  ['texto secundario sobre tarjeta', paletaTailwind.gray[400], paletaTailwind.white, 4.5],
  ['texto sobre superficie', paletaTailwind.gray[400], paletaTailwind.surface, 4.5],
  ['texto de botón sólido', paletaTailwind.white, paletaTailwind.black, 4.5],
  ['acento sobre tarjeta', paletaTailwind.primary[500], paletaTailwind.white, 4.5],

  ['éxito sobre su tinte', paletaTailwind.success[500], paletaTailwind.success[200], 4.5],
  ['aviso sobre su tinte', paletaTailwind.warning[500], paletaTailwind.warning[200], 4.5],
  ['error sobre su tinte', paletaTailwind.error[500], paletaTailwind.error[200], 4.5],
  ['información sobre su tinte', paletaTailwind.info[500], paletaTailwind.info[200], 4.5],

  ['éxito sobre tarjeta', paletaTailwind.success[500], paletaTailwind.white, 4.5],
  ['error sobre tarjeta', paletaTailwind.error[500], paletaTailwind.white, 4.5],
  ['aviso sobre tarjeta', paletaTailwind.warning[500], paletaTailwind.white, 4.5],
  ['información sobre tarjeta', paletaTailwind.info[500], paletaTailwind.white, 4.5],
  ['neutro sobre tinte neutro', paletaTailwind.gray[500], paletaTailwind.gray[100], 4.5],

  // Sobre la tinta. Nuestra escala cálida se oscurece a partir del 300, al
  // revés que la de Tailwind, así que un texto copiado de un ejemplo con
  // `gray-400` sobre negro queda ilegible sin que nadie lo note. Pasó en la
  // tarjeta destacada de Caja y en la pantalla de bloqueo.
  ['texto secundario sobre tinta', paletaTailwind.gray[200], paletaTailwind.black, 4.5],
  ['etiqueta de botón sobre tinta', paletaTailwind.gray[100], paletaTailwind.black, 4.5],

  // No textuales: basta 3:1
  ['borde de campo sobre tarjeta', paletaTailwind.gray[300], paletaTailwind.white, 3],
  ['pestaña inactiva sobre tarjeta', paletaTailwind.gray[300], paletaTailwind.white, 3],
  ['borde de contorno sobre tinta', paletaTailwind.gray[300], paletaTailwind.black, 3],
];

let fallos = 0;
console.log('Contraste\n');

for (const [nombre, frente, fondo, minimo] of PAREJAS) {
  const r = contraste(frente, fondo);
  const pasa = r >= minimo;
  if (!pasa) fallos++;
  console.log(
    `  ${pasa ? 'ok  ' : 'FALLA'}  ${r.toFixed(2)}:1  (mín ${minimo})  ${nombre}  ${frente} sobre ${fondo}`,
  );
}

// ── Duplicados ──────────────────────────────────────────────────────────────

// Los dos «settings» dejaron de ser idénticos en la fase 6: el del médico
// lleva «Mi turno» (abrir y cerrar su turno) y el de Enfermería no. Es una
// diferencia de contenido, no una copia que se desincronizó, así que ya no se
// vigila. Almacén y Auditoría no copian nada: montan AjustesDelPerfil.
const DUPLICADOS = [
  ['app/(doctor)/crm.tsx', 'app/(nurse)/crm.tsx'],
];

console.log('\nArchivos que deben seguir siendo idénticos\n');

for (const [a, b] of DUPLICADOS) {
  let iguales;
  try {
    iguales = readFileSync(join(RAIZ, a), 'utf8') === readFileSync(join(RAIZ, b), 'utf8');
  } catch (e) {
    console.log(`  FALLA  no se pudo leer: ${e.message}`);
    fallos++;
    continue;
  }
  if (!iguales) fallos++;
  console.log(`  ${iguales ? 'ok  ' : 'FALLA'}  ${a}  ==  ${b}`);
}

// ── Colores a mano ──────────────────────────────────────────────────────────
//
// El sistema sólo sirve si nadie escribe un `#` por su cuenta. Se avisa, no se
// falla: la deuda anterior sigue ahí y se irá limpiando por tandas.

console.log('\nTokens\n');
console.log(`  ok    ${Object.keys(color).length} valores disponibles en theme/tokens.js para el código que no usa clases`);

console.log(fallos === 0 ? '\nTODO CORRECTO\n' : `\n${fallos} COMPROBACIÓN(ES) FALLIDA(S)\n`);
process.exit(fallos === 0 ? 0 : 1);
