import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updatePromotionsStatusWorkflow } from "@medusajs/medusa/core-flows";
import { ASEGURANZAS_MODULE } from "../../../../modules/aseguranzas";
import AseguranzasModuleService from "../../../../modules/aseguranzas/service";
import { revisarAseguranza, sincronizarPromocion } from "../../../../lib/aseguranzas";

/**
 *   GET    /admin/insurances/:id
 *   POST   /admin/insurances/:id     ← corrige (mismo verbo que el resto del panel)
 *   DELETE /admin/insurances/:id     ← la retira; su promoción queda inactiva
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: AseguranzasModuleService = req.scope.resolve(ASEGURANZAS_MODULE);
        const [insurance] = await service.listInsurances({ id: req.params.id });
        if (!insurance) return res.status(404).json({ error: "Aseguranza no encontrada." });
        res.json({ insurance });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: AseguranzasModuleService = req.scope.resolve(ASEGURANZAS_MODULE);
        const [actual] = await service.listInsurances({ id: req.params.id });
        if (!actual) return res.status(404).json({ error: "Aseguranza no encontrada." });

        const { name, discount_percent, status, valid_from, valid_until, notes } = (req.body ?? {}) as any;
        const nuevos = {
            name: name !== undefined ? String(name).trim() : actual.name,
            discount_percent: discount_percent !== undefined ? Number(discount_percent) : actual.discount_percent,
        };
        const problema = revisarAseguranza(nuevos);
        if (problema) return res.status(400).json({ error: problema });

        let aseguranza: any = await service.updateInsurances({
            id: actual.id,
            ...nuevos,
            ...(status !== undefined && { status: status === "inactive" ? "inactive" : "active" }),
            ...(valid_from !== undefined && { valid_from: valid_from ? new Date(valid_from) : null }),
            ...(valid_until !== undefined && { valid_until: valid_until ? new Date(valid_until) : null }),
            ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
        });
        const promo = await sincronizarPromocion(req.scope as any, aseguranza);
        if (promo.promotion_id !== aseguranza.promotion_id || promo.promotion_code !== aseguranza.promotion_code) {
            aseguranza = await service.updateInsurances({ id: aseguranza.id, ...promo });
        }
        res.json({ insurance: aseguranza });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: AseguranzasModuleService = req.scope.resolve(ASEGURANZAS_MODULE);
        const [actual] = await service.listInsurances({ id: req.params.id });
        if (!actual) return res.status(404).json({ error: "Aseguranza no encontrada." });
        if (actual.promotion_id) {
            // La promoción no se borra: los pedidos ya cobrados la referencian.
            await updatePromotionsStatusWorkflow(req.scope as any).run({
                input: { promotionsData: [{ id: actual.promotion_id, status: "inactive" }] },
            });
        }
        await service.deleteInsurances(actual.id);
        res.json({ id: actual.id, deleted: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
