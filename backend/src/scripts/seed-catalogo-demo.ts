import { almacenDeFarmacia } from "../lib/almacenes"
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/core-flows"
import { recordInventoryMovement } from "../lib/inventory-ledger"

/**
 * Catálogo de DEMOSTRACIÓN: medicamentos, precios y lotes con caducidades
 * escalonadas a propósito.
 *
 *   npx medusa exec ./src/scripts/seed-catalogo-demo.ts
 *
 * ── PARA QUÉ SIRVE ──────────────────────────────────────────────────────────
 * Una base recién migrada no tiene catálogo, así que no se puede completar una
 * venta y no hay forma de comprobar el circuito completo: FEFO, kardex, corte
 * de caja, alertas de caducidad y cuarentena automática.
 *
 * El Excel del almacén no sirve para esto: trae lote, caducidad y existencia,
 * pero NINGUNA columna de precio de venta (ver deploy/README.md), así que todo
 * saldría en cero y no se podría probar un cobro.
 *
 * ── LAS FECHAS SON EL PUNTO ─────────────────────────────────────────────────
 * Los lotes NO se siembran con fechas al azar. Cada uno existe para ejercitar
 * una regla concreta, y se calculan RELATIVAS a hoy para que el escenario siga
 * siendo válido dentro de seis meses:
 *
 *   · Dos lotes del mismo producto con caducidades distintas
 *       -> el FEFO debe consumir SIEMPRE el que caduca antes.
 *   · Un lote a +20 días
 *       -> check-expirations debe contarlo en el tramo "30 días o menos".
 *   · Un lote a +75 días
 *       -> debe caer en el tramo de 90, no en el crítico.
 *   · Un lote YA VENCIDO (-10 días) con existencia
 *       -> block-expired-batches debe pasarlo a cuarentena CONSERVANDO la
 *          cantidad, y el FEFO debe ignorarlo aunque tenga stock.
 *
 * ── DATOS FICTICIOS ─────────────────────────────────────────────────────────
 * Los laboratorios y números de lote son inventados. Es un entorno de pruebas;
 * no sembrar sobre una base con datos reales.
 *
 * Idempotente: se salta lo que ya exista, por handle de producto y por número
 * de lote.
 */

/** Días desde hoy -> fecha, a medianoche para que el corte no dependa de la hora. */
function enDias(dias: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  return d
}

type LoteDemo = {
  lote: string
  /** Días desde hoy. Negativo = ya caducado. */
  caduca: number
  cantidad: number
  /** Costo de adquisición: alimenta el promedio ponderado del inventario valorizado. */
  costo: number
  /** Qué regla ejercita este lote. Se imprime al sembrar. */
  proposito: string
}

type ProductoDemo = {
  titulo: string
  handle: string
  /** Precio de venta en pesos, tal cual lo guarda Medusa v2. */
  precio: number
  laboratorio: string
  clasificacion: "generico" | "patente" | "controlado"
  requiere_receta: boolean
  lotes: LoteDemo[]
}

const CATALOGO: ProductoDemo[] = [
  {
    titulo: "Paracetamol 500 mg (caja 20 tabletas)",
    handle: "paracetamol-500mg-20tab",
    precio: 45,
    laboratorio: "Laboratorios Demo",
    clasificacion: "generico",
    requiere_receta: false,
    lotes: [
      {
        lote: "PARA-2601",
        caduca: 400,
        cantidad: 100,
        costo: 22.5,
        proposito: "Lote lejano: el FEFO NO debe tocarlo mientras haya uno anterior",
      },
      {
        lote: "PARA-2510",
        caduca: 75,
        cantidad: 40,
        costo: 24,
        proposito: "Caduca antes: el FEFO debe consumir ESTE primero. Tramo 90 dias",
      },
    ],
  },
  {
    titulo: "Amoxicilina 500 mg (caja 12 cápsulas)",
    handle: "amoxicilina-500mg-12cap",
    precio: 128,
    laboratorio: "Farmacéutica Demo",
    clasificacion: "patente",
    requiere_receta: true,
    lotes: [
      {
        lote: "AMOX-2509",
        caduca: 20,
        cantidad: 25,
        costo: 71,
        proposito: "Tramo CRITICO: check-expirations debe contarlo en 30 dias o menos",
      },
    ],
  },
  {
    titulo: "Omeprazol 20 mg (caja 14 cápsulas)",
    handle: "omeprazol-20mg-14cap",
    precio: 89,
    laboratorio: "Laboratorios Demo",
    clasificacion: "generico",
    requiere_receta: false,
    lotes: [
      {
        lote: "OMEP-2508",
        caduca: -10,
        cantidad: 15,
        costo: 44,
        proposito: "YA VENCIDO con existencia: debe pasar a cuarentena SIN perder la cantidad",
      },
      {
        lote: "OMEP-2606",
        caduca: 300,
        cantidad: 60,
        costo: 46,
        proposito: "Vigente del mismo producto: el FEFO debe saltarse el vencido y usar este",
      },
    ],
  },
  {
    titulo: "Ibuprofeno 400 mg (caja 10 tabletas)",
    handle: "ibuprofeno-400mg-10tab",
    precio: 38,
    laboratorio: "Genéricos Demo",
    clasificacion: "generico",
    requiere_receta: false,
    lotes: [
      {
        lote: "IBUP-2605",
        caduca: 280,
        cantidad: 80,
        costo: 18,
        proposito: "Existencia sana, sin alertas",
      },
    ],
  },
  {
    titulo: "Clonazepam 2 mg (caja 30 tabletas)",
    handle: "clonazepam-2mg-30tab",
    precio: 210,
    laboratorio: "Farmacéutica Demo",
    clasificacion: "controlado",
    requiere_receta: true,
    lotes: [
      {
        lote: "CLON-2604",
        caduca: 240,
        cantidad: 12,
        costo: 118,
        proposito: "CONTROLADO: prueba RECIBO_OCULTAR_CONTROLADOS y el aviso de receta",
      },
    ],
  },
  {
    titulo: "Solución salina 0.9% 500 ml",
    handle: "solucion-salina-500ml",
    precio: 32,
    laboratorio: "Insumos Demo",
    clasificacion: "generico",
    requiere_receta: false,
    lotes: [
      {
        lote: "SALI-2607",
        caduca: 330,
        cantidad: 150,
        costo: 15,
        proposito: "Insumo de alto volumen",
      },
    ],
  },
  {
    titulo: "Guantes de nitrilo talla M (caja 100)",
    handle: "guantes-nitrilo-m-100",
    precio: 185,
    laboratorio: "Insumos Demo",
    clasificacion: "generico",
    requiere_receta: false,
    lotes: [
      {
        lote: "GUAN-2701",
        caduca: 500,
        cantidad: 30,
        costo: 96,
        proposito: "Material de curacion, sin caducidad proxima",
      },
    ],
  },
  {
    titulo: "Metformina 850 mg (caja 30 tabletas)",
    handle: "metformina-850mg-30tab",
    precio: 76,
    laboratorio: "Genéricos Demo",
    clasificacion: "generico",
    requiere_receta: true,
    lotes: [
      {
        lote: "METF-2512",
        caduca: 110,
        cantidad: 45,
        costo: 35,
        proposito: "Fuera de los tramos de alerta, para contrastar",
      },
    ],
  },
]

export default async function seedCatalogoDemo({ container }: ExecArgs) {
  const productModuleService: any = container.resolve(Modules.PRODUCT)
  const medicalInventoryService: any = container.resolve("medical_inventory")
  const farmacia = await almacenDeFarmacia(container as any)
  if (!farmacia) {
    throw new Error("No hay almacén de Farmacia. Corre `npx medusa exec ./src/scripts/preparar-almacenes.ts confirm` primero.")
  }
  const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)

  console.log("")
  console.log("=== CATÁLOGO DE DEMOSTRACIÓN ===")
  console.log("")

  /**
   * El POS lista productos filtrando por `sales_channel_id`. Sin asociarlos, el
   * catálogo queda en la base pero el punto de venta muestra cero — y como el
   * panel NO aplica ese filtro, parece intermitente: "en el admin sí se ven".
   */
  const salesChannels = await salesChannelService.listSalesChannels({})
  const salesChannelId: string | null = salesChannels?.[0]?.id ?? null

  if (!salesChannelId) {
    console.log("⚠️  No hay canal de venta. Los productos se crearán pero el POS")
    console.log("   no los mostrará. Crea uno y corre después:")
    console.log("      npx medusa exec ./src/scripts/link-products-to-channel.ts apply")
    console.log("")
  } else {
    console.log(`Canal de venta: ${salesChannels[0].name} (${salesChannelId})`)
    console.log("")
  }

  const existentes = await productModuleService.listProducts({}, { take: 5000 })
  const porHandle = new Map<string, any>()
  for (const p of existentes) {
    if (p.handle) porHandle.set(p.handle, p)
  }

  let productosCreados = 0
  let productosOmitidos = 0
  let lotesCreados = 0
  let lotesOmitidos = 0
  const fallos: string[] = []

  for (const item of CATALOGO) {
    try {
      let producto = porHandle.get(item.handle)

      if (producto) {
        productosOmitidos++
      } else {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: item.titulo,
                handle: item.handle,
                status: "published" as any,
                options: [{ title: "Presentación", values: ["Default"] }],
                variants: [
                  {
                    title: "Default",
                    options: { "Presentación": "Default" },
                    // La existencia real vive en `medical_batch`, no en el
                    // inventario de Medusa. Mismo criterio que import-inventory.
                    manage_inventory: false,
                    // Medusa v2 guarda los importes en la unidad NORMAL de la moneda:
                    // 45 son cuarenta y cinco pesos, no cuarenta y cinco centavos.
                    // (En v1 eran centavos; multiplicar por 100 aqui dejaba el
                    // catalogo con precios cien veces mayores y el POS los muestra
                    // tal cual, sin dividir.)
                    prices: [{ amount: item.precio, currency_code: "mxn" }],
                  },
                ],
                ...(salesChannelId
                  ? { sales_channels: [{ id: salesChannelId }] }
                  : {}),
                metadata: {
                  is_pharmaceutical: true,
                  nombre_comercial: item.titulo,
                  proveedor: item.laboratorio,
                  clasificacion: item.clasificacion,
                  requiere_receta: item.requiere_receta,
                  // Costo de referencia. El costo REAL para el inventario
                  // valorizado sale del promedio ponderado de las entradas
                  // asentadas abajo, no de aquí.
                  precio_compra: item.lotes[0]?.costo ?? null,
                  origen: "seed-catalogo-demo",
                },
              },
            ],
          },
        })

        producto = result[0]
        porHandle.set(item.handle, producto)
        productosCreados++
        console.log(`   + ${item.titulo}  $${item.precio.toFixed(2)}`)
      }

      const variantId = producto?.variants?.[0]?.id
      if (!variantId) {
        fallos.push(`${item.titulo}: el producto no tiene variante`)
        continue
      }

      for (const lote of item.lotes) {
        const yaExiste = await medicalInventoryService.listMedicalBatches({
          variant_id: variantId,
          batch_number: lote.lote,
        })

        if (yaExiste?.length) {
          lotesOmitidos++
          continue
        }

        const caducidad = enDias(lote.caduca)

        const batch = await medicalInventoryService.createMedicalBatches({
          batch_number: lote.lote,
          expiration_date: caducidad,
          quantity: lote.cantidad,
          variant_id: variantId,
          stock_location_id: farmacia.id,
        })
        lotesCreados++

        // Saldo de apertura en el libro mayor. Sin el asiento, la existencia
        // aparecería de la nada y el kardex no cuadraría desde el día uno.
        await recordInventoryMovement(container as any, {
          variant_id: variantId,
          stock_location_id: farmacia.id,
          variant_title: item.titulo,
          batch_id: batch.id,
          batch_number: lote.lote,
          expiration_date: caducidad,
          quantity_delta: lote.cantidad,
          quantity_after: lote.cantidad,
          type: "entry_initial",
          reason: "Carga inicial del catálogo de demostración",
          reference_type: "seed",
          reference_id: "seed-catalogo-demo",
          user_id: "system",
          unit_cost: lote.costo,
        })

        const cuando = caducidad.toISOString().slice(0, 10)
        const marca = lote.caduca < 0 ? "VENCIDO" : `cad. ${cuando}`
        console.log(`       lote ${lote.lote}  ${String(lote.cantidad).padStart(3)} u  ${marca}`)
        console.log(`           ${lote.proposito}`)
      }
    } catch (error: any) {
      fallos.push(`${item.titulo}: ${error?.message}`)
    }
  }

  console.log("")
  console.log("=== RESUMEN ===")
  console.log(`   Productos creados : ${productosCreados}`)
  console.log(`   Productos omitidos: ${productosOmitidos} (ya existían)`)
  console.log(`   Lotes creados     : ${lotesCreados}`)
  console.log(`   Lotes omitidos    : ${lotesOmitidos} (ya existían)`)

  if (fallos.length) {
    console.log("")
    console.log(`   ⚠️  Fallos (${fallos.length}):`)
    fallos.forEach((f) => console.log(`      · ${f}`))
  }

  console.log("")
  console.log("Qué se puede probar ahora:")
  console.log("   · FEFO       vende Paracetamol: debe salir de PARA-2510, no de PARA-2601")
  console.log("   · Caducados  corre run-block-expired: OMEP-2508 a cuarentena con sus 15 u")
  console.log("   · Kardex     GET /admin/inventory-movements")
  console.log("   · Valorizado GET /admin/inventory-reports/valuation (promedio ponderado)")
  console.log("")
  console.log("Datos ficticios. No sembrar sobre una base con datos reales.")
  console.log("")
}
