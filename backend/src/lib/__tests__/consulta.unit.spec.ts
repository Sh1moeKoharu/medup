import { esConsulta, esPrecioVariable, motivoPrecioPendiente, renglonesSinPrecio } from "../consulta"

/**
 * Consulta: producto de precio variable que Caja pone al cobrar.
 *
 *   npm run test:unit
 */

const consulta = (unit_price: number, extra: Record<string, unknown> = {}) => ({
  title: "Consulta",
  unit_price,
  quantity: 1,
  metadata: { altus_consulta: true, altus_precio_variable: true },
  ...extra,
})
const paracetamol = { title: "Paracetamol", unit_price: 25, quantity: 2, metadata: { altus_consumido_en_consulta: true } }

describe("qué renglón es de precio variable", () => {
  it("por la marca en el renglón o en su producto", () => {
    expect(esPrecioVariable(consulta(0))).toBe(true)
    expect(esPrecioVariable({ title: "Consulta", unit_price: 0, variant: { product: { metadata: { altus_precio_variable: true } } } })).toBe(true)
    expect(esPrecioVariable({ title: "Consulta", unit_price: 0, product: { metadata: { altus_precio_variable: true } } })).toBe(true)
    expect(esPrecioVariable(paracetamol)).toBe(false)
    expect(esConsulta(consulta(0))).toBe(true)
    expect(esConsulta(paracetamol)).toBe(false)
  })
})

describe("no se cobra un precio variable en cero", () => {
  it("con precio, se cobra", () => {
    expect(motivoPrecioPendiente([consulta(350), paracetamol])).toBeNull()
  })

  it("en cero, dice cuál falta y dónde ponerlo", () => {
    expect(renglonesSinPrecio([consulta(0), paracetamol])).toEqual(["Consulta"])
    expect(motivoPrecioPendiente([consulta(0)])).toMatch(/^Falta poner el precio de: Consulta\./)
  })

  it("un medicamento en cero no es problema de esta regla, y un renglón quitado tampoco", () => {
    expect(motivoPrecioPendiente([{ ...paracetamol, unit_price: 0 }])).toBeNull()
    expect(motivoPrecioPendiente([consulta(0, { quantity: 0 })])).toBeNull()
  })
})
