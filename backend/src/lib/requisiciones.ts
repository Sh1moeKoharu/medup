/**
 * Reglas de una requisición, sin base de datos.
 *
 * Lo que aquí se decide lo aplican las rutas de `api/admin/requisitions`; se
 * separa para poder probarlo solo. Las reglas:
 *
 *   · Nunca se surte más de lo que queda pendiente en un renglón.
 *   · Surtir parcial es válido: el resto sigue pendiente y la requisición
 *     también, hasta que todos los renglones estén completos.
 *   · Una requisición surtida del todo o recibida no se vuelve a surtir.
 *   · Sólo se cancela lo que no ha movido nada.
 */

export type EstadoRequisicion = "pending" | "dispatched" | "received" | "cancelled"

export type RenglonRequisicion = {
  id: string
  variant_id: string
  product_title: string | null
  quantity_requested: number
  quantity_dispatched: number
}

/** Cuánto se pide surtir de cada renglón en esta llamada. */
export type Pedido = { item_id: string; cantidad: number }

export type Surtido = { renglon: RenglonRequisicion; cantidad: number }

export function pendienteDe(r: RenglonRequisicion): number {
  return Math.max(0, (Number(r.quantity_requested) || 0) - (Number(r.quantity_dispatched) || 0))
}

export function puedeSurtirse(status: EstadoRequisicion): boolean {
  return status === "pending"
}

export function puedeRecibirse(status: EstadoRequisicion): boolean {
  return status === "dispatched"
}

export function puedeCancelarse(status: EstadoRequisicion, items: RenglonRequisicion[]): boolean {
  return status === "pending" && items.every((r) => (Number(r.quantity_dispatched) || 0) === 0)
}

/**
 * Qué se surte ahora. Sin `pedidos`, todo lo pendiente. Con ellos, lo que
 * digan, siempre que no pase de lo pendiente de cada renglón.
 *
 * Devuelve el error como texto, para que la ruta responda 400 con él.
 */
export function planificarSurtido(
  items: RenglonRequisicion[],
  pedidos?: Pedido[] | null
): { ok: true; surtir: Surtido[] } | { ok: false; error: string } {
  if (!pedidos || !pedidos.length) {
    const surtir = items
      .map((renglon) => ({ renglon, cantidad: pendienteDe(renglon) }))
      .filter((s) => s.cantidad > 0)
    if (!surtir.length) {
      return { ok: false, error: "No queda nada por surtir en esta requisición." }
    }
    return { ok: true, surtir }
  }

  const surtir: Surtido[] = []
  const vistos = new Set<string>()

  for (const p of pedidos) {
    const renglon = items.find((r) => r.id === p.item_id)
    if (!renglon) {
      return { ok: false, error: `El renglón ${p.item_id} no pertenece a esta requisición.` }
    }
    if (vistos.has(p.item_id)) {
      return { ok: false, error: `El renglón ${renglon.product_title ?? p.item_id} viene repetido.` }
    }
    vistos.add(p.item_id)

    const cantidad = Number(p.cantidad)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return {
        ok: false,
        error: `La cantidad a surtir de ${renglon.product_title ?? p.item_id} debe ser un entero mayor que 0.`,
      }
    }

    const pendiente = pendienteDe(renglon)
    if (cantidad > pendiente) {
      return {
        ok: false,
        error:
          `De ${renglon.product_title ?? p.item_id} sólo quedan ${pendiente} por surtir; ` +
          `se pidieron ${cantidad}.`,
      }
    }

    surtir.push({ renglon, cantidad })
  }

  if (!surtir.length) {
    return { ok: false, error: "No se indicó nada que surtir." }
  }

  return { ok: true, surtir }
}

/** Estado de la requisición después de aplicar un surtido. */
export function estadoTrasSurtir(items: RenglonRequisicion[], surtido: Surtido[]): EstadoRequisicion {
  const completo = items.every((r) => {
    const ahora = surtido.find((s) => s.renglon.id === r.id)?.cantidad ?? 0
    return pendienteDe(r) - ahora <= 0
  })
  return completo ? "dispatched" : "pending"
}

/** Un motivo de baja tiene que decir algo. */
export function revisarMotivo(valor: unknown): string | null {
  const motivo = String(valor ?? "").trim()
  if (motivo.length < 5) {
    return "Escribe el motivo de la baja (al menos cinco caracteres)."
  }
  return null
}
