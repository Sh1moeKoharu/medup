import { ZONA_CLINICA } from "./zona-horaria"

/**
 * Nómina y comisiones del personal. Funciones puras.
 *
 * ── EL ESQUEMA DE CADA PERSONA ──────────────────────────────────────────────
 * La clínica pidió que se pueda pagar a cualquier perfil —no sólo al médico—
 * y con el esquema que le corresponda a cada quien:
 *
 *   pago = turnos × fijo por turno
 *        + horas en turno × pago por hora
 *        + Σ (monto atribuido × porcentaje que aplica a esa hora)
 *
 * El porcentaje sale de las reglas por horario (días y franja, en hora de la
 * clínica); si ninguna aplica, del porcentaje base. Así un médico puede cobrar
 * 20 % de lunes a viernes de día y 30 % de noche y fines de semana.
 *
 * ── LO QUE SE ATRIBUYE ──────────────────────────────────────────────────────
 * Lo decide lib/nomina-servidor.ts por perfil (lo cobrado de sus recetas, lo
 * que cargó a cuentas de pacientes, lo que cobró en caja, lo que surtió). Aquí
 * sólo se reciben montos con fecha.
 */

export const ZONA_NOMINA = ZONA_CLINICA

export type ReglaDeComision = {
  id?: string
  label?: string | null
  /** "1,2,3,4,5": 0 = domingo … 6 = sábado. */
  days: string
  start_time: string
  end_time: string
  percent: number
}

export type EsquemaDePago = {
  fixed_per_shift?: number | null
  hourly_rate?: number | null
  default_percent?: number | null
  reglas?: ReglaDeComision[]
}

export type TurnoDeNomina = { inicio: string | Date; fin?: string | Date | null }
export type Atribucion = { fecha: string | Date; monto: number; referencia?: string | null }

export type RenglonPorRegla = { etiqueta: string; percent: number; base: number; comision: number }

export type DesgloseDePago = {
  turnos: number
  horas: number
  fijo: number
  por_hora: number
  base_comisionable: number
  comision: number
  por_regla: RenglonPorRegla[]
  total: number
}

const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Por qué una regla no vale, o null. */
export function revisarRegla(r: Partial<ReglaDeComision>): string | null {
  const dias = String(r.days ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
  if (!dias.length || dias.some((d) => !/^[0-6]$/.test(d))) return "Cada regla necesita al menos un día de la semana."
  if (!HORA.test(String(r.start_time ?? "")) || !HORA.test(String(r.end_time ?? ""))) return "Las horas de una regla van como 08:00 y 20:00."
  if (r.start_time === r.end_time) return "La hora de inicio y la de fin de una regla no pueden ser iguales."
  const p = Number(r.percent)
  if (!Number.isFinite(p) || p < 0 || p > 100) return "El porcentaje de una regla debe estar entre 0 y 100."
  return null
}

export function revisarEsquema(e: EsquemaDePago): string | null {
  for (const [clave, etiqueta] of [
    ["fixed_per_shift", "El pago por turno"],
    ["hourly_rate", "El pago por hora"],
  ] as const) {
    const v = Number(e[clave] ?? 0)
    if (!Number.isFinite(v) || v < 0) return `${etiqueta} debe ser un número mayor o igual a 0.`
  }
  const p = Number(e.default_percent ?? 0)
  if (!Number.isFinite(p) || p < 0 || p > 100) return "El porcentaje base debe estar entre 0 y 100."
  for (const r of e.reglas ?? []) {
    const problema = revisarRegla(r)
    if (problema) return problema
  }
  return null
}

const formatoLocal = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_NOMINA,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Día de la semana y minutos desde medianoche, en hora de la clínica. */
export function momentoLocal(fecha: string | Date): { dia: number; minutos: number } {
  const partes = formatoLocal.formatToParts(new Date(fecha))
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ""
  const hora = Number(p("hour")) % 24
  return { dia: DIAS[p("weekday")] ?? 0, minutos: hora * 60 + Number(p("minute")) }
}

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/**
 * La regla que aplica a un momento, o null. Una franja que cruza la medianoche
 * (22:00–06:00) pertenece al día en que EMPIEZA: el martes a las 02:00 cae en la
 * regla del lunes de noche.
 */
export function reglaQueAplica(fecha: string | Date, reglas: ReglaDeComision[]): ReglaDeComision | null {
  const { dia, minutos } = momentoLocal(fecha)
  for (const r of reglas) {
    const dias = r.days.split(",").map((d) => Number(d.trim()))
    const inicio = aMinutos(r.start_time)
    const fin = aMinutos(r.end_time)
    if (inicio < fin) {
      if (dias.includes(dia) && minutos >= inicio && minutos < fin) return r
    } else {
      const diaAnterior = (dia + 6) % 7
      if ((dias.includes(dia) && minutos >= inicio) || (dias.includes(diaAnterior) && minutos < fin)) return r
    }
  }
  return null
}

export function calcularPagoDePersona(entrada: {
  esquema: EsquemaDePago | null
  turnos: TurnoDeNomina[]
  atribuciones: Atribucion[]
  ahora?: Date
}): DesgloseDePago {
  const e = entrada.esquema ?? {}
  const ahora = entrada.ahora ?? new Date()
  const reglas = e.reglas ?? []
  const base = Number(e.default_percent ?? 0)

  let horas = 0
  for (const t of entrada.turnos) {
    const inicio = new Date(t.inicio).getTime()
    const fin = t.fin ? new Date(t.fin).getTime() : ahora.getTime()
    if (Number.isFinite(inicio) && fin > inicio) horas += (fin - inicio) / 3_600_000
  }
  horas = centavos(horas)

  const porRegla = new Map<string, RenglonPorRegla>()
  let baseComisionable = 0
  for (const a of entrada.atribuciones) {
    const monto = Number(a.monto) || 0
    if (!monto) continue
    const regla = reglaQueAplica(a.fecha, reglas)
    const percent = regla ? Number(regla.percent) : base
    const etiqueta = regla ? regla.label || `${regla.start_time}–${regla.end_time}` : "Porcentaje base"
    const clave = `${etiqueta}|${percent}`
    const fila = porRegla.get(clave) ?? { etiqueta, percent, base: 0, comision: 0 }
    fila.base = centavos(fila.base + monto)
    porRegla.set(clave, fila)
    baseComisionable += monto
  }
  const filas = [...porRegla.values()].map((f) => ({ ...f, comision: centavos((f.base * f.percent) / 100) }))
  const comision = centavos(filas.reduce((s, f) => s + f.comision, 0))

  const turnos = entrada.turnos.length
  const fijo = centavos(turnos * Number(e.fixed_per_shift ?? 0))
  const porHora = centavos(horas * Number(e.hourly_rate ?? 0))

  return {
    turnos,
    horas,
    fijo,
    por_hora: porHora,
    base_comisionable: centavos(baseComisionable),
    comision,
    por_regla: filas,
    total: centavos(fijo + porHora + comision),
  }
}

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NOMINA, year: "numeric", month: "2-digit", day: "2-digit" })

/**
 * El periodo de un pago en días de la clínica ("2026-09-01"). El periodo se
 * guarda como instantes (medianoche de la clínica); una pantalla en otra zona
 * que los formatee con su reloj lo correría al día anterior.
 */
export function conDiasDelPeriodo<T extends { period_from: string | Date; period_to: string | Date }>(p: T): T & { dia_desde: string; dia_hasta: string } {
  return { ...p, dia_desde: formatoDia.format(new Date(p.period_from)), dia_hasta: formatoDia.format(new Date(p.period_to)) }
}

/** ¿Dos periodos se traslapan? Sirve para no pagar dos veces el mismo tiempo. */
export function periodosSeTraslapan(a: { desde: string | Date; hasta: string | Date }, b: { desde: string | Date; hasta: string | Date }): boolean {
  return new Date(a.desde).getTime() <= new Date(b.hasta).getTime() && new Date(b.desde).getTime() <= new Date(a.hasta).getTime()
}
