import { calcularResumen, type MovimientoDeCaja, type ResumenDeCaja } from "./corte-de-caja"

/**
 * Reglas de caja que no necesitan base de datos: la referencia de la
 * terminal bancaria y la agregación de turnos por día, semana o mes.
 */

// ── Referencia de terminal ──────────────────────────────────────────────────

/**
 * Los últimos 4 a 6 dígitos del comprobante de la terminal. Es lo que permite
 * cruzar una venta con tarjeta contra el estado de cuenta del banco cuando
 * algo no cuadra; sin ella, un cobro con tarjeta es un número sin respaldo.
 */
export const FORMA_REFERENCIA_TERMINAL = /^\d{4,6}$/

export function normalizarReferencia(valor: unknown): string {
  return String(valor ?? "").trim()
}

/** Explica por qué una referencia no vale, o null si vale. */
export function revisarReferenciaDeTerminal(valor: unknown): string | null {
  const ref = normalizarReferencia(valor)
  if (!ref) {
    return "Escribe la referencia de la terminal: los 4 a 6 dígitos del comprobante."
  }
  if (!FORMA_REFERENCIA_TERMINAL.test(ref)) {
    return "La referencia de la terminal son de 4 a 6 dígitos, sin letras ni espacios."
  }
  return null
}

// ── Agregación de turnos ────────────────────────────────────────────────────

export type Agrupacion = "day" | "week" | "month"

export type SesionParaAgregar = {
  id: string
  status: "open" | "closed" | string
  opened_at: string | Date
  closed_at?: string | Date | null
  opening_amount: number | string
  cashier_id?: string | null
  cashier_name?: string | null
}

export type PeriodoAgregado = ResumenDeCaja & {
  /** Clave del periodo: 2026-09-10, 2026-W37, 2026-09. */
  periodo: string
  desde: string
  hasta: string
  sesiones: number
  cajeros: string[]
}

/** Lunes de la semana de una fecha, en UTC. */
function lunesDe(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dia = x.getUTCDay() // 0 domingo
  x.setUTCDate(x.getUTCDate() - ((dia + 6) % 7))
  return x
}

function semanaIso(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dia = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() + 4 - dia)
  const inicioAnio = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((x.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7)
  return `${x.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`
}

export function claveDePeriodo(fecha: string | Date, group: Agrupacion): { periodo: string; desde: string; hasta: string } {
  const d = new Date(fecha)
  if (group === "day") {
    const desde = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const hasta = new Date(desde.getTime() + 86400000 - 1)
    return { periodo: desde.toISOString().slice(0, 10), desde: desde.toISOString(), hasta: hasta.toISOString() }
  }
  if (group === "week") {
    const desde = lunesDe(d)
    const hasta = new Date(desde.getTime() + 7 * 86400000 - 1)
    return { periodo: semanaIso(d), desde: desde.toISOString(), hasta: hasta.toISOString() }
  }
  const desde = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const hasta = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1)
  return { periodo: desde.toISOString().slice(0, 7), desde: desde.toISOString(), hasta: hasta.toISOString() }
}

/**
 * Suma los turnos por periodo. Sólo cuentan los CERRADOS: un turno abierto
 * todavía está recibiendo ventas y su corte no existe; sumarlo daría un
 * número que cambia mientras se lee.
 *
 * `movimientos` va indexado por id de sesión. Función pura.
 */
export function agregarSesiones(
  sesiones: SesionParaAgregar[],
  movimientos: Record<string, MovimientoDeCaja[]>,
  group: Agrupacion
): PeriodoAgregado[] {
  const porPeriodo = new Map<string, PeriodoAgregado>()

  for (const s of sesiones) {
    if (s.status !== "closed") continue

    const { periodo, desde, hasta } = claveDePeriodo(s.opened_at, group)
    const resumen = calcularResumen(s.opening_amount, movimientos[s.id] ?? [])

    const acumulado = porPeriodo.get(periodo) ?? {
      periodo,
      desde,
      hasta,
      sesiones: 0,
      cajeros: [],
      ...calcularResumen(0, []),
    }

    acumulado.sesiones++
    if (s.cashier_name && !acumulado.cajeros.includes(s.cashier_name)) {
      acumulado.cajeros.push(s.cashier_name)
    }
    for (const k of Object.keys(resumen) as (keyof ResumenDeCaja)[]) {
      acumulado[k] = (acumulado[k] as number) + (resumen[k] as number)
    }

    porPeriodo.set(periodo, acumulado)
  }

  return [...porPeriodo.values()].sort((a, b) => (a.periodo < b.periodo ? 1 : -1))
}
