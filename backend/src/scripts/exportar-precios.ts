import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import ExcelJS from "exceljs"

/**
 * Genera el Excel de precios para que la farmacia lo llene.
 *
 *   npx medusa exec ./src/scripts/exportar-precios.ts
 *   npx medusa exec ./src/scripts/exportar-precios.ts /ruta/salida.xlsx
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El Excel del almacén traía MEDICAMENTO, LABORATORIO, LOTE, CADUCIDAD,
 * FACTURA y EXISTENCIA. No traía precio ni costo, así que todos los productos
 * quedaron en $0.00 y el punto de venta no puede cobrar.
 *
 * Los precios no se pueden deducir ni inventar: son medicamentos que se le van
 * a cobrar a un paciente. Tienen que venir de la farmacia.
 *
 * Este script produce la lista completa con una columna vacía para llenar, y
 * `importar-precios.ts` la lee de vuelta. Es el camino más corto entre "no
 * tenemos precios" y "el POS cobra".
 *
 * La columna ID no se toca: es lo que permite volver a encontrar cada producto
 * aunque alguien reordene o renombre filas.
 */

type Fila = {
  variantId: string
  producto: string
  laboratorio: string
  clasificacion: string
  precioActual: number | null
}

export default async function exportarPrecios({ container, args }: ExecArgs) {
  const destino = (args ?? [])[0] || path.resolve(process.cwd(), "precios-para-llenar.xlsx")

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionService: any = container.resolve(Modules.REGION)

  const regiones = await regionService.listRegions({})
  const moneda = String(regiones?.[0]?.currency_code ?? "mxn").toLowerCase()

  const { data: productos } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "metadata",
      "variants.id",
      "variants.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    pagination: { take: 10000 },
  })

  const filas: Fila[] = []

  for (const p of productos ?? []) {
    // query.graph devuelve los precios, pero el tipo de ProductVariant no los
    // declara. El cast es sobre la forma real de la respuesta.
    for (const v of (p.variants ?? []) as any[]) {
      const precio = (v.prices ?? []).find(
        (pr: any) => String(pr.currency_code).toLowerCase() === moneda
      )
      filas.push({
        variantId: v.id,
        producto: p.title,
        laboratorio: String((p.metadata as any)?.proveedor ?? ""),
        clasificacion: String((p.metadata as any)?.clasificacion ?? ""),
        precioActual: precio ? Number(precio.amount) : null,
      })
    }
  }

  filas.sort((a, b) => a.producto.localeCompare(b.producto, "es"))

  const sinPrecio = filas.filter((f) => !f.precioActual).length

  // ── Hoja ──────────────────────────────────────────────────────────────────
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("PRECIOS")

  hoja.columns = [
    { header: "ID (no modificar)", key: "id", width: 30 },
    { header: "PRODUCTO", key: "producto", width: 55 },
    { header: "LABORATORIO", key: "lab", width: 22 },
    { header: "CLASIFICACION", key: "clas", width: 24 },
    { header: "COSTO", key: "costo", width: 12 },
    { header: `PRECIO_VENTA (${moneda.toUpperCase()})`, key: "precio", width: 20 },
  ]

  hoja.getRow(1).font = { bold: true }
  hoja.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  }
  hoja.views = [{ state: "frozen", ySplit: 1 }]

  for (const f of filas) {
    hoja.addRow({
      id: f.variantId,
      producto: f.producto,
      lab: f.laboratorio,
      clas: f.clasificacion,
      costo: null,
      precio: f.precioActual ?? null,
    })
  }

  // La columna ID se protege visualmente en gris: no impide editarla, pero
  // deja claro que no es un campo para llenar.
  hoja.getColumn("id").font = { color: { argb: "FF999999" }, size: 9 }
  hoja.getColumn("precio").numFmt = '#,##0.00'
  hoja.getColumn("costo").numFmt = '#,##0.00'

  // ── Instrucciones, en el propio archivo ───────────────────────────────────
  // Va dentro del libro a propósito: el archivo va a viajar por correo y va a
  // llegar separado de cualquier instrucción que se mande aparte.
  const guia = libro.addWorksheet("COMO LLENAR")
  guia.columns = [{ width: 100 }]
  const lineas = [
    "COMO LLENAR ESTE ARCHIVO",
    "",
    "1. Ve a la hoja PRECIOS.",
    `2. Llena la columna PRECIO_VENTA (${moneda.toUpperCase()}) con el precio al publico.`,
    "   Usa punto decimal: 145.50",
    "",
    "3. La columna COSTO es OPCIONAL. Sirve solo si prefieren dar el costo y",
    "   que el sistema calcule el precio aplicando un margen igual para todos.",
    "   Si llenan PRECIO_VENTA, el COSTO se ignora.",
    "",
    "4. NO modifiquen la columna ID ni el orden de las columnas.",
    "   El ID es lo que permite volver a encontrar cada producto.",
    "",
    "5. Pueden dejar filas vacias: esos productos simplemente se quedan sin",
    "   precio y no se podran vender hasta que se les ponga uno.",
    "",
    "6. Guarden el archivo como .xlsx y devuelvanlo.",
    "",
    "Cualquier fila que el sistema no pueda interpretar se reporta al importar,",
    "con su numero de fila. No se pierde nada en silencio.",
  ]
  lineas.forEach((t, i) => {
    const r = guia.addRow([t])
    if (i === 0) r.font = { bold: true, size: 14 }
  })

  fs.mkdirSync(path.dirname(destino), { recursive: true })
  await libro.xlsx.writeFile(destino)

  console.log("")
  console.log("=== EXPORTACION DE PRECIOS ===")
  console.log("")
  console.log(`   Productos exportados : ${filas.length}`)
  console.log(`   Ya tienen precio     : ${filas.length - sinPrecio}`)
  console.log(`   SIN precio           : ${sinPrecio}`)
  console.log(`   Moneda               : ${moneda.toUpperCase()}`)
  console.log("")
  console.log(`   Archivo: ${destino}`)
  console.log("")
  console.log("   Enviaselo a la farmacia. Cuando lo devuelvan:")
  console.log("      npx medusa exec ./src/scripts/importar-precios.ts <archivo>")
  console.log("      npx medusa exec ./src/scripts/importar-precios.ts <archivo> apply")
  console.log("")
}
