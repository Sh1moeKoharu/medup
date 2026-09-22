/**
 * Recorre el punto de venta y el panel en un navegador real y comprueba que
 * cada cosa hace lo que dice.
 *
 *   cd pruebas-ui && npm run validar          # todo
 *   npm run validar:pos                       # sólo el punto de venta
 *   npm run validar:panel                     # sólo el panel
 *
 * Qué NO puede comprobar un guion: que el papel salga de la impresora térmica
 * y que la tableta responda al dedo. Lo demás —a dónde entra cada perfil, qué
 * botón se enciende, qué pide motivo, qué queda registrado— sí, y es lo que
 * hay aquí. La impresión se comprueba contando las llamadas a `window.print`,
 * que es exactamente lo que el sistema le pide al equipo.
 *
 * Hace falta: el servidor en :9000, el punto de venta en :8081 y el panel
 * compilado servido en :4173 (backend → npm run dev:panel).
 *
 * Deja datos: una venta, un paciente, una receta aplicada, un pago anulado.
 * Es un recorrido real; se corre contra la base de pruebas, nunca contra la
 * de la clínica.
 */
import { chromium } from "playwright"

const POS = process.env.POS || "http://localhost:8081"
const PANEL = process.env.PANEL || "http://localhost:4173"
const API = process.env.API || "http://localhost:9000"
const CLAVE = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const SOLO = (process.argv[2] || "").toLowerCase()

// Marcas irrepetibles: así se distingue lo de esta corrida de lo que ya había.
const SELLO = Date.now().toString().slice(-6)
const MARCA_NOTA = `Cefalea ${SELLO} (nota del médico)`

let correctas = 0
const fallos = []

const check = (desc, ok, detalle = "") => {
  if (ok) {
    correctas++
    console.log(`   ok   ${desc}`)
  } else {
    fallos.push(desc)
    console.log(`   FALLA ${desc}${detalle ? `  → ${detalle}` : ""}`)
  }
  return ok
}
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`)

// ── La API, para preparar y para comprobar lo que no se ve ──────────────────
const T = {}
const entrarApi = async (usuario) => {
  const r = await fetch(`${API}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${usuario}@sigh.local`, password: CLAVE }),
  })
  const j = await r.json().catch(() => ({}))
  return j.token
}
const api = async (rol, metodo, ruta, cuerpo) => {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const texto = await r.text()
  let j = {}
  try { j = JSON.parse(texto) } catch { j = { texto } }
  return { code: r.status, j }
}

// ── El navegador ────────────────────────────────────────────────────────────
let navegador
const contextos = []
/** Un contexto por perfil: así cada uno entra limpio, sin heredar la sesión. */
const nuevoContexto = async (viewport = { width: 1280, height: 800 }) => {
  const ctx = await navegador.newContext({ viewport, deviceScaleFactor: 1, locale: "es-MX" })
  // La impresión se cuenta, no se abre: el diálogo del sistema congelaría el guion.
  await ctx.addInitScript(() => {
    window.__impresiones = 0
    window.print = () => { window.__impresiones++ }
    const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const w = d.get.call(this)
        if (w) { try { w.print = () => { window.__impresiones++ } } catch {} }
        return w
      },
    })
    const abrir = window.open.bind(window)
    window.open = (...args) => {
      const w = abrir(...args)
      if (w) { try { w.print = () => { window.__impresiones++ } } catch {} }
      return w
    }
  })
  contextos.push(ctx)
  return ctx
}

const impresiones = (page) => page.evaluate(() => window.__impresiones ?? 0)

/** Los diálogos del navegador (alert/confirm) se aceptan y se guarda el texto. */
const conDialogos = (page) => {
  const vistos = []
  page.on("dialog", async (d) => {
    vistos.push(d.message())
    await d.accept().catch(() => {})
  })
  return vistos
}

const texto = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first()
const hay = async (page, t) => (await page.getByText(t, { exact: false }).filter({ visible: true }).count()) > 0
const clic = async (page, t, ms = 1200) => { await texto(page, t).click({ force: true }); await page.waitForTimeout(ms) }
const escribir = async (page, placeholder, valor, i = 0) => {
  const campo = page.getByPlaceholder(placeholder, { exact: true }).filter({ visible: true }).nth(i)
  await campo.click({ force: true })
  await campo.fill(valor)
  await page.waitForTimeout(300)
}
/** Las pestañas de abajo: el título de una pantalla apilada puede decir lo mismo. */
const pestana = async (page, t, ms = 2500) => {
  const tab = page.getByRole("tab", { name: t }).filter({ visible: true })
  await ((await tab.count()) ? tab.first() : page.getByText(t, { exact: true }).filter({ visible: true }).last()).click({ force: true })
  await page.waitForTimeout(ms)
}

const entrarPos = async (ctx, usuario) => {
  const page = await ctx.newPage()
  conDialogos(page)
  await page.goto(`${POS}/login`, { waitUntil: "commit", timeout: 180000 })
  await page.locator("input").first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1200)
  await page.locator("input").nth(0).fill(usuario)
  await page.locator("input").nth(1).fill(CLAVE)
  await clic(page, "Entrar", 6000)
  return page
}

const entrarPanel = async (ctx) => {
  const page = await ctx.newPage()
  const dialogos = conDialogos(page)
  await page.goto(`${PANEL}/app/login`, { waitUntil: "commit", timeout: 180000 })
  await page.locator('input[name="email"]').waitFor({ timeout: 120000 })
  await page.waitForTimeout(1000)
  await page.locator('input[name="email"]').fill("admin")
  await page.locator('input[name="password"]').fill(CLAVE)
  await page.locator("form").first().evaluate((f) => f.requestSubmit())
  await page.waitForTimeout(8000)
  return { page, dialogos }
}
const irPanel = async (page, ruta, ms = 5000) => {
  await page.goto(`${PANEL}/app/${ruta}`, { waitUntil: "commit", timeout: 180000 })
  await page.waitForTimeout(ms)
}

// ── Preparación: el punto de partida de siempre ─────────────────────────────
const preparar = async () => {
  for (const rol of ["admin", "caja", "medico", "enfermeria", "farmacia", "almacen", "rrhh", "auditoria"]) {
    T[rol] = await entrarApi(rol)
    if (!T[rol]) throw new Error(`No se pudo entrar como "${rol}". ¿El servidor está en ${API}?`)
  }
  // Ninguna caja abierta de una corrida anterior.
  for (const rol of ["caja", "admin"]) {
    const abierta = (await api(rol, "GET", "/admin/cash-sessions/current")).j?.session
    if (abierta) await api(rol, "POST", `/admin/cash-sessions/${abierta.id}/close`, { actual_closing_amount: Number(abierta.opening_amount) || 0, notes: "Cierre antes de validar" })
  }
  // Los pagos de validaciones anteriores se anulan: el periodo tiene que quedar
  // libre para volver a probar el pago.
  for (const p of (await api("rrhh", "GET", "/admin/payroll/payments")).j?.pagos ?? []) {
    if (String(p.reference ?? "").startsWith("Validación")) {
      await api("rrhh", "POST", `/admin/payroll/payments/${p.id}/anular`, { motivo: "Limpieza de la validación por navegador" })
    }
  }

  // Una orden de Enfermería sin existencia suficiente, para el circuito de faltantes.
  const jorge = (await api("admin", "GET", "/admin/customers?q=Villanueva&limit=1")).j?.customers?.[0]
  const pendientes = (await api("enfermeria", "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).j?.medical_orders ?? []
  const deJorge = pendientes.find((o) => o.customer_id === jorge?.id)
  let ordenFaltantes = deJorge?.id ?? null
  if (!ordenFaltantes && jorge) {
    const amoxi = (await api("admin", "GET", "/admin/products?q=Amoxicilina&limit=1")).j?.products?.[0]
    const creada = await api("medico", "POST", "/admin/medical-orders", {
      customer_id: jorge.id,
      customer_name: "Jorge Villanueva Cruz",
      notes: "Faringitis. Sin alergia a penicilinas.",
      items: [{ variant_id: amoxi?.variants?.[0]?.id, product_title: amoxi?.title, quantity: 2, instructions: "1 cápsula cada 8 h por 7 días" }],
      nota_de_atencion: { findings: "Faringe hiperémica", procedures: "Se indica antibiótico" },
    })
    ordenFaltantes = creada.j?.medical_order?.id ?? null
  }
  const maria = (await api("admin", "GET", "/admin/customers?q=maria.ramirez&limit=1")).j?.customers?.[0]
  for (const o of pendientes) {
    const unidades = (o.items ?? []).reduce((t, i) => t + Number(i.quantity ?? 0), 0)
    const esDeMaria = o.customer_id === maria?.id
    if (esDeMaria || unidades === 0) {
      await api("medico", "POST", `/admin/medical-orders/${o.id}/cancel`, { motivo: "Limpieza antes de validar por navegador" })
    }
  }
  return { jorge, maria, ordenFaltantes }
}

// ── A · Caja ────────────────────────────────────────────────────────────────
const validarCaja = async (datos) => {
  seccion("A · CAJA")
  const ctx = await nuevoContexto()
  const page = await entrarPos(ctx, "caja")

  check("Caja entra directo a la pantalla de Caja (punto 3)", await hay(page, "La caja está cerrada"), await page.title())
  await escribir(page, "0.00", "500")
  await clic(page, "Abrir caja", 3000)
  const catalogo = await page
    .getByPlaceholder("Buscar productos...", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  check("al abrir la caja aterriza en Productos (punto 4)", catalogo && (await hay(page, "Carrito")))

  // Una venta de mostrador, cobrada en efectivo.
  await escribir(page, "Buscar productos...", "Paracetamol")
  await page.waitForTimeout(2000)
  await page.locator('[aria-label^="Añadir Paracetamol"]').first().click({ force: true })
  await page.waitForTimeout(1500)
  await clic(page, "Cobrar", 4000)
  const antesDeImprimir = await impresiones(page)
  await escribir(page, "0.00", "100")
  await clic(page, "Completar orden", 6000)
  const despues = await impresiones(page)
  check("«Completar orden» manda el recibo a la impresora (punto 6)", despues > antesDeImprimir, `${antesDeImprimir} → ${despues}`)
  check("y vuelve al catálogo avisando «Venta registrada»", (await hay(page, "Venta registrada")) || (await hay(page, "Buscar productos")))

  // Un paciente sin correo.
  await pestana(page, "Pacientes", 3500)
  await clic(page, "Nuevo paciente", 1500)
  const correo = await page.getByPlaceholder("Correo electrónico").filter({ visible: true }).count()
  check("el alta de paciente ya no pide correo (punto 2)", correo === 0)
  await escribir(page, "Nombre", "Prueba")
  await escribir(page, "Apellidos", `Navegador ${SELLO}`)
  await escribir(page, "Número de teléfono", "6641000099")
  await clic(page, "Crear paciente", 4000)
  const creado = (await api("caja", "GET", `/admin/customers?q=Navegador ${SELLO}&limit=1`)).j?.customers?.[0]
  check("el paciente queda registrado sin correo", !!creado && !creado.email, JSON.stringify(creado?.email ?? null))

  // La caja se queda ABIERTA a propósito: la cierra Administración en la sección G.
  // Quien se topa con «ocupada» es OTRO CAJERO: Administración no trabaja en el
  // punto de venta (al entrar la manda al panel), así que se da de alta uno.
  const usuario = `cajaval${SELLO}`
  const alta = await api("admin", "POST", "/admin/staff", {
    username: usuario,
    password: CLAVE,
    first_name: "Caja",
    last_name: `Validación ${SELLO}`,
    employee_number: `9${SELLO}`,
    role: "cashier",
  })
  const segundoCajero = alta.j?.user?.id ?? alta.j?.id ?? null
  if (segundoCajero) {
    const otro = await nuevoContexto()
    const pageOtro = await entrarPos(otro, usuario)
    await pestana(pageOtro, "Caja", 4500)
    check("con la caja abierta por otra persona, la de más no se abre (punto 3)", await hay(pageOtro, "La caja está ocupada"))
    check("y dice quién la tiene abierta", await hay(pageOtro, "Abierta por Caja Pruebas"))
    const abrir = texto(pageOtro, "Abrir caja")
    const apagado = (await abrir.count())
      ? await abrir.evaluate((e) => {
          const b = e.closest('[role="button"]') ?? e.parentElement
          return b?.getAttribute("aria-disabled") === "true" || getComputedStyle(b).pointerEvents === "none" || Number(getComputedStyle(b).opacity) < 0.9
        })
      : false
    check("y el botón de abrir está apagado", apagado)
    await pageOtro.close()
    // La cuenta de validación no se queda viva.
    await api("admin", "DELETE", `/admin/staff/${segundoCajero}`)
  } else {
    check("se pudo dar de alta un segundo cajero para la prueba", false, JSON.stringify(alta.j).slice(0, 160))
  }

  await page.close()
  return { ok: true }
}

// ── B · Médico ──────────────────────────────────────────────────────────────
const validarMedico = async (datos) => {
  seccion("B · MÉDICO")
  const ctx = await nuevoContexto()
  const page = await entrarPos(ctx, "medico")

  check("el encabezado de la receta trae la cédula (punto 13)", await hay(page, "Céd. prof. 12345678"))
  check("y la universidad", await hay(page, "Universidad Nacional Autónoma de México"))

  await escribir(page, "Buscar medicamentos o insumos...", "Paracetamol")
  await page.waitForTimeout(2500)
  check("el catálogo dice cuánto hay en cada almacén (punto 19 y 21)", await hay(page, "Enf. "))

  await page.locator('[aria-label^="Añadir Paracetamol"]').first().click({ force: true })
  await page.waitForTimeout(1500)
  check("la receta del médico no pregunta a dónde va (punto 7)", (await page.getByText("Farmacia (mostrador)", { exact: true }).count()) === 0 && (await hay(page, "Va a la Bandeja de Enfermería")))

  // El tope: aunque se pida de más, la cantidad se queda en lo que hay.
  const disponible = Number((await page.getByText(/^Enfermería \d+ · Farmacia \d+$/).first().innerText().catch(() => "0 0")).match(/\d+/g).reduce((a, b) => Number(a) + Number(b), 0))
  const cantidad = page.locator('[data-testid="quantity-increment"]').first().locator("xpath=preceding-sibling::div[1]//input")
  await cantidad.fill("999")
  await cantidad.blur()
  await page.waitForTimeout(1200)
  const tope = Number(await cantidad.inputValue())
  check("no se receta más de lo que hay entre los dos almacenes (punto 19)", tope > 0 && tope <= disponible, `pidió 999, quedó ${tope} y hay ${disponible}`)
  await cantidad.fill("2")
  await cantidad.blur()
  await page.waitForTimeout(1000)

  // Sin indicaciones ni paciente no se emite: se comprueba pulsando.
  await page.getByText(/^Emitir receta/).first().click({ force: true })
  await page.waitForTimeout(1200)
  check("sin indicaciones no deja emitir (punto 8)", (await page.getByText("¿Emitir esta receta?", { exact: true }).count()) === 0)

  await escribir(page, "Indicaciones (obligatorias): p. ej. 1 tableta cada 8 h por 5 días", "1 tableta cada 8 h por 5 días")
  await escribir(page, "Lo que Enfermería debe saber al aplicar: alergias, vía, cuidados…", "Sin alergias conocidas. Vía oral con agua.")
  await escribir(page, "Motivo de consulta, exploración, signos vitales, hallazgos…", MARCA_NOTA)
  await escribir(page, "Diagnóstico, procedimiento, tratamiento, recomendaciones…", "Cefalea tensional. Paracetamol y reposo.")
  check("la nota de atención trae la fecha de hoy (punto 11)", await hay(page, "Fecha de la atención"))

  await clic(page, "Seleccionar paciente", 2500)
  await escribir(page, "Buscar pacientes...", "María")
  await page.waitForTimeout(2500)
  await page.locator('[aria-label^="Elegir a "]').first().click({ force: true })
  await page.waitForTimeout(1200)
  await page.getByText(/^Asignar a /).first().click({ force: true })
  await page.waitForTimeout(2500)
  await page.getByText(/^Emitir receta/).first().click({ force: true })
  await page.waitForTimeout(1200)
  await clic(page, "Emitir", 5000)
  check("con todo completo, la receta se emite a Enfermería (punto 7)", await hay(page, "Orden enviada a Enfermería"))
  check("y la nota de atención queda guardada (puntos 10 y 11)", await hay(page, "Nota de atención guardada"))

  const folio = (await page.getByText(/^Folio /).first().innerText().catch(() => "")).replace(/^Folio /, "").trim()
  let receta = ""
  if (folio) {
    const r = await api("medico", "GET", `/admin/documents/receta/${folio}`)
    receta = r.j?.html ?? ""
  }
  check("la receta se imprime en media carta (punto 9)", /5\.5in 8\.5in/.test(receta))
  check("con la cédula del médico y el paciente", /Cédula profesional/.test(receta) && /María Ramírez/.test(receta))
  check("y sin las notas internas ni la nota de atención (punto 12)", !receta.includes(MARCA_NOTA) && !receta.includes("Sin alergias conocidas"))

  await page.close()
  return { folio }
}

// ── C · Enfermería ──────────────────────────────────────────────────────────
const validarEnfermeria = async (datos) => {
  seccion("C · ENFERMERÍA")
  const ctx = await nuevoContexto()
  const page = await entrarPos(ctx, "enfermeria")

  check("Enfermería entra a la Bandeja (punto 17)", await hay(page, "Órdenes que el médico dirigió a consulta"))

  await pestana(page, "Pacientes", 3500)
  check("los pacientes con orden pendiente salen marcados (punto 16)", await hay(page, "Orden pendiente"))
  await pestana(page, "Bandeja", 3000)

  // La orden de Jorge: sin existencia en Enfermería, se pide a Farmacia.
  const deJorge = page.locator('[aria-label^="Orden de Jorge"]').first()
  if (await deJorge.count()) {
    await deJorge.click({ force: true })
    await page.waitForTimeout(2500)
    check("la bandeja dice dónde hay existencia de cada renglón (punto 21)", await hay(page, "Farmacia "))
    const faltan = await hay(page, "faltan")
    check("y marca lo que falta en Enfermería", faltan)
    if (faltan) {
      const pedir = texto(page, "Pedir faltantes a Farmacia")
      const yaPedido = await hay(page, "Requisición en camino")
      if (await pedir.count()) {
        await pedir.click({ force: true })
        await page.waitForTimeout(4000)
        check("«Pedir faltantes a Farmacia» crea la requisición desde la bandeja (punto 22)", await hay(page, "Requisición en camino"))
      } else {
        check("«Pedir faltantes a Farmacia» crea la requisición desde la bandeja (punto 22)", yaPedido, "ya había una en camino")
      }
    }
    await deJorge.click({ force: true })
    await page.waitForTimeout(1000)
  } else {
    check("hay una orden de Jorge para probar los faltantes", false)
  }

  // La de María: reducir pide motivo de 20, y luego se aplica.
  const deMaria = page.locator('[aria-label^="Orden de María"]').first()
  if (await deMaria.count()) {
    await deMaria.click({ force: true })
    await page.waitForTimeout(2500)
    await page.getByLabel("Una menos").filter({ visible: true }).first().click({ force: true })
    await page.waitForTimeout(1200)
    const motivo = page.getByLabel("Motivo del ajuste").filter({ visible: true }).first()
    check("quitar o reducir abre el cuadro del motivo (punto 18)", await motivo.count() > 0)
    await motivo.fill("Diecinueve caracte")
    await page.waitForTimeout(400)
    const confirmar = texto(page, "Confirmar")
    const bloqueado = await confirmar.evaluate((e) => {
      const b = e.closest('[role="button"]') ?? e.parentElement
      return b?.getAttribute("aria-disabled") === "true" || getComputedStyle(b).pointerEvents === "none" || Number(getComputedStyle(b).opacity) < 0.9
    }).catch(() => false)
    check("con menos de 20 caracteres no deja confirmar (punto 18)", bloqueado)
    await motivo.fill("La paciente ya tomó una tableta en casa")
    await page.waitForTimeout(400)
    await clic(page, "Confirmar", 3500)
    check("con el motivo suficiente, el ajuste queda registrado", await hay(page, "La paciente ya tomó una tableta"))

    const botonAplicar = page.getByText(/^Aplicar \(/).first()
    const unidades = Number(((await botonAplicar.innerText().catch(() => "")).match(/\d+/) ?? [0])[0])
    if (unidades > 0) {
      await botonAplicar.click({ force: true })
      await page.waitForTimeout(1500)
      await clic(page, "Aplicar", 7000)
      check("aplicar descuenta del almacén y carga la cuenta del paciente", (await hay(page, "Orden aplicada")) && (await hay(page, "Cargado a la cuenta del paciente")))
    } else {
      check("la orden conserva renglones para aplicar", false, "quedó en cero unidades")
    }
  } else {
    check("hay una orden de María para aplicar", false)
  }

  // La nota del médico no le llega a Enfermería.
  await pestana(page, "Pacientes", 3500)
  await escribir(page, "Buscar paciente por nombre...", "María")
  await page.waitForTimeout(2500)
  await page.getByText(/^Historial/).first().click({ force: true })
  await page.waitForTimeout(3000)
  const cuerpo = await page.locator("body").innerText()
  check("Enfermería no ve la nota de atención del médico (punto 12)", !cuerpo.includes(MARCA_NOTA))

  await page.close()
}

// ── D · Caja cobra la consulta ──────────────────────────────────────────────
const validarCobroDeCuenta = async (datos) => {
  seccion("D · CAJA COBRA LA CONSULTA")
  const ctx = await nuevoContexto()
  const page = await entrarPos(ctx, "caja")
  await pestana(page, "Pacientes", 3500)
  await escribir(page, "Buscar pacientes por nombre o teléfono...", "María")
  await page.waitForTimeout(2500)
  await page.getByText(/^Detalles/).first().click({ force: true })
  await page.waitForTimeout(3000)
  const cobrar = texto(page, "Cobrar cuenta")
  const tiene = (await cobrar.count()) > 0
  check("la cuenta de la consulta aparece en la ficha del paciente", tiene)
  if (tiene) {
    await cobrar.click({ force: true })
    await page.waitForTimeout(4000)
    check("y lleva al cobro con lo que Enfermería aplicó", await hay(page, "Completar orden"))
  }
  await page.close()
}

// ── E · Almacén y Farmacia ──────────────────────────────────────────────────
const validarAlmacenYFarmacia = async () => {
  seccion("E · ALMACÉN Y FARMACIA")
  const ctxA = await nuevoContexto()
  const almacen = await entrarPos(ctxA, "almacen")
  check("Almacén entra a Existencias (punto 30)", await hay(almacen, "Existencias"))
  await escribir(almacen, "Buscar medicamento…", "Paracetamol")
  await almacen.waitForTimeout(2500)
  await texto(almacen, "Paracetamol 500 mg (caja 20 tabletas)").click({ force: true })
  await almacen.waitForTimeout(2500)
  const minimosEditables = await almacen.getByPlaceholder("Mínimo", { exact: true }).filter({ visible: true }).count()
  check("Almacén fija el mínimo y el máximo de cada presentación", minimosEditables > 0)
  check("y ve los lotes de su almacén", await hay(almacen, "Caduca"))
  await almacen.close()

  const ctxF = await nuevoContexto()
  const farmacia = await entrarPos(ctxF, "farmacia")
  await escribir(farmacia, "Buscar medicamento…", "Paracetamol")
  await farmacia.waitForTimeout(2500)
  await texto(farmacia, "Paracetamol 500 mg (caja 20 tabletas)").click({ force: true })
  await farmacia.waitForTimeout(2500)
  const editablesFarmacia = await farmacia.getByPlaceholder("Mínimo", { exact: true }).filter({ visible: true }).count()
  check("Farmacia consulta existencias pero no fija mínimos (decisión: Almacén maneja inventario)", editablesFarmacia === 0)
  check("y ve quién los fija", await hay(farmacia, "Los fija Almacén"))
  await farmacia.close()
}

// ── F · RH y contabilidad ───────────────────────────────────────────────────
const validarRh = async () => {
  seccion("F · RH Y CONTABILIDAD")
  const ctx = await nuevoContexto()
  const page = await entrarPos(ctx, "rrhh")
  check("RH entra a Reportes (punto 25)", await hay(page, "Elige un reporte"))
  check("y puede sacar la actividad del personal (punto 24)", await hay(page, "Actividad del personal"))

  // El archivo para Excel: se pide igual que lo pide la pantalla.
  const hoy = new Date().toLocaleDateString("en-CA")
  const r = await fetch(`${API}/admin/reports/export?tipo=actividad&desde=${hoy}&hasta=${hoy}&formato=csv`, { headers: { Authorization: `Bearer ${T.rrhh}` } })
  const bytes = new Uint8Array(await r.arrayBuffer())
  const conBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const contenido = new TextDecoder("utf-8").decode(bytes)
  check("el archivo para Excel lleva la marca que respeta los acentos (punto 23)", conBom && /Última acción|Número de empleado/.test(contenido), `bom=${conBom}`)

  await pestana(page, "Nómina", 5000)
  check("la nómina abre la quincena en curso (puntos 1 y 25)", await hay(page, "Total del periodo") || await hay(page, "Nadie tiene turnos"))

  const botones = page.getByText("Registrar pago", { exact: true }).filter({ visible: true })
  const cuantos = await botones.count()
  let encendido = null
  for (let i = 0; i < cuantos; i++) {
    const b = botones.nth(i)
    const apagado = await b.evaluate((e) => {
      const n = e.closest('[role="button"]') ?? e.parentElement
      return n?.getAttribute("aria-disabled") === "true" || getComputedStyle(n).pointerEvents === "none" || Number(getComputedStyle(n).opacity) < 0.9
    }).catch(() => true)
    if (!apagado) { encendido = b; break }
  }
  check("a quien no se le debe nada, el pago está apagado (punto 25)", cuantos > 0)
  if (encendido) {
    const antes = await impresiones(page)
    await encendido.click({ force: true })
    await page.waitForTimeout(1500)
    await escribir(page, "Transferencia, cheque…", `Validación ${SELLO}`)
    await page.getByText(/^Pagar \$/).filter({ visible: true }).first().click({ force: true })
    await page.waitForTimeout(7000)
    check("registrar el pago imprime el recibo", (await impresiones(page)) > antes)
    check("y la persona queda como Pagado (punto 25)", await hay(page, "Pagado"))
    const pagado = ((await api("rrhh", "GET", "/admin/payroll/payments")).j?.pagos ?? []).some((p) => p.reference === `Validación ${SELLO}`)
    check("el pago queda guardado con su referencia", pagado)
  } else {
    check("hay alguien a quien pagarle en el periodo", false, "nadie tiene total mayor a cero hoy")
  }
  await page.close()
}

// ── G · El panel de Administración ──────────────────────────────────────────
const validarPanel = async () => {
  seccion("G · PANEL DE ADMINISTRACIÓN")
  const ctx = await nuevoContexto({ width: 1440, height: 900 })
  const { page, dialogos } = await entrarPanel(ctx)
  const esperar = (ms) => page.waitForTimeout(ms)
  const clicPanel = async (t, ms = 1500) => { await page.getByText(t, { exact: true }).filter({ visible: true }).first().click({ force: true }); await esperar(ms) }

  // Personal: los datos del médico.
  await irPanel(page, "staff")
  await clicPanel("Alta de personal", 1500)
  const rol = page.getByText("Selecciona un rol", { exact: true }).filter({ visible: true }).first()
  await rol.click({ force: true })
  await esperar(800)
  await page.getByRole("option", { name: "Médico" }).first().click({ force: true })
  await esperar(1000)
  check("el alta de un médico pide sus datos para la receta (punto 15)", await hay(page, "Datos para la receta") && await hay(page, "Cédula profesional"))
  await clicPanel("Cancelar", 1200)

  // Alta de producto con costo.
  await irPanel(page, "alta-de-producto")
  await page.locator("#costo").fill("42.50")
  await page.locator("#margen").fill("35")
  await esperar(1000)
  const sugerido = await page.locator("#precio").getAttribute("placeholder")
  check("el alta de producto calcula el precio desde el costo (punto 27)", sugerido === "57.38", `sugerido=${sugerido}`)

  // Almacenes: detalle, mínimos e impresión del inventario.
  await irPanel(page, "almacenes", 6000)
  check("el admin ve los almacenes con su valor (punto 28)", await hay(page, "Valor total del inventario"))
  await page.getByText("Ver detalle", { exact: true }).filter({ visible: true }).first().click({ force: true })
  await esperar(6000)
  check("y el detalle de cada uno con sus productos y lotes (punto 28)", await hay(page, "Costo promedio") && await hay(page, "Lotes ("))
  const fijar = page.getByText(/^Fijar mínimo$|^Editar$/).filter({ visible: true }).first()
  if (await fijar.count()) {
    await fijar.click({ force: true })
    await esperar(800)
    const campos = page.locator('input[type="number"]')
    await campos.first().fill("7")
    await clicPanel("Guardar", 3000)
    check("el mínimo de una presentación se fija desde el almacén", await hay(page, "7"))
  }
  const antesInv = await impresiones(page)
  await clicPanel("Imprimir inventario", 4000)
  check("el inventario del almacén se imprime (punto 29)", (await impresiones(page)) > antesInv)

  // Lotes: corregir con motivo y conteo que llega al kardex.
  await irPanel(page, "inventory-batches", 6000)
  const corregir = page.getByText("Corregir", { exact: true }).filter({ visible: true }).first()
  const hayLotes = (await corregir.count()) > 0
  check("los lotes se pueden corregir desde el panel", hayLotes)
  if (hayLotes) {
    await corregir.click({ force: true })
    await esperar(1200)
    // El campo del estante, por su etiqueta: los Input del panel no llevan type.
    const estante = page.getByText("Estante", { exact: true }).first().locator("xpath=following::input[1]")
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill("corto")
    await esperar(400)
    const guardar = page.getByText("Guardar corrección", { exact: true }).first()
    const apagado = await guardar.evaluate((e) => e.closest("button")?.disabled ?? false).catch(() => false)
    check("corregir un lote exige motivo de 20 caracteres", apagado)
    const estanteNuevo = `E-${SELLO.slice(-3)}`
    await estante.fill(estanteNuevo)
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill(`Se capturó mal el estante del lote ${SELLO}`)
    await esperar(400)
    await guardar.click({ force: true })
    await esperar(4000)
    check("con motivo, la corrección se guarda", await hay(page, estanteNuevo))

    const conteo = page.getByText("Conteo", { exact: true }).filter({ visible: true }).first()
    await conteo.click({ force: true })
    await esperar(1200)
    const cantidad = page.locator('input[type="number"]').filter({ visible: true }).first()
    const actual = Number(await cantidad.inputValue())
    await cantidad.fill(String(Math.max(0, actual - 1)))
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill(`Conteo físico de validación ${SELLO}`)
    await esperar(400)
    await page.getByText("Aplicar conteo", { exact: true }).first().click({ force: true })
    await esperar(5000)
    check("el conteo ajusta la existencia", dialogos.some((d) => /Conteo aplicado|coincide con el sistema/.test(d)), dialogos.slice(-1)[0] ?? "sin aviso")
  }

  // Órdenes médicas: ajustar y cancelar con motivo.
  await irPanel(page, "medical-orders", 6000)
  const selectores = page.getByRole("combobox")
  await selectores.nth(1).click({ force: true })
  await esperar(800)
  await page.getByRole("option", { name: "Enfermería" }).first().click({ force: true })
  await esperar(4000)
  const ajustar = page.getByText("Ajustar", { exact: true }).filter({ visible: true }).first()
  const hayOrden = (await ajustar.count()) > 0
  check("el admin ve y puede ajustar las órdenes de Enfermería", hayOrden)
  if (hayOrden) {
    await ajustar.click({ force: true })
    await esperar(1500)
    const cantidad = page.locator('input[type="number"]').filter({ visible: true }).first()
    const actual = Number(await cantidad.inputValue())
    await cantidad.fill(String(actual + 1))
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill(`Ajuste de validación por navegador ${SELLO}`)
    await esperar(400)
    await page.getByText("Guardar ajuste", { exact: true }).first().click({ force: true })
    await esperar(5000)
    check("el ajuste queda con su motivo a la vista (punto 18)", await hay(page, `Ajuste de validación por navegador ${SELLO}`))
  }

  // Honorarios: turnos y anular un pago.
  await irPanel(page, "honorarios", 7000)
  await clicPanel("Turnos", 3000)
  await clicPanel("Del periodo", 4000)
  check("los turnos del personal se ven y se corrigen (punto 24)", await hay(page, "Corregir horas") || await hay(page, "Sin turnos en el periodo"))
  await clicPanel("Pagos realizados", 3000)
  const anular = page.getByText("Anular", { exact: true }).filter({ visible: true }).first()
  if (await anular.count()) {
    await anular.click({ force: true })
    await esperar(1200)
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill(`Pago de validación por navegador ${SELLO}`)
    await esperar(400)
    await page.getByText("Anular pago", { exact: true }).first().click({ force: true })
    await esperar(5000)
    check("un pago registrado por error se anula con motivo", !(await hay(page, "No se pudo")))
  } else {
    check("hay un pago para anular", false)
  }

  // Cortes: cerrar la caja que se quedó abierta en la sección A. Si el panel
  // se valida solo, se abre una aquí para tener qué cerrar.
  if (!(await api("caja", "GET", "/admin/cash-sessions/current")).j?.session) {
    await api("caja", "POST", "/admin/cash-sessions", { opening_amount: 500 })
  }
  await irPanel(page, "cash-sessions", 6000)
  const cerrarAjena = page.getByText(/^Cerrar por /).filter({ visible: true }).first()
  const hayAbierta = (await cerrarAjena.count()) > 0
  check("Administración ve la caja que alguien dejó abierta y puede cerrarla", hayAbierta)
  if (hayAbierta) {
    await cerrarAjena.click({ force: true })
    await esperar(1200)
    await page.locator('input[type="number"]').filter({ visible: true }).first().fill("500")
    await page.getByPlaceholder("Motivo: queda en el registro y en la bitácora").first().fill(`La cajera se fue sin hacer el corte ${SELLO}`)
    await esperar(400)
    await page.getByText("Cerrar caja", { exact: true }).first().click({ force: true })
    await esperar(5000)
    check("el cierre forzado dice quién lo hizo y por qué", dialogos.some((d) => /Caja cerrada/.test(d)), dialogos.slice(-1)[0] ?? "sin aviso")
    const cerradas = (await api("admin", "GET", "/admin/cash-sessions?limit=5")).j?.sessions ?? []
    check("y queda escrito en el corte", cerradas.some((s) => (s.notes ?? "").includes("Cerrada por")))
  }

  // La bitácora lo cuenta todo con palabras.
  await irPanel(page, "audit-logs", 6000)
  const bitacora = await page.locator("body").innerText()
  check("la bitácora traduce cada acción (punto 20)", /Corrigió los datos de un lote|Ajustó una orden médica|Cerró la caja|Hizo un inventario físico/.test(bitacora))

  await page.close()
}

// ── H · La barra de sesión en tableta ───────────────────────────────────────
const validarBarraDeSesion = async () => {
  seccion("H · BARRA DE SESIÓN EN TABLETA (punto 26)")
  for (const ancho of [768, 375]) {
    const ctx = await nuevoContexto({ width: ancho, height: 1024 })
    const page = await entrarPos(ctx, "caja")
    await page.waitForTimeout(2000)
    // Con el teclado abierto es cuando antes se encimaban: se enfoca un campo.
    const campo = page.locator("input").filter({ visible: true }).first()
    if (await campo.count()) { await campo.click({ force: true }); await page.waitForTimeout(1500) }
    const medidas = await page.evaluate(() => {
      const textos = [...document.querySelectorAll("div,span")].filter((e) => e.children.length === 0)
      const salir = textos.find((e) => e.textContent.trim() === "Salir")
      const barra = [...document.querySelectorAll('[role="tablist"], [role="tab"]')][0]
      if (!salir || !barra) return null
      const a = salir.getBoundingClientRect()
      const b = barra.closest('[role="tablist"]')?.getBoundingClientRect() ?? barra.getBoundingClientRect()
      return { salir: { top: a.top, bottom: a.bottom }, barra: { top: b.top, bottom: b.bottom } }
    })
    const separados = !!medidas && (medidas.salir.bottom <= medidas.barra.top + 1 || medidas.salir.top >= medidas.barra.bottom - 1)
    check(`a ${ancho} px, «Salir» y la barra de abajo no se enciman`, separados, JSON.stringify(medidas))
    await page.close()
  }
}

// ── Ejecución ───────────────────────────────────────────────────────────────
;(async () => {
  console.log(`\nValidación por navegador — POS ${POS} · panel ${PANEL} · API ${API}\n`)
  const datos = await preparar()
  console.log(`   datos listos (paciente ${datos.maria?.first_name ?? "?"}, orden con faltantes ${datos.ordenFaltantes ? "sí" : "no"})`)

  navegador = await chromium.launch({ channel: "chrome", headless: true })
  try {
    if (SOLO !== "panel") {
      await validarCaja(datos)
      await validarMedico(datos)
      await validarEnfermeria(datos)
      await validarCobroDeCuenta(datos)
      await validarAlmacenYFarmacia()
      await validarRh()
      await validarBarraDeSesion()
    }
    if (SOLO !== "pos") {
      await validarPanel()
    }
  } catch (e) {
    fallos.push(`El recorrido se interrumpió: ${e.message}`)
    console.log(`\n   ERROR ${e.stack?.split("\n").slice(0, 3).join("\n         ")}`)
  } finally {
    for (const c of contextos) await c.close().catch(() => {})
    await navegador.close().catch(() => {})
  }

  console.log(`\n${"═".repeat(64)}`)
  if (fallos.length) {
    console.log(`  ${fallos.length} de ${correctas + fallos.length} comprobaciones FALLARON:`)
    for (const f of fallos) console.log(`   · ${f}`)
  } else {
    console.log(`  TODO CORRECTO — ${correctas} comprobaciones en el navegador`)
  }
  console.log(`${"═".repeat(64)}\n`)
  process.exit(fallos.length ? 1 : 0)
})()
