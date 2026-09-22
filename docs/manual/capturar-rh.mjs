/**
 * Recorre el punto de venta como RH Y CONTABILIDAD y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run rh
 *
 * Mismo molde que los demás: tableta apaisada, capturas numeradas en img/rh/,
 * impresión anulada. La preparación deja esquemas de pago (Almacén con pago por
 * turno, Caja por hora y comisión) y un turno de Almacén cerrado hoy, para que
 * la nómina tenga algo que pagar.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "rrhh"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "rh")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Datos ────────────────────────────────────────────────────────────────
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const T = { rh: await entrar(USUARIO), almacen: await entrar("almacen") }
  const api = async (rol, m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
  const personal = (await api("rh", "GET", "/admin/staff-compensation")).personal ?? []
  const id = (u) => personal.find((p) => p.usuario === u)?.user_id
  if (id("almacen")) await api("rh", "POST", "/admin/staff-compensation", { user_id: id("almacen"), fixed_per_shift: 400 })
  if (id("caja")) await api("rh", "POST", "/admin/staff-compensation", { user_id: id("caja"), hourly_rate: 45, default_percent: 1 })
  if (id("medico")) await api("rh", "POST", "/admin/staff-compensation", { user_id: id("medico"), default_percent: 20, reglas: [{ label: "Noche", days: "0,1,2,3,4,5,6", start_time: "20:00", end_time: "08:00", percent: 30 }] })
  const abierto = (await api("almacen", "GET", "/admin/doctor-shifts/current")).doctor_shift
  const turno = abierto ?? (await api("almacen", "POST", "/admin/doctor-shifts", {})).doctor_shift
  if (turno) await api("almacen", "POST", `/admin/doctor-shifts/${turno.id}/close`, {})
  console.log("   datos listos")
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, locale: "es-MX" })
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

// ── 1. Entrar ───────────────────────────────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 7000)

// ── 2. Reportes: actividad del personal ─────────────────────────────────────
await paso("reportes", 2500)
await clic("Hoy", 3000)
await page.mouse.wheel(0, 500)
await paso("actividad-por-dia", 1500)
await clic("Por persona", 3000)
await paso("actividad-por-persona", 1500)
await page.mouse.wheel(0, -2000)
await clic("Honorarios y nómina", 4000)
await page.mouse.wheel(0, 400)
await paso("reporte-honorarios", 1500)

// ── 3. Nómina ───────────────────────────────────────────────────────────────
await clic("Nómina", 5000)
await paso("nomina", 1500)
const registrar = page.getByText("Registrar pago", { exact: true }).filter({ visible: true }).first()
if (await registrar.isVisible().catch(() => false)) {
  await registrar.scrollIntoViewIfNeeded()
  await registrar.click({ force: true })
  await page.waitForTimeout(1000)
  await page.getByLabel("Referencia del pago (opcional)", { exact: true }).filter({ visible: true }).first().fill("Transferencia 000456")
  await paso("registrar-pago")
  await page.getByText(/^Pagar \$/).filter({ visible: true }).first().click({ force: true })
  await page.waitForTimeout(9000)
  await paso("pago-registrado")
} else {
  console.log("   (nadie con pago pendiente en el periodo: sin captura del pago)")
}

// ── 4. Cortes ───────────────────────────────────────────────────────────────
await clic("Cortes", 4000)
await paso("cortes", 1500)

// ── 5. Ajustes, pausar y salir ──────────────────────────────────────────────
await clic("Ajustes", 2500)
if (await texto("Abrir turno").isVisible().catch(() => false)) await clic("Abrir turno", 2500)
await paso("ajustes-turno")
await clic("Cerrar turno", 2000)
await page.goto(`${POS}/bitacora`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(5000)
await paso("no-puede-bitacora")
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await page.getByPlaceholder("Contraseña", { exact: true }).filter({ visible: true }).first().fill(CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)

await browser.close()
console.log(`Listo: ${n} capturas.`)
