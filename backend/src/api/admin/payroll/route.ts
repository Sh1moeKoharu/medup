import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { calcularNomina } from "../../../lib/nomina-servidor";
import { rangoDeFechas } from "../../../lib/reportes";

/**
 * GET /admin/payroll?desde=2026-09-01&hasta=2026-09-15 — la nómina del
 * periodo: por persona, turnos, horas, lo que se le atribuye, la comisión por
 * regla y el total; y si ya se le pagó algo que se traslape con el periodo.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const q = req.query as Record<string, string>;
        const rango = rangoDeFechas(q.desde, q.hasta);
        if (rango.error || !rango.desde || !rango.hasta) {
            return res.status(400).json({ message: rango.error ?? "Indica el periodo: desde y hasta." });
        }
        const filas = await calcularNomina(req.scope as any, { desde: rango.desde, hasta: rango.hasta, user_id: q.user_id || undefined });
        res.json({
            desde: rango.desde,
            hasta: rango.hasta,
            nomina: filas,
            total: Math.round(filas.reduce((s, f) => s + f.desglose.total, 0) * 100) / 100,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
