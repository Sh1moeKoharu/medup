import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/core-flows"
import * as fs from "fs"
import ExcelJS from "exceljs"

/**
 * Carga los precios de venta desde el Excel que llenó la farmacia.
 *
 *   npx medusa exec ./src/scripts/importar-precios.ts precios.xlsx
 *   npx medusa exec ./src/scripts/importar-precios.ts precios.xlsx apply
 *   npx medusa exec ./src/scripts/importar-precios.ts precios.xlsx apply margen=40
 *
 * Corre en SIMULACIÓN por omisión: dice exactamente qué haría y qué filas no
 * puede interpretar, sin tocar la base.
 *
 * ── DOS FORMAS DE DAR EL PRECIO ─────────────────────────────────────────────
 * 1. Columna PRECIO_VENTA — el precio al público, tal cual. Manda siempre.
 * 2. Columna COSTO + `margen=40` — calcula precio = costo × 1.40, para el caso
 *    de que prefieran dar costos y un margen único.
 *
 * Si una fila trae las dos, gana PRECIO_VENTA: un precio explícito es una
 * decisión y un margen es una regla general.
 *
 * ── CRITERIO ────────────────────────────────────────────────────────────────
 * Una fila que no se pueda interpretar se REPORTA con su número y se omite.
 * Nunca se adivina un precio: el importador de inventario ya nos enseñó que
 * rellenar un hueco con un valor plausible sólo esconde el problema hasta que
 * sale caro. Aquí sale caro de verdad, porque es lo que se le cobra a alguien.
 */

type FilaPrecio = {
  numero: number
  variantId: string
  producto: string
  precio: number
}

type FilaMala = {
  numero: number
  producto: string
  motivo: string
}

const LIMITE_SUPERIOR = 1_000_000

/**
 * Interpreta la hoja y separa filas utilizables de filas con problema.
 *
 * Se extrae del flujo principal a proposito: es la parte que concentra el
 * riesgo —encabezados movidos, numeros escritos como texto, decimales con
 * coma, celdas con formula— y asi se puede ejercitar sin base de datos. Los
 * importadores de este proyecto ya nos ensenaron que los datos reales traen
 * cosas que uno no anticipa leyendo el codigo.
 */
export function interpretarHoja(
  hoja: ExcelJS.Worksheet,
  ctx: {
    variantesConocidas: Map<string, { producto: string; precioActual: number | null }>
    porTitulo: Map<string, string>
    margen: number | null
  }
): { buenas: FilaPrecio[]; malas: FilaMala[]; vacias: number; faltaColumna: string | null } {
  // Se localizan las columnas por su encabezado en lugar de por posicion: si
  // alguien inserta una columna en Excel, esto sigue funcionando.
  const encabezados = new Map<string, number>()
  hoja.getRow(1).eachCell((celda, col) => {
    const texto = String(celda.value ?? "").trim().toUpperCase()
    if (texto) encabezados.set(texto, col)
  })

  const buscarCol = (...alternativas: string[]): number | null => {
    for (const [texto, col] of encabezados) {
      for (const alt of alternativas) {
        if (texto.startsWith(alt)) return col
      }
    }
    return null
  }

  const colId = buscarCol("ID")
  const colProducto = buscarCol("PRODUCTO", "MEDICAMENTO")
  const colPrecio = buscarCol("PRECIO_VENTA", "PRECIO VENTA", "PRECIO")
  const colCosto = buscarCol("COSTO")

  if (!colPrecio && !(colCosto && ctx.margen !== null)) {
    return {
      buenas: [],
      malas: [],
      vacias: 0,
      faltaColumna: [...encabezados.keys()].join(" | ") || "(hoja sin encabezados)",
    }
  }

  const numero = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null
    if (typeof v === "number") return v
    // Celda con formula: exceljs entrega { formula, result }.
    if (typeof v === "object" && "result" in v) return numero((v as any).result)
    let limpio = String(v).replace(/[$\s]/g, "")
    // "1,234.50" es separador de miles; "1234,50" es coma decimal.
    if (/,\d{1,2}$/.test(limpio) && !/\./.test(limpio)) {
      limpio = limpio.replace(",", ".")
    } else {
      limpio = limpio.replace(/,/g, "")
    }
    const n = Number(limpio)
    return Number.isFinite(n) ? n : null
  }

  const buenas: FilaPrecio[] = []
  const malas: FilaMala[] = []
  let vacias = 0

  for (let r = 2; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r)
    const nombre = colProducto ? String(fila.getCell(colProducto).value ?? "").trim() : ""
    const idCrudo = colId ? String(fila.getCell(colId).value ?? "").trim() : ""

    if (!nombre && !idCrudo) continue // fila en blanco

    const crudoPrecio = colPrecio ? fila.getCell(colPrecio).value : null
    const precioDirecto = numero(crudoPrecio)
    const costo = colCosto ? numero(fila.getCell(colCosto).value) : null

    // Celda con algo escrito que no es un numero: eso NO es una fila vacia.
    // Alguien puso ahi un texto -"consultar", "s/p", un guion- y omitirlo en
    // silencio significa que ese producto se queda sin precio y nadie se entera
    // hasta que el cajero no puede cobrarlo.
    const tieneTextoNoNumerico =
      crudoPrecio !== null &&
      crudoPrecio !== undefined &&
      String(crudoPrecio).trim() !== "" &&
      precioDirecto === null

    if (tieneTextoNoNumerico) {
      malas.push({
        numero: r,
        producto: nombre,
        motivo: `el precio no es un numero ("${String(crudoPrecio).slice(0, 20)}")`,
      })
      continue
    }

    let precio: number | null = precioDirecto
    if (precio === null && costo !== null && ctx.margen !== null) {
      precio = Math.round(costo * (1 + ctx.margen / 100) * 100) / 100
    }

    if (precio === null) {
      vacias++
      continue
    }

    if (precio <= 0) {
      malas.push({ numero: r, producto: nombre, motivo: `precio no valido (${precio})` })
      continue
    }
    if (precio > LIMITE_SUPERIOR) {
      // Un precio absurdo casi siempre es un decimal mal puesto. Vale mas
      // reportarlo que cargarlo y que alguien intente cobrarlo.
      malas.push({ numero: r, producto: nombre, motivo: `precio sospechosamente alto (${precio})` })
      continue
    }

    let variantId = ""
    if (idCrudo && ctx.variantesConocidas.has(idCrudo)) {
      variantId = idCrudo
    } else if (nombre && ctx.porTitulo.has(nombre.toUpperCase())) {
      variantId = ctx.porTitulo.get(nombre.toUpperCase())!
    } else {
      malas.push({
        numero: r,
        producto: nombre || idCrudo,
        motivo: idCrudo ? "el ID no existe en el catalogo" : "no se encontro el producto por nombre",
      })
      continue
    }

    buenas.push({
      numero: r,
      variantId,
      producto: ctx.variantesConocidas.get(variantId)!.producto,
      precio,
    })
  }

  return { buenas, malas, vacias, faltaColumna: null }
}

export default async function importarPrecios({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const ruta = execArgs.find((a) => a.toLowerCase().endsWith(".xlsx"))
  const aplicar = execArgs.includes("apply")
  const margenArg = execArgs.find((a) => a.startsWith("margen="))?.split("=")[1]
  const margen = margenArg ? Number(margenArg) : null

  if (!ruta) {
    console.error("Falta el archivo. Uso: importar-precios.ts <archivo.xlsx> [apply] [margen=40]")
    return
  }
  if (!fs.existsSync(ruta)) {
    console.error(`No existe el archivo: ${ruta}`)
    return
  }
  if (margen !== null && (!Number.isFinite(margen) || margen < 0 || margen > 1000)) {
    console.error(`Margen inválido: "${margenArg}". Debe ser un número entre 0 y 1000.`)
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionService: any = container.resolve(Modules.REGION)
  const regiones = await regionService.listRegions({})
  const moneda = String(regiones?.[0]?.currency_code ?? "mxn").toLowerCase()

  // ── Catálogo actual, para validar los ID y poder reportar por nombre ──────
  const { data: productos } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.prices.amount", "variants.prices.currency_code"],
    pagination: { take: 10000 },
  })

  const variantesConocidas = new Map<string, { producto: string; precioActual: number | null }>()
  const porTitulo = new Map<string, string>()

  for (const p of productos ?? []) {
    // Ver nota en exportar-precios.ts sobre el tipo de variants.
    for (const v of (p.variants ?? []) as any[]) {
      const precio = (v.prices ?? []).find(
        (pr: any) => String(pr.currency_code).toLowerCase() === moneda
      )
      variantesConocidas.set(v.id, {
        producto: p.title,
        precioActual: precio ? Number(precio.amount) : null,
      })
      // Respaldo por título, por si alguien borró la columna ID.
      if (!porTitulo.has(p.title.trim().toUpperCase())) {
        porTitulo.set(p.title.trim().toUpperCase(), v.id)
      }
    }
  }

  // ── Lectura del archivo ───────────────────────────────────────────────────
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.readFile(ruta)
  const hoja = libro.getWorksheet("PRECIOS") ?? libro.worksheets[0]

  if (!hoja) {
    console.error("El archivo no tiene ninguna hoja legible.")
    return
  }

  const { buenas, malas, vacias, faltaColumna } = interpretarHoja(hoja, {
    variantesConocidas,
    porTitulo,
    margen,
  })

  if (faltaColumna) {
    console.error("")
    console.error("No se encontró la columna PRECIO_VENTA.")
    console.error("Si el archivo sólo trae COSTO, indica el margen:")
    console.error("   ... importar-precios.ts archivo.xlsx apply margen=40")
    console.error("")
    console.error(`Encabezados encontrados: ${faltaColumna}`)
    return
  }

  // Una variante repetida en el archivo: gana la última, pero se avisa.
  const porVariante = new Map<string, FilaPrecio>()
  const duplicadas: string[] = []
  for (const f of buenas) {
    if (porVariante.has(f.variantId)) {
      duplicadas.push(`${f.producto} (filas ${porVariante.get(f.variantId)!.numero} y ${f.numero})`)
    }
    porVariante.set(f.variantId, f)
  }
  const aCargar = [...porVariante.values()]

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log("")
  console.log("=== IMPORTACION DE PRECIOS ===")
  console.log(`Modo: ${aplicar ? "APLICAR" : "SIMULACION (no se toca nada)"}`)
  console.log(`Archivo: ${ruta}`)
  console.log(`Moneda: ${moneda.toUpperCase()}${margen !== null ? `   Margen sobre costo: ${margen}%` : ""}`)
  console.log("")
  console.log(`   Precios a cargar    : ${aCargar.length}`)
  console.log(`   Filas sin precio    : ${vacias}`)
  console.log(`   Filas con problema  : ${malas.length}`)
  if (duplicadas.length) {
    console.log(`   Repetidas           : ${duplicadas.length} (gana la última)`)
  }
  console.log("")

  if (aCargar.length) {
    console.log("   Muestra:")
    for (const f of aCargar.slice(0, 8)) {
      const antes = variantesConocidas.get(f.variantId)?.precioActual
      const de = antes ? `${antes.toFixed(2)}` : "sin precio"
      console.log(`      ${f.producto.slice(0, 46).padEnd(48)} ${de.padStart(12)} -> ${f.precio.toFixed(2)}`)
    }
    if (aCargar.length > 8) console.log(`      … y ${aCargar.length - 8} más`)
    console.log("")
  }

  if (malas.length) {
    console.log("   PROBLEMAS (estas filas NO se cargan):")
    for (const m of malas.slice(0, 25)) {
      console.log(`      fila ${String(m.numero).padStart(5)}  ${m.producto.slice(0, 40).padEnd(42)} ${m.motivo}`)
    }
    if (malas.length > 25) console.log(`      … y ${malas.length - 25} más`)
    console.log("")
  }

  if (duplicadas.length) {
    console.log("   REPETIDAS:")
    duplicadas.slice(0, 10).forEach((d) => console.log(`      ${d}`))
    console.log("")
  }

  if (!aplicar) {
    console.log("Simulación. Para aplicar, repite el comando agregando  apply")
    console.log("")
    return
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────
  let cargados = 0
  let fallidos = 0

  // Por lotes: un solo workflow con miles de variantes es frágil y, si falla,
  // no dice cuál fue.
  const TAMANO_LOTE = 50
  for (let i = 0; i < aCargar.length; i += TAMANO_LOTE) {
    const lote = aCargar.slice(i, i + TAMANO_LOTE)
    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: lote.map((f) => ({
            id: f.variantId,
            prices: [{ currency_code: moneda, amount: f.precio }],
          })),
        } as any,
      })
      cargados += lote.length
      process.stdout.write(`   cargados ${cargados}/${aCargar.length}\r`)
    } catch (e: any) {
      fallidos += lote.length
      console.error(`\n   ERROR en el lote ${i}-${i + lote.length}: ${e?.message ?? e}`)
      for (const f of lote) {
        console.error(`      ${f.producto} (${f.variantId})`)
      }
    }
  }
  console.log("")

  // ── Cuántos quedan sin poder venderse ─────────────────────────────────────
  const { data: despues } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id", "variants.prices.amount", "variants.prices.currency_code"],
    pagination: { take: 10000 },
  })

  let sinPrecio = 0
  let total = 0
  for (const p of despues ?? []) {
    for (const v of (p.variants ?? []) as any[]) {
      total++
      const pr = (v.prices ?? []).find(
        (x: any) => String(x.currency_code).toLowerCase() === moneda
      )
      if (!pr || Number(pr.amount) <= 0) sinPrecio++
    }
  }

  console.log("")
  console.log(`   Cargados: ${cargados}${fallidos ? `   Fallidos: ${fallidos}` : ""}`)
  console.log("")
  console.log(`   Estado del catálogo: ${total - sinPrecio}/${total} productos con precio`)
  if (sinPrecio > 0) {
    console.log(`   ${sinPrecio} producto(s) siguen SIN precio y no se podrán vender.`)
    console.log("   Para obtener la lista de los que faltan:")
    console.log("      npx medusa exec ./src/scripts/exportar-precios.ts")
  } else {
    console.log("   Todos los productos tienen precio. El punto de venta ya puede cobrar.")
  }
  console.log("")
}
