/**
 * Escribe la version compilada en utils/version.generated.ts.
 *
 * ── POR QUE EXISTE ──────────────────────────────────────────────────────────
 * `git log` en el servidor dice que codigo esta DESCARGADO, no cual esta
 * SERVIDO: el punto de venta se sirve desde /var/www/altus-pos, que solo cambia
 * al recompilar y copiar. Un `git pull` sin recompilar deja las dos cosas
 * desincronizadas sin que nada lo advierta, y se acaba depurando un fallo que
 * ya estaba arreglado.
 *
 * Este sello viaja DENTRO del paquete compilado, asi que lo que muestra Ajustes
 * es necesariamente la version que se esta ejecutando.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const leer = (cmd, alterno) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return alterno;
  }
};

const commit = leer('git rev-parse --short HEAD', 'desconocido');
const fecha = new Date().toISOString();

const destino = path.join(__dirname, '..', 'utils', 'version.generated.ts');

fs.writeFileSync(
  destino,
  `// GENERADO AUTOMATICAMENTE por scripts/sellar-version.js. No editar a mano.
export const VERSION_COMMIT = '${commit}';
export const VERSION_FECHA = '${fecha}';
`
);

console.log(`[version] ${commit} · ${fecha}`);
