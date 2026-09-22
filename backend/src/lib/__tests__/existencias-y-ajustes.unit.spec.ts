import { limpiarMotivo, revisarAjuste } from "../ajustes-de-orden"
import { renglonesSinExistencia, sumarPorArea } from "../existencias-por-area"
import { ROLES } from "../roles"

/**
 * Existencia por área (puntos 19 y 21) y ajustes con motivo (punto 18).
 *
 *   npm run test:unit
 */

describe("existencia por área", () => {
  const areas = new Map<string, string | null>([["loc_enf", "nursing"], ["loc_far", "pharmacy"], ["loc_x", null]])

  it("suma lo activo de cada almacén y descarta cuarentena, vacíos y almacenes sin área", () => {
    const sumas = sumarPorArea(
      [
        { variant_id: "v1", quantity: 5, status: "active", stock_location_id: "loc_enf" },
        { variant_id: "v1", quantity: "3", status: "active", stock_location_id: "loc_enf" },
        { variant_id: "v1", quantity: 40, status: "active", stock_location_id: "loc_far" },
        { variant_id: "v1", quantity: 9, status: "quarantined", stock_location_id: "loc_far" },
        { variant_id: "v1", quantity: 0, status: "active", stock_location_id: "loc_far" },
        { variant_id: "v1", quantity: 7, status: "active", stock_location_id: "loc_x" },
      ],
      areas
    )
    expect(sumas.get("v1")).toEqual({ nursing: 8, pharmacy: 40 })
  })

  it("una receta no pide más de lo que hay entre los dos almacenes, sumando renglones repetidos", () => {
    const existencias = new Map([["v1", { nursing: 2, pharmacy: 3 }]])
    expect(renglonesSinExistencia([{ variant_id: "v1", quantity: 5 }], existencias)).toEqual([])
    expect(renglonesSinExistencia([{ variant_id: "v1", quantity: 3 }, { variant_id: "v1", quantity: 3, product_title: "Paracetamol" }], existencias)).toEqual([
      { variant_id: "v1", product_title: null, solicitado: 6, disponible: 5 },
    ])
    expect(renglonesSinExistencia([{ variant_id: "v2", quantity: 1, product_title: "Nada" }], existencias)[0].disponible).toBe(0)
  })
})

describe("ajustes con motivo", () => {
  const reducir = [{ variant_id: "v1", antes: 4, despues: 3 }]
  const aumentar = [{ variant_id: "v1", antes: 1, despues: 2 }]
  const motivo = "El paciente rechazó la cuarta dosis"

  it("Enfermería y Farmacia necesitan 20 caracteres de motivo para quitar o reducir", () => {
    expect(revisarAjuste(ROLES.NURSE, reducir, "")).toMatch(/20/)
    expect(revisarAjuste(ROLES.NURSE, reducir, "   ya     no  ")).toMatch(/20/)
    expect(revisarAjuste(ROLES.NURSE, reducir, motivo)).toBeNull()
    expect(revisarAjuste(ROLES.PHARMACY, [{ variant_id: "v1", antes: 2, despues: 0 }], motivo)).toBeNull()
  })

  it("aumentar no pide motivo; el médico y Administración ajustan sin él", () => {
    expect(revisarAjuste(ROLES.NURSE, aumentar, undefined)).toBeNull()
    expect(revisarAjuste(ROLES.DOCTOR, reducir, undefined)).toBeNull()
    expect(revisarAjuste(ROLES.ADMIN, reducir, undefined)).toBeNull()
  })

  it("Farmacia no añade ni aumenta", () => {
    expect(revisarAjuste(ROLES.PHARMACY, aumentar, motivo)).toMatch(/sólo puede quitar o reducir/)
  })

  it("el motivo se guarda sin espacios de más", () => {
    expect(limpiarMotivo("  No   hay\nexistencia  ")).toBe("No hay existencia")
  })
})
