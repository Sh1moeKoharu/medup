import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { AUDIT_LOGS_MODULE } from "../modules/audit-logs"
import { HONORARIOS_MODULE } from "../modules/honorarios"
import { MEDICAL_ORDERS_MODULE } from "../modules/medical-orders"
import { clasificarAccion } from "./acciones"
import { CONTEOS, resumirActividad, totalizarPorPersona, type FilaDeActividad } from "./actividad"
import { nombresDeAlmacenes } from "./almacenes"
import { claveDePeriodo, type Agrupacion } from "./caja"
import { ETIQUETA_TRAMO } from "./caducidades"
import { lotesProximosACaducar } from "./caducidades-servidor"
import { calcularResumen } from "./corte-de-caja"
import { calcularNomina } from "./nomina-servidor"
import { numeroDeEmpleado } from "./personal"
import { describirRango, REPORTES, type Tabla, type TipoDeReporte } from "./reportes"
import { canSeeCost, normalizeRole, roleLabel, type Role } from "./roles"
import { sinCostos, valorizarInventario } from "./valuacion"
import { sinVarianteUnica } from "../admin/lib/titulos"
import { ZONA_CLINICA } from "./zona-horaria"

/**
 * Junta los datos de cada reporte y los devuelve como `Tabla` (lib/reportes.ts).
 *
 * Tope de filas: los reportes son de un periodo, no del historial entero. Un
 * rango sin tope sobre la bitácora de un año se volvería lento sin avisar, así
 * que cada consulta lleva su techo y, si se alcanza, la hoja lo dice.
 */

export const TOPE_DE_FILAS = 20000

export type ConsultaDeReporte = {
  desde: string | null
  hasta: string | null
  rol?: string
  persona?: string
  almacen?: string
  agrupar?: string
  /** Quien lo pide: decide si ve costos. */
  actor_rol: Role | null
}

const rangoSobre = (campo: string, q: ConsultaDeReporte) => {
  if (!q.desde && !q.hasta) return {}
  const r: Record<string, string> = {}
  if (q.desde) r.$gte = q.desde
  if (q.hasta) r.$lte = q.hasta
  return { [campo]: r }
}

const redondear = (n: number) => Math.round(n * 100) / 100

const avisoDeTope = (n: number) => (n >= TOPE_DE_FILAS ? [`Se alcanzó el tope de ${TOPE_DE_FILAS} registros: acorta el periodo para ver todo.`] : [])

type Persona = { id: string; nombre: string; usuario: string; correo: string; rol: string; numero_empleado: string }

async function personal(container: MedusaContainer): Promise<Persona[]> {
  const users: any[] = await (container.resolve(Modules.USER) as any).listUsers({}, { take: 1000 })
  return users.map((u) => ({
    id: u.id,
    nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
    usuario: String(u.email ?? "").replace(/@sigh\.local$/, ""),
    correo: String(u.email ?? ""),
    rol: normalizeRole(u.metadata?.role) ?? "",
    numero_empleado: numeroDeEmpleado(u) ?? "",
  }))
}

/** ¿La persona coincide con lo que se buscó? Por usuario, nombre o número de empleado. */
function coincidePersona(p: { nombre?: string; usuario?: string; numero_empleado?: string }, buscado?: string): boolean {
  const b = String(buscado ?? "").trim().toLowerCase()
  if (!b) return true
  return [p.nombre, p.usuario, p.numero_empleado].some((v) => String(v ?? "").toLowerCase().includes(b))
}

// ── actividad ───────────────────────────────────────────────────────────────

async function actividad(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const bitacora: any = container.resolve(AUDIT_LOGS_MODULE)
  const honorarios: any = container.resolve(HONORARIOS_MODULE)

  const [personas, asientos, cajas, consultas] = await Promise.all([
    personal(container),
    bitacora.listAuditLogs(rangoSobre("created_at", q), {
      select: ["user_id", "user_email", "user_role", "user_employee_number", "method", "endpoint", "created_at"],
      take: TOPE_DE_FILAS,
      order: { created_at: "ASC" },
    }),
    query.graph({
      entity: "cash_session",
      fields: ["id", "cashier_id", "opened_at", "closed_at"],
      filters: rangoSobre("opened_at", q),
      pagination: { take: 5000 },
    }),
    honorarios.listDoctorShifts(rangoSobre("opened_at", q), { take: 5000 }),
  ])

  const sesiones: any[] = cajas.data ?? []
  const cobradoPorSesion: Record<string, number> = {}
  if (sesiones.length) {
    const { data: movs } = await query.graph({
      entity: "cash_movement",
      fields: ["session_id", "type", "amount"],
      filters: { session_id: sesiones.map((s) => s.id) },
      pagination: { take: 100000 },
    })
    for (const m of movs ?? []) {
      if (m.type === "sale") cobradoPorSesion[m.session_id] = (cobradoPorSesion[m.session_id] ?? 0) + Number(m.amount || 0)
      if (m.type === "refund") cobradoPorSesion[m.session_id] = (cobradoPorSesion[m.session_id] ?? 0) - Number(m.amount || 0)
    }
  }

  let filas: FilaDeActividad[] = resumirActividad({
    asientos,
    personas,
    turnos: [
      ...sesiones.map((s) => ({ user_id: s.cashier_id, tipo: "caja" as const, inicio: s.opened_at, fin: s.closed_at, cobrado: cobradoPorSesion[s.id] ?? 0 })),
      ...consultas.map((t: any) => ({ user_id: t.doctor_id, tipo: "consulta" as const, inicio: t.opened_at, fin: t.closed_at })),
    ],
  })

  const rol = q.rol ? normalizeRole(q.rol) : null
  filas = filas.filter((f) => (!rol || f.rol === rol) && coincidePersona(f, q.persona))

  const porPersona = q.agrupar === "persona"
  const lista = porPersona ? totalizarPorPersona(filas) : filas

  const columnas = [
    ...(porPersona ? [{ clave: "dias", etiqueta: "Días", tipo: "numero" as const }] : [{ clave: "dia", etiqueta: "Día", tipo: "fecha" as const }]),
    { clave: "nombre", etiqueta: "Persona" },
    { clave: "numero_empleado", etiqueta: "Nº empleado" },
    { clave: "rol", etiqueta: "Perfil" },
    { clave: "primera_accion", etiqueta: "Primera acción", tipo: "fechahora" as const },
    { clave: "ultima_accion", etiqueta: "Última acción", tipo: "fechahora" as const },
    { clave: "turnos", etiqueta: "Turnos", tipo: "numero" as const },
    { clave: "horas_en_turno", etiqueta: "Horas en turno", tipo: "horas" as const },
    { clave: "cobrado", etiqueta: "Cobrado en caja", tipo: "dinero" as const },
    { clave: "acciones", etiqueta: "Acciones", tipo: "numero" as const },
    ...CONTEOS.map((c) => ({ clave: `c_${c.clave}`, etiqueta: c.etiqueta, tipo: "numero" as const })),
  ]

  const planas = lista.map((f) => ({
    ...f,
    // En la vista por persona, el día de la primera columna no aplica.
    dia: porPersona ? undefined : f.dia,
    rol: f.rol ? roleLabel(f.rol) : "",
    ...Object.fromEntries(Object.entries(f.conteos).map(([k, v]) => [`c_${k}`, v])),
  }))

  const suma = (clave: string) => redondear(planas.reduce((s, f: any) => s + (Number(f[clave]) || 0), 0))
  const totales: Record<string, unknown> = { turnos: suma("turnos"), horas_en_turno: suma("horas_en_turno"), cobrado: suma("cobrado"), acciones: suma("acciones") }
  for (const c of CONTEOS) totales[`c_${c.clave}`] = suma(`c_${c.clave}`)

  return {
    titulo: REPORTES.actividad.etiqueta,
    subtitulo: `${describirRango(q)} · ${porPersona ? "por persona" : "por día"}`,
    columnas,
    filas: planas,
    totales,
    notas: [
      "Primera y última acción son lo que registró el sistema, no una checada de entrada y salida.",
      "Horas en turno: turnos de caja y de consulta, contados el día en que se abrieron. Un turno abierto cuenta hasta el momento del reporte.",
      ...avisoDeTope(asientos.length),
    ],
  }
}

// ── honorarios ──────────────────────────────────────────────────────────────

async function honorariosMedicos(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  // Sin periodo, el mes en curso: la nómina siempre es de un periodo.
  const ahora = new Date()
  const desde = q.desde ?? new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
  const hasta = q.hasta ?? ahora.toISOString()
  const filas = (await calcularNomina(container, { desde, hasta })).map((f) => ({
    persona: f.nombre,
    numero_empleado: f.numero_empleado ?? "",
    rol: f.rol ? roleLabel(f.rol) : "",
    turnos: f.desglose.turnos,
    horas: f.desglose.horas,
    fijo: f.desglose.fijo,
    por_hora: f.desglose.por_hora,
    base: f.desglose.base_comisionable,
    reglas: f.desglose.por_regla.map((r) => `${r.percent}% de ${r.base.toFixed(2)} (${r.etiqueta})`).join("; "),
    comision: f.desglose.comision,
    total: f.desglose.total,
    pagado: f.pagos.length ? "Pagado" : "Pendiente",
  }))
  const suma = (k: keyof (typeof filas)[number]) => redondear(filas.reduce((s, f) => s + (Number(f[k]) || 0), 0))
  return {
    titulo: REPORTES.honorarios.etiqueta,
    subtitulo: describirRango({ desde, hasta }),
    columnas: [
      { clave: "persona", etiqueta: "Persona" },
      { clave: "numero_empleado", etiqueta: "Nº empleado" },
      { clave: "rol", etiqueta: "Perfil" },
      { clave: "turnos", etiqueta: "Turnos", tipo: "numero" },
      { clave: "horas", etiqueta: "Horas", tipo: "horas" },
      { clave: "fijo", etiqueta: "Fijo", tipo: "dinero" },
      { clave: "por_hora", etiqueta: "Por hora", tipo: "dinero" },
      { clave: "base", etiqueta: "Base comisionable", tipo: "dinero" },
      { clave: "reglas", etiqueta: "Comisión por horario" },
      { clave: "comision", etiqueta: "Comisión", tipo: "dinero" },
      { clave: "total", etiqueta: "Total", tipo: "dinero" },
      { clave: "pagado", etiqueta: "Estado" },
    ],
    filas,
    totales: { turnos: suma("turnos"), horas: suma("horas"), fijo: suma("fijo"), por_hora: suma("por_hora"), base: suma("base"), comision: suma("comision"), total: suma("total") },
    notas: [
      "Médico: lo cobrado de sus recetas. Enfermería: lo cobrado de lo que aplicó. Caja: lo que cobró, menos devoluciones. Farmacia: lo surtido al precio vigente.",
      "Estado «Pagado»: hay un pago registrado que se traslapa con el periodo.",
    ],
  }
}

// ── cortes ──────────────────────────────────────────────────────────────────

async function cortes(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sesiones } = await query.graph({
    entity: "cash_session",
    fields: ["id", "status", "opened_at", "closed_at", "opening_amount", "actual_closing_amount", "cashier_name", "notes"],
    filters: rangoSobre("opened_at", q),
    pagination: { take: 5000, order: { opened_at: "ASC" } },
  })
  const ids = (sesiones ?? []).map((s: any) => s.id)
  const movimientos: Record<string, any[]> = {}
  if (ids.length) {
    const { data: movs } = await query.graph({
      entity: "cash_movement",
      fields: ["session_id", "type", "payment_method", "amount"],
      filters: { session_id: ids },
      pagination: { take: 100000 },
    })
    for (const m of movs ?? []) (movimientos[m.session_id] ??= []).push(m)
  }

  const filas = (sesiones ?? []).map((s: any) => {
    const r = calcularResumen(s.opening_amount, movimientos[s.id] ?? [])
    const contado = s.actual_closing_amount === null || s.actual_closing_amount === undefined ? null : Number(s.actual_closing_amount)
    return {
      cajero: s.cashier_name,
      apertura: s.opened_at,
      cierre: s.closed_at,
      estado: s.status === "open" ? "Abierta" : "Cerrada",
      fondo: r.opening_amount,
      efectivo: r.sales_cash,
      tarjeta: r.sales_card,
      transferencia: r.sales_transfer,
      ventas: r.sales_total,
      devoluciones: r.refunds_total,
      entradas: r.cash_in_total,
      salidas: r.cash_out_total,
      esperado: r.expected_cash_in_register,
      contado,
      diferencia: contado === null ? null : redondear(contado - r.expected_cash_in_register),
      notas: s.notes ?? "",
    }
  })

  const suma = (k: string) => redondear(filas.reduce((s: number, f: any) => s + (Number(f[k]) || 0), 0))
  return {
    titulo: REPORTES.cortes.etiqueta,
    subtitulo: describirRango(q),
    columnas: [
      { clave: "cajero", etiqueta: "Cajero" },
      { clave: "apertura", etiqueta: "Apertura", tipo: "fechahora" },
      { clave: "cierre", etiqueta: "Cierre", tipo: "fechahora" },
      { clave: "estado", etiqueta: "Estado" },
      { clave: "fondo", etiqueta: "Fondo", tipo: "dinero" },
      { clave: "efectivo", etiqueta: "Efectivo", tipo: "dinero" },
      { clave: "tarjeta", etiqueta: "Tarjeta", tipo: "dinero" },
      { clave: "transferencia", etiqueta: "Transferencia", tipo: "dinero" },
      { clave: "ventas", etiqueta: "Ventas", tipo: "dinero" },
      { clave: "devoluciones", etiqueta: "Devoluciones", tipo: "dinero" },
      { clave: "entradas", etiqueta: "Entradas", tipo: "dinero" },
      { clave: "salidas", etiqueta: "Salidas", tipo: "dinero" },
      { clave: "esperado", etiqueta: "Esperado", tipo: "dinero" },
      { clave: "contado", etiqueta: "Contado", tipo: "dinero" },
      { clave: "diferencia", etiqueta: "Diferencia", tipo: "dinero" },
      { clave: "notas", etiqueta: "Notas" },
    ],
    filas,
    totales: Object.fromEntries(["efectivo", "tarjeta", "transferencia", "ventas", "devoluciones", "entradas", "salidas", "diferencia"].map((k) => [k, suma(k)])),
  }
}

// ── ventas ──────────────────────────────────────────────────────────────────

async function ventas(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const agrupar = (["day", "week", "month"].includes(String(q.agrupar)) ? q.agrupar : "day") as Agrupacion
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: ["id", "status", "created_at", "total"],
    filters: { status: { $ne: "draft" }, ...rangoSobre("created_at", q) },
    pagination: { take: TOPE_DE_FILAS },
  })

  const porPeriodo = new Map<string, { periodo: string; desde: string; pedidos: number; cobrado: number }>()
  for (const p of pedidos ?? []) {
    if (["canceled", "cancelled"].includes(String(p.status))) continue
    const { periodo, desde } = claveDePeriodo(p.created_at, agrupar)
    const f = porPeriodo.get(periodo) ?? { periodo, desde, pedidos: 0, cobrado: 0 }
    f.pedidos++
    f.cobrado = redondear(f.cobrado + (Number(p.total) || 0))
    porPeriodo.set(periodo, f)
  }
  const filas = [...porPeriodo.values()]
    .sort((a, b) => (a.periodo < b.periodo ? -1 : 1))
    .map((f) => ({ ...f, promedio: f.pedidos ? redondear(f.cobrado / f.pedidos) : 0 }))

  const etiqueta = REPORTES.ventas.agrupaciones?.find((a) => a.valor === agrupar)?.etiqueta.toLowerCase() ?? ""
  return {
    titulo: REPORTES.ventas.etiqueta,
    subtitulo: `${describirRango(q)} · ${etiqueta}`,
    columnas: [
      { clave: "periodo", etiqueta: "Periodo" },
      { clave: "pedidos", etiqueta: "Pedidos", tipo: "numero" },
      { clave: "cobrado", etiqueta: "Importe", tipo: "dinero" },
      { clave: "promedio", etiqueta: "Ticket promedio", tipo: "dinero" },
    ],
    filas,
    totales: { pedidos: filas.reduce((s, f) => s + f.pedidos, 0), cobrado: redondear(filas.reduce((s, f) => s + f.cobrado, 0)) },
    notas: avisoDeTope((pedidos ?? []).length),
  }
}

// ── bitácora ────────────────────────────────────────────────────────────────

async function bitacora(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const servicio: any = container.resolve(AUDIT_LOGS_MODULE)
  const filtros: Record<string, unknown> = { ...rangoSobre("created_at", q) }
  const rol = q.rol ? normalizeRole(q.rol) : null
  if (rol) filtros.user_role = rol

  const asientos: any[] = await servicio.listAuditLogs(filtros, {
    select: ["user_email", "user_role", "user_employee_number", "method", "endpoint", "ip_address", "created_at"],
    take: TOPE_DE_FILAS,
    order: { created_at: "ASC" },
  })

  const filas = asientos
    .map((a) => ({
      fecha: a.created_at,
      usuario: String(a.user_email ?? "").replace(/@sigh\.local$/, ""),
      numero_empleado: a.user_employee_number ?? "",
      rol: a.user_role ? roleLabel(a.user_role) : "",
      accion: clasificarAccion(a.method, a.endpoint).descripcion,
      metodo: a.method,
      ruta: String(a.endpoint ?? "").split("?")[0],
      ip: a.ip_address ?? "",
    }))
    .filter((f) => coincidePersona({ usuario: f.usuario, numero_empleado: f.numero_empleado }, q.persona))

  return {
    titulo: REPORTES.bitacora.etiqueta,
    subtitulo: describirRango(q),
    columnas: [
      { clave: "fecha", etiqueta: "Fecha", tipo: "fechahora" },
      { clave: "usuario", etiqueta: "Usuario" },
      { clave: "numero_empleado", etiqueta: "Nº empleado" },
      { clave: "rol", etiqueta: "Perfil" },
      { clave: "accion", etiqueta: "Acción" },
      { clave: "metodo", etiqueta: "Método" },
      { clave: "ruta", etiqueta: "Ruta" },
      { clave: "ip", etiqueta: "IP" },
    ],
    filas,
    notas: ["El detalle de cada acción (lo enviado, sin datos clínicos) está en la bitácora del sistema, con su huella encadenada.", ...avisoDeTope(asientos.length)],
  }
}

// ── recetas ─────────────────────────────────────────────────────────────────

const ESTADO_RECETA: Record<string, string> = { pending: "Pendiente", dispensed: "Aplicada o surtida", cancelled: "Cancelada" }

async function recetas(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const servicio: any = container.resolve(MEDICAL_ORDERS_MODULE)
  const ordenes: any[] = await servicio.listMedicalOrders(rangoSobre("created_at", q), {
    relations: ["items"],
    take: TOPE_DE_FILAS,
    order: { created_at: "ASC" },
  })

  const ids = ordenes.map((o) => o.id)
  const ajustes: any[] = ids.length ? await servicio.listMedicalOrderAdjustments({ order_id: ids }, { take: TOPE_DE_FILAS, order: { created_at: "ASC" } }) : []
  const ajustesDe = new Map<string, string[]>()
  for (const a of ajustes) {
    const texto = `${a.actor_name ?? "Alguien"} (${a.actor_role ? roleLabel(a.actor_role) : "sin perfil"}): ${a.product_title ?? a.variant_id} ${a.quantity_before} → ${a.quantity_after}${a.reason ? `. Motivo: ${a.reason}` : ""}`
    ajustesDe.set(a.order_id, [...(ajustesDe.get(a.order_id) ?? []), texto])
  }

  const filas = ordenes.map((o) => ({
    folio: String(o.id).slice(-8).toUpperCase(),
    fecha: o.created_at,
    paciente: o.customer_name ?? "",
    prescriptor: o.creator_name ?? "",
    destino: o.recipient_area === "pharmacy" ? "Farmacia" : "Enfermería",
    estado: ESTADO_RECETA[o.status] ?? o.status,
    renglones: (o.items ?? []).length,
    unidades: (o.items ?? []).reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0),
    detalle: (o.items ?? []).map((i: any) => `${i.quantity}× ${i.product_title ?? i.variant_id}`).join("; "),
    atendio: o.dispensed_by_name ?? "",
    atendido_en: o.dispensed_at ?? null,
    observaciones: o.notes ?? "",
    ajustes: (ajustesDe.get(o.id) ?? []).join(" | "),
  }))

  return {
    titulo: REPORTES.recetas.etiqueta,
    subtitulo: describirRango(q),
    columnas: [
      { clave: "folio", etiqueta: "Folio" },
      { clave: "fecha", etiqueta: "Emitida", tipo: "fechahora" },
      { clave: "paciente", etiqueta: "Paciente" },
      { clave: "prescriptor", etiqueta: "Prescriptor" },
      { clave: "destino", etiqueta: "Destino" },
      { clave: "estado", etiqueta: "Estado" },
      { clave: "renglones", etiqueta: "Renglones", tipo: "numero" },
      { clave: "unidades", etiqueta: "Unidades", tipo: "numero" },
      { clave: "detalle", etiqueta: "Medicamentos" },
      { clave: "atendio", etiqueta: "Aplicó o surtió" },
      { clave: "atendido_en", etiqueta: "Cuándo", tipo: "fechahora" },
      { clave: "observaciones", etiqueta: "Notas para Enfermería" },
      { clave: "ajustes", etiqueta: "Ajustes y motivos" },
    ],
    filas,
    totales: { renglones: filas.reduce((s, f) => s + f.renglones, 0), unidades: filas.reduce((s, f) => s + f.unidades, 0) },
    notas: ["Contiene información clínica: resguárdese conforme a la NOM-004-SSA3-2012.", ...avisoDeTope(ordenes.length)],
  }
}

// ── inventario ──────────────────────────────────────────────────────────────

async function inventario(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  let r = await valorizarInventario(container, { stock_location_id: q.almacen || null, include_quarantined: true, por_almacen: true })
  const conCosto = canSeeCost(q.actor_rol)
  if (!conCosto) r = sinCostos(r)
  const nombres = await nombresDeAlmacenes(container)

  const filas = r.items
    .map((i) => ({
      almacen: (i.stock_location_id && nombres.get(i.stock_location_id)) || i.stock_location_id || "",
      presentacion: sinVarianteUnica(i.title),
      unidades: i.units,
      cuarentena: i.quarantined_units,
      lotes: i.batches,
      costo: i.average_unit_cost,
      valor: i.total_value,
    }))
    .sort((a, b) => a.almacen.localeCompare(b.almacen, "es") || a.presentacion.localeCompare(b.presentacion, "es"))

  const almacen = q.almacen ? nombres.get(q.almacen) ?? q.almacen : "Todos los almacenes"
  return {
    titulo: REPORTES.inventario.etiqueta,
    subtitulo: `${almacen} · al ${new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_CLINICA, dateStyle: "long" }).format(new Date())}`,
    columnas: [
      { clave: "almacen", etiqueta: "Almacén" },
      { clave: "presentacion", etiqueta: "Presentación" },
      { clave: "lotes", etiqueta: "Lotes", tipo: "numero" },
      { clave: "unidades", etiqueta: "Unidades", tipo: "numero" },
      { clave: "cuarentena", etiqueta: "En cuarentena", tipo: "numero" },
      ...(conCosto
        ? [
            { clave: "costo", etiqueta: "Costo promedio", tipo: "dinero" as const },
            { clave: "valor", etiqueta: "Valor", tipo: "dinero" as const },
          ]
        : []),
    ],
    filas,
    totales: {
      lotes: filas.reduce((s, f) => s + f.lotes, 0),
      unidades: filas.reduce((s, f) => s + f.unidades, 0),
      cuarentena: filas.reduce((s, f) => s + f.cuarentena, 0),
      ...(conCosto ? { valor: redondear(filas.reduce((s, f) => s + (f.valor ?? 0), 0)) } : {}),
    },
    notas: conCosto && r.summary.unvalued_variants > 0 ? [`${r.summary.unvalued_variants} presentación(es) sin costo registrado: aparecen sin valor.`] : [],
  }
}

// ── movimientos ─────────────────────────────────────────────────────────────

const TIPO_MOVIMIENTO: Record<string, string> = {
  entry_purchase: "Compra",
  entry_return: "Devolución",
  entry_adjustment: "Ajuste (entrada)",
  entry_transfer: "Traspaso recibido",
  entry_initial: "Carga inicial",
  exit_sale: "Venta o aplicación",
  exit_adjustment: "Ajuste (salida)",
  exit_transfer: "Traspaso enviado",
  exit_expiry: "Caducidad",
  exit_damage: "Daño o robo",
}

async function movimientos(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const conCosto = canSeeCost(q.actor_rol)
  const { data } = await query.graph({
    entity: "inventory_movement",
    fields: ["created_at", "stock_location_id", "variant_id", "variant_title", "batch_number", "type", "quantity_delta", "quantity_after", "unit_cost", "reason", "user_email", "reference_type"],
    filters: { ...rangoSobre("created_at", q), ...(q.almacen ? { stock_location_id: q.almacen } : {}) },
    pagination: { take: TOPE_DE_FILAS, order: { created_at: "ASC" } },
  })
  const nombres = await nombresDeAlmacenes(container)

  const filas = (data ?? []).map((m: any) => ({
    fecha: m.created_at,
    almacen: (m.stock_location_id && nombres.get(m.stock_location_id)) || "",
    presentacion: sinVarianteUnica(m.variant_title ?? m.variant_id),
    lote: m.batch_number ?? "",
    tipo: TIPO_MOVIMIENTO[m.type] ?? m.type,
    cantidad: Number(m.quantity_delta),
    saldo: Number(m.quantity_after),
    costo: conCosto ? m.unit_cost : null,
    motivo: m.reason ?? "",
    usuario: String(m.user_email ?? "").replace(/@sigh\.local$/, ""),
  }))

  return {
    titulo: REPORTES.movimientos.etiqueta,
    subtitulo: `${q.almacen ? nombres.get(q.almacen) ?? q.almacen : "Todos los almacenes"} · ${describirRango(q)}`,
    columnas: [
      { clave: "fecha", etiqueta: "Fecha", tipo: "fechahora" },
      { clave: "almacen", etiqueta: "Almacén" },
      { clave: "presentacion", etiqueta: "Presentación" },
      { clave: "lote", etiqueta: "Lote" },
      { clave: "tipo", etiqueta: "Tipo" },
      { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero" },
      { clave: "saldo", etiqueta: "Saldo del lote", tipo: "numero" },
      ...(conCosto ? [{ clave: "costo", etiqueta: "Costo unitario", tipo: "dinero" as const }] : []),
      { clave: "motivo", etiqueta: "Motivo" },
      { clave: "usuario", etiqueta: "Usuario" },
    ],
    filas,
    notas: avisoDeTope((data ?? []).length),
  }
}

// ── caducidades ─────────────────────────────────────────────────────────────

async function caducidades(container: MedusaContainer, q: ConsultaDeReporte): Promise<Tabla> {
  const { items } = await lotesProximosACaducar(container, { days: 90, stock_location_id: q.almacen || null })
  return {
    titulo: REPORTES.caducidades.etiqueta,
    subtitulo: q.almacen ? items[0]?.stock_location_name ?? "Un almacén" : "Todos los almacenes",
    columnas: [
      { clave: "almacen", etiqueta: "Almacén" },
      { clave: "presentacion", etiqueta: "Presentación" },
      { clave: "lote", etiqueta: "Lote" },
      { clave: "caducidad", etiqueta: "Caducidad", tipo: "fecha" },
      { clave: "dias", etiqueta: "Días restantes", tipo: "numero" },
      { clave: "tramo", etiqueta: "Tramo" },
      { clave: "existencia", etiqueta: "Existencia", tipo: "numero" },
      { clave: "estado", etiqueta: "Estado" },
      { clave: "estante", etiqueta: "Estante" },
    ],
    filas: items.map((i) => ({
      almacen: i.stock_location_name ?? i.stock_location_id ?? "",
      presentacion: sinVarianteUnica(i.title),
      lote: i.batch_number,
      caducidad: i.expiration_date,
      dias: i.days_left,
      tramo: ETIQUETA_TRAMO[i.tier],
      existencia: i.quantity,
      estado: i.status === "quarantined" ? "En cuarentena" : i.status === "destroyed" ? "Destruido" : "Activo",
      estante: i.shelf_location ?? "",
    })),
    totales: { existencia: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) },
  }
}

const GENERADORES: Record<TipoDeReporte, (c: MedusaContainer, q: ConsultaDeReporte) => Promise<Tabla>> = {
  actividad,
  honorarios: honorariosMedicos,
  cortes,
  ventas,
  bitacora,
  recetas,
  inventario,
  movimientos,
  caducidades,
}

export function generarReporte(container: MedusaContainer, tipo: TipoDeReporte, q: ConsultaDeReporte): Promise<Tabla> {
  return GENERADORES[tipo](container, q)
}
