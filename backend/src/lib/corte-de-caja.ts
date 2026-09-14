/**
 * Resumen de un turno de caja, a partir de sus movimientos. Función pura.
 *
 * Es la misma aritmética que `GET /admin/cash-sessions/:id/summary`; vive
 * aquí para que el corte impreso (documents/corte) y el resumen en pantalla
 * no puedan discrepar.
 */

export type MovimientoDeCaja = {
  type: "sale" | "refund" | "cash_in" | "cash_out" | string
  payment_method: "cash" | "card" | "transfer" | "other" | string
  amount: number | string
}

export type ResumenDeCaja = {
  opening_amount: number
  sales_cash: number
  sales_card: number
  sales_transfer: number
  sales_other: number
  sales_total: number
  refunds_cash: number
  refunds_card: number
  refunds_total: number
  cash_in_total: number
  cash_out_total: number
  transaction_count: number
  refund_count: number
  expected_cash_in_register: number
  total_revenue: number
}

export function calcularResumen(openingAmount: number | string, movimientos: MovimientoDeCaja[]): ResumenDeCaja {
  const r: ResumenDeCaja = {
    opening_amount: Number(openingAmount) || 0,
    sales_cash: 0,
    sales_card: 0,
    sales_transfer: 0,
    sales_other: 0,
    sales_total: 0,
    refunds_cash: 0,
    refunds_card: 0,
    refunds_total: 0,
    cash_in_total: 0,
    cash_out_total: 0,
    transaction_count: 0,
    refund_count: 0,
    expected_cash_in_register: 0,
    total_revenue: 0,
  }

  for (const m of movimientos ?? []) {
    const monto = Number(m.amount) || 0
    switch (m.type) {
      case "sale":
        r.transaction_count++
        r.sales_total += monto
        if (m.payment_method === "cash") r.sales_cash += monto
        else if (m.payment_method === "card") r.sales_card += monto
        else if (m.payment_method === "transfer") r.sales_transfer += monto
        else r.sales_other += monto
        break
      case "refund":
        r.refund_count++
        r.refunds_total += monto
        if (m.payment_method === "cash") r.refunds_cash += monto
        else if (m.payment_method === "card") r.refunds_card += monto
        break
      case "cash_in":
        r.cash_in_total += monto
        break
      case "cash_out":
        r.cash_out_total += monto
        break
    }
  }

  r.expected_cash_in_register =
    r.opening_amount + r.sales_cash - r.refunds_cash + r.cash_in_total - r.cash_out_total
  r.total_revenue = r.sales_total - r.refunds_total

  return r
}
