import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../../../lib/inventory-ledger";

/**
 * POST /admin/inventory-counts — Inventario físico (conteo cíclico o general).
 *
 * Recibe lo que se contó en el anaquel, lo compara contra el sistema y genera
 * los ajustes. Cubre el submódulo G de la propuesta: conteo cíclico, conteo
 * general, comparación sistema vs físico, ajuste automático y reporte de
 * diferencias.
 *
 * Body:
 *   {
 *     "counts": [{ "batch_id": "...", "counted_quantity": 47 }, ...],
 *     "apply": false,          // por omisión SIMULA: sólo reporta diferencias
 *     "notes": "Conteo anaquel A"
 *   }
 *
 * Corre en modo simulación salvo que se envíe `apply: true`. Un conteo se
 * revisa antes de mover existencias: aplicar a ciegas convierte un error de
 * captura en un ajuste de inventario irreversible.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { counts, apply = false, notes } = (req.body ?? {}) as any;

        if (!Array.isArray(counts) || counts.length === 0) {
            return res.status(400).json({
                message: "Se requiere `counts`: un arreglo de { batch_id, counted_quantity }.",
            });
        }

        const medicalInventoryService: any = req.scope.resolve("medical_inventory");

        // Quién realiza el conteo: un ajuste sin responsable no es auditable.
        const userId: string | null = (req as any).auth_context?.actor_id ?? null;
        let userEmail: string | null = null;
        if (userId) {
            try {
                const userModuleService = req.scope.resolve(Modules.USER);
                const [user] = await userModuleService.listUsers({ id: userId });
                userEmail = user?.email ?? null;
            } catch {
                // informativo
            }
        }

        const differences: any[] = [];
        const matched: any[] = [];
        const errors: any[] = [];

        for (const entry of counts) {
            const batchId = entry?.batch_id;
            const counted = Number(entry?.counted_quantity);

            if (!batchId) {
                errors.push({ entry, error: "Falta batch_id." });
                continue;
            }

            if (!Number.isFinite(counted) || counted < 0) {
                errors.push({
                    batch_id: batchId,
                    error: `counted_quantity debe ser un número >= 0 (recibido: ${entry?.counted_quantity}).`,
                });
                continue;
            }

            const [batch] = await medicalInventoryService.listMedicalBatches({ id: batchId });

            if (!batch) {
                errors.push({ batch_id: batchId, error: "Lote no encontrado." });
                continue;
            }

            const systemQuantity = Number(batch.quantity) || 0;
            const delta = counted - systemQuantity;

            const row = {
                batch_id: batch.id,
                batch_number: batch.batch_number,
                variant_id: batch.variant_id,
                status: batch.status,
                system_quantity: systemQuantity,
                counted_quantity: counted,
                difference: delta,
            };

            if (delta === 0) {
                matched.push(row);
                continue;
            }

            differences.push(row);

            if (!apply) {
                continue;
            }

            await medicalInventoryService.updateMedicalBatches({
                id: batch.id,
                quantity: counted,
            });

            // Sobrante -> entrada; faltante -> salida. El signo del delta ya
            // trae la dirección correcta.
            await recordInventoryMovement(req.scope as any, {
                variant_id: batch.variant_id,
                batch_id: batch.id,
                batch_number: batch.batch_number ?? null,
                expiration_date: batch.expiration_date ?? null,
                quantity_delta: delta,
                quantity_after: counted,
                type: delta > 0 ? "entry_adjustment" : "exit_adjustment",
                reason:
                    delta > 0
                        ? "Ajuste por inventario físico: sobrante"
                        : "Ajuste por inventario físico: faltante",
                reference_type: "inventory_count",
                user_id: userId,
                user_email: userEmail,
                notes: notes ?? null,
            });
        }

        const summary = differences.reduce(
            (acc: any, d: any) => {
                if (d.difference > 0) {
                    acc.overage_units += d.difference;
                } else {
                    acc.shortage_units += Math.abs(d.difference);
                }
                return acc;
            },
            { overage_units: 0, shortage_units: 0 }
        );

        res.json({
            applied: !!apply,
            counted_batches: counts.length,
            matched: matched.length,
            differences,
            differences_count: differences.length,
            summary: {
                ...summary,
                net_units: summary.overage_units - summary.shortage_units,
            },
            errors,
            counted_by: userEmail ?? userId,
            message: apply
                ? `Ajustes aplicados: ${differences.length} lote(s) corregido(s).`
                : `Simulación: ${differences.length} diferencia(s). Envía "apply": true para aplicar los ajustes.`,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
