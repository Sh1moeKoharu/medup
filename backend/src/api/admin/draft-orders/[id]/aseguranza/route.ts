import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows";
import { CLAVE_ASEGURANZA, aplicarAseguranza, aseguranzasVigentesDe, resolverAseguranza } from "../../../../../lib/aseguranzas";

/**
 * La aseguranza de un cobro.
 *
 *   GET  /admin/draft-orders/:id/aseguranza
 *        → { aseguranzas: [las vigentes del paciente], aplicada: {…} | null }
 *   POST /admin/draft-orders/:id/aseguranza  { insurance_id: string | null }
 *        → aplica ésa (o la quita con null) y devuelve lo mismo que el GET
 *
 * Caja elige aquí cuando el paciente tiene varias; con una sola, el servidor
 * la aplica solo al cobrar aunque nadie pase por aquí (ver lib/aseguranzas.ts).
 */
async function estado(container: any, orderId: string) {
    const { result: pedido } = await getOrderDetailWorkflow(container).run({
        input: { order_id: orderId, fields: ["id", "status", "customer_id", "metadata"] },
    });
    if (!pedido) return null;
    const aseguranzas = pedido.customer_id ? await aseguranzasVigentesDe(container, pedido.customer_id) : [];
    return {
        aseguranzas: aseguranzas.map((a) => ({ id: a.id, name: a.name, discount_percent: Number(a.discount_percent), policy_number: a.policy_number })),
        aplicada: (pedido.metadata as any)?.[CLAVE_ASEGURANZA] ?? null,
        es_borrador: pedido.status === "draft",
    };
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        let e = await estado(req.scope, req.params.id);
        if (!e) return res.status(404).json({ error: "Pedido no encontrado." });
        // Con UNA sola aseguranza se aplica en cuanto el cobro se abre, no al
        // final: así el total que ve Caja —y el efectivo que registra— ya lleva
        // el descuento. Con varias, hay que elegir (POST).
        if (e.es_borrador && !e.aplicada && e.aseguranzas.length === 1) {
            try {
                await aplicarAseguranza(req.scope as any, req.params.id, e.aseguranzas[0] as any);
                e = (await estado(req.scope, req.params.id)) ?? e;
            } catch {
                // se intentará de nuevo al cobrar (requireAseguranzaResuelta)
            }
        }
        res.json(e);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const e = await estado(req.scope, req.params.id);
        if (!e) return res.status(404).json({ error: "Pedido no encontrado." });
        if (!e.es_borrador) return res.status(400).json({ error: "El pedido ya se cobró: la aseguranza no se cambia." });

        const { insurance_id } = (req.body ?? {}) as any;
        let elegida: any = null;
        if (insurance_id) {
            const { aseguranza, error } = resolverAseguranza(e.aseguranzas as any, String(insurance_id));
            if (error) return res.status(400).json({ error });
            elegida = aseguranza;
        }
        await aplicarAseguranza(req.scope as any, req.params.id, elegida);
        res.json(await estado(req.scope, req.params.id));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
