import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { HONORARIOS_MODULE } from "../modules/honorarios"
import { MEDICAL_ORDERS_MODULE } from "../modules/medical-orders"
import { cuentaPorId } from "./cuentas-de-paciente"
import { cobradoPorOrden, type CuentaCobrada } from "./honorarios"
import { calcularPagoDePersona, conDiasDelPeriodo, periodosSeTraslapan, type Atribucion, type DesgloseDePago, type EsquemaDePago, type TurnoDeNomina } from "./nomina"
import { numeroDeEmpleado } from "./personal"
import { ROLES, normalizeRole, type Role } from "./roles"

/**
 * La nómina del periodo con base de datos. La aritmética es la de lib/nomina.ts;
 * aquí se decide QUÉ SE LE ATRIBUYE A CADA PERFIL:
 *
 *   Médico      lo cobrado de sus recetas (lib/honorarios.ts, igual que antes)
 *   Enfermería  lo cobrado de las órdenes que aplicó (cuentas ya cobradas)
 *   Caja        lo que cobró en sus turnos de caja, menos devoluciones
 *   Farmacia    lo que surtió, al precio de venta vigente
 *   Almacén, RH, Administración y Auditoría: sin atribución (fijo u hora)
 *
 * Turnos: los de `doctor_shift` (médico, Enfermería, Farmacia, Almacén) y, para
 * Caja, sus turnos de caja. Cuentan los que se abrieron dentro del periodo.
 */

export type FilaDeNomina = {
  user_id: string
  nombre: string
  rol: Role | null
  numero_empleado: string | null
  esquema: (EsquemaDePago & { id?: string }) | null
  desglose: DesgloseDePago
  pagos: { id: string; amount: number; paid_at: string; period_from: string; period_to: string; dia_desde: string; dia_hasta: string; reference: string | null }[]
}

const rango = (campo: string, desde: string, hasta: string) => ({ [campo]: { $gte: desde, $lte: hasta } })

async function cuentasCobradas(container: MedusaContainer, ordenes: any[]): Promise<Record<string, CuentaCobrada>> {
  const cuentas: Record<string, CuentaCobrada> = {}
  for (const id of new Set(ordenes.filter((o) => o.draft_order_id).map((o) => o.draft_order_id as string))) {
    const c = await cuentaPorId(container, id)
    if (c) cuentas[id] = { id: c.id, status: c.status, items: c.items }
  }
  return cuentas
}

export async function esquemasDePago(container: MedusaContainer): Promise<Map<string, EsquemaDePago & { id: string }>> {
  const honorarios: any = container.resolve(HONORARIOS_MODULE)
  const [esquemas, reglas] = await Promise.all([
    honorarios.listStaffCompensations({}, { take: 1000 }),
    honorarios.listStaffCommissionRules({}, { take: 5000, order: { created_at: "ASC" } }),
  ])
  const mapa = new Map<string, EsquemaDePago & { id: string }>()
  for (const e of esquemas) {
    mapa.set(e.user_id, {
      id: e.id,
      fixed_per_shift: Number(e.fixed_per_shift) || 0,
      hourly_rate: Number(e.hourly_rate) || 0,
      default_percent: Number(e.default_percent) || 0,
      reglas: reglas.filter((r: any) => r.user_id === e.user_id),
    })
  }
  return mapa
}

export async function calcularNomina(
  container: MedusaContainer,
  q: { desde: string; hasta: string; user_id?: string; ahora?: Date }
): Promise<FilaDeNomina[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const honorarios: any = container.resolve(HONORARIOS_MODULE)
  const ordenesSvc: any = container.resolve(MEDICAL_ORDERS_MODULE)
  const usuarios: any[] = await (container.resolve(Modules.USER) as any).listUsers(q.user_id ? { id: q.user_id } : {}, { take: 1000 })

  const [esquemas, turnosPersonal, sesionesCaja, surtidas, pagos] = await Promise.all([
    esquemasDePago(container),
    honorarios.listDoctorShifts(rango("opened_at", q.desde, q.hasta), { take: 5000 }),
    query.graph({ entity: "cash_session", fields: ["id", "cashier_id", "opened_at", "closed_at"], filters: rango("opened_at", q.desde, q.hasta), pagination: { take: 5000 } }),
    ordenesSvc.listMedicalOrders({ status: "dispensed", ...rango("dispensed_at", q.desde, q.hasta) }, { relations: ["items"], take: 5000 }),
    honorarios.listStaffPayments({}, { take: 5000, order: { paid_at: "DESC" } }),
  ])

  const turnos = new Map<string, TurnoDeNomina[]>()
  const sumarTurno = (id: string, t: TurnoDeNomina) => turnos.set(id, [...(turnos.get(id) ?? []), t])
  for (const t of turnosPersonal) sumarTurno(t.doctor_id, { inicio: t.opened_at, fin: t.closed_at })
  const sesiones: any[] = sesionesCaja.data ?? []
  for (const s of sesiones) sumarTurno(s.cashier_id, { inicio: s.opened_at, fin: s.closed_at })

  // Una bolsa por perfil: una enfermera que también emitió una orden no cobra
  // comisión como prescriptora, sólo por lo que aplicó.
  const bolsas: Record<string, Map<string, Atribucion[]>> = {
    [ROLES.DOCTOR]: new Map(),
    [ROLES.NURSE]: new Map(),
    [ROLES.PHARMACY]: new Map(),
    [ROLES.CASHIER]: new Map(),
  }
  const atribuir = (rol: Role, id: string | null | undefined, a: Atribucion) => {
    if (!id || !a.monto) return
    const bolsa = bolsas[rol]
    bolsa.set(id, [...(bolsa.get(id) ?? []), a])
  }

  // Médico y Enfermería: lo cobrado de las órdenes aplicadas en consulta.
  const deConsulta = surtidas.filter((o: any) => o.recipient_area === "nursing")
  const cuentas = await cuentasCobradas(container, deConsulta)
  for (const p of cobradoPorOrden(deConsulta, cuentas, [])) atribuir(ROLES.DOCTOR, p.doctor_id, { fecha: p.fecha, monto: p.cobrado, referencia: p.medical_order_id })
  const porQuienAplico = deConsulta.map((o: any) => ({ ...o, creator_id: o.dispensed_by_id, creator_name: o.dispensed_by_name }))
  for (const p of cobradoPorOrden(porQuienAplico, cuentas, [])) atribuir(ROLES.NURSE, p.doctor_id, { fecha: p.fecha, monto: p.cobrado, referencia: p.medical_order_id })

  // Farmacia: lo surtido en mostrador, al precio de venta vigente.
  const deMostrador = surtidas.filter((o: any) => o.recipient_area === "pharmacy")
  const variantes = [...new Set<string>(deMostrador.flatMap((o: any) => (o.items ?? []).map((i: any) => i.variant_id as string)))]
  const precios = new Map<string, number>()
  if (variantes.length) {
    const { data } = await query.graph({ entity: "product_variant", fields: ["id", "prices.amount", "prices.currency_code"], filters: { id: variantes } })
    for (const v of (data ?? []) as any[]) precios.set(v.id, Number((v.prices ?? []).find((p: any) => p.currency_code === "mxn")?.amount) || 0)
  }
  for (const o of deMostrador) {
    const monto = (o.items ?? []).reduce((s: number, i: any) => s + (Number(i.quantity) || 0) * (precios.get(i.variant_id) ?? 0), 0)
    atribuir(ROLES.PHARMACY, o.dispensed_by_id, { fecha: o.dispensed_at, monto: Math.round(monto * 100) / 100, referencia: o.id })
  }

  // Caja: lo cobrado en sus turnos, menos devoluciones, por la hora del movimiento.
  const { data: movimientos } = await query.graph({
    entity: "cash_movement",
    fields: ["session_id", "type", "amount", "created_at"],
    filters: { type: ["sale", "refund"], ...rango("created_at", q.desde, q.hasta) },
    pagination: { take: 100000 },
  })
  const idsSesion = [...new Set((movimientos ?? []).map((m: any) => m.session_id))]
  const cajeroDe = new Map<string, string>()
  if (idsSesion.length) {
    const { data } = await query.graph({ entity: "cash_session", fields: ["id", "cashier_id"], filters: { id: idsSesion } })
    for (const s of data ?? []) cajeroDe.set(s.id, s.cashier_id)
  }
  for (const m of movimientos ?? []) {
    const signo = m.type === "refund" ? -1 : 1
    atribuir(ROLES.CASHIER, cajeroDe.get(m.session_id), { fecha: m.created_at, monto: signo * (Number(m.amount) || 0) })
  }

  const filas: FilaDeNomina[] = []
  for (const u of usuarios) {
    const rol = normalizeRole(u.metadata?.role)
    const esquema = esquemas.get(u.id) ?? null
    const suyos = turnos.get(u.id) ?? []
    // Sólo cuenta la bolsa de su perfil (ver arriba).
    const suyas = (rol && bolsas[rol]?.get(u.id)) || []
    if (!esquema && !suyos.length && !suyas.length) continue

    filas.push({
      user_id: u.id,
      nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
      rol,
      numero_empleado: numeroDeEmpleado(u),
      esquema,
      desglose: calcularPagoDePersona({ esquema, turnos: suyos, atribuciones: suyas, ahora: q.ahora }),
      pagos: pagos
        .filter((p: any) => p.user_id === u.id && periodosSeTraslapan({ desde: p.period_from, hasta: p.period_to }, q))
        .map((p: any) => conDiasDelPeriodo({ id: p.id, amount: Number(p.amount), paid_at: p.paid_at, period_from: p.period_from, period_to: p.period_to, reference: p.reference ?? null })),
    })
  }
  return filas.sort((a, b) => b.desglose.total - a.desglose.total || a.nombre.localeCompare(b.nombre, "es"))
}
