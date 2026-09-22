import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { resolveRequestActor } from "../../../../lib/require-role";

/**
 * GET /admin/cash-sessions/current
 * El turno abierto de QUIEN pregunta (status = "open", cashier_id = yo), o
 * null. Si la caja la tiene abierta otra persona, lo dice en
 * `otra_caja_abierta`: la clínica trabaja con una sola caja a la vez, y la
 * pantalla debe explicar por qué no se puede abrir en lugar de dejar intentar.
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
            filters: { status: "open" },
        });

        const session = (sessions ?? []).find((s: any) => s.cashier_id === actor.id) ?? null;
        const otra = session ? null : (sessions ?? [])[0] ?? null;

        res.json({
            session,
            otra_caja_abierta: otra ? { cashier_name: otra.cashier_name, opened_at: otra.opened_at } : null,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
