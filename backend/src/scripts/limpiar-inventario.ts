import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { MEDICAL_INVENTORY_MODULE } from "../modules/medical-inventory"
import { INVENTORY_MOVEMENTS_MODULE } from "../modules/inventory-movements"

/**
 * ⚠️ SCRIPT DESTRUCTIVO — vacía el inventario para volver a cargarlo desde cero.
 *
 *   npx medusa exec ./src/scripts/limpiar-inventario.ts           (simulación)
 *   npx medusa exec ./src/scripts/limpiar-inventario.ts confirm   (ejecuta)
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * `import-inventory.ts` SUMA: crea lo que falta y agrega lotes. Volver a
 * importar un archivo actualizado sobre el anterior deja el stock de los dos
 * meses acumulado, y el sistema diría que hay el doble de lo que hay.
 *
 * Para sustituir un inventario por otro hay que vaciar primero. Esto es ese
 * primer paso; el segundo es volver a importar.
 *
 * ── LO QUE BORRA ────────────────────────────────────────────────────────────
 *   · Lotes (medical_batch) con sus caducidades
 *   · Asientos del libro mayor de inventario (inventory_movement)
 *   · Productos del catálogo
 *
 * ── LO QUE NO TOCA ──────────────────────────────────────────────────────────
 * Pacientes, usuarios, sesiones de caja, convenios y bitácora. Esto es el
 * inventario, no el sistema entero.
 *
 * ── LA GUARDA QUE IMPORTA ───────────────────────────────────────────────────
 * Se NIEGA a borrar si hay ventas registradas. Una venta guarda a qué producto
 * corresponde cada línea: borrar el catálogo deja ese historial apuntando a
 * cosas que ya no existen, y con él los cortes de caja dejan de poder
 * explicarse.
 *
 * Durante las pruebas puede haber ventas de mentira que no importan; para ese
 * caso está `incluso-con-ventas`, que hay que escribir a propósito.
 */

export default async function limpiarInventario({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const confirmado = execArgs.includes("confirm")
  const aunConVentas = execArgs.includes("incluso-con-ventas")

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productService: any = container.resolve(Modules.PRODUCT)
  const batchService: any = container.resolve(MEDICAL_INVENTORY_MODULE)
  const movementService: any = container.resolve(INVENTORY_MOVEMENTS_MODULE)

  console.log("")
  console.log("=== LIMPIEZA DE INVENTARIO ===")
  console.log(`Modo: ${confirmado ? "EJECUTAR (borra de verdad)" : "SIMULACION (no se toca nada)"}`)
  console.log("")

  // ── Qué hay ───────────────────────────────────────────────────────────────
  const productos = await productService.listProducts({}, { take: 20000 })
  const lotes = await batchService.listMedicalBatches({}, { take: 50000 })
  const movimientos = await movementService.listInventoryMovements({}, { take: 100000 })

  let ventas: any[] = []
  try {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "created_at"],
      pagination: { take: 10000 },
    })
    ventas = data ?? []
  } catch {
    // Sin módulo de pedidos accesible; se sigue.
  }

  const unidades = lotes.reduce((s: number, l: any) => s + Number(l.quantity ?? 0), 0)

  console.log("ESTADO ACTUAL")
  console.log(`   Productos en catalogo : ${productos.length}`)
  console.log(`   Lotes                 : ${lotes.length}  (${unidades} unidades)`)
  console.log(`   Asientos del kardex   : ${movimientos.length}`)
  console.log(`   Ventas registradas    : ${ventas.length}`)
  console.log("")

  if (!productos.length && !lotes.length && !movimientos.length) {
    console.log("El inventario ya esta vacio. Puedes importar directamente.")
    console.log("")
    return
  }

  // ── La guarda ─────────────────────────────────────────────────────────────
  if (ventas.length > 0 && !aunConVentas) {
    console.log("═══════════════════════════════════════════════════════════════")
    console.log(" NO SE BORRA NADA.")
    console.log("")
    console.log(` Hay ${ventas.length} venta(s) registrada(s). Cada linea de venta guarda a`)
    console.log(" que producto corresponde: borrar el catalogo deja ese historial")
    console.log(" apuntando a cosas que ya no existen, y los cortes de caja dejan")
    console.log(" de poder explicarse.")
    console.log("")
    console.log(" Si esas ventas son de prueba y no importan, dilo a proposito:")
    console.log("")
    console.log("    npx medusa exec ./src/scripts/limpiar-inventario.ts confirm incluso-con-ventas")
    console.log("")
    console.log(" La mas reciente es del " + new Date(ventas[0]?.created_at ?? Date.now()).toLocaleString("es-MX"))
    console.log("═══════════════════════════════════════════════════════════════")
    console.log("")
    return
  }

  if (!confirmado) {
    console.log("SE BORRARIA")
    console.log(`   ${productos.length} producto(s), ${lotes.length} lote(s), ${movimientos.length} asiento(s)`)
    console.log("")
    console.log("NO se tocan pacientes, usuarios, cajas, convenios ni bitacora.")
    console.log("")
    console.log("Para ejecutar:")
    console.log("   npx medusa exec ./src/scripts/limpiar-inventario.ts confirm")
    console.log("")
    return
  }

  // ── Respaldo ──────────────────────────────────────────────────────────────
  const dir = path.resolve(process.cwd(), ".backups")
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, `inventario-borrado-${Date.now()}.json`)
  fs.writeFileSync(
    archivo,
    JSON.stringify(
      {
        generado: new Date().toISOString(),
        productos: productos.map((p: any) => ({
          id: p.id, title: p.title, handle: p.handle, metadata: p.metadata,
        })),
        lotes,
        movimientos,
      },
      null,
      2
    )
  )
  console.log(`Respaldo: ${archivo}`)
  console.log("")

  // ── Borrado, de lo más dependiente a lo menos ─────────────────────────────
  let errores = 0
  const porLotes = async (nombre: string, ids: string[], borrar: (x: string[]) => Promise<any>) => {
    const TAM = 100
    let hechos = 0
    for (let i = 0; i < ids.length; i += TAM) {
      try {
        await borrar(ids.slice(i, i + TAM))
        hechos += Math.min(TAM, ids.length - i)
        process.stdout.write(`   ${nombre}: ${hechos}/${ids.length}\r`)
      } catch (e: any) {
        errores++
        console.error(`\n   ERROR borrando ${nombre}: ${e?.message ?? e}`)
      }
    }
    if (ids.length) console.log(`   ${nombre}: ${hechos}/${ids.length}`)
  }

  await porLotes("asientos", movimientos.map((m: any) => m.id), (ids) =>
    movementService.deleteInventoryMovements(ids)
  )
  await porLotes("lotes", lotes.map((l: any) => l.id), (ids) =>
    batchService.deleteMedicalBatches(ids)
  )
  await porLotes("productos", productos.map((p: any) => p.id), (ids) =>
    productService.deleteProducts(ids)
  )

  // ── Comprobación ──────────────────────────────────────────────────────────
  const quedan = {
    productos: (await productService.listProducts({}, { take: 5 })).length,
    lotes: (await batchService.listMedicalBatches({}, { take: 5 })).length,
  }

  console.log("")
  if (errores === 0 && !quedan.productos && !quedan.lotes) {
    console.log("Inventario vacio. Ahora importa el archivo nuevo:")
    console.log("   npx medusa exec ./src/scripts/import-inventory.ts /ruta/archivo.xlsx")
    console.log("   npx medusa exec ./src/scripts/import-inventory.ts /ruta/archivo.xlsx apply")
  } else {
    console.log(`Terminado con ${errores} error(es).`)
    console.log(`Quedan: ${quedan.productos} producto(s), ${quedan.lotes} lote(s) (muestra de 5).`)
  }
  console.log("")
}
