/**
 * Recorre el punto de venta como FARMACIA y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run farmacia
 *
 * Mismo molde que los demás: tableta apaisada, capturas numeradas en
 * img/farmacia/, datos preparados por API (una receta de mostrador pendiente de
 * dos unidades y existencia suficiente en el almacén general), impresión anulada.
 *
 * Desde que existe el perfil de Almacén, Farmacia ya no da de alta lotes, no
 * traspasa y no fija mínimos: consulta existencias y surte recetas.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "farmacia"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "farmacia")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Datos como al empezar un día ─────────────────────────────────────────
let hayCuarentena = false
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const T = { farmacia: await entrar(USUARIO), almacen: await entrar("almacen"), enfermeria: await entrar("enfermeria") }
  const api = async (rol, m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
  const almacenes = (await api("farmacia", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).stock_locations ?? []
  const farmacia = almacenes.find((l) => l.metadata?.altus_area === "pharmacy")
  const paracetamol = (await api("farmacia", "GET", "/admin/products?q=Paracetamol&limit=1")).products?.[0]
  const variante = paracetamol.variants[0].id
  // Existencia de Paracetamol en Farmacia para surtir la receta y el traspaso.
  const lotes = (await api("farmacia", "GET", `/admin/medical-batches?variant_id=${variante}&stock_location_id=${farmacia.id}&status=active`)).batches ?? []
  const existencia = lotes.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
  if (existencia < 20) {
    const caduca = new Date(); caduca.setFullYear(caduca.getFullYear() + 1)
    await api("almacen", "POST", "/admin/medical-batches", { batch_number: `PARA-${Date.now().toString().slice(-6)}`, expiration_date: caduca.toISOString(), variant_id: variante, stock_location_id: farmacia.id, quantity: 40, apply_margin: false })
  }
  // Una receta de mostrador pendiente para Jorge, de dos unidades: una se
  // quita en pantalla, con motivo. Las de mostrador las emite Enfermería.
  const jorge = (await api("farmacia", "GET", "/admin/customers?q=jorge.villanueva&limit=1")).customers?.[0]
  const mostrador = (await api("farmacia", "GET", "/admin/medical-orders?status=pending&recipient_area=pharmacy")).medical_orders ?? []
  // Las de corridas anteriores se retiran: la lista arranca con una sola.
  for (const o of mostrador) await api("enfermeria", "POST", `/admin/medical-orders/${o.id}/cancel`, { motivo: "Limpieza antes de capturar el manual" })
  await api("enfermeria", "POST", "/admin/medical-orders", { customer_id: jorge.id, customer_name: "Jorge Villanueva Cruz", recipient_area: "pharmacy", notes: "Tomar con alimentos.", items: [{ variant_id: variante, product_title: paracetamol.title, quantity: 2, instructions: "1 tableta cada 8 h por 3 días" }] })
  console.log(`   datos listos (cuarentena: ${hayCuarentena ? "sí" : "no"})`)
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
const escribir = async (placeholder, valor, i = 0) => {
  const campo = page.getByPlaceholder(placeholder, { exact: true }).filter({ visible: true }).nth(i)
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(300)
}
const escribirEtiqueta = async (etiqueta, valor) => {
  const campo = page.getByLabel(etiqueta, { exact: true }).filter({ visible: true }).first()
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(300)
}

// ── 1. Entrar ───────────────────────────────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 6000)

// ── 2. Existencias y lotes ─────────────────────────────────────────
await paso("existencias", 1500)
await page.getByText(/^Paracetamol 500 mg/).filter({ visible: true }).first().click({ force: true })
await page.waitForTimeout(2000)
// La ficha se abre pegada al borde inferior: se baja para que el mínimo y el
// máximo queden en cuadro y el aviso no los tape.
await page.mouse.wheel(0, 300)
await paso("presentacion-abierta")

// ── 3. Recetas de mostrador ─────────────────────────────────────────────────
await clic("Recetas", 3000)
await paso("recetas")
await page.locator('[aria-label^="Receta de Jorge"]').first().click({ force: true })
await page.waitForTimeout(1500)
await paso("receta-abierta")
await page.locator('[aria-label^="Surtir una menos de"]').first().click({ force: true })
await page.waitForTimeout(1200)
await page.getByLabel("Motivo del ajuste", { exact: true }).filter({ visible: true }).first().fill("El paciente sólo se lleva una caja; la otra la compra después")
await page.waitForTimeout(600)
await paso("reducir-con-motivo")
await clic("Confirmar", 3500)
await paso("receta-reducida")
await page.getByText(/^Surtir \(/).first().click({ force: true })
await page.waitForTimeout(1200)
await paso("confirmar-surtir")
await clic("Surtir", 5000)
await paso("receta-surtida")
await clic("Listo", 1200)

// ── 6. Kardex y caducidades ─────────────────────────────────────────────────
await clic("Kardex", 3500)
await paso("kardex")
await clic("Caducidad", 3500)
await paso("caducidades")

// ── 7. Ajustes, lo que no puede, pausar y salir ─────────────────────────────
await clic("Ajustes", 2500)
if (await texto("Abrir turno").isVisible().catch(() => false)) {
  await clic("Abrir turno", 2500)
}
await paso("ajustes-turno")
await clic("Cerrar turno", 2000)
await page.goto(`${POS}/cash-register`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await paso("no-puede-caja")
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await escribir("Contraseña", CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)

await browser.close()
console.log(`Listo: ${n} capturas.`)
