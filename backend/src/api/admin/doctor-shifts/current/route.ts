import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { HONORARIOS_MODULE } from "../../../../modules/honorarios";
import HonorariosModuleService from "../../../../modules/honorarios/service";
import { resolveRequestActor } from "../../../../lib/require-role";

/** GET /admin/doctor-shifts/current — el turno abierto de quien pregunta, o null. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.json({ doctor_shift: null });
        }
        const [turno] = await service.listDoctorShifts({ doctor_id: actor.id, closed_at: null });
        res.json({ doctor_shift: turno ?? null });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
