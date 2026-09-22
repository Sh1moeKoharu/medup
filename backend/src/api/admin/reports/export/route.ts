import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { membreteDeLaClinica } from "../../../../lib/membrete";
import { resolveRequestActor } from "../../../../lib/require-role";
import {
    csvDeTabla,
    esTipoDeReporte,
    htmlDeTabla,
    nombreDeArchivo,
    puedeLeerReporte,
    rangoDeFechas,
    TIPOS_DE_REPORTE,
} from "../../../../lib/reportes";
import { generarReporte } from "../../../../lib/reportes-servidor";

/**
 * GET /admin/reports/export?tipo=actividad&desde=2026-09-01&hasta=2026-09-14
 *                          &formato=json|csv|html
 *                          &rol=&persona=&almacen=&agrupar=
 *
 *   json  la tabla, para la vista previa en pantalla
 *   csv   el archivo para Excel
 *   html  la hoja carta horizontal con membrete, lista para imprimir
 *
 * Quién lee cada tipo lo decide lib/reportes.ts. La bitácora registra cada
 * exportación (ver LECTURAS_SENSIBLES): un reporte es una copia de los datos
 * que sale del sistema.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const q = req.query as Record<string, string>;
        const tipo = q.tipo;
        if (!esTipoDeReporte(tipo)) {
            return res.status(400).json({ message: `Reporte desconocido: "${tipo ?? ""}". Disponibles: ${TIPOS_DE_REPORTE.join(", ")}.` });
        }

        const actor = await resolveRequestActor(req);
        if (!puedeLeerReporte(actor?.role ?? null, tipo)) {
            return res.status(403).json({ message: "Tu perfil no tiene acceso a este reporte." });
        }

        const formato = (q.formato ?? "json").toLowerCase();
        if (!["json", "csv", "html"].includes(formato)) {
            return res.status(400).json({ message: `Formato desconocido: "${formato}". Válidos: json, csv, html.` });
        }

        const rango = rangoDeFechas(q.desde, q.hasta);
        if (rango.error) {
            return res.status(400).json({ message: rango.error });
        }

        const tabla = await generarReporte(req.scope as any, tipo, {
            desde: rango.desde,
            hasta: rango.hasta,
            rol: q.rol,
            persona: q.persona,
            almacen: q.almacen,
            agrupar: q.agrupar,
            actor_rol: actor?.role ?? null,
        });

        if (formato === "csv") {
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${nombreDeArchivo(tipo, rango)}"`);
            return res.status(200).send(csvDeTabla(tabla));
        }

        if (formato === "html") {
            const membrete = await membreteDeLaClinica(req.scope as any);
            const html = htmlDeTabla(tabla, membrete, { generado_por: actor?.name ?? null });
            return res.json({ html, title: tabla.titulo });
        }

        res.json({ tipo, desde: rango.desde, hasta: rango.hasta, tabla });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
