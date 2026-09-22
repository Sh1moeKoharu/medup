/**
 * Recorre el punto de venta como ENFERMERÍA y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run enfermeria
 *
 * Mismo molde que los demás: tableta apaisada, capturas numeradas en
 * img/enfermeria/, datos preparados por API (una orden del médico pendiente
 * en la bandeja, ninguna requisición pendiente de esta cuenta), impresión anulada.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POS = process.env.POS || "http://localhost:8081"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "enfermeria"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "enfermeria")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de ${USUARIO} — capturas en ${DIR}`)

// ── 0. Datos como al empezar un día ─────────────────────────────────────────
{
  const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
  const T = { enfermeria: await entrar(USUARIO), medico: await entrar("medico"), caja: await entrar("caja") }
  const api = async (rol, m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
  const yo = (await api("enfermeria", "GET", "/admin/users/me")).user
  // Requisiciones pendientes de otras corridas: se cancelan para que la lista empiece limpia.
  const reqs = (await api("enfermeria", "GET", `/admin/requisitions?status=pending&requested_by_id=${yo.id}`)).requisitions ?? []
  for (const r of reqs) await api("enfermeria", "POST", `/admin/requisitions/${r.id}/cancel`, { motivo: "Limpieza antes de capturar el manual" })
  // La bandeja necesita UNA orden del médico a Enfermería para María.
  const paciente = (await api("enfermeria", "GET", "/admin/customers?q=maria.ramirez&limit=1")).customers?.[0]
  // Sin cuenta pendiente arrastrada de otras corridas: así lo que se cargue
  // al aplicar la orden es exactamente lo de esta consulta.
  const cuentas = (await api("caja", "GET", `/admin/patient-bills?customer_id=${paciente.id}`)).bills ?? []
  for (const c of cuentas) await api("caja", "DELETE", `/admin/draft-orders/${c.id}`)
  const bandeja = (await api("enfermeria", "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).medical_orders ?? []
  // Dos órdenes del médico, siempre nuevas: María (Paracetamol 2, hay en
  // Enfermería) para ajustar con motivo y aplicar, y Jorge (Amoxicilina 2, sin
  // existencia en Enfermería) para pedir los faltantes a Farmacia.
  const jorge = (await api("enfermeria", "GET", "/admin/customers?q=Villanueva&limit=1")).customers?.[0]
  for (const o of bandeja.filter((o) => o.customer_id === paciente.id || o.customer_id === jorge.id)) {
    await api("medico", "POST", `/admin/medical-orders/${o.id}/cancel`, { motivo: "Limpieza antes de capturar el manual" })
  }
  const variante = async (q) => { const p = (await api("enfermeria", "GET", `/admin/products?q=${encodeURIComponent(q)}&limit=1`)).products?.[0]; return { variant_id: p.variants[0].id, product_title: p.title } }
  const para = await variante("Paracetamol")
  const amoxi = await variante("Amoxicilina")
  const nota = { findings: "Cefalea de tres días, sin fiebre.", procedures: "Se indica analgésico en consultorio.", attended_at: new Date().toISOString().slice(0, 10) }
  const r1 = await api("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, customer_name: "María Ramírez Solís", notes: "Sin alergias conocidas. Vía oral con agua.", items: [{ ...para, quantity: 2, instructions: "1 tableta cada 8 h por 5 días" }], nota_de_atencion: nota })
  const r2 = await api("medico", "POST", "/admin/medical-orders", { customer_id: jorge.id, customer_name: "Jorge Villanueva Cruz", notes: "Faringitis. Sin alergia a penicilinas.", items: [{ ...amoxi, quantity: 2, instructions: "1 cápsula cada 8 h por 7 días" }], nota_de_atencion: nota })
  if (!r1.medical_order || !r2.medical_order) throw new Error("No se crearon las órdenes: " + JSON.stringify([r1, r2]).slice(0, 400))
  // Y existencia en el almacén de Enfermería de lo que se va a añadir a la
  // orden (guantes): si no la hay, aplicar la orden se rechaza con 409.
  const almacenes = (await api("enfermeria", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).stock_locations ?? []
  const enfermeria = almacenes.find((l) => l.metadata?.altus_area === "nursing")
  const guantes = (await api("enfermeria", "GET", "/admin/products?q=Guantes&limit=1")).products?.[0]
  const lotesGuantes = (await api("enfermeria", "GET", `/admin/medical-batches?variant_id=${guantes.variants[0].id}&stock_location_id=${enfermeria.id}&status=active`)).batches ?? []
  if (!lotesGuantes.some((b) => Number(b.quantity) > 0)) {
    const caduca = new Date(); caduca.setFullYear(caduca.getFullYear() + 2)
    await api("enfermeria", "POST", "/admin/medical-batches", { batch_number: `GUANTES-${Date.now().toString().slice(-6)}`, expiration_date: caduca.toISOString(), variant_id: guantes.variants[0].id, stock_location_id: enfermeria.id, quantity: 20, apply_margin: false })
  }
  console.log(`   datos listos (${reqs.length} requisiciones canceladas)`)
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
const pestana = async (t, ms = 900) => {
  const tab = page.getByRole("tab", { name: t }).filter({ visible: true })
  await ((await tab.count()) ? tab.first() : page.getByText(t, { exact: true }).filter({ visible: true }).last()).click({ force: true })
  await page.waitForTimeout(ms)
}
const escribir = async (placeholder, valor, i = 0) => {
  const campo = page.getByPlaceholder(placeholder, { exact: true }).filter({ visible: true }).nth(i)
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(300)
}

// ── 1. Entrar: aterriza en la bandeja ───────────────────────────────────────
await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
await page.locator("input").first().waitFor({ timeout: 120000 })
await page.waitForTimeout(1500)
await page.locator("input").nth(0).fill(USUARIO)
await page.locator("input").nth(1).fill(CLAVE)
await paso("inicio-de-sesion")
await clic("Entrar", 5000)
await paso("bandeja", 2000)

// ── 2. Pacientes: los que tienen orden pendiente, primero ───────────────────
await pestana("Pacientes", 3500)
await paso("pacientes-con-pendientes")
await escribir("Buscar paciente por nombre...", "María")
await page.waitForTimeout(2000)
await page.getByText(/^Historial/).first().click()
await page.waitForTimeout(2500)
await paso("ficha-de-paciente")
await clic("Cerrar", 1500)

// ── 3. La orden de Jorge: falta en Enfermería, se pide a Farmacia ───────────
await pestana("Bandeja", 3000)
await page.locator("[aria-label^=\"Orden de Jorge\"]").first().click()
await page.waitForTimeout(2500)
await paso("orden-con-faltantes")
await clic("Pedir faltantes a Farmacia", 3500)
await paso("faltantes-pedidos")
await page.locator("[aria-label^=\"Orden de Jorge\"]").first().click()
await page.waitForTimeout(1000)

// ── 4. La orden de María: reducir con motivo, añadir, aplicar ───────────────
await page.locator("[aria-label^=\"Orden de María\"]").first().click()
await page.waitForTimeout(2500)
await paso("orden-abierta")
await page.getByLabel("Una menos").filter({ visible: true }).first().click({ force: true })
await page.waitForTimeout(1200)
await page.getByLabel("Motivo del ajuste").filter({ visible: true }).first().fill("La paciente ya tomó una tableta en casa antes de llegar")
await page.waitForTimeout(500)
await paso("reducir-con-motivo")
await clic("Confirmar", 3000)
await paso("ajuste-registrado")
await escribir("Añadir material o medicamento", "Guantes")
await page.waitForTimeout(2500)
await page.locator("[aria-label^=\"Añadir Guantes\"]").first().click()
await page.waitForTimeout(2500)
await paso("orden-ajustada")
await page.getByText(/^Aplicar \(/).first().click()
await page.waitForTimeout(1200)
await paso("confirmar-aplicar")
await clic("Aplicar", 5000)
await paso("orden-aplicada")

// ── 5. Nota de Enfermería ───────────────────────────────────────────────────
const nota = page.getByPlaceholder(/^Qué se atendió/).filter({ visible: true })
await nota.first().click()
await nota.first().fill("Se aplicó paracetamol en consultorio sin reacción adversa. Se entregan guantes para curación en casa.")
await clic("Guardar", 3000)
await paso("nota-guardada")
await clic("Listo", 1500)

// ── 5. Almacén de Enfermería: pedir a Farmacia ──────────────────────────────
await pestana("Almacén", 3000)
await paso("almacen")
await escribir("Buscar medicamento", "Paracetamol")
await page.waitForTimeout(2500)
await page.locator('[aria-label^="Añadir Paracetamol"]').first().click({ force: true })
await page.waitForTimeout(800)
for (let i = 0; i < 9; i++) { await page.getByLabel("Una más").first().click({ force: true }); await page.waitForTimeout(120) }
await escribir("Notas para Farmacia (opcional)", "Para el consultorio 2")
await paso("pedir-a-farmacia")
await clic("Enviar requisición", 4000)
await paso("requisicion-enviada")

// ── 6. Dar de baja con motivo ───────────────────────────────────────────────
await page.getByText(/^Lote /).filter({ visible: true }).first().click({ force: true })
await page.waitForTimeout(1200)
await escribir("Cantidad", "1")
await escribir("Motivo (obligatorio)", "Ampolleta rota al abrir la caja")
await paso("dar-de-baja")
// «Dar de baja» aparece tres veces: el título de la sección, el botón del
// formulario y el del diálogo de confirmación. Se pulsan el segundo y el último.
await page.getByText("Dar de baja", { exact: true }).filter({ visible: true }).nth(1).click({ force: true })
await page.waitForTimeout(1200)
await paso("confirmar-baja")
await page.getByText("Dar de baja", { exact: true }).filter({ visible: true }).last().click({ force: true })
await page.waitForTimeout(4000)
await paso("baja-registrada")

// ── 7. Mis recetas ──────────────────────────────────────────────────────────
await pestana("Mis recetas", 3000)
await paso("mis-recetas")

// ── 8. Lo que Enfermería no puede hacer ─────────────────────────────────────
await page.goto(`${POS}/cash-register`, { waitUntil: "commit", timeout: 180000 })
await page.waitForTimeout(4000)
await paso("no-puede-caja")

// ── 9. Mi turno, pausar y salir ─────────────────────────────────────────────
await pestana("Ajustes", 2500)
if (await page.getByText("Cerrar turno", { exact: true }).filter({ visible: true }).count()) await clic("Cerrar turno", 2500)
await clic("Abrir turno", 3000)
await paso("ajustes-turno-abierto")
await clic("Cerrar turno", 2500)
await clic("Pausar", 1500)
await paso("sesion-en-pausa")
await escribir("Contraseña", CLAVE)
await clic("Continuar", 3000)
await clic("Salir", 800)
await paso("cerrar-sesion")
await clic("Confirmar salida", 3000)

await browser.close()
console.log(`Listo: ${n} capturas.`)
