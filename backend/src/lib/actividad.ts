import { clasificarAccion, type CategoriaDeAccion } from "./acciones"
import { ZONA_CLINICA } from "./zona-horaria"

/**
 * Actividad de cada persona, por día. Función pura.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * La bitácora dice qué pasó; este reporte responde lo que pregunta la nómina:
 * ¿quién trabajó qué día, cuánto tiempo estuvo en turno y qué hizo? Por eso
 * junta dos fuentes:
 *
 *   · los TURNOS (de caja y de consulta), que dan las horas y lo cobrado;
 *   · la BITÁCORA, que da la primera y la última acción del día y cuántas de
 *     cada tipo hizo.
 *
 * La primera y la última acción no son una checada de entrada y salida: son
 * lo que el sistema vio. Quien trabaja sin tocar el sistema no aparece, y así
 * lo dice el reporte impreso.
 *
 * ── EL DÍA ──────────────────────────────────────────────────────────────────
 * Se cuenta en hora de la clínica (lib/zona-horaria.ts), no en UTC: una venta
 * a las 19:00 del lunes es del lunes, aunque en UTC ya sea martes.
 */

export { ZONA_CLINICA }

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CLINICA, year: "numeric", month: "2-digit", day: "2-digit" })

/** "2026-09-14" en hora de la clínica. */
export function diaLocal(fecha: string | Date): string {
  return formatoDia.format(new Date(fecha))
}

export type AsientoDeActividad = {
  user_id?: string | null
  user_email?: string | null
  user_role?: string | null
  user_employee_number?: string | null
  method: string
  endpoint: string
  created_at: string | Date
}

export type TurnoDeActividad = {
  user_id: string
  tipo: "caja" | "consulta"
  inicio: string | Date
  fin?: string | Date | null
  /** Lo cobrado en el turno (sólo caja). */
  cobrado?: number
}

export type PersonaDeActividad = {
  id: string
  nombre: string
  usuario?: string | null
  /** Identificador de acceso ("caja@sigh.local"): los accesos llegan sólo con él. */
  correo?: string | null
  rol?: string | null
  numero_empleado?: string | null
}

/** Columnas de conteo, en el orden en que salen en el reporte. */
export const CONTEOS: { clave: CategoriaDeAccion; etiqueta: string }[] = [
  { clave: "venta", etiqueta: "Ventas cobradas" },
  { clave: "movimiento_caja", etiqueta: "Movimientos de caja" },
  { clave: "receta_emitida", etiqueta: "Recetas" },
  { clave: "nota", etiqueta: "Notas" },
  { clave: "orden_aplicada", etiqueta: "Órdenes aplicadas" },
  { clave: "orden_ajustada", etiqueta: "Órdenes ajustadas" },
  { clave: "receta_surtida", etiqueta: "Recetas surtidas" },
  { clave: "requisicion", etiqueta: "Requisiciones" },
  { clave: "lote", etiqueta: "Movimientos de almacén" },
  { clave: "baja", etiqueta: "Bajas" },
  { clave: "paciente", etiqueta: "Pacientes" },
]

export type FilaDeActividad = {
  dia: string
  user_id: string
  nombre: string
  usuario: string
  rol: string
  numero_empleado: string
  primera_accion: string | null
  ultima_accion: string | null
  turnos: number
  horas_en_turno: number
  cobrado: number
  acciones: number
  consultas: number
  conteos: Record<string, number>
}

const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

function nuevaFila(dia: string, id: string, persona: PersonaDeActividad | undefined, asiento?: AsientoDeActividad): FilaDeActividad {
  return {
    dia,
    user_id: id,
    nombre: persona?.nombre || asiento?.user_email || id,
    usuario: (persona?.usuario || asiento?.user_email || "").replace(/@sigh\.local$/, ""),
    rol: persona?.rol || asiento?.user_role || "",
    numero_empleado: persona?.numero_empleado || asiento?.user_employee_number || "",
    primera_accion: null,
    ultima_accion: null,
    turnos: 0,
    horas_en_turno: 0,
    cobrado: 0,
    acciones: 0,
    consultas: 0,
    conteos: Object.fromEntries(CONTEOS.map((c) => [c.clave, 0])),
  }
}

export function resumirActividad(entrada: {
  asientos: AsientoDeActividad[]
  turnos: TurnoDeActividad[]
  personas: PersonaDeActividad[]
  ahora?: Date
}): FilaDeActividad[] {
  const ahora = entrada.ahora ?? new Date()
  const personas = new Map(entrada.personas.map((p) => [p.id, p]))
  const porCorreo = new Map(entrada.personas.filter((p) => p.correo).map((p) => [String(p.correo).toLowerCase(), p.id]))
  const filas = new Map<string, FilaDeActividad>()

  const fila = (dia: string, id: string, asiento?: AsientoDeActividad) => {
    const clave = `${dia}|${id}`
    let f = filas.get(clave)
    if (!f) {
      f = nuevaFila(dia, id, personas.get(id), asiento)
      filas.set(clave, f)
    }
    return f
  }

  for (const a of entrada.asientos) {
    // El inicio de sesión se asienta antes de que exista la sesión, así que
    // llega con el correo y sin id: se atribuye por el correo, sólo si es de
    // alguien del personal. Un correo que no es de nadie (un intento de acceso
    // con una cuenta que no existe) no es actividad de ninguna persona.
    const correo = String(a.user_email ?? "").toLowerCase()
    const id = a.user_id || porCorreo.get(correo)
    if (!id) continue
    const cuando = new Date(a.created_at)
    if (Number.isNaN(cuando.getTime())) continue

    const f = fila(diaLocal(cuando), id, a)
    const iso = cuando.toISOString()
    if (!f.primera_accion || iso < f.primera_accion) f.primera_accion = iso
    if (!f.ultima_accion || iso > f.ultima_accion) f.ultima_accion = iso

    const { categoria } = clasificarAccion(a.method, a.endpoint)
    if (categoria === "consulta") f.consultas++
    else if (categoria !== "acceso") f.acciones++
    if (categoria in f.conteos) f.conteos[categoria]++
  }

  // El turno cuenta el día en que se abrió. Uno abierto cuenta hasta ahora.
  for (const t of entrada.turnos) {
    const inicio = new Date(t.inicio)
    if (Number.isNaN(inicio.getTime())) continue
    const fin = t.fin ? new Date(t.fin) : ahora
    const f = fila(diaLocal(inicio), t.user_id)
    f.turnos++
    f.horas_en_turno = redondear(f.horas_en_turno + Math.max(0, fin.getTime() - inicio.getTime()) / 3_600_000)
    f.cobrado = redondear(f.cobrado + (Number(t.cobrado) || 0))
  }

  return [...filas.values()].sort((a, b) => (a.dia === b.dia ? a.nombre.localeCompare(b.nombre, "es") : a.dia < b.dia ? 1 : -1))
}

/** El mismo reporte, sumado por persona para todo el periodo. */
export function totalizarPorPersona(filas: FilaDeActividad[]): (FilaDeActividad & { dias: number })[] {
  const porPersona = new Map<string, FilaDeActividad & { dias: number }>()
  for (const f of filas) {
    const t = porPersona.get(f.user_id)
    if (!t) {
      porPersona.set(f.user_id, { ...f, conteos: { ...f.conteos }, dias: 1, dia: "" })
      continue
    }
    t.dias++
    t.turnos += f.turnos
    t.horas_en_turno = redondear(t.horas_en_turno + f.horas_en_turno)
    t.cobrado = redondear(t.cobrado + f.cobrado)
    t.acciones += f.acciones
    t.consultas += f.consultas
    if (f.primera_accion && (!t.primera_accion || f.primera_accion < t.primera_accion)) t.primera_accion = f.primera_accion
    if (f.ultima_accion && (!t.ultima_accion || f.ultima_accion > t.ultima_accion)) t.ultima_accion = f.ultima_accion
    for (const k of Object.keys(f.conteos)) t.conteos[k] = (t.conteos[k] ?? 0) + f.conteos[k]
  }
  return [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
