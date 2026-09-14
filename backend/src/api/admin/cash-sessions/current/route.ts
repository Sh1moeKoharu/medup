import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { resolveRequestActor } from "../../../../lib/require-role";

/**
 * GET /admin/cash-sessions/current
 * El turno abierto de QUIEN pregunta (status = "open", cashier_id = yo).
 * Los turnos son por cajero; el de otra caja no es "el actual" de ésta.
 * Si no hay, retorna null
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.json({ session: null });
        }

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
            filters: { status: "open", cashier_id: actor.id },
        });

        const session = sessions && sessions.length > 0 ? sessions[0] : null;

        res.json({ session });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
