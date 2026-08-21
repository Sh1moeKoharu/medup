import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { recordInventoryMovement } from "../../../lib/inventory-ledger";

export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        // Filtros opcionales. El widget de destrucción los usa para pedir sólo
        // los lotes en cuarentena de un producto concreto.
        const { variant_id, status } = req.query as Record<string, string>;
        const filters: Record<string, any> = {};
        if (variant_id) {
            filters.variant_id = variant_id.includes(",")
                ? variant_id.split(",").map((v) => v.trim()).filter(Boolean)
                : variant_id;
        }
        if (status) filters.status = status;

        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: [
                "id",
                "batch_number",
                "expiration_date",
                "quantity",
                "reserved_quantity",
                "variant_id",
                "shelf_location",
                "status",
                "quarantined_at"
            ],
            filters,
        });

        res.json({ batches: batches || [] });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        // Obtenemos el servicio custom medical_inventory
        const medicalInventoryService = req.scope.resolve("medical_inventory");

        const {
            batch_number,
            expiration_date,
            quantity,
            variant_id,
            // Tipo de entrada (ver propuesta: compra / devolución / ajuste /
            // traspaso). Por omisión, compra a proveedor.
            entry_type,
            unit_cost,
            reason,
        } = req.body as any;

        const parsedQuantity = Number(quantity);

        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
            return res.status(400).json({
                message: `La cantidad debe ser un número mayor a 0 (recibido: ${quantity}).`,
            });
        }

        const ALLOWED_ENTRY_TYPES = [
            "entry_purchase",
            "entry_return",
            "entry_adjustment",
            "entry_transfer",
            "entry_initial",
        ] as const;

        const movementType = entry_type ?? "entry_purchase";
        if (!ALLOWED_ENTRY_TYPES.includes(movementType)) {
            return res.status(400).json({
                message: `Tipo de entrada inválido: "${entry_type}". Válidos: ${ALLOWED_ENTRY_TYPES.join(", ")}.`,
            });
        }

        const batch = await medicalInventoryService.createMedicalBatches({
            batch_number,
            expiration_date,
            quantity: parsedQuantity,
            variant_id
        });

        // Quién dio de alta la entrada: la propuesta lo exige explícitamente
        // ("Quien ingresa") y hasta ahora no se guardaba en ningún lado.
        let userId: string | null = (req as any).auth_context?.actor_id ?? null;
        let userEmail: string | null = null;
        if (userId) {
            try {
                const userModuleService = req.scope.resolve(Modules.USER);
                const [user] = await userModuleService.listUsers({ id: userId });
                userEmail = user?.email ?? null;
            } catch {
                // El correo es informativo; su ausencia no invalida el asiento.
            }
        }

        await recordInventoryMovement(req.scope as any, {
            variant_id,
            batch_id: batch.id,
            batch_number: batch.batch_number ?? null,
            expiration_date: batch.expiration_date ?? null,
            quantity_delta: parsedQuantity,
            quantity_after: parsedQuantity, // lote recién creado: saldo = alta
            type: movementType,
            reason: reason ?? "Alta de lote en almacén",
            reference_type: "manual",
            user_id: userId,
            user_email: userEmail,
            unit_cost: unit_cost !== undefined ? Number(unit_cost) : null,
        });

        res.json({ batch });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
