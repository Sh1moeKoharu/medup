import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Una sola ejecución a la vez por clave.
 *
 * Aplicar o surtir una orden descuenta inventario. Dos clics seguidos —o dos
 * tabletas— sobre la misma orden pasaban los dos la comprobación de «está
 * pendiente» antes de que el primero la marcara, y el inventario se descontaba
 * dos veces. Con el candado, la segunda espera a la primera y encuentra la
 * orden ya aplicada.
 *
 * Usa el módulo de bloqueo de Medusa (en memoria en una sola instancia, Redis
 * si se configura). Si no está disponible, un candado del proceso: basta para
 * el servidor único de la clínica.
 */
const enCurso = new Map<string, Promise<unknown>>()

export async function conCandado<T>(container: MedusaContainer, clave: string, trabajo: () => Promise<T>): Promise<T> {
  let locking: any = null
  try {
    locking = container.resolve(Modules.LOCKING)
  } catch {
    locking = null
  }
  if (locking?.execute) {
    return locking.execute(clave, trabajo, { timeout: 30 })
  }

  while (enCurso.has(clave)) {
    await enCurso.get(clave)!.catch(() => undefined)
  }
  const promesa = trabajo()
  enCurso.set(clave, promesa)
  try {
    return await promesa
  } finally {
    enCurso.delete(clave)
  }
}
