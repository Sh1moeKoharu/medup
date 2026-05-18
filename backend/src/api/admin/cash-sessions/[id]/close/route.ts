import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * POST /admin/cash-sessions/:id/close
 * Cierra una sesión de caja
 * Body: { actual_closing_amount, notes? }
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const { actual_closing_amount, notes } = req.body as any;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const cashSessionService = req.scope.resolve("cash_session");

        // Verificar que la sesión existe y está abierta
        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: ["id", "status", "opening_amount"],
            filters: { id },
        });

        if (!sessions || sessions.length === 0) {
            return res.status(404).json({ message: "Sesión de caja no encontrada" });
        }

        if (sessions[0].status === "closed") {
            return res.status(400).json({ message: "Esta sesión de caja ya está cerrada" });
        }

        // Calcular el monto esperado basado en movimientos
        const { data: movements } = await query.graph({
            entity: "cash_movement",
            fields: ["type", "payment_method", "amount"],
            filters: { session_id: id },
        });

        const openingAmount = Number(sessions[0].opening_amount) || 0;

        // Solo efectivo afecta el total en caja física
        let cashInRegister = openingAmount;
        for (const mov of (movements || [])) {
            const amount = Number(mov.amount) || 0;
            if (mov.payment_method === "cash") {
                if (mov.type === "sale" || mov.type === "cash_in") {
                    cashInRegister += amount;
                } else if (mov.type === "refund" || mov.type === "cash_out") {
                    cashInRegister -= amount;
                }
            }
        }

        const actualAmount = Number(actual_closing_amount) || 0;
        const difference = actualAmount - cashInRegister;

        // Actualizar la sesión
        const updatedSession = await cashSessionService.updateCashSessions({
            id,
            closed_at: new Date(),
            expected_closing_amount: cashInRegister,
            actual_closing_amount: actualAmount,
            difference,
            status: "closed",
            notes: notes || null,
        });

        res.json({
            session: updatedSession,
            summary: {
                opening_amount: openingAmount,
                expected_cash: cashInRegister,
                actual_cash: actualAmount,
                difference,
                difference_label: difference > 0 ? "Sobrante" : difference < 0 ? "Faltante" : "Cuadrado",
            },
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
