import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /admin/medical-customers — Pacientes con su expediente.
 *
 * ── SE PAGINA EN EL SERVIDOR ────────────────────────────────────────────────
 * Antes esta ruta traía TODOS los pacientes, con su expediente completo, y
 * filtraba por empresa en memoria. Con una docena de pacientes de prueba no se
 * nota; con el padrón real de una clínica se convierte en una consulta que
 * crece sin techo y en una respuesta que carga historiales que nadie pidió.
 *
 * ── LA LISTA DE EMPRESAS ────────────────────────────────────────────────────
 * El desplegable de empresas necesita el catálogo COMPLETO, no sólo el de la
 * página actual, o al pasar a la página 2 desaparecerían opciones. Se resuelve
 * con una consulta aparte que pide únicamente ese campo, en lugar de derivarlo
 * de traerlo todo.
 *
 * Query: ?company_name=…&limit=50&offset=0
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const query = req.scope.resolve("query")

        const {
            company_name: companyFilter,
            limit = "50",
            offset = "0",
        } = req.query as Record<string, string>

        const take = Math.min(Math.max(Number(limit) || 50, 1), 200)
        const skip = Math.max(Number(offset) || 0, 0)

        const { data: customers, metadata } = await query.graph({
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
            pagination: { take, skip },
        })

        const conEmpresaEfectiva = (customers ?? []).map((c: any) => {
            // Se prefiere la del expediente y se cae a la nativa del cliente:
            // las dos existen y pueden discrepar según por dónde se dio de alta.
            const empresa = c.medical_customer?.company_name || c.company_name || null

            return {
                id: c.id,
                first_name: c.first_name,
                last_name: c.last_name,
                email: c.email,
                phone: c.phone,
                company_name: c.company_name,
                medical_customer: c.medical_customer
                    ? { ...c.medical_customer, company_name: empresa }
                    : empresa
                        ? { company_name: empresa }
                        : null,
            }
        })

        /**
         * El filtro por empresa sigue aplicándose en memoria sobre la página.
         *
         * No es lo ideal, y se documenta en vez de disimularlo: la empresa vive
         * en DOS sitios (el expediente y el campo nativo del cliente) y hay que
         * mirar los dos, cosa que la consulta no sabe hacer en un solo paso.
         * Unificar ese dato en una sola columna es lo que permitiría filtrar en
         * la base, y es trabajo aparte.
         */
        const result = companyFilter
            ? conEmpresaEfectiva.filter((c: any) =>
                  c.medical_customer?.company_name
                      ?.toLowerCase()
                      .includes(String(companyFilter).toLowerCase())
              )
            : conEmpresaEfectiva

        // Catálogo completo de empresas, para el desplegable.
        const { data: todos } = await query.graph({
            entity: "customer",
            fields: ["company_name", "medical_customer.company_name"],
        })

        const companies = [
            ...new Set(
                (todos ?? [])
                    .map((c: any) => c.medical_customer?.company_name || c.company_name)
                    .filter(Boolean)
            ),
        ].sort()

        res.json({
            medical_customers: result,
            companies,
            count: metadata?.count ?? result.length,
            limit: take,
            offset: skip,
        })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
}
