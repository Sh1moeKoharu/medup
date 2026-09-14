import { agregarSesiones, claveDePeriodo, revisarReferenciaDeTerminal } from "../caja"

/**
 * Referencia de la terminal y agregación de turnos.
 *
 *   npm run test:unit
 */

describe("referencia de terminal", () => {
  it.each(["1234", "12345", "123456", " 4321 "])("acepta %p", (r) => {
    expect(revisarReferenciaDeTerminal(r)).toBeNull()
  })

  it.each(["", "123", "1234567", "12a4", "12 34", null, undefined])("rechaza %p", (r) => {
    expect(revisarReferenciaDeTerminal(r)).not.toBeNull()
  })
})

describe("agregación de turnos", () => {
  const sesion = (id: string, opened_at: string, status = "closed", cajero = "Caja") => ({
    id,
    status,
    opened_at,
    opening_amount: 100,
    cashier_name: cajero,
  })
  const venta = (payment_method: string, amount: number) => ({ type: "sale", payment_method, amount })

  it("dos turnos de la misma semana suman", () => {
    const periodos = agregarSesiones(
      [sesion("a", "2026-09-07T09:00:00Z"), sesion("b", "2026-09-09T09:00:00Z", "closed", "Otra")],
      { a: [venta("cash", 100), venta("card", 50)], b: [venta("cash", 20)] },
      "week"
    )
    expect(periodos).toHaveLength(1)
    expect(periodos[0].periodo).toBe("2026-W37")
    expect(periodos[0].sesiones).toBe(2)
    expect(periodos[0].sales_cash).toBe(120)
    expect(periodos[0].sales_card).toBe(50)
    expect(periodos[0].sales_total).toBe(170)
    expect(periodos[0].cajeros.sort()).toEqual(["Caja", "Otra"])
  })

  it("por día separa lo que por semana junta", () => {
    const periodos = agregarSesiones(
      [sesion("a", "2026-09-07T09:00:00Z"), sesion("b", "2026-09-09T09:00:00Z")],
      { a: [venta("cash", 100)], b: [venta("cash", 20)] },
      "day"
    )
    expect(periodos.map((p) => p.periodo)).toEqual(["2026-09-09", "2026-09-07"])
  })

  it("por mes junta septiembre entero", () => {
    const periodos = agregarSesiones(
      [sesion("a", "2026-09-01T09:00:00Z"), sesion("b", "2026-09-30T23:00:00Z"), sesion("c", "2026-10-01T00:30:00Z")],
      { a: [venta("cash", 1)], b: [venta("cash", 2)], c: [venta("cash", 4)] },
      "month"
    )
    expect(periodos.find((p) => p.periodo === "2026-09")?.sales_total).toBe(3)
    expect(periodos.find((p) => p.periodo === "2026-10")?.sales_total).toBe(4)
  })

  it("un turno abierto no cuenta", () => {
    const periodos = agregarSesiones(
      [sesion("a", "2026-09-07T09:00:00Z"), sesion("b", "2026-09-07T12:00:00Z", "open")],
      { a: [venta("cash", 100)], b: [venta("cash", 999)] },
      "day"
    )
    expect(periodos[0].sesiones).toBe(1)
    expect(periodos[0].sales_total).toBe(100)
  })

  it("la semana ISO empieza en lunes", () => {
    expect(claveDePeriodo("2026-09-13T23:00:00Z", "week").periodo).toBe("2026-W37") // domingo
    expect(claveDePeriodo("2026-09-14T01:00:00Z", "week").periodo).toBe("2026-W38") // lunes
  })
})
