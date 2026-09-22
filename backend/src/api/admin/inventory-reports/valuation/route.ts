import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { resolveRequestActor } from "../../../../lib/require-role";
import { canSeeCost } from "../../../../lib/roles";
import { sinCostos, valorizarInventario } from "../../../../lib/valuacion";

/**
 * GET /admin/inventory-reports/valuation — Inventario actual valorizado.
 *
 * El cálculo (costo promedio ponderado por almacén) está en lib/valuacion.ts,
 * compartido con el reporte exportable.
 *
 * Query: ?include_quarantined=true  (por omisión sólo cuenta lo vendible)
 *        &stock_location_id=        (sólo ese almacén; por omisión, todos)
 *
 * Farmacia consulta aquí las existencias, pero el costo es de Almacén: se le
 * entregan las unidades sin el valor.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const q = req.query as Record<string, string>;
        const includeQuarantined = String(q.include_quarantined) === "true";

        let resultado = await valorizarInventario(req.scope as any, {
            stock_location_id: q.stock_location_id,
            include_quarantined: includeQuarantined,
        });

        const actor = await resolveRequestActor(req);
        if (!canSeeCost(actor?.role ?? null)) {
            resultado = sinCostos(resultado);
        }

        const { items, summary } = resultado;
        res.json({
            items,
            count: items.length,
            summary,
            include_quarantined: includeQuarantined,
            note:
                summary.unvalued_variants > 0 && summary.total_value !== null
                    ? `${summary.unvalued_variants} variante(s) sin costo asentado en el libro mayor: ` +
                      `su existencia se reporta pero no se valoriza. Se corrige registrando ` +
                      `\`unit_cost\` al dar de alta los lotes.`
                    : undefined,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
