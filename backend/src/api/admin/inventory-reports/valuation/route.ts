import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { fetchVariantLabels } from "../../../../lib/variant-titles";

/**
 * GET /admin/inventory-reports/valuation — Inventario actual valorizado.
 *
 * El costo unitario NO se lee de `product.metadata.precio_compra` (un único
 * valor que se sobrescribe con cada compra y no refleja lo que realmente se
 * pagó). Se calcula como PROMEDIO PONDERADO sobre las entradas asentadas en el
 * libro mayor:
 *
 *     costo_promedio = Σ(unidades_entrada × costo_unitario) / Σ(unidades_entrada)
 *
 * Es el "cálculo automático de costo promedio" que pide la propuesta, y sólo es
 * posible porque cada entrada quedó asentada con su costo.
 *
 * Query: ?include_quarantined=true  (por omisión sólo cuenta lo vendible)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const includeQuarantined =
            String((req.query as any).include_quarantined) === "true";

        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: ["id", "batch_number", "variant_id", "quantity", "status", "expiration_date"],
        });

        const { data: movements } = await query.graph({
            entity: "inventory_movement",
            fields: ["variant_id", "quantity_delta", "unit_cost", "type"],
        });

        // ── Costo promedio ponderado por variante ───────────────────────────
        const costAccumulator = new Map<string, { units: number; value: number }>();

        for (const m of movements || []) {
            const cost = m.unit_cost;
            const delta = Number(m.quantity_delta) || 0;

            // Sólo entradas con costo conocido alimentan el promedio.
            if (cost === null || cost === undefined || delta <= 0) {
                continue;
            }

            const acc = costAccumulator.get(m.variant_id) ?? { units: 0, value: 0 };
            acc.units += delta;
            acc.value += delta * Number(cost);
            costAccumulator.set(m.variant_id, acc);
        }

        const averageCost = (variantId: string): number | null => {
            const acc = costAccumulator.get(variantId);
            if (!acc || acc.units <= 0) {
                return null;
            }
            return acc.value / acc.units;
        };

        // ── Existencias por variante ────────────────────────────────────────
        const byVariant = new Map<string, any>();

        for (const b of batches || []) {
            if (b.status === "destroyed") {
                continue;
            }
            if (b.status === "quarantined" && !includeQuarantined) {
                continue;
            }

            const units = Number(b.quantity) || 0;
            if (units <= 0) {
                continue;
            }

            const row = byVariant.get(b.variant_id) ?? {
                variant_id: b.variant_id,
                units: 0,
                batches: 0,
                quarantined_units: 0,
            };

            row.units += units;
            row.batches += 1;
            if (b.status === "quarantined") {
                row.quarantined_units += units;
            }

            byVariant.set(b.variant_id, row);
        }

        const labels = await fetchVariantLabels(req.scope, [...byVariant.keys()]);

        const items = [...byVariant.values()]
            .map((row) => {
                const avg = averageCost(row.variant_id);
                return {
                    ...row,
                    title: labels.get(row.variant_id)?.label ?? row.variant_id,
                    average_unit_cost: avg === null ? null : Number(avg.toFixed(4)),
                    total_value: avg === null ? null : Number((avg * row.units).toFixed(2)),
                    /** Sin costo asentado no se puede valorizar: se reporta aparte. */
                    valued: avg !== null,
                };
            })
            .sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0));

        const summary = items.reduce(
            (acc: any, i: any) => {
                acc.total_units += i.units;
                acc.total_batches += i.batches;
                if (i.valued) {
                    acc.total_value += i.total_value;
                    acc.valued_variants += 1;
                } else {
                    acc.unvalued_variants += 1;
                }
                return acc;
            },
            {
                total_units: 0,
                total_batches: 0,
                total_value: 0,
                valued_variants: 0,
                unvalued_variants: 0,
            }
        );

        summary.total_value = Number(summary.total_value.toFixed(2));

        res.json({
            items,
            count: items.length,
            summary,
            include_quarantined: includeQuarantined,
            note:
                summary.unvalued_variants > 0
                    ? `${summary.unvalued_variants} variante(s) sin costo asentado en el libro mayor: ` +
                      `su existencia se reporta pero no se valoriza. Se corrige registrando ` +
                      `\`unit_cost\` al dar de alta los lotes.`
                    : undefined,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
