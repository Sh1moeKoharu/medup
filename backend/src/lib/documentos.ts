import { ResumenDeCaja } from "./corte-de-caja"
import type { PerfilProfesional } from "./perfil-profesional"
import { ZONA_CLINICA } from "./zona-horaria"

/**
 * Los tres documentos que salen por la impresora además del ticket: la
 * RECETA para el paciente, la NOTA de atención para el expediente y el CORTE
 * de caja para el arqueo.
 *
 * Se componen en el servidor y llegan al punto de venta como HTML listo para
 * imprimir (ver utils/imprimir.ts en el POS). Igual que el ticket: lo que
 * dice el papel lo decide el servidor, no el dispositivo.
 *
 * Funciones puras. Cada una devuelve null cuando los datos no alcanzan para
 * un documento válido —una nota sin contenido, una receta sin renglones— en
 * vez de imprimir un papel a medias.
 *
 * Papel de 80 mm por omisión (la térmica del mostrador); en hoja carta se ve
 * igual, centrado.
 */

export type Membrete = {
  establecimiento: string
  direccion?: string | null
  telefono?: string | null
  rfc?: string | null
  /** Logotipo de la clínica (una imagen subida al sistema). */
  logo_url?: string | null
}

function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fecha(iso: string | Date | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_CLINICA,
  })
}

function dinero(cantidad: number, moneda = "MXN"): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, currencyDisplay: "narrowSymbol" }).format(cantidad)
  } catch {
    return `$${Number(cantidad).toFixed(2)}`
  }
}

const ESTILO = `
  @page { margin: 6mm; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; padding: 0; width: 72mm; max-width: 100%; font-size: 12px; line-height: 1.35; }
  .membrete { text-align: center; margin-bottom: 8px; }
  .membrete h1 { font-size: 15px; margin: 0 0 2px; letter-spacing: .02em; }
  .membrete p { margin: 0; font-size: 10px; color: #444; }
  h2 { font-size: 13px; margin: 10px 0 4px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #111; padding-bottom: 2px; }
  .dato { display: flex; justify-content: space-between; gap: 8px; margin: 1px 0; }
  .dato b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  .sub { font-size: 10px; color: #444; }
  .pie { margin-top: 12px; font-size: 10px; color: #444; text-align: center; }
  .firma { margin-top: 22px; border-top: 1px solid #111; padding-top: 3px; text-align: center; font-size: 10px; }
  .fuerte td { font-weight: 700; border-top: 1px solid #111; }
  .parrafo { white-space: pre-wrap; margin: 4px 0; }
`

function membrete(m: Membrete): string {
  return `<div class="membrete">
    <h1>${esc(m.establecimiento || "Altus")}</h1>
    ${m.direccion ? `<p>${esc(m.direccion)}</p>` : ""}
    ${m.telefono || m.rfc ? `<p>${[m.telefono ? `Tel. ${esc(m.telefono)}` : "", m.rfc ? `RFC ${esc(m.rfc)}` : ""].filter(Boolean).join(" · ")}</p>` : ""}
  </div>`
}

function documento(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO}</style></head><body>${cuerpo}</body></html>`
}

// ── Receta ──────────────────────────────────────────────────────────────────

export type DatosReceta = {
  membrete: Membrete
  folio: string
  fecha: string | Date
  paciente: string
  prescriptor: string
  rol_prescriptor: string
  destinatario: "nursing" | "pharmacy" | string
  renglones: { product_title: string | null; quantity: number; instructions?: string | null }[]
  /** Cédula, universidad, especialidad y consultorio de quien prescribe. */
  perfil?: PerfilProfesional | null
}

/**
 * Folio corto para el papel: los últimos 8 caracteres del id, en mayúsculas.
 * El id completo sigue en la base; en la hoja basta con algo que se pueda
 * dictar por teléfono.
 */
export const folioCorto = (id: string) => String(id ?? "").slice(-8).toUpperCase()

const ESTILO_RECETA = `
  @page { size: 5.5in 8.5in; margin: 10mm 11mm; }
  @media screen { body { max-width: 5.5in; margin: 16px auto !important; padding: 10mm 11mm; box-shadow: 0 0 0 1px #ddd; } }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #17150F; margin: 0; font-size: 11px; line-height: 1.4; }
  .hoja { display: flex; flex-direction: column; min-height: calc(8.5in - 20mm); }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 1.5px solid #17150F; padding-bottom: 8px; }
  header img { max-height: 54px; max-width: 90px; object-fit: contain; }
  .clinica { flex: 1; }
  .clinica h1 { font-size: 15px; margin: 0; letter-spacing: .01em; }
  .clinica p { margin: 1px 0 0; font-size: 9.5px; color: #4A453E; }
  .medico { margin-top: 8px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; }
  .medico .nombre { font-size: 13px; font-weight: 600; }
  .medico p { margin: 1px 0 0; font-size: 9.5px; color: #4A453E; }
  .medico .derecha { text-align: right; }
  .paciente { margin-top: 10px; display: grid; grid-template-columns: 1fr auto; gap: 2px 16px; padding: 6px 8px; background: #F5F3F1; border-radius: 4px; }
  .paciente span { font-size: 9px; color: #4A453E; text-transform: uppercase; letter-spacing: .05em; }
  .paciente b { font-weight: 600; font-size: 12px; }
  .rx { font-family: Georgia, "Times New Roman", serif; font-size: 26px; font-style: italic; margin: 12px 0 2px; }
  ol { margin: 0; padding-left: 18px; flex: 1; }
  li { margin: 0 0 9px; }
  li .med { font-weight: 600; font-size: 12px; }
  li .cant { color: #4A453E; font-weight: 400; }
  li .ind { margin-top: 2px; white-space: pre-wrap; }
  .firma { margin: 26px auto 0; width: 60%; border-top: 1px solid #17150F; padding-top: 3px; text-align: center; font-size: 10px; }
  footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 8.5px; color: #4A453E; border-top: 0.5px solid #C9C3BA; padding-top: 4px; }
`

/**
 * La receta del paciente, en media carta (5.5 × 8.5 in).
 *
 * Construida a partir de la de 80 mm, que servía para el mostrador pero no
 * como receta: no llevaba cédula ni universidad. Ahora el encabezado es el de
 * la clínica (logotipo, domicilio, teléfono) y debajo los datos del médico que
 * exige la norma; al pie, la firma con el nombre y la cédula.
 *
 * Lo que NO sale: las notas para Enfermería y la nota de atención. Son para el
 * equipo y el expediente, no para el paciente.
 */
export function htmlReceta(d: DatosReceta): string | null {
  if (!d.folio || !d.paciente || !d.prescriptor || !d.renglones?.length) return null

  const p = d.perfil ?? {}
  const clinica = d.membrete
  const datosClinica = [clinica.direccion, clinica.telefono ? `Tel. ${clinica.telefono}` : null].filter(Boolean) as string[]
  const consultorio = [p.consultorio_nombre, p.consultorio_direccion].filter(Boolean) as string[]
  const cedulas = [
    p.cedula_profesional ? `Cédula profesional ${p.cedula_profesional}` : null,
    p.cedula_especialidad ? `Cédula de especialidad ${p.cedula_especialidad}` : null,
  ].filter(Boolean) as string[]

  const renglones = d.renglones
    .map(
      (r) => `<li><div class="med">${esc(r.product_title ?? "")} <span class="cant">· ${esc(r.quantity)} ${
        Number(r.quantity) === 1 ? "pieza" : "piezas"
      }</span></div>${r.instructions ? `<div class="ind">${esc(r.instructions)}</div>` : ""}</li>`
    )
    .join("")

  const destino = d.destinatario === "pharmacy" ? "Surte Farmacia" : "Aplica Enfermería"
  const logo = (url?: string | null) => (url ? `<img src="${esc(url)}" alt="">` : "")

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`Receta ${folioCorto(d.folio)}`)}</title><style>${ESTILO_RECETA}</style></head><body><div class="hoja">
  <header>
    ${logo(clinica.logo_url)}
    <div class="clinica">
      <h1>${esc(clinica.establecimiento || "Altus")}</h1>
      ${datosClinica.map((t) => `<p>${esc(t)}</p>`).join("")}
    </div>
    ${logo(p.logo_url)}
  </header>
  <div class="medico">
    <div>
      <div class="nombre">${esc(d.prescriptor)}</div>
      ${p.especialidad ? `<p>${esc(p.especialidad)}</p>` : `<p>${esc(d.rol_prescriptor)}</p>`}
      ${p.universidad ? `<p>${esc(p.universidad)}</p>` : ""}
    </div>
    <div class="derecha">
      ${cedulas.map((t) => `<p>${esc(t)}</p>`).join("")}
      ${consultorio.map((t) => `<p>${esc(t)}</p>`).join("")}
      ${p.telefono ? `<p>Tel. ${esc(p.telefono)}</p>` : ""}
    </div>
  </div>
  <div class="paciente">
    <span>Paciente</span><span>Fecha</span>
    <b>${esc(d.paciente)}</b><b>${esc(fecha(d.fecha))}</b>
  </div>
  <div class="rx">Rx</div>
  <ol>${renglones}</ol>
  <div class="firma">${esc(d.prescriptor)}${p.cedula_profesional ? `<br>Céd. prof. ${esc(p.cedula_profesional)}` : ""}</div>
  <footer><span>Folio ${esc(folioCorto(d.folio))} · ${esc(destino)}</span><span>Conserve esta receta</span></footer>
</div></body></html>`
}

// ── Nota de atención ────────────────────────────────────────────────────────

export type DatosNota = {
  membrete: Membrete
  folio: string
  fecha: string | Date
  paciente: string
  autor: string
  rol_autor: string
  contenido: string
  orden_folio?: string | null
}

export function htmlNota(d: DatosNota): string | null {
  if (!d.folio || !d.paciente || !String(d.contenido ?? "").trim()) return null

  return documento(
    `Nota de atención ${d.folio}`,
    `${membrete(d.membrete)}
    <h2>Nota de atención</h2>
    <div class="dato"><span>Folio</span><b>${esc(d.folio)}</b></div>
    <div class="dato"><span>Fecha</span><b>${esc(fecha(d.fecha))}</b></div>
    <div class="dato"><span>Paciente</span><b>${esc(d.paciente)}</b></div>
    ${d.orden_folio ? `<div class="dato"><span>Orden médica</span><b>${esc(d.orden_folio)}</b></div>` : ""}
    <h2>Atención</h2>
    <p class="parrafo">${esc(d.contenido.trim())}</p>
    <div class="firma">${esc(d.autor)}<br>${esc(d.rol_autor)}</div>
    <p class="pie">Para el expediente clínico. Contiene datos personales sensibles.</p>`
  )
}

// ── Corte de caja ───────────────────────────────────────────────────────────

export type DatosCorte = {
  membrete: Membrete
  folio: string
  cajero: string
  abierto: string | Date
  cerrado?: string | Date | null
  resumen: ResumenDeCaja
  contado?: number | null
  diferencia?: number | null
  notas?: string | null
  moneda?: string
}

export function htmlCorte(d: DatosCorte): string | null {
  if (!d.folio || !d.cajero || !d.resumen) return null
  const m = d.moneda ?? "MXN"
  const r = d.resumen
  const fila = (etiqueta: string, valor: number, fuerte = false) =>
    `<tr class="${fuerte ? "fuerte" : ""}"><td>${esc(etiqueta)}</td><td class="num">${esc(dinero(valor, m))}</td></tr>`

  return documento(
    `Corte de caja ${d.folio}`,
    `${membrete(d.membrete)}
    <h2>Corte de caja</h2>
    <div class="dato"><span>Turno</span><b>${esc(d.folio)}</b></div>
    <div class="dato"><span>Cajero</span><b>${esc(d.cajero)}</b></div>
    <div class="dato"><span>Apertura</span><b>${esc(fecha(d.abierto))}</b></div>
    ${d.cerrado ? `<div class="dato"><span>Cierre</span><b>${esc(fecha(d.cerrado))}</b></div>` : `<div class="dato"><span>Cierre</span><b>turno abierto</b></div>`}
    <h2>Ventas (${r.transaction_count})</h2>
    <table>
      ${fila("Efectivo", r.sales_cash)}
      ${fila("Tarjeta", r.sales_card)}
      ${fila("Transferencia", r.sales_transfer)}
      ${r.sales_other ? fila("Otro", r.sales_other) : ""}
      ${fila("Total ventas", r.sales_total, true)}
      ${r.refunds_total ? fila(`Reembolsos (${r.refund_count})`, -r.refunds_total) : ""}
    </table>
    <h2>Efectivo</h2>
    <table>
      ${fila("Fondo inicial", r.opening_amount)}
      ${fila("Ventas en efectivo", r.sales_cash)}
      ${r.refunds_cash ? fila("Reembolsos en efectivo", -r.refunds_cash) : ""}
      ${fila("Entradas", r.cash_in_total)}
      ${fila("Salidas", -r.cash_out_total)}
      ${fila("Esperado en caja", r.expected_cash_in_register, true)}
      ${d.contado !== null && d.contado !== undefined ? fila("Contado", Number(d.contado)) : ""}
      ${d.diferencia !== null && d.diferencia !== undefined ? fila(Number(d.diferencia) >= 0 ? "Sobrante" : "Faltante", Number(d.diferencia), true) : ""}
    </table>
    ${d.notas ? `<h2>Observaciones</h2><p class="parrafo">${esc(d.notas)}</p>` : ""}
    <div class="firma">${esc(d.cajero)}<br>Cajero</div>
    <div class="firma">Revisó</div>`
  )
}

// ── Recibo de honorarios y nómina ───────────────────────────────────────────

export type DatosPago = {
  membrete: Membrete
  folio: string
  persona: string
  rol: string
  numero_empleado?: string | null
  desde: string | Date
  hasta: string | Date
  pagado_en: string | Date
  pagado_por: string
  referencia?: string | null
  notas?: string | null
  desglose: {
    turnos: number
    horas: number
    fijo: number
    por_hora: number
    comision: number
    base_comisionable: number
    por_regla: { etiqueta: string; percent: number; base: number; comision: number }[]
    total: number
  }
}

/** El recibo de un pago de honorarios o nómina, con el desglose congelado. */
export function htmlPago(d: DatosPago): string | null {
  if (!d.folio || !d.persona || !d.desglose) return null
  const x = d.desglose
  const fila = (etiqueta: string, valor: number, fuerte = false) =>
    `<tr class="${fuerte ? "fuerte" : ""}"><td>${esc(etiqueta)}</td><td class="num">${esc(dinero(valor))}</td></tr>`
  const dia = (v: string | Date) => fecha(v).slice(0, 10)

  return documento(
    `Recibo de pago ${d.folio}`,
    `${membrete(d.membrete)}
    <h2>Recibo de pago</h2>
    <div class="dato"><span>Folio</span><b>${esc(d.folio)}</b></div>
    <div class="dato"><span>Persona</span><b>${esc(d.persona)}</b></div>
    <div class="dato"><span>Perfil</span><b>${esc(d.rol)}${d.numero_empleado ? ` · Nº ${esc(d.numero_empleado)}` : ""}</b></div>
    <div class="dato"><span>Periodo</span><b>${esc(dia(d.desde))} al ${esc(dia(d.hasta))}</b></div>
    <div class="dato"><span>Pagado</span><b>${esc(fecha(d.pagado_en))}</b></div>
    ${d.referencia ? `<div class="dato"><span>Referencia</span><b>${esc(d.referencia)}</b></div>` : ""}
    <h2>Desglose</h2>
    <table>
      ${x.fijo ? fila(`Pago fijo · ${x.turnos} ${x.turnos === 1 ? "turno" : "turnos"}`, x.fijo) : ""}
      ${x.por_hora ? fila(`Por hora · ${x.horas.toFixed(2)} h`, x.por_hora) : ""}
      ${x.por_regla.map((r) => fila(`Comisión ${r.percent}% sobre ${dinero(r.base)} (${r.etiqueta})`, r.comision)).join("")}
      ${fila("Total", x.total, true)}
    </table>
    ${d.notas ? `<p class="parrafo">${esc(d.notas)}</p>` : ""}
    <div class="firma">Recibí conforme<br>${esc(d.persona)}</div>
    <p class="pie">Registró ${esc(d.pagado_por)}. No es un comprobante fiscal.</p>`
  )
}
