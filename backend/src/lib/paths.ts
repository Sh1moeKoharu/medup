import * as path from "path"

/**
 * Rutas de datos persistentes.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * En producción el servidor se ejecuta desde `.medusa/server`, un directorio
 * que `medusa build` BORRA Y REGENERA en cada compilación. Todo lo que se
 * escriba relativo al directorio de trabajo se pierde al recompilar:
 *
 *   · `static/`  guarda las imágenes de producto que la base referencia por
 *                URL. Perderlas deja registros apuntando a archivos que ya no
 *                existen.
 *   · `reports/` guarda los CSV de destrucción sanitaria, que son respaldo
 *                documental de mermas.
 *
 * ── LA SOLUCIÓN ─────────────────────────────────────────────────────────────
 * `ALTUS_DATA_DIR` apunta a una ruta fuera del árbol de build (por ejemplo
 * /var/lib/altus). Si no está definida se conserva el comportamiento anterior,
 * relativo al directorio de trabajo, para no alterar el entorno local.
 *
 * OJO con `static/`: Medusa sirve /static desde `baseDir/static` con la ruta
 * CODIFICADA en el framework ("Currently we don't allow configuration of static
 * files"), así que mover `upload_dir` no basta — hace falta además un enlace
 * simbólico en `.medusa/server/static`. Lo crea `deploy/link-persistent-dirs.sh`,
 * invocado por `ExecStartPre` en la unidad de systemd para que se regenere
 * automáticamente tras cada recompilación.
 */

/** Raíz de datos persistentes, o null si no se configuró. */
export function getDataDir(): string | null {
  const dir = process.env.ALTUS_DATA_DIR?.trim()
  return dir ? path.resolve(dir) : null
}

/**
 * Directorio donde se escriben los reportes generados (destrucción sanitaria).
 * Sin `ALTUS_DATA_DIR`, cae al comportamiento previo: `<cwd>/reports`.
 */
export function getReportsDir(): string {
  const base = getDataDir() ?? process.cwd()
  return path.join(base, "reports")
}

/**
 * Directorio de archivos subidos (imágenes de producto).
 * Sin `ALTUS_DATA_DIR`, cae al valor por omisión del proveedor local de Medusa.
 */
export function getStaticDir(): string {
  const base = getDataDir() ?? process.cwd()
  return path.join(base, "static")
}
