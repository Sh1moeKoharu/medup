import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/cash-sessions/:id/movements
 * Lista los movimientos de una sesión de caja
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

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

        res.json({ movements: movements || [] });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

/**
 * POST /admin/cash-sessions/:id/movements
 * Registra un movimiento manual (entrada/salida de efectivo)
 * Body: { type, payment_method, amount, reference?, description? }
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const { id } = req.params;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const cashSessionService = req.scope.resolve("cash_session");

        // Verificar que la sesión existe y está abierta
        const { data: sessions } = await query.graph({
            entity: "cash_session",
            fields: ["id", "status"],
            filters: { id },
        });

        if (!sessions || sessions.length === 0) {
            return res.status(404).json({ message: "Sesión de caja no encontrada" });
        }

        if (sessions[0].status === "closed") {
            return res.status(400).json({ message: "No se pueden agregar movimientos a una sesión cerrada" });
        }

        const {
            type,
            payment_method,
            amount,
            order_id,
            reference,
            description,
        } = req.body as any;

        // Validar tipo
        const validTypes = ["sale", "refund", "cash_in", "cash_out"];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                message: `Tipo inválido. Opciones: ${validTypes.join(", ")}`,
            });
        }

        // Validar método de pago
        const validMethods = ["cash", "card", "transfer", "other"];
        if (!validMethods.includes(payment_method)) {
            return res.status(400).json({
                message: `Método de pago inválido. Opciones: ${validMethods.join(", ")}`,
            });
        }

        const created_by = (req as any).auth_context?.actor_id || "unknown";

        const movement = await cashSessionService.createCashMovements({
            session_id: id,
            order_id: order_id || null,
            type,
            payment_method,
            amount: Math.abs(Number(amount)),
            reference: reference || null,
            description: description || null,
            created_by,
        });

        res.status(201).json({ movement });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
