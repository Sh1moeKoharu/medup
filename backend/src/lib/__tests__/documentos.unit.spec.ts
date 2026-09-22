import { htmlCorte, htmlNota, htmlReceta } from "../documentos"
import { calcularResumen } from "../corte-de-caja"

/**
 * Los tres documentos impresos y la aritmética del corte.
 *
 *   npm run test:unit
 */

const membrete = { establecimiento: "Clínica Altus", direccion: "Av. Siempre Viva 1", telefono: "555", rfc: "XAXX010101000" }

describe("receta", () => {
  const base = {
    membrete,
    folio: "mo_1",
    fecha: "2026-09-10T12:00:00Z",
    paciente: "Ana Torres",
    prescriptor: "Dr. Pérez",
    rol_prescriptor: "Médico",
    destinatario: "nursing",
    renglones: [{ product_title: "Paracetamol 500 mg", quantity: 2, instructions: "1 cada 8 h" }],
    perfil: { cedula_profesional: "12345678", universidad: "UNAM", especialidad: "Medicina general" },
  }

  it("lleva folio, paciente, prescriptor y renglones", () => {
    const html = htmlReceta(base)!
    expect(html).toContain("MO_1")
    expect(html).toContain("Ana Torres")
    expect(html).toContain("Dr. Pérez")
    expect(html).toContain("Paracetamol 500 mg")
    expect(html).toContain("1 cada 8 h")
    expect(html).toContain("Clínica Altus")
    expect(html).toContain("Aplica Enfermería")
  })

  it("dice a quién va", () => {
    expect(htmlReceta({ ...base, destinatario: "pharmacy" })).toContain("Surte Farmacia")
  })

  it("sin renglones no se genera", () => {
    expect(htmlReceta({ ...base, renglones: [] })).toBeNull()
  })

  it("va en media carta, con cédula y universidad del médico (punto 9 y 15)", () => {
    const html = htmlReceta(base)!
    expect(html).toContain("size: 5.5in 8.5in")
    expect(html).toContain("Cédula profesional 12345678")
    expect(html).toContain("UNAM")
    expect(html).toContain("Céd. prof. 12345678")
  })

  it("lleva los logotipos de la clínica y del médico si existen", () => {
    const html = htmlReceta({ ...base, membrete: { ...membrete, logo_url: "/static/clinica.png" }, perfil: { ...base.perfil, logo_url: "/static/medico.png" } })!
    expect(html).toContain('src="/static/clinica.png"')
    expect(html).toContain('src="/static/medico.png"')
  })

  it("escapa el HTML del contenido", () => {
    const html = htmlReceta({ ...base, paciente: "<script>alert(1)</script>" })!
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("nota de atención", () => {
  const base = {
    membrete,
    folio: "cn_1",
    fecha: "2026-09-10T12:00:00Z",
    paciente: "Ana Torres",
    autor: "Enf. López",
    rol_autor: "Enfermería",
    contenido: "Se aplicó 1 ampolleta. Sin reacción.",
    orden_folio: "mo_1",
  }

  it("lleva folio, paciente, autor, contenido y orden", () => {
    const html = htmlNota(base)!
    for (const t of ["cn_1", "Ana Torres", "Enf. López", "Sin reacción", "mo_1"]) expect(html).toContain(t)
  })

  it("una nota sin contenido no se genera", () => {
    expect(htmlNota({ ...base, contenido: "   " })).toBeNull()
  })
})

describe("corte de caja", () => {
  const movimientos = [
    { type: "sale", payment_method: "cash", amount: 100 },
    { type: "sale", payment_method: "card", amount: 250 },
    { type: "sale", payment_method: "transfer", amount: 50 },
    { type: "refund", payment_method: "cash", amount: 20 },
    { type: "cash_in", payment_method: "cash", amount: 500 },
    { type: "cash_out", payment_method: "cash", amount: 30 },
  ]

  it("cuadra: fondo + efectivo − reembolsos + entradas − salidas", () => {
    const r = calcularResumen(1000, movimientos)
    expect(r.sales_total).toBe(400)
    expect(r.transaction_count).toBe(3)
    expect(r.expected_cash_in_register).toBe(1000 + 100 - 20 + 500 - 30)
    expect(r.total_revenue).toBe(380)
  })

  it("el corte impreso lleva cajero, ventas por método y diferencia", () => {
    const html = htmlCorte({
      membrete,
      folio: "cs_1",
      cajero: "Caja Pruebas",
      abierto: "2026-09-10T08:00:00Z",
      cerrado: "2026-09-10T18:00:00Z",
      resumen: calcularResumen(1000, movimientos),
      contado: 1545,
      diferencia: -5,
    })!
    for (const t of ["cs_1", "Caja Pruebas", "Efectivo", "Tarjeta", "Transferencia", "Esperado en caja", "Faltante"]) expect(html).toContain(t)
  })

  it("un turno abierto se imprime sin conteo", () => {
    const html = htmlCorte({ membrete, folio: "cs_2", cajero: "Caja", abierto: "2026-09-10T08:00:00Z", resumen: calcularResumen(0, []) })!
    expect(html).toContain("turno abierto")
    expect(html).not.toContain("Contado")
  })
})
