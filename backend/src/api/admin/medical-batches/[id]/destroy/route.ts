import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../../../../../lib/inventory-ledger";

/**
 * POST /admin/medical-batches/:id/destroy — Destrucción sanitaria.
 *
 * Es el ÚNICO punto donde un lote caducado sale físicamente del inventario, y
 * es un acto autorizado por una persona (no lo hace el job automático). El job
 * sólo pone el lote en cuarentena; destruir requiere una decisión humana, que
 * es exactamente lo que exige el trámite ante COFEPRIS.
 *
 * Body: { reason?: string, notes?: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params;
        const { reason, notes } = (req.body ?? {}) as any;

        const medicalInventoryService: any = req.scope.resolve("medical_inventory");

        const [batch] = await medicalInventoryService.listMedicalBatches({ id });

        if (!batch) {
            return res.status(404).json({ message: "Lote no encontrado." });
        }

        if (batch.status === "destroyed") {
            return res.status(400).json({
                message: "Este lote ya fue destruido. La destrucción no se repite.",
            });
        }

        // Sólo se destruye lo que ya fue bloqueado. Destruir un lote vigente
        // sería una merma por daño/robo, que es otro flujo (exit_damage).
        if (batch.status !== "quarantined") {
            return res.status(400).json({
                message:
                    "Sólo se pueden destruir lotes en cuarentena. Este lote está " +
                    `"${batch.status}": si caducó, espera al bloqueo automático; ` +
                    "si se dañó o extravió, regístralo como ajuste de inventario.",
            });
        }

        const destroyedQuantity = Number(batch.quantity) || 0;

        if (destroyedQuantity <= 0) {
            return res.status(400).json({
                message: "El lote no tiene existencia que destruir.",
            });
        }

        // Quién autoriza la destrucción: dato obligatorio para el expediente.
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

        await medicalInventoryService.updateMedicalBatches({
            id,
            quantity: 0,
            status: "destroyed",
        });

        const recorded = await recordInventoryMovement(req.scope as any, {
            variant_id: batch.variant_id,
            batch_id: batch.id,
            batch_number: batch.batch_number ?? null,
            expiration_date: batch.expiration_date ?? null,
            quantity_delta: -destroyedQuantity,
            quantity_after: 0,
            type: "exit_expiry",
            reason: reason ?? "Destrucción sanitaria autorizada",
            reference_type: "sanitary_destruction",
            reference_id: batch.id,
            user_id: userId,
            user_email: userEmail,
            notes: notes ?? null,
        });

        res.json({
            batch_id: batch.id,
            batch_number: batch.batch_number,
            destroyed_quantity: destroyedQuantity,
            authorized_by: userEmail ?? userId,
            ledger_recorded: recorded,
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
