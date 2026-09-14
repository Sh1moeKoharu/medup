import vm from "node:vm"

/**
 * Los scripts que `medusa-config.ts` inyecta en el panel tienen que ser
 * JavaScript válido.
 *
 * ── EL FALLO QUE ESTO CAZA ──────────────────────────────────────────────────
 * Esos scripts se escriben como texto dentro de una plantilla de TypeScript.
 * Ahí una barra invertida se come el carácter que la sigue: una expresión
 * regular como la de leer una cookie sale rota, el navegador descarta el script
 * entero por error de sintaxis, y el panel carga normal sin hacer lo que el
 * script hacía. No hay ningún aviso: pasó con el cierre de sesión compartido
 * con el punto de venta, que simplemente no funcionaba.
 *
 * Aquí se genera el HTML como lo hace la compilación y se compila cada script
 * con `vm`, sin ejecutarlo.
 */

const htmlInyectado = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require("../../../medusa-config")
  const vite = config.admin?.vite
  expect(typeof vite).toBe("function")
  const resultado = vite({ plugins: [] })
  const plugin = resultado.plugins.find((p: any) => typeof p?.transformIndexHtml === "function")
  expect(plugin).toBeDefined()
  return plugin.transformIndexHtml("<!doctype html><html><head></head><body></body></html>")
}

describe("scripts inyectados en el panel", () => {
  const html = htmlInyectado()
  const scripts = [...html.matchAll(/<script (data-altus-[a-z]+)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => ({
    nombre: m[1],
    codigo: m[2],
  }))

  it("están todos: sesión compartida, idioma, punto de venta, menú, salir, usuario y marca", () => {
    expect(scripts.map((s) => s.nombre).sort()).toEqual(
      [
        "data-altus-lang",
        "data-altus-marca",
        "data-altus-menu",
        "data-altus-pos",
        "data-altus-salir",
        "data-altus-sesion",
        "data-altus-usuario",
      ].sort(),
    )
  })

  it("el de sesión compartida va antes que los demás, para envolver fetch primero", () => {
    expect(scripts[0].nombre).toBe("data-altus-sesion")
  })

  for (const nombre of ["data-altus-sesion", "data-altus-lang", "data-altus-pos", "data-altus-menu", "data-altus-salir", "data-altus-usuario", "data-altus-marca"]) {
    it(`${nombre} es JavaScript válido`, () => {
      const script = scripts.find((s) => s.nombre === nombre)
      expect(script).toBeDefined()
      expect(() => new vm.Script(script!.codigo)).not.toThrow()
    })
  }

  it("la cookie de la señal se llama igual que en el punto de venta", () => {
    const fs = require("node:fs")
    const path = require("node:path")
    const pos = fs.readFileSync(path.join(__dirname, "../../../../frontend/utils/sesion-compartida.ts"), "utf8")
    expect(pos).toContain("const COOKIE_SALIDA = 'altus_salida'")
    expect(scripts.find((s) => s.nombre === "data-altus-sesion")!.codigo).toContain("var CLAVE='altus_salida'")
  })
})
