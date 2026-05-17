import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve("query")
        const companyFilter = (req.query as any).company_name

        const { data: customers } = await query.graph({
            entity: "customer",
            fields: [
                "id",
                "first_name",
                "last_name",
                "email",
                "phone",
                "company_name",
                "medical_customer.*",
            ],
        })

        // Map them clearly by Customer ID, using medical_customer.company_name
        // with fallback to the native customer.company_name for sync
        let result = customers.map((c: any) => {
            const medCompany = c.medical_customer?.company_name
            const nativeCompany = c.company_name
            // Prefer medical_customer.company_name, fall back to native
            const effectiveCompany = medCompany || nativeCompany || null

            return {
                id: c.id,
                first_name: c.first_name,
                last_name: c.last_name,
                email: c.email,
                phone: c.phone,
                company_name: nativeCompany,
                medical_customer: c.medical_customer
                    ? { ...c.medical_customer, company_name: effectiveCompany }
                    : nativeCompany
                        ? { company_name: effectiveCompany }
                        : null,
            }
        })

        // Filter by company name if provided
        if (companyFilter) {
            result = result.filter((c: any) =>
                c.medical_customer?.company_name?.toLowerCase().includes(companyFilter.toLowerCase())
            )
        }

        // Extract unique company names for the filter dropdown
        // Consider both medical_customer.company_name and native company_name
        const companies = [...new Set(
            customers
                .map((c: any) => c.medical_customer?.company_name || c.company_name)
                .filter(Boolean)
        )]

        res.json({ medical_customers: result, companies })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
}
