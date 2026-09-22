import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { claveDePeriodo } from "../../../../lib/caja";
import { calcularPagos } from "../../../../lib/honorarios-servidor";
import { puedeLeerReporte } from "../../../../lib/reportes";
import { resolveRequestActor } from "../../../../lib/require-role";

/**
 * GET /admin/reports/revenue?from=&to=&group=doctor|shift|week|month|day
 *
 *   doctor / shift  lo cobrado de las órdenes médicas, por médico o por turno
 *                   (misma base que /reports/doctor-payments)
 *   day / week / month  lo vendido en mostrador y consulta: pedidos cobrados
 *                       (no borradores) por fecha de creación
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        // /admin/reports deja pasar a Almacén por sus reportes; éste no es suyo.
        if (!puedeLeerReporte((await resolveRequestActor(req))?.role, "ventas")) {
            return res.status(403).json({ message: "Tu perfil no tiene acceso a este reporte." });
        }
        const { from, to, group = "month" } = req.query as Record<string, string>;

        if (group === "doctor" || group === "shift") {
            const { medicos } = await calcularPagos(req.scope as any, { from, to });
            const filas =
                group === "doctor"
                    ? medicos.map((m) => ({ clave: m.doctor_id, etiqueta: m.doctor_name ?? m.doctor_id, ordenes: m.ordenes, cobrado: m.cobrado, comision: m.comision }))
                    : medicos.flatMap((m) =>
                          m.turnos.map((t) => ({
                              clave: t.turno_id ?? `${m.doctor_id}:sin-turno`,
                              etiqueta: `${m.doctor_name ?? m.doctor_id} · ${t.turno_id ? (t.abierto ? "turno abierto" : "turno") : "fuera de turno"}`,
                              ordenes: t.ordenes,
                              cobrado: t.cobrado,
                              comision: t.comision,
                          }))
                      );
            return res.json({ group, from: from ?? null, to: to ?? null, rows: filas });
        }

        if (!["day", "week", "month"].includes(group)) {
            return res.status(400).json({ message: `Agrupación inválida: "${group}". Válidas: doctor, shift, day, week, month.` });
        }

        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const filters: any = { status: { $ne: "draft" } };
        if (from || to) {
            filters.created_at = {};
            if (from) filters.created_at.$gte = new Date(from).toISOString();
            if (to) filters.created_at.$lte = new Date(to).toISOString();
        }
        const { data: pedidos } = await query.graph({
            entity: "order",
            fields: ["id", "status", "created_at", "total", "currency_code"],
            filters,
            pagination: { take: 10000 },
        });

        const porPeriodo = new Map<string, { clave: string; etiqueta: string; pedidos: number; cobrado: number }>();
        for (const p of pedidos ?? []) {
            if (String(p.status) === "canceled" || String(p.status) === "cancelled") continue;
            const { periodo } = claveDePeriodo(p.created_at, group as any);
            const fila = porPeriodo.get(periodo) ?? { clave: periodo, etiqueta: periodo, pedidos: 0, cobrado: 0 };
            fila.pedidos++;
            fila.cobrado = Math.round((fila.cobrado + (Number(p.total) || 0)) * 100) / 100;
            porPeriodo.set(periodo, fila);
        }

        res.json({
            group,
            from: from ?? null,
            to: to ?? null,
            rows: [...porPeriodo.values()].sort((a, b) => (a.clave < b.clave ? 1 : -1)),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
