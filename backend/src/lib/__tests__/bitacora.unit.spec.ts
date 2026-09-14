import { esLecturaSensible, filtrosDeBitacora, LIMITE_MAXIMO, LIMITE_POR_OMISION } from "../bitacora"
import { csvDeCaducidades, diasRestantes, tramoDe, type LoteProximo } from "../caducidades"

/**
 * Filtros de la bitácora, lecturas que se registran y exportación de
 * caducidades.
 *
 *   npm run test:unit
 */

describe("filtros de la bitácora", () => {
  it("un rango de fechas no devuelve todo: un día a secas cubre el día entero", () => {
    const { filters, error } = filtrosDeBitacora({ from: "2026-09-10", to: "2026-09-10" })
    expect(error).toBeNull()
    expect(filters.created_at.$gte).toBe("2026-09-10T00:00:00.000Z")
    expect(filters.created_at.$lte).toBe("2026-09-10T23:59:59.999Z")
  })

  it("una fecha inválida se rechaza", () => {
    expect(filtrosDeBitacora({ from: "ayer" }).error).not.toBeNull()
  })

  it("el filtro por rol no mezcla y acepta alias", () => {
    expect(filtrosDeBitacora({ user_role: "cashier" }).filters.user_role).toBe("cashier")
    expect(filtrosDeBitacora({ user_role: "cajero" }).filters.user_role).toBe("cashier")
    expect(filtrosDeBitacora({ user_role: "gerente" }).error).not.toBeNull()
  })

  it("el usuario se acepta a secas o completo", () => {
    expect(filtrosDeBitacora({ user_email: "caja" }).filters.user_email).toBe("caja@sigh.local")
    expect(filtrosDeBitacora({ user_email: "ana@clinica.mx" }).filters.user_email).toBe("ana@clinica.mx")
  })

  it("número de empleado normalizado, método en mayúsculas, endpoint por prefijo", () => {
    const { filters } = filtrosDeBitacora({ employee_number: " 0003 ", method: "post", endpoint: "/admin/staff" })
    expect(filters.user_employee_number).toBe("0003")
    expect(filters.method).toBe("POST")
    expect(filters.endpoint).toEqual({ $like: "/admin/staff%" })
    expect(filtrosDeBitacora({ method: "FETCH" }).error).not.toBeNull()
  })

  it("pagina con tope, y sin parámetros usa los valores por omisión", () => {
    expect(filtrosDeBitacora({})).toMatchObject({ take: LIMITE_POR_OMISION, skip: 0 })
    expect(filtrosDeBitacora({ limit: "25", offset: "25" })).toMatchObject({ take: 25, skip: 25 })
    expect(filtrosDeBitacora({ limit: "99999" }).take).toBe(LIMITE_MAXIMO)
    expect(filtrosDeBitacora({ limit: "-3", offset: "x" })).toMatchObject({ take: LIMITE_POR_OMISION, skip: 0 })
  })
})

describe("lecturas sensibles", () => {
  it.each([
    "/admin/customers/cus_1",
    "/admin/customers/cus_1?fields=*",
    "/admin/medical-customers",
    "/admin/medical-customers/cus_1",
    "/admin/clinical-notes?customer_id=cus_1",
    "/admin/clinical-notes/cn_1",
    "/admin/documents/nota/cn_1",
  ])("se registra GET %s", (url) => {
    expect(esLecturaSensible("GET", url)).toBe(true)
  })

  it.each([
    "/admin/customers",
    "/admin/customers?q=ana",
    "/admin/products",
    "/admin/audit-logs",
    "/admin/documents/receta/mo_1",
    "/admin/documents/corte/cs_1",
  ])("no se registra GET %s", (url) => {
    expect(esLecturaSensible("GET", url)).toBe(false)
  })

  it("no aplica a escrituras: ésas ya se registran todas", () => {
    expect(esLecturaSensible("POST", "/admin/customers/cus_1")).toBe(false)
  })
})

describe("caducidades", () => {
  const hoy = new Date(2026, 8, 10)

  it("clasifica por tramo", () => {
    expect(tramoDe(diasRestantes(new Date(2026, 8, 9), hoy))).toBe("expired")
    expect(tramoDe(diasRestantes(new Date(2026, 8, 10), hoy))).toBe("30")
    expect(tramoDe(diasRestantes(new Date(2026, 9, 10), hoy))).toBe("30")
    expect(tramoDe(diasRestantes(new Date(2026, 10, 9), hoy))).toBe("60")
    expect(tramoDe(diasRestantes(new Date(2026, 11, 1), hoy))).toBe("90")
  })

  it("el CSV lleva cabecera, una fila por lote y escapa comas", () => {
    const lote: LoteProximo = {
      batch_id: "b1", batch_number: "L-1", variant_id: "v1", title: "Paracetamol, 500 mg", product_title: null,
      expiration_date: "2026-10-01T00:00:00.000Z", quantity: 12, shelf_location: null,
      stock_location_id: "sloc", stock_location_name: "Almacén de Enfermería", status: "active", days_left: 21, tier: "30",
    }
    const csv = csvDeCaducidades([lote])
    const lineas = csv.replace("﻿", "").trim().split("\r\n")
    expect(lineas).toHaveLength(2)
    expect(lineas[0]).toContain("Almacén,Presentación,Lote,Caducidad")
    expect(lineas[1]).toContain('"Paracetamol, 500 mg"')
    expect(lineas[1]).toContain("Almacén de Enfermería,")
    expect(lineas[1]).toContain(",2026-10-01,21,30 días o menos,12,Activo,")
  })
})
