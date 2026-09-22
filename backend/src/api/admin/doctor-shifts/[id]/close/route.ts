import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../../modules/honorarios";
import HonorariosModuleService from "../../../../../modules/honorarios/service";
import { resolveRequestActor } from "../../../../../lib/require-role";
import { ROLES } from "../../../../../lib/roles";

/**
 * POST /admin/doctor-shifts/:id/close — cerrar el turno.
 * Sólo el propio médico (o Administración, por si se le olvidó).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const { notes } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar al médico. Vuelve a iniciar sesión." });
        }

        const [turno] = await service.listDoctorShifts({ id: req.params.id });
        if (!turno) {
            return res.status(404).json({ error: "Turno no encontrado." });
        }
        if (turno.closed_at) {
            return res.status(400).json({ error: "Este turno ya estaba cerrado." });
        }
        if (turno.doctor_id !== actor.id && actor.role !== ROLES.ADMIN) {
            return res.status(403).json({ error: "Sólo quien abrió el turno (o Administración) puede cerrarlo." });
        }

        const cerrado = await service.updateDoctorShifts({
            id: turno.id,
            closed_at: new Date(),
            ...(notes ? { notes: [turno.notes, notes].filter(Boolean).join("\n") } : {}),
        });

        res.json({ doctor_shift: cerrado });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
