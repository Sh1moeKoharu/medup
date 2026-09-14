import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { CLINICAL_NOTES_MODULE } from "../../../modules/clinical-notes";
import ClinicalNotesModuleService from "../../../modules/clinical-notes/service";
import { resolveRequestActor } from "../../../lib/require-role";
import { isMedicalOrderCreatorRole } from "../../../lib/roles";

/**
 * Notas de atención.
 *
 *   GET  /admin/clinical-notes?customer_id=&medical_order_id=&author_id=
 *   POST /admin/clinical-notes  { customer_id, content, medical_order_id? }
 *
 * Quién las lee y quién las escribe está en lib/api-policy.ts: Caja no las
 * lee. El autor se toma de la sesión, nunca del cuerpo.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: ClinicalNotesModuleService = req.scope.resolve(CLINICAL_NOTES_MODULE);
        const { customer_id, medical_order_id, author_id } = req.query as Record<string, string>;
        const filters: any = {};
        if (customer_id) filters.customer_id = customer_id;
        if (medical_order_id) filters.medical_order_id = medical_order_id;
        if (author_id) filters.author_id = author_id;

        const notas = await service.listClinicalNotes(filters, { order: { created_at: "DESC" }, take: 500 });
        res.json({ clinical_notes: notas, count: notas.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const service: ClinicalNotesModuleService = req.scope.resolve(CLINICAL_NOTES_MODULE);
        const { customer_id, content, medical_order_id } = (req.body ?? {}) as any;

        const actor = await resolveRequestActor(req);
        if (!actor) {
            return res.status(401).json({ error: "No se pudo identificar al autor. Una nota de atención no puede ser anónima." });
        }
        if (!isMedicalOrderCreatorRole(actor.role)) {
            return res.status(403).json({ error: `Tu rol (${actor.role ?? "sin rol"}) no escribe notas de atención.` });
        }

        const texto = String(content ?? "").trim();
        if (!customer_id) {
            return res.status(400).json({ error: "Falta el paciente (customer_id)." });
        }
        if (texto.length < 5) {
            return res.status(400).json({ error: "La nota tiene que decir algo (al menos cinco caracteres)." });
        }

        // Nombre del paciente, para que la nota se lea sola.
        let customerName: string | null = null;
        try {
            const clientes: any = req.scope.resolve(Modules.CUSTOMER);
            const [c] = await clientes.listCustomers({ id: customer_id });
            if (!c) {
                return res.status(404).json({ error: "El paciente no existe." });
            }
            customerName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || null;
        } catch {
            // informativo
        }

        const nota = await service.createClinicalNotes({
            customer_id,
            customer_name: customerName,
            author_id: actor.id,
            author_name: actor.name,
            author_role: actor.role,
            medical_order_id: medical_order_id ?? null,
            content: texto,
        });

        res.json({ clinical_note: nota });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
