import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { cuentasPendientesDe } from "../../../lib/cuentas-de-paciente";
import { MEDICAL_ORDERS_MODULE } from "../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../modules/medical-orders/service";

/**
 * GET /admin/patient-bills?customer_id=
 *
 * Las cuentas pendientes de un paciente: los pedidos en borrador a su nombre
 * con lo que se le aplicó en consulta (ver lib/cuentas-de-paciente.ts), y las
 * órdenes médicas que los alimentaron. Caja abre una y la cobra con el flujo
 * de siempre.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { customer_id } = req.query as Record<string, string>;
        if (!customer_id) {
            return res.status(400).json({ error: "Falta el paciente (customer_id)." });
        }

        const cuentas = await cuentasPendientesDe(req.scope as any, customer_id);

        const ordenes: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const ids = cuentas.map((c) => c.id);
        const relacionadas = ids.length
            ? await ordenes.listMedicalOrders({ draft_order_id: ids } as any, { take: 200 })
            : [];

        res.json({
            bills: cuentas.map((c) => ({
                ...c,
                medical_orders: relacionadas
                    .filter((o: any) => o.draft_order_id === c.id)
                    .map((o: any) => ({ id: o.id, creator_name: o.creator_name, dispensed_by_name: o.dispensed_by_name, dispensed_at: o.dispensed_at })),
            })),
            count: cuentas.length,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
