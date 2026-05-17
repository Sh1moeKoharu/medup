import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { B2B_AGREEMENTS_MODULE } from "../../../../modules/b2b-agreements";
import B2BAgreementsModuleService from "../../../../modules/b2b-agreements/service";

// GET /admin/b2b-agreements/:id — Get a specific B2B agreement
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const b2bService = req.scope.resolve(B2B_AGREEMENTS_MODULE) as B2BAgreementsModuleService;
        const id = req.params.id;

        const agreement = await b2bService.retrieveB2bAgreement(id);

        if (!agreement) {
            return res.status(404).json({ error: "Convenio no encontrado." });
        }

        res.json({ b2b_agreement: agreement });
    } catch (error: any) {
        console.error("Error retrieving B2B agreement:", error);
        res.status(500).json({ error: error.message });
    }
};

// POST /admin/b2b-agreements/:id — Update a B2B agreement
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const b2bService = req.scope.resolve(B2B_AGREEMENTS_MODULE) as B2BAgreementsModuleService;
        const id = req.params.id;

        const {
            company_name,
            rfc,
            contact_name,
            contact_email,
            contact_phone,
            discount_percent,
            credit_limit,
            payment_terms_days,
            status,
            valid_from,
            valid_until,
            notes,
        } = req.body as any;

        const updateData: any = {};
        if (company_name !== undefined) updateData.company_name = company_name;
        if (rfc !== undefined) updateData.rfc = rfc || null;
        if (contact_name !== undefined) updateData.contact_name = contact_name || null;
        if (contact_email !== undefined) updateData.contact_email = contact_email || null;
        if (contact_phone !== undefined) updateData.contact_phone = contact_phone || null;
        if (discount_percent !== undefined) updateData.discount_percent = discount_percent;
        if (credit_limit !== undefined) updateData.credit_limit = credit_limit;
        if (payment_terms_days !== undefined) updateData.payment_terms_days = payment_terms_days;
        if (status !== undefined) updateData.status = status;
        if (valid_from !== undefined) updateData.valid_from = valid_from ? new Date(valid_from) : null;
        if (valid_until !== undefined) updateData.valid_until = valid_until ? new Date(valid_until) : null;
        if (notes !== undefined) updateData.notes = notes || null;

        const agreement = await b2bService.updateB2bAgreements(id, updateData);

        res.json({ b2b_agreement: agreement });
    } catch (error: any) {
        console.error("Error updating B2B agreement:", error);
        res.status(500).json({ error: error.message });
    }
};

// DELETE /admin/b2b-agreements/:id — Soft delete a B2B agreement
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const b2bService = req.scope.resolve(B2B_AGREEMENTS_MODULE) as B2BAgreementsModuleService;
        const id = req.params.id;

        await b2bService.deleteB2bAgreements(id);

        res.status(200).json({ id, deleted: true });
    } catch (error: any) {
        console.error("Error deleting B2B agreement:", error);
        res.status(500).json({ error: error.message });
    }
};
