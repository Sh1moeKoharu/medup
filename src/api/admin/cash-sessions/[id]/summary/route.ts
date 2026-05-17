import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/cash-sessions/:id/summary
 * Resumen financiero de una sesión de caja
 * Agrupa ventas por método de pago, cuenta transacciones, etc.
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        // Fetch session
        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: [
                "id",
                "opened_at",
                "closed_at",
                "opening_amount",
                "expected_closing_amount",
                "actual_closing_amount",
                "difference",
                "cashier_name",
                "status",
            ],
            filters: { id },
        });

        if (!sessions || sessions.length === 0) {
            return res.status(404).json({ message: "Sesión de caja no encontrada" });
        }

        const session = sessions[0];

        // Fetch all movements
        const { data: movements } = await query.graph({
            entity: "cash_movement",
            fields: ["type", "payment_method", "amount", "order_id"],
            filters: { session_id: id },
        });

        const allMovements = movements || [];

        // Calculate summary
        const summary = {
            opening_amount: Number(session.opening_amount) || 0,

            // Ventas por método de pago
            sales_cash: 0,
            sales_card: 0,
            sales_transfer: 0,
            sales_other: 0,
            sales_total: 0,

            // Reembolsos
            refunds_cash: 0,
            refunds_card: 0,
            refunds_total: 0,

            // Movimientos manuales de efectivo
            cash_in_total: 0,
            cash_out_total: 0,

            // Conteos
            transaction_count: allMovements.filter((m: any) => m.type === "sale").length,
            refund_count: allMovements.filter((m: any) => m.type === "refund").length,

            // Efectivo esperado en caja
            expected_cash_in_register: 0,

            // Totales
            total_revenue: 0,
        };

        for (const mov of allMovements) {
            const amount = Number(mov.amount) || 0;

            switch (mov.type) {
                case "sale":
                    summary.sales_total += amount;
                    switch (mov.payment_method) {
                        case "cash": summary.sales_cash += amount; break;
                        case "card": summary.sales_card += amount; break;
                        case "transfer": summary.sales_transfer += amount; break;
                        default: summary.sales_other += amount; break;
                    }
                    break;
                case "refund":
                    summary.refunds_total += amount;
                    switch (mov.payment_method) {
                        case "cash": summary.refunds_cash += amount; break;
                        case "card": summary.refunds_card += amount; break;
                    }
                    break;
                case "cash_in":
                    summary.cash_in_total += amount;
                    break;
                case "cash_out":
                    summary.cash_out_total += amount;
                    break;
            }
        }

        // Efectivo esperado = apertura + ventas efectivo - reembolsos efectivo + entradas - salidas
        summary.expected_cash_in_register =
            summary.opening_amount
            + summary.sales_cash
            - summary.refunds_cash
            + summary.cash_in_total
            - summary.cash_out_total;

        // Ingresos netos = total ventas - total reembolsos
        summary.total_revenue = summary.sales_total - summary.refunds_total;

        res.json({
            session,
            summary,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
