import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../modules/medical-orders/service";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersModuleService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        
        // Obtenemos los filtros de la query (ej. status=pending, o customer_id=123)
        const filters: any = {};
        if (req.query.status) filters.status = req.query.status;
        if (req.query.customer_id) filters.customer_id = req.query.customer_id;
        if (req.query.creator_id) filters.creator_id = req.query.creator_id;

        const orders = await medicalOrdersModuleService.listMedicalOrders(filters, {
            relations: ["items"],
        });

        res.json({ medical_orders: orders });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const medicalOrdersModuleService: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        
        // En Medusa, req.user no siempre existe a menos que haya un auth middleware activo, 
        // pero podemos obtenerlo si estamos logueados en admin.
        // Validamos la data
        const { customer_id, customer_name, notes, items, creator_id, creator_name, creator_role } = req.body as any;

        if (!customer_id || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Crear la orden
        const order = await medicalOrdersModuleService.createMedicalOrders({
            status: "pending",
            customer_id,
            customer_name,
            notes,
            creator_id: creator_id || "unknown", // Normalmente lo tomaríamos de req.auth.actor_id o de frontend
            creator_name: creator_name || "Unknown",
            creator_role: creator_role || "doctor",
        });

        // Crear items
        const itemCreates = items.map(item => ({
            order_id: order.id,
            variant_id: item.variant_id,
            product_title: item.product_title,
            quantity: item.quantity,
            instructions: item.instructions,
        }));

        await medicalOrdersModuleService.createMedicalOrderItems(itemCreates);

        // Fetch de la orden completa
        const completeOrder = await medicalOrdersModuleService.retrieveMedicalOrder(order.id, {
            relations: ["items"]
        });

        res.json({ medical_order: completeOrder });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
