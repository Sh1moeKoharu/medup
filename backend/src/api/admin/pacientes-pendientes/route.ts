import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MEDICAL_ORDERS_MODULE } from "../../../modules/medical-orders";

/**
 * GET /admin/pacientes-pendientes?recipient_area=nursing — los pacientes que
 * tienen órdenes o recetas pendientes, con cuántas y desde cuándo.
 *
 * La lista de pacientes del médico y de Enfermería los pone primero: es a
 * quien hay que atender (punto 16). Sin `recipient_area`, todas las pendientes.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const service: any = req.scope.resolve(MEDICAL_ORDERS_MODULE);
        const area = String((req.query as any).recipient_area ?? "");
        const filtros: Record<string, unknown> = { status: "pending" };
        if (area === "nursing" || area === "pharmacy") filtros.recipient_area = area;

        const ordenes: any[] = await service.listMedicalOrders(filtros, { take: 1000, order: { created_at: "ASC" } });
        const porPaciente = new Map<string, { customer_id: string; customer_name: string | null; pendientes: number; desde: string }>();
        for (const o of ordenes) {
            const fila = porPaciente.get(o.customer_id) ?? { customer_id: o.customer_id, customer_name: o.customer_name ?? null, pendientes: 0, desde: o.created_at };
            fila.pendientes++;
            porPaciente.set(o.customer_id, fila);
        }
        // Quien lleva más tiempo esperando, primero.
        const pacientes = [...porPaciente.values()].sort((a, b) => (a.desde < b.desde ? -1 : 1));
        res.json({ pacientes });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
}
