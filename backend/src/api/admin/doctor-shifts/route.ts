import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../modules/honorarios";
import HonorariosModuleService from "../../../modules/honorarios/service";
import { resolveRequestActor } from "../../../lib/require-role";
import { ROLES } from "../../../lib/roles";

/**
 * Turnos de médico.
 *
 *   GET  /admin/doctor-shifts?doctor_id=&status=open|closed&from=&to=
 *   POST /admin/doctor-shifts  { notes? }   — abre el turno de quien llama
 *
 * Quién abre el turno no se pregunta: es quien inició sesión, igual que en
 * la caja. Un médico tiene un turno abierto a la vez.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const { doctor_id, status, from, to } = req.query as Record<string, string>;

        const filters: any = {};
        if (doctor_id) filters.doctor_id = doctor_id;
        if (status === "open") filters.closed_at = null;
        if (status === "closed") filters.closed_at = { $ne: null };
        if (from || to) {
            filters.opened_at = {};
            if (from) filters.opened_at.$gte = new Date(from).toISOString();
            if (to) filters.opened_at.$lte = new Date(to).toISOString();
        }

        const turnos = await service.listDoctorShifts(filters, { order: { opened_at: "DESC" }, take: 500 });
        res.json({ doctor_shifts: turnos, count: turnos.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const { notes } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar al médico. Vuelve a iniciar sesión." });
        }
        if (actor.role !== ROLES.DOCTOR && actor.role !== ROLES.ADMIN) {
            return res.status(403).json({ error: "El turno médico lo abre el médico." });
        }

        const [abierto] = await service.listDoctorShifts({ doctor_id: actor.id, closed_at: null });
        if (abierto) {
            return res.status(400).json({ error: "Ya tienes un turno abierto. Ciérralo antes de abrir otro.", doctor_shift: abierto });
        }

        const turno = await service.createDoctorShifts({
            doctor_id: actor.id,
            doctor_name: actor.name,
            opened_at: new Date(),
            notes: notes ?? null,
        });

        res.status(201).json({ doctor_shift: turno });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
