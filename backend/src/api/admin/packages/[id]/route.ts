import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PAQUETES_MODULE } from "../../../../modules/paquetes";
import PaquetesModuleService from "../../../../modules/paquetes/service";
import { revisarPaquete } from "../../../../lib/paquetes";

/**
 *   GET    /admin/packages/:id
 *   POST   /admin/packages/:id     ← corrige
 *   DELETE /admin/packages/:id     ← lo retira; los cobros anteriores no cambian
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: PaquetesModuleService = req.scope.resolve(PAQUETES_MODULE);
        const [paquete] = await service.listAltusPackages({ id: req.params.id });
        if (!paquete) return res.status(404).json({ error: "Paquete no encontrado." });
        res.json({ package: paquete });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: PaquetesModuleService = req.scope.resolve(PAQUETES_MODULE);
        const [actual] = await service.listAltusPackages({ id: req.params.id });
        if (!actual) return res.status(404).json({ error: "Paquete no encontrado." });

        const b = (req.body ?? {}) as any;
        const nuevos: any = {
            name: b.name !== undefined ? String(b.name).trim() : actual.name,
            price: b.price !== undefined ? Number(b.price) : actual.price,
            items: b.items !== undefined
                ? (Array.isArray(b.items) ? b.items : []).map((r: any) => ({ variant_id: String(r.variant_id ?? "").trim(), product_title: r.product_title ? String(r.product_title) : null, quantity: Number(r.quantity) }))
                : actual.items,
            includes_consultation: b.includes_consultation !== undefined ? !!b.includes_consultation : actual.includes_consultation,
        };
        const problema = revisarPaquete(nuevos);
        if (problema) return res.status(400).json({ error: problema });

        const paquete = await service.updateAltusPackages({
            id: actual.id,
            ...nuevos,
            ...(b.specialist_id !== undefined && { specialist_id: b.specialist_id || null }),
            ...(b.specialist_name !== undefined && { specialist_name: b.specialist_name ? String(b.specialist_name).trim() : null }),
            ...(b.status !== undefined && { status: b.status === "inactive" ? "inactive" : "active" }),
            ...(b.valid_from !== undefined && { valid_from: b.valid_from ? new Date(b.valid_from) : null }),
            ...(b.valid_until !== undefined && { valid_until: b.valid_until ? new Date(b.valid_until) : null }),
            ...(b.notes !== undefined && { notes: b.notes ? String(b.notes).trim() : null }),
        });
        res.json({ package: paquete });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: PaquetesModuleService = req.scope.resolve(PAQUETES_MODULE);
        const [actual] = await service.listAltusPackages({ id: req.params.id });
        if (!actual) return res.status(404).json({ error: "Paquete no encontrado." });
        await service.deleteAltusPackages(actual.id);
        res.json({ id: actual.id, deleted: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
