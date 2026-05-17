import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    try {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        
        // Fetch batches and manually fetch variants if needed, or rely on graph
        // For simplicity, let's fetch batches first
        const { data: batches } = await query.graph({
            entity: "medical_batch",
            fields: [
                "id", 
                "batch_number", 
                "expiration_date", 
                "quantity", 
                "variant_id"
            ],
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
        
        const { batch_number, expiration_date, quantity, variant_id } = req.body as any;
        
        const batch = await medicalInventoryService.createMedicalBatches({
            batch_number,
            expiration_date,
            quantity: Number(quantity),
            variant_id
        });

        res.json({ batch });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
