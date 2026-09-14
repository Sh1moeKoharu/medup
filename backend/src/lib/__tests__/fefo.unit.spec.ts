import { repartirFefo, type LoteFefo } from "../fefo"

/**
 * FEFO por almacén.
 *
 * Lo que más importa: una venta de Farmacia NO descuenta de Enfermería
 * aunque allí haya existencia, y entre los lotes del almacén correcto sale
 * primero el que caduca antes.
 *
 *   npm run test:unit
 */

const FARMACIA = "sloc_farmacia"
const ENFERMERIA = "sloc_enfermeria"

const lote = (parcial: Partial<LoteFefo> & { id: string }): LoteFefo => ({
  batch_number: parcial.id,
  quantity: 10,
  expiration_date: "2027-01-01",
  variant_id: "var_1",
  stock_location_id: FARMACIA,
  status: "active",
  ...parcial,
})

describe("repartirFefo: por almacén", () => {
  it("no descuenta de otro almacén aunque tenga existencia", () => {
    const plan = repartirFefo([lote({ id: "enf", stock_location_id: ENFERMERIA, quantity: 100 })], 5, FARMACIA)
    expect(plan.asignaciones).toEqual([])
    expect(plan.faltante).toBe(5)
    expect(plan.alcanza).toBe(false)
  })

  it("la caducidad más próxima se decide DENTRO del almacén", () => {
    const plan = repartirFefo(
      [
        lote({ id: "enf-pronto", stock_location_id: ENFERMERIA, expiration_date: "2026-10-01" }),
        lote({ id: "far-tarde", expiration_date: "2027-06-01" }),
        lote({ id: "far-pronto", expiration_date: "2027-01-01" }),
      ],
      12,
      FARMACIA
    )
    expect(plan.asignaciones.map((a) => a.lote.id)).toEqual(["far-pronto", "far-tarde"])
    expect(plan.asignaciones.map((a) => a.cantidad)).toEqual([10, 2])
    expect(plan.alcanza).toBe(true)
  })

  it("un lote sin almacén no se reparte nunca", () => {
    const plan = repartirFefo([lote({ id: "huerfano", stock_location_id: null })], 1, FARMACIA)
    expect(plan.asignaciones).toEqual([])
  })

  it("sin almacén indicado no reparte nada", () => {
    const plan = repartirFefo([lote({ id: "a" })], 1, "")
    expect(plan.asignaciones).toEqual([])
    expect(plan.faltante).toBe(1)
  })
})

describe("repartirFefo: la regla de siempre", () => {
  it("sólo lotes activos con existencia", () => {
    const plan = repartirFefo(
      [
        lote({ id: "cuarentena", status: "quarantined", expiration_date: "2026-01-01" }),
        lote({ id: "vacio", quantity: 0, expiration_date: "2026-02-01" }),
        lote({ id: "bueno" }),
      ],
      3,
      FARMACIA
    )
    expect(plan.asignaciones.map((a) => a.lote.id)).toEqual(["bueno"])
  })

  it("dice cuánto falta en vez de lanzar", () => {
    const plan = repartirFefo([lote({ id: "a", quantity: 4 })], 10, FARMACIA)
    expect(plan.asignaciones[0].cantidad).toBe(4)
    expect(plan.asignaciones[0].saldoResultante).toBe(0)
    expect(plan.faltante).toBe(6)
  })

  it("recuerda de qué almacén planificó", () => {
    expect(repartirFefo([], 1, ENFERMERIA).stock_location_id).toBe(ENFERMERIA)
  })
})
