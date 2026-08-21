import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { isMedicalOrderCreatorRole } from "../../../lib/roles";
import { resolveRequestActor } from "../../../lib/require-role";
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
        
        // Sólo se toman del cuerpo los datos del PACIENTE y de la receta.
        // La identidad de quien prescribe NO se acepta del cliente (ver abajo).
        const { customer_id, customer_name, notes, items } = req.body as any;

        /**
         * IDENTIDAD DEL PRESCRIPTOR — SIEMPRE DESDE LA SESIÓN.
         *
         * Antes esto era `creator_id: creator_id || "unknown"`, tomado del
         * cuerpo de la petición. Es decir: cualquier usuario autenticado podía
         * emitir una receta atribuyéndosela a otro médico, y una orden sin ese
         * campo quedaba firmada como "unknown". Para un registro de receta
         * electrónica eso lo invalida, y contradice el no repudio que exige la
         * NOM-024-SSA3-2012 §6.6.1.
         *
         * Si el cuerpo trae `creator_*`, se ignora deliberadamente.
         */
        const actor = await resolveRequestActor(req);

        if (!actor) {
            return res.status(401).json({
                error: "No se pudo identificar al prescriptor. Una orden médica no puede emitirse de forma anónima.",
            });
        }

        // `medical_order.creator_role` tiene un check-constraint en BD limitado a
        // ('doctor','nurse','admin'). Se valida contra el rol REAL del usuario.
        if (!isMedicalOrderCreatorRole(actor.role)) {
            return res.status(403).json({
                error: `Tu rol (${actor.role ?? "sin rol"}) no puede emitir órdenes médicas.`,
            });
        }

        if (!customer_id || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Crear la orden
        const order = await medicalOrdersModuleService.createMedicalOrders({
            status: "pending",
            customer_id,
            customer_name,
            notes,
            creator_id: actor.id,
            creator_name: actor.name,
            creator_role: actor.role,
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
