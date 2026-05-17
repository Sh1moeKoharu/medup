import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/cash-sessions
 * Lista todas las sesiones de caja, con filtros opcionales
 * Query params: ?status=open|closed&cashier_id=xxx&limit=20&offset=0
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { status, cashier_id, limit = "20", offset = "0" } = req.query as Record<string, string>;

        const filters: Record<string, any> = {};
        if (status) filters.status = status;
        if (cashier_id) filters.cashier_id = cashier_id;

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
            filters,
            pagination: {
                take: Number(limit),
                skip: Number(offset),
                order: { opened_at: "DESC" },
            },
        });

        res.json({ sessions: sessions || [] });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

/**
 * POST /admin/cash-sessions
 * Abre una nueva sesión (turno) de caja
 * Body: { opening_amount, cashier_name, sales_channel_id? }
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const cashSessionService = req.scope.resolve("cash_session");
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        const {
            opening_amount,
            cashier_name,
            sales_channel_id,
        } = req.body as any;

        // Verificar que no haya una sesión abierta ya
        const { data: openSessions } = await query.graph({
            entity: "cash_session",
            fields: ["id"],
            filters: { status: "open" },
        });

        if (openSessions && openSessions.length > 0) {
            return res.status(400).json({
                message: "Ya existe una sesión de caja abierta. Ciérrala antes de abrir una nueva.",
                existing_session_id: openSessions[0].id,
            });
        }

        // Obtener el ID del usuario autenticado
        const cashier_id = (req as any).auth_context?.actor_id || "unknown";

        const session = await cashSessionService.createCashSessions({
            opened_at: new Date(),
            opening_amount: Number(opening_amount) || 0,
            cashier_id,
            cashier_name: cashier_name || "Cajero",
            sales_channel_id: sales_channel_id || null,
            status: "open",
        });

        res.status(201).json({ session });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
