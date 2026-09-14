import { agruparPagos, calcularComision, cobradoPorOrden, revisarPorcentaje, turnoDe } from "../honorarios"
import { estaBloqueado } from "../personal"

/**
 * Comisiones, turnos y bloqueo de cuentas.
 *
 *   npm run test:unit
 */

describe("comisión", () => {
  it("20 % de 1 000 son 200", () => {
    expect(calcularComision(1000, 20)).toBe(200)
    expect(calcularComision(333.33, 15)).toBe(50)
  })

  it("el porcentaje va de 0 a 100", () => {
    expect(revisarPorcentaje(15)).toBeNull()
    expect(revisarPorcentaje(0)).toBeNull()
    expect(revisarPorcentaje(101)).not.toBeNull()
    expect(revisarPorcentaje(-1)).not.toBeNull()
    expect(revisarPorcentaje("")).not.toBeNull()
  })
})

const turnos = [
  { id: "t1", doctor_id: "dr", opened_at: "2026-09-10T08:00:00Z", closed_at: "2026-09-10T14:00:00Z" },
  { id: "t2", doctor_id: "dr", opened_at: "2026-09-10T16:00:00Z", closed_at: null },
]

const orden = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "dispensed",
  creator_id: "dr",
  creator_name: "Dra. Ruiz",
  dispensed_at: "2026-09-10T10:00:00Z",
  created_at: "2026-09-10T09:00:00Z",
  draft_order_id: `cuenta-${id}`,
  items: [{ variant_id: "v1", quantity: 2 }],
  ...extra,
})

const cuentas = {
  "cuenta-a": { id: "cuenta-a", status: "completed", items: [{ variant_id: "v1", quantity: 2, unit_price: 100 }] },
  "cuenta-b": { id: "cuenta-b", status: "completed", items: [{ variant_id: "v1", quantity: 2, unit_price: 100 }] },
  "cuenta-c": { id: "cuenta-c", status: "draft", items: [{ variant_id: "v1", quantity: 2, unit_price: 100 }] },
}

describe("lo cobrado por orden", () => {
  it("valúa la orden al precio con que se cobró", () => {
    const pagos = cobradoPorOrden([orden("a")], cuentas, turnos)
    expect(pagos).toHaveLength(1)
    expect(pagos[0].cobrado).toBe(200)
    expect(pagos[0].turno_id).toBe("t1")
  })

  it("una orden cancelada no paga", () => {
    expect(cobradoPorOrden([orden("a", { status: "cancelled" })], cuentas, turnos)).toEqual([])
  })

  it("una cuenta sin cobrar todavía no paga", () => {
    expect(cobradoPorOrden([orden("c")], cuentas, turnos)).toEqual([])
  })

  it("una orden a mostrador (sin cuenta enlazada) no entra", () => {
    expect(cobradoPorOrden([orden("a", { draft_order_id: null })], cuentas, turnos)).toEqual([])
  })
})

describe("turnos", () => {
  it("una fecha cae en el turno que la contiene", () => {
    expect(turnoDe("2026-09-10T10:00:00Z", turnos, "dr")?.id).toBe("t1")
    expect(turnoDe("2026-09-10T15:00:00Z", turnos, "dr")).toBeNull()
  })

  it("un turno sin cierre llega hasta ahora y se reporta abierto", () => {
    expect(turnoDe("2026-09-10T20:00:00Z", turnos, "dr")?.id).toBe("t2")
    const pagos = cobradoPorOrden([orden("b", { dispensed_at: "2026-09-10T20:00:00Z" })], cuentas, turnos)
    const [medico] = agruparPagos(pagos, { dr: 20 }, turnos)
    expect(medico.turnos[0]).toMatchObject({ turno_id: "t2", abierto: true, cobrado: 200, comision: 40 })
  })

  it("no cruza médicos", () => {
    expect(turnoDe("2026-09-10T10:00:00Z", turnos, "otro")).toBeNull()
  })
})

describe("reporte por médico", () => {
  it("suma órdenes, cobrado y comisión, por turno y en total", () => {
    const pagos = cobradoPorOrden(
      [orden("a"), orden("b", { dispensed_at: "2026-09-10T20:00:00Z" })],
      cuentas,
      turnos
    )
    const [medico] = agruparPagos(pagos, { dr: 15 }, turnos)
    expect(medico.ordenes).toBe(2)
    expect(medico.cobrado).toBe(400)
    expect(medico.comision).toBe(60)
    expect(medico.turnos.map((t) => t.turno_id).sort()).toEqual(["t1", "t2"])
  })

  it("sin comisión configurada, la comisión es 0 pero lo cobrado se reporta", () => {
    const [medico] = agruparPagos(cobradoPorOrden([orden("a")], cuentas, turnos), {}, turnos)
    expect(medico.cobrado).toBe(200)
    expect(medico.comision).toBe(0)
  })
})

describe("bloqueo de cuentas", () => {
  it("sólo el marcador explícito bloquea", () => {
    expect(estaBloqueado({ metadata: { blocked: true } })).toBe(true)
    expect(estaBloqueado({ metadata: { blocked: false } })).toBe(false)
    expect(estaBloqueado({ metadata: { blocked: "true" } })).toBe(false)
    expect(estaBloqueado({ metadata: null })).toBe(false)
    expect(estaBloqueado(null)).toBe(false)
  })
})
