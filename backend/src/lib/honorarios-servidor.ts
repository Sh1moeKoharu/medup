import { MedusaContainer } from "@medusajs/framework/types"
import { HONORARIOS_MODULE } from "../modules/honorarios"
import { MEDICAL_ORDERS_MODULE } from "../modules/medical-orders"
import { cuentaPorId } from "./cuentas-de-paciente"
import { agruparPagos, cobradoPorOrden, type CuentaCobrada, type PagoDeOrden, type PagoPorMedico, type TurnoMedico } from "./honorarios"

/**
 * El reporte de pagos a médicos, con base de datos. La aritmética es la de
 * lib/honorarios.ts; aquí sólo se juntan órdenes surtidas, cuentas cobradas,
 * turnos y porcentajes.
 */
export async function calcularPagos(
  container: MedusaContainer,
  q: { from?: string; to?: string; doctor_id?: string }
): Promise<{ pagos: PagoDeOrden[]; medicos: PagoPorMedico[]; turnos: TurnoMedico[] }> {
  const ordenes: any = container.resolve(MEDICAL_ORDERS_MODULE)
  const honorarios: any = container.resolve(HONORARIOS_MODULE)

  const filters: any = { status: "dispensed" }
  if (q.doctor_id) filters.creator_id = q.doctor_id
  if (q.from || q.to) {
    filters.dispensed_at = {}
    if (q.from) filters.dispensed_at.$gte = new Date(q.from).toISOString()
    if (q.to) filters.dispensed_at.$lte = new Date(q.to).toISOString()
  }

  const surtidas: any[] = await ordenes.listMedicalOrders(filters, { relations: ["items"], take: 5000 })

  // Cada cuenta una sola vez, con sus renglones cobrados.
  const cuentas: Record<string, CuentaCobrada> = {}
  for (const id of new Set(surtidas.filter((o) => o.draft_order_id).map((o) => o.draft_order_id as string))) {
    const c = await cuentaPorId(container, id)
    if (c) cuentas[id] = { id: c.id, status: c.status, items: c.items }
  }

  const [turnos, comisiones] = await Promise.all([
    honorarios.listDoctorShifts(q.doctor_id ? { doctor_id: q.doctor_id } : {}, { take: 5000 }),
    honorarios.listDoctorCommissions({}, { take: 500 }),
  ])
  const porcentajes: Record<string, number> = {}
  for (const c of comisiones) porcentajes[c.doctor_id] = Number(c.percent) || 0

  const pagos = cobradoPorOrden(surtidas, cuentas, turnos)
  return { pagos, medicos: agruparPagos(pagos, porcentajes, turnos), turnos }
}
