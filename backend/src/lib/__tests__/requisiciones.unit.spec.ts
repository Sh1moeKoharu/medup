import {
  estadoTrasSurtir,
  planificarSurtido,
  puedeCancelarse,
  puedeRecibirse,
  puedeSurtirse,
  revisarMotivo,
  type RenglonRequisicion,
} from "../requisiciones"

/**
 * Reglas de la requisición.
 *
 *   npm run test:unit
 */

const renglon = (parcial: Partial<RenglonRequisicion> & { id: string }): RenglonRequisicion => ({
  variant_id: "var_1",
  product_title: parcial.id,
  quantity_requested: 10,
  quantity_dispatched: 0,
  ...parcial,
})

describe("planificarSurtido", () => {
  it("sin detalle, surte todo lo pendiente", () => {
    const plan = planificarSurtido([renglon({ id: "a" }), renglon({ id: "b", quantity_dispatched: 4 })])
    expect(plan.ok).toBe(true)
    if (plan.ok) {
      expect(plan.surtir.map((s) => [s.renglon.id, s.cantidad])).toEqual([["a", 10], ["b", 6]])
    }
  })

  it("no se surte más de lo pedido", () => {
    const plan = planificarSurtido([renglon({ id: "a" })], [{ item_id: "a", cantidad: 11 }])
    expect(plan.ok).toBe(false)
  })

  it("ni más de lo que queda tras un surtido parcial", () => {
    const plan = planificarSurtido([renglon({ id: "a", quantity_dispatched: 7 })], [{ item_id: "a", cantidad: 4 }])
    expect(plan.ok).toBe(false)
  })

  it("surtir parcial es válido", () => {
    const plan = planificarSurtido([renglon({ id: "a" })], [{ item_id: "a", cantidad: 3 }])
    expect(plan.ok).toBe(true)
  })

  it.each([0, -1, 1.5, "x"])("rechaza la cantidad %p", (c) => {
    expect(planificarSurtido([renglon({ id: "a" })], [{ item_id: "a", cantidad: c as any }]).ok).toBe(false)
  })

  it("rechaza renglones ajenos y repetidos", () => {
    expect(planificarSurtido([renglon({ id: "a" })], [{ item_id: "z", cantidad: 1 }]).ok).toBe(false)
    expect(
      planificarSurtido([renglon({ id: "a" })], [{ item_id: "a", cantidad: 1 }, { item_id: "a", cantidad: 1 }]).ok
    ).toBe(false)
  })

  it("una requisición ya completa no tiene nada que surtir", () => {
    expect(planificarSurtido([renglon({ id: "a", quantity_dispatched: 10 })]).ok).toBe(false)
  })
})

describe("estado tras surtir", () => {
  it("parcial deja la requisición pendiente", () => {
    const items = [renglon({ id: "a" }), renglon({ id: "b" })]
    expect(estadoTrasSurtir(items, [{ renglon: items[0], cantidad: 10 }])).toBe("pending")
    expect(estadoTrasSurtir(items, [{ renglon: items[0], cantidad: 10 }, { renglon: items[1], cantidad: 9 }])).toBe("pending")
  })

  it("completo la marca surtida", () => {
    const items = [renglon({ id: "a" }), renglon({ id: "b", quantity_dispatched: 8 })]
    expect(estadoTrasSurtir(items, [{ renglon: items[0], cantidad: 10 }, { renglon: items[1], cantidad: 2 }])).toBe("dispatched")
  })
})

describe("transiciones", () => {
  it("una requisición recibida no se vuelve a surtir", () => {
    expect(puedeSurtirse("received")).toBe(false)
    expect(puedeSurtirse("dispatched")).toBe(false)
    expect(puedeSurtirse("cancelled")).toBe(false)
    expect(puedeSurtirse("pending")).toBe(true)
  })

  it("sólo se recibe lo surtido", () => {
    expect(puedeRecibirse("dispatched")).toBe(true)
    expect(puedeRecibirse("pending")).toBe(false)
  })

  it("sólo se cancela lo que no movió nada", () => {
    expect(puedeCancelarse("pending", [renglon({ id: "a" })])).toBe(true)
    expect(puedeCancelarse("pending", [renglon({ id: "a", quantity_dispatched: 1 })])).toBe(false)
    expect(puedeCancelarse("dispatched", [renglon({ id: "a" })])).toBe(false)
  })
})

describe("motivo de baja", () => {
  it("es obligatorio y tiene que decir algo", () => {
    expect(revisarMotivo("")).not.toBeNull()
    expect(revisarMotivo("   ")).not.toBeNull()
    expect(revisarMotivo("ok")).not.toBeNull()
    expect(revisarMotivo("Frasco roto al caer")).toBeNull()
  })
})
