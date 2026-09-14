import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { agregarSesiones, type Agrupacion } from "../../../../lib/caja";

/**
 * GET /admin/cash-sessions/stats?from=&to=&group=day|week|month
 *
 * Ventas por método, entradas y salidas, sumadas por periodo a partir de los
 * turnos CERRADOS cuya apertura cae en el rango. Es lo que la administración
 * mira por semana o por mes; la aritmética es la del corte (lib/caja.ts).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { from, to, group = "day" } = req.query as Record<string, string>;

        if (!["day", "week", "month"].includes(group)) {
            return res.status(400).json({ message: `Agrupación inválida: "${group}". Válidas: day, week, month.` });
        }

        const filters: Record<string, any> = { status: "closed" };
        if (from || to) {
            filters.opened_at = {};
            if (from) filters.opened_at.$gte = new Date(from).toISOString();
            if (to) filters.opened_at.$lte = new Date(to).toISOString();
        }

        const { data: sesiones } = await query.graph({
            entity: "cash_session",
            fields: ["id", "status", "opened_at", "closed_at", "opening_amount", "cashier_id", "cashier_name"],
            filters,
            pagination: { take: 5000, order: { opened_at: "DESC" } },
        });

        const ids = (sesiones ?? []).map((s: any) => s.id);
        const movimientos: Record<string, any[]> = {};
        if (ids.length) {
            const { data: movs } = await query.graph({
                entity: "cash_movement",
                fields: ["session_id", "type", "payment_method", "amount"],
                filters: { session_id: ids },
                pagination: { take: 100000 },
            });
            for (const m of movs ?? []) {
                (movimientos[m.session_id] ??= []).push(m);
            }
        }

        const periodos = agregarSesiones(sesiones ?? [], movimientos, group as Agrupacion);

        res.json({
            group,
            from: from ?? null,
            to: to ?? null,
            sessions_counted: ids.length,
            periods: periodos,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
