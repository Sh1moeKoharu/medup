import { aCsv } from "./csv"
import type { Membrete } from "./documentos"
import { ROLES, type Role } from "./roles"
import { ZONA_CLINICA, instanteDeLaClinica } from "./zona-horaria"

/**
 * Reportes exportables: qué hay, quién puede leer cada uno y cómo sale en
 * CSV y en papel. Funciones puras; los datos los junta reportes-servidor.ts.
 *
 * ── UNA SOLA FORMA DE TABLA ─────────────────────────────────────────────────
 * Cada reporte, venga de donde venga, se reduce a una `Tabla`: columnas con
 * tipo y filas. Con eso el CSV, la hoja impresa y la vista previa del POS
 * salen de la misma función y no pueden discrepar.
 *
 * ── QUIÉN LEE QUÉ ───────────────────────────────────────────────────────────
 * `/admin/reports` deja pasar a Administración, Auditoría, RH y Almacén; aquí
 * se afina por tipo. RH no ve recetas ni la bitácora completa; Almacén sólo lo
 * suyo. Administración y Auditoría, todo.
 */

export type TipoDeReporte =
  | "actividad"
  | "honorarios"
  | "cortes"
  | "ventas"
  | "bitacora"
  | "recetas"
  | "inventario"
  | "movimientos"
  | "caducidades"

export type FiltroDeReporte = "rango" | "rol" | "persona" | "almacen" | "agrupar"

export type DefinicionDeReporte = {
  etiqueta: string
  descripcion: string
  lectores: Role[]
  filtros: FiltroDeReporte[]
  /** Opciones de `agrupar`, si el reporte las tiene. La primera es la de omisión. */
  agrupaciones?: { valor: string; etiqueta: string }[]
}

const TODOS: Role[] = [ROLES.ADMIN, ROLES.AUDITOR]

export const REPORTES: Record<TipoDeReporte, DefinicionDeReporte> = {
  actividad: {
    etiqueta: "Actividad del personal",
    descripcion: "Por persona y por día: primera y última acción, horas en turno, lo cobrado y lo que hizo en el sistema.",
    lectores: [...TODOS, ROLES.HR],
    filtros: ["rango", "rol", "persona", "agrupar"],
    agrupaciones: [
      { valor: "dia", etiqueta: "Por día" },
      { valor: "persona", etiqueta: "Por persona" },
    ],
  },
  honorarios: {
    etiqueta: "Honorarios y nómina",
    descripcion: "Por persona: turnos, horas, lo que se le atribuye, la comisión por horario y el total a pagar.",
    lectores: [...TODOS, ROLES.HR],
    filtros: ["rango"],
  },
  cortes: {
    etiqueta: "Cortes de caja",
    descripcion: "Cada turno de caja con su fondo, ventas por forma de pago, lo esperado, lo contado y la diferencia.",
    lectores: [...TODOS, ROLES.HR],
    filtros: ["rango"],
  },
  ventas: {
    etiqueta: "Ventas",
    descripcion: "Pedidos cobrados y su importe, por periodo.",
    lectores: [...TODOS, ROLES.HR],
    filtros: ["rango", "agrupar"],
    agrupaciones: [
      { valor: "day", etiqueta: "Por día" },
      { valor: "week", etiqueta: "Por semana" },
      { valor: "month", etiqueta: "Por mes" },
    ],
  },
  bitacora: {
    etiqueta: "Bitácora",
    descripcion: "Cada acción registrada: quién, cuándo, qué y desde dónde.",
    lectores: TODOS,
    filtros: ["rango", "rol", "persona"],
  },
  recetas: {
    etiqueta: "Recetas y órdenes",
    descripcion: "Recetas emitidas con su estado, quién las aplicó o surtió, y los ajustes con su motivo.",
    lectores: TODOS,
    filtros: ["rango"],
  },
  inventario: {
    etiqueta: "Inventario valorizado",
    descripcion: "Existencia por almacén y presentación, con costo promedio y valor.",
    lectores: [...TODOS, ROLES.WAREHOUSE],
    filtros: ["almacen"],
  },
  movimientos: {
    etiqueta: "Movimientos de inventario",
    descripcion: "El kardex: entradas, salidas, traspasos y bajas con su motivo.",
    lectores: [...TODOS, ROLES.WAREHOUSE],
    filtros: ["rango", "almacen"],
  },
  caducidades: {
    etiqueta: "Caducidades",
    descripcion: "Lotes caducados y por caducar en 30, 60 y 90 días.",
    lectores: [...TODOS, ROLES.WAREHOUSE],
    filtros: ["almacen"],
  },
}

export const TIPOS_DE_REPORTE = Object.keys(REPORTES) as TipoDeReporte[]

export function esTipoDeReporte(valor: unknown): valor is TipoDeReporte {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(REPORTES, valor)
}

export function puedeLeerReporte(rol: Role | null | undefined, tipo: TipoDeReporte): boolean {
  return !!rol && REPORTES[tipo].lectores.includes(rol)
}

export function reportesPara(rol: Role | null | undefined): (DefinicionDeReporte & { tipo: TipoDeReporte })[] {
  return TIPOS_DE_REPORTE.filter((t) => puedeLeerReporte(rol, t)).map((tipo) => ({ tipo, ...REPORTES[tipo] }))
}

// ── Rango de fechas ─────────────────────────────────────────────────────────

/**
 * Un día a secas ("2026-09-14") se lee como ese día en la clínica, de 00:00 a
 * 23:59:59.999, no como el día en UTC. La zona está en lib/zona-horaria.ts.
 */
export type Rango = { desde: string | null; hasta: string | null; error: string | null }

function extremo(valor: string | undefined, finDeDia: boolean): string | null | undefined {
  if (!valor || !String(valor).trim()) return undefined
  const v = String(valor).trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? instanteDeLaClinica(v, finDeDia ? "23:59:59.999" : "00:00:00.000")
    : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function rangoDeFechas(desde?: string, hasta?: string): Rango {
  const d = extremo(desde, false)
  const h = extremo(hasta, true)
  if (d === null || h === null) {
    return { desde: null, hasta: null, error: "Las fechas deben ir como 2026-09-14." }
  }
  if (d && h && d > h) {
    return { desde: null, hasta: null, error: "La fecha inicial es posterior a la final." }
  }
  return { desde: d ?? null, hasta: h ?? null, error: null }
}

// ── La tabla ────────────────────────────────────────────────────────────────

export type TipoDeColumna = "texto" | "numero" | "dinero" | "fecha" | "fechahora" | "horas"

export type Columna = { clave: string; etiqueta: string; tipo?: TipoDeColumna }

export type Tabla = {
  titulo: string
  /** Una línea bajo el título: el periodo, el almacén, la agrupación. */
  subtitulo?: string
  columnas: Columna[]
  filas: Record<string, unknown>[]
  /** Fila de totales: sólo las claves que se suman. */
  totales?: Record<string, unknown>
  /** Aclaraciones al pie del papel. */
  notas?: string[]
}

const ZONA = ZONA_CLINICA

export function textoDeCelda(valor: unknown, tipo: TipoDeColumna = "texto", paraCsv = false): string | number {
  if (valor === null || valor === undefined || valor === "") return ""
  switch (tipo) {
    case "numero":
    case "dinero":
    case "horas": {
      const n = Number(valor)
      if (!Number.isFinite(n)) return String(valor)
      if (paraCsv) return Math.round(n * 100) / 100
      if (tipo === "dinero") {
        return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol" }).format(n)
      }
      if (tipo === "horas") return `${n.toFixed(2)} h`
      return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n)
    }
    case "fecha":
    case "fechahora": {
      // Un día a secas ya es el día de la clínica: leído como fecha, JavaScript
      // lo tomaría como medianoche UTC y en la clínica saldría el día anterior.
      const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor))
      if (soloDia && tipo === "fecha") {
        return paraCsv ? soloDia[0] : `${soloDia[3]}/${soloDia[2]}/${soloDia[1]}`
      }
      const d = new Date(valor as string)
      if (Number.isNaN(d.getTime())) return String(valor)
      const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(tipo === "fechahora" ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      }).formatToParts(d)
      const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ""
      // En CSV, ISO en hora de la clínica: Excel lo reconoce y no lo reinterpreta.
      const dia = `${p("year")}-${p("month")}-${p("day")}`
      const diaLegible = `${p("day")}/${p("month")}/${p("year")}`
      if (tipo === "fecha") return paraCsv ? dia : diaLegible
      const hora = `${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`
      return paraCsv ? `${dia} ${hora}` : `${diaLegible} ${hora}`
    }
    default:
      return String(valor)
  }
}

function filaDeTotales(t: Tabla, paraCsv: boolean): (string | number)[] {
  return t.columnas.map((c, i) => {
    const v = t.totales?.[c.clave]
    if (v === undefined) return i === 0 ? "Total" : ""
    return textoDeCelda(v, c.tipo, paraCsv)
  })
}

export function csvDeTabla(t: Tabla): string {
  const filas: unknown[][] = t.filas.map((f) => t.columnas.map((c) => textoDeCelda(f[c.clave], c.tipo, true)))
  if (t.totales && t.filas.length) filas.push(filaDeTotales(t, true))
  return aCsv(t.columnas.map((c) => c.etiqueta), filas)
}

/** Nombre de archivo sin acentos ni espacios: "actividad-2026-09-01-a-2026-09-14.csv". */
export function nombreDeArchivo(tipo: TipoDeReporte, rango: { desde?: string | null; hasta?: string | null }, extension = "csv"): string {
  const dia = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso)) : null)
  const d = dia(rango.desde)
  const h = dia(rango.hasta)
  const periodo = d && h ? `${d}-a-${h}` : d ? `desde-${d}` : h ? `hasta-${h}` : new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date())
  return `${tipo}-${periodo}.${extension}`
}

function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** "Del 01/09/2026 al 14/09/2026", para el subtítulo. */
export function describirRango(r: { desde?: string | null; hasta?: string | null }): string {
  const f = (iso: string) => textoDeCelda(iso, "fecha")
  if (r.desde && r.hasta) return `Del ${f(r.desde)} al ${f(r.hasta)}`
  if (r.desde) return `Desde el ${f(r.desde)}`
  if (r.hasta) return `Hasta el ${f(r.hasta)}`
  return "Todo el historial"
}

/**
 * La hoja impresa: carta horizontal, membrete, título, periodo y la tabla con
 * su fila de totales. Lleva quién la generó y cuándo, porque un reporte
 * impreso sin eso no sirve de evidencia.
 */
export function htmlDeTabla(t: Tabla, membrete: Membrete, pie: { generado_por?: string | null; generado_en?: Date } = {}): string {
  const numerica = (c: Columna) => c.tipo === "numero" || c.tipo === "dinero" || c.tipo === "horas"
  const celda = (c: Columna, v: unknown) => `<td class="${numerica(c) ? "num" : ""}">${esc(textoDeCelda(v, c.tipo))}</td>`

  const cuerpo = t.filas.length
    ? t.filas.map((f) => `<tr>${t.columnas.map((c) => celda(c, f[c.clave])).join("")}</tr>`).join("")
    : `<tr><td colspan="${t.columnas.length}" class="vacio">Sin registros en este periodo.</td></tr>`

  const totales =
    t.totales && t.filas.length
      ? `<tfoot><tr>${filaDeTotales(t, false)
          .map((v, i) => `<td class="${numerica(t.columnas[i]) ? "num" : ""}">${esc(v)}</td>`)
          .join("")}</tr></tfoot>`
      : ""

  // Una tabla ancha (la actividad tiene más de quince columnas) cabe en la hoja
  // con letra más chica; los encabezados se parten en renglones.
  const letra = t.columnas.length > 14 ? 7.5 : t.columnas.length > 10 ? 8.5 : 10

  const cuando = textoDeCelda((pie.generado_en ?? new Date()).toISOString(), "fechahora")
  const datos = [membrete.direccion, membrete.telefono ? `Tel. ${membrete.telefono}` : null, membrete.rfc ? `RFC ${membrete.rfc}` : null].filter(Boolean)

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(t.titulo)}</title><style>
  @page { size: letter landscape; margin: 12mm; }
  html, body { background: #fff; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #17150F; margin: 0; font-size: ${letra}px; line-height: 1.35; }
  .clinica, h1 { white-space: nowrap; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; border-bottom: 1.5px solid #17150F; padding-bottom: 6px; margin-bottom: 10px; }
  .clinica { font-size: 13px; font-weight: 600; }
  .datos, .sub, footer { color: #555; }
  h1 { font-size: 16px; font-weight: 600; margin: 0; text-align: right; }
  .sub { text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  thead th { text-align: left; font-weight: 600; border-bottom: 1px solid #17150F; padding: 4px 3px; vertical-align: bottom; }
  tbody td { border-bottom: 0.5px solid #ddd; padding: 3px 3px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tfoot td { border-top: 1px solid #17150F; font-weight: 600; padding: 4px 5px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.num, tfoot td.num { white-space: nowrap; }
  thead th { overflow-wrap: break-word; }
  .vacio { text-align: center; color: #777; padding: 16px; }
  footer { margin-top: 10px; }
  footer p { margin: 2px 0; }
</style></head><body>
<header>
  <div><div class="clinica">${esc(membrete.establecimiento)}</div>${datos.length ? `<div class="datos">${datos.map(esc).join(" · ")}</div>` : ""}</div>
  <div><h1>${esc(t.titulo)}</h1>${t.subtitulo ? `<div class="sub">${esc(t.subtitulo)}</div>` : ""}</div>
</header>
<table>
  <thead><tr>${t.columnas.map((c) => `<th class="${numerica(c) ? "num" : ""}">${esc(c.etiqueta)}</th>`).join("")}</tr></thead>
  <tbody>${cuerpo}</tbody>${totales}
</table>
<footer>
  ${(t.notas ?? []).map((n) => `<p>${esc(n)}</p>`).join("")}
  <p>${t.filas.length} ${t.filas.length === 1 ? "registro" : "registros"} · Generado el ${esc(cuando)}${pie.generado_por ? ` por ${esc(pie.generado_por)}` : ""}</p>
</footer>
</body></html>`
}
