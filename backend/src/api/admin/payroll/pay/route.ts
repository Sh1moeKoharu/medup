import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../modules/honorarios";
import { conCandado } from "../../../../lib/candado";
import { conDiasDelPeriodo, periodosSeTraslapan } from "../../../../lib/nomina";
import { calcularNomina } from "../../../../lib/nomina-servidor";
import { rangoDeFechas } from "../../../../lib/reportes";
import { resolveRequestActor } from "../../../../lib/require-role";

/**
 * POST /admin/payroll/pay { user_id, desde, hasta, reference?, notes? }
 *
 * Registra el pago del periodo a una persona. El monto NO lo manda la pantalla:
 * se vuelve a calcular aquí y se guarda con su desglose, congelado. Un periodo
 * que se traslapa con otro ya pagado a la misma persona se rechaza (409): pagar
 * dos veces el mismo tiempo es el error que esto evita.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { user_id, desde, hasta, reference, notes } = (req.body ?? {}) as any;
        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ message: "Vuelve a iniciar sesión." });
        }
        if (!user_id) {
            return res.status(400).json({ message: "Falta la persona (user_id)." });
        }
        const rango = rangoDeFechas(desde, hasta);
        if (rango.error || !rango.desde || !rango.hasta) {
            return res.status(400).json({ message: rango.error ?? "Indica el periodo: desde y hasta." });
        }
        const periodo = { desde: rango.desde, hasta: rango.hasta };

        return await conCandado(req.scope as any, `pago:${user_id}`, async () => {
            const honorarios: any = req.scope.resolve(HONORARIOS_MODULE);
            const previos: any[] = await honorarios.listStaffPayments({ user_id }, { take: 1000 });
            const choca = previos.find((p) => periodosSeTraslapan({ desde: p.period_from, hasta: p.period_to }, periodo));
            if (choca) {
                return res.status(409).json({
                    type: "periodo_pagado",
                    message: "Ese periodo ya se pagó (o se traslapa con uno pagado) a esta persona.",
                    pago: conDiasDelPeriodo(choca),
                });
            }

            const [fila] = await calcularNomina(req.scope as any, { ...periodo, user_id });
            if (!fila || fila.desglose.total <= 0) {
                return res.status(400).json({ message: "No hay nada que pagar a esta persona en ese periodo." });
            }

            const pago = await honorarios.createStaffPayments({
                user_id,
                user_name: fila.nombre,
                role: fila.rol,
                period_from: new Date(periodo.desde),
                period_to: new Date(periodo.hasta),
                amount: fila.desglose.total,
                breakdown: { ...fila.desglose, numero_empleado: fila.numero_empleado },
                paid_at: new Date(),
                paid_by_id: actor.id,
                paid_by_name: actor.name,
                reference: reference ? String(reference).trim().slice(0, 80) : null,
                notes: notes ? String(notes).trim().slice(0, 500) : null,
            });
            return res.status(201).json({ pago: conDiasDelPeriodo(pago) });
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
