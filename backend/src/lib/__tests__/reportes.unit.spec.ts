import { clasificarAccion } from "../acciones"
import { diaLocal, resumirActividad, totalizarPorPersona } from "../actividad"
import { aCsv } from "../csv"
import { csvDeTabla, htmlDeTabla, nombreDeArchivo, puedeLeerReporte, rangoDeFechas, reportesPara, type Tabla } from "../reportes"
import { ROLES } from "../roles"

/**
 * Reportes exportables (punto 23) y actividad por persona (punto 24).
 *
 *   npm run test:unit
 */

describe("CSV para Excel", () => {
  it("lleva BOM, CRLF y escapa comas, comillas y saltos", () => {
    const csv = aCsv(["Nombre", "Nota"], [["Pérez, Ana", 'dijo "sí"'], ["Luis", "dos\nlíneas"]])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toBe('﻿Nombre,Nota\r\n"Pérez, Ana","dijo ""sí"""\r\nLuis,"dos\nlíneas"\r\n')
  })

  it("los números salen como número, sin formato de moneda", () => {
    const t: Tabla = {
      titulo: "x",
      columnas: [{ clave: "a", etiqueta: "A" }, { clave: "m", etiqueta: "Monto", tipo: "dinero" }],
      filas: [{ a: "uno", m: 1234.567 }],
      totales: { m: 1234.567 },
    }
    expect(csvDeTabla(t)).toBe("﻿A,Monto\r\nuno,1234.57\r\nTotal,1234.57\r\n")
  })
})

describe("rango de fechas en hora de la clínica", () => {
  it("un día a secas cubre ese día en la hora de la clínica (Tijuana)", () => {
    const r = rangoDeFechas("2026-09-14", "2026-09-14")
    expect(r.error).toBeNull()
    expect(r.desde).toBe("2026-09-14T07:00:00.000Z")
    expect(r.hasta).toBe("2026-09-15T06:59:59.999Z")
  })

  it("rechaza fechas ilegibles y rangos al revés", () => {
    expect(rangoDeFechas("14/09/2026").error).not.toBeNull()
    expect(rangoDeFechas("2026-09-14", "2026-09-01").error).not.toBeNull()
    expect(rangoDeFechas().error).toBeNull()
  })

  it("el nombre del archivo lleva el periodo", () => {
    const r = rangoDeFechas("2026-09-01", "2026-09-14")
    expect(nombreDeArchivo("actividad", r)).toBe("actividad-2026-09-01-a-2026-09-14.csv")
  })
})

describe("quién lee cada reporte", () => {
  it("Administración y Auditoría leen todos", () => {
    expect(reportesPara(ROLES.ADMIN).length).toBe(9)
    expect(reportesPara(ROLES.AUDITOR).length).toBe(9)
  })

  it("RH ve la nómina, no lo clínico ni la bitácora", () => {
    expect(puedeLeerReporte(ROLES.HR, "actividad")).toBe(true)
    expect(puedeLeerReporte(ROLES.HR, "honorarios")).toBe(true)
    expect(puedeLeerReporte(ROLES.HR, "recetas")).toBe(false)
    expect(puedeLeerReporte(ROLES.HR, "bitacora")).toBe(false)
    expect(puedeLeerReporte(ROLES.HR, "inventario")).toBe(false)
  })

  it("Almacén ve sólo el inventario", () => {
    expect(reportesPara(ROLES.WAREHOUSE).map((r) => r.tipo).sort()).toEqual(["caducidades", "inventario", "movimientos"])
  })

  it("el resto del personal, ninguno", () => {
    for (const rol of [ROLES.CASHIER, ROLES.DOCTOR, ROLES.NURSE, ROLES.PHARMACY]) {
      expect(reportesPara(rol)).toEqual([])
    }
    expect(reportesPara(null)).toEqual([])
  })
})

describe("la hoja impresa", () => {
  const t: Tabla = {
    titulo: "Cortes <de> caja",
    subtitulo: "Del 01/09/2026 al 14/09/2026",
    columnas: [{ clave: "c", etiqueta: "Cajero" }, { clave: "v", etiqueta: "Ventas", tipo: "dinero" }],
    filas: [{ c: "Ana", v: 100 }],
    totales: { v: 100 },
    notas: ["Una nota"],
  }

  it("va en carta horizontal, con membrete, totales y quién la generó", () => {
    const html = htmlDeTabla(t, { establecimiento: "Clínica Altus", rfc: "XAXX010101000" }, { generado_por: "Auditoría Pruebas" })
    expect(html).toContain("size: letter landscape")
    expect(html).toContain("Clínica Altus")
    expect(html).toContain("RFC XAXX010101000")
    expect(html).toContain(">Total</td>")
    expect(html).toContain("por Auditoría Pruebas")
    expect(html).toContain("Una nota")
  })

  it("un día a secas no se corre al día anterior", () => {
    const html = htmlDeTabla({ ...t, columnas: [{ clave: "d", etiqueta: "Día", tipo: "fecha" }], filas: [{ d: "2026-09-14" }], totales: undefined }, { establecimiento: "x" })
    expect(html).toContain("14/09/2026")
  })

  it("escapa el contenido", () => {
    expect(htmlDeTabla(t, { establecimiento: "x" })).toContain("Cortes &lt;de&gt; caja")
  })

  it("sin filas lo dice, en vez de imprimir una tabla vacía", () => {
    expect(htmlDeTabla({ ...t, filas: [] }, { establecimiento: "x" })).toContain("Sin registros en este periodo.")
  })
})

describe("qué significa cada asiento", () => {
  it("traduce y clasifica", () => {
    expect(clasificarAccion("POST", "/admin/medical-orders/ord_1/consume")).toEqual({ descripcion: "Aplicó una orden en consulta", categoria: "orden_aplicada" })
    expect(clasificarAccion("POST", "/admin/draft-orders/d_1/convert-to-order").categoria).toBe("venta")
    expect(clasificarAccion("POST", "/admin/medical-orders").categoria).toBe("receta_emitida")
    expect(clasificarAccion("GET", "/admin/customers/cus_1").categoria).toBe("consulta")
    expect(clasificarAccion("POST", "Inicio de sesión").categoria).toBe("acceso")
  })
})

describe("actividad por persona", () => {
  const personas = [
    { id: "u_caja", nombre: "Ana Caja", usuario: "caja", correo: "caja@sigh.local", rol: "cashier", numero_empleado: "0003" },
    { id: "u_med", nombre: "Luis Médico", usuario: "medico", rol: "doctor", numero_empleado: "0004" },
  ]
  // 2026-09-14 en la clínica (Tijuana, UTC−7): de 07:00Z del 14 a 06:59Z del 15.
  const asientos = [
    { user_id: null, user_email: "caja@sigh.local", method: "POST", endpoint: "Inicio de sesión", created_at: "2026-09-14T14:55:00Z" },
    { user_id: "u_caja", method: "POST", endpoint: "/admin/draft-orders/d1/convert-to-order", created_at: "2026-09-14T16:00:00Z" },
    { user_id: "u_caja", method: "POST", endpoint: "/admin/draft-orders/d2/convert-to-order", created_at: "2026-09-15T01:30:00Z" },
    { user_id: "u_caja", method: "GET", endpoint: "/admin/customers/c1", created_at: "2026-09-14T17:00:00Z" },
    { user_id: "u_med", method: "POST", endpoint: "/admin/medical-orders", created_at: "2026-09-14T18:00:00Z" },
    { user_id: null, user_email: null, method: "POST", endpoint: "Inicio de sesión", created_at: "2026-09-14T18:00:00Z" },
    { user_id: null, user_email: "no.existe@sigh.local", method: "POST", endpoint: "Inicio de sesión", created_at: "2026-09-14T18:05:00Z" },
  ]
  const turnos = [
    { user_id: "u_caja", tipo: "caja" as const, inicio: "2026-09-14T15:00:00Z", fin: "2026-09-14T23:30:00Z", cobrado: 450 },
    { user_id: "u_med", tipo: "consulta" as const, inicio: "2026-09-14T17:00:00Z", fin: null },
  ]
  const filas = resumirActividad({ asientos, turnos, personas, ahora: new Date("2026-09-14T19:00:00Z") })

  it("el día es el de la clínica, no el de UTC", () => {
    expect(diaLocal("2026-09-15T01:30:00Z")).toBe("2026-09-14")
    const caja = filas.find((f) => f.user_id === "u_caja")!
    expect(filas.filter((f) => f.user_id === "u_caja")).toHaveLength(1)
    expect(caja.conteos.venta).toBe(2)
    expect(caja.ultima_accion).toBe("2026-09-15T01:30:00.000Z")
    // El acceso llegó sin id, con el correo: cuenta como la primera acción de Ana.
    expect(caja.primera_accion).toBe("2026-09-14T14:55:00.000Z")
  })

  it("horas, cobrado y acciones; el acceso y las consultas no cuentan como acción", () => {
    const caja = filas.find((f) => f.user_id === "u_caja")!
    expect(caja.horas_en_turno).toBe(8.5)
    expect(caja.cobrado).toBe(450)
    expect(caja.acciones).toBe(2)
    expect(caja.consultas).toBe(1)
    expect(caja.numero_empleado).toBe("0003")
  })

  it("un turno abierto cuenta hasta el momento del reporte", () => {
    expect(filas.find((f) => f.user_id === "u_med")!.horas_en_turno).toBe(2)
  })

  it("lo que no tiene persona no se atribuye a nadie", () => {
    expect(filas).toHaveLength(2)
  })

  it("por persona suma los días", () => {
    const dos = resumirActividad({
      asientos: [...asientos, { user_id: "u_caja", method: "POST", endpoint: "/admin/cash-sessions", created_at: "2026-09-16T15:00:00Z" }],
      turnos,
      personas,
      ahora: new Date("2026-09-14T19:00:00Z"),
    })
    const caja = totalizarPorPersona(dos).find((f) => f.user_id === "u_caja")!
    expect(caja.dias).toBe(2)
    expect(caja.acciones).toBe(3)
    expect(caja.conteos.caja).toBeUndefined()
  })
})

describe("zona horaria de la clínica", () => {
  // Importado aquí para no tocar el encabezado del archivo.
  const { instanteDeLaClinica, desfaseEn } = require("../zona-horaria")

  it("la medianoche de un día en la zona que se configure, con horario de verano", () => {
    expect(instanteDeLaClinica("2026-09-14", "00:00:00.000", "America/Mexico_City").toISOString()).toBe("2026-09-14T06:00:00.000Z")
    // Tijuana: UTC−7 en septiembre (horario de verano) y UTC−8 en enero.
    expect(instanteDeLaClinica("2026-09-14", "00:00:00.000", "America/Tijuana").toISOString()).toBe("2026-09-14T07:00:00.000Z")
    expect(instanteDeLaClinica("2026-01-14", "00:00:00.000", "America/Tijuana").toISOString()).toBe("2026-01-14T08:00:00.000Z")
    expect(desfaseEn(new Date("2026-09-14T12:00:00Z"), "America/Cancun")).toBe("-05:00")
  })
})
