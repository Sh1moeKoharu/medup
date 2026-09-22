/**
 * Recorre el punto de venta como CAJA y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm install && npm run caja
 *
 * Necesita el punto de venta en http://localhost:8081 (npm run web en
 * frontend/), el servidor en :9000 y las cuentas de `npm run seed`. Escribe
 * las imágenes en img/caja/ con el número de paso delante, en el orden en que
 * las usa caja.md. Cuando cambie una pantalla, se vuelve a correr y las
 * capturas se regeneran solas; el texto del manual se revisa a mano.
 *
 * Tableta apaisada (1024 × 768): es lo que hay en el mostrador, y a ese ancho
 * el carrito ya va como columna lateral del catálogo.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const USUARIO = process.env.USUARIO || "caja"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "caja")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, locale: "es-MX" })
// La impresión abre el diálogo del sistema y detendría el recorrido: se anula.
await context.addInitScript(() => {
  window.print = () => {}
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    get() {
      const w = d.get.call(this)
      if (w) { try { w.print = () => {} } catch {} }
      return w
    },
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
// Las pestañas de abajo: el título de una pantalla apilada puede decir lo mismo.
const pestana = async (t, ms = 900) => {
  const tab = page.getByRole("tab", { name: t }).filter({ visible: true })
  await ((await tab.count()) ? tab.first() : page.getByText(t, { exact: true }).filter({ visible: true }).last()).click()
  await page.waitForTimeout(ms)
}
const escribir = async (placeholder, valor, i = 0) => {
  const campo = page.getByPlaceholder(placeholder).filter({ visible: true }).nth(i)
  await campo.click()
  await campo.fill(valor)
  await page.waitForTimeout(300)
}

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Dejar los datos como al empezar un día ───────────────────────────────
// El recorrido abre y cierra un turno, vende y cobra una cuenta de consulta.
// Para que se pueda repetir, antes se cierra cualquier turno que quedara
// abierto y se asegura que la paciente del ejemplo tenga una cuenta pendiente.
{
  const API = process.env.API || "http://localhost:9000"
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const T = { caja: await entrar(USUARIO), admin: await entrar("admin"), medico: await entrar("medico"), enfermeria: await entrar("enfermeria") }
  const api = async (rol, m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
  // Una sola caja en la clínica: se cierra cualquiera que haya quedado abierta,
  // y Administración abre una para enseñar la caja ocupada.
  for (const rol of ["caja", "admin"]) {
    const abierto = (await api(rol, "GET", "/admin/cash-sessions/current")).session
    if (abierto) await api(rol, "POST", `/admin/cash-sessions/${abierto.id}/close`, { actual_closing_amount: Number(abierto.opening_amount) || 0, notes: "Cierre antes de capturar el manual" })
  }
  globalThis.__cajaAdmin = (await api("admin", "POST", "/admin/cash-sessions", { opening_amount: 0 })).session
  globalThis.__cerrarCajaAdmin = () => api("admin", "POST", `/admin/cash-sessions/${globalThis.__cajaAdmin?.id}/close`, { actual_closing_amount: 0, notes: "Cierre para la demostración" })
  const paciente = (await api("caja", "GET", "/admin/customers?q=maria.ramirez&limit=1")).customers?.[0]
  const producto = (await api("caja", "GET", "/admin/products?q=Paracetamol&limit=1")).products?.[0]
  // La cuenta que se cobra en el recorrido se rehace en cada corrida: si se
  // reutiliza la de la vez anterior, el total crece con cada aplicación de
  // Enfermería y los $100 del ejemplo dejan de alcanzar.
  const pendientes = (await api("caja", "GET", `/admin/patient-bills?customer_id=${paciente.id}`)).bills ?? []
  for (const c of pendientes) await api("caja", "DELETE", `/admin/draft-orders/${c.id}`)
  const orden = await api("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, customer_name: "María Ramírez Solís", recipient_area: "nursing", notes: "Dolor de cabeza; aplicar en consultorio", items: [{ variant_id: producto.variants[0].id, product_title: producto.title, quantity: 2, instructions: "1 tableta cada 8 h" }] })
  await api("enfermeria", "POST", `/admin/medical-orders/${orden.medical_order.id}/consume`)
  console.log("   datos listos")
}

// ── 1. Entrar ───────────────────────────────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 5000)

// ── 2. Aterriza en la Caja: ocupada mientras otra persona la tenga abierta ──
await page.evaluate(() => window.scrollTo(0, 0))
await paso("caja-ocupada", 2500)
await globalThis.__cerrarCajaAdmin()
await page.reload({ waitUntil: "commit" })
await page.waitForTimeout(8000)

// ── 3. Abrir la caja: lleva a Productos ─────────────────────────────────────
await escribir("0.00", "500")
await paso("caja-cerrada-fondo")
await clic("Abrir caja", 5000)
await paso("productos-tras-abrir", 1500)
await pestana("Caja", 2500)
await paso("caja-abierta")

// ── 4. Venta de mostrador en efectivo ───────────────────────────────────────
await clic("Productos", 1500)
await escribir("Buscar productos...", "Paracetamol")
await page.waitForTimeout(1500)
await paso("productos-buscar")
await page.locator('[aria-label^="Añadir Paracetamol"]').first().click()
await page.waitForTimeout(3000)
// Segundo toque: se suma al mismo renglón.
await page.locator('[aria-label^="Añadir Paracetamol"]').first().click()
await page.waitForTimeout(3000)
await paso("carrito-con-producto")
await clic("Cobrar", 3000)
await escribir("0.00", "100")
await paso("cobro-efectivo")
await clic("Completar orden", 1500)
await paso("venta-registrada", 300)
await page.waitForTimeout(4000)
await clic("Productos", 2000)

// ── 5. Venta con tarjeta: la referencia de la terminal es obligatoria ───────
await escribir("Buscar productos...", "Ibuprofeno")
await page.waitForTimeout(1500)
await page.locator('[aria-label^="Añadir Ibuprofeno"]').first().click()
await page.waitForTimeout(1500)
await clic("Cobrar", 3000)
await clic("Tarjeta", 800)
await paso("cobro-tarjeta-sin-referencia")
await escribir("Últimos dígitos del comprobante", "4512")
await paso("cobro-tarjeta-con-referencia")
await clic("Completar orden", 6000)
await clic("Productos", 2000)

// ── 6. Órdenes y reimpresión del ticket ─────────────────────────────────────
await clic("Órdenes", 3000)
await paso("ordenes")
try {
  await page.getByText(/^Orden #\d+/).first().click({ timeout: 4000 })
} catch {
  await page.getByText(/Tarjeta|Efectivo/).first().click({ timeout: 4000 })
}
await page.waitForTimeout(2500)
await paso("detalle-de-orden")
await page.keyboard.press("Escape")
await page.waitForTimeout(800)
if (!page.url().endsWith("/orders")) await page.goBack()
await page.waitForTimeout(1500)

// ── 7. Pacientes: alta, ficha y cobro de la cuenta de consulta ──────────────
await clic("Pacientes", 3000)
await paso("pacientes")
await clic("Nuevo paciente", 1500)
await paso("nuevo-paciente")
// El formulario de alta se cierra con la X (o Escape); no se crea nadie.
await page.keyboard.press("Escape")
await page.waitForTimeout(1200)
if (await page.getByPlaceholder("Apellidos").filter({ visible: true }).count()) {
  await page.getByLabel(/cerrar/i).first().click().catch(() => page.goBack())
  await page.waitForTimeout(1200)
}
await escribir("Buscar pacientes por nombre o teléfono...", "María")
await page.waitForTimeout(2500)
await page.getByText(/^Detalles/).first().click()
await page.waitForTimeout(3000)
await paso("ficha-de-paciente")
await clic("Cobrar cuenta", 5000)
await paso("cobro-de-cuenta")
await escribir("0.00", "100")
await clic("Completar orden", 6000)
await clic("Productos", 2000)

// ── 8. Movimientos de efectivo y corte ──────────────────────────────────────
await pestana("Caja", 2500)
await clic("Entrada", 1200)
await escribir("0.00", "200")
await escribir("Ej: Cambio de billetes", "Cambio de billetes")
await paso("caja-entrada-de-efectivo")
await clic("Registrar entrada", 3000)
await paso("caja-resumen-del-turno")
await clic("Hacer corte de caja", 1500)
await escribir("0.00", "880")
await paso("corte-de-caja")
await clic("Cerrar caja", 5000)
await paso("caja-cerrada-cortes-anteriores")

// ── 9. Ajustes e impresora ──────────────────────────────────────────────────
await clic("Ajustes", 2500)
await paso("ajustes")
await page.getByLabel("Ajustes de impresión").click()
await page.waitForTimeout(2500)
await paso("impresion")
await page.goBack()
await page.waitForTimeout(1500)

// ── 10. Lo que Caja no puede hacer ──────────────────────────────────────────
await page.goto(`${POS}/activity`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(3000)
await paso("no-puede-bitacora")
await page.goto(`${POS}/almacen`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await paso("no-puede-almacen")

// ── 11. Pausar y salir ──────────────────────────────────────────────────────
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await escribir("Contraseña", CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)
await paso("sesion-cerrada")

await browser.close()
console.log(`Listo: ${n} capturas.`)
