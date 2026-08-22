import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { assertNotProduction } from "../lib/test-users"

/**
 * Siembra pacientes de prueba con su expediente médico.
 *
 *   npm run seed:patients
 *   npx medusa exec ./src/scripts/seed-customers.ts
 *
 * Es IDEMPOTENTE: se puede correr las veces que haga falta. Si el paciente ya
 * existe (por correo) se respeta y sólo se completa lo que falte.
 *
 * Qué crea y por qué:
 *
 *  · El CLIENTE de Medusa (`customer`) — nombre, correo, teléfono.
 *  · Su EXPEDIENTE (`medical_customer`) y el VÍNCULO entre ambos. La versión
 *    anterior de este script sólo creaba el cliente, así que los pacientes
 *    aparecían sin expediente y el widget médico no tenía nada que mostrar.
 *  · Tres CONVENIOS empresariales que corresponden a las empresas de los
 *    pacientes B2B. Sin ellos, esos pacientes apuntarían a empresas que no
 *    existen y la pantalla de convenios saldría vacía.
 *
 * Los datos son FICTICIOS. Se usa el dominio `.test`, reservado por RFC 2606,
 * de modo que ningún correo pueda salir a un buzón real.
 *
 * `medical_history` se deja vacío a propósito: el campo existe en el modelo,
 * pero ninguna ruta de la API lo escribe todavía, así que sembrarlo daría la
 * impresión de una funcionalidad que no está construida.
 */

type PatientSpec = {
  first_name: string
  last_name: string
  email: string
  phone: string
  customer_type: "b2c" | "b2b"
  company_name?: string
  employee_number?: string
  insurance_policy?: string
}

/** Convenios que respaldan a los pacientes B2B de abajo. */
const TEST_AGREEMENTS = [
  {
    company_name: "Constructora del Norte SA de CV",
    rfc: "CNO250101AB1",
    contact_name: "Contacto Pruebas",
    contact_email: "contacto@constructora.test",
    discount_percent: 12,
    credit_limit: 50000,
    payment_terms_days: 30,
  },
  {
    company_name: "Transportes Peninsulares SA",
    rfc: "TPE250101CD2",
    contact_name: "Contacto Pruebas",
    contact_email: "contacto@transportes.test",
    discount_percent: 8,
    credit_limit: 25000,
    payment_terms_days: 45,
  },
  {
    company_name: "Maquiladora Frontera SA de CV",
    rfc: "MFR250101EF3",
    contact_name: "Contacto Pruebas",
    contact_email: "contacto@maquiladora.test",
    discount_percent: 15,
    credit_limit: 80000,
    payment_terms_days: 60,
  },
]

/**
 * Nombres ficticios. Se eligieron combinaciones comunes que no corresponden a
 * personas públicas: son datos de prueba, no personas.
 */
const TEST_PATIENTS: PatientSpec[] = [
  // ── Particulares ────────────────────────────────────────────────────────
  { first_name: "María", last_name: "Ramírez Solís", email: "maria.ramirez@paciente.test", phone: "+52 664 100 0001", customer_type: "b2c" },
  { first_name: "Jorge", last_name: "Villanueva Cruz", email: "jorge.villanueva@paciente.test", phone: "+52 664 100 0002", customer_type: "b2c" },
  { first_name: "Alejandra", last_name: "Fuentes Ibarra", email: "alejandra.fuentes@paciente.test", phone: "+52 664 100 0003", customer_type: "b2c", insurance_policy: "GNP-4471902" },
  { first_name: "Ricardo", last_name: "Mendoza Aguilar", email: "ricardo.mendoza@paciente.test", phone: "+52 664 100 0004", customer_type: "b2c" },
  { first_name: "Patricia", last_name: "Ochoa Lira", email: "patricia.ochoa@paciente.test", phone: "+52 664 100 0005", customer_type: "b2c", insurance_policy: "AXA-8830145" },
  { first_name: "Fernando", last_name: "Cárdenas Ruiz", email: "fernando.cardenas@paciente.test", phone: "+52 664 100 0006", customer_type: "b2c" },
  { first_name: "Gabriela", last_name: "Zamora Peña", email: "gabriela.zamora@paciente.test", phone: "+52 664 100 0007", customer_type: "b2c" },
  { first_name: "Héctor", last_name: "Barrera Nieto", email: "hector.barrera@paciente.test", phone: "+52 664 100 0008", customer_type: "b2c" },

  // ── Empresariales (convenio) ────────────────────────────────────────────
  { first_name: "Sandra", last_name: "Estrada Rojas", email: "sandra.estrada@paciente.test", phone: "+52 664 100 0009", customer_type: "b2b", company_name: "Constructora del Norte SA de CV", employee_number: "CN-0142" },
  { first_name: "Miguel", last_name: "Arroyo Duarte", email: "miguel.arroyo@paciente.test", phone: "+52 664 100 0010", customer_type: "b2b", company_name: "Constructora del Norte SA de CV", employee_number: "CN-0187" },
  { first_name: "Lucía", last_name: "Navarro Téllez", email: "lucia.navarro@paciente.test", phone: "+52 664 100 0011", customer_type: "b2b", company_name: "Transportes Peninsulares SA", employee_number: "TP-2210" },
  { first_name: "Omar", last_name: "Guzmán Vega", email: "omar.guzman@paciente.test", phone: "+52 664 100 0012", customer_type: "b2b", company_name: "Maquiladora Frontera SA de CV", employee_number: "MF-0755" },
]

export default async function seedCustomers({ container }: ExecArgs) {
  assertNotProduction("seed-customers")

  const customerModuleService: any = container.resolve(Modules.CUSTOMER)
  const medicalCustomerService: any = container.resolve("medical_customer")
  const b2bService: any = container.resolve("b2b_agreements")
  const remoteLink: any = container.resolve("remoteLink")
  const query: any = container.resolve("query")

  console.log("")
  console.log("=== PACIENTES DE PRUEBA ===")
  console.log("")

  // ── Convenios ─────────────────────────────────────────────────────────────
  let agreementsCreated = 0
  const existingAgreements = await b2bService.listBusinessAgreements({})
  const agreementNames = new Set(
    existingAgreements.map((a: any) => a.company_name)
  )

  for (const spec of TEST_AGREEMENTS) {
    if (agreementNames.has(spec.company_name)) {
      continue
    }
    await b2bService.createBusinessAgreements({ ...spec, status: "active" })
    agreementsCreated++
    console.log(`   + convenio  ${spec.company_name} (${spec.discount_percent}% desc.)`)
  }

  // ── Pacientes ─────────────────────────────────────────────────────────────
  let created = 0
  let completed = 0
  let untouched = 0

  for (const spec of TEST_PATIENTS) {
    const [existing] = await customerModuleService.listCustomers({ email: spec.email })

    let customer = existing

    if (!customer) {
      const result = await customerModuleService.createCustomers([
        {
          first_name: spec.first_name,
          last_name: spec.last_name,
          email: spec.email,
          phone: spec.phone,
          company_name: spec.company_name ?? undefined,
          metadata: { origen: "seed-pacientes-prueba" },
        },
      ])
      customer = Array.isArray(result) ? result[0] : result
      created++
      console.log(`   + ${spec.email.padEnd(36)} ${spec.first_name} ${spec.last_name}`)
    }

    // ¿Ya tiene expediente vinculado?
    const { data: withMedical } = await query.graph({
      entity: "customer",
      fields: ["id", "medical_customer.*"],
      filters: { id: customer.id },
    })

    if ((withMedical?.[0] as any)?.medical_customer) {
      if (existing) {
        untouched++
      }
      continue
    }

    const medicalCustomer = await medicalCustomerService.createMedicalCustomers({
      customer_type: spec.customer_type,
      employee_number: spec.employee_number ?? null,
      company_name: spec.company_name ?? null,
      insurance_policy: spec.insurance_policy ?? null,
      medical_history: null,
    })

    await remoteLink.create({
      [Modules.CUSTOMER]: { customer_id: customer.id },
      medical_customer: { medical_customer_id: medicalCustomer.id },
    })

    completed++
    if (existing) {
      console.log(`   ~ ${spec.email.padEnd(36)} expediente creado y vinculado`)
    }
  }

  console.log("")
  console.log("=== RESUMEN ===")
  console.log(`   Convenios creados        : ${agreementsCreated}`)
  console.log(`   Pacientes creados        : ${created}`)
  console.log(`   Expedientes vinculados   : ${completed}`)
  console.log(`   Sin cambios              : ${untouched}`)
  console.log("")
  console.log(`   ${TEST_PATIENTS.filter((p) => p.customer_type === "b2c").length} particulares · ` +
    `${TEST_PATIENTS.filter((p) => p.customer_type === "b2b").length} con convenio empresarial`)
  console.log("")
  console.log("Datos ficticios en el dominio .test (RFC 2606): ningún correo sale a un buzón real.")
}
