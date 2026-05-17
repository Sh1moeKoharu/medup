import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/cash-sessions/current
 * Obtiene la sesión activa actual (status = "open")
 * Si no hay sesión abierta, retorna null
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: [
                "id",
                "opened_at",
                "opening_amount",
                "cashier_id",
                "cashier_name",
                "sales_channel_id",
                "status",
            ],
            filters: { status: "open" },
        });

        const session = sessions && sessions.length > 0 ? sessions[0] : null;

        res.json({ session });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
