import { costoPorUnidadDeVenta, revisarFactor, unidadesDeVenta } from "../unidades"
import { precioConMargen, revisarMargen } from "../margen"
import { AREAS, elegirAlmacen, type Almacen } from "../almacenes"

/**
 * Unidades de compra y venta, margen automático y elección de almacén.
 *
 *   npm run test:unit
 */

describe("unidades de compra y venta", () => {
  it("3 cajas de 20 son 60 unidades de venta", () => {
    expect(unidadesDeVenta(3, 20)).toBe(60)
  })

  it("con factor 1 no cambia nada", () => {
    expect(unidadesDeVenta(7, 1)).toBe(7)
    expect(unidadesDeVenta(7)).toBe(7)
  })

  it("el costo por unidad de venta se reparte entre el factor", () => {
    expect(costoPorUnidadDeVenta(100, 20)).toBe(5)
    expect(costoPorUnidadDeVenta(100)).toBe(100)
  })

  it.each([0, -1, 1.5, "abc", null])("rechaza el factor %p", (f) => {
    expect(revisarFactor(f)).not.toBeNull()
    expect(() => unidadesDeVenta(1, f as any)).toThrow()
  })

  it("rechaza una cantidad comprada que no es positiva", () => {
    expect(() => unidadesDeVenta(0, 20)).toThrow()
    expect(() => unidadesDeVenta(-2, 20)).toThrow()
  })
})

describe("margen automático", () => {
  it("costo 10 y margen 30 dan 13", () => {
    expect(precioConMargen(10, 30)).toBe(13)
    expect(precioConMargen("10", "30")).toBe(13)
  })

  it("redondea a centavos", () => {
    expect(precioConMargen(3.33, 25)).toBe(4.16)
    expect(precioConMargen(1, 0.5)).toBe(1.01)
  })

  it("sin costo o sin margen no toca el precio", () => {
    expect(precioConMargen(null, 30)).toBeNull()
    expect(precioConMargen("", 30)).toBeNull()
    expect(precioConMargen(10, null)).toBeNull()
    expect(precioConMargen(10, "")).toBeNull()
    expect(precioConMargen(10, "abc")).toBeNull()
  })

  it("margen 0 vende a costo", () => {
    expect(precioConMargen(10, 0)).toBe(10)
  })

  it("un margen negativo no vale; vacío sí (es opcional)", () => {
    expect(revisarMargen(-5)).not.toBeNull()
    expect(revisarMargen("")).toBeNull()
    expect(revisarMargen(30)).toBeNull()
  })
})

describe("elección de almacén", () => {
  const farmacia: Almacen = { id: "f", name: "Farmacia", area: AREAS.FARMACIA }
  const enfermeria: Almacen = { id: "e", name: "Enfermería", area: AREAS.ENFERMERIA }
  const sinArea: Almacen = { id: "p", name: "Almacén principal", area: null }

  it("elige por área, no por nombre", () => {
    expect(elegirAlmacen([enfermeria, farmacia], AREAS.FARMACIA)?.id).toBe("f")
    expect(elegirAlmacen([enfermeria, farmacia], AREAS.ENFERMERIA)?.id).toBe("e")
  })

  it("una instalación anterior con un solo almacén sin área: ése es Farmacia", () => {
    expect(elegirAlmacen([sinArea], AREAS.FARMACIA)?.id).toBe("p")
    expect(elegirAlmacen([sinArea], AREAS.ENFERMERIA)).toBeNull()
  })

  it("con varios sin área no adivina", () => {
    expect(elegirAlmacen([sinArea, { ...sinArea, id: "q" }], AREAS.FARMACIA)).toBeNull()
  })
})
