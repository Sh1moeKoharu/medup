import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { B2B_AGREEMENTS_MODULE } from "../../../modules/b2b-agreements";
import B2BAgreementsModuleService from "../../../modules/b2b-agreements/service";

// GET /admin/b2b-agreements — List all B2B agreements
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const b2bService = req.scope.resolve(B2B_AGREEMENTS_MODULE) as B2BAgreementsModuleService;
        const searchTerm = (req.query as any).q;
        const statusFilter = (req.query as any).status;

        let agreements = await b2bService.listB2bAgreements(
            {},
            { order: { company_name: "ASC" } }
        );

        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            agreements = agreements.filter((a: any) =>
                a.company_name?.toLowerCase().includes(term) ||
                a.rfc?.toLowerCase().includes(term) ||
                a.contact_name?.toLowerCase().includes(term)
            );
        }

        // Filter by status
        if (statusFilter && (statusFilter === "active" || statusFilter === "inactive")) {
            agreements = agreements.filter((a: any) => a.status === statusFilter);
        }

        res.json({ b2b_agreements: agreements });
    } catch (error: any) {
        console.error("Error listing B2B agreements:", error);
        res.status(500).json({ error: error.message });
    }
};

// POST /admin/b2b-agreements — Create a new B2B agreement
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    try {
        const b2bService = req.scope.resolve(B2B_AGREEMENTS_MODULE) as B2BAgreementsModuleService;

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

        if (!company_name) {
            return res.status(400).json({ error: "El nombre de la empresa es obligatorio." });
        }

        const agreement = await b2bService.createB2bAgreements({
            company_name,
            rfc: rfc || null,
            contact_name: contact_name || null,
            contact_email: contact_email || null,
            contact_phone: contact_phone || null,
            discount_percent: discount_percent ?? 0,
            credit_limit: credit_limit ?? 0,
            payment_terms_days: payment_terms_days ?? 30,
            status: status || "active",
            valid_from: valid_from ? new Date(valid_from) : null,
            valid_until: valid_until ? new Date(valid_until) : null,
            notes: notes || null,
        });

        res.status(201).json({ b2b_agreement: agreement });
    } catch (error: any) {
        console.error("Error creating B2B agreement:", error);
        res.status(500).json({ error: error.message });
    }
};
