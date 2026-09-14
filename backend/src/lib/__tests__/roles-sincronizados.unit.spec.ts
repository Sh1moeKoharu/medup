import * as fs from "fs"
import * as path from "path"
import { ALL_ROLES, ROLE_LABELS, normalizeRole } from "../roles"

/**
 * El vocabulario de roles del POS debe coincidir con el del backend.
 *
 * ── POR QUÉ ESTA PRUEBA ─────────────────────────────────────────────────────
 * `frontend/constants/roles.ts` es una COPIA MANUAL de `backend/src/lib/roles.ts`.
 * Los dos proyectos son paquetes npm independientes, sin workspace compartido,
 * así que no hay forma de importar uno desde el otro. El propio archivo lo
 * declara como pendiente de un paquete `shared/`.
 *
 * Mientras tanto, nada impide que se desincronicen — y ya pasó una vez: el
 * panel guardaba "enfermero" mientras el POS comparaba contra "nurse", así que
 * una enfermera creada desde el admin nunca entraba a su vista. Esa clase de
 * fallo es silenciosa: no hay error, simplemente la persona acaba en la
 * pantalla equivocada.
 *
 * Esta prueba lee el archivo del POS como TEXTO y compara. No es elegante, pero
 * es lo único posible sin unificar los paquetes, y convierte un fallo silencioso
 * en uno que salta al ejecutar las pruebas.
 *
 *   npm run test:unit
 */

const RUTA_POS = path.join(__dirname, "..", "..", "..", "..", "frontend", "constants", "roles.ts")

/** Extrae los valores de un objeto `const X = { CLAVE: 'valor', … }` del texto. */
function valoresDeObjeto(fuente: string, nombre: string): string[] {
  const bloque = fuente.match(new RegExp(`${nombre}\\s*[:=][^{]*\\{([\\s\\S]*?)\\n\\}`))
  if (!bloque) return []
  return [...bloque[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe("vocabulario de roles compartido con el POS", () => {
  // Si alguien mueve el POS de sitio, la prueba lo dice en vez de pasar en vacío.
  it("el archivo del POS existe donde se espera", () => {
    expect(fs.existsSync(RUTA_POS)).toBe(true)
  })

  const fuente = fs.existsSync(RUTA_POS) ? fs.readFileSync(RUTA_POS, "utf8") : ""

  it("define exactamente los mismos roles canónicos", () => {
    const delPos = valoresDeObjeto(fuente, "ROLES")
    expect([...delPos].sort()).toEqual([...ALL_ROLES].sort())
  })

  it("usa las mismas etiquetas en la interfaz", () => {
    // Las etiquetas son lo que ve el personal. Si discrepan, la misma persona
    // aparece como "Caja / Recepción" en un sitio y otra cosa en el otro.
    for (const etiqueta of Object.values(ROLE_LABELS)) {
      expect(fuente).toContain(etiqueta)
    }
  })

  it("traduce los mismos alias heredados", () => {
    const aliasDelPos = fuente.match(/LEGACY_ROLE_ALIASES[\s\S]*?\n\}/)
    expect(aliasDelPos).not.toBeNull()

    // Cada clave del mapa del POS debe resolver en el backend al mismo rol.
    const pares = [...aliasDelPos![0].matchAll(/(\w+):\s*ROLES\.(\w+)/g)]
    expect(pares.length).toBeGreaterThan(0)

    for (const [, alias, constante] of pares) {
      const esperado = (ALL_ROLES as string[]).find(
        (r) => r.toUpperCase() === constante
      )
      expect(normalizeRole(alias)).toBe(esperado)
    }
  })
})
