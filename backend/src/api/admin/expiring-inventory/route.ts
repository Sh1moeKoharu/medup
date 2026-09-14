import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { lotesProximosACaducar } from "../../../lib/caducidades-servidor";

/**
 * GET /admin/expiring-inventory — Alertas de caducidad por tramos.
 *
 * La propuesta pide avisos a 90 / 60 / 30 días. La consulta y la
 * clasificación viven en lib/caducidades(-servidor).ts, compartidas con la
 * exportación CSV (/export) y el job diario, para que no discrepen.
 *
 * Query: ?days=90  (por omisión 90, que es el tramo más amplio)
 *        &stock_location_id=  (sólo ese almacén; por omisión, todos)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { days, stock_location_id } = req.query as Record<string, string>;
        const { items, summary, horizon_days } = await lotesProximosACaducar(req.scope as any, {
            days: days ? Number(days) : 90,
            stock_location_id: stock_location_id || null,
        });
        res.json({ items, count: items.length, summary, horizon_days });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
