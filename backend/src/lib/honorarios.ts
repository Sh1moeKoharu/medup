/**
 * Honorarios de médicos: comisión sobre lo cobrado, por turno. Funciones
 * puras; las consultas viven en las rutas de /admin/reports.
 *
 * ── QUÉ CUENTA COMO COBRADO ─────────────────────────────────────────────────
 * Una orden médica surtida por Enfermería queda enlazada a la CUENTA del
 * paciente (`draft_order_id`, ver lib/cuentas-de-paciente.ts). Cuando Caja
 * cobra esa cuenta, el pedido deja de ser borrador. Lo cobrado de la orden es
 * lo que sus renglones valen al precio con que se cobraron; una orden
 * cancelada, o cuya cuenta sigue sin cobrar, no paga comisión.
 *
 * Las órdenes a Farmacia (mostrador) no tienen enlace con un pedido y no
 * entran en este cálculo: se cobran como venta de mostrador.
 */

export function revisarPorcentaje(valor: unknown): string | null {
  const n = Number(valor)
  if (valor === null || valor === undefined || String(valor).trim() === "" || !Number.isFinite(n)) {
    return "Escribe el porcentaje de comisión."
  }
  if (n < 0 || n > 100) {
    return "El porcentaje debe estar entre 0 y 100."
  }
  return null
}

/** Comisión redondeada a centavos. */
export function calcularComision(cobrado: number, percent: number): number {
  const c = Number(cobrado) || 0
  const p = Number(percent) || 0
  return Math.round((c * (p / 100) + Number.EPSILON) * 100) / 100
}

export type TurnoMedico = {
  id: string
  doctor_id: string
  opened_at: string | Date
  closed_at?: string | Date | null
}

/** En qué turno del médico cae una fecha; null si en ninguno. Un turno abierto llega hasta ahora. */
export function turnoDe(fecha: string | Date, turnos: TurnoMedico[], doctorId: string): TurnoMedico | null {
  const t = new Date(fecha).getTime()
  return (
    turnos.find((s) => {
      if (s.doctor_id !== doctorId) return false
      const desde = new Date(s.opened_at).getTime()
      const hasta = s.closed_at ? new Date(s.closed_at).getTime() : Number.POSITIVE_INFINITY
      return t >= desde && t <= hasta
    }) ?? null
  )
}

export type OrdenParaPago = {
  id: string
  status: "pending" | "dispensed" | "cancelled" | string
  creator_id: string
  creator_name: string | null
  dispensed_at?: string | Date | null
  created_at: string | Date
  draft_order_id?: string | null
  items: { variant_id: string; quantity: number }[]
}

export type CuentaCobrada = {
  id: string
  /** "draft" si todavía no se cobró. */
  status: string
  items: { variant_id: string | null; quantity: number; unit_price: number }[]
}

export type PagoDeOrden = {
  medical_order_id: string
  doctor_id: string
  doctor_name: string | null
  fecha: string
  cobrado: number
  turno_id: string | null
}

/**
 * Lo cobrado de cada orden médica surtida cuya cuenta ya se cobró.
 * Se valúa cada renglón de la orden al precio con que se cobró en la cuenta.
 */
export function cobradoPorOrden(ordenes: OrdenParaPago[], cuentas: Record<string, CuentaCobrada>, turnos: TurnoMedico[]): PagoDeOrden[] {
  const pagos: PagoDeOrden[] = []
  for (const o of ordenes) {
    if (o.status !== "dispensed" || !o.draft_order_id) continue
    const cuenta = cuentas[o.draft_order_id]
    if (!cuenta || cuenta.status === "draft") continue

    let cobrado = 0
    for (const r of o.items ?? []) {
      const linea = cuenta.items.find((i) => i.variant_id === r.variant_id)
      if (linea) cobrado += (Number(r.quantity) || 0) * (Number(linea.unit_price) || 0)
    }
    const fecha = new Date(o.dispensed_at ?? o.created_at).toISOString()
    pagos.push({
      medical_order_id: o.id,
      doctor_id: o.creator_id,
      doctor_name: o.creator_name,
      fecha,
      cobrado: Math.round((cobrado + Number.EPSILON) * 100) / 100,
      turno_id: turnoDe(fecha, turnos, o.creator_id)?.id ?? null,
    })
  }
  return pagos
}

export type PagoPorMedico = {
  doctor_id: string
  doctor_name: string | null
  percent: number
  ordenes: number
  cobrado: number
  comision: number
  turnos: { turno_id: string | null; abierto: boolean; ordenes: number; cobrado: number; comision: number }[]
}

export function agruparPagos(
  pagos: PagoDeOrden[],
  comisiones: Record<string, number>,
  turnos: TurnoMedico[]
): PagoPorMedico[] {
  const porMedico = new Map<string, PagoPorMedico>()

  for (const p of pagos) {
    const percent = Number(comisiones[p.doctor_id] ?? 0)
    const m = porMedico.get(p.doctor_id) ?? {
      doctor_id: p.doctor_id,
      doctor_name: p.doctor_name,
      percent,
      ordenes: 0,
      cobrado: 0,
      comision: 0,
      turnos: [],
    }
    m.ordenes++
    m.cobrado = Math.round((m.cobrado + p.cobrado + Number.EPSILON) * 100) / 100

    let t = m.turnos.find((x) => x.turno_id === p.turno_id)
    if (!t) {
      const turno = turnos.find((s) => s.id === p.turno_id)
      t = { turno_id: p.turno_id, abierto: !!turno && !turno.closed_at, ordenes: 0, cobrado: 0, comision: 0 }
      m.turnos.push(t)
    }
    t.ordenes++
    t.cobrado = Math.round((t.cobrado + p.cobrado + Number.EPSILON) * 100) / 100
    t.comision = calcularComision(t.cobrado, percent)

    m.comision = calcularComision(m.cobrado, percent)
    porMedico.set(p.doctor_id, m)
  }

  return [...porMedico.values()].sort((a, b) => b.cobrado - a.cobrado)
}
