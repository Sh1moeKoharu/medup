import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { agregarPaquete, paquetePorId, quitarPaquete, vigente } from "../../../../../lib/paquetes";

/**
 * El paquete en el carrito.
 *
 *   POST /admin/draft-orders/:id/paquete  { package_id }                  → lo añade entero
 *   POST /admin/draft-orders/:id/paquete  { package_id, quitar: true }    → quita todos sus renglones
 *
 * Los renglones entran con el precio del paquete prorrateado y marcados
 * (ver lib/paquetes.ts). Quién puede: quien arma carritos (lib/api-policy.ts).
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { package_id, quitar } = (req.body ?? {}) as any;
        if (!package_id) return res.status(400).json({ error: "Falta el paquete (package_id)." });
        const paquete = await paquetePorId(req.scope as any, String(package_id));
        if (!paquete) return res.status(404).json({ error: "Paquete no encontrado." });

        if (quitar) {
            const r = await quitarPaquete(req.scope as any, req.params.id, paquete.id);
            return res.json({ package: { id: paquete.id, name: paquete.name }, quitado: true, ...r });
        }
        if (!vigente(paquete)) return res.status(400).json({ error: `El paquete «${paquete.name}» no está vigente.` });
        const r = await agregarPaquete(req.scope as any, req.params.id, paquete);
        res.json({ package: { id: paquete.id, name: paquete.name, price: paquete.price }, ...r });
    } catch (error: any) {
        const conocido = /ya está en el carrito|ya se cobró|no está dado de alta|No se encontró/.test(error?.message ?? "");
        res.status(conocido ? 400 : 500).json({ error: error.message });
    }
};
