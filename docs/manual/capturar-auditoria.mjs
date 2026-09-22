/**
 * Recorre el punto de venta como AUDITORÍA y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run auditoria
 *
 * Mismo molde que los demás: tableta apaisada, capturas numeradas en
 * img/auditoria/, impresión anulada. Auditoría es de sólo lectura, así que no
 * hay datos que preparar: se limita a comprobar que hay algo que consultar
 * —bitácora, movimientos y al menos un corte cerrado— y avisa si no.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "auditoria"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "auditoria")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Comprobar que hay algo que auditar ───────────────────────────────────
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const t = await entrar(USUARIO)
  const api = async (ruta) => (await (await fetch(API + ruta, { headers: { Authorization: `Bearer ${t}` } })).json().catch(() => ({})))
  const bitacora = await api("/admin/audit-logs?limit=1")
  const cortes = await api("/admin/cash-sessions?status=closed&limit=1")
  const movimientos = await api("/admin/inventory-movements?limit=1")
  const cerrados = (cortes.sessions ?? cortes.cash_sessions ?? []).length
  console.log(`   bitácora: ${bitacora.count ?? "?"} asientos · cortes cerrados: ${cerrados} · movimientos: ${movimientos.count ?? "?"}`)
  if (!cerrados) console.log("   (ojo: sin cortes cerrados la pestaña Cortes saldrá vacía; corre antes npm run caja)")
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, locale: "es-MX", acceptDownloads: true })
await context.addInitScript(() => {
  window.print = () => {}
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    get() { const w = d.get.call(this); if (w) { try { w.print = () => {} } catch {} } return w },
  })
})
const page = await context.newPage()

let n = 0
const paso = async (nombre, ms = 900) => {
  await page.waitForTimeout(ms)
  n += 1
  const archivo = `${String(n).padStart(2, "0")}-${nombre}.png`
  await page.screenshot({ path: path.join(DIR, archivo) })
  console.log("  ", archivo)
}
const texto = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first()
const clic = async (t, ms = 900) => { await texto(t).click({ force: true }); await page.waitForTimeout(ms) }
const escribir = async (placeholder, valor) => {
  const campo = page.getByPlaceholder(placeholder, { exact: true }).filter({ visible: true }).first()
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(600)
}

// ── 1. Entrar ───────────────────────────────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 6000)

// ── 2. La bitácora: los filtros que se usan a diario ────────────────────────
await paso("bitacora", 2000)
await clic("Ayer", 2500)
await paso("bitacora-ayer")
await clic("7 días", 2500)
await clic("Farmacia", 2500)
await paso("bitacora-por-perfil")
await clic("Todos", 2000)
await escribir("Filtrar por persona, número o acción...", "caja")
await paso("bitacora-buscar", 1200)
// El buscador filtra lo que ya se trajo, no la bitácora entera: cuando no hay
// coincidencias entre lo cargado, la pantalla lo dice y ofrece traer más.
await escribir("Filtrar por persona, número o acción...", "convenio")
await paso("bitacora-sin-coincidencias", 1200)
await escribir("Filtrar por persona, número o acción...", "")
await clic("Todo", 3000)
await page.getByText(/^Cargar más \(/).filter({ visible: true }).first().scrollIntoViewIfNeeded()
await paso("bitacora-cargar-mas", 1200)

// ── 3. Kardex ───────────────────────────────────────────────────────────────
await clic("Kardex", 3500)
await paso("kardex")
await clic("Mermas", 2000)
await paso("kardex-mermas")
await clic("Todo", 2500)
await clic("Farmacia", 2500)
await paso("kardex-un-almacen")

// ── 4. Caducidades ──────────────────────────────────────────────────────────
await clic("Caducidad", 3500)
await paso("caducidades")
await clic("Caducados", 2000)
await paso("caducidades-caducados")
await clic("Todos", 1500)
await page.getByText(/^Descargar CSV/).filter({ visible: true }).first().click({ force: true })
await paso("caducidades-csv", 2000)

// ── 5. Cortes de caja ───────────────────────────────────────────────────────
await clic("Cortes", 3500)
await paso("cortes")
await clic("Por mes", 2500)
await page.getByText("Por periodo", { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
await paso("cortes-por-periodo", 1200)

// ── 5b. Reportes: exportar e imprimir ───────────────────────────────────────
await clic("Reportes", 4000)
await paso("reportes", 1500)
await clic("Recetas y órdenes", 4000)
await page.mouse.wheel(0, 500)
await paso("reporte-recetas", 1500)
await page.mouse.wheel(0, -2000)
await clic("Inventario valorizado", 4000)
await page.mouse.wheel(0, 500)
await paso("reporte-inventario", 1500)
await page.mouse.wheel(0, -2000)
// La hoja impresa: la misma que abre «Imprimir», tomada del servidor.
{
  const t = (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${USUARIO}@sigh.local`, password: CLAVE }) })).json()).token
  const dia = (d) => d.toLocaleDateString("en-CA")
  const hasta = dia(new Date())
  const desde = dia(new Date(Date.now() - 6 * 86400000))
  const r = await fetch(`${API}/admin/reports/export?tipo=actividad&agrupar=persona&desde=${desde}&hasta=${hasta}&formato=html`, { headers: { Authorization: `Bearer ${t}` } })
  const hoja = await context.newPage()
  await hoja.setViewportSize({ width: 1000, height: 560 })
  await hoja.setContent((await r.json()).html, { waitUntil: "load" })
  await hoja.waitForTimeout(800)
  n += 1
  const archivo = `${String(n).padStart(2, "0")}-reporte-impreso.png`
  await hoja.screenshot({ path: path.join(DIR, archivo) })
  console.log("  ", archivo)
  await hoja.close()
}

// ── 6. Ajustes, lo que no puede, pausar y salir ─────────────────────────────
await clic("Ajustes", 2500)
await paso("ajustes")
await page.goto(`${POS}/cash-register`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await paso("no-puede-caja")
// La pantalla de Farmacia devuelve exactamente igual, así que se comprueba
// pero no se captura: sería la misma imagen dos veces.
await page.goto(`${POS}/(almacen)/lotes`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await texto("Bitácora").waitFor({ timeout: 30000 })
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await escribir("Contraseña", CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)

await browser.close()
console.log(`Listo: ${n} capturas.`)
