import { prorratear, revisarPaquete, vigente } from "../paquetes"

/**
 * Paquetes a precio cerrado: validación y prorrateo.
 *
 *   npm run test:unit
 */

describe("alta de un paquete", () => {
  const bueno = { name: "Nacimiento", price: 8500, items: [{ variant_id: "v1", quantity: 2 }], includes_consultation: true }

  it("exige nombre, precio positivo y renglones válidos", () => {
    expect(revisarPaquete(bueno)).toBeNull()
    expect(revisarPaquete({ ...bueno, name: "N" })).toMatch(/nombre/)
    expect(revisarPaquete({ ...bueno, price: 0 })).toMatch(/precio/)
    expect(revisarPaquete({ ...bueno, items: [{ variant_id: "", quantity: 1 }] })).toMatch(/producto/)
    expect(revisarPaquete({ ...bueno, items: [{ variant_id: "v1", quantity: 1.5 }] })).toMatch(/entero/)
    expect(revisarPaquete({ ...bueno, items: [], includes_consultation: false })).toMatch(/al menos/)
    expect(revisarPaquete({ ...bueno, items: [], includes_consultation: true })).toBeNull()
  })

  it("vigente = activo y dentro de fechas", () => {
    const hoy = new Date("2026-09-26T12:00:00Z")
    const p = { id: "p", name: "N", items: [], includes_consultation: true, price: 1, status: "active" }
    expect(vigente(p, hoy)).toBe(true)
    expect(vigente({ ...p, status: "inactive" }, hoy)).toBe(false)
    expect(vigente({ ...p, valid_until: "2026-09-01" }, hoy)).toBe(false)
  })
})

describe("prorrateo del precio cerrado", () => {
  it("reparte en proporción al precio de lista y la suma es exacta", () => {
    const r = prorratear(1000, [
      { variant_id: "med", quantity: 2, referencia: 300 }, // 600 de lista
      { variant_id: "ins", quantity: 1, referencia: 200 }, // 200 de lista
      { variant_id: "con", quantity: 1, referencia: 0 }, // sin lista: 0
    ])
    // 800 de lista en total → med 75 %, ins 25 %, consulta 0.
    expect(r.map((x) => x.unit_price)).toEqual([375, 250, 0])
    expect(r.reduce((s, x) => s + x.unit_price * x.quantity, 0)).toBe(1000)
  })

  it("sin precios de lista, a partes iguales", () => {
    const r = prorratear(300, [
      { variant_id: "a", quantity: 1, referencia: 0 },
      { variant_id: "b", quantity: 2, referencia: 0 },
    ])
    expect(r.map((x) => x.unit_price)).toEqual([150, 75])
  })

  it("los centavos del redondeo caen en un renglón de cantidad 1 y la suma cuadra", () => {
    const r = prorratear(100, [
      { variant_id: "a", quantity: 3, referencia: 1 },
      { variant_id: "b", quantity: 1, referencia: 1 },
      { variant_id: "c", quantity: 1, referencia: 1 },
    ])
    expect(r.reduce((s, x) => s + x.unit_price * x.quantity, 0)).toBeCloseTo(100, 2)
    expect(r[0].unit_price).toBe(20)
  })

  it("sin renglones no hay nada que repartir", () => {
    expect(prorratear(100, [])).toEqual([])
  })
})
