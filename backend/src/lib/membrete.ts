import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { leerConfiguracion, RECIBO_POR_OMISION } from "../api/admin/receipt-config/route"
import type { Membrete } from "./documentos"

/**
 * Encabezado de los documentos impresos: nombre, domicilio, teléfono y RFC de
 * la clínica, desde la configuración del ticket (Ajustes → Ticket).
 *
 * "Medusa Store" es el nombre de fábrica del motor; no es el de nadie y no
 * sale impreso. Sin configuración se imprime "Altus".
 */
export async function membreteDeLaClinica(container: MedusaContainer): Promise<Membrete> {
  let config = { ...RECIBO_POR_OMISION }
  let nombreTienda = ""

  try {
    const storeService: any = container.resolve(Modules.STORE)
    const tiendas = await storeService.listStores({})
    if (tiendas?.[0]) {
      config = leerConfiguracion(tiendas[0].metadata)
      nombreTienda = tiendas[0].name ?? ""
    }
  } catch {
    // Sin tienda configurada: valores por omisión.
  }

  const nombreUtil = nombreTienda && nombreTienda.toLowerCase() !== "medusa store" ? nombreTienda : ""

  return {
    establecimiento: config.nombre || nombreUtil || "Altus",
    direccion: config.direccion || null,
    telefono: config.telefono || null,
    rfc: config.rfc || null,
    logo_url: config.logo_url || null,
  }
}
