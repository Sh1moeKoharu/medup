import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { HONORARIOS_MODULE } from "../../../modules/honorarios";
import HonorariosModuleService from "../../../modules/honorarios/service";
import { revisarPorcentaje } from "../../../lib/honorarios";
import { ROLES, normalizeRole } from "../../../lib/roles";

/**
 * Comisiones de médicos.
 *
 *   GET  /admin/doctor-commissions            — todas (Administración y Auditoría)
 *   POST /admin/doctor-commissions { doctor_id, percent, notes? } — crea o actualiza
 *
 * El médico no las lee: ver api-policy.ts.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const comisiones = await service.listDoctorCommissions({}, { take: 500 });
        res.json({ doctor_commissions: comisiones, count: comisiones.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: HonorariosModuleService = req.scope.resolve(HONORARIOS_MODULE);
        const { doctor_id, percent, notes } = (req.body ?? {}) as any;

        if (!doctor_id) {
            return res.status(400).json({ error: "Falta el médico (doctor_id)." });
        }
        const problema = revisarPorcentaje(percent);
        if (problema) {
            return res.status(400).json({ error: problema });
        }

        const userModuleService = req.scope.resolve(Modules.USER);
        const [medico] = await userModuleService.listUsers({ id: doctor_id });
        if (!medico) {
            return res.status(404).json({ error: "El médico no existe." });
        }
        if (normalizeRole((medico.metadata as any)?.role) !== ROLES.DOCTOR) {
            return res.status(400).json({ error: "La comisión es para cuentas con rol de Médico." });
        }
        const nombre = [medico.first_name, medico.last_name].filter(Boolean).join(" ") || medico.email;

        const [existente] = await service.listDoctorCommissions({ doctor_id });
        const comision = existente
            ? await service.updateDoctorCommissions({ id: existente.id, percent: Number(percent), doctor_name: nombre, notes: notes ?? existente.notes ?? null })
            : await service.createDoctorCommissions({ doctor_id, doctor_name: nombre, percent: Number(percent), notes: notes ?? null });

        res.json({ doctor_commission: comision, created: !existente });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
