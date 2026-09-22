import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { calcularPagos } from "../../../../lib/honorarios-servidor";
import { puedeLeerReporte } from "../../../../lib/reportes";
import { resolveRequestActor } from "../../../../lib/require-role";

/**
 * GET /admin/reports/doctor-payments?from=&to=&doctor_id=
 *
 * Por médico y por turno: cuántas órdenes surtió, lo cobrado de ellas y la
 * comisión que resulta. Cuenta sólo lo que Caja ya cobró (ver lib/honorarios.ts).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        if (!puedeLeerReporte((await resolveRequestActor(req))?.role, "honorarios")) {
            return res.status(403).json({ message: "Tu perfil no tiene acceso a este reporte." });
        }
        const { from, to, doctor_id } = req.query as Record<string, string>;
        const { pagos, medicos, turnos } = await calcularPagos(req.scope as any, { from, to, doctor_id });

        res.json({
            from: from ?? null,
            to: to ?? null,
            doctors: medicos.map((m) => ({
                ...m,
                turnos: m.turnos.map((t) => {
                    const turno = turnos.find((s) => s.id === t.turno_id);
                    return { ...t, opened_at: turno?.opened_at ?? null, closed_at: turno?.closed_at ?? null };
                }),
            })),
            orders: pagos,
            total_cobrado: Math.round(pagos.reduce((s, p) => s + p.cobrado, 0) * 100) / 100,
            total_comision: Math.round(medicos.reduce((s, m) => s + m.comision, 0) * 100) / 100,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
