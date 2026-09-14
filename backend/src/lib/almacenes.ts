import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Los dos almacenes de la clínica.
 *
 * ── QUÉ SON ─────────────────────────────────────────────────────────────────
 * Ubicaciones de inventario de Medusa (`stock_location`), que ya existían: el
 * punto de venta elige una al configurarse y el panel las administra en
 * Ajustes → Ubicaciones. Lo que se añade es un ÁREA en su metadata, para que
 * el código pueda preguntar "¿cuál es el de Farmacia?" sin depender del
 * nombre que alguien le puso.
 *
 *   · pharmacy   Farmacia. De aquí salen las ventas del mostrador y las
 *                recetas surtidas por Farmacia. Es el almacén por omisión.
 *   · nursing    Enfermería. Lo que se consume en consulta. Se abastece por
 *                requisición desde Farmacia.
 *
 * ── DÓNDE VIVE LA EXISTENCIA ────────────────────────────────────────────────
 * En `medical_batch.stock_location_id`, no en los niveles de inventario de
 * Medusa: las variantes llevan `manage_inventory: false` a propósito porque la
 * existencia real es por lote y caducidad. Cada lote pertenece a UN almacén, y
 * cada asiento del kardex dice en cuál ocurrió.
 *
 * El área se estampa con `scripts/preparar-almacenes.ts`.
 */
export const CLAVE_AREA_ALMACEN = "altus_area"

export const AREAS = {
  FARMACIA: "pharmacy",
  ENFERMERIA: "nursing",
} as const

export type AreaAlmacen = (typeof AREAS)[keyof typeof AREAS]

export const NOMBRE_ALMACEN_ENFERMERIA = "Almacén de Enfermería"

export type Almacen = {
  id: string
  name: string
  area: AreaAlmacen | null
}

export const ETIQUETA_AREA: Record<AreaAlmacen, string> = {
  pharmacy: "Farmacia",
  nursing: "Enfermería",
}

export function areaDeAlmacen(loc: { metadata?: Record<string, unknown> | null } | null | undefined): AreaAlmacen | null {
  const valor = loc?.metadata?.[CLAVE_AREA_ALMACEN]
  return valor === AREAS.FARMACIA || valor === AREAS.ENFERMERIA ? valor : null
}

/**
 * Elige el almacén de un área dentro de una lista. Función pura.
 *
 * Si ninguno tiene área y se pide Farmacia, se toma el ÚNICO que haya: es
 * la situación de una instalación anterior a esta fase, con un solo almacén
 * que hacía de todo. Con más de uno sin área no se adivina.
 */
export function elegirAlmacen(lista: Almacen[], area: AreaAlmacen): Almacen | null {
  const conArea = lista.find((a) => a.area === area)
  if (conArea) return conArea
  if (area === AREAS.FARMACIA && lista.length === 1 && !lista[0].area) {
    return lista[0]
  }
  return null
}

export async function listarAlmacenes(container: MedusaContainer): Promise<Almacen[]> {
  const service: any = container.resolve(Modules.STOCK_LOCATION)
  const lista = await service.listStockLocations({}, { take: 100 })
  return (lista ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    area: areaDeAlmacen(l),
  }))
}

export async function almacenDeFarmacia(container: MedusaContainer): Promise<Almacen | null> {
  return elegirAlmacen(await listarAlmacenes(container), AREAS.FARMACIA)
}

export async function almacenDeEnfermeria(container: MedusaContainer): Promise<Almacen | null> {
  return elegirAlmacen(await listarAlmacenes(container), AREAS.ENFERMERIA)
}

/**
 * Resuelve el almacén que pide una petición: el indicado si existe, o el de
 * Farmacia si no se indicó ninguno. Devuelve el mensaje de error como
 * segunda salida cuando el indicado no existe.
 */
export async function resolverAlmacen(
  container: MedusaContainer,
  stockLocationId?: string | null
): Promise<{ almacen: Almacen | null; error: string | null }> {
  const lista = await listarAlmacenes(container)

  if (stockLocationId) {
    const encontrado = lista.find((a) => a.id === stockLocationId)
    return encontrado
      ? { almacen: encontrado, error: null }
      : { almacen: null, error: `No existe el almacén "${stockLocationId}".` }
  }

  const farmacia = elegirAlmacen(lista, AREAS.FARMACIA)
  return farmacia
    ? { almacen: farmacia, error: null }
    : {
        almacen: null,
        error:
          "No hay un almacén de Farmacia configurado. Ejecuta " +
          "`npx medusa exec ./src/scripts/preparar-almacenes.ts confirm`.",
      }
}

/** Mapa id → nombre, para etiquetar respuestas sin repetir la consulta. */
export async function nombresDeAlmacenes(container: MedusaContainer): Promise<Map<string, string>> {
  const lista = await listarAlmacenes(container)
  return new Map(lista.map((a) => [a.id, a.name]))
}
