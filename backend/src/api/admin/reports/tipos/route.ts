import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { resolveRequestActor } from "../../../../lib/require-role";
import { reportesPara } from "../../../../lib/reportes";

/**
 * GET /admin/reports/tipos — los reportes que puede sacar quien pregunta,
 * con sus filtros. La pantalla de reportes se arma con esto, así que nadie ve
 * un reporte que el servidor le negaría.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const actor = await resolveRequestActor(req);
    const reportes = reportesPara(actor?.role ?? null).map(({ lectores, ...r }) => r);
    res.json({ reportes });
}
