import { codigoDe, codigosAjenos, esCodigoDeAseguranza, normalizarAseguranzasDePaciente, resolverAseguranza, revisarAseguranza, vigente } from "../aseguranzas"

/**
 * Aseguranzas: descuento obligatorio, sólo a medicamentos, sin descuentos generales.
 *
 *   npm run test:unit
 */

const gnp = { id: "ins_01ABC", name: "GNP", discount_percent: 20, status: "active" }
const axa = { id: "ins_02DEF", name: "AXA", discount_percent: 15, status: "active" }

describe("alta de una aseguranza", () => {
  it("exige nombre y un porcentaje de 1 a 100", () => {
    expect(revisarAseguranza({ name: "GNP", discount_percent: 20 })).toBeNull()
    expect(revisarAseguranza({ name: " ", discount_percent: 20 })).toMatch(/nombre/)
    expect(revisarAseguranza({ name: "GNP", discount_percent: 0 })).toMatch(/1 a 100/)
    expect(revisarAseguranza({ name: "GNP", discount_percent: 120 })).toMatch(/1 a 100/)
    expect(revisarAseguranza({ name: "GNP", discount_percent: "x" })).toMatch(/1 a 100/)
  })

  it("el código de su promoción es fijo por id y se reconoce", () => {
    expect(codigoDe("ins_01ABC")).toBe("ASEG-INS01ABC")
    expect(esCodigoDeAseguranza(codigoDe("ins_01ABC"))).toBe(true)
    expect(esCodigoDeAseguranza("VERANO10")).toBe(false)
  })

  it("vigente = activa y dentro de fechas", () => {
    const hoy = new Date("2026-09-26T12:00:00Z")
    expect(vigente(gnp, hoy)).toBe(true)
    expect(vigente({ ...gnp, status: "inactive" }, hoy)).toBe(false)
    expect(vigente({ ...gnp, valid_until: "2026-09-01" }, hoy)).toBe(false)
    expect(vigente({ ...gnp, valid_from: "2026-10-01" }, hoy)).toBe(false)
    expect(vigente({ ...gnp, valid_from: "2026-09-01", valid_until: "2026-12-31" }, hoy)).toBe(true)
  })
})

describe("las aseguranzas del paciente", () => {
  it("se guardan como lista limpia, sin repetidos", () => {
    expect(normalizarAseguranzasDePaciente(null)).toEqual({ lista: [], error: null })
    expect(normalizarAseguranzasDePaciente([{ insurance_id: "a", policy_number: " 123 " }, { insurance_id: "a" }, { insurance_id: "b", policy_number: "" }])).toEqual({
      lista: [
        { insurance_id: "a", policy_number: "123" },
        { insurance_id: "b", policy_number: null },
      ],
      error: null,
    })
    expect(normalizarAseguranzasDePaciente("GNP").error).toMatch(/lista/)
    expect(normalizarAseguranzasDePaciente([{ policy_number: "1" }]).error).toMatch(/insurance_id/)
  })
})

describe("cuál se aplica al cobrar", () => {
  it("sin aseguranza, ninguna; con una, ésa", () => {
    expect(resolverAseguranza([]).aseguranza).toBeNull()
    expect(resolverAseguranza([gnp]).aseguranza?.id).toBe("ins_01ABC")
  })

  it("con varias hay que elegir, y sólo entre las del paciente", () => {
    const sinElegir = resolverAseguranza([gnp, axa])
    expect(sinElegir.aseguranza).toBeNull()
    expect(sinElegir.type).toBe("aseguranza_pendiente")
    expect(sinElegir.error).toMatch(/GNP, AXA/)
    expect(resolverAseguranza([gnp, axa], "ins_02DEF").aseguranza?.name).toBe("AXA")
    expect(resolverAseguranza([gnp, axa], "ins_99").type).toBe("aseguranza_ajena")
  })

  it("los códigos que no son de aseguranza son descuentos generales", () => {
    expect(codigosAjenos(["ASEG-INS01ABC", "VERANO10", null, "VERANO10"])).toEqual(["VERANO10"])
    expect(codigosAjenos(["ASEG-INS01ABC"])).toEqual([])
  })
})
