import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// GET /admin/medical-customers/:id — get medical data for a specific customer
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const customerId = req.params.id
        const query = req.scope.resolve("query")

        const { data: customers } = await query.graph({
            entity: "customer",
            fields: [
                "id",
                "first_name",
                "last_name",
                "email",
                "company_name",
                "medical_customer.*",
            ],
            filters: { id: customerId },
        })

        if (!customers.length) {
            return res.status(404).json({ error: "Customer not found" })
        }

        const customer = customers[0] as any
        const mc = customer.medical_customer

        // If medical_customer exists but has no company_name, provide the native one as fallback
        const medicalCustomer = mc
            ? { ...mc, company_name: mc.company_name || customer.company_name || null }
            : null

        res.json({
            customer,
            medical_customer: medicalCustomer,
        })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
}

// POST /admin/medical-customers/:id — create or update medical data for a customer
export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const customerId = req.params.id
        const { employee_number, company_name, customer_type, insurance_policy } = req.body as any
        const query = req.scope.resolve("query")
        const medicalCustomerService = req.scope.resolve("medical_customer") as any
        const remoteLink = req.scope.resolve("remoteLink") as any

        // Check if the customer already has medical data linked
        const { data: customers } = await query.graph({
            entity: "customer",
            fields: ["id", "company_name", "medical_customer.*"],
            filters: { id: customerId },
        })

        if (!customers.length) {
            return res.status(404).json({ error: "Customer not found" })
        }

        const existing = (customers[0] as any).medical_customer

        let medicalCustomer: any

        if (existing) {
            // Update existing medical customer
            medicalCustomer = await medicalCustomerService.updateMedicalCustomers(existing.id, {
                ...(employee_number !== undefined && { employee_number }),
                ...(company_name !== undefined && { company_name }),
                ...(customer_type !== undefined && { customer_type }),
                ...(insurance_policy !== undefined && { insurance_policy }),
            })
        } else {
            // Create new medical customer and link it
            medicalCustomer = await medicalCustomerService.createMedicalCustomers({
                employee_number: employee_number || null,
                company_name: company_name || null,
                customer_type: customer_type || "b2c",
                insurance_policy: insurance_policy || null,
            })

            await remoteLink.create({
                [Modules.CUSTOMER]: { customer_id: customerId },
                "medical_customer": { medical_customer_id: medicalCustomer.id },
            })
        }

        // Also sync company_name to the native Medusa customer field
        if (company_name !== undefined) {
            try {
                const customerModuleService = req.scope.resolve(Modules.CUSTOMER) as any
                await customerModuleService.updateCustomers(customerId, {
                    company_name: company_name || "",
                })
            } catch (syncErr) {
                console.warn("Could not sync company_name to native customer:", syncErr)
            }
        }

        return res.json({ medical_customer: medicalCustomer })
    } catch (error: any) {
        console.error("Error creating/updating medical customer:", error)
        res.status(500).json({ error: error.message })
    }
}
