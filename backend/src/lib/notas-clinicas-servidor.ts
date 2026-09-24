import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { CLINICAL_NOTES_MODULE } from "../modules/clinical-notes"
import { componerContenido, fechaDeAtencion, puedeCorregirNota, revisarNota, revisionDe, type NotaEstructurada, type Revision } from "./notas-clinicas"
import type { RequestActor } from "./require-role"
import { isMedicalOrderCreatorRole } from "./roles"

/**
 * Escribe una nota de atención. La usan la ruta de notas y la emisión de la
 * receta, que guarda la nota de la consulta en el mismo envío.
 */
export async function escribirNota(
  container: MedusaContainer,
  actor: RequestActor | null,
  datos: NotaEstructurada & { customer_id?: string; medical_order_id?: string | null; attended_at?: unknown }
): Promise<{ nota?: any; status?: number; error?: string }> {
  if (!actor) {
    return { status: 401, error: "No se pudo identificar al autor. Una nota de atención no puede ser anónima." }
  }
  if (!isMedicalOrderCreatorRole(actor.role)) {
    return { status: 403, error: `Tu rol (${actor.role ?? "sin rol"}) no escribe notas de atención.` }
  }
  if (!datos.customer_id) {
    return { status: 400, error: "Falta el paciente (customer_id)." }
  }
  const problema = revisarNota(datos)
  if (problema) return { status: 400, error: problema }
  const { fecha, error } = fechaDeAtencion(datos.attended_at)
  if (error) return { status: 400, error }

  // Nombre del paciente, para que la nota se lea sola.
  let customerName: string | null = null
  try {
    const clientes: any = container.resolve(Modules.CUSTOMER)
    const [c] = await clientes.listCustomers({ id: datos.customer_id })
    if (!c) return { status: 404, error: "El paciente no existe." }
    customerName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || null
  } catch {
    // informativo
  }

  const service: any = container.resolve(CLINICAL_NOTES_MODULE)
  const estructurada = datos.findings !== undefined || datos.procedures !== undefined
  const nota = await service.createClinicalNotes({
    customer_id: datos.customer_id,
    customer_name: customerName,
    author_id: actor.id,
    author_name: actor.name,
    author_role: actor.role,
    medical_order_id: datos.medical_order_id ?? null,
    content: componerContenido(datos),
    findings: estructurada ? String(datos.findings ?? "").trim() : null,
    procedures: estructurada ? String(datos.procedures ?? "").trim() : null,
    attended_at: fecha,
  })
  return { nota }
}

/**
 * Corrige una nota: valida igual que al escribir, guarda la versión anterior
 * en `revisions` y anota quién corrigió. Si la nota tenía estructura (qué
 * revisó / qué hizo), la conserva: no se puede dejar sin una de las dos.
 */
export async function corregirNota(
  container: MedusaContainer,
  actor: RequestActor | null,
  id: string,
  datos: NotaEstructurada & { attended_at?: unknown }
): Promise<{ nota?: any; status?: number; error?: string }> {
  if (!actor) {
    return { status: 401, error: "No se pudo identificar quién corrige. Vuelve a iniciar sesión." }
  }
  const service: any = container.resolve(CLINICAL_NOTES_MODULE)
  const [actual] = await service.listClinicalNotes({ id })
  if (!actual) return { status: 404, error: "Nota de atención no encontrada." }
  if (!puedeCorregirNota({ id: actor.id, role: actor.role }, actual)) {
    return { status: 403, error: "Una nota la corrige quien la escribió, o Administración." }
  }

  const estructurada = actual.findings != null || actual.procedures != null
  const nuevos: NotaEstructurada = estructurada
    ? { findings: datos.findings ?? actual.findings, procedures: datos.procedures ?? actual.procedures }
    : { content: datos.content ?? actual.content }
  const problema = revisarNota(nuevos)
  if (problema) return { status: 400, error: problema }
  const { fecha, error } = fechaDeAtencion(datos.attended_at === undefined ? actual.attended_at : datos.attended_at)
  if (error) return { status: 400, error }

  const revisiones: Revision[] = [revisionDe(actual), ...((actual.revisions as Revision[] | null) ?? [])]
  const nota = await service.updateClinicalNotes({
    id,
    content: componerContenido(nuevos),
    findings: estructurada ? String(nuevos.findings ?? "").trim() : null,
    procedures: estructurada ? String(nuevos.procedures ?? "").trim() : null,
    attended_at: fecha,
    revisions: revisiones,
    edited_at: new Date(),
    edited_by_id: actor.id,
    edited_by_name: actor.name,
  })
  return { nota }
}
