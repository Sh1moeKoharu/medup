import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MEDICAL_ORDERS_MODULE } from "../modules/medical-orders"

/**
 * Nada se cobra ni se imprime mientras Enfermería tenga algo sin aplicar.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * «Ningún ticket se puede imprimir en caja si no está aplicado por
 * Enfermería.» La pantalla de Caja ya lo enseñaba: quien sigue en consulta
 * sale en gris, sin botón. Pero una pantalla no es una regla. Por la pestaña
 * Órdenes, o armando un carrito a nombre del paciente desde el mostrador, se
 * podía cobrar igual —y descontar dos veces el medicamento: una al aplicarlo
 * en Enfermería y otra al venderlo de Farmacia—.
 *
 * Aquí la regla vive en el servidor, donde no se puede rodear: cobrar
 * (`convert-to-order`) o pedir el ticket de un pedido en borrador se niega
 * con 409 mientras el paciente tenga órdenes dirigidas a Enfermería en estado
 * pendiente. En cuanto Enfermería aplica —o quien la emitió la cancela—, la
 * cuenta pasa a «Por cobrar» sola.
 *
 * Se aplica a CUALQUIER pedido en borrador del paciente, no sólo a su cuenta
 * de consulta: el carrito de mostrador a su nombre es precisamente el atajo
 * que había que cerrar. Los pedidos ya cobrados no se tocan: reimprimir un
 * ticket de ayer no depende de la consulta de hoy.
 */

export type OrdenPendiente = { customer_name?: string | null; created_at?: string | Date | null }

/** Por qué no se puede cobrar todavía, o null si sí se puede. Función pura. */
export function motivoParaNoCobrar(pendientes: OrdenPendiente[]): string | null {
  if (!pendientes.length) return null
  const nombre = pendientes.find((p) => p.customer_name)?.customer_name?.trim() || "El paciente"
  const n = pendientes.length
  return (
    `${nombre} tiene ${n === 1 ? "una orden" : `${n} órdenes`} en Enfermería sin aplicar. ` +
    "No se cobra ni se imprime hasta que Enfermería aplique: entonces la cuenta aparece sola en «Por cobrar». " +
    "Si la orden ya no procede, quien la emitió puede cancelarla."
  )
}

/** Órdenes del paciente dirigidas a Enfermería y todavía pendientes. */
export async function pendientesDeEnfermeriaDe(container: MedusaContainer, customerId: string): Promise<OrdenPendiente[]> {
  const ordenes: any = container.resolve(MEDICAL_ORDERS_MODULE)
  return ordenes.listMedicalOrders({ customer_id: customerId, status: "pending", recipient_area: "nursing" }, { take: 50 })
}

/**
 * Guard para `convert-to-order` y para el ticket. Sólo actúa sobre pedidos en
 * borrador con paciente; el resto (carritos de invitado, ventas ya cerradas)
 * sigue de largo. Si no puede leer el pedido, no estorba: la ruta de abajo
 * dará su propio 404.
 */
export function requireSinPendientesDeEnfermeria() {
  return async function requireSinPendientesDeEnfermeriaMiddleware(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const id = req.params.id ?? req.params.orderId
    if (!id) return next()

    let pedido: any = null
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "status", "customer_id"],
        filters: { id },
      })
      pedido = (data ?? [])[0] ?? null
    } catch {
      return next()
    }
    if (!pedido || pedido.status !== "draft" || !pedido.customer_id) return next()

    const pendientes = await pendientesDeEnfermeriaDe(req.scope as any, pedido.customer_id)
    const motivo = motivoParaNoCobrar(pendientes)
    if (motivo) {
      return res.status(409).json({ type: "esperando_enfermeria", message: motivo, pendientes: pendientes.length })
    }
    return next()
  }
}
