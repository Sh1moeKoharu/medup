/**
 * Qué significa cada asiento de la bitácora, en palabras y por categoría.
 *
 * La bitácora guarda llamadas a la API ("POST /admin/medical-orders/x/consume").
 * Para leerla —en un reporte impreso, o para contar lo que hizo cada persona
 * en un día— hace falta traducirla. La pantalla del POS tiene su propia
 * traducción (components/bitacora/Bitacora.tsx); esta es la del servidor, que
 * es la que sale en los reportes. Funciones puras.
 */

/** Lo que se cuenta por persona en el reporte de actividad. */
export type CategoriaDeAccion =
  | "acceso"
  | "venta"
  | "movimiento_caja"
  | "caja"
  | "receta_emitida"
  | "orden_aplicada"
  | "orden_ajustada"
  | "receta_surtida"
  | "requisicion"
  | "lote"
  | "baja"
  | "nota"
  | "paciente"
  | "turno"
  | "consulta"
  | "otra"

type Regla = [RegExp, string, CategoriaDeAccion]

function reglas(method: string): Regla[] {
  return [
    [/^\/admin\/medical-orders\/[^/]+\/dispense$/, "Surtió una receta", "receta_surtida"],
    [/^\/admin\/medical-orders\/[^/]+\/consume$/, "Aplicó una orden en consulta", "orden_aplicada"],
    [/^\/admin\/medical-orders\/[^/]+\/items$/, "Ajustó una orden médica", "orden_ajustada"],
    [/^\/admin\/medical-orders\/[^/]+\/cancel$/, "Canceló una receta", "receta_emitida"],
    [/^\/admin\/medical-orders$/, "Emitió una receta", "receta_emitida"],
    [/^\/admin\/draft-orders\/[^/]+\/convert-to-order$/, "Cobró una venta", "venta"],
    [/^\/admin\/cash-sessions\/[^/]+\/close$/, "Cerró la caja", "caja"],
    [/^\/admin\/cash-sessions\/[^/]+\/movements$/, "Registró un movimiento de caja", "movimiento_caja"],
    [/^\/admin\/cash-sessions$/, "Abrió la caja", "caja"],
    [/^\/admin\/medical-batches\/[^/]+\/write-off$/, "Dio de baja existencia de un lote", "baja"],
    [/^\/admin\/medical-batches\/[^/]+\/destroy$/, "Destruyó un lote", "baja"],
    [/^\/admin\/medical-batches\/[^/]+$/, "Corrigió los datos de un lote", "lote"],
    [/^\/admin\/medical-batches$/, "Dio de alta un lote", "lote"],
    [/^\/admin\/medical-batches/, "Modificó los lotes de inventario", "lote"],
    [/^\/admin\/stock-policies/, "Cambió un mínimo o máximo de existencia", "lote"],
    [/^\/admin\/inventory-counts/, "Hizo un inventario físico", "lote"],
    [/^\/admin\/staff\/[^/]+\/password$/, "Cambió la contraseña de una cuenta", "otra"],
    [/^\/admin\/staff\/[^/]+\/block$/, "Bloqueó una cuenta", "otra"],
    [/^\/admin\/staff\/[^/]+\/unblock$/, "Reactivó una cuenta", "otra"],
    [/^\/admin\/staff\/[^/]+$/, method === "DELETE" ? "Dio de baja a un miembro del personal" : "Modificó una cuenta de personal", "otra"],
    [/^\/admin\/staff$/, "Dio de alta a un miembro del personal", "otra"],
    [/^\/admin\/customers$/, "Registró a un paciente", "paciente"],
    [/^\/admin\/customers/, method === "DELETE" ? "Dio de baja a un paciente" : "Modificó la ficha de un paciente", "paciente"],
    [/^\/admin\/draft-orders/, "Trabajó sobre una venta en curso", "otra"],
    [/^\/admin\/orders/, "Modificó un pedido", "otra"],
    [/^\/admin\/products/, "Modificó el catálogo", "otra"],
    [/^\/admin\/receipt-config/, "Cambió la configuración del ticket", "otra"],
    [/^\/admin\/b2b-agreements/, "Modificó un convenio", "otra"],
    [/^\/admin\/medical-customers/, "Actualizó un expediente clínico", "paciente"],
    [/^\/admin\/clinical-notes/, "Escribió una nota de atención", "nota"],
    [/^\/admin\/requisitions\/[^/]+\/dispatch$/, "Surtió una requisición", "requisicion"],
    [/^\/admin\/requisitions\/[^/]+\/receive$/, "Recibió una requisición", "requisicion"],
    [/^\/admin\/requisitions\/[^/]+\/cancel$/, "Canceló una requisición", "requisicion"],
    [/^\/admin\/requisitions$/, "Pidió una requisición", "requisicion"],
    [/^\/admin\/doctor-shifts\/[^/]+\/close$/, "Cerró su turno", "turno"],
    [/^\/admin\/doctor-shifts\/[^/]+$/, "Corrigió las horas de un turno", "turno"],
    [/^\/admin\/payroll\/payments\/[^/]+\/anular$/, "Anuló un pago de nómina", "otra"],
    [/^\/admin\/payroll\/pay$/, "Registró un pago de nómina", "otra"],
    [/^\/admin\/staff-compensation/, "Definió un esquema de pago", "otra"],
    [/^\/admin\/doctor-shifts/, "Abrió su turno", "turno"],
    [/^\/admin\/doctor-commissions/, "Fijó una comisión", "otra"],
  ]
}

/** Lecturas que la bitácora registra (ver LECTURAS_SENSIBLES en lib/bitacora.ts). */
const LECTURAS: [RegExp, string][] = [
  [/^\/admin\/customers\//, "Consultó la ficha de un paciente"],
  [/^\/admin\/medical-customers/, "Consultó un expediente clínico"],
  [/^\/admin\/clinical-notes/, "Consultó notas de atención"],
  [/^\/admin\/documents\/nota/, "Imprimió una nota de atención"],
  [/^\/admin\/reports\/export/, "Exportó un reporte"],
]

export function clasificarAccion(method: string, endpoint: string): { descripcion: string; categoria: CategoriaDeAccion } {
  const m = String(method ?? "").toUpperCase()
  const e = String(endpoint ?? "")

  // Los accesos no llevan ruta: el servidor guarda la frase tal cual.
  if (!e.startsWith("/")) {
    return { descripcion: e || "Acción sin descripción", categoria: /sesi[oó]n/i.test(e) ? "acceso" : "otra" }
  }

  const ruta = e.split("?")[0]
  if (ruta.startsWith("/auth/")) {
    return { descripcion: m === "DELETE" ? "Cerró sesión" : "Inició sesión", categoria: "acceso" }
  }

  if (m === "GET") {
    const lectura = LECTURAS.find(([p]) => p.test(ruta))
    return { descripcion: lectura ? lectura[1] : `Consultó ${ruta}`, categoria: "consulta" }
  }

  const regla = reglas(m).find(([p]) => p.test(ruta))
  return regla ? { descripcion: regla[1], categoria: regla[2] } : { descripcion: `${m} ${ruta}`, categoria: "otra" }
}
