import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { normalizarAseguranzasDePaciente } from "../../../../lib/aseguranzas";

/**
 * Las aseguranzas de un paciente, desde el punto de venta.
 *
 *   GET  /admin/patient-insurances/:customerId   → { insurances: [{ insurance_id, policy_number }] }
 *   POST /admin/patient-insurances/:customerId   { insurances: [...] }
 *
 * ── POR QUÉ UNA RUTA APARTE ─────────────────────────────────────────────────
 * Viven en el expediente (`medical_customer`), pero /admin/medical-customers
 * es contenido clínico y Caja no escribe ahí. Marcar la aseguranza del
 * paciente sí es trabajo de recepción («debe ser un campo para dar de alta
 * las aseguranzas»), así que esta ruta toca ÚNICAMENTE esa lista: nada del
 * historial. Quién puede está en lib/api-policy.ts.
 */
async function expedienteDe(req: MedusaRequest, customerId: string) {
    const query = req.scope.resolve("query") as any;
    const { data } = await query.graph({ entity: "customer", fields: ["id", "medical_customer.*"], filters: { id: customerId } });
    return (data ?? [])[0] ?? null;
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const cliente = await expedienteDe(req, req.params.id);
        if (!cliente) return res.status(404).json({ error: "Paciente no encontrado." });
        const { lista } = normalizarAseguranzasDePaciente(cliente.medical_customer?.insurances);
        res.json({ insurances: lista });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const { lista, error } = normalizarAseguranzasDePaciente((req.body as any)?.insurances);
        if (error) return res.status(400).json({ error });

        const cliente = await expedienteDe(req, req.params.id);
        if (!cliente) return res.status(404).json({ error: "Paciente no encontrado." });

        const expedientes = req.scope.resolve("medical_customer") as any;
        let expediente = cliente.medical_customer;
        if (expediente) {
            expediente = await expedientes.updateMedicalCustomers(expediente.id, { insurances: lista });
        } else {
            expediente = await expedientes.createMedicalCustomers({ customer_type: "b2c", insurances: lista });
            const remoteLink = req.scope.resolve("remoteLink") as any;
            await remoteLink.create({
                [Modules.CUSTOMER]: { customer_id: cliente.id },
                medical_customer: { medical_customer_id: expediente.id },
            });
        }
        res.json({ insurances: lista, medical_customer: expediente });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
