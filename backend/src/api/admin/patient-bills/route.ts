import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { cuentasPendientesDe, cuentasPendientesTodas, CuentaPendiente } from "../../../lib/cuentas-de-paciente";
import { MEDICAL_ORDERS_MODULE } from "../../../modules/medical-orders";
import MedicalOrdersModuleService from "../../../modules/medical-orders/service";

/**
 * GET /admin/patient-bills?customer_id=   → las cuentas pendientes de UN paciente
 * GET /admin/patient-bills                → TODAS, más quién espera a Enfermería
 *
 * Una cuenta pendiente es un pedido en borrador a nombre del paciente con lo
 * que se le aplicó en consulta (ver lib/cuentas-de-paciente.ts), y las
 * órdenes médicas que lo alimentaron. Caja abre una y la cobra con el flujo
 * de siempre.
 *
 * ── SIN customer_id: LA LISTA «POR COBRAR» ──────────────────────────────────
 * Alimenta la pantalla de Caja. Además de las cuentas ya cobrables devuelve
 * `esperando`: los pacientes con órdenes que el médico dirigió a Enfermería y
 * que Enfermería todavía no aplica. Caja los ve en gris, con la razón, para
 * que no vaya a buscar una cuenta que aún no existe ni la arme a mano desde
 * el mostrador —lo que descontaría dos veces el medicamento—.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { customer_id } = req.query as Record<string, string>;
        const ordenes: MedicalOrdersModuleService = req.scope.resolve(MEDICAL_ORDERS_MODULE);

        const cuentas: CuentaPendiente[] = customer_id
            ? await cuentasPendientesDe(req.scope as any, customer_id)
            : await cuentasPendientesTodas(req.scope as any);

        const ids = cuentas.map((c) => c.id);
        const relacionadas: any[] = ids.length
            ? await ordenes.listMedicalOrders({ draft_order_id: ids } as any, { take: 200 })
            : [];

        const bills = cuentas.map((c) => ({
            ...c,
            medical_orders: relacionadas
                .filter((o: any) => o.draft_order_id === c.id)
                .map((o: any) => ({ id: o.id, creator_name: o.creator_name, dispensed_by_name: o.dispensed_by_name, dispensed_at: o.dispensed_at })),
        }));

        if (customer_id) {
            return res.json({ bills, count: bills.length });
        }

        // Quién está en consulta y todavía no tiene cuenta: pendientes de
        // Enfermería, agrupadas por paciente, quien lleva más tiempo primero.
        const pendientes: any[] = await ordenes.listMedicalOrders(
            { status: "pending", recipient_area: "nursing" } as any,
            { take: 1000, order: { created_at: "ASC" } },
        );
        const porPaciente = new Map<string, { customer_id: string; customer_name: string | null; pendientes: number; desde: string }>();
        for (const o of pendientes) {
            const fila = porPaciente.get(o.customer_id) ?? { customer_id: o.customer_id, customer_name: o.customer_name ?? null, pendientes: 0, desde: o.created_at };
            fila.pendientes++;
            porPaciente.set(o.customer_id, fila);
        }

        res.json({ bills, count: bills.length, esperando: [...porPaciente.values()] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
