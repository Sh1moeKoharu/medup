import { motivoParaNoCobrar } from "../cobro-de-cuentas"

/**
 * Nada se cobra mientras Enfermería tenga algo sin aplicar.
 *
 *   npm run test:unit
 */

describe("motivo para no cobrar", () => {
  it("sin pendientes se cobra", () => {
    expect(motivoParaNoCobrar([])).toBeNull()
  })

  it("con una orden pendiente lo dice con el nombre del paciente", () => {
    const motivo = motivoParaNoCobrar([{ customer_name: "María López", created_at: "2026-09-24T10:00:00Z" }])
    expect(motivo).toMatch(/^María López tiene una orden en Enfermería sin aplicar/)
    expect(motivo).toMatch(/Por cobrar/)
  })

  it("cuenta las órdenes y no se cae sin nombre", () => {
    expect(motivoParaNoCobrar([{ customer_name: null }, { customer_name: "  " }])).toMatch(/^El paciente tiene 2 órdenes/)
  })
})
