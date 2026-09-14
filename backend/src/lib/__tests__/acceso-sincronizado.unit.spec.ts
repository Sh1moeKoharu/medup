import * as fs from "fs"
import * as path from "path"
import { ALL_ROLES, ROLES } from "../roles"

/**
 * La tabla de acceso del POS debe decir lo mismo que el servidor.
 *
 * ── POR QUÉ ESTA PRUEBA ─────────────────────────────────────────────────────
 * Desde la fase 7 el panel es sólo de Administración, y lo cierra el servidor
 * (`requirePanelRole`, detrás de `PANEL_SOLO_ADMINISTRACION`). El POS tiene su
 * propia tabla —`frontend/constants/acceso.ts`— que decide a quién enseñarle
 * el botón «Panel» y a qué grupo de pantallas mandar a cada rol al entrar.
 *
 * Si las dos discrepan, el fallo es silencioso: un botón que lleva a un 403,
 * o un rol que entra y no tiene pantalla. Igual que `roles-sincronizados`,
 * esto lee el archivo del POS como texto y comprueba las invariantes que el
 * pliego exige:
 *
 *   · sólo Administración tiene paso al panel;
 *   · los seis roles tienen grupo de pantallas e inicio (nadie cae en
 *     «sin interfaz»);
 *   · Farmacia y Auditoría ya no están en la interfaz de Caja.
 */

const RUTA_POS = path.join(__dirname, "..", "..", "..", "..", "frontend", "constants", "acceso.ts")

/** Extrae `[ROLES.X]: 'valor'` de un objeto `const NOMBRE: Record<Role, string> = { … }`. */
function tablaPorRol(fuente: string, nombre: string): Record<string, string> {
  const bloque = fuente.match(new RegExp(`export const ${nombre}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`))
  if (!bloque) return {}
  const tabla: Record<string, string> = {}
  for (const m of bloque[1].matchAll(/\[ROLES\.(\w+)\]:\s*(?:['"]([^'"]*)['"]|(\w+))/g)) {
    tabla[m[1]] = m[2] ?? m[3]
  }
  return tabla
}

/** Extrae los `ROLES.X` de una lista `export const NOMBRE: Role[] = [ … ];`. */
function listaDeRoles(fuente: string, nombre: string): string[] {
  const bloque = fuente.match(new RegExp(`export const ${nombre}: Role\\[\\] = \\[([^\\]]*)\\];`))
  if (!bloque) return []
  return [...bloque[1].matchAll(/ROLES\.(\w+)/g)].map((m) => m[1])
}

const constante = (rol: string) => Object.entries(ROLES).find(([, v]) => v === rol)![0]

describe("tabla de acceso del POS (fase 7)", () => {
  it("el archivo del POS existe donde se espera", () => {
    expect(fs.existsSync(RUTA_POS)).toBe(true)
  })

  const fuente = fs.existsSync(RUTA_POS) ? fs.readFileSync(RUTA_POS, "utf8") : ""

  it("sólo Administración tiene paso al panel", () => {
    expect(listaDeRoles(fuente, "ROLES_PANEL")).toEqual([constante(ROLES.ADMIN)])
  })

  it("los seis roles tienen grupo de pantallas e inicio en el punto de venta", () => {
    const grupos = tablaPorRol(fuente, "GRUPO_POR_ROL")
    const inicios = tablaPorRol(fuente, "INICIO_POR_ROL")
    for (const rol of ALL_ROLES) {
      const k = constante(rol)
      expect(grupos[k]).toMatch(/^\(\w+\)$/)
      // Los paréntesis del grupo van escapados: "(tabs)" es un grupo de captura si no.
      expect(inicios[k]).toMatch(new RegExp(`^/${grupos[k].replace(/[()]/g, "\\$&")}/\\w`))
    }
  })

  it("Farmacia y Auditoría tienen grupo propio, fuera de la interfaz de Caja", () => {
    const grupos = tablaPorRol(fuente, "GRUPO_POR_ROL")
    expect(grupos[constante(ROLES.PHARMACY)]).toBe("(almacen)")
    expect(grupos[constante(ROLES.AUDITOR)]).toBe("(auditoria)")
    const caja = listaDeRoles(fuente, "ROLES_CAJA")
    expect(caja).not.toContain(constante(ROLES.PHARMACY))
    expect(caja).not.toContain(constante(ROLES.AUDITOR))
  })

  it("cada grupo declara sus pantallas, y los inicios apuntan a una de ellas", () => {
    const bloque = fuente.match(/export const PANTALLAS_DE_GRUPO[^{]*\{([\s\S]*?)\n\};/)
    expect(bloque).not.toBeNull()
    const pantallas: Record<string, string[]> = {}
    for (const m of bloque![1].matchAll(/"(\(\w+\))":\s*\[([^\]]*)\]/g)) {
      pantallas[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])
    }
    const inicios = tablaPorRol(fuente, "INICIO_POR_ROL")
    for (const rol of ALL_ROLES) {
      const [, grupo, pantalla] = inicios[constante(rol)].match(/^\/(\(\w+\))\/(\w[\w-]*)$/)!
      expect(pantallas[grupo]).toContain(pantalla)
    }
  })
})
