import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ASEGURANZAS_MODULE } from "../../../modules/aseguranzas";
import AseguranzasModuleService from "../../../modules/aseguranzas/service";
import { revisarAseguranza, sincronizarPromocion } from "../../../lib/aseguranzas";

/**
 * Aseguranzas.
 *
 *   GET  /admin/insurances?status=active     ← las lee todo el personal (Caja las asigna al paciente)
 *   POST /admin/insurances  { name, discount_percent, status?, valid_from?, valid_until?, notes? }
 *
 * Al crear se crea también su promoción de Medusa (ver lib/aseguranzas.ts).
 * Quién escribe está en lib/api-policy.ts (sólo Administración).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: AseguranzasModuleService = req.scope.resolve(ASEGURANZAS_MODULE);
        const { status } = req.query as Record<string, string>;
        const filtros: any = {};
        if (status === "active" || status === "inactive") filtros.status = status;
        const insurances = await service.listInsurances(filtros, { order: { name: "ASC" } });
        res.json({ insurances, count: insurances.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { name, discount_percent, status, valid_from, valid_until, notes } = (req.body ?? {}) as any;
        const problema = revisarAseguranza({ name, discount_percent });
        if (problema) return res.status(400).json({ error: problema });

        const service: AseguranzasModuleService = req.scope.resolve(ASEGURANZAS_MODULE);
        let aseguranza: any = await service.createInsurances({
            name: String(name).trim(),
            discount_percent: Number(discount_percent),
            status: status === "inactive" ? "inactive" : "active",
            valid_from: valid_from ? new Date(valid_from) : null,
            valid_until: valid_until ? new Date(valid_until) : null,
            notes: notes ? String(notes).trim() : null,
        });
        try {
            const promo = await sincronizarPromocion(req.scope as any, aseguranza);
            aseguranza = await service.updateInsurances({ id: aseguranza.id, ...promo });
        } catch (e) {
            // Sin promoción no hay descuento: mejor sin aseguranza que una que no descuenta.
            await service.deleteInsurances(aseguranza.id);
            throw e;
        }
        res.status(201).json({ insurance: aseguranza });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
