import { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveRequestActor } from "./require-role"

/**
 * El turno de caja de quien cobra.
 *
 * ── UN TURNO POR CAJERO ─────────────────────────────────────────────────────
 * Antes el bloqueo de «ya hay un turno abierto» era global: si dos personas
 * cobraban en dos cajas, la segunda no podía abrir. Ahora cada cajero tiene
 * el suyo, y «mi turno» es el turno abierto de MI cuenta.
 *
 * ── COBRAR EXIGE TURNO ──────────────────────────────────────────────────────
 * Sin turno abierto, la venta se completaba pero el método de pago se perdía
 * y el ticket salía sin él (el punto de venta sólo registra el movimiento si
 * hay turno). En vez de parchear el síntoma, cobrar exige turno: el guard
 * responde 409 en `convert-to-order` y el punto de venta manda a abrirlo.
 */

export async function turnoAbiertoDe(container: MedusaContainer, cashierId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cash_session",
    fields: ["id", "opened_at", "opening_amount", "cashier_id", "cashier_name", "sales_channel_id", "status"],
    filters: { status: "open", cashier_id: cashierId },
  })
  return (data ?? [])[0] ?? null
}

export function requireTurnoAbierto() {
  return async function requireTurnoAbiertoMiddleware(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const actor = await resolveRequestActor(req)
    if (!actor) {
      return res.status(401).json({ type: "not_allowed", message: "No se pudo identificar a quien cobra. Vuelve a iniciar sesión." })
    }

    const turno = await turnoAbiertoDe(req.scope as any, actor.id)
    if (!turno) {
      return res.status(409).json({
        type: "turno_cerrado",
        message: "No tienes un turno de caja abierto. Ábrelo con el fondo inicial antes de cobrar.",
      })
    }

    return next()
  }
}
