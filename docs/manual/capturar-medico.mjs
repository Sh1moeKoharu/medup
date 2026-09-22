/**
 * Recorre el punto de venta como MÉDICO y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run medico
 *
 * Mismo molde que capturar-caja.mjs: tableta apaisada, capturas numeradas en
 * img/medico/, datos preparados por API antes de empezar (turno médico
 * cerrado, sin recetas pendientes de este médico), impresión anulada.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "medico"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const PACIENTE = "María Ramírez Solís"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "medico")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Datos como al empezar un día ─────────────────────────────────────────
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const token = await entrar(USUARIO)
  globalThis.__token = token
  const api = async (m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
  const turno = (await api("GET", "/admin/doctor-shifts/current")).doctor_shift
  if (turno) await api("POST", `/admin/doctor-shifts/${turno.id}/close`, {})
  const yo = (await api("GET", "/admin/users/me")).user
  const pendientes = (await api("GET", `/admin/medical-orders?status=pending&creator_id=${yo.id}`)).medical_orders ?? []
  for (const o of pendientes) await api("POST", `/admin/medical-orders/${o.id}/cancel`, { motivo: "Limpieza antes de capturar el manual" })
  console.log(`   datos listos (${pendientes.length} recetas pendientes canceladas)`)
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
const clic = async (t, ms = 900) => { await texto(t).click(); await page.waitForTimeout(ms) }
const escribir = async (placeholder, valor, i = 0) => {
  const campo = page.getByPlaceholder(placeholder).filter({ visible: true }).nth(i)
  await campo.click()
  await campo.fill(valor)
  await page.waitForTimeout(300)
}
/** El botón redondo «+» de la tarjeta del catálogo médico, junto a «Detalles». */
const agregarALaReceta = async (producto) => {
  await page.evaluate((nombre) => {
    const hojas = [...document.querySelectorAll("div,span")].filter((e) => e.children.length === 0)
    const det = hojas.filter((e) => e.innerText.trim() === "Detalles").find((e) => {
      let a = e
      for (let i = 0; i < 8 && a; i++) { a = a.parentElement; if (a && a.innerText.includes(nombre)) return true }
      return false
    })
    let a = det
    while (a && a.parentElement && a.parentElement.children.length !== 2) a = a.parentElement
    a?.parentElement?.children[1]?.click()
  }, producto)
  await page.waitForTimeout(1500)
}

// ── 1. Entrar ───────────────────────────────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 5000)
await paso("catalogo-y-receta", 1500)

// ── 2. Abrir el turno médico ────────────────────────────────────────────────
await clic("Ajustes", 2500)
await paso("ajustes-sin-turno")
await clic("Abrir turno", 3500)
await paso("turno-abierto")

// ── 3. Pacientes: ficha y edición ───────────────────────────────────────────
await clic("Pacientes", 3000)
await paso("pacientes")
await escribir("Buscar paciente por nombre...", "María")
await page.waitForTimeout(2000)
await page.getByText(/^Historial/).first().click()
await page.waitForTimeout(2500)
await paso("ficha-de-paciente")
await clic("Editar", 1500)
await paso("editar-paciente")
// El formulario se cierra con su «×» (no se guarda nada) y la ficha con «Cerrar».
await page.evaluate(() => {
  const titulo = [...document.querySelectorAll("div,span")].find((e) => e.children.length === 0 && e.innerText.trim() === "Editar paciente")
  const fila = titulo?.parentElement
  const x = fila && [...fila.querySelectorAll("*")].find((e) => e !== titulo && e.querySelector("svg") && e.children.length <= 2)
  ;(x?.closest('[role="button"]') || x)?.click()
})
await page.waitForTimeout(1000)
if (await page.getByText("Editar paciente", { exact: true }).filter({ visible: true }).count()) await page.keyboard.press("Escape")
await page.waitForTimeout(800)
await clic("Cerrar", 2000)

// ── 4. La receta: medicamento con existencias, indicaciones, nota, paciente ─
await clic("Productos", 2000)
await escribir("Buscar medicamentos o insumos...", "Paracetamol")
await page.waitForTimeout(2000)
await paso("catalogo-con-existencias")
await page.locator('[aria-label^="Añadir Paracetamol 500 mg"]').first().click()
await page.waitForTimeout(1500)
await paso("receta-con-medicamento")
await escribir("Indicaciones (obligatorias): p. ej. 1 tableta cada 8 h por 5 días", "1 tableta cada 8 h por 5 días")
await escribir("Lo que Enfermería debe saber al aplicar: alergias, vía, cuidados…", "Sin alergias conocidas. Vía oral con agua.")
await paso("receta-indicaciones-y-notas")
await escribir("Motivo de consulta, exploración, signos vitales, hallazgos…", "Cefalea de tres días. TA 120/80, sin fiebre ni signos de alarma.")
await escribir("Diagnóstico, procedimiento, tratamiento, recomendaciones…", "Cefalea tensional. Paracetamol y reposo; revalorar en una semana.")
await page.getByPlaceholder("Motivo de consulta, exploración, signos vitales, hallazgos…").filter({ visible: true }).first().scrollIntoViewIfNeeded()
await paso("nota-de-atencion")
await clic("Seleccionar paciente", 2500)
await escribir("Buscar pacientes...", "María")
await page.waitForTimeout(2500)
await page.locator('[aria-label^="Elegir a "]').first().click()
await page.waitForTimeout(1200)
await paso("elegir-paciente")
await page.getByText(/^Asignar a /).first().click()
await page.waitForTimeout(2500)
await paso("receta-lista-para-emitir")
await page.getByText(/^Emitir receta/).first().click()
await page.waitForTimeout(1200)
await paso("confirmar-emision")
await clic("Emitir", 4500)
await paso("orden-enviada-a-enfermeria")

// ── 5. La receta impresa, en media carta ────────────────────────────────────
{
  const folio = (await page.getByText(/^Folio /).first().innerText()).replace(/^Folio /, "").trim()
  const r = await fetch(`${API}/admin/documents/receta/${folio}`, { headers: { Authorization: `Bearer ${globalThis.__token}` } })
  const hoja = await context.newPage()
  await hoja.setViewportSize({ width: 560, height: 860 })
  await hoja.setContent((await r.json()).html, { waitUntil: "load" })
  await hoja.waitForTimeout(800)
  n += 1
  const archivo = `${String(n).padStart(2, "0")}-receta-impresa.png`
  await hoja.screenshot({ path: path.join(DIR, archivo), fullPage: true })
  console.log("  ", archivo)
  await hoja.close()
}
await clic("Nueva receta", 1200)

// ── 7. Mis recetas ──────────────────────────────────────────────────────────
await clic("Mis recetas", 3000)
await paso("mis-recetas")
await page.locator('[aria-label^="Receta de "]').first().click({ force: true })
await page.waitForTimeout(1500)
await paso("detalle-de-receta")

// ── 8. Lo que el médico no puede hacer ──────────────────────────────────────
await page.goto(`${POS}/cash-register`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await paso("no-puede-caja")

// ── 9. Cerrar el turno, pausar y salir ──────────────────────────────────────
await clic("Ajustes", 2500)
await clic("Cerrar turno", 3500)
await paso("turno-cerrado")
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await escribir("Contraseña", CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)

await browser.close()
console.log(`Listo: ${n} capturas.`)
