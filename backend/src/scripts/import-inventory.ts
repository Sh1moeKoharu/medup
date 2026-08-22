import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/core-flows"
import * as fs from "fs"
import ExcelJS from "exceljs"
import { recordInventoryMovement } from "../lib/inventory-ledger"

/**
 * Importa el inventario desde el Excel del almacén.
 *
 *   npx medusa exec ./src/scripts/import-inventory.ts /ruta/archivo.xlsx
 *   npx medusa exec ./src/scripts/import-inventory.ts /ruta/archivo.xlsx apply
 *
 * Corre en SIMULACIÓN por omisión: reporta qué haría y qué filas no puede
 * interpretar, sin tocar la base.
 *
 * ── FORMATO ESPERADO ────────────────────────────────────────────────────────
 * Una hoja por clasificación (MATERIAL, MEDICAMENTO, MEDICAMENTO CONTROLADO).
 * En cada una, una fila de encabezado con MEDICAMENTO y LABORATORIO, y debajo:
 *
 *   MEDICAMENTO | LABORATORIO | LOTE | CADUCIDAD | FACTURA | EXISTENCIA | E/S...
 *
 * Las columnas E/S posteriores son la rejilla diaria de entradas y salidas del
 * kardex manual. NO se importan: eso es justamente lo que sustituye el libro
 * mayor (`inventory_movement`). Sólo se toma la existencia actual como saldo
 * de apertura.
 *
 * ── SOBRE LAS FECHAS ────────────────────────────────────────────────────────
 * La columna CADUCIDAD viene inconsistente: fechas reales, texto "MM/AA", y
 * algunos valores inservibles ("N/A", "08/0/8/30").
 *
 * La versión anterior de este script, ante una fecha ilegible, usaba la fecha
 * de HOY. Eso convierte cada dato malo en un lote que caduca hoy, que el job
 * diario manda a cuarentena de inmediato: corrupción silenciosa. Aquí una fecha
 * ilegible se REPORTA y la fila se omite.
 */

type ParsedRow = {
  sheet: string
  rowNumber: number
  title: string
  lab: string | null
  lot: string | null
  expiration: Date | null
  invoice: string | null
  quantity: number
  /** Motivo por el que no se puede importar; null si está bien. */
  problem: string | null
}

/** Hojas reconocidas y cómo se clasifica cada una. */
const SHEET_CLASSIFICATION: Record<string, { clasificacion: string; controlado: boolean }> = {
  MATERIAL: { clasificacion: "Material de curación", controlado: false },
  MEDICAMENTO: { clasificacion: "Medicamento", controlado: false },
  "MEDICAMENTO CONTROLADO": { clasificacion: "Controlado", controlado: true },
}

/** Normaliza celdas que Excel entrega como número, fecha o texto. */
function cellToString(value: any): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "object" && "result" in value) {
    return cellToString(value.result)
  }
  if (typeof value === "object" && "text" in value) {
    return String(value.text).trim() || null
  }

  if (typeof value === "number") {
    // Excel guarda lotes numéricos como float ("141124" llega como 141124).
    return Number.isInteger(value) ? String(value) : String(value)
  }

  const text = String(value).trim()
  return text || null
}

/**
 * Interpreta la caducidad. Devuelve null si no se puede, NUNCA una fecha
 * inventada.
 *
 * Para "MM/AA" se toma el ÚLTIMO día del mes: un lote con caducidad "12/26"
 * sigue siendo válido durante todo diciembre.
 */
function parseExpiration(value: any): Date | null {
  if (value === null || value === undefined) {
    return null
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value
  }

  const text = cellToString(value)
  if (!text) {
    return null
  }

  // MM/AA o MM/AAAA
  const shortForm = text.match(/^(\d{1,2})\/(\d{2}|\d{4})$/)
  if (shortForm) {
    const month = Number(shortForm[1])
    if (month < 1 || month > 12) {
      return null
    }
    const rawYear = Number(shortForm[2])
    const year = rawYear < 100 ? 2000 + rawYear : rawYear
    // Día 0 del mes siguiente = último día del mes indicado.
    return new Date(year, month, 0)
  }

  // AAAA-MM-DD y similares que Date entienda
  const parsed = new Date(text)
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
    return parsed
  }

  return null
}

/**
 * Limpia el nombre del producto tal como viene del Excel.
 *
 * Los títulos traen espacios dobles y espacios antes del paréntesis de cierre
 * ("SOLUCION ... (FISIOLOGICA )"). Además de verse mal, rompen el alta: Medusa
 * deriva el handle del título y rechaza el resultado con
 * "Invalid product handle ... It must contain URL safe characters".
 */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .trim()
}

/**
 * Genera un handle seguro en vez de dejar que Medusa lo derive del título.
 * Sin acentos, sin símbolos y sin guiones colgantes.
 */
function toHandle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita marcas diacriticas
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function parseQuantity(value: any): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return null
  }
  return Math.round(n)
}

export default async function importInventory({ container, args }: ExecArgs) {
  const logger = container.resolve("logger")
  const execArgs = args ?? []
  const filePath = execArgs.find((a) => a.toLowerCase().endsWith(".xlsx"))
  const apply = execArgs.includes("apply")

  if (!filePath) {
    throw new Error(
      "Falta la ruta del archivo .xlsx.\n" +
        "  npx medusa exec ./src/scripts/import-inventory.ts /ruta/archivo.xlsx"
    )
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  // ── Lectura ───────────────────────────────────────────────────────────────
  const rows: ParsedRow[] = []

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name.trim().toUpperCase()
    const classification = SHEET_CLASSIFICATION[sheetName]

    if (!classification) {
      logger.warn(`Hoja "${worksheet.name}" no reconocida; se omite.`)
      continue
    }

    // Localiza el encabezado en lugar de asumir que está en una fila fija.
    let headerRow = 0
    for (let r = 1; r <= Math.min(worksheet.rowCount, 20); r++) {
      const joined = (worksheet.getRow(r).values as any[])
        .map((v) => cellToString(v) ?? "")
        .join(" ")
        .toUpperCase()
      if (joined.includes("MEDICAMENTO") && joined.includes("LABORATORIO")) {
        headerRow = r
        break
      }
    }

    if (!headerRow) {
      logger.warn(`Hoja "${worksheet.name}": no se encontró el encabezado; se omite.`)
      continue
    }

    for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r)
      const title = cellToString(row.getCell(1).value)

      if (!title || ["TOTAL", "0"].includes(title.toUpperCase())) {
        continue
      }

      const lot = cellToString(row.getCell(3).value)
      const expiration = parseExpiration(row.getCell(4).value)
      const quantity = parseQuantity(row.getCell(6).value)

      let problem: string | null = null
      if (!lot) {
        problem = "sin número de lote"
      } else if (!expiration) {
        const raw = cellToString(row.getCell(4).value)
        problem = `caducidad ilegible${raw ? ` ("${raw}")` : " (vacía)"}`
      } else if (quantity === null) {
        problem = "existencia vacía o inválida"
      }

      rows.push({
        sheet: sheetName,
        rowNumber: r,
        title: normalizeTitle(title),
        lab: cellToString(row.getCell(2).value),
        lot,
        expiration,
        invoice: cellToString(row.getCell(5).value),
        quantity: quantity ?? 0,
        problem,
      })
    }
  }

  const importable = rows.filter((r) => !r.problem)
  const problematic = rows.filter((r) => r.problem)
  const uniqueTitles = new Set(importable.map((r) => r.title.toLowerCase()))
  const totalUnits = importable.reduce((sum, r) => sum + r.quantity, 0)

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log("")
  console.log("=== IMPORTACIÓN DE INVENTARIO ===")
  console.log(`Archivo: ${filePath}`)
  console.log(`Modo:    ${apply ? "APLICAR" : "SIMULACIÓN (no se escribe nada)"}`)
  console.log("")

  for (const sheetName of Object.keys(SHEET_CLASSIFICATION)) {
    const ofSheet = rows.filter((r) => r.sheet === sheetName)
    if (!ofSheet.length) continue
    const ok = ofSheet.filter((r) => !r.problem).length
    console.log(
      `  ${sheetName.padEnd(24)} ${String(ok).padStart(4)} lote(s) importables, ` +
        `${ofSheet.length - ok} con problemas`
    )
  }

  console.log("")
  console.log(`  Total importable : ${importable.length} lotes`)
  console.log(`  Productos únicos : ${uniqueTitles.size}`)
  console.log(`  Unidades         : ${totalUnits}`)
  console.log("")

  if (problematic.length) {
    console.log(`── ${problematic.length} FILA(S) QUE NO SE PUEDEN IMPORTAR ──`)
    console.log("   (se omiten; hay que corregirlas en el Excel y volver a correr)")
    console.log("")
    const byProblem = new Map<string, ParsedRow[]>()
    for (const r of problematic) {
      const key = r.problem!.split(" (")[0]
      byProblem.set(key, [...(byProblem.get(key) ?? []), r])
    }
    for (const [problem, list] of byProblem) {
      console.log(`   ${problem}: ${list.length}`)
      list.slice(0, 5).forEach((r) =>
        console.log(`      ${r.sheet} fila ${r.rowNumber}: ${r.title.slice(0, 45)} — ${r.problem}`)
      )
      if (list.length > 5) {
        console.log(`      … y ${list.length - 5} más`)
      }
    }
    console.log("")
  }

  if (!apply) {
    console.log("Simulación. Para importar de verdad:")
    console.log(`   npx medusa exec ./src/scripts/import-inventory.ts "${filePath}" apply`)
    return
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  const productModuleService = container.resolve(Modules.PRODUCT)
  const medicalInventoryService: any = container.resolve("medical_inventory")

  // Se deduplica por HANDLE, no por título: Medusa impone la unicidad sobre el
  // handle, y dos títulos que difieren sólo en espacios producen el mismo. Con
  // el mapa por título el alta parecía nueva y reventaba con
  // "Product with handle ... already exists" al reimportar.
  const existingProducts = await productModuleService.listProducts({}, { take: 5000 })
  const productsByHandle = new Map<string, any>()
  for (const p of existingProducts) {
    if (p.handle) {
      productsByHandle.set(p.handle, p)
    }
  }

  let createdProducts = 0
  let createdBatches = 0
  let skippedBatches = 0
  const failures: string[] = []

  for (const row of importable) {
    const key = toHandle(row.title)
    const classification = SHEET_CLASSIFICATION[row.sheet]

    try {
      let product = productsByHandle.get(key)

      if (!product) {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: row.title,
                handle: key,
                status: "published" as any,
                options: [{ title: "Presentación", values: ["Default"] }],
                variants: [
                  {
                    title: "Default",
                    options: { "Presentación": "Default" },
                    manage_inventory: false,
                  },
                ],
                metadata: {
                  is_pharmaceutical: true,
                  nombre_comercial: row.title,
                  proveedor: row.lab,
                  clasificacion: classification.clasificacion,
                  // Los controlados exigen receta. Es el punto de partida para
                  // el control que pide COFEPRIS; el bloqueo de venta sin receta
                  // todavía no está implementado.
                  requiere_receta: classification.controlado,
                  receta_retenida: classification.controlado,
                  origen_importacion: "Excel de almacén",
                },
              },
            ],
          },
        })
        product = result[0]
        productsByHandle.set(key, product)
        createdProducts++
      }

      const variants = await productModuleService.listProductVariants({
        product_id: product.id,
      })
      if (!variants?.length) {
        failures.push(`${row.title}: el producto no tiene variante`)
        continue
      }
      const variantId = variants[0].id

      // Idempotencia: si el lote ya existe para esa variante, no se duplica.
      const existingBatches = await medicalInventoryService.listMedicalBatches({
        variant_id: variantId,
        batch_number: row.lot!,
      })
      if (existingBatches?.length) {
        skippedBatches++
        continue
      }

      const batch = await medicalInventoryService.createMedicalBatches({
        batch_number: row.lot!,
        expiration_date: row.expiration!,
        quantity: row.quantity,
        variant_id: variantId,
      })
      createdBatches++

      // Saldo de apertura asentado en el libro mayor. Sin esto, la existencia
      // inicial aparecería de la nada y el kardex no cuadraría desde el día uno.
      if (row.quantity > 0) {
        await recordInventoryMovement(container as any, {
          variant_id: variantId,
          variant_title: row.title,
          batch_id: batch.id,
          batch_number: row.lot,
          expiration_date: row.expiration,
          quantity_delta: row.quantity,
          quantity_after: row.quantity,
          type: "entry_initial",
          reason: `Carga inicial desde Excel de almacén (${row.sheet})`,
          reference_type: "import",
          reference_id: `${row.sheet}:${row.rowNumber}`,
          user_id: "system",
          notes: row.invoice ? `Factura: ${row.invoice}` : null,
        })
      }
    } catch (error: any) {
      failures.push(`${row.title} (lote ${row.lot}): ${error?.message}`)
    }
  }

  console.log("")
  console.log("=== RESULTADO ===")
  console.log(`   Productos creados : ${createdProducts}`)
  console.log(`   Lotes creados     : ${createdBatches}`)
  console.log(`   Lotes ya existentes (omitidos): ${skippedBatches}`)
  console.log(`   Filas omitidas por datos inválidos: ${problematic.length}`)

  if (failures.length) {
    console.log("")
    console.log(`   ⚠️ ${failures.length} fallo(s):`)
    failures.slice(0, 10).forEach((f) => console.log(`      ${f}`))
    if (failures.length > 10) {
      console.log(`      … y ${failures.length - 10} más`)
    }
  }
}
