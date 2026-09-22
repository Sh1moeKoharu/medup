/**
 * Recorre el punto de venta como ALMACÉN y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run almacen
 *
 * Mismo molde que los demás: tableta apaisada, capturas numeradas en
 * img/almacen/, datos preparados por API (una requisición de Enfermería
 * pendiente, existencia suficiente en el almacén general), impresión anulada.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "almacen"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "almacen")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Datos como al empezar un día ─────────────────────────────────────────
let hayCuarentena = false
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const T = { farmacia: await entrar(USUARIO), enfermeria: await entrar("enfermeria") }
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
    await api("farmacia", "POST", "/admin/medical-batches", { batch_number: `PARA-${Date.now().toString().slice(-6)}`, expiration_date: caduca.toISOString(), variant_id: variante, stock_location_id: farmacia.id, quantity: 40, apply_margin: false })
  }
  // Cada corrida registra un lote AMX nuevo; los de corridas anteriores se
  // ajustan a cero para que la lista no acumule copias del mismo lote.
  const previos = (await api("farmacia", "GET", `/admin/medical-batches?stock_location_id=${farmacia.id}&status=active&limit=200`)).batches ?? []
  for (const b of previos) {
    // También los «TEST-…» que dejan las corridas de verificar-api.mjs.
    if (/^(AMX-|TEST-)/.test(String(b.batch_number)) && Number(b.quantity) > 0) {
      await api("farmacia", "POST", `/admin/medical-batches/${b.id}/write-off`, { quantity: Number(b.quantity), reason: "Ajuste de conteo antes de la demostración", type: "exit_adjustment" })
    }
  }
  // El mínimo arranca en 10 para que la captura muestre el antes y el después
  // de cambiarlo a 20/60 en pantalla.
  await api("farmacia", "POST", "/admin/stock-policies", { variant_id: variante, stock_location_id: farmacia.id, min_quantity: 10, max_quantity: null })
  // Una requisición de Enfermería pendiente de surtir.
  // Las de corridas anteriores quedan a medio surtir, y una a medio surtir ya
  // no se puede cancelar: se termina de surtir lo que falte —así sale de la
  // lista de pendientes— y se cancela el resto. Después se pide una entera,
  // para que la captura muestre el traspaso desde el principio.
  const pendientes = (await api("farmacia", "GET", "/admin/requisitions?status=pending")).requisitions ?? []
  for (const r of pendientes) {
    const surtida = (r.items ?? []).some((i) => Number(i.quantity_dispatched ?? 0) > 0)
    if (surtida) await api("farmacia", "POST", `/admin/requisitions/${r.id}/dispatch`, {})
    else await api("enfermeria", "POST", `/admin/requisitions/${r.id}/cancel`, { motivo: "Limpieza antes de capturar el manual" })
  }
  await api("enfermeria", "POST", "/admin/requisitions", { items: [{ variant_id: variante, product_title: paracetamol.title, quantity: 10 }], notes: "Para el consultorio 2" })
  const cuarentena = (await api("farmacia", "GET", `/admin/medical-batches?stock_location_id=${farmacia.id}&status=quarantined`)).batches ?? []
  hayCuarentena = cuarentena.some((b) => Number(b.quantity) > 0)
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

// ── 2. Existencias, lotes y mínimos ─────────────────────────────────────────
await paso("existencias", 1500)
await page.getByText(/^Paracetamol 500 mg/).filter({ visible: true }).first().click({ force: true })
await page.waitForTimeout(2000)
// La ficha se abre pegada al borde inferior: se baja para que el mínimo y el
// máximo queden en cuadro y el aviso no los tape.
await page.mouse.wheel(0, 300)
await paso("presentacion-abierta")
await escribirEtiqueta("Mínimo", "20")
await escribirEtiqueta("Máximo", "60")
await clic("Guardar", 3000)
await paso("minimo-guardado")

// ── 4. Traspasos a Enfermería ───────────────────────────────────────────────
await clic("Traspasos", 3000)
await paso("traspasos")
// Surtido PARCIAL: la mitad de lo que quede pendiente (el campo trae lo pendiente).
const campoCantidad = page.getByLabel(/^Cantidad a surtir de /).filter({ visible: true }).first()
const pendiente = Number(await campoCantidad.inputValue()) || 2
await campoCantidad.fill(String(Math.max(1, Math.floor(pendiente / 2))))
await page.waitForTimeout(600)
await paso("traspaso-parcial")
await page.getByText(/^Surtir \d+ unidad/).first().click({ force: true })
await page.waitForTimeout(1200)
await paso("confirmar-traspaso")
await clic("Surtir", 5000)
await paso("traspaso-surtido")

// ── 5. Lotes: alta con los datos de la compra ───────────────────────────────
await clic("Lotes", 3000)
await paso("lotes")
await escribir("Buscar medicamento", "Amoxicilina")
await page.waitForTimeout(2500)
await page.locator('[aria-label^="Elegir Amoxicilina"]').first().click({ force: true })
await page.waitForTimeout(1500)
const lote = `AMX-${new Date().toISOString().slice(2, 7).replace("-", "")}`
const caduca = new Date(); caduca.setFullYear(caduca.getFullYear() + 2)
await escribirEtiqueta("Número de lote", lote)
await escribirEtiqueta("Fecha de caducidad", caduca.toISOString().slice(0, 10))
await escribirEtiqueta("Cantidad comprada", "3")
await escribirEtiqueta("Unidad de compra", "caja")
await escribirEtiqueta("Unidades de venta por unidad de compra", "12")
await escribirEtiqueta("Unidad de venta", "cápsula")
await escribirEtiqueta("Fecha de compra", new Date().toISOString().slice(0, 10))
await escribirEtiqueta("Costo por unidad de compra", "96")
await escribirEtiqueta("Estante", "B-2")
// El último campo arrastra el formulario hacia arriba y corta los primeros
// dos nombres: se sube lo justo para verlo entero.
await page.mouse.wheel(0, -120)
await paso("alta-de-lote")
await clic("Registrar lote", 1500)
// Al registrarse, el formulario se cierra y la página se acorta: se sube para
// que el aviso se vea junto al buscador ya vacío.
await page.mouse.wheel(0, -600)
await paso("lote-registrado", 400)
// Lotes del almacén: baja con motivo.
// Se le da de baja al lote que acaba de registrarse, que es lo que cuenta el
// manual; se busca por su número para no depender del orden de la lista.
await page.getByText(`Lote ${lote}`, { exact: true }).filter({ visible: true }).first().click({ force: true })
await page.waitForTimeout(1200)
await escribir("Cantidad", "2")
await escribir("Motivo (obligatorio, 5 letras o más)", "Blíster dañado en el traslado")
await paso("dar-de-baja")
await page.getByText("Dar de baja", { exact: true }).filter({ visible: true }).last().click({ force: true })
await page.waitForTimeout(1200)
await paso("confirmar-baja")
await page.getByText("Dar de baja", { exact: true }).filter({ visible: true }).last().click({ force: true })
await page.waitForTimeout(4000)
await paso("baja-registrada")
if (hayCuarentena) {
  // La lista de lotes en cuarentena es la ÚLTIMA de la pantalla; «Lote …»
  // también aparece en Existencias (pantalla vecina, sigue en el DOM).
  try {
    await clic("En cuarentena", 2500)
    await page.getByText(/^Lote /).filter({ visible: true }).last().click({ force: true })
    await page.waitForTimeout(1500)
    await escribir("Motivo (obligatorio, 5 letras o más)", "Caducado; destrucción sanitaria")
    await escribir("Tu contraseña", CLAVE)
    await page.mouse.wheel(0, 200)
    await paso("destruir-lote")
  } catch (e) {
    console.log("   (sin captura de destrucción:", String(e.message).slice(0, 80), ")")
  }
}

// ── 6. Kardex y caducidades ─────────────────────────────────────────────────
await clic("Kardex", 3500)
await paso("kardex")
await clic("Mermas", 2000)
await paso("kardex-mermas")
await clic("Caducidad", 3500)
await paso("caducidades")

// ── 6b. Reportes: el inventario valorizado ─────────────────────────────────
await clic("Reportes", 3500)
await clic("Inventario valorizado", 4000)
await paso("reportes-inventario", 1500)

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
