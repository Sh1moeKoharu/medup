import ExcelJS from "exceljs"
import { interpretarHoja } from "../importar-precios"

/**
 * El parser de la hoja de precios, con las porquerías que trae un Excel real.
 *
 * Se prueba esta pieza y no el script entero porque es donde está el riesgo:
 * encabezados movidos, números escritos como texto, decimales con coma, celdas
 * con fórmula, filas a medio llenar. Y porque un precio mal leído no falla
 * ruidosamente — se convierte en lo que se le cobra a un paciente.
 *
 *   npm run test:unit
 */

const variantesConocidas = new Map<string, { producto: string; precioActual: number | null }>([
  ["var_001", { producto: "PARACETAMOL TAB 500MG", precioActual: null }],
  ["var_002", { producto: "AGUA OXIGENADA 1 LITRO", precioActual: 30 }],
  ["var_003", { producto: "DIAZEPAM TAB 10MG", precioActual: null }],
  ["var_004", { producto: "JERINGA 5ML", precioActual: null }],
])

const porTitulo = new Map<string, string>([
  ["PARACETAMOL TAB 500MG", "var_001"],
  ["AGUA OXIGENADA 1 LITRO", "var_002"],
  ["DIAZEPAM TAB 10MG", "var_003"],
  ["JERINGA 5ML", "var_004"],
])

function hojaCon(encabezados: any[], filas: any[][]): ExcelJS.Worksheet {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("PRECIOS")
  hoja.addRow(encabezados)
  filas.forEach((f) => hoja.addRow(f))
  return hoja
}

const interpretar = (hoja: ExcelJS.Worksheet, margen: number | null = null) =>
  interpretarHoja(hoja, { variantesConocidas, porTitulo, margen })

describe("interpretarHoja", () => {
  it("lee una hoja bien llenada", () => {
    const r = interpretar(
      hojaCon(
        ["ID (no modificar)", "PRODUCTO", "COSTO", "PRECIO_VENTA (MXN)"],
        [
          ["var_001", "PARACETAMOL TAB 500MG", null, 45.5],
          ["var_002", "AGUA OXIGENADA 1 LITRO", null, 62],
        ]
      )
    )

    expect(r.buenas.map((b) => b.precio)).toEqual([45.5, 62])
    expect(r.malas).toHaveLength(0)
  })

  it("entiende los números escritos como texto", () => {
    // Todo esto sale de teclear precios a mano en Excel.
    const r = interpretar(
      hojaCon(
        ["ID (no modificar)", "PRODUCTO", "PRECIO_VENTA (MXN)"],
        [
          ["var_001", "PARACETAMOL TAB 500MG", "$45.50"],
          ["var_002", "AGUA OXIGENADA 1 LITRO", "1,234.50"],
          ["var_003", "DIAZEPAM TAB 10MG", "89,90"],
          ["var_004", "JERINGA 5ML", " 12.00 "],
        ]
      )
    )

    expect(r.buenas.map((b) => b.precio)).toEqual([45.5, 1234.5, 89.9, 12])
  })

  it("no depende del orden de las columnas", () => {
    const r = interpretar(
      hojaCon(
        ["PRECIO_VENTA (MXN)", "LABORATORIO", "PRODUCTO", "ID (no modificar)"],
        [[99.9, "PISA", "PARACETAMOL TAB 500MG", "var_001"]]
      )
    )

    expect(r.buenas).toEqual([
      expect.objectContaining({ variantId: "var_001", precio: 99.9 }),
    ])
  })

  it("aplica el margen sobre el costo, pero un precio explícito manda", () => {
    const r = interpretar(
      hojaCon(
        ["ID (no modificar)", "PRODUCTO", "COSTO", "PRECIO_VENTA (MXN)"],
        [
          ["var_001", "PARACETAMOL TAB 500MG", 100, null],
          ["var_002", "AGUA OXIGENADA 1 LITRO", 100, 250],
        ]
      ),
      40
    )

    expect(r.buenas.map((b) => b.precio)).toEqual([140, 250])
  })

  it("reporta cada fila problemática en lugar de adivinar", () => {
    const r = interpretar(
      hojaCon(
        ["ID (no modificar)", "PRODUCTO", "PRECIO_VENTA (MXN)"],
        [
          ["var_001", "PARACETAMOL TAB 500MG", 0],
          ["var_002", "AGUA OXIGENADA 1 LITRO", -5],
          ["var_003", "DIAZEPAM TAB 10MG", 99999999],
          ["var_XXX", "NO EXISTE ESTE", 50],
          ["", "TAMPOCO ESTE", 50],
          ["var_004", "JERINGA 5ML", "abc"],
          [null, null, null],
          ["var_004", "JERINGA 5ML", null],
        ]
      )
    )

    expect(r.buenas).toHaveLength(0)
    expect(r.malas).toHaveLength(6)
    // Sólo la última cuenta como vacía: la fila en blanco se salta sin más.
    expect(r.vacias).toBe(1)

    const motivos = r.malas.map((m) => m.motivo).join(" ")
    expect(motivos).toContain("no valido (0)")
    expect(motivos).toContain("no valido (-5)")
    expect(motivos).toContain("sospechosamente alto")
    expect(motivos).toContain("no existe en el catalogo")
    expect(motivos).toContain("no se encontro el producto")
    expect(motivos).toContain("no es un numero")
  })

  it("una celda con texto no es una celda vacía", () => {
    // El caso que este juego de pruebas descubrió: "consultar", "s/p" o un
    // guion en la casilla del precio se omitian en silencio, y ese producto se
    // quedaba sin precio sin que nadie se enterara hasta no poder cobrarlo.
    const r = interpretar(
      hojaCon(
        ["ID (no modificar)", "PRODUCTO", "PRECIO_VENTA (MXN)"],
        [["var_001", "PARACETAMOL TAB 500MG", "consultar"]]
      )
    )

    expect(r.vacias).toBe(0)
    expect(r.malas).toHaveLength(1)
    expect(r.malas[0].motivo).toContain("no es un numero")
  })

  it("avisa si falta la columna de precio, en vez de no hacer nada", () => {
    const r = interpretar(
      hojaCon(["ID (no modificar)", "PRODUCTO", "LABORATORIO"], [["var_001", "PARACETAMOL TAB 500MG", "PISA"]])
    )

    expect(r.faltaColumna).not.toBeNull()
  })

  it("encuentra el producto por nombre si alguien borró la columna ID", () => {
    const r = interpretar(
      hojaCon(["PRODUCTO", "PRECIO_VENTA (MXN)"], [["  paracetamol tab 500mg  ", 33]])
    )

    expect(r.buenas).toEqual([
      expect.objectContaining({ variantId: "var_001", precio: 33 }),
    ])
  })
})
