import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { csvDeCaducidades } from "../../../../lib/caducidades";
import { lotesProximosACaducar } from "../../../../lib/caducidades-servidor";

/**
 * GET /admin/expiring-inventory/export?stock_location_id=&days=90
 *
 * El mismo listado que la pantalla, en CSV para Excel: un archivo por almacén
 * (o de todos), con los tramos de 30/60/90 y lo ya caducado. Lo pide
 * Auditoría y Almacén para el recorrido físico del anaquel.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { stock_location_id, days } = req.query as Record<string, string>;
        const { items } = await lotesProximosACaducar(req.scope as any, {
            days: days ? Number(days) : 90,
            stock_location_id: stock_location_id || null,
        });

        const hoy = new Date().toISOString().slice(0, 10);
        const nombre = `caducidades-${hoy}${stock_location_id ? `-${stock_location_id.slice(-6)}` : ""}.csv`;

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
        res.status(200).send(csvDeCaducidades(items));
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
