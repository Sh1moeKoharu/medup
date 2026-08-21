import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { fetchVariantLabels } from "../../../lib/variant-titles";

/**
 * GET /admin/expiring-inventory — Alertas de caducidad por tramos.
 *
 * La propuesta pide avisos a 90 / 60 / 30 días. La versión anterior consultaba
 * `entity: "medical_inventory"` con el campo `product_variant.*`; ninguno de
 * los dos existe (la entidad real es `medical_batch`), así que la ruta nunca
 * devolvió nada útil.
 *
 * Query: ?days=90  (por omisión 90, que es el tramo más amplio)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const days = Math.min(Number((req.query as any).days) || 90, 365);

        const horizon = new Date();
        horizon.setDate(horizon.getDate() + days);

        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: [
                "id",
                "batch_number",
                "expiration_date",
                "quantity",
                "variant_id",
                "shelf_location",
                "status",
            ],
            filters: {
                expiration_date: { $lte: horizon.toISOString() },
            },
        });

        const now = new Date();
        const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        const relevant = (batches || []).filter(
            (b: any) => Number(b.quantity) > 0 && b.status !== "destroyed"
        );

        // Nombres legibles: sin esto el widget mostraría ids de variante.
        const labels = await fetchVariantLabels(
            req.scope,
            relevant.map((b: any) => b.variant_id)
        );

        const items = relevant
            .map((b: any) => {
                const exp = new Date(b.expiration_date);
                const daysLeft = Math.floor(
                    (exp.getTime() - startOfToday.getTime()) / 86400000
                );

                // Tramo de alerta. "expired" va aparte: ya no es una alerta
                // preventiva sino stock que debe estar bloqueado.
                let tier: "expired" | "30" | "60" | "90";
                if (daysLeft < 0) tier = "expired";
                else if (daysLeft <= 30) tier = "30";
                else if (daysLeft <= 60) tier = "60";
                else tier = "90";

                const label = labels.get(b.variant_id);

                return {
                    batch_id: b.id,
                    batch_number: b.batch_number,
                    variant_id: b.variant_id,
                    title: label?.label ?? b.variant_id,
                    product_title: label?.product_title ?? null,
                    expiration_date: b.expiration_date,
                    quantity: b.quantity,
                    shelf_location: b.shelf_location,
                    status: b.status,
                    days_left: daysLeft,
                    tier,
                };
            })
            .sort((a: any, b: any) => a.days_left - b.days_left);

        const summary = items.reduce(
            (acc: any, i: any) => {
                acc[i.tier].batches += 1;
                acc[i.tier].units += Number(i.quantity) || 0;
                return acc;
            },
            {
                expired: { batches: 0, units: 0 },
                "30": { batches: 0, units: 0 },
                "60": { batches: 0, units: 0 },
                "90": { batches: 0, units: 0 },
            }
        );

        res.json({ items, count: items.length, summary, horizon_days: days });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
