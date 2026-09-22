import { componerContenido, fechaDeAtencion, filtroDeLectura, puedeLeerNota, revisarNota } from "../notas-clinicas"
import { normalizarPerfil, perfilCompleto, revisarPerfil } from "../perfil-profesional"
import { revisarRenglonesDeReceta } from "../receta"
import { ROLES } from "../roles"

/**
 * Receta del médico (puntos 7, 8, 10–12 y 15).
 *
 *   npm run test:unit
 */

describe("datos profesionales del médico", () => {
  it("se limpian y se descartan los campos desconocidos", () => {
    expect(normalizarPerfil({ cedula_profesional: " 12345678 ", universidad: "UNAM", color: "rojo", especialidad: "" })).toEqual({
      cedula_profesional: "12345678",
      universidad: "UNAM",
    })
  })

  it("un médico necesita cédula y universidad", () => {
    expect(revisarPerfil({}, ROLES.DOCTOR)).toMatch(/cédula/)
    expect(revisarPerfil({ cedula_profesional: "12345678" }, ROLES.DOCTOR)).toMatch(/universidad/)
    expect(revisarPerfil({ cedula_profesional: "12345678", universidad: "UNAM" }, ROLES.DOCTOR)).toBeNull()
    expect(revisarPerfil({}, ROLES.NURSE)).toBeNull()
  })

  it("la cédula son dígitos y el logotipo una imagen del sistema", () => {
    expect(revisarPerfil({ cedula_profesional: "ABC123" }, ROLES.NURSE)).toMatch(/dígitos/)
    expect(revisarPerfil({ logo_url: "javascript:alert(1)" }, ROLES.NURSE)).toMatch(/imagen/)
    expect(revisarPerfil({ logo_url: "http://192.168.100.250/static/logo.png" }, ROLES.NURSE)).toBeNull()
    expect(perfilCompleto({ cedula_profesional: "12345678", universidad: "UNAM" })).toBe(true)
  })
})

describe("renglones de la receta", () => {
  const renglon = { variant_id: "variant_1", quantity: 1, instructions: "1 cada 8 h" }

  it("lo que receta el médico va con indicaciones", () => {
    expect(revisarRenglonesDeReceta([renglon], { exigirIndicaciones: true })).toBeNull()
    expect(revisarRenglonesDeReceta([{ ...renglon, instructions: "  " }], { exigirIndicaciones: true })).toMatch(/indicaciones/)
    expect(revisarRenglonesDeReceta([{ ...renglon, instructions: undefined }], { exigirIndicaciones: false })).toBeNull()
  })

  it("cantidad entera y medicamento identificado", () => {
    expect(revisarRenglonesDeReceta([{ ...renglon, quantity: 0 }], { exigirIndicaciones: false })).toMatch(/cantidad/)
    expect(revisarRenglonesDeReceta([{ ...renglon, quantity: 1.5 }], { exigirIndicaciones: false })).toMatch(/cantidad/)
    expect(revisarRenglonesDeReceta([{ ...renglon, variant_id: "" }], { exigirIndicaciones: false })).toMatch(/medicamento/)
  })
})

describe("nota de atención", () => {
  it("con estructura exige las dos partes", () => {
    expect(revisarNota({ findings: "Faringe hiperémica", procedures: "" })).toMatch(/hiciste/)
    expect(revisarNota({ findings: "", procedures: "Antipirético" })).toMatch(/revisaste/)
    expect(revisarNota({ findings: "Faringe hiperémica", procedures: "Antipirético" })).toBeNull()
    expect(revisarNota({ content: "Se aplicó sin reacción" })).toBeNull()
    expect(revisarNota({ content: "ok" })).not.toBeNull()
  })

  it("el texto completo lleva las dos partes rotuladas", () => {
    expect(componerContenido({ findings: "Faringe hiperémica", procedures: "Antipirético" })).toBe("Revisión: Faringe hiperémica\n\nLo que se hizo: Antipirético")
  })

  it("la fecha de atención es un día de la clínica y no puede ser futura", () => {
    const ahora = new Date("2026-09-14T18:00:00Z")
    // Mediodía del 13 en Tijuana (UTC−7) = 19:00Z.
    expect(fechaDeAtencion("2026-09-13", ahora).fecha?.toISOString()).toBe("2026-09-13T19:00:00.000Z")
    expect(fechaDeAtencion("2026-10-01", ahora).error).toMatch(/futura/)
    expect(fechaDeAtencion("13/09/2026", ahora).error).not.toBeNull()
    expect(fechaDeAtencion("", ahora)).toEqual({ fecha: null, error: null })
  })

  it("Enfermería lee sólo las notas de Enfermería", () => {
    expect(puedeLeerNota(ROLES.NURSE, { author_role: "doctor" })).toBe(false)
    expect(puedeLeerNota(ROLES.NURSE, { author_role: "nurse" })).toBe(true)
    expect(puedeLeerNota(ROLES.DOCTOR, { author_role: "nurse" })).toBe(true)
    expect(puedeLeerNota(ROLES.AUDITOR, { author_role: "doctor" })).toBe(true)
    expect(puedeLeerNota(ROLES.CASHIER, { author_role: "doctor" })).toBe(false)
    expect(filtroDeLectura(ROLES.NURSE)).toEqual({ author_role: "nurse" })
    expect(filtroDeLectura(ROLES.DOCTOR)).toEqual({})
  })
})
