/**
 * Un día de trabajo en la clínica, hecho por la API con la cuenta de cada
 * perfil, para que todas las pantallas tengan contenido de verdad.
 *
 *   npm run seed:actividad                  (con el servidor arrancado)
 *   npm run seed:actividad -- otra-vez      (repetirlo sobre lo que ya hay)
 *   ALTUS_API_URL=http://192.168.1.114 npm run seed:actividad
 *
 * Lo lanza solo `npm run seed:demo` al terminar la estructura, si el servidor
 * responde. Necesita lo que deja esa estructura: las seis cuentas, los dos
 * almacenes, el catálogo y los pacientes.
 *
 * ── POR QUÉ POR LA API Y NO EN LA BASE ──────────────────────────────────────
 * La bitácora la escribe el servidor en cada petición; el FEFO, el kardex y la
 * cuenta del paciente viven en las rutas. Cada registro de aquí queda igual que
 * si lo hubiera hecho esa persona desde su pantalla: con su nombre en la
 * bitácora, con su asiento en el kardex y con los mismos permisos. Si algún
 * perfil no pudiera hacer lo que hace aquí, esto fallaría, que es lo correcto.
 *
 * ── QUÉ QUEDA ───────────────────────────────────────────────────────────────
 * Recetas en todos sus estados (pendiente en consulta y en mostrador, aplicada,
 * surtida y cancelada), requisiciones en todos los suyos (pendiente, parcial,
 * surtida, recibida y cancelada), bajas por daño y por ajuste, una compra con
 * costo, mínimos con una presentación bajo mínimo, notas de atención, cuentas
 * de paciente cobradas, ventas en efectivo, tarjeta y transferencia, entradas y
 * salidas de efectivo, dos cortes —uno cuadrado y otro con faltante—, un turno
 * médico con su comisión, y lecturas de expediente en la bitácora.
 *
 * Todo lleva la fecha del día en que se corre: la API no deja fechar hacia
 * atrás, y falsear fechas en la base rompería la cadena de la bitácora.
 *
 * ⚠️ Escribe en la base. Sólo para bases de demostración.
 */

const BASE = (process.env.ALTUS_API_URL || process.env.BASE || "http://localhost:9000").replace(/\/+$/, "")
const PASS = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"
const OTRA_VEZ = process.argv.includes("otra-vez")
const PERFILES = ["admin", "farmacia", "caja", "medico", "enfermeria", "auditoria"]
const MARCA = "altus_demo_actividad"
const CORREO_INVITADO_POS = "noreply+pos-guest@agilo.com"

const T = {}
const cuenta = { pasos: 0 }

const en = (dias) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  return d.toISOString()
}
const hoy = () => new Date().toISOString().slice(0, 10)

/**
 * Espera a que el servidor responda. En desarrollo, `medusa develop` se
 * reinicia solo cuando aparece un archivo nuevo en el proyecto —el paso de
 * cuarentena de seed:demo escribe un reporte CSV justo antes de lanzar esto—, y
 * en el servidor un reinicio del servicio deja lo mismo: unos segundos sin
 * respuesta. Mejor esperar que fallar a la primera petición.
 */
async function esperarServidor(maxSegundos = 120) {
  const limite = Date.now() + maxSegundos * 1000
  while (Date.now() < limite) {
    try {
      if ((await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) })).ok) return
    } catch {
      // todavía no
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`El servidor no respondió en ${maxSegundos} s (${BASE}/health).`)
}

/** ¿El servidor rechazó la conexión? Entonces la petición no llegó y repetirla es seguro. */
const conexionRechazada = (e) => {
  const codigo = e?.cause?.code ?? e?.code
  return codigo === "ECONNREFUSED" || codigo === "UND_ERR_SOCKET" || codigo === "ECONNRESET"
}

async function login(usuario) {
  await esperarServidor()
  const r = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${usuario}@sigh.local`, password: PASS }),
  })
  const j = await r.json().catch(() => ({}))
  return j.token ?? null
}

async function call(rol, metodo, ruta, cuerpo) {
  // Se reintenta sólo si la petición no pudo llegar, o si es una lectura. Una
  // escritura que se cortó a medias NO se repite: podría estar hecha, y
  // repetirla duplicaría una venta o un traspaso.
  let r
  for (let intento = 1; ; intento++) {
    try {
      r = await fetch(BASE + ruta, {
        method: metodo,
        headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      })
      break
    } catch (e) {
      const seguro = metodo === "GET" || e?.cause?.code === "ECONNREFUSED"
      if (!seguro || !conexionRechazada(e) || intento >= 3) throw e
      await esperarServidor()
    }
  }
  const texto = await r.text()
  let j = {}
  try {
    j = texto ? JSON.parse(texto) : {}
  } catch {
    j = { crudo: texto.slice(0, 200) }
  }
  return { code: r.status, j }
}

/** Exige un código de respuesta; si no, se detiene diciendo qué no se pudo. */
async function hacer(rol, metodo, ruta, cuerpo, que) {
  const res = await call(rol, metodo, ruta, cuerpo)
  if (res.code < 200 || res.code >= 300) {
    const detalle = res.j?.message || res.j?.error || JSON.stringify(res.j).slice(0, 200)
    throw new Error(`No se pudo ${que} (${rol}, HTTP ${res.code}): ${detalle}`)
  }
  return res.j
}

const paso = (texto) => {
  cuenta.pasos++
  console.log(`   ✓ ${texto}`)
}
const bloque = (texto) => console.log(`\n   ── ${texto}`)

async function main() {
  console.log("")
  console.log(`   Actividad de demostración contra ${BASE}`)

  // ── Cuentas ───────────────────────────────────────────────────────────────
  for (const p of PERFILES) {
    T[p] = await login(p)
    if (!T[p]) {
      throw new Error(
        `La cuenta «${p}» no entra con la contraseña de pruebas. Esto sólo corre sobre una base de demostración: ` +
          "corre antes `npm run seed:demo` (o `SIGH_ALLOW_TEST_SEED=1 npm run seed` en el servidor).",
      )
    }
  }

  // ── ¿Ya se sembró? ────────────────────────────────────────────────────────
  const tienda = (await hacer("admin", "GET", "/admin/stores", undefined, "leer la tienda")).stores?.[0]
  if (tienda?.metadata?.[MARCA] && !OTRA_VEZ) {
    console.log(`   La actividad ya se sembró el ${String(tienda.metadata[MARCA]).slice(0, 10)}. No se repite.`)
    console.log("   Para sumar otro día igual: npm run seed:actividad -- otra-vez")
    console.log("")
    return
  }

  // ── Lo que hace falta encontrar ───────────────────────────────────────────
  const locs = (await hacer("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50", undefined, "leer los almacenes")).stock_locations ?? []
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  if (!farmacia || !enfermeria) throw new Error("Faltan los almacenes de Farmacia y Enfermería. Corre antes `npm run seed:demo`.")

  const region = (await hacer("admin", "GET", "/admin/regions?limit=5", undefined, "leer la región")).regions?.find((r) => r.currency_code === "mxn")
  const canal = (await hacer("admin", "GET", "/admin/sales-channels?limit=5", undefined, "leer el canal")).sales_channels?.[0]
  if (!region || !canal) throw new Error("Falta la región en pesos o el canal de venta. Corre antes `npm run seed:demo`.")

  const producto = async (titulo) => {
    const q = encodeURIComponent(titulo.split(" ")[0])
    const lista = (await hacer("admin", "GET", `/admin/products?q=${q}&limit=20&fields=id,title,*variants`, undefined, `buscar ${titulo}`)).products ?? []
    const p = lista.find((x) => x.title === titulo)
    if (!p?.variants?.[0]?.id) throw new Error(`No está en el catálogo: «${titulo}». Corre antes \`npm run seed:demo\`.`)
    return { id: p.variants[0].id, titulo: p.title }
  }
  const paracetamol = await producto("Paracetamol 500 mg (caja 20 tabletas)")
  const amoxicilina = await producto("Amoxicilina 500 mg (caja 12 cápsulas)")
  const omeprazol = await producto("Omeprazol 20 mg (caja 14 cápsulas)")
  const ibuprofeno = await producto("Ibuprofeno 400 mg (caja 10 tabletas)")
  const salina = await producto("Solución salina 0.9% 500 ml")
  const guantes = await producto("Guantes de nitrilo talla M (caja 100)")
  const metformina = await producto("Metformina 850 mg (caja 30 tabletas)")

  const paciente = async (correo) => {
    const c = (await hacer("admin", "GET", `/admin/customers?q=${encodeURIComponent(correo)}&limit=5`, undefined, `buscar ${correo}`)).customers?.find((x) => x.email === correo)
    if (!c) throw new Error(`Falta el paciente ${correo}. Corre antes \`npm run seed:demo\`.`)
    return { id: c.id, nombre: [c.first_name, c.last_name].filter(Boolean).join(" ") }
  }
  const maria = await paciente("maria.ramirez@paciente.test")
  const jorge = await paciente("jorge.villanueva@paciente.test")
  const alejandra = await paciente("alejandra.fuentes@paciente.test")
  const ricardo = await paciente("ricardo.mendoza@paciente.test")
  const patricia = await paciente("patricia.ochoa@paciente.test")
  const fernando = await paciente("fernando.cardenas@paciente.test")

  const invitado = (await hacer("caja", "GET", `/admin/customers?email=${encodeURIComponent(CORREO_INVITADO_POS)}&limit=1`, undefined, "buscar la ficha de mostrador")).customers?.[0]
  const invitadoId = invitado?.id ?? (await hacer("caja", "POST", "/admin/customers", { email: CORREO_INVITADO_POS, first_name: "Venta", last_name: "de mostrador" }, "crear la ficha de mostrador")).customer.id

  const personal = (await hacer("admin", "GET", "/admin/staff", undefined, "leer el personal")).users ?? []
  const medicoId = personal.find((u) => u.email === "medico@sigh.local")?.id

  // Turnos que hubieran quedado abiertos de una corrida anterior.
  for (const rol of ["caja", "admin"]) {
    const s = (await call(rol, "GET", "/admin/cash-sessions/current")).j?.session
    if (s) await call(rol, "POST", `/admin/cash-sessions/${s.id}/close`, { actual_closing_amount: 0, notes: "Cierre antes de sembrar la demostración" })
  }
  const turnoPrevio = (await call("medico", "GET", "/admin/doctor-shifts/current")).j?.doctor_shift
  if (turnoPrevio) await call("medico", "POST", `/admin/doctor-shifts/${turnoPrevio.id}/close`, {})

  const loteActivo = async (variante, almacen) =>
    ((await hacer("admin", "GET", `/admin/medical-batches?variant_id=${variante}&stock_location_id=${almacen}&status=active`, undefined, "leer lotes")).batches ?? [])
      .filter((b) => Number(b.quantity) > 0)
      .sort((a, b) => String(a.expiration_date).localeCompare(String(b.expiration_date)))[0]

  // ══ Administración: la mañana ═════════════════════════════════════════════
  bloque("Administración")
  if (medicoId) {
    await hacer("admin", "POST", "/admin/doctor-commissions", { doctor_id: medicoId, percent: 20 }, "fijar la comisión del médico")
    paso("comisión del médico: 20 %")
  }
  const minimo = async (prod, almacen, min, max, nombre) => {
    await hacer("admin", "POST", "/admin/stock-policies", { variant_id: prod.id, stock_location_id: almacen.id, min_quantity: min, max_quantity: max }, `fijar el mínimo de ${prod.titulo}`)
    paso(`mínimo de ${nombre}`)
  }
  await minimo(paracetamol, farmacia, 20, 60, "Paracetamol en Farmacia: 20 / 60")
  await minimo(ibuprofeno, farmacia, 100, null, "Ibuprofeno en Farmacia: 100 (queda bajo mínimo)")
  await minimo(guantes, enfermeria, 5, 20, "Guantes en Enfermería: 5 / 20")

  // ══ Médico: abre su turno y receta ════════════════════════════════════════
  bloque("Médico")
  const turnoMedico = (await hacer("medico", "POST", "/admin/doctor-shifts", {}, "abrir el turno médico")).doctor_shift
  paso("abre su turno de consulta")
  await hacer("medico", "GET", `/admin/medical-customers/${maria.id}`, undefined, "consultar el expediente de María")
  paso(`consulta el expediente de ${maria.nombre} (queda en la bitácora)`)

  const receta = async (pac, area, renglones, notas) =>
    (await hacer("medico", "POST", "/admin/medical-orders", {
      customer_id: pac.id, customer_name: pac.nombre, recipient_area: area, notes: notas,
      items: renglones.map(([prod, cantidad, indicaciones]) => ({ variant_id: prod.id, product_title: prod.titulo, quantity: cantidad, instructions: indicaciones })),
    }, `emitir la receta de ${pac.nombre}`)).medical_order

  const ordenMaria = await receta(maria, "nursing", [[paracetamol, 2, "1 tableta cada 8 h por 3 días"]], "Cefalea tensional. Sin alergias conocidas.")
  paso(`receta a Enfermería: ${maria.nombre}`)
  const ordenRicardo = await receta(ricardo, "nursing", [[salina, 1, "Lavado de herida"]], "Curación de herida superficial en antebrazo.")
  paso(`receta a Enfermería: ${ricardo.nombre}`)
  await receta(fernando, "nursing", [[paracetamol, 1, "Dosis única en consultorio"]], "Fiebre de 38.2 °C.")
  paso(`receta a Enfermería que queda en la bandeja: ${fernando.nombre}`)
  const ordenJorge = await receta(jorge, "pharmacy", [[ibuprofeno, 1, "1 tableta cada 8 h con alimentos"]], "Lumbalgia mecánica.")
  paso(`receta de mostrador: ${jorge.nombre}`)
  await receta(alejandra, "pharmacy", [[amoxicilina, 1, "1 cápsula cada 8 h por 7 días"]], "Faringoamigdalitis.")
  paso(`receta de mostrador que queda pendiente: ${alejandra.nombre}`)
  const ordenPatricia = await receta(patricia, "pharmacy", [[omeprazol, 1, "1 cápsula en ayunas"]], "Gastritis.")
  await hacer("medico", "POST", `/admin/medical-orders/${ordenPatricia.id}/cancel`, { motivo: "La paciente ya tenía el medicamento en casa" }, "cancelar la receta de Patricia")
  paso(`receta cancelada con motivo: ${patricia.nombre}`)

  // ══ Farmacia: recibe mercancía ════════════════════════════════════════════
  // En una base recién sembrada el catálogo alcanza de sobra y esto no hace
  // nada. En una que ya se usó —pruebas, capturas, otro día de demostración—
  // Farmacia puede estar sin algo que el día necesita, y el primer traspaso
  // fallaría con 409. Se completa sólo lo que falta, como una entrega de
  // proveedor, y queda en el kardex como compra.
  bloque("Farmacia recibe mercancía")
  const sello = hoy().slice(2, 7).replace("-", "")
  const existencia = async (prod, almacen) =>
    ((await hacer("admin", "GET", `/admin/medical-batches?variant_id=${prod.id}&stock_location_id=${almacen.id}&status=active`, undefined, "leer existencias")).batches ?? [])
      .reduce((suma, b) => suma + (Number(b.quantity) || 0), 0)
  const necesario = [[paracetamol, 25], [guantes, 15], [salina, 10], [ibuprofeno, 5], [omeprazol, 5], [metformina, 3]]
  let repuesto = 0
  for (const [prod, minimoDelDia] of necesario) {
    const hay = await existencia(prod, farmacia)
    if (hay >= minimoDelDia) continue
    const entra = minimoDelDia - hay + 20
    await hacer("farmacia", "POST", "/admin/medical-batches", {
      batch_number: `REP-${prod.titulo.slice(0, 4).toUpperCase()}-${sello}-${Date.now().toString().slice(-5)}`,
      expiration_date: en(365), variant_id: prod.id, stock_location_id: farmacia.id, quantity: entra, apply_margin: false,
    }, `reponer ${prod.titulo}`)
    paso(`entrada de proveedor: ${entra} de ${prod.titulo} (había ${hay})`)
    repuesto++
  }
  if (!repuesto) paso("había existencia suficiente para el día")

  const compra = (await hacer("farmacia", "POST", "/admin/medical-batches", {
    batch_number: `AMX-${sello}-${Date.now().toString().slice(-4)}`, expiration_date: en(540), variant_id: amoxicilina.id, stock_location_id: farmacia.id,
    purchase_quantity: 3, units_per_purchase: 12, purchase_unit: "caja", sale_unit: "cápsula",
    purchase_date: hoy(), unit_cost: 96, shelf_location: "B-2", apply_margin: false,
  }, "dar de alta la compra")).batch
  paso(`compra con factura: 3 cajas × 12 cápsulas de amoxicilina a $96, lote ${compra.batch_number}, estante B-2`)

  // ══ Enfermería pide y Farmacia surte ══════════════════════════════════════
  bloque("Traspasos")
  const pedir = async (renglones, notas) =>
    (await hacer("enfermeria", "POST", "/admin/requisitions", {
      items: renglones.map(([prod, cantidad]) => ({ variant_id: prod.id, product_title: prod.titulo, quantity: cantidad })), notes: notas,
    }, "pedir a Farmacia")).requisition

  const reqCompleta = await pedir([[paracetamol, 20], [guantes, 10]], "Para el consultorio 1")
  paso("Enfermería pide paracetamol y guantes")
  const reqParcial = await pedir([[salina, 6]], "Para curaciones")
  paso("Enfermería pide solución salina")
  const reqCancelada = await pedir([[metformina, 5]], "Pedido por error")
  await hacer("enfermeria", "POST", `/admin/requisitions/${reqCancelada.id}/cancel`, { motivo: "Se pidió por error" }, "cancelar la requisición")
  paso("Enfermería cancela una que pidió por error")

  await hacer("farmacia", "POST", `/admin/requisitions/${reqCompleta.id}/dispatch`, {}, "surtir la requisición completa")
  paso("Farmacia surte la primera completa")
  await hacer("farmacia", "POST", `/admin/requisitions/${reqParcial.id}/dispatch`, { items: [{ item_id: reqParcial.items[0].id, cantidad: 3 }] }, "surtir la requisición en parte")
  paso("Farmacia surte la segunda en parte: 3 de 6")
  await hacer("enfermeria", "POST", `/admin/requisitions/${reqCompleta.id}/receive`, {}, "confirmar la recepción")
  paso("Enfermería confirma que llegó la primera")

  // ══ Farmacia: mostrador y bajas ═══════════════════════════════════════════
  bloque("Farmacia")

  await hacer("farmacia", "POST", `/admin/medical-orders/${ordenJorge.id}/dispense`, undefined, "surtir la receta de Jorge")
  paso(`surte la receta de mostrador de ${jorge.nombre}`)

  const loteOmep = await loteActivo(omeprazol.id, farmacia.id)
  if (loteOmep) {
    await hacer("farmacia", "POST", `/admin/medical-batches/${loteOmep.id}/write-off`, { quantity: 2, reason: "Blíster dañado en el traslado", type: "exit_damage" }, "dar de baja por daño")
    paso(`baja por daño: 2 de ${omeprazol.titulo}`)
  }
  const loteMetf = await loteActivo(metformina.id, farmacia.id)
  if (loteMetf) {
    await hacer("farmacia", "POST", `/admin/medical-batches/${loteMetf.id}/write-off`, { quantity: 1, reason: "Diferencia en el conteo de la mañana", type: "exit_adjustment" }, "ajustar inventario")
    paso(`ajuste de inventario: 1 de ${metformina.titulo}`)
  }

  // ══ Enfermería: aplica en consulta ════════════════════════════════════════
  bloque("Enfermería")
  await hacer("enfermeria", "POST", `/admin/medical-orders/${ordenMaria.id}/items`, { items: [{ variant_id: paracetamol.id, quantity: 2 }, { variant_id: guantes.id, quantity: 1 }] }, "ajustar la orden de María")
  paso(`ajusta la orden de ${maria.nombre}: añade guantes`)
  await hacer("enfermeria", "POST", `/admin/medical-orders/${ordenMaria.id}/consume`, undefined, "aplicar la orden de María")
  paso("la aplica: sale de su almacén y se carga a la cuenta de la paciente")
  await hacer("enfermeria", "POST", "/admin/clinical-notes", { customer_id: maria.id, medical_order_id: ordenMaria.id, content: "Se aplicó paracetamol en consultorio sin reacción adversa. Refiere mejoría a los 30 minutos." }, "escribir la nota de María")
  paso("escribe la nota de atención")

  await hacer("enfermeria", "POST", `/admin/medical-orders/${ordenRicardo.id}/items`, { items: [{ variant_id: salina.id, quantity: 1 }, { variant_id: guantes.id, quantity: 1 }] }, "ajustar la orden de Ricardo")
  await hacer("enfermeria", "POST", `/admin/medical-orders/${ordenRicardo.id}/consume`, undefined, "aplicar la orden de Ricardo")
  await hacer("enfermeria", "POST", "/admin/clinical-notes", { customer_id: ricardo.id, medical_order_id: ordenRicardo.id, content: "Lavado y cubierta de herida en antebrazo derecho. Sin datos de infección." }, "escribir la nota de Ricardo")
  paso(`aplica la curación de ${ricardo.nombre} y escribe su nota`)

  const loteGuantesEnf = await loteActivo(guantes.id, enfermeria.id)
  if (loteGuantesEnf) {
    await hacer("enfermeria", "POST", `/admin/medical-batches/${loteGuantesEnf.id}/write-off`, { quantity: 1, reason: "Caja de guantes contaminada al caer al suelo" }, "dar de baja en Enfermería")
    paso("baja en su almacén: guantes contaminados")
  }

  await hacer("medico", "POST", "/admin/clinical-notes", { customer_id: jorge.id, medical_order_id: ordenJorge.id, content: "Lumbalgia mecánica sin datos de alarma. Reposo relativo y calor local. Revalorar en una semana." }, "escribir la nota del médico")
  paso(`el médico deja la nota de ${jorge.nombre}`)

  // ══ Caja: dos turnos ══════════════════════════════════════════════════════
  bloque("Caja")
  const totalDe = async (draftId) => Number((await hacer("caja", "GET", `/admin/draft-orders/${draftId}?fields=id,total`, undefined, "leer el total")).draft_order?.total) || 0

  const cobrar = async (sesion, draftId, metodo, referencia) => {
    const total = await totalDe(draftId)
    await hacer("caja", "POST", `/admin/cash-sessions/${sesion}/movements`, { type: "sale", payment_method: metodo, amount: total, order_id: draftId, ...(referencia ? { reference: referencia } : {}) }, "registrar el cobro")
    await hacer("caja", "POST", `/admin/draft-orders/${draftId}/convert-to-order`, undefined, "cerrar la venta")
    return total
  }
  const venta = async (sesion, clienteId, renglones, metodo, referencia) => {
    const draft = (await hacer("caja", "POST", "/admin/draft-orders", {
      region_id: region.id, sales_channel_id: canal.id, customer_id: clienteId,
      items: renglones.map(([prod, cantidad]) => ({ variant_id: prod.id, quantity: cantidad })),
    }, "armar el carrito")).draft_order
    return cobrar(sesion, draft.id, metodo, referencia)
  }
  const cuentaDe = async (pac) => ((await hacer("caja", "GET", `/admin/patient-bills?customer_id=${pac.id}`, undefined, "leer la cuenta del paciente")).bills ?? [])[0]
  const dinero = (n) => `$${Number(n).toFixed(2)}`

  // Turno de la mañana: cuadra.
  const turno1 = (await hacer("caja", "POST", "/admin/cash-sessions", { opening_amount: 500 }, "abrir el turno de la mañana")).session
  paso("abre el turno de la mañana con $500 de fondo")
  paso(`venta de mostrador en efectivo: ${dinero(await venta(turno1.id, invitadoId, [[paracetamol, 2]], "cash"))}`)
  paso(`venta con tarjeta, referencia 48213: ${dinero(await venta(turno1.id, alejandra.id, [[ibuprofeno, 1], [omeprazol, 1]], "card", "48213"))}`)
  await hacer("caja", "GET", `/admin/customers/${maria.id}`, undefined, "abrir la ficha de María")
  const cuentaMaria = await cuentaDe(maria)
  if (cuentaMaria) paso(`cobra la cuenta de consulta de ${maria.nombre} en efectivo: ${dinero(await cobrar(turno1.id, cuentaMaria.id, "cash"))}`)
  await hacer("caja", "POST", `/admin/cash-sessions/${turno1.id}/movements`, { type: "cash_in", payment_method: "cash", amount: 200, description: "Cambio de billetes" }, "registrar la entrada de efectivo")
  paso("entrada de efectivo: $200, cambio de billetes")
  await hacer("caja", "POST", `/admin/cash-sessions/${turno1.id}/movements`, { type: "cash_out", payment_method: "cash", amount: 45, description: "Garrafón de agua" }, "registrar la salida de efectivo")
  paso("salida de efectivo: $45, garrafón de agua")
  const esperado1 = Number((await hacer("caja", "GET", `/admin/documents/corte/${turno1.id}`, undefined, "leer el corte")).resumen?.expected_cash_in_register) || 0
  await hacer("caja", "POST", `/admin/cash-sessions/${turno1.id}/close`, { actual_closing_amount: esperado1, notes: "Sin novedad" }, "cerrar el turno de la mañana")
  paso(`cierra el turno de la mañana: esperado y contado ${dinero(esperado1)}, cuadra`)

  // Turno de la tarde: con faltante.
  const turno2 = (await hacer("caja", "POST", "/admin/cash-sessions", { opening_amount: 300 }, "abrir el turno de la tarde")).session
  paso("abre el turno de la tarde con $300 de fondo")
  const cuentaRicardo = await cuentaDe(ricardo)
  if (cuentaRicardo) paso(`cobra la cuenta de ${ricardo.nombre} con tarjeta, referencia 90731: ${dinero(await cobrar(turno2.id, cuentaRicardo.id, "card", "90731"))}`)
  paso(`venta por transferencia: ${dinero(await venta(turno2.id, jorge.id, [[salina, 1]], "transfer"))}`)
  paso(`venta de mostrador en efectivo: ${dinero(await venta(turno2.id, invitadoId, [[guantes, 1]], "cash"))}`)
  const esperado2 = Number((await hacer("caja", "GET", `/admin/documents/corte/${turno2.id}`, undefined, "leer el corte")).resumen?.expected_cash_in_register) || 0
  const contado2 = Math.max(0, esperado2 - 20)
  await hacer("caja", "POST", `/admin/cash-sessions/${turno2.id}/close`, { actual_closing_amount: contado2, notes: "Faltaron $20; se revisará con el turno siguiente." }, "cerrar el turno de la tarde")
  paso(`cierra el turno de la tarde: esperado ${dinero(esperado2)}, contado ${dinero(contado2)}, faltan $20`)

  // ══ Cierre del día ════════════════════════════════════════════════════════
  bloque("Cierre")
  await hacer("medico", "POST", `/admin/doctor-shifts/${turnoMedico.id}/close`, {}, "cerrar el turno médico")
  paso("el médico cierra su turno: sus consultas cobradas ya cuentan para la comisión")
  await hacer("auditoria", "GET", `/admin/documents/corte/${turno2.id}`, undefined, "consultar el corte")
  await hacer("auditoria", "GET", "/admin/inventory-movements?limit=50", undefined, "consultar el kardex")
  paso("Auditoría revisa el corte con faltante y el kardex")

  await hacer("admin", "POST", `/admin/stores/${tienda.id}`, { metadata: { ...(tienda.metadata ?? {}), [MARCA]: new Date().toISOString() } }, "dejar la marca de actividad sembrada")

  console.log("")
  console.log(`   Listo: ${cuenta.pasos} acciones de los seis perfiles.`)
  console.log("")
}

main().catch((e) => {
  console.error("")
  console.error(`   ✗ ${e.message}`)
  console.error("")
  process.exit(1)
})
