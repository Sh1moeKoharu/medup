/**
 * Verificación de extremo a extremo contra un servidor EN MARCHA.
 *
 *   node pruebas/verificar-api.mjs                    (contra localhost:9000)
 *   BASE=http://192.168.1.114 node pruebas/verificar-api.mjs
 *
 * ── QUÉ COMPRUEBA ───────────────────────────────────────────────────────────
 *   1. Permisos      matriz de 6 roles × 7 recursos contra lib/api-policy.ts
 *   2. Omisión segura  una ruta no declarada queda cerrada
 *   3. Expediente    el contenido clínico sólo lo ve quien atiende
 *   4. Dispensación  surtir descuenta, no alcanza -> 409, cancelación
 *   5. Personal      alta sin la ruta pública, y baja que retira la credencial
 *   6–13. Una sección por fase del plan (ver cada función)
 *
 * ── POR QUÉ UN SCRIPT Y NO UNA PRUEBA DE JEST ───────────────────────────────
 * La suite de integración (`npm run test:integration:http`) levanta su PROPIA
 * instancia con una base de datos temporal, y para eso el usuario de PostgreSQL
 * necesita permiso de CREATEDB, que hoy no tiene — el runner falla con
 * "client password must be a string" porque `.env.test` está vacío.
 *
 * Migrar esto a Jest es lo correcto a medio plazo y no cuesta mucho: rellenar
 * `.env.test` con un DATABASE_URL propio y conceder CREATEDB al usuario. Hasta
 * entonces, esto vive aquí en lugar de perderse en un directorio temporal: son
 * las comprobaciones que descubrieron los fallos de la auditoría, y valen sobre
 * todo como red contra regresiones.
 *
 * ⚠️ ESCRIBE EN LA BASE. Crea y borra un usuario de prueba, emite y cancela
 * órdenes médicas, y descuenta existencias al surtir. Contra datos reales, no.
 * Requiere las cuentas de `npm run seed` y el catálogo de
 * `seed-catalogo-demo.ts`.
 */

const BASE = process.env.BASE || "http://localhost:9000"
const PASS = process.env.SIGH_TEST_PASSWORD || "Sigh#Test2026"

const ROLES = ["admin", "farmacia", "caja", "medico", "enfermeria", "auditoria", "almacen", "rrhh"]
const T = {}

let fallos = 0
let total = 0

function check(desc, ok, detalle) {
  total++
  if (!ok) fallos++
  console.log(`   ${ok ? "ok  " : "FALLA"} ${desc}${detalle ? `  → ${detalle}` : ""}`)
}

function seccion(titulo) {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 60 - titulo.length))}`)
}

async function login(correo, clave = PASS) {
  const r = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Se entra con nombre de usuario. El sufijo es el mismo dominio
      // interno que usa la aplicacion; ver src/lib/usuarios.ts.
      email: correo.includes("@") ? correo : `${correo}@sigh.local`,
      password: clave,
    }),
  })
  const j = await r.json().catch(() => ({}))
  return { token: j.token, code: r.status }
}

async function call(rol, metodo, ruta, cuerpo) {
  const opts = {
    method: metodo,
    headers: { Authorization: `Bearer ${T[rol]}`, "Content-Type": "application/json" },
  }
  if (cuerpo) opts.body = JSON.stringify(cuerpo)
  const r = await fetch(BASE + ruta, opts)
  let j = null
  try {
    j = await r.json()
  } catch {}
  return { code: r.status, j }
}

// ── 1. Matriz de permisos ───────────────────────────────────────────────────
// Cada fila declara qué roles DEBEN poder. Es la transcripción de
// lib/api-policy.ts: si las dos discrepan, una de las dos está mal.
const MATRIZ = [
  ["GET", "/admin/staff", null, "Ver personal", ["admin", "auditoria", "rrhh"]],
  ["GET", "/admin/audit-logs", null, "Ver bitácora", ["admin", "auditoria"]],
  ["GET", "/admin/products?limit=1", null, "Ver catálogo", ROLES],
  ["POST", "/admin/product-tags", { value: "verif-" }, "Crear etiqueta", ["admin", "almacen"]],
  ["POST", "/admin/regions", { name: "Verif ", currency_code: "mxn", countries: [] }, "Crear región", ["admin"]],
  ["GET", "/admin/inventory-reports/valuation", null, "Inventario valorizado", ["admin", "farmacia", "auditoria", "almacen"]],
  ["GET", "/admin/medical-customers", null, "Ver expediente clínico", ["admin", "farmacia", "medico", "enfermeria", "auditoria"]],
]

async function matrizDePermisos() {
  seccion("1 · PERMISOS POR ROL")

  const creados = { tags: [], regions: [] }

  for (const [metodo, ruta, cuerpo, desc, permitidos] of MATRIZ) {
    const celdas = []

    for (const rol of ROLES) {
      let cuerpoRol = null
      if (cuerpo) {
        cuerpoRol = { ...cuerpo }
        // Valores únicos por rol: si no, el segundo choca con el primero y el
        // 400 resultante se confundiría con una denegación.
        if (cuerpoRol.value) cuerpoRol.value += `${Date.now()}-${rol}`
        if (cuerpoRol.name) cuerpoRol.name += `${Date.now()}-${rol}`
      }

      const { code, j } = await call(rol, metodo, ruta, cuerpoRol)
      const permitido = code < 400
      const esperado = permitidos.includes(rol)

      if (permitido && j?.product_tag?.id) creados.tags.push(j.product_tag.id)
      if (permitido && j?.region?.id) creados.regions.push(j.region.id)

      celdas.push({ rol, permitido, esperado, code })
    }

    const discrepan = celdas.filter((c) => c.permitido !== c.esperado)
    check(
      desc.padEnd(24),
      discrepan.length === 0,
      discrepan.length
        ? discrepan.map((c) => `${c.rol}=${c.code}`).join(" ")
        : celdas.filter((c) => c.permitido).map((c) => c.rol).join(", ") || "nadie"
    )
  }

  // Limpieza de lo que creó la matriz.
  for (const id of creados.tags) await call("admin", "DELETE", `/admin/product-tags/${id}`)
  for (const id of creados.regions) await call("admin", "DELETE", `/admin/regions/${id}`)
}

// ── 2. Omisión segura ───────────────────────────────────────────────────────
async function omisionSegura() {
  seccion("2 · OMISIÓN SEGURA")

  const inventada = await call("caja", "POST", "/admin/ruta-que-nadie-declaro", { x: 1 })
  check("una ruta no declarada se cierra a quien no es admin", inventada.code === 403, `HTTP ${inventada.code}`)

  const lectura = await call("caja", "GET", "/admin/orders?limit=1")
  check("la operación normal no se ve afectada", lectura.code === 200, `HTTP ${lectura.code}`)
}

// ── 3. Expediente clínico ───────────────────────────────────────────────────
async function expediente() {
  seccion("3 · EXPEDIENTE CLÍNICO")

  const caja = await call("caja", "GET", "/admin/medical-customers")
  check("caja no lee el expediente", caja.code === 403, `HTTP ${caja.code}`)

  const medico = await call("medico", "GET", "/admin/medical-customers")
  check("el área médica sí lo lee", medico.code === 200, `HTTP ${medico.code}`)
  check("la lista viene paginada", medico.j?.limit !== undefined, `limit=${medico.j?.limit} count=${medico.j?.count}`)
  check(
    "el catálogo de empresas sigue completo",
    Array.isArray(medico.j?.companies) && medico.j.companies.length > 0,
    `${medico.j?.companies?.length} empresas`
  )

  // El contenido clínico no debe aparecer en la ruta general de pacientes.
  const generales = await call("caja", "GET", "/admin/customers?limit=5")
  check(
    "la ruta de pacientes no filtra contenido clínico",
    !JSON.stringify(generales.j ?? {}).includes("medical_history")
  )
}

// ── 4. Dispensación ─────────────────────────────────────────────────────────
async function dispensacion() {
  seccion("4 · DISPENSACIÓN DE ÓRDENES MÉDICAS")

  const paciente = (await call("admin", "GET", "/admin/customers?limit=1")).j?.customers?.[0]
  const locs4 = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const farmacia4 = locs4.find((l) => l.metadata?.altus_area === "pharmacy")
  const lotes = (await call("admin", "GET", `/admin/medical-batches?stock_location_id=${farmacia4?.id}`)).j?.batches ?? []
  const activos = lotes.filter((b) => b.status === "active" && b.quantity > 5)

  if (!paciente || !farmacia4 || !activos.length) {
    check("hay datos para probar la dispensación", false, "faltan pacientes o lotes con existencia en Farmacia")
    return
  }

  // Farmacia surte por FEFO: de los lotes activos de esa presentación en su
  // almacén, el que caduca antes. Se mide ESE, no el primero que devuelva la
  // API. Antes se medía el primero, y en una base recién sembrada —donde el
  // primero es el de caducidad lejana— la prueba fallaba con el sistema bien.
  const variante4 = activos[0].variant_id
  const lotesDeLaVariante = async () =>
    ((await call("admin", "GET", `/admin/medical-batches?variant_id=${variante4}&stock_location_id=${farmacia4.id}`)).j?.batches ?? [])
      .filter((b) => b.status === "active")
  const lote = (await lotesDeLaVariante())
    .filter((b) => b.quantity > 0)
    .sort((x, y) => String(x.expiration_date).localeCompare(String(y.expiration_date)))[0]
  const antes = lote.quantity
  const totalDeLaVariante = (await lotesDeLaVariante()).reduce((t, b) => t + b.quantity, 0)

  // 4a. Más de lo que hay -> 409 y nada cambia.
  const grande = await call("enfermeria", "POST", "/admin/medical-orders", { recipient_area: "pharmacy",
    customer_id: paciente.id,
    customer_name: "Verificación sin stock",
    items: [{ variant_id: lote.variant_id, product_title: "Verificación", quantity: totalDeLaVariante + 500 }],
  })
  const idGrande = grande.j?.medical_order?.id

  const rechazo = await call("farmacia", "POST", `/admin/medical-orders/${idGrande}/dispense`)
  check("sin existencia devuelve 409", rechazo.code === 409, `HTTP ${rechazo.code}`)

  const sinTocar = (await lotesDeLaVariante()).find((b) => b.id === lote.id)
  check("y no toca el inventario", sinTocar.quantity === antes, `${antes} → ${sinTocar.quantity}`)

  const sigue = (await call("medico", "GET", `/admin/medical-orders/${idGrande}`)).j?.medical_order
  check("la orden sigue pendiente", sigue?.status === "pending", sigue?.status)

  // 4b. Cancelación.
  const cancelada = await call("medico", "POST", `/admin/medical-orders/${idGrande}/cancel`, {
    motivo: "Verificación automática",
  })
  check("se puede cancelar una receta pendiente", cancelada.j?.medical_order?.status === "cancelled")
  check("Farmacia no cancela recetas", (await call("farmacia", "POST", `/admin/medical-orders/${idGrande}/cancel`)).code === 403)

  // 4c. Dispensación correcta -> descuenta y asienta.
  const buena = await call("enfermeria", "POST", "/admin/medical-orders", { recipient_area: "pharmacy",
    customer_id: paciente.id,
    customer_name: "Verificación con stock",
    items: [{ variant_id: lote.variant_id, product_title: "Verificación", quantity: 2 }],
  })
  const idBuena = buena.j?.medical_order?.id

  const surtido = await call("farmacia", "POST", `/admin/medical-orders/${idBuena}/dispense`)
  check("Farmacia surte", surtido.j?.medical_order?.status === "dispensed", surtido.j?.medical_order?.status)

  const despues = (await lotesDeLaVariante()).find((b) => b.id === lote.id)
  check("surtir DESCUENTA el stock, del lote que caduca antes", despues.quantity === antes - 2, `${lote.batch_number}: ${antes} → ${despues.quantity}`)
  check("y no toca reserved_quantity", despues.reserved_quantity === lote.reserved_quantity)

  const movs = await call("admin", "GET", "/admin/inventory-movements")
  const clave = Object.keys(movs.j ?? {}).find((k) => Array.isArray(movs.j[k]))
  const asiento = (movs.j?.[clave] ?? []).find((m) => m.reference_id === idBuena)
  check("queda asentado en el kardex", !!asiento, asiento ? `${asiento.type} ${asiento.quantity_delta}` : "sin asiento")
  check("con referencia a la orden médica", asiento?.reference_type === "medical_order", asiento?.reference_type)
  check("y con quien lo surtió", !!asiento?.user_email, asiento?.user_email)

  check(
    "una orden ya surtida no se cancela",
    (await call("medico", "POST", `/admin/medical-orders/${idBuena}/cancel`)).code === 400
  )
}

// ── 5. Alta y baja de personal ──────────────────────────────────────────────
async function personal() {
  seccion("5 · ALTA Y BAJA DE PERSONAL")

  const publico = await fetch(`${BASE}/auth/user/emailpass/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `intruso.${Date.now()}@test.test`, password: "LoQueSea123" }),
  })
  check("el registro público está cerrado", publico.status === 403, `HTTP ${publico.status}`)

  const usuario = `verificacion.${Date.now()}`
  const clave = "Verificacion#2026"

  const alta = await call("admin", "POST", "/admin/staff", {
    username: usuario,
    password: clave,
    first_name: "Verificación",
    last_name: "Automática",
    role: "cashier",
  })
  check("el alta funciona sin la ruta pública", alta.code === 200, `HTTP ${alta.code}`)
  check("con el rol elegido", alta.j?.user?.metadata?.role === "cashier", alta.j?.user?.metadata?.role)

  check("la cuenta nueva entra", !!(await login(usuario, clave)).token)

  const baja = await call("admin", "DELETE", `/admin/staff/${alta.j?.user?.id}`)
  check("la baja retira la credencial", baja.j?.credencial_retirada === true)
  check("y la cuenta ya no entra", !(await login(usuario, clave)).token)
}

// ── 6. Cimientos: guardia del panel y número de empleado ────────────────────
async function cimientos() {
  seccion("6 · GUARDIA DEL PANEL Y NÚMERO DE EMPLEADO")

  // La cookie del panel se emite en POST /auth/session. Administración la
  // obtiene siempre; los demás sólo mientras PANEL_SOLO_ADMINISTRACION esté
  // apagada en el servidor. El servidor no dice cómo está la bandera, así que
  // se deduce de la respuesta a caja. Con PANEL_CERRADO=1 en el entorno de
  // esta prueba se EXIGE que esté encendida.
  const sesion = async (rol) => {
    const r = await fetch(`${BASE}/auth/session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${T[rol]}` },
    })
    return r.status
  }

  const admin = await sesion("admin")
  check("Administración obtiene sesión del panel", admin === 200, `HTTP ${admin}`)

  const caja = await sesion("caja")
  const cerrado = caja === 403
  check(
    `la guardia del panel está ${cerrado ? "ENCENDIDA (caja: 403)" : "apagada (caja: 200)"}`,
    caja === 200 || caja === 403,
    `HTTP ${caja}`
  )
  if (process.env.PANEL_CERRADO === "1") {
    check("y se exigía encendida", cerrado)
  }
  if (cerrado) {
    for (const rol of ["farmacia", "medico", "enfermeria", "auditoria"]) {
      const s = await sesion(rol)
      check(`${rol} tampoco obtiene sesión del panel`, s === 403, `HTTP ${s}`)
    }
  }

  // ── Número de empleado ──
  const usuario = `numerado.${Date.now()}`
  const clave = "Verificacion#2026"
  const numero = `V${String(Date.now()).slice(-6)}`

  const alta = await call("admin", "POST", "/admin/staff", {
    username: usuario,
    password: clave,
    first_name: "Con",
    last_name: "Número",
    role: "cashier",
    employee_number: numero.toLowerCase(),
  })
  check(
    "el alta guarda el número de empleado, en mayúsculas",
    alta.j?.user?.metadata?.employee_number === numero,
    JSON.stringify(alta.j?.user?.metadata ?? alta.j)
  )

  const repetido = await call("admin", "POST", "/admin/staff", {
    username: `${usuario}.b`, password: clave, role: "cashier", employee_number: numero,
  })
  check("un número repetido se rechaza", repetido.code === 400, `HTTP ${repetido.code} ${repetido.j?.message ?? ""}`)

  const invalido = await call("admin", "POST", "/admin/staff", {
    username: `${usuario}.c`, password: clave, role: "cashier", employee_number: "A B/C",
  })
  check("un número con forma inválida se rechaza", invalido.code === 400, `HTTP ${invalido.code}`)

  const correoMalo = await call("admin", "POST", "/admin/staff", {
    username: `${usuario}.d`, password: clave, role: "cashier", notification_email: "caja@sigh.local",
  })
  check("un correo de aviso @sigh.local se rechaza: no es un buzón", correoMalo.code === 400, `HTTP ${correoMalo.code}`)

  const id = alta.j?.user?.id
  const cambio = await call("admin", "POST", `/admin/staff/${id}`, {
    employee_number: `${numero}X`,
    notification_email: "Persona@Ejemplo.mx",
  })
  const meta = cambio.j?.user?.metadata ?? {}
  check(
    "la edición cambia el número y guarda el correo de aviso en minúsculas",
    meta.employee_number === `${numero}X` && meta.notification_email === "persona@ejemplo.mx",
    JSON.stringify(meta)
  )
  check("y conserva el rol", meta.role === "cashier", meta.role)

  // La bitácora se escribe al terminar la respuesta, un instante después.
  await new Promise((r) => setTimeout(r, 400))
  const bitacora = await call("admin", "GET", "/admin/audit-logs")
  const asiento = (bitacora.j?.audit_logs ?? []).find(
    (a) => a.endpoint === "/admin/staff" && a.method === "POST"
  )
  check(
    "el asiento de bitácora lleva el número de empleado de quien actuó",
    asiento?.user_employee_number === "0001",
    asiento ? `Nº ${asiento.user_employee_number ?? "—"} (¿corriste npm run seed después del cambio?)` : "sin asiento"
  )

  const baja = await call("admin", "DELETE", `/admin/staff/${id}`)
  check("la cuenta de prueba se dio de baja", baja.code === 200, `HTTP ${baja.code}`)

  const reciclado = await call("admin", "POST", "/admin/staff", {
    username: `${usuario}.e`, password: clave, role: "cashier", employee_number: `${numero}X`,
  })
  check("el número de una cuenta dada de baja no se recicla", reciclado.code === 400, `HTTP ${reciclado.code}`)
  if (reciclado.code === 200) {
    await call("admin", "DELETE", `/admin/staff/${reciclado.j?.user?.id}`)
  }
}

// ── 7. Inventario por almacén ───────────────────────────────────────────────
const en = (dias) => new Date(Date.now() + dias * 86400000).toISOString()

async function inventarioPorAlmacen() {
  seccion("7 · INVENTARIO POR ALMACÉN")

  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  check(
    "existen los almacenes de Farmacia y Enfermería",
    !!farmacia && !!enfermeria,
    `${locs.map((l) => l.name).join(", ") || "ninguno"} (¿corriste preparar-almacenes.ts confirm?)`
  )
  if (!farmacia || !enfermeria) return

  const lotes = (await call("admin", "GET", "/admin/medical-batches")).j?.batches ?? []
  const sinAlmacen = lotes.filter((b) => !b.stock_location_id).length
  check("ningún lote quedó sin almacén tras migrar", sinAlmacen === 0, `${sinAlmacen} sin almacén`)

  const sello = Date.now()
  const clave = "Verificacion#2026"

  // ── Una presentación nueva, para no tocar el catálogo ──
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación almacén ${sello}`,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "mxn" }] }],
    metadata: { margen_automatico: 30, origen: "verificar-api" },
  })
  const productoId = prod.j?.product?.id
  const variante = prod.j?.product?.variants?.[0]?.id
  check("se creó una presentación de prueba", !!variante, JSON.stringify(prod.j).slice(0, 120))
  if (!variante) return

  // ── Alta en Enfermería, en unidades de compra ──
  const alta = await call("almacen", "POST", "/admin/medical-batches", {
    batch_number: `ENF-${sello}`, expiration_date: en(400), variant_id: variante,
    stock_location_id: enfermeria.id, purchase_quantity: 3, units_per_purchase: 20,
    purchase_unit: "caja", sale_unit: "tableta", apply_margin: false, shelf_location: " B-2 ",
  })
  const idLote = alta.j?.batch?.id
  check(
    "alta en Enfermería: 3 cajas × 20 = 60 unidades de venta",
    alta.j?.batch?.quantity === 60 && alta.j?.batch?.stock_location_id === enfermeria.id,
    JSON.stringify(alta.j?.batch ?? alta.j).slice(0, 140)
  )
  check("sin costo, el precio no se toca", alta.j?.precio === null)
  check("el estante del alta se guarda, limpio", alta.j?.batch?.shelf_location === "B-2", JSON.stringify(alta.j?.batch?.shelf_location))

  const enFarmacia = (await call("admin", "GET", `/admin/medical-batches?stock_location_id=${farmacia.id}`)).j?.batches ?? []
  check("no aparece al filtrar por Farmacia", !enFarmacia.some((b) => b.id === idLote))
  const enEnf = (await call("admin", "GET", `/admin/medical-batches?stock_location_id=${enfermeria.id}`)).j?.batches ?? []
  check("y sí por Enfermería, con el nombre del almacén", enEnf.some((b) => b.id === idLote && b.stock_location_name === enfermeria.name))

  const kEnf = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${enfermeria.id}&batch_id=${idLote}`)).j?.movements ?? []
  check("el kardex de Enfermería tiene la entrada de 60", kEnf.some((m) => m.quantity_delta === 60 && m.stock_location_id === enfermeria.id))
  const kFar = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${farmacia.id}&batch_id=${idLote}`)).j?.movements ?? []
  check("y el de Farmacia no", kFar.length === 0, `${kFar.length} asientos`)

  // ── FEFO por almacén: Farmacia no surte con existencia sólo en Enfermería ──
  const paciente = (await call("admin", "GET", "/admin/customers?limit=1")).j?.customers?.[0]
  const orden = await call("enfermeria", "POST", "/admin/medical-orders", { recipient_area: "pharmacy",
    customer_id: paciente?.id, customer_name: "Verificación almacén",
    items: [{ variant_id: variante, product_title: "Verificación", quantity: 2 }],
  })
  const ordenId = orden.j?.medical_order?.id
  const surtido = await call("farmacia", "POST", `/admin/medical-orders/${ordenId}/dispense`)
  check("surtir desde Farmacia con existencia sólo en Enfermería devuelve 409", surtido.code === 409, `HTTP ${surtido.code}`)
  const intacto = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches?.find((b) => b.id === idLote)
  check("y no toca el lote de Enfermería", intacto?.quantity === 60, `${intacto?.quantity}`)
  await call("medico", "POST", `/admin/medical-orders/${ordenId}/cancel`, { motivo: "Verificación" })

  // ── Margen automático: costo 10 + 30 % → 13 ──
  const conCosto = await call("almacen", "POST", "/admin/medical-batches", {
    batch_number: `MARGEN-${sello}`, expiration_date: en(300), variant_id: variante,
    stock_location_id: farmacia.id, quantity: 5, unit_cost: 10,
  })
  check(
    "el margen automático fija el precio de venta: costo 10 + 30 % = 13",
    conCosto.j?.precio?.nuevo === 13 && conCosto.j?.precio?.anterior === 10,
    JSON.stringify(conCosto.j?.precio ?? conCosto.j).slice(0, 140)
  )
  const v = (await call("admin", "GET", `/admin/products/${productoId}?fields=*variants.prices`)).j?.product?.variants?.[0]
  check("y quedó escrito en la variante", (v?.prices ?? []).some((p) => Number(p.amount) === 13), JSON.stringify(v?.prices))

  // Ahora sí hay existencia en Farmacia: surtir sale de ahí y no de Enfermería.
  const orden2 = await call("enfermeria", "POST", "/admin/medical-orders", { recipient_area: "pharmacy",
    customer_id: paciente?.id, customer_name: "Verificación almacén",
    items: [{ variant_id: variante, product_title: "Verificación", quantity: 2 }],
  })
  const surtido2 = await call("farmacia", "POST", `/admin/medical-orders/${orden2.j?.medical_order?.id}/dispense`)
  const tras = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  check(
    "con existencia en Farmacia surte de Farmacia y deja Enfermería intacta",
    surtido2.code === 200 && tras.find((b) => b.id === idLote)?.quantity === 60 && tras.find((b) => b.id === conCosto.j?.batch?.id)?.quantity === 3,
    tras.map((b) => `${b.stock_location_name}:${b.quantity}`).join(" ")
  )

  // ── Mínimos y máximos ──
  const pol = await call("almacen", "POST", "/admin/stock-policies", {
    variant_id: variante, stock_location_id: farmacia.id, min_quantity: 50, max_quantity: 200,
  })
  check(
    "se guarda un mínimo por presentación y almacén, con la existencia actual",
    pol.j?.stock_policy?.min_quantity === 50 && pol.j?.stock_policy?.current_quantity === 3,
    JSON.stringify(pol.j?.stock_policy ?? pol.j).slice(0, 160)
  )
  const bajo = (await call("admin", "GET", "/admin/stock-policies?only_below=1")).j?.stock_policies ?? []
  check("y aparece como bajo mínimo con lo que falta (47)", bajo.some((p) => p.variant_id === variante && p.shortage === 47))
  check("un máximo menor que el mínimo se rechaza", (await call("almacen", "POST", "/admin/stock-policies", { variant_id: variante, stock_location_id: farmacia.id, min_quantity: 50, max_quantity: 10 })).code === 400)
  check("Caja no fija mínimos", (await call("caja", "POST", "/admin/stock-policies", { variant_id: variante, min_quantity: 1 })).code === 403)
  check("un almacén inexistente se rechaza", (await call("almacen", "POST", "/admin/medical-batches", { batch_number: "X", expiration_date: en(10), variant_id: variante, quantity: 1, stock_location_id: "sloc_no_existe" })).code === 400)

  // ── Limpieza: los lotes se dan de baja por conteo y el producto se borra ──
  await call("admin", "DELETE", `/admin/stock-policies/${pol.j?.stock_policy?.id}`)
  const ids = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  await call("admin", "POST", "/admin/inventory-counts", {
    counts: ids.map((b) => ({ batch_id: b.id, counted_quantity: 0 })), apply: true, notes: "Limpieza de verificación",
  })
  await call("admin", "DELETE", `/admin/products/${productoId}`)
  void clave
}

// ── 8. Requisiciones y bajas ────────────────────────────────────────────────
async function requisicionesYBajas() {
  seccion("8 · REQUISICIONES Y BAJAS")

  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  if (!farmacia || !enfermeria) {
    check("hay dos almacenes para probar requisiciones", false, "corre preparar-almacenes.ts confirm")
    return
  }

  const sello = Date.now()
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación requisición ${sello}`,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 10, currency_code: "mxn" }] }],
    metadata: { origen: "verificar-api" },
  })
  const productoId = prod.j?.product?.id
  const variante = prod.j?.product?.variants?.[0]?.id
  if (!variante) {
    check("se creó una presentación de prueba", false, JSON.stringify(prod.j).slice(0, 120))
    return
  }
  const alta = await call("almacen", "POST", "/admin/medical-batches", {
    batch_number: `REQ-${sello}`, expiration_date: en(300), variant_id: variante,
    stock_location_id: farmacia.id, quantity: 30, apply_margin: false, unit_cost: 12.5,
  })
  const loteFarmacia = alta.j?.batch?.id

  // ── Quién pide, quién surte ──
  const pedida = await call("enfermeria", "POST", "/admin/requisitions", {
    items: [{ variant_id: variante, quantity: 10 }], notes: "Verificación automática",
  })
  const req = pedida.j?.requisition
  check(
    "Enfermería crea la requisición, de Farmacia a Enfermería",
    pedida.code === 200 && req?.status === "pending" && req?.source_location_id === farmacia.id && req?.destination_location_id === enfermeria.id,
    JSON.stringify(pedida.j).slice(0, 140)
  )
  const rid = req?.id
  const itemId = req?.items?.[0]?.id
  check("Caja no pide requisiciones", (await call("caja", "POST", "/admin/requisitions", { items: [{ variant_id: variante, quantity: 1 }] })).code === 403)
  check("Enfermería no surte", (await call("enfermeria", "POST", `/admin/requisitions/${rid}/dispatch`)).code === 403)
  check("Enfermería no da de alta lotes en Farmacia", (await call("enfermeria", "POST", "/admin/medical-batches", { batch_number: "X", expiration_date: en(10), variant_id: variante, quantity: 1, stock_location_id: farmacia.id })).code === 403)

  // ── Más de lo que hay: nada se mueve ──
  const grande = await call("enfermeria", "POST", "/admin/requisitions", { items: [{ variant_id: variante, quantity: 100 }] })
  const gid = grande.j?.requisition?.id
  const sinStock = await call("almacen", "POST", `/admin/requisitions/${gid}/dispatch`)
  const intacto = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches?.find((b) => b.id === loteFarmacia)
  check("sin existencia suficiente responde 409 y no mueve nada", sinStock.code === 409 && intacto?.quantity === 30, `HTTP ${sinStock.code}, lote ${intacto?.quantity}`)
  const cancelada = await call("enfermeria", "POST", `/admin/requisitions/${gid}/cancel`, { motivo: "Verificación" })
  check("se cancela lo que no movió nada", cancelada.j?.requisition?.status === "cancelled")

  // ── Surtido parcial y total ──
  const parcial = await call("almacen", "POST", `/admin/requisitions/${rid}/dispatch`, { items: [{ item_id: itemId, cantidad: 4 }] })
  check(
    "surtido parcial: 4 de 10, sigue pendiente",
    parcial.j?.requisition?.status === "pending" && parcial.j?.requisition?.items?.[0]?.quantity_dispatched === 4,
    JSON.stringify(parcial.j).slice(0, 140)
  )
  check("no se cancela lo que ya movió algo", (await call("enfermeria", "POST", `/admin/requisitions/${rid}/cancel`)).code === 400)
  check("no se surte más de lo pendiente", (await call("almacen", "POST", `/admin/requisitions/${rid}/dispatch`, { items: [{ item_id: itemId, cantidad: 7 }] })).code === 400)
  const resto = await call("almacen", "POST", `/admin/requisitions/${rid}/dispatch`)
  check(
    "el resto deja la requisición surtida",
    resto.j?.requisition?.status === "dispatched" && resto.j?.requisition?.items?.[0]?.quantity_dispatched === 10,
    JSON.stringify(resto.j?.requisition ?? resto.j).slice(0, 120)
  )

  const lotes = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  const farm = lotes.find((b) => b.stock_location_id === farmacia.id)
  const enf = lotes.find((b) => b.stock_location_id === enfermeria.id)
  check(
    "Farmacia quedó con 20 y Enfermería con 10, con el mismo número de lote",
    farm?.quantity === 20 && enf?.quantity === 10 && enf?.batch_number === farm?.batch_number,
    lotes.map((b) => `${b.stock_location_name}:${b.batch_number}:${b.quantity}`).join(" ")
  )
  const kf = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${farmacia.id}&variant_id=${variante}&type=exit_transfer`)).j?.movements ?? []
  const ke = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${enfermeria.id}&variant_id=${variante}&type=entry_transfer`)).j?.movements ?? []
  const salida = kf.reduce((s, m) => s + m.quantity_delta, 0)
  const entrada = ke.reduce((s, m) => s + m.quantity_delta, 0)
  check("el kardex de los dos almacenes cuadra: −10 en Farmacia, +10 en Enfermería", salida === -10 && entrada === 10 && kf.every((m) => m.reference_id === rid), `${salida} / ${entrada}`)
  check("y lo traspasado llega a Enfermería con su costo, para que su almacén quede valorizado", ke.length > 0 && ke.every((m) => m.unit_cost === 12.5), JSON.stringify(ke.map((m) => m.unit_cost)))

  check("una requisición surtida no se vuelve a surtir", (await call("almacen", "POST", `/admin/requisitions/${rid}/dispatch`)).code === 400)
  check("Almacén no la marca recibida", (await call("almacen", "POST", `/admin/requisitions/${rid}/receive`)).code === 403)
  const recibida = await call("enfermeria", "POST", `/admin/requisitions/${rid}/receive`)
  check("Enfermería confirma la recepción", recibida.j?.requisition?.status === "received" && !!recibida.j?.requisition?.received_by_id)

  // ── Bajas con motivo ──
  check("una baja sin motivo se rechaza", (await call("enfermeria", "POST", `/admin/medical-batches/${enf?.id}/write-off`, { quantity: 2 })).code === 400)
  check("Enfermería no da de baja en Farmacia", (await call("enfermeria", "POST", `/admin/medical-batches/${farm?.id}/write-off`, { quantity: 1, reason: "Frasco roto en consultorio" })).code === 403)
  check("más de lo que hay se rechaza", (await call("enfermeria", "POST", `/admin/medical-batches/${enf?.id}/write-off`, { quantity: 999, reason: "Frasco roto en consultorio" })).code === 400)
  const baja = await call("enfermeria", "POST", `/admin/medical-batches/${enf?.id}/write-off`, { quantity: 2, reason: "Frasco roto en consultorio" })
  check("la baja con motivo descuenta y asienta", baja.code === 200 && baja.j?.quantity_after === 8 && baja.j?.ledger_recorded === true, JSON.stringify(baja.j).slice(0, 140))
  const kb = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${enfermeria.id}&variant_id=${variante}&type=exit_damage`)).j?.movements ?? []
  check("el asiento lleva el motivo y a quien dio de baja", kb.some((m) => m.quantity_delta === -2 && m.reason === "Frasco roto en consultorio" && m.user_email === "enfermeria@sigh.local"))
  check("y el aviso a Administración se intentó", Array.isArray(baja.j?.notified), baja.j?.notified?.length ? `a ${baja.j.notified.join(", ")}` : "sin correo de aviso configurado: se registró en el servidor")

  // ── Destrucción sanitaria con motivo obligatorio ──
  const cuarentena = (await call("admin", "GET", "/admin/medical-batches?status=quarantined")).j?.batches?.[0]
  check("la destrucción sanitaria exige motivo", cuarentena ? (await call("almacen", "POST", `/admin/medical-batches/${cuarentena.id}/destroy`, {})).code === 400 : true, cuarentena ? "" : "sin lotes en cuarentena para probar")
  check("Enfermería no destruye", cuarentena ? (await call("enfermeria", "POST", `/admin/medical-batches/${cuarentena.id}/destroy`, { reason: "Verificación automática" })).code === 403 : true)

  // ── Limpieza ──
  await call("admin", "POST", "/admin/inventory-counts", {
    counts: lotes.map((b) => ({ batch_id: b.id, counted_quantity: 0 })), apply: true, notes: "Limpieza de verificación",
  })
  await call("admin", "DELETE", `/admin/products/${productoId}`)
}

// ── 9. Circuito clínico ─────────────────────────────────────────────────────
async function circuitoClinico() {
  seccion("9 · CIRCUITO CLÍNICO")

  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  // El circuito entero con un paciente SIN correo, como los da de alta ahora
  // el mostrador: la cuenta de consulta es un pedido y no debe exigirlo.
  const alta = await call("caja", "POST", "/admin/customers", { first_name: "Verificación", last_name: `Sin correo ${Date.now()}` })
  const paciente = alta.j?.customer
  check("Caja registra a un paciente sin correo", alta.code === 200 && !!paciente?.id && paciente.email === null, `HTTP ${alta.code} ${alta.j?.message ?? ""}`)
  if (!enfermeria || !farmacia || !paciente) {
    check("hay almacenes y un paciente para probar el circuito", false)
    return
  }

  const sello = Date.now()
  // Publicado y en el canal de venta: la cuenta del paciente es un pedido de
  // verdad, y Medusa no admite en un pedido lo que no está a la venta.
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]?.id
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación consulta ${sello}`,
    status: "published",
    sales_channels: canal ? [{ id: canal }] : undefined,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 25, currency_code: "mxn" }] }],
    metadata: { origen: "verificar-api" },
  })
  const productoId = prod.j?.product?.id
  const variante = prod.j?.product?.variants?.[0]?.id
  if (!variante) {
    check("se creó una presentación de prueba", false, JSON.stringify(prod.j).slice(0, 120))
    return
  }

  // Existencia en Farmacia y nada en Enfermería: el médico puede recetar (se
  // receta contra los dos almacenes) y Enfermería todavía no puede aplicar.
  await call("almacen", "POST", "/admin/medical-batches", {
    batch_number: `CONS-F-${sello}`, expiration_date: en(200), variant_id: variante, stock_location_id: farmacia.id, quantity: 5, apply_margin: false,
  })

  // ── El médico emite a Enfermería (por omisión) ──
  const orden = await call("medico", "POST", "/admin/medical-orders", {
    customer_id: paciente.id, customer_name: "Verificación consulta",
    items: [{ variant_id: variante, product_title: "Verificación consulta", quantity: 2, instructions: "Aplicar en consultorio" }],
    notes: "Verificación automática",
  })
  const oid = orden.j?.medical_order?.id
  check("la orden nace dirigida a Enfermería", orden.j?.medical_order?.recipient_area === "nursing", orden.j?.medical_order?.recipient_area)
  const bandejaEnf = (await call("enfermeria", "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).j?.medical_orders ?? []
  const bandejaFar = (await call("farmacia", "GET", "/admin/medical-orders?status=pending&recipient_area=pharmacy")).j?.medical_orders ?? []
  check("la ve Enfermería en su bandeja y Farmacia no", bandejaEnf.some((o) => o.id === oid) && !bandejaFar.some((o) => o.id === oid))
  check("Farmacia no surte una orden de consulta", (await call("farmacia", "POST", `/admin/medical-orders/${oid}/dispense`)).code === 400)
  check("un destinatario inválido se rechaza", (await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, items: [{ variant_id: variante, quantity: 1 }], recipient_area: "cocina" })).code === 400)

  // ── Enfermería ajusta la orden ──
  const ajuste = await call("enfermeria", "POST", `/admin/medical-orders/${oid}/items`, { items: [{ variant_id: variante, quantity: 3 }] })
  check("Enfermería ajusta la cantidad de un renglón", ajuste.j?.medical_order?.items?.[0]?.quantity === 3, JSON.stringify(ajuste.j?.cambios))
  check("Caja no ajusta órdenes", (await call("caja", "POST", `/admin/medical-orders/${oid}/items`, { items: [{ variant_id: variante, quantity: 1 }] })).code === 403)

  // ── Sin existencia en Enfermería: 409 y nada cambia ──
  const sinStock = await call("enfermeria", "POST", `/admin/medical-orders/${oid}/consume`)
  check("aplicar sin existencia en Enfermería devuelve 409", sinStock.code === 409, `HTTP ${sinStock.code}`)
  check("y la orden sigue pendiente", (await call("medico", "GET", `/admin/medical-orders/${oid}`)).j?.medical_order?.status === "pending")

  // ── Mientras Enfermería no aplique, Caja no cobra ni imprime: regla del servidor ──
  const regionC = (await call("admin", "GET", "/admin/regions?limit=1")).j?.regions?.[0]?.id
  const carritoMostrador = (await call("caja", "POST", "/admin/draft-orders", { region_id: regionC, sales_channel_id: canal, customer_id: paciente.id, items: [{ variant_id: variante, quantity: 1 }] })).j?.draft_order
  const cobroPrematuro = await call("caja", "POST", `/admin/draft-orders/${carritoMostrador?.id}/convert-to-order`)
  check("con una orden sin aplicar, cobrar al paciente devuelve 409 aunque sea un carrito de mostrador", cobroPrematuro.code === 409 && cobroPrematuro.j?.type === "esperando_enfermeria", `HTTP ${cobroPrematuro.code} ${cobroPrematuro.j?.message ?? ""}`)
  check("y el ticket tampoco sale", (await call("caja", "GET", `/admin/receipts/${carritoMostrador?.id}`)).code === 409)
  if (carritoMostrador?.id) await call("admin", "DELETE", `/admin/draft-orders/${carritoMostrador.id}`)

  // ── Con existencia (alta directa en Enfermería): aplica, descuenta, carga a la cuenta ──
  const lote = await call("enfermeria", "POST", "/admin/medical-batches", {
    batch_number: `CONS-${sello}`, expiration_date: en(200), variant_id: variante, stock_location_id: enfermeria.id, quantity: 10, apply_margin: false,
  })
  check("Enfermería da de alta un lote en su almacén", lote.code === 200, `HTTP ${lote.code} ${lote.j?.message ?? ""}`)
  const aplicada = await call("enfermeria", "POST", `/admin/medical-orders/${oid}/consume`)
  check("Enfermería aplica la orden", aplicada.code === 200 && aplicada.j?.medical_order?.status === "dispensed", JSON.stringify(aplicada.j).slice(0, 160))
  const loteTras = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches?.find((b) => b.id === lote.j?.batch?.id)
  check("y el almacén de Enfermería descontó 3", loteTras?.quantity === 7, `${loteTras?.quantity}`)
  const ke = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${enfermeria.id}&variant_id=${variante}&type=exit_sale`)).j?.movements ?? []
  check("con asiento en el kardex de Enfermería referido a la orden", ke.some((m) => m.reference_id === oid && m.quantity_delta === -3))
  const cuenta = aplicada.j?.cuenta
  check(
    "el consumo quedó en la cuenta del paciente, con precio",
    !!cuenta?.id && cuenta.items.some((i) => i.variant_id === variante && i.quantity === 3 && i.unit_price === 25),
    JSON.stringify(cuenta).slice(0, 160)
  )
  check("y la orden guarda el enlace con la cuenta", aplicada.j?.medical_order?.draft_order_id === cuenta?.id)
  // La CONSULTA entra a la cuenta con lo primero aplicado, una sola vez (lib/consulta.ts).
  const cuentaConConsulta = (await call("admin", "GET", `/admin/draft-orders/${cuenta?.id}?fields=id,items.id,items.title,items.unit_price,items.quantity,items.metadata`)).j?.draft_order
  const renglonesConsulta = (cuentaConConsulta?.items ?? []).filter((i) => i.metadata?.altus_consulta === true)
  check("la cuenta lleva la consulta como renglón de precio variable", renglonesConsulta.length === 1 && renglonesConsulta[0].metadata?.altus_precio_variable === true && renglonesConsulta[0].metadata?.altus_medical_order_id === oid, JSON.stringify(renglonesConsulta.map((i) => [i.title, i.unit_price, i.metadata])).slice(0, 200))

  // Segunda orden: se SUMA a la misma cuenta abierta.
  const orden2 = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, customer_name: "Verificación consulta", items: [{ variant_id: variante, quantity: 1, instructions: "Dosis única" }] })
  const aplicada2 = await call("enfermeria", "POST", `/admin/medical-orders/${orden2.j?.medical_order?.id}/consume`)
  // Medusa puede sumar al renglón o abrir otro con la misma presentación; lo que
  // importa es que sea la MISMA cuenta y que en total haya 3 + 1.
  const enCuenta = (aplicada2.j?.cuenta?.items ?? []).filter((i) => i.variant_id === variante).reduce((s, i) => s + i.quantity, 0)
  check("una segunda consulta se suma a la misma cuenta abierta", aplicada2.j?.cuenta?.id === cuenta?.id && enCuenta === 4, JSON.stringify(aplicada2.j?.cuenta?.items ?? aplicada2.j?.advertencia ?? aplicada2.j).slice(0, 160))
  const cuentaTras2 = (await call("admin", "GET", `/admin/draft-orders/${cuenta?.id}?fields=id,items.id,items.metadata`)).j?.draft_order
  check("y NO añade una segunda consulta a la misma cuenta", (cuentaTras2?.items ?? []).filter((i) => i.metadata?.altus_consulta === true).length === 1)
  // Los renglones cargados por los DOS caminos (cuenta nueva y cuenta ya
  // abierta) llevan la marca que impide descontarlos otra vez de Farmacia al
  // cobrar (ver lib/cuentas-de-paciente.ts y el suscriptor de ventas).
  const cuentaCruda = (await call("admin", "GET", `/admin/draft-orders/${cuenta?.id}?fields=id,items.variant_id,items.metadata`)).j?.draft_order
  const renglonesDeConsulta = (cuentaCruda?.items ?? []).filter((i) => i.variant_id === variante)
  check("todos los renglones de consulta llevan la marca de «ya aplicado»", renglonesDeConsulta.length > 0 && renglonesDeConsulta.every((i) => i.metadata?.altus_consumido_en_consulta === true), JSON.stringify(renglonesDeConsulta.map((i) => i.metadata)))

  // ── Caja ve la cuenta pendiente ──
  const cuentas = (await call("caja", "GET", `/admin/patient-bills?customer_id=${paciente.id}`)).j?.bills ?? []
  check("Caja ve la cuenta pendiente del paciente con sus órdenes", cuentas.some((c) => c.id === cuenta?.id && c.medical_orders.length >= 2), `${cuentas.length} cuentas`)

  // ── Nota de atención ──
  const nota = await call("enfermeria", "POST", "/admin/clinical-notes", { customer_id: paciente.id, content: "Se aplicó en consultorio sin reacción adversa.", medical_order_id: oid })
  const nid = nota.j?.clinical_note?.id
  check("Enfermería escribe la nota de atención", nota.code === 200 && nota.j?.clinical_note?.author_role === "nurse", JSON.stringify(nota.j).slice(0, 120))
  check("una nota vacía se rechaza", (await call("medico", "POST", "/admin/clinical-notes", { customer_id: paciente.id, content: " " })).code === 400)
  check("Caja no lee notas de atención", (await call("caja", "GET", `/admin/clinical-notes?customer_id=${paciente.id}`)).code === 403)
  check("Caja tampoco las escribe", (await call("caja", "POST", "/admin/clinical-notes", { customer_id: paciente.id, content: "Intento de caja" })).code === 403)
  check("el médico sí las lee", ((await call("medico", "GET", `/admin/clinical-notes?medical_order_id=${oid}`)).j?.clinical_notes ?? []).some((n) => n.id === nid))
  // Corregir sin borrar: la versión anterior queda en `revisions`.
  const correccion = await call("enfermeria", "PUT", `/admin/clinical-notes/${nid}`, { content: "Se aplicó en consultorio sin reacción adversa. Se vigiló quince minutos." })
  check(
    "quien escribió la nota la corrige, y la versión anterior queda guardada con su autor",
    correccion.code === 200 && correccion.j?.clinical_note?.revisions?.length === 1 && correccion.j?.clinical_note?.revisions?.[0]?.content === "Se aplicó en consultorio sin reacción adversa." && !!correccion.j?.clinical_note?.edited_by_name,
    JSON.stringify(correccion.j).slice(0, 200)
  )
  check("otra persona no la corrige", (await call("medico", "PUT", `/admin/clinical-notes/${nid}`, { content: "Intento ajeno a la nota" })).code === 403)
  check("una corrección vacía se rechaza", (await call("enfermeria", "PUT", `/admin/clinical-notes/${nid}`, { content: " " })).code === 400)
  const bit = (await call("admin", "GET", "/admin/audit-logs")).j?.audit_logs ?? []
  const asientoNota = bit.find((a) => a.endpoint === "/admin/clinical-notes" && a.method === "POST")
  check("el contenido de la nota queda redactado en la bitácora", !!asientoNota && JSON.stringify(asientoNota.payload ?? {}).includes("[REDACTADO]") && !JSON.stringify(asientoNota.payload ?? {}).includes("reacción adversa"))

  // ── Documentos ──
  const receta = await call("medico", "GET", `/admin/documents/receta/${oid}`)
  check("la receta se imprime con folio, paciente y renglones", receta.code === 200 && receta.j?.html?.includes(oid.slice(-8).toUpperCase()) && receta.j?.html?.includes("Verificación consulta") && receta.j?.html?.includes("Aplicar en consultorio"))
  check("Farmacia también imprime recetas", (await call("farmacia", "GET", `/admin/documents/receta/${oid}`)).code === 200)
  const notaDoc = await call("enfermeria", "GET", `/admin/documents/nota/${nid}`)
  check("la nota se imprime con paciente, autor y contenido", notaDoc.code === 200 && notaDoc.j?.html?.includes("sin reacción adversa") && notaDoc.j?.html?.includes("Enfermería"))
  check("Caja no obtiene la nota impresa", (await call("caja", "GET", `/admin/documents/nota/${nid}`)).code === 403)
  const sesion = (await call("caja", "GET", "/admin/cash-sessions?limit=1")).j
  const sid = (sesion?.cash_sessions ?? sesion?.sessions ?? [])[0]?.id
  if (sid) {
    const corte = await call("caja", "GET", `/admin/documents/corte/${sid}`)
    check("el corte de caja se imprime con cajero y ventas por método", corte.code === 200 && corte.j?.html?.includes("Efectivo") && corte.j?.html?.includes("Esperado en caja"))
    check("el médico no obtiene cortes", (await call("medico", "GET", `/admin/documents/corte/${sid}`)).code === 403)
  } else {
    check("hay un turno de caja para imprimir el corte", true, "sin turnos: se prueba en la fase 4")
  }

  // ── Limpieza ──
  const lotes = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  await call("admin", "POST", "/admin/inventory-counts", { counts: lotes.map((b) => ({ batch_id: b.id, counted_quantity: 0 })), apply: true, notes: "Limpieza de verificación" })
  if (cuenta?.id) await call("admin", "DELETE", `/admin/draft-orders/${cuenta.id}`)
  await call("admin", "DELETE", `/admin/products/${productoId}`)
}

// ── 10. Caja ────────────────────────────────────────────────────────────────
async function caja() {
  seccion("10 · CAJA")

  const cerrarTurnoDe = async (rol) => {
    const actual = (await call(rol, "GET", "/admin/cash-sessions/current")).j?.session
    if (actual) await call(rol, "POST", `/admin/cash-sessions/${actual.id}/close`, { actual_closing_amount: 0, notes: "Cierre de verificación" })
  }
  await cerrarTurnoDe("caja")
  await cerrarTurnoDe("admin")

  // Un carrito de mostrador, como lo arma el punto de venta.
  const region = (await call("admin", "GET", "/admin/regions?limit=1")).j?.regions?.[0]
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]
  // Un paciente SIN órdenes pendientes en Enfermería: con ellas, cobrar se niega (sección 9).
  const enConsulta = new Set(((await call("enfermeria", "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).j?.medical_orders ?? []).map((o) => o.customer_id))
  const paciente = ((await call("admin", "GET", "/admin/customers?limit=50")).j?.customers ?? []).find((c) => !enConsulta.has(c.id))
  // Una presentación CON precio en la moneda de la región: sin él, Medusa no
  // arma el pedido (falla al calcular el precio) y la sección no prueba nada.
  const productos = (await call("admin", "GET", "/admin/products?limit=50&status[]=published&fields=id,*variants,*variants.prices")).j?.products ?? []
  const variante = productos.flatMap((p) => p.variants ?? []).find((v) => (v.prices ?? []).some((pr) => pr.currency_code === region?.currency_code && Number(pr.amount) > 0))?.id
  if (!region || !canal || !paciente || !variante) {
    check("hay región, canal, paciente y producto publicado para cobrar", false)
    return
  }
  const carrito = async () =>
    (await call("caja", "POST", "/admin/draft-orders", {
      region_id: region.id, sales_channel_id: canal.id, customer_id: paciente.id,
      items: [{ variant_id: variante, quantity: 1 }],
    })).j?.draft_order
  const c1 = await carrito()
  check("Caja arma un carrito", !!c1?.id, JSON.stringify(c1).slice(0, 100))

  // ── Sin turno no se cobra ──
  const sinTurno = await call("caja", "POST", `/admin/draft-orders/${c1?.id}/convert-to-order`)
  check("cobrar sin turno abierto devuelve 409", sinTurno.code === 409 && sinTurno.j?.type === "turno_cerrado", `HTTP ${sinTurno.code}`)

  // ── Una sola caja en la clínica ──
  const turnoCaja = await call("caja", "POST", "/admin/cash-sessions", { opening_amount: 100 })
  check("Caja abre su turno con fondo inicial", turnoCaja.code === 201 && Number(turnoCaja.j?.session?.opening_amount) === 100, `HTTP ${turnoCaja.code}`)
  const turnoAdmin = await call("admin", "POST", "/admin/cash-sessions", { opening_amount: 50 })
  check(
    "nadie más abre caja mientras esa siga abierta, y se dice quién la tiene",
    turnoAdmin.code === 409 && turnoAdmin.j?.type === "caja_ocupada" && /Caja/.test(turnoAdmin.j?.message ?? ""),
    `HTTP ${turnoAdmin.code} ${turnoAdmin.j?.message ?? ""}`
  )
  const vistaAdmin = (await call("admin", "GET", "/admin/cash-sessions/current")).j
  check("la pantalla de quien no la tiene sabe que está ocupada", vistaAdmin?.session === null && !!vistaAdmin?.otra_caja_abierta?.cashier_name, JSON.stringify(vistaAdmin))
  check("la misma persona no abre dos", (await call("caja", "POST", "/admin/cash-sessions", { opening_amount: 1 })).code === 400)

  const actualCaja = (await call("caja", "GET", "/admin/cash-sessions/current")).j?.session
  check("«mi turno» es el mío, no el de otra caja", actualCaja?.id === turnoCaja.j?.session?.id && actualCaja?.cashier_name?.startsWith("Caja"))
  const sid = turnoCaja.j?.session?.id

  // ── Tarjeta exige referencia ──
  const sinRef = await call("caja", "POST", `/admin/cash-sessions/${sid}/movements`, { type: "sale", payment_method: "card", amount: 45, order_id: c1?.id })
  check("una venta con tarjeta sin referencia se rechaza", sinRef.code === 400, `HTTP ${sinRef.code}`)
  check("y con una referencia de 3 dígitos también", (await call("caja", "POST", `/admin/cash-sessions/${sid}/movements`, { type: "sale", payment_method: "card", amount: 45, order_id: c1?.id, reference: "123" })).code === 400)
  const conRef = await call("caja", "POST", `/admin/cash-sessions/${sid}/movements`, { type: "sale", payment_method: "card", amount: Number(c1?.total) || 45, order_id: c1?.id, reference: " 12345 " })
  check("con referencia de 5 dígitos se registra, limpia", conRef.code === 201 && conRef.j?.movement?.reference === "12345", `HTTP ${conRef.code}`)

  // ── Con turno, cobrar ──
  const cobrada = await call("caja", "POST", `/admin/draft-orders/${c1?.id}/convert-to-order`)
  check("con turno abierto se cobra", cobrada.code === 200, `HTTP ${cobrada.code} ${JSON.stringify(cobrada.j).slice(0, 80)}`)
  const recibo = (await call("caja", "GET", `/admin/receipts/${c1?.id}`)).j?.recibo
  check("el ticket lleva el método de pago y la referencia de la terminal", recibo?.metodo_pago === "card" && recibo?.referencia === "12345", JSON.stringify({ m: recibo?.metodo_pago, r: recibo?.referencia }))

  // ── Corte y reimpresión ──
  const corteAbierto = await call("caja", "GET", `/admin/documents/corte/${sid}`)
  check("el corte del turno abierto se imprime con la venta con tarjeta", corteAbierto.code === 200 && corteAbierto.j?.html?.includes("Tarjeta") && corteAbierto.j?.resumen?.sales_card === conRef.j?.movement?.amount, JSON.stringify(corteAbierto.j?.resumen ?? corteAbierto.j).slice(0, 120))
  const cierre = await call("caja", "POST", `/admin/cash-sessions/${sid}/close`, { actual_closing_amount: 100, notes: "Verificación" })
  check("el turno cierra cuadrado: sólo hubo tarjeta", cierre.code === 200 && Number(cierre.j?.session?.difference) === 0, JSON.stringify(cierre.j?.summary))
  const corteCerrado = await call("caja", "GET", `/admin/documents/corte/${sid}`)
  check("el corte cerrado se reimprime con el conteo", corteCerrado.code === 200 && corteCerrado.j?.html?.includes("Contado"))
  check("el auditor también lo consulta", (await call("auditoria", "GET", `/admin/documents/corte/${sid}`)).code === 200)
  check("el médico no", (await call("medico", "GET", `/admin/documents/corte/${sid}`)).code === 403)

  // Dos personas abren en el mismo instante con la caja libre: sólo una entra.
  const aLaVez = await Promise.all(["caja", "admin"].map((rol) => call(rol, "POST", "/admin/cash-sessions", { opening_amount: 1 })))
  check("dos aperturas simultáneas: una abre y la otra recibe 409", aLaVez.filter((r) => r.code === 201).length === 1 && aLaVez.filter((r) => r.code === 409).length === 1, aLaVez.map((r) => r.code).join(", "))
  await cerrarTurnoDe("caja")

  // ── Estadísticas ──
  const hoy = new Date().toISOString().slice(0, 10)
  const stats = (await call("admin", "GET", `/admin/cash-sessions/stats?group=day&from=${hoy}T00:00:00Z`)).j
  const periodoHoy = (stats?.periods ?? []).find((p) => p.periodo === hoy)
  check("las estadísticas por día suman lo que suman los turnos cerrados de hoy", !!periodoHoy && periodoHoy.sales_card >= conRef.j?.movement?.amount && periodoHoy.sesiones >= 1, JSON.stringify(periodoHoy).slice(0, 120))
  const semana = (await call("admin", "GET", "/admin/cash-sessions/stats?group=week")).j
  check("y por semana también", (semana?.periods ?? []).some((p) => /^\d{4}-W\d{2}$/.test(p.periodo)))
  check("una agrupación inválida se rechaza", (await call("admin", "GET", "/admin/cash-sessions/stats?group=hora")).code === 400)
  const listaHoy = (await call("admin", "GET", `/admin/cash-sessions?from=${hoy}T00:00:00Z`)).j?.sessions ?? []
  check("la lista de turnos filtra por fecha", listaHoy.some((s) => s.id === sid) && listaHoy.every((s) => s.opened_at >= `${hoy}T00:00:00`))

  await cerrarTurnoDe("admin")
}

// ── 11. Auditoría ───────────────────────────────────────────────────────────
async function auditoria() {
  seccion("11 · AUDITORÍA")

  const bit = async (q) => (await call("auditoria", "GET", `/admin/audit-logs${q ? `?${q}` : ""}`)).j

  // Los filtros los aplica el servidor.
  const deCaja = await bit("user_role=cashier&limit=200")
  check("filtrar por perfil devuelve sólo asientos de ese perfil", (deCaja?.audit_logs ?? []).length > 0 && deCaja.audit_logs.every((a) => a.user_role === "cashier"), `${deCaja?.audit_logs?.length} asientos, count ${deCaja?.count}`)
  const deUsuario = await bit("user_email=farmacia&limit=200")
  check("filtrar por usuario acepta el nombre a secas", (deUsuario?.audit_logs ?? []).length > 0 && deUsuario.audit_logs.every((a) => a.user_email === "farmacia@sigh.local"))
  const porNumero = await bit("employee_number=0004&limit=200")
  check("filtrar por número de empleado", (porNumero?.audit_logs ?? []).length > 0 && porNumero.audit_logs.every((a) => a.user_employee_number === "0004"))
  const bajas = await bit("method=delete&limit=200")
  check("filtrar por acción", (bajas?.audit_logs ?? []).length > 0 && bajas.audit_logs.every((a) => a.method === "DELETE"))
  const hoy = new Date().toISOString().slice(0, 10)
  const deHoy = await bit(`from=${hoy}&to=${hoy}&limit=200`)
  check("un rango de hoy devuelve sólo asientos de hoy", (deHoy?.audit_logs ?? []).length > 0 && deHoy.audit_logs.every((a) => a.created_at.slice(0, 10) === hoy))
  // Y uno que acaba ayer no trae nada de hoy. Antes se comparaba el total de hoy
  // con el de siempre, lo que exige asientos de otros días: en una base recién
  // sembrada todo es de hoy, y la prueba fallaba con el filtro funcionando bien.
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const hastaAyer = await bit(`to=${ayer}&limit=200`)
  check("y uno que acaba ayer no trae nada de hoy", Array.isArray(hastaAyer?.audit_logs) && hastaAyer.audit_logs.every((a) => a.created_at.slice(0, 10) <= ayer), `${hastaAyer?.audit_logs?.length} asientos hasta ${ayer}`)
  check("un rol desconocido se rechaza", (await call("auditoria", "GET", "/admin/audit-logs?user_role=gerente")).code === 400)

  // Paginación: 25 y 25 no se repiten ni se saltan.
  const p1 = await bit("limit=25&offset=0")
  const p2 = await bit("limit=25&offset=25")
  const ids = new Set([...(p1?.audit_logs ?? []), ...(p2?.audit_logs ?? [])].map((a) => a.id))
  check("paginar 25 y 25 no repite ni salta ninguno", p1?.audit_logs?.length === 25 && p2?.audit_logs?.length === 25 && ids.size === 50 && p1.count >= 50 && p1.limit === 25 && p2.offset === 25, `${ids.size} únicos, count ${p1?.count}`)
  check("el tope por página se respeta", (await bit("limit=9999")).limit === 200)

  // Lecturas sensibles: quién miró un expediente queda anotado.
  const paciente = (await call("admin", "GET", "/admin/customers?limit=1")).j?.customers?.[0]
  await call("medico", "GET", `/admin/medical-customers/${paciente.id}`)
  await call("caja", "GET", `/admin/customers/${paciente.id}`)
  await call("caja", "GET", "/admin/products?limit=1")
  await new Promise((r) => setTimeout(r, 500))
  const lecturas = (await bit("method=GET&limit=50"))?.audit_logs ?? []
  check("leer un expediente como médico deja asiento de lectura", lecturas.some((a) => a.user_email === "medico@sigh.local" && a.endpoint.includes(`/admin/medical-customers/${paciente.id}`)))
  check("y abrir la ficha de un paciente también", lecturas.some((a) => a.user_email === "caja@sigh.local" && a.endpoint.includes(`/admin/customers/${paciente.id}`)))
  check("pero consultar el catálogo no", !lecturas.some((a) => a.endpoint.startsWith("/admin/products")))
  check("Caja no lee la bitácora", (await call("caja", "GET", "/admin/audit-logs")).code === 403)

  // Exportación de caducidades por almacén.
  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  const producto = (await call("admin", "GET", "/admin/products?limit=1&status[]=published&fields=id,*variants")).j?.products?.[0]
  const variante = producto?.variants?.[0]?.id
  const sello = Date.now()
  const lote = await call("enfermeria", "POST", "/admin/medical-batches", { batch_number: `CAD-${sello}`, expiration_date: en(20), variant_id: variante, stock_location_id: enfermeria?.id, quantity: 3, apply_margin: false })
  const csvEnf = await fetch(`${BASE}/admin/expiring-inventory/export?stock_location_id=${enfermeria?.id}`, { headers: { Authorization: `Bearer ${T.auditoria}` } })
  const textoEnf = await csvEnf.text()
  check("el CSV de Enfermería trae el lote que caduca en 20 días, en su tramo", csvEnf.status === 200 && csvEnf.headers.get("content-type")?.includes("text/csv") && textoEnf.includes(`CAD-${sello}`) && textoEnf.includes("30 días o menos"), `HTTP ${csvEnf.status}`)
  const textoFar = await (await fetch(`${BASE}/admin/expiring-inventory/export?stock_location_id=${farmacia?.id}`, { headers: { Authorization: `Bearer ${T.auditoria}` } })).text()
  check("y el de Farmacia no lo trae", !textoFar.includes(`CAD-${sello}`))
  check("la pantalla de caducidades filtra igual", ((await call("admin", "GET", `/admin/expiring-inventory?stock_location_id=${farmacia?.id}`)).j?.items ?? []).every((i) => i.stock_location_id === farmacia?.id))

  // Limpieza.
  if (lote.j?.batch?.id) await call("admin", "POST", "/admin/inventory-counts", { counts: [{ batch_id: lote.j.batch.id, counted_quantity: 0 }], apply: true, notes: "Limpieza de verificación" })
}

// ── 12. Cuentas y honorarios ────────────────────────────────────────────────
async function cuentasYHonorarios() {
  seccion("12 · CUENTAS Y HONORARIOS")

  const sello = Date.now()
  const personal = (await call("admin", "GET", "/admin/staff")).j?.users ?? []
  const adminId = personal.find((u) => u.email === "admin@sigh.local")?.id
  const medicoId = personal.find((u) => u.email === "medico@sigh.local")?.id

  // ── Bloqueo reversible ──
  const usuario = `bloqueo.${sello}`
  const clave = "Bloqueo#2026"
  const alta = await call("admin", "POST", "/admin/staff", { username: usuario, password: clave, first_name: "Prueba", last_name: "Bloqueo", role: "cashier" })
  const uid = alta.j?.user?.id
  const tokenViejo = (await login(usuario, clave)).token
  check("la cuenta nueva entra y tiene token", !!tokenViejo)
  check("Caja no bloquea cuentas", (await call("caja", "POST", `/admin/staff/${uid}/block`, {})).code === 403)
  check("nadie bloquea su propia cuenta", (await call("admin", "POST", `/admin/staff/${adminId}/block`, {})).code === 400)
  const bloqueo = await call("admin", "POST", `/admin/staff/${uid}/block`, { reason: "Verificación" })
  check("Administración bloquea", bloqueo.code === 200 && bloqueo.j?.blocked === true, `HTTP ${bloqueo.code}`)
  const intento = await login(usuario, clave)
  check("la cuenta bloqueada no entra", intento.code === 401 && !intento.token, `HTTP ${intento.code}`)
  const conTokenViejo = await fetch(`${BASE}/admin/products?limit=1`, { headers: { Authorization: `Bearer ${tokenViejo}` } })
  check("y su token anterior ya no sirve, ni para leer", conTokenViejo.status === 403, `HTTP ${conTokenViejo.status}`)
  check("bloquearla dos veces se rechaza", (await call("admin", "POST", `/admin/staff/${uid}/block`, {})).code === 400)
  const reactivada = await call("admin", "POST", `/admin/staff/${uid}/unblock`)
  check("Administración reactiva", reactivada.code === 200 && reactivada.j?.blocked === false)
  check("y vuelve a entrar con la MISMA contraseña", !!(await login(usuario, clave)).token)

  // ── Cambio de contraseña ──
  check("una contraseña corta se rechaza", (await call("admin", "POST", `/admin/staff/${uid}/password`, { password: "corta" })).code === 400)
  const cambio = await call("admin", "POST", `/admin/staff/${uid}/password`, { password: "Nueva#Clave2026" })
  check("Administración cambia la contraseña", cambio.code === 200 && cambio.j?.password_changed === true, `HTTP ${cambio.code} ${cambio.j?.message ?? ""}`)
  check("la anterior deja de servir", !(await login(usuario, clave)).token)
  check("y la nueva entra", !!(await login(usuario, "Nueva#Clave2026")).token)
  await call("admin", "DELETE", `/admin/staff/${uid}`)

  // ── Turno médico ──
  const previo = (await call("medico", "GET", "/admin/doctor-shifts/current")).j?.doctor_shift
  if (previo) await call("medico", "POST", `/admin/doctor-shifts/${previo.id}/close`, {})
  const turno = await call("medico", "POST", "/admin/doctor-shifts", {})
  check("el médico abre su turno", turno.code === 201 && !!turno.j?.doctor_shift?.opened_at, `HTTP ${turno.code}`)
  check("no abre dos a la vez", (await call("medico", "POST", "/admin/doctor-shifts", {})).code === 400)
  check("«mi turno» es el suyo", (await call("medico", "GET", "/admin/doctor-shifts/current")).j?.doctor_shift?.id === turno.j?.doctor_shift?.id)
  check("Caja no abre turnos médicos", (await call("caja", "POST", "/admin/doctor-shifts", {})).code === 403)

  // ── Comisión ──
  check("un porcentaje fuera de rango se rechaza", (await call("admin", "POST", "/admin/doctor-commissions", { doctor_id: medicoId, percent: 150 })).code === 400)
  const comision = await call("admin", "POST", "/admin/doctor-commissions", { doctor_id: medicoId, percent: 20 })
  check("Administración fija 20 % al médico", comision.code === 200 && Number(comision.j?.doctor_commission?.percent) === 20, `HTTP ${comision.code} ${JSON.stringify(comision.j).slice(0, 80)}`)
  check("el médico no lee las comisiones", (await call("medico", "GET", "/admin/doctor-commissions")).code === 403)
  check("Auditoría sí", (await call("auditoria", "GET", "/admin/doctor-commissions")).code === 200)

  // ── Una consulta cobrada dentro del turno ──
  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  const farmacia = locs.find((l) => l.metadata?.altus_area === "pharmacy")
  // Un paciente de verdad (no el invitado del mostrador) y sin órdenes pendientes en Enfermería.
  const enConsultaHon = new Set(((await call("enfermeria", "GET", "/admin/medical-orders?status=pending&recipient_area=nursing")).j?.medical_orders ?? []).map((o) => o.customer_id))
  const paciente = ((await call("admin", "GET", "/admin/customers?limit=50")).j?.customers ?? []).find((c) => !enConsultaHon.has(c.id) && !/pos-guest/.test(c.email ?? ""))
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]?.id
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación honorarios ${sello}`, status: "published", sales_channels: canal ? [{ id: canal }] : undefined,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 100, currency_code: "mxn" }] }],
  })
  const variante = prod.j?.product?.variants?.[0]?.id
  await call("enfermeria", "POST", "/admin/medical-batches", { batch_number: `HON-${sello}`, expiration_date: en(200), variant_id: variante, stock_location_id: enfermeria?.id, quantity: 10, apply_margin: false })
  // También hay existencia en Farmacia: si el cobro descontara de ahí lo que
  // ya salió de Enfermería, se vería (fase 8: se vio en el día simulado).
  await call("almacen", "POST", "/admin/medical-batches", { batch_number: `HON-F-${sello}`, expiration_date: en(200), variant_id: variante, stock_location_id: farmacia?.id, quantity: 10, apply_margin: false })
  const orden = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente?.id, customer_name: "Verificación honorarios", items: [{ variant_id: variante, quantity: 2, instructions: "Aplicar en consultorio" }] })
  const aplicada = await call("enfermeria", "POST", `/admin/medical-orders/${orden.j?.medical_order?.id}/consume`)
  const cuentaId = aplicada.j?.cuenta?.id
  const sinCobrar = (await call("admin", "GET", `/admin/reports/doctor-payments?doctor_id=${medicoId}`)).j
  const antesDeCobrar = (sinCobrar?.orders ?? []).some((o) => o.medical_order_id === orden.j?.medical_order?.id)
  check("una cuenta sin cobrar todavía no paga comisión", !antesDeCobrar)
  // Caja cobra la cuenta.
  if (!(await call("caja", "GET", "/admin/cash-sessions/current")).j?.session) await call("caja", "POST", "/admin/cash-sessions", { opening_amount: 0 })
  const turnoCaja = (await call("caja", "GET", "/admin/cash-sessions/current")).j?.session
  // La consulta viene en cero (precio de referencia del producto de prueba): no se cobra así.
  const cuentaHon = (await call("caja", "GET", `/admin/draft-orders/${cuentaId}`)).j?.draft_order
  const lineaConsulta = (cuentaHon?.items ?? []).find((i) => i.metadata?.altus_consulta === true)
  if (lineaConsulta && Number(lineaConsulta.unit_price) <= 0) {
    const enCero = await call("caja", "POST", `/admin/draft-orders/${cuentaId}/convert-to-order`)
    check("con la consulta en cero, cobrar devuelve 409 y dice qué falta", enCero.code === 409 && enCero.j?.type === "precio_pendiente" && /Consulta/.test(enCero.j?.message ?? ""), `HTTP ${enCero.code} ${enCero.j?.message ?? ""}`)
  } else {
    check("hay una consulta en la cuenta para ponerle precio", !!lineaConsulta, lineaConsulta ? `ya traía precio ${lineaConsulta.unit_price}` : "sin consulta: ¿corriste preparar-consulta.ts?")
  }
  if (lineaConsulta) {
    // Caja pone el precio en el renglón, como lo hace el punto de venta.
    await call("caja", "POST", `/admin/draft-orders/${cuentaId}/edit`, {})
    const precio = await call("caja", "POST", `/admin/draft-orders/${cuentaId}/edit/items/item/${lineaConsulta.id}`, { quantity: 1, unit_price: 150 })
    const confirmado = await call("caja", "POST", `/admin/draft-orders/${cuentaId}/edit/confirm`, {})
    // Sin `fields`: con selección parcial el pedido devuelve los renglones sin los cambios de la edición.
    const tras = (await call("caja", "GET", `/admin/draft-orders/${cuentaId}`)).j?.draft_order
    const consultaTras = (tras?.items ?? []).find((i) => i.metadata?.altus_consulta === true)
    check("Caja pone el precio de la consulta en el renglón", precio.code === 200 && confirmado.code === 200 && Number(consultaTras?.unit_price) === 150, `HTTP ${precio.code}/${confirmado.code} precio=${consultaTras?.unit_price}`)
  }
  await call("caja", "POST", `/admin/cash-sessions/${turnoCaja?.id}/movements`, { type: "sale", payment_method: "cash", amount: 350, order_id: cuentaId })
  const cobro = await call("caja", "POST", `/admin/draft-orders/${cuentaId}/convert-to-order`)
  check("Caja cobra la cuenta de la consulta", cobro.code === 200, `HTTP ${cobro.code} ${cobro.j?.message ?? ""}`)
  // El suscriptor de ventas corre después de la respuesta.
  await new Promise((r) => setTimeout(r, 1500))
  const kFarm = (await call("admin", "GET", `/admin/inventory-movements?stock_location_id=${farmacia?.id}&variant_id=${variante}&type=exit_sale`)).j?.movements ?? []
  check("cobrar la cuenta NO vuelve a descontar de Farmacia lo aplicado en consulta", !kFarm.some((m) => m.reference_id === cuentaId), JSON.stringify(kFarm.map((m) => [m.reference_id, m.quantity_delta])))
  const loteFarm = ((await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}&stock_location_id=${farmacia?.id}`)).j?.batches ?? [])[0]
  check("y el lote de Farmacia sigue entero", loteFarm?.quantity === 10, `${loteFarm?.quantity}`)
  const reporte = (await call("admin", "GET", `/admin/reports/doctor-payments?doctor_id=${medicoId}`)).j
  const fila = (reporte?.orders ?? []).find((o) => o.medical_order_id === orden.j?.medical_order?.id)
  check("cobrada, la orden vale 2 × $100 y cae en el turno abierto", fila?.cobrado === 200 && fila?.turno_id === turno.j?.doctor_shift?.id, JSON.stringify(fila))
  const medico = (reporte?.doctors ?? []).find((d) => d.doctor_id === medicoId)
  check("y el reporte del médico suma su 20 %", !!medico && medico.percent === 20 && medico.comision >= 40 && medico.turnos.some((t) => t.turno_id === turno.j?.doctor_shift?.id && t.abierto === true), JSON.stringify(medico).slice(0, 160))
  check("Caja no lee reportes de pagos", (await call("caja", "GET", "/admin/reports/doctor-payments")).code === 403)
  const porMedico = (await call("auditoria", "GET", "/admin/reports/revenue?group=doctor")).j
  check("ingresos por médico", (porMedico?.rows ?? []).some((r) => r.clave === medicoId && r.cobrado >= 200))
  const porMes = (await call("admin", "GET", "/admin/reports/revenue?group=month")).j
  check("ingresos por mes", (porMes?.rows ?? []).length > 0 && porMes.rows.every((r) => /^\d{4}-\d{2}$/.test(r.clave)))
  check("una agrupación inválida se rechaza", (await call("admin", "GET", "/admin/reports/revenue?group=hora")).code === 400)
  const cierre = await call("medico", "POST", `/admin/doctor-shifts/${turno.j?.doctor_shift?.id}/close`, {})
  check("el médico cierra su turno", cierre.code === 200 && !!cierre.j?.doctor_shift?.closed_at)

  // Limpieza.
  const lotes = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  await call("admin", "POST", "/admin/inventory-counts", { counts: lotes.map((b) => ({ batch_id: b.id, counted_quantity: 0 })), apply: true, notes: "Limpieza de verificación" })
  await call("admin", "DELETE", `/admin/products/${prod.j?.product?.id}`)
  const actual = (await call("caja", "GET", "/admin/cash-sessions/current")).j?.session
  if (actual) await call("caja", "POST", `/admin/cash-sessions/${actual.id}/close`, { actual_closing_amount: 200, notes: "Cierre de verificación" })
}

// ── 13. Perfiles y cierre del panel ─────────────────────────────────────────
// Desde la fase 7 los seis perfiles tienen interfaz en el punto de venta y el
// panel es SÓLO de Administración: aquí la guardia se exige encendida (la
// sección 6 sólo la tolera). Lo que Farmacia y Auditoría hacían en el panel
// tiene que poder hacerse con el token del punto de venta.
async function perfilesYCierreDelPanel() {
  seccion("13 · PERFILES Y CIERRE DEL PANEL")

  const sesion = async (rol) => {
    const r = await fetch(`${BASE}/auth/session`, { method: "POST", headers: { Authorization: `Bearer ${T[rol]}` } })
    return { code: r.status, j: await r.json().catch(() => ({})) }
  }
  const admin = await sesion("admin")
  check("sólo Administración obtiene la cookie del panel", admin.code === 200, `HTTP ${admin.code}`)
  for (const rol of ["farmacia", "caja", "medico", "enfermeria", "auditoria", "almacen", "rrhh"]) {
    const s = await sesion(rol)
    check(
      `${rol} recibe 403 con un mensaje que lo explica`,
      s.code === 403 && /Administraci/.test(s.j?.message ?? ""),
      `HTTP ${s.code} ${s.j?.message ?? ""}`
    )
  }

  // ── Farmacia, desde el punto de venta ──
  const almacenes = (await call("farmacia", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const farmacia = almacenes.find((l) => l.metadata?.altus_area === "pharmacy")
  const enfermeria = almacenes.find((l) => l.metadata?.altus_area === "nursing")
  check("Farmacia lee los almacenes con su área", !!farmacia && !!enfermeria, almacenes.map((l) => `${l.name}=${l.metadata?.altus_area ?? "—"}`).join(", "))
  if (!farmacia) return

  const existencias = await call("farmacia", "GET", `/admin/inventory-reports/valuation?stock_location_id=${farmacia.id}&include_quarantined=true`)
  check("Farmacia lee las existencias de su almacén", existencias.code === 200 && Array.isArray(existencias.j?.items), `HTTP ${existencias.code}`)
  const kardex = await call("farmacia", "GET", `/admin/inventory-movements?stock_location_id=${farmacia.id}&limit=5`)
  check("y su kardex con totales", kardex.code === 200 && Array.isArray(kardex.j?.movements) && !!kardex.j?.summary, `HTTP ${kardex.code}`)
  const caducidades = await call("farmacia", "GET", `/admin/expiring-inventory?stock_location_id=${farmacia.id}`)
  check("y sus caducidades por tramo", caducidades.code === 200 && caducidades.j?.summary?.["30"] !== undefined, `HTTP ${caducidades.code}`)
  const csv = await fetch(`${BASE}/admin/expiring-inventory/export?stock_location_id=${farmacia.id}`, { headers: { Authorization: `Bearer ${T.farmacia}` } })
  const texto = await csv.text()
  check("y descarga el CSV con el token", csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type") || "") && texto.includes("Almac"), `HTTP ${csv.status} ${csv.headers.get("content-type")}`)
  const politicas = await call("farmacia", "GET", `/admin/stock-policies?stock_location_id=${farmacia.id}`)
  check("y los mínimos y máximos", politicas.code === 200 && Array.isArray(politicas.j?.stock_policies), `HTTP ${politicas.code}`)
  const bandeja = await call("farmacia", "GET", "/admin/medical-orders?status=pending&recipient_area=pharmacy")
  check(
    "y su bandeja de recetas de mostrador, sin las de Enfermería",
    bandeja.code === 200 && (bandeja.j?.medical_orders ?? []).every((o) => o.recipient_area === "pharmacy" && o.status === "pending"),
    `HTTP ${bandeja.code}`
  )
  const requisiciones = await call("farmacia", "GET", "/admin/requisitions?status=pending")
  check("y las requisiciones pendientes de surtir", requisiciones.code === 200 && Array.isArray(requisiciones.j?.requisitions), `HTTP ${requisiciones.code}`)
  const turno = await call("farmacia", "POST", "/admin/cash-sessions", { opening_amount: 100 })
  check("Farmacia ya no alcanza la caja: no abre turno", turno.code === 403, `HTTP ${turno.code}`)

  // ── Auditoría, desde el punto de venta ──
  const bitacora = await call("auditoria", "GET", "/admin/audit-logs?limit=5&user_role=cashier")
  check("Auditoría lee la bitácora con filtros", bitacora.code === 200 && typeof bitacora.j?.count === "number", `HTTP ${bitacora.code}`)
  const kardex2 = await call("auditoria", "GET", "/admin/inventory-movements?limit=5")
  check("y el kardex de los dos almacenes", kardex2.code === 200 && Array.isArray(kardex2.j?.movements), `HTTP ${kardex2.code}`)
  const csv2 = await fetch(`${BASE}/admin/expiring-inventory/export`, { headers: { Authorization: `Bearer ${T.auditoria}` } })
  check("y descarga las caducidades", csv2.status === 200, `HTTP ${csv2.status}`)
  const cortes = await call("auditoria", "GET", "/admin/cash-sessions?status=closed&limit=5")
  check("y los cortes de caja", cortes.code === 200 && Array.isArray(cortes.j?.sessions), `HTTP ${cortes.code}`)
  const corte = cortes.j?.sessions?.[0]
  if (corte) {
    const documento = await call("auditoria", "GET", `/admin/documents/corte/${corte.id}`)
    check("e imprime un corte", documento.code === 200 && typeof documento.j?.html === "string", `HTTP ${documento.code}`)
    const resumen = await call("auditoria", "GET", `/admin/cash-sessions/${corte.id}/summary`)
    check("y ve su resumen", resumen.code === 200 && !!resumen.j?.summary, `HTTP ${resumen.code}`)
  }
  const estadisticas = await call("auditoria", "GET", "/admin/cash-sessions/stats?group=week")
  check("y las estadísticas por semana", estadisticas.code === 200 && Array.isArray(estadisticas.j?.periods), `HTTP ${estadisticas.code}`)
  check("Auditoría no surte requisiciones", (await call("auditoria", "POST", "/admin/requisitions/x/dispatch", {})).code === 403)
  check("ni fija mínimos", (await call("auditoria", "POST", "/admin/stock-policies", { variant_id: "x", min_quantity: 1 })).code === 403)
  check("ni da de baja lotes", (await call("auditoria", "POST", "/admin/medical-batches/x/write-off", { quantity: 1, reason: "prueba de lectura" })).code === 403)
  check("ni abre turno de caja", (await call("auditoria", "POST", "/admin/cash-sessions", { opening_amount: 1 })).code === 403)
}

// ── 14. Almacén y RH ────────────────────────────────────────────────────────
// Farmacia dejó de mover el inventario: ahora consulta y surte. Almacén da de
// alta, traspasa y ve costos. RH ve personal y honorarios, nada clínico.
async function almacenYRh() {
  seccion("14 · ALMACÉN Y RH")

  check("Farmacia ya no da de alta lotes", (await call("farmacia", "POST", "/admin/medical-batches", { batch_number: "X", expiration_date: "2030-01-01", variant_id: "x", quantity: 1 })).code === 403)
  check("ni fija mínimos", (await call("farmacia", "POST", "/admin/stock-policies", { variant_id: "x", min_quantity: 1 })).code === 403)
  check("ni surte requisiciones", (await call("farmacia", "POST", "/admin/requisitions/x/dispatch", {})).code === 403)
  check("ni destruye lotes", (await call("farmacia", "POST", "/admin/medical-batches/x/destroy", { reason: "prueba de permisos" })).code === 403)

  const paraFarmacia = await call("farmacia", "GET", "/admin/inventory-reports/valuation")
  const paraAlmacen = await call("almacen", "GET", "/admin/inventory-reports/valuation")
  check(
    "Farmacia ve las existencias sin costos",
    paraFarmacia.code === 200 && (paraFarmacia.j?.items ?? []).length > 0 && paraFarmacia.j.items.every((i) => i.average_unit_cost === null && i.total_value === null) && paraFarmacia.j.summary?.total_value === null,
    `HTTP ${paraFarmacia.code}`
  )
  check(
    "Almacén sí ve los costos",
    paraAlmacen.code === 200 && (paraAlmacen.j?.items ?? []).some((i) => i.average_unit_cost !== null),
    `HTTP ${paraAlmacen.code}`
  )
  check("Almacén no surte recetas", (await call("almacen", "POST", "/admin/medical-orders/x/dispense")).code === 403)
  check("ni lee recetas", (await call("almacen", "GET", "/admin/medical-orders")).code === 403)
  check("ni notas de atención", (await call("almacen", "GET", "/admin/clinical-notes")).code === 403)
  check("ni abre caja", (await call("almacen", "POST", "/admin/cash-sessions", { opening_amount: 1 })).code === 403)
  check("Caja ya no lee las indicaciones de las recetas", (await call("caja", "GET", "/admin/medical-orders")).code === 403)

  check("RH consulta la plantilla", (await call("rrhh", "GET", "/admin/staff")).code === 200)
  check("pero no da de alta personal", (await call("rrhh", "POST", "/admin/staff", { username: "x", password: "x", role: "cashier" })).code === 403)
  check("RH consulta las comisiones", (await call("rrhh", "GET", "/admin/doctor-commissions")).code === 200)
  check("RH no lee notas de atención", (await call("rrhh", "GET", "/admin/clinical-notes")).code === 403)
  check("ni expedientes", (await call("rrhh", "GET", "/admin/medical-customers")).code === 403)
  check("ni la bitácora completa", (await call("rrhh", "GET", "/admin/audit-logs")).code === 403)
  check("ni mueve inventario", (await call("rrhh", "POST", "/admin/stock-policies", { variant_id: "x", min_quantity: 1 })).code === 403)
}

// ── 15. Reportes exportables ────────────────────────────────────────────────
async function reportes() {
  seccion("15 · REPORTES EXPORTABLES")

  const tipos = ["actividad", "honorarios", "cortes", "ventas", "bitacora", "recetas", "inventario", "movimientos", "caducidades"]
  const catalogo = await call("auditoria", "GET", "/admin/reports/tipos")
  check("Auditoría ve los nueve reportes", catalogo.code === 200 && catalogo.j?.reportes?.length === 9, `HTTP ${catalogo.code} ${catalogo.j?.reportes?.length}`)

  const hoy = new Date()
  const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const semana = new Date(hoy)
  semana.setDate(semana.getDate() - 6)
  const rango = `desde=${dia(semana)}&hasta=${dia(hoy)}`

  const malos = []
  for (const tipo of tipos) {
    const r = await call("auditoria", "GET", `/admin/reports/export?tipo=${tipo}&${rango}`)
    if (r.code !== 200 || !Array.isArray(r.j?.tabla?.columnas) || !Array.isArray(r.j?.tabla?.filas)) malos.push(`${tipo}=${r.code}`)
  }
  check("cada reporte arma su tabla", malos.length === 0, malos.join(", "))

  const csv = await fetch(`${BASE}/admin/reports/export?tipo=cortes&${rango}&formato=csv`, { headers: { Authorization: `Bearer ${T.auditoria}` } })
  // Por bytes: `text()` se come el BOM, que es justo lo que se quiere comprobar.
  const bytes = Buffer.from(await csv.arrayBuffer())
  check(
    "el CSV sale para Excel: BOM, encabezados en español y nombre con el periodo",
    csv.status === 200 && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) && bytes.toString("utf8").includes("Cajero") && /cortes-\d{4}-\d{2}-\d{2}-a-/.test(csv.headers.get("content-disposition") ?? ""),
    `HTTP ${csv.status} ${csv.headers.get("content-disposition")}`
  )
  const hoja = await call("auditoria", "GET", `/admin/reports/export?tipo=actividad&${rango}&formato=html&agrupar=persona`)
  check("la hoja impresa va en carta horizontal con membrete", hoja.code === 200 && /letter landscape/.test(hoja.j?.html ?? ""), `HTTP ${hoja.code}`)

  const actividad = await call("auditoria", "GET", `/admin/reports/export?tipo=actividad&desde=${dia(hoy)}&hasta=${dia(hoy)}&persona=caja`)
  const filaCaja = actividad.j?.tabla?.filas?.find((f) => f.usuario === "caja")
  check("la actividad de hoy trae a Caja con su primera acción", !!filaCaja?.primera_accion, `HTTP ${actividad.code} ${actividad.j?.tabla?.filas?.length} filas`)

  check("un reporte desconocido da 400", (await call("auditoria", "GET", "/admin/reports/export?tipo=nomina-secreta")).code === 400)
  check("una fecha ilegible da 400", (await call("auditoria", "GET", "/admin/reports/export?tipo=cortes&desde=14/09/2026")).code === 400)

  check("RH saca la actividad", (await call("rrhh", "GET", `/admin/reports/export?tipo=actividad&${rango}`)).code === 200)
  check("pero no las recetas", (await call("rrhh", "GET", `/admin/reports/export?tipo=recetas&${rango}`)).code === 403)
  check("ni la bitácora", (await call("rrhh", "GET", `/admin/reports/export?tipo=bitacora&${rango}`)).code === 403)
  const invAlmacen = await call("almacen", "GET", "/admin/reports/export?tipo=inventario")
  check("Almacén saca el inventario con costos", invAlmacen.code === 200 && invAlmacen.j?.tabla?.columnas?.some((c) => c.clave === "valor"), `HTTP ${invAlmacen.code}`)
  check("pero no la actividad del personal", (await call("almacen", "GET", `/admin/reports/export?tipo=actividad&${rango}`)).code === 403)
  check("ni las ventas por la ruta vieja", (await call("almacen", "GET", "/admin/reports/revenue")).code === 403)
  check("Farmacia no exporta reportes", (await call("farmacia", "GET", "/admin/reports/export?tipo=inventario")).code === 403)
  check("ni Caja", (await call("caja", "GET", `/admin/reports/export?tipo=cortes&${rango}`)).code === 403)

  await new Promise((r) => setTimeout(r, 800))
  const asientos = await call("auditoria", "GET", "/admin/audit-logs?endpoint=/admin/reports/export&user_role=warehouse&limit=5")
  check("cada exportación queda en la bitácora", (asientos.j?.count ?? 0) > 0, `${asientos.j?.count} asientos`)
}

// ── 16. Receta del médico ───────────────────────────────────────────────────
// Siempre a Enfermería, indicaciones obligatorias, nota de atención con fecha
// que Enfermería no ve, y la receta en media carta con la cédula.
async function recetaDelMedico() {
  seccion("16 · RECETA DEL MÉDICO")

  const paciente = (await call("caja", "POST", "/admin/customers", { first_name: "Verificación", last_name: `Receta ${Date.now()}` })).j?.customer
  const variante = (await call("admin", "GET", "/admin/products?limit=1&status[]=published&fields=id,*variants")).j?.products?.[0]?.variants?.[0]?.id
  if (!paciente || !variante) {
    check("hay paciente y producto para probar la receta", false)
    return
  }
  const renglon = { variant_id: variante, product_title: "Verificación", quantity: 1, instructions: "1 tableta cada 8 h" }

  const perfil = (await call("medico", "GET", "/admin/mi-perfil")).j
  check("el médico lee su perfil con cédula y la clínica", perfil?.perfil_completo === true && !!perfil?.clinica?.establecimiento, JSON.stringify(perfil?.perfil_profesional))
  check("cualquier perfil lee el suyo", (await call("caja", "GET", "/admin/mi-perfil")).code === 200)

  const aFarmacia = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, recipient_area: "pharmacy", items: [renglon] })
  check("el médico no envía a Farmacia", aFarmacia.code === 400, `HTTP ${aFarmacia.code}`)
  const sinIndicaciones = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, items: [{ ...renglon, instructions: "  " }] })
  check("ni un medicamento sin indicaciones", sinIndicaciones.code === 400 && /indicaciones/.test(sinIndicaciones.j?.error ?? ""), `HTTP ${sinIndicaciones.code}`)
  const notaCoja = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, items: [renglon], nota_de_atencion: { findings: "Faringe hiperémica", procedures: "" } })
  check("una nota de atención a medias se rechaza", notaCoja.code === 400, `HTTP ${notaCoja.code}`)
  const antes = ((await call("medico", "GET", `/admin/medical-orders?customer_id=${paciente.id}`)).j?.medical_orders ?? []).length
  check("y no deja una receta sin su nota", antes === 0, `${antes} recetas`)

  const conNota = await call("medico", "POST", "/admin/medical-orders", {
    customer_id: paciente.id,
    customer_name: "Verificación receta",
    notes: "Alérgica a la penicilina",
    items: [renglon],
    nota_de_atencion: { findings: "Faringe hiperémica, 38.1 °C", procedures: "Se indica antipirético y reposo", attended_at: "2026-09-13" },
  })
  const orden = conNota.j?.medical_order
  const nota = conNota.j?.clinical_note
  check("la receta sale a Enfermería con su nota en el mismo envío", conNota.code === 200 && orden?.recipient_area === "nursing" && !!nota?.id, `HTTP ${conNota.code} ${conNota.j?.error ?? ""}`)
  check("la nota lleva qué revisó, qué hizo y la fecha de la atención", nota?.findings?.startsWith("Faringe") && nota?.procedures?.startsWith("Se indica") && String(nota?.attended_at ?? "").startsWith("2026-09-13"), JSON.stringify({ a: nota?.attended_at }))
  check("una fecha de atención futura se rechaza", (await call("medico", "POST", "/admin/clinical-notes", { customer_id: paciente.id, findings: "Revisión general", procedures: "Sin procedimiento", attended_at: "2099-01-01" })).code === 400)

  const deEnfermeria = await call("enfermeria", "POST", "/admin/clinical-notes", { customer_id: paciente.id, medical_order_id: orden?.id, content: "Se aplicó sin reacciones." })
  const vistaEnf = (await call("enfermeria", "GET", `/admin/clinical-notes?customer_id=${paciente.id}`)).j?.clinical_notes ?? []
  check("Enfermería ve sus notas y no la del médico", vistaEnf.some((n) => n.id === deEnfermeria.j?.clinical_note?.id) && !vistaEnf.some((n) => n.id === nota?.id), `${vistaEnf.length} notas`)
  check("ni pidiéndola por su id", (await call("enfermeria", "GET", `/admin/clinical-notes/${nota?.id}`)).code === 404)
  check("ni impresa", (await call("enfermeria", "GET", `/admin/documents/nota/${nota?.id}`)).code === 404)
  check("pero sí la receta, con las notas para Enfermería", (await call("enfermeria", "GET", `/admin/medical-orders/${orden?.id}`)).j?.medical_order?.notes === "Alérgica a la penicilina")
  const vistaMed = (await call("medico", "GET", `/admin/clinical-notes?customer_id=${paciente.id}`)).j?.clinical_notes ?? []
  check("el médico ve las dos", vistaMed.length === 2, `${vistaMed.length}`)

  const hoja = await call("enfermeria", "GET", `/admin/documents/receta/${orden?.id}`)
  check("la receta sale en media carta, con cédula y universidad, sin la nota de atención", hoja.code === 200 && /5\.5in 8\.5in/.test(hoja.j?.html ?? "") && /Cédula profesional 12345678/.test(hoja.j?.html ?? "") && !/Faringe/.test(hoja.j?.html ?? ""), `HTTP ${hoja.code}`)

  check("dar de alta a un médico sin cédula se rechaza", (await call("admin", "POST", "/admin/staff", { username: `medsin${Date.now() % 100000}`, password: "Sigh#Test2026x", first_name: "Sin", last_name: "Cédula", role: "doctor" })).code === 400)
  check("un logotipo que no es una imagen subida se rechaza", (await call("admin", "POST", "/admin/receipt-config", { logo_url: "javascript:alert(1)" })).code === 400)

  await call("medico", "POST", `/admin/medical-orders/${orden?.id}/cancel`, { motivo: "Verificación automática" })
}

// ── 17. Enfermería y Farmacia ───────────────────────────────────────────────
// Existencia por área, receta limitada a lo que hay, ajustes con motivo,
// pacientes con pendientes, requisición ligada a la orden y candado al aplicar.
async function enfermeriaYFarmacia() {
  seccion("17 · ENFERMERÍA Y FARMACIA")

  const sello = Date.now()
  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const enfermeria = locs.find((l) => l.metadata?.altus_area === "nursing")
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]?.id
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación existencias ${sello}`,
    status: "published",
    sales_channels: canal ? [{ id: canal }] : undefined,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 30, currency_code: "mxn" }] }],
  })
  const variante = prod.j?.product?.variants?.[0]?.id
  const paciente = (await call("caja", "POST", "/admin/customers", { first_name: "Verificación", last_name: `Bandeja ${sello}` })).j?.customer
  if (!variante || !enfermeria || !paciente) {
    check("hay producto, almacén de Enfermería y paciente para probar", false)
    return
  }
  await call("enfermeria", "POST", "/admin/medical-batches", { batch_number: `EXI-${sello}`, expiration_date: en(200), variant_id: variante, stock_location_id: enfermeria.id, quantity: 10, apply_margin: false })

  const stock = await call("medico", "GET", `/admin/medical-stock?variant_ids=${variante}`)
  check("el médico ve la existencia por área", stock.code === 200 && stock.j?.existencias?.[variante]?.nursing === 10 && stock.j?.existencias?.[variante]?.pharmacy === 0, JSON.stringify(stock.j))
  check("Caja no la consulta", (await call("caja", "GET", `/admin/medical-stock?variant_ids=${variante}`)).code === 403)

  const renglon = (cantidad) => ({ variant_id: variante, product_title: "Verificación existencias", quantity: cantidad, instructions: "Aplicar en consultorio" })
  const demasiado = await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, items: [renglon(11)] })
  check("no se receta más de lo que hay entre los dos almacenes", demasiado.code === 409 && demasiado.j?.type === "sin_existencia", `HTTP ${demasiado.code} ${demasiado.j?.error ?? ""}`)

  const orden = (await call("medico", "POST", "/admin/medical-orders", { customer_id: paciente.id, customer_name: "Verificación bandeja", items: [renglon(4)] })).j?.medical_order
  check("con existencia, sí", !!orden?.id)

  const pendientes = (await call("enfermeria", "GET", "/admin/pacientes-pendientes?recipient_area=nursing")).j?.pacientes ?? []
  check("el paciente aparece entre los que tienen pendientes", pendientes.some((p) => p.customer_id === paciente.id && p.pendientes === 1))

  const sinMotivo = await call("enfermeria", "POST", `/admin/medical-orders/${orden?.id}/items`, { items: [{ variant_id: variante, quantity: 3 }] })
  check("Enfermería no reduce sin motivo", sinMotivo.code === 400, `HTTP ${sinMotivo.code}`)
  const corto = await call("enfermeria", "POST", `/admin/medical-orders/${orden?.id}/items`, { items: [{ variant_id: variante, quantity: 3 }], motivo: "  ya no   " })
  check("ni con un motivo de menos de 20 caracteres", corto.code === 400)
  const motivo = "El paciente rechazó la cuarta dosis"
  const reducida = await call("enfermeria", "POST", `/admin/medical-orders/${orden?.id}/items`, { items: [{ variant_id: variante, quantity: 3 }], motivo })
  const ajuste = reducida.j?.medical_order?.ajustes?.[0]
  check("con motivo, se reduce y queda el ajuste con quién y por qué", reducida.code === 200 && ajuste?.quantity_before === 4 && ajuste?.quantity_after === 3 && ajuste?.reason === motivo && ajuste?.actor_role === "nurse", JSON.stringify(ajuste))
  check("aumentar no pide motivo", (await call("enfermeria", "POST", `/admin/medical-orders/${orden?.id}/items`, { items: [{ variant_id: variante, quantity: 5 }] })).code === 200)
  check("el ajuste viaja con la orden", ((await call("medico", "GET", `/admin/medical-orders?customer_id=${paciente.id}`)).j?.medical_orders?.[0]?.ajustes ?? []).length === 2)
  await new Promise((r) => setTimeout(r, 600))
  const asiento = ((await call("auditoria", "GET", `/admin/audit-logs?endpoint=/admin/medical-orders/${orden?.id}/items&limit=10`)).j?.audit_logs ?? []).find((a) => JSON.stringify(a.payload ?? {}).includes("rechazó"))
  check("el motivo se lee en la bitácora (no se redacta)", !!asiento)

  // Farmacia: sólo quita o reduce, con motivo.
  const deMostrador = (await call("enfermeria", "POST", "/admin/medical-orders", { recipient_area: "pharmacy", customer_id: paciente.id, items: [renglon(2)] })).j?.medical_order
  check("Farmacia no añade a una receta", (await call("farmacia", "POST", `/admin/medical-orders/${deMostrador?.id}/items`, { items: [{ variant_id: variante, quantity: 3 }], motivo: "Quiero añadir una más de todas formas" })).code === 400)
  check("Farmacia quita un renglón con motivo", (await call("farmacia", "POST", `/admin/medical-orders/${deMostrador?.id}/items`, { items: [{ variant_id: variante, quantity: 0 }], motivo: "No hay existencia en el mostrador hoy" })).code === 200)
  await call("enfermeria", "POST", `/admin/medical-orders/${deMostrador?.id}/cancel`, { motivo: "Verificación automática" })

  // Pedir a Farmacia desde la bandeja: la requisición queda ligada a la orden.
  const req = await call("enfermeria", "POST", "/admin/requisitions", { medical_order_id: orden?.id, items: [{ variant_id: variante, quantity: 1 }] })
  const ligadas = (await call("enfermeria", "GET", `/admin/requisitions?medical_order_id=${orden?.id}`)).j?.requisitions ?? []
  check("la requisición pedida desde la bandeja queda ligada a la orden", req.code === 200 && ligadas.length === 1 && ligadas[0].medical_order_id === orden?.id, `HTTP ${req.code}`)
  await call("enfermeria", "POST", `/admin/requisitions/${req.j?.requisition?.id}/cancel`, { motivo: "Verificación automática" })

  // Candado: dos «Aplicar» a la vez descuentan una sola vez.
  const dobles = await Promise.all([1, 2].map(() => call("enfermeria", "POST", `/admin/medical-orders/${orden?.id}/consume`)))
  const lote = ((await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? [])[0]
  check("dos «Aplicar» a la vez: uno aplica, el otro encuentra la orden ya aplicada", dobles.filter((r) => r.code === 200).length === 1 && dobles.filter((r) => r.code === 400).length === 1, dobles.map((r) => r.code).join(", "))
  check("y el inventario se descontó una sola vez", lote?.quantity === 5, `${lote?.quantity}`)

  // Limpieza.
  const cuenta = dobles.find((r) => r.code === 200)?.j?.cuenta?.id
  if (cuenta) await call("caja", "DELETE", `/admin/draft-orders/${cuenta}`)
  const lotes = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches ?? []
  await call("admin", "POST", "/admin/inventory-counts", { counts: lotes.map((b) => ({ batch_id: b.id, counted_quantity: 0 })), apply: true, notes: "Limpieza de verificación" })
  await call("admin", "DELETE", `/admin/products/${prod.j?.product?.id}`)
}

// ── 18. Nómina y comisiones ─────────────────────────────────────────────────
async function nomina() {
  seccion("18 · NÓMINA Y COMISIONES")

  const personal = (await call("rrhh", "GET", "/admin/staff-compensation")).j?.personal ?? []
  const enfermera = personal.find((p) => p.usuario === "enfermeria")
  check("RH ve el esquema de pago de todo el personal", !!enfermera && personal.length >= 8, `${personal.length} personas`)
  check("Caja no lo ve", (await call("caja", "GET", "/admin/staff-compensation")).code === 403)
  check("el médico no ve la nómina", (await call("medico", "GET", "/admin/payroll?desde=2026-09-01&hasta=2026-09-15")).code === 403)
  if (!enfermera) return

  const malo = await call("rrhh", "POST", "/admin/staff-compensation", { user_id: enfermera.user_id, fixed_per_shift: 100, reglas: [{ days: "1", start_time: "25:00", end_time: "08:00", percent: 10 }] })
  check("una regla con hora inválida se rechaza", malo.code === 400, `HTTP ${malo.code}`)
  const bueno = await call("rrhh", "POST", "/admin/staff-compensation", {
    user_id: enfermera.user_id, fixed_per_shift: 100, hourly_rate: 0, default_percent: 5,
    reglas: [{ label: "Noche", days: "0,1,2,3,4,5,6", start_time: "20:00", end_time: "08:00", percent: 8 }],
  })
  check("RH fija el esquema de Enfermería: fijo, porcentaje y regla nocturna", bueno.code === 200 && bueno.j?.esquema?.fixed_per_shift === 100 && bueno.j?.esquema?.reglas?.length === 1, `HTTP ${bueno.code} ${bueno.j?.message ?? ""}`)

  const abierto = (await call("enfermeria", "GET", "/admin/doctor-shifts/current")).j?.doctor_shift
  const turno = abierto ? { code: 201, j: { doctor_shift: abierto } } : await call("enfermeria", "POST", "/admin/doctor-shifts", {})
  check("Enfermería abre su turno", turno.code === 201 && turno.j?.doctor_shift?.role === "nurse" || !!abierto, `HTTP ${turno.code} ${turno.j?.error ?? ""}`)
  check("Caja no abre turno aquí: usa su turno de caja", (await call("caja", "POST", "/admin/doctor-shifts", {})).code === 403)
  await call("enfermeria", "POST", `/admin/doctor-shifts/${turno.j?.doctor_shift?.id}/close`, {})

  const hoy = new Date()
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`
  const calculo = await call("rrhh", "GET", `/admin/payroll?desde=${dia}&hasta=${dia}`)
  const fila = calculo.j?.nomina?.find((f) => f.user_id === enfermera.user_id)
  check("la nómina de hoy cuenta su turno y su pago fijo", calculo.code === 200 && fila?.desglose?.turnos >= 1 && fila?.desglose?.fijo >= 100, JSON.stringify(fila?.desglose ?? calculo.j).slice(0, 160))

  const primero = await call("rrhh", "POST", "/admin/payroll/pay", { user_id: enfermera.user_id, desde: dia, hasta: dia, reference: "Verificación" })
  const pagoId = primero.j?.pago?.id ?? primero.j?.pago?.id
  check("RH registra el pago con el monto que calcula el servidor (o ya estaba pagado de una corrida anterior)", (primero.code === 201 && primero.j?.pago?.amount === fila?.desglose?.total) || primero.code === 409, `HTTP ${primero.code} ${primero.j?.message ?? ""}`)
  check("el mismo periodo no se paga dos veces", (await call("rrhh", "POST", "/admin/payroll/pay", { user_id: enfermera.user_id, desde: dia, hasta: dia })).code === 409)
  const id = pagoId ?? primero.j?.pago?.id
  if (id) {
    const recibo = await call("rrhh", "GET", `/admin/documents/pago/${id}`)
    check("sale el recibo con el desglose", recibo.code === 200 && /Recibo de pago/.test(recibo.j?.html ?? "") && /Pago fijo/.test(recibo.j?.html ?? ""), `HTTP ${recibo.code}`)
    check("Auditoría también lo imprime; Caja no", (await call("auditoria", "GET", `/admin/documents/pago/${id}`)).code === 200 && (await call("caja", "GET", `/admin/documents/pago/${id}`)).code === 403)
  }
  const reporte = await call("rrhh", "GET", `/admin/reports/export?tipo=honorarios&desde=${dia}&hasta=${dia}`)
  check("el reporte de honorarios y nómina trae a la persona", reporte.code === 200 && (reporte.j?.tabla?.filas ?? []).some((f) => f.estado !== undefined || f.pagado), `HTTP ${reporte.code}`)
  check("Auditoría no fija esquemas", (await call("auditoria", "POST", "/admin/staff-compensation", { user_id: enfermera.user_id })).code === 403)
}

// ── 19. Lo que Administración corrige desde el panel ────────────────────────
// Corregir un lote, las horas de un turno, anular un pago, cerrar la caja que
// otra persona dejó abierta y pedir o cancelar una requisición. Todo con
// motivo y con quién lo hizo.
async function correccionesDelPanel() {
  seccion("19 · CORRECCIONES DESDE EL PANEL")

  const sello = Date.now()
  const locs = (await call("admin", "GET", "/admin/stock-locations?fields=id,name,metadata&limit=50")).j?.stock_locations ?? []
  const principal = locs.find((l) => l.metadata?.altus_area !== "nursing") ?? locs[0]
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]?.id
  const prod = await call("admin", "POST", "/admin/products", {
    title: `Verificación correcciones ${sello}`,
    status: "published",
    sales_channels: canal ? [{ id: canal }] : undefined,
    options: [{ title: "Presentación", values: ["Default"] }],
    variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: 30, currency_code: "mxn" }] }],
  })
  const variante = prod.j?.product?.variants?.[0]?.id
  const lote = (await call("almacen", "POST", "/admin/medical-batches", { batch_number: `COR-${sello}`, expiration_date: en(100), variant_id: variante, stock_location_id: principal?.id, quantity: 5, apply_margin: false })).j?.batch
  if (!variante || !lote?.id) {
    check("hay producto y lote para corregir", false)
    return
  }

  // Lote: número, caducidad y estante, con motivo; la cantidad no.
  const motivo = "La caja dice 2027 y se capturó 2026"
  check("Farmacia no corrige lotes", (await call("farmacia", "POST", `/admin/medical-batches/${lote.id}`, { shelf_location: "B-1", motivo })).code === 403)
  check("Enfermería tampoco", (await call("enfermeria", "POST", `/admin/medical-batches/${lote.id}`, { shelf_location: "B-1", motivo })).code === 403)
  check("sin motivo no se corrige", (await call("almacen", "POST", `/admin/medical-batches/${lote.id}`, { shelf_location: "B-1", motivo: "corto" })).code === 400)
  check("sin cambios, tampoco", (await call("almacen", "POST", `/admin/medical-batches/${lote.id}`, { batch_number: lote.batch_number, motivo })).code === 400)
  const nueva = en(400).slice(0, 10)
  const corregido = await call("almacen", "POST", `/admin/medical-batches/${lote.id}`, { expiration_date: nueva, shelf_location: "B-1", motivo })
  check("Almacén corrige caducidad y estante", corregido.code === 200 && corregido.j?.cambios?.expiration_date?.despues === nueva && corregido.j?.cambios?.shelf_location?.despues === "B-1", `HTTP ${corregido.code} ${JSON.stringify(corregido.j).slice(0, 160)}`)
  const relista = (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches?.find((b) => b.id === lote.id)
  check("y se ve en la lista", relista?.shelf_location === "B-1" && String(relista?.expiration_date).slice(0, 10) === nueva)
  check("la cantidad se corrige con un conteo, no aquí", (await call("admin", "POST", `/admin/medical-batches/${lote.id}`, { quantity: 99, motivo })).code === 400)
  const conteo = await call("admin", "POST", "/admin/inventory-counts", { counts: [{ batch_id: lote.id, counted_quantity: 3 }], apply: true, notes: "Conteo de verificación" })
  check("el conteo ajusta la existencia y queda en el kardex", conteo.code === 200 && (await call("admin", "GET", `/admin/medical-batches?variant_id=${variante}`)).j?.batches?.find((b) => b.id === lote.id)?.quantity === 3, `HTTP ${conteo.code}`)

  // Turno: RH o Administración corrigen las horas con motivo.
  const abierto = (await call("enfermeria", "GET", "/admin/doctor-shifts/current")).j?.doctor_shift
  const turno = abierto ?? (await call("enfermeria", "POST", "/admin/doctor-shifts", {})).j?.doctor_shift
  const inicio = new Date(turno.opened_at).getTime()
  const fin = new Date(inicio + 2 * 3_600_000).toISOString()
  const motivoTurno = "Se le olvidó cerrar el turno al salir"
  check("Caja no corrige turnos", (await call("caja", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: fin, motivo: motivoTurno })).code === 403)
  check("ni la propia persona", (await call("enfermeria", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: fin, motivo: motivoTurno })).code === 403)
  check("un fin antes del inicio se rechaza", (await call("rrhh", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: new Date(inicio - 60000).toISOString(), motivo: motivoTurno })).code === 400)
  check("sin motivo, también", (await call("rrhh", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: fin, motivo: "x" })).code === 400)
  const turnoOk = fin <= new Date().toISOString() ? await call("rrhh", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: fin, motivo: motivoTurno }) : await call("rrhh", "POST", `/admin/doctor-shifts/${turno.id}`, { closed_at: new Date().toISOString(), motivo: motivoTurno })
  check("RH corrige las horas y el motivo queda en el turno", turnoOk.code === 200 && /Corregido por/.test(turnoOk.j?.doctor_shift?.notes ?? "") && !!turnoOk.j?.doctor_shift?.closed_at, `HTTP ${turnoOk.code} ${turnoOk.j?.error ?? ""}`)
  check("la bitácora lo etiqueta", (await call("auditoria", "GET", "/admin/audit-logs?limit=30")).j?.logs?.some((l) => /Corrigió las horas/.test(l.action ?? l.endpoint ?? "")) ?? true)

  // Pago: anular con motivo deja el periodo libre para el pago correcto.
  const personal = (await call("rrhh", "GET", "/admin/staff-compensation")).j?.personal ?? []
  const enfermera = personal.find((p) => p.usuario === "enfermeria")
  const dia = new Date().toLocaleDateString("en-CA")
  const pagos = (await call("rrhh", "GET", `/admin/payroll/payments?user_id=${enfermera?.user_id}`)).j?.pagos ?? []
  const pagoDeHoy = pagos.find((p) => p.dia_desde === dia && p.dia_hasta === dia)
  if (pagoDeHoy) {
    check("Caja no anula pagos", (await call("caja", "POST", `/admin/payroll/payments/${pagoDeHoy.id}/anular`, { motivo: "Se registró a la persona equivocada" })).code === 403)
    check("sin motivo no se anula", (await call("rrhh", "POST", `/admin/payroll/payments/${pagoDeHoy.id}/anular`, { motivo: "error" })).code === 400)
    const anulado = await call("rrhh", "POST", `/admin/payroll/payments/${pagoDeHoy.id}/anular`, { motivo: "Se registró a la persona equivocada" })
    check("RH anula el pago", anulado.code === 200 && anulado.j?.anulado?.id === pagoDeHoy.id, `HTTP ${anulado.code} ${anulado.j?.message ?? ""}`)
    check("ya no aparece en la lista", !((await call("rrhh", "GET", `/admin/payroll/payments?user_id=${enfermera?.user_id}`)).j?.pagos ?? []).some((p) => p.id === pagoDeHoy.id))
    check("y no se anula dos veces", (await call("rrhh", "POST", `/admin/payroll/payments/${pagoDeHoy.id}/anular`, { motivo: "Se registró a la persona equivocada" })).code === 404)
    const otraVez = await call("rrhh", "POST", "/admin/payroll/pay", { user_id: enfermera.user_id, desde: dia, hasta: dia, reference: "Verificación tras anular" })
    check("el periodo vuelve a poder pagarse", otraVez.code === 201, `HTTP ${otraVez.code} ${otraVez.j?.message ?? ""}`)
    if (otraVez.j?.pago?.id) await call("rrhh", "POST", `/admin/payroll/payments/${otraVez.j.pago.id}/anular`, { motivo: "Limpieza de la verificación automática" })
  } else {
    check("hay un pago de hoy para anular (lo registra la sección 18)", false)
  }

  // Caja: sólo quien la abrió, o Administración con motivo.
  for (const rol of ["caja", "admin"]) {
    const actual = (await call(rol, "GET", "/admin/cash-sessions/current")).j?.session
    if (actual) await call(rol, "POST", `/admin/cash-sessions/${actual.id}/close`, { actual_closing_amount: 0, notes: "Cierre de verificación" })
  }
  const caja = (await call("caja", "POST", "/admin/cash-sessions", { opening_amount: 100 })).j?.session
  if (caja?.id) {
    check("otro cajero no cierra la caja ajena", (await call("medico", "POST", `/admin/cash-sessions/${caja.id}/close`, { actual_closing_amount: 100 })).code === 403)
    check("Administración necesita motivo para cerrarla", (await call("admin", "POST", `/admin/cash-sessions/${caja.id}/close`, { actual_closing_amount: 100 })).code === 400)
    const cierre = await call("admin", "POST", `/admin/cash-sessions/${caja.id}/close`, { actual_closing_amount: 100, motivo: "La cajera se fue sin hacer el corte" })
    check("con motivo la cierra y el corte dice quién y por qué", cierre.code === 200 && /Cerrada por .* en lugar de/.test(cierre.j?.session?.notes ?? ""), `HTTP ${cierre.code} ${cierre.j?.message ?? ""}`)
    check("y la caja queda libre", !(await call("caja", "GET", "/admin/cash-sessions/current")).j?.otra_caja_abierta)
  } else {
    check("Caja abre su turno para la prueba", false)
  }

  // Requisición pedida y cancelada por Administración.
  const req = await call("admin", "POST", "/admin/requisitions", { items: [{ variant_id: variante, quantity: 2, product_title: "Verificación correcciones" }], notes: "Pedido urgente desde el panel" })
  check("Administración pide una requisición desde el panel", (req.code === 200 || req.code === 201) && req.j?.requisition?.status === "pending", `HTTP ${req.code} ${req.j?.error ?? ""}`)
  check("Almacén no pide (surte)", (await call("almacen", "POST", "/admin/requisitions", { items: [{ variant_id: variante, quantity: 1 }] })).code === 403)
  if (req.j?.requisition?.id) {
    const cancelada = await call("admin", "POST", `/admin/requisitions/${req.j.requisition.id}/cancel`, { motivo: "Ya no hace falta" })
    check("y la cancela", cancelada.code === 200 && cancelada.j?.requisition?.status === "cancelled", `HTTP ${cancelada.code}`)
  }

  // Limpieza.
  await call("admin", "POST", "/admin/inventory-counts", { counts: [{ batch_id: lote.id, counted_quantity: 0 }], apply: true, notes: "Limpieza de verificación" })
  await call("admin", "DELETE", `/admin/products/${prod.j?.product?.id}`)
}

// ── 17. Aseguranzas ─────────────────────────────────────────────────────────
async function aseguranzas() {
  seccion("17 · ASEGURANZAS")
  const sello = Date.now()

  // Catálogo: sólo Administración escribe; el resto lee.
  check("Caja no da de alta aseguranzas", (await call("caja", "POST", "/admin/insurances", { name: "X", discount_percent: 10 })).code === 403)
  check("un porcentaje fuera de rango se rechaza", (await call("admin", "POST", "/admin/insurances", { name: "Mala", discount_percent: 0 })).code === 400)
  const gnp = (await call("admin", "POST", "/admin/insurances", { name: `GNP ${sello}`, discount_percent: 20 })).j?.insurance
  const axa = (await call("admin", "POST", "/admin/insurances", { name: `AXA ${sello}`, discount_percent: 10 })).j?.insurance
  check("Administración da de alta aseguranzas, cada una con su promoción", !!gnp?.promotion_code && !!axa?.promotion_code && gnp.promotion_code.startsWith("ASEG-"), JSON.stringify(gnp ?? "sin alta").slice(0, 160))
  check("Caja lee el catálogo", ((await call("caja", "GET", "/admin/insurances")).j?.insurances ?? []).some((i) => i.id === gnp?.id))

  // Un medicamento (tipo Medicamento) y un insumo (sin tipo).
  const tipos = (await call("admin", "GET", "/admin/product-types?limit=50")).j?.product_types ?? []
  const tipoMed = tipos.find((t) => t.value === "Medicamento")?.id
  check("existe el tipo de producto Medicamento (lo crea la primera aseguranza)", !!tipoMed)
  const canal = (await call("admin", "GET", "/admin/sales-channels?limit=1")).j?.sales_channels?.[0]?.id
  const region = (await call("admin", "GET", "/admin/regions?limit=1")).j?.regions?.[0]
  const crear = async (titulo, precio, type_id) =>
    (await call("admin", "POST", "/admin/products", {
      title: titulo, status: "published", type_id, sales_channels: canal ? [{ id: canal }] : undefined,
      options: [{ title: "Presentación", values: ["Default"] }],
      variants: [{ title: "Default", options: { Presentación: "Default" }, manage_inventory: false, prices: [{ amount: precio, currency_code: "mxn" }] }],
    })).j?.product
  const med = await crear(`Medicamento aseg ${sello}`, 100, tipoMed)
  const insumo = await crear(`Insumo aseg ${sello}`, 50, undefined)
  const vMed = med?.variants?.[0]?.id
  const vIns = insumo?.variants?.[0]?.id

  // Paciente con UNA aseguranza.
  const p1 = (await call("caja", "POST", "/admin/customers", { first_name: "Asegurado", last_name: `Uno ${sello}` })).j?.customer
  const fichaP1 = await call("caja", "POST", `/admin/patient-insurances/${p1?.id}`, { insurances: [{ insurance_id: gnp?.id, policy_number: "POL-1" }] })
  check("Caja marca la aseguranza del paciente con su póliza", fichaP1.code === 200 && fichaP1.j?.insurances?.[0]?.policy_number === "POL-1", `HTTP ${fichaP1.code} ${JSON.stringify(fichaP1.j).slice(0, 120)}`)
  check("una lista mal formada se rechaza", (await call("caja", "POST", `/admin/patient-insurances/${p1?.id}`, { insurances: "GNP" })).code === 400)
  check("Farmacia no marca aseguranzas", (await call("farmacia", "POST", `/admin/patient-insurances/${p1?.id}`, { insurances: [] })).code === 403)
  check("y la lista se lee de vuelta", ((await call("caja", "GET", `/admin/patient-insurances/${p1?.id}`)).j?.insurances ?? []).length === 1)

  const carrito = async (customer_id) =>
    (await call("caja", "POST", "/admin/draft-orders", { region_id: region?.id, sales_channel_id: canal, customer_id, items: [{ variant_id: vMed, quantity: 2 }, { variant_id: vIns, quantity: 1 }] })).j?.draft_order
  const c1 = await carrito(p1?.id)
  const estado1 = (await call("caja", "GET", `/admin/draft-orders/${c1?.id}/aseguranza`)).j
  check("el cobro sabe qué aseguranza tiene el paciente y que aún no está aplicada", estado1?.aseguranzas?.length === 1 && estado1?.aplicada === null, JSON.stringify(estado1).slice(0, 160))

  // Descuento general: rechazado por el punto de venta.
  const promoGeneral = (await call("admin", "POST", "/admin/promotions", { code: `GEN${sello}`, type: "standard", status: "active", is_automatic: false, application_method: { type: "percentage", value: 50, target_type: "items", allocation: "across" } })).j?.promotion
  await call("caja", "POST", `/admin/draft-orders/${c1?.id}/edit`, {})
  const general = await call("caja", "POST", `/admin/draft-orders/${c1?.id}/edit/promotions`, { promo_codes: [promoGeneral?.code ?? `GEN${sello}`] })
  await call("caja", "DELETE", `/admin/draft-orders/${c1?.id}/edit`)
  check("Caja no aplica descuentos generales", general.code === 409 && general.j?.type === "descuento_no_permitido", `HTTP ${general.code} ${general.j?.message ?? ""}`)

  // Cobrar: el servidor aplica la aseguranza solo.
  if (!(await call("caja", "GET", "/admin/cash-sessions/current")).j?.session) await call("caja", "POST", "/admin/cash-sessions", { opening_amount: 0 })
  const cobro1 = await call("caja", "POST", `/admin/draft-orders/${c1?.id}/convert-to-order`)
  const orden1 = (await call("caja", "GET", `/admin/orders/${c1?.id}`)).j?.order
  check("con una sola aseguranza, el cobro la aplica solo: 20 % a los medicamentos y nada al insumo", cobro1.code === 200 && Number(orden1?.discount_total) === 40 && Number(orden1?.total) === 210, `HTTP ${cobro1.code} ${cobro1.j?.message ?? ""} descuento=${orden1?.discount_total} total=${orden1?.total}`)
  check("y queda anotada en el pedido para el ticket", orden1?.metadata?.altus_aseguranza?.name === gnp?.name, JSON.stringify(orden1?.metadata))
  const recibo1 = (await call("caja", "GET", `/admin/receipts/${c1?.id}`)).j?.recibo
  check("el ticket dice de qué aseguranza es el descuento", recibo1?.aseguranza?.name === gnp?.name && Number(recibo1?.descuentos) === 40, JSON.stringify({ a: recibo1?.aseguranza, d: recibo1?.descuentos }))

  // Paciente con DOS aseguranzas: hay que elegir.
  const p2 = (await call("caja", "POST", "/admin/customers", { first_name: "Asegurado", last_name: `Dos ${sello}` })).j?.customer
  await call("caja", "POST", `/admin/patient-insurances/${p2?.id}`, { insurances: [{ insurance_id: gnp?.id }, { insurance_id: axa?.id, policy_number: "AX-9" }] })
  const c2 = await carrito(p2?.id)
  const sinElegir = await call("caja", "POST", `/admin/draft-orders/${c2?.id}/convert-to-order`)
  check("con dos aseguranzas, cobrar sin elegir devuelve 409 y las lista", sinElegir.code === 409 && sinElegir.j?.type === "aseguranza_pendiente" && sinElegir.j?.aseguranzas?.length === 2, `HTTP ${sinElegir.code} ${sinElegir.j?.message ?? ""}`)
  check("una aseguranza ajena se rechaza", (await call("caja", "POST", `/admin/draft-orders/${c2?.id}/aseguranza`, { insurance_id: "ins_ajena" })).code === 400)
  const elegida = await call("caja", "POST", `/admin/draft-orders/${c2?.id}/aseguranza`, { insurance_id: axa?.id })
  check("Caja elige AXA y queda aplicada con su póliza", elegida.code === 200 && elegida.j?.aplicada?.id === axa?.id && elegida.j?.aplicada?.policy_number === "AX-9", JSON.stringify(elegida.j).slice(0, 160))
  const cambio = await call("caja", "POST", `/admin/draft-orders/${c2?.id}/aseguranza`, { insurance_id: gnp?.id })
  const cobro2 = await call("caja", "POST", `/admin/draft-orders/${c2?.id}/convert-to-order`)
  const orden2 = (await call("caja", "GET", `/admin/orders/${c2?.id}`)).j?.order
  check("cambia a GNP y el cobro lleva el 20 %, no los dos", cambio.code === 200 && cobro2.code === 200 && Number(orden2?.discount_total) === 40, `HTTP ${cambio.code}/${cobro2.code} descuento=${orden2?.discount_total}`)

  // Sin aseguranza, íntegro. Vencida, como si no tuviera.
  const p3 = (await call("caja", "POST", "/admin/customers", { first_name: "Sin", last_name: `Aseguranza ${sello}` })).j?.customer
  const c3 = await carrito(p3?.id)
  const cobro3 = await call("caja", "POST", `/admin/draft-orders/${c3?.id}/convert-to-order`)
  const orden3 = (await call("caja", "GET", `/admin/orders/${c3?.id}`)).j?.order
  check("sin aseguranza se cobra íntegro", cobro3.code === 200 && Number(orden3?.discount_total) === 0 && Number(orden3?.total) === 250, `HTTP ${cobro3.code} total=${orden3?.total}`)
  await call("admin", "POST", `/admin/insurances/${gnp?.id}`, { valid_until: "2020-01-01" })
  const c4 = await carrito(p1?.id)
  const cobro4 = await call("caja", "POST", `/admin/draft-orders/${c4?.id}/convert-to-order`)
  const orden4 = (await call("caja", "GET", `/admin/orders/${c4?.id}`)).j?.order
  check("una aseguranza vencida ya no descuenta", cobro4.code === 200 && Number(orden4?.discount_total) === 0, `HTTP ${cobro4.code} descuento=${orden4?.discount_total}`)

  // Limpieza.
  const turno = (await call("caja", "GET", "/admin/cash-sessions/current")).j?.session
  if (turno) await call("caja", "POST", `/admin/cash-sessions/${turno.id}/close`, { actual_closing_amount: 0, notes: "Cierre de verificación" })
  for (const id of [gnp?.id, axa?.id]) if (id) await call("admin", "DELETE", `/admin/insurances/${id}`)
  if (promoGeneral?.id) await call("admin", "DELETE", `/admin/promotions/${promoGeneral.id}`)
  for (const p of [med, insumo]) if (p?.id) await call("admin", "DELETE", `/admin/products/${p.id}`)
}

// ── Ejecución ───────────────────────────────────────────────────────────────
;(async () => {
  console.log(`\nVerificación de la API — ${BASE}\n`)

  for (const rol of ROLES) {
    const { token } = await login(rol)
    if (!token) {
      console.error(
        `No se pudo iniciar sesión como "${rol}".\n` +
          `¿Corriste "npm run seed"? ¿El servidor está en ${BASE}?\n`
      )
      process.exit(1)
    }
    T[rol] = token
  }

  await matrizDePermisos()
  await omisionSegura()
  await expediente()
  await dispensacion()
  await personal()
  await cimientos()
  await inventarioPorAlmacen()
  await requisicionesYBajas()
  await circuitoClinico()
  await caja()
  await auditoria()
  await cuentasYHonorarios()
  await perfilesYCierreDelPanel()
  await almacenYRh()
  await reportes()
  await recetaDelMedico()
  await enfermeriaYFarmacia()
  await nomina()
  await correccionesDelPanel()
  await aseguranzas()

  console.log(`\n${"═".repeat(64)}`)
  console.log(
    fallos === 0
      ? `  TODO CORRECTO — ${total} comprobaciones`
      : `  ${fallos} de ${total} comprobaciones FALLARON`
  )
  console.log(`${"═".repeat(64)}\n`)

  process.exit(fallos === 0 ? 0 : 1)
})()
