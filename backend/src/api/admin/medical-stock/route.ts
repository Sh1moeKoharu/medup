import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { existenciasPorArea } from "../../../lib/existencias-por-area";

/**
 * GET /admin/medical-stock?variant_ids=v1,v2 — cuánto hay disponible de cada
 * presentación en Enfermería y en Farmacia. Sin costos: lo leen el médico y
 * Enfermería. Ver lib/existencias-por-area.ts.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const crudo = (req.query as any).variant_ids;
        const ids = (Array.isArray(crudo) ? crudo : String(crudo ?? "").split(","))
            .map((v: string) => String(v).trim())
            .filter(Boolean)
            .slice(0, 200);
        const mapa = await existenciasPorArea(req.scope as any, ids);
        res.json({ existencias: Object.fromEntries(mapa) });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
