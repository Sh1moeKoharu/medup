import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/cash-sessions/:id
 * Detalle de una sesión de caja
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

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
                "cashier_id",
                "cashier_name",
                "sales_channel_id",
                "status",
                "notes",
            ],
            filters: { id },
        });

        if (!sessions || sessions.length === 0) {
            return res.status(404).json({ message: "Sesión de caja no encontrada" });
        }

        // Also fetch movements for this session
        const { data: movements } = await query.graph({
            entity: "cash_movement",
            fields: [
                "id",
                "session_id",
                "order_id",
                "type",
                "payment_method",
                "amount",
                "reference",
                "description",
                "created_by",
                "created_at",
            ],
            filters: { session_id: id },
            pagination: {
                order: { created_at: "DESC" },
            },
        });

        res.json({
            session: sessions[0],
            movements: movements || [],
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
