import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PAQUETES_MODULE } from "../../../modules/paquetes";
import PaquetesModuleService from "../../../modules/paquetes/service";
import { revisarPaquete } from "../../../lib/paquetes";

/**
 * Paquetes a precio cerrado.
 *
 *   GET  /admin/packages?status=active           ← los lee el personal (Caja los añade al carrito)
 *   POST /admin/packages  { name, price, items: [{ variant_id, product_title, quantity }],
 *                           includes_consultation?, specialist_id?, specialist_name?,
 *                           status?, valid_from?, valid_until?, notes? }
 *
 * Quién escribe está en lib/api-policy.ts (sólo Administración).
 */
const limpiar = (b: any) => ({
    name: String(b.name ?? "").trim(),
    price: Number(b.price),
    items: (Array.isArray(b.items) ? b.items : []).map((r: any) => ({
        variant_id: String(r.variant_id ?? "").trim(),
        product_title: r.product_title ? String(r.product_title) : null,
        quantity: Number(r.quantity),
    })),
    includes_consultation: !!b.includes_consultation,
    specialist_id: b.specialist_id ? String(b.specialist_id) : null,
    specialist_name: b.specialist_name ? String(b.specialist_name).trim() : null,
    status: b.status === "inactive" ? "inactive" : "active",
    valid_from: b.valid_from ? new Date(b.valid_from) : null,
    valid_until: b.valid_until ? new Date(b.valid_until) : null,
    notes: b.notes ? String(b.notes).trim() : null,
});

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: PaquetesModuleService = req.scope.resolve(PAQUETES_MODULE);
        const { status } = req.query as Record<string, string>;
        const filtros: any = {};
        if (status === "active" || status === "inactive") filtros.status = status;
        const packages = await service.listAltusPackages(filtros, { order: { name: "ASC" } });
        res.json({ packages, count: packages.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const datos = limpiar(req.body ?? {});
        const problema = revisarPaquete(datos);
        if (problema) return res.status(400).json({ error: problema });
        const service: PaquetesModuleService = req.scope.resolve(PAQUETES_MODULE);
        const paquete = await service.createAltusPackages(datos as any);
        res.status(201).json({ package: paquete });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
