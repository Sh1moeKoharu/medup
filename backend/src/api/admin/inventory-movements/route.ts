import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * GET /admin/inventory-movements — Kardex.
 *
 * Filtros: ?variant_id= &batch_id= &type= &from= &to= &limit= &offset=
 *
 * Es de SOLO LECTURA a propósito: el libro mayor es append-only y sólo se
 * escribe desde `lib/inventory-ledger.ts`, invocado por la operación que
 * realmente movió el stock. No se expone POST/PUT/DELETE — un asiento que se
 * puede editar desde fuera no sirve como evidencia.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        const {
            variant_id,
            batch_id,
            type,
            from,
            to,
            limit = "50",
            offset = "0",
        } = req.query as Record<string, string>;

        const filters: Record<string, any> = {};
        if (variant_id) filters.variant_id = variant_id;
        if (batch_id) filters.batch_id = batch_id;
        if (type) filters.type = type;

        if (from || to) {
            filters.created_at = {};
            if (from) filters.created_at.$gte = new Date(from).toISOString();
            if (to) filters.created_at.$lte = new Date(to).toISOString();
        }

        const take = Math.min(Number(limit) || 50, 500);

        const { data: movements } = await query.graph({
            entity: "inventory_movement",
            fields: [
                "id",
                "variant_id",
                "variant_title",
                "batch_id",
                "batch_number",
                "expiration_date",
                "quantity_delta",
                "quantity_after",
                "type",
                "reason",
                "reference_type",
                "reference_id",
                "user_id",
                "user_email",
                "unit_cost",
                "notes",
                "created_at",
            ],
            filters,
            pagination: {
                take,
                skip: Number(offset) || 0,
                order: { created_at: "DESC" },
            },
        });

        const rows = movements || [];

        // Totales del conjunto devuelto. Sirven para "mermas y ajustes" y para
        // cuadrar contra la existencia física sin recorrer todo el kardex.
        const summary = rows.reduce(
            (acc: any, m: any) => {
                const delta = Number(m.quantity_delta) || 0;
                if (delta > 0) {
                    acc.total_entries += delta;
                } else {
                    acc.total_exits += Math.abs(delta);
                }
                if (m.type === "exit_expiry" || m.type === "exit_damage") {
                    acc.total_shrinkage += Math.abs(delta);
                }
                acc.net += delta;
                return acc;
            },
            { total_entries: 0, total_exits: 0, total_shrinkage: 0, net: 0 }
        );

        res.json({
            movements: rows,
            count: rows.length,
            summary,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
