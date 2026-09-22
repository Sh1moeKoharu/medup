/**
 * Recorre el PANEL DE ADMINISTRACIÓN y captura cada pantalla del manual.
 *
 *   cd docs/manual && npm run administracion
 *
 * A diferencia de los otros perfiles, Administración no trabaja en el punto de
 * venta sino en el panel compilado, en un equipo de escritorio. Por eso la
 * ventana es de 1440×900 y no una tableta apaisada.
 *
 * Antes hay que tener el panel servido:
 *   cd backend && npm run build
 *   node pruebas/servir-admin.mjs .medusa/server/public/admin 4173 http://localhost:9000
 *
 * El panel avisa con `alert` y pregunta con `confirm` del navegador, que no
 * salen en una captura: se aceptan automáticamente y se describen en el texto.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const PANEL = process.env.PANEL || "http://localhost:4173"
const API = process.env.API || "http://localhost:9000"
const USUARIO = process.env.USUARIO || "admin"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "img", "administracion")
fs.mkdirSync(DIR, { recursive: true })
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f))

console.log(`Manual de administración — capturas en ${DIR}`)

// ── 0. Datos que el recorrido necesita señalar ──────────────────────────────
const entrar = async (u) => (await (await fetch(`${API}/auth/user/emailpass`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${u}@sigh.local`, password: CLAVE }) })).json()).token
const T = await entrar(USUARIO)
const api = async (m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
const paciente = (await api("GET", "/admin/customers?q=maria.ramirez&limit=1")).customers?.[0]
const producto = (await api("GET", "/admin/products?q=Paracetamol&limit=1")).products?.[0]
console.log(`   paciente: ${paciente?.email ?? "—"} · producto: ${producto?.title ?? "—"}`)

// Ninguna cuenta debe quedar bloqueada de una corrida anterior: el recorrido
// bloquea y reactiva una para enseñar cómo se ve, y si se interrumpió a medias
// la cuenta se quedó fuera.
const desbloquearTodo = async () => {
  const { users = [] } = await api("GET", "/admin/staff")
  for (const u of users) {
    if (u.metadata?.bloqueada || u.metadata?.blocked_at) await api("POST", `/admin/staff/${u.id}/unblock`, {})
  }
}
await desbloquearTodo()

const T_CAJA = await entrar("caja")
const T_ENF = await entrar("enfermeria")
const apiComo = async (t, m, ruta, body) => { const r = await fetch(API + ruta, { method: m, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({})) }
for (const t of [T_CAJA, T]) {
  const abierta = (await apiComo(t, "GET", "/admin/cash-sessions/current")).session
  if (abierta) await apiComo(t, "POST", `/admin/cash-sessions/${abierta.id}/close`, { actual_closing_amount: Number(abierta.opening_amount) || 0, notes: "Cierre antes de capturar el manual" })
}
const cajaAbierta = (await apiComo(T_CAJA, "POST", "/admin/cash-sessions", { opening_amount: 500 })).session
const cerrarCajaDePrueba = async () => { if (cajaAbierta?.id) await apiComo(T_CAJA, "POST", `/admin/cash-sessions/${cajaAbierta.id}/close`, { actual_closing_amount: 500, notes: "Cierre tras capturar el manual" }) }
{
  const pendientes = (await apiComo(T_ENF, "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).medical_orders ?? []
  if (!pendientes.length && paciente && producto) {
    await apiComo(T_ENF, "POST", "/admin/medical-orders", { customer_id: paciente.id, customer_name: "María Ramírez Solís", recipient_area: "nursing", notes: "Para el manual", items: [{ variant_id: producto.variants[0].id, product_title: producto.title, quantity: 2, instructions: "1 tableta cada 8 h por 5 días" }] })
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "es-MX" })
const page = await context.newPage()
// El panel pregunta y avisa con los diálogos del navegador. Se aceptan para que
// el recorrido siga; lo que dicen va explicado en el manual.
page.on("dialog", (d) => d.accept().catch(() => {}))
await page.addInitScript(() => { window.print = () => {} })

let n = 0
const paso = async (nombre, ms = 1200) => {
  await page.waitForTimeout(ms)
  n += 1
  const archivo = `${String(n).padStart(2, "0")}-${nombre}.png`
  await page.screenshot({ path: path.join(DIR, archivo) })
  console.log("  ", archivo)
}
const texto = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first()
const clic = async (t, ms = 1200) => { await texto(t).click({ force: true }); await page.waitForTimeout(ms) }
const ir = async (ruta, ms = 4000) => {
  await page.goto(`${PANEL}/app/${ruta}`, { waitUntil: "commit", timeout: 180000 })
  await page.waitForTimeout(ms)
}
const escribir = async (placeholder, valor) => {
  const campo = page.getByPlaceholder(placeholder, { exact: true }).filter({ visible: true }).first()
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(300)
}

try {
  // ── 1. Entrar ─────────────────────────────────────────────────────────────
  await page.goto(`${PANEL}/app/login`, { waitUntil: "commit", timeout: 180000 })
  await page.locator("input").first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1500)
  await page.locator('input[name="email"]').fill(USUARIO)
  await page.locator('input[name="password"]').fill(CLAVE)
  await paso("inicio-de-sesion")
  await clic("Entrar", 8000)
  await paso("entrada", 2000)

  // ── 2. Personal y roles ───────────────────────────────────────────────────
  await ir("staff")
  await paso("personal")
  await clic("Alta de personal", 1200)
  await escribir("jperez", "rgomez")
  await escribir("Contraseña segura", "Clinica#2026")
  await escribir("Ej. Juan", "Rosa")
  await escribir("Ej. Pérez", "Gómez Díaz")
  await escribir("Ej. 0007", "0009")
  await paso("personal-alta")
  await page.getByText("Selecciona un rol", { exact: true }).filter({ visible: true }).first().click({ force: true })
  await paso("personal-rol", 1000)
  // Con el rol Médico aparecen los datos que salen en su receta.
  await page.getByRole("option", { name: "Médico" }).first().click({ force: true })
  await page.waitForTimeout(800)
  await page.getByText("Datos para la receta", { exact: true }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: "start" }))
  await paso("personal-medico-datos", 1000)
  await clic("Cancelar", 1200)
  // Bloquear y reactivar una cuenta de prueba, para enseñar cómo se ve.
  const fila = page.locator("tr").filter({ hasText: "auditoria" }).first()
  await fila.getByText("Bloquear", { exact: true }).click({ force: true })
  await page.waitForTimeout(3000)
  await paso("personal-bloqueada")
  await page.locator("tr").filter({ hasText: "auditoria" }).first().getByText("Reactivar", { exact: true }).click({ force: true })
  await page.waitForTimeout(3000)

  // ── 3. Honorarios y nómina ────────────────────────────────────────────────
  await ir("honorarios", 6000)
  await paso("nomina-del-periodo")
  await clic("Esquemas de pago", 2500)
  await paso("esquemas-de-pago")
  await page.locator("tr").filter({ hasText: "Médico Pruebas" }).first().getByText("Editar", { exact: true }).click({ force: true })
  await page.waitForTimeout(1500)
  await page.getByText("Esquema de Médico Pruebas", { exact: true }).first().evaluate((e) => e.scrollIntoView({ block: "start" })).catch(() => {})
  await paso("esquema-editor")
  await clic("Cancelar", 1200)
  await clic("Pagos realizados", 2500)
  await paso("pagos-realizados")
  await clic("Turnos", 2500)
  await clic("Del periodo", 3000)
  await paso("turnos")

  // ── 3b. Reportes ──────────────────────────────────────────────────────────
  await ir("reportes", 6000)
  await paso("reportes")

  // ── 4. Caja, inventario y circuito clínico ────────────────────────────────
  await ir("cash-sessions")
  await paso("cortes-de-caja")
  await page.getByText("Ver detalle", { exact: true }).filter({ visible: true }).first().click({ force: true })
  await paso("corte-detalle", 2000)

  await ir("inventory-movements")
  await paso("kardex")
  await ir("inventory-batches")
  await paso("lotes-fefo")
  await page.getByText("Corregir", { exact: true }).filter({ visible: true }).first().click({ force: true })
  await page.waitForTimeout(1200)
  await page.getByText("Guardar corrección", { exact: true }).first().evaluate((e) => e.scrollIntoView({ block: "center" })).catch(() => {})
  await paso("lote-corregir")
  await ir("medical-orders")
  await paso("ordenes-medicas")
  // El segundo selector es el destino: se cambia a Enfermería para enseñar el ajuste.
  await page.getByRole("combobox").nth(1).click({ force: true })
  await page.getByRole("option", { name: "Enfermería" }).first().click({ force: true })
  await page.waitForTimeout(3000)
  await page.getByText("Ajustar", { exact: true }).filter({ visible: true }).first().click({ force: true })
  await page.waitForTimeout(1500)
  await paso("orden-ajustar")
  await ir("requisitions")
  await paso("requisiciones")

  // ── 5. Convenios y empresas ───────────────────────────────────────────────
  await ir("b2b-agreements")
  await paso("convenios")
  await ir("customers-by-company")
  await paso("pacientes-por-empresa")

  // ── 6. Almacenes, productos con costo y las fichas ────────────────────────
  await ir("almacenes", 6000)
  await paso("almacenes")
  {
    const { stock_locations = [] } = await api("GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")
    const farmacia = stock_locations.find((l) => l.metadata?.altus_area === "pharmacy") ?? stock_locations[0]
    if (farmacia) {
      await ir(`almacenes/${farmacia.id}`, 6000)
      await paso("almacen-detalle")
      await page.getByText(/^Lotes \(/).filter({ visible: true }).first().click({ force: true })
      await paso("almacen-lotes", 2000)
    }
  }
  if (producto) {
    await ir("products", 6000)
    await paso("productos-con-inventario")
  }
  await ir("alta-de-producto", 5000)
  await page.locator("#titulo").fill("Loratadina 10 mg (caja 10 tabletas)")
  await escribir("Ej. Paracetamol", "Loratadina")
  await escribir("Ej. Caja con 20 tabletas", "Caja con 10 tabletas de 10 mg")
  await page.getByText("Costo y precio", { exact: true }).filter({ visible: true }).first().evaluate((e) => e.scrollIntoView({ block: "start" }))
  await page.locator("#costo").fill("42.50")
  await page.locator("#margen").fill("35")
  await page.waitForTimeout(800)
  await paso("alta-de-producto")
  if (producto) {
    await ir(`products/${producto.id}`, 6000)
    await page.getByText("Costo y precio", { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded().catch(() => {})
    await paso("ficha-de-producto", 1500)
  }
  if (paciente) {
    await ir(`customers/${paciente.id}`, 5000)
    await page.getByText(/^Expediente clínico|^Tipo de paciente/).filter({ visible: true }).first().scrollIntoViewIfNeeded().catch(() => {})
    await paso("ficha-de-paciente", 1500)
  }

  // ── 7. Ticket, bitácora y punto de venta ──────────────────────────────────
  await ir("recibo")
  await paso("ticket")
  await ir("audit-logs")
  await paso("bitacora")
  // «Punto de venta» no se captura: esa entrada del menú no es una pantalla,
  // salta al punto de venta en cuanto se abre.

  // ── 8. Modo oscuro y salir ────────────────────────────────────────────────
  await clic("Admin Pruebas", 1200)
  await clic("Tema", 1000)
  await paso("tema")
  await clic("Oscuro", 2000)
  await ir("staff")
  await paso("modo-oscuro")
  await clic("Admin Pruebas", 1200)
  await paso("cerrar-sesion")
  await clic("Cerrar sesión", 4000)
} finally {
  await desbloquearTodo()
  await cerrarCajaDePrueba()
  await browser.close()
}

console.log(`Listo: ${n} capturas.`)
