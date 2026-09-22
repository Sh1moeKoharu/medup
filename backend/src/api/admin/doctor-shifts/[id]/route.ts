import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../modules/honorarios";
import HonorariosModuleService from "../../../../modules/honorarios/service";
import { LARGO_MINIMO_MOTIVO, limpiarMotivo } from "../../../../lib/ajustes-de-orden";
import { resolveRequestActor } from "../../../../lib/require-role";
import { ROLES } from "../../../../lib/roles";

/**
 * POST /admin/doctor-shifts/:id { opened_at?, closed_at?, motivo }
 *
 * Corregir las horas de un turno. Un turno que se quedó abierto cuenta hasta
 * el momento del reporte y le infla las horas a la persona; uno que se cerró
 * al día siguiente, igual. RH o Administración lo corrigen con motivo, y el
 * motivo queda en el turno y en la bitácora.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const { opened_at, closed_at, motivo } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "Vuelve a iniciar sesión." });
        }
        if (actor.role !== ROLES.ADMIN && actor.role !== ROLES.HR) {
            return res.status(403).json({ error: "Las horas de un turno las corrigen RH y Administración." });
        }
        const razon = limpiarMotivo(motivo);
        if (razon.length < LARGO_MINIMO_MOTIVO) {
            return res.status(400).json({ error: `Escribe por qué se corrige el turno (al menos ${LARGO_MINIMO_MOTIVO} caracteres).` });
        }

        const [turno] = await service.listDoctorShifts({ id: req.params.id });
        if (!turno) {
            return res.status(404).json({ error: "Turno no encontrado." });
        }

        const inicio = opened_at !== undefined ? new Date(opened_at) : new Date(turno.opened_at);
        const fin = closed_at !== undefined ? (closed_at === null ? null : new Date(closed_at)) : turno.closed_at ? new Date(turno.closed_at) : null;
        if (Number.isNaN(inicio.getTime()) || (fin && Number.isNaN(fin.getTime()))) {
            return res.status(400).json({ error: "Las horas deben ir como 2026-09-14T08:00:00 (hora de la clínica) o en ISO." });
        }
        const ahora = Date.now();
        if (inicio.getTime() > ahora) {
            return res.status(400).json({ error: "El turno no puede empezar en el futuro." });
        }
        if (fin && fin.getTime() > ahora + 60_000) {
            return res.status(400).json({ error: "El turno no puede terminar en el futuro." });
        }
        if (fin && fin.getTime() <= inicio.getTime()) {
            return res.status(400).json({ error: "El turno tiene que terminar después de empezar." });
        }
        if (fin && fin.getTime() - inicio.getTime() > 24 * 3_600_000) {
            return res.status(400).json({ error: "Un turno no puede durar más de 24 horas; si fueron dos jornadas, deja dos turnos." });
        }

        const sello = `[Corregido por ${actor.name ?? actor.email} el ${new Date().toISOString().slice(0, 16).replace("T", " ")}: ${razon}]`;
        const corregido = await service.updateDoctorShifts({
            id: turno.id,
            opened_at: inicio,
            closed_at: fin,
            notes: [turno.notes, sello].filter(Boolean).join("\n"),
        });

        res.json({
            doctor_shift: corregido,
            antes: { opened_at: turno.opened_at, closed_at: turno.closed_at },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
