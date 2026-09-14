import { ResumenDeCaja } from "./corte-de-caja"

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
    timeZone: "America/Mexico_City",
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
  notas?: string | null
}

export function htmlReceta(d: DatosReceta): string | null {
  if (!d.folio || !d.paciente || !d.prescriptor || !d.renglones?.length) return null

  const filas = d.renglones
    .map(
      (r) => `<tr><td class="num" style="width:2.2em">${esc(r.quantity)}×</td><td>${esc(r.product_title ?? "")}${
        r.instructions ? `<div class="sub">${esc(r.instructions)}</div>` : ""
      }</td></tr>`
    )
    .join("")

  const destino = d.destinatario === "pharmacy" ? "Surte Farmacia" : "Aplica Enfermería"

  return documento(
    `Receta ${d.folio}`,
    `${membrete(d.membrete)}
    <h2>Receta médica</h2>
    <div class="dato"><span>Folio</span><b>${esc(d.folio)}</b></div>
    <div class="dato"><span>Fecha</span><b>${esc(fecha(d.fecha))}</b></div>
    <div class="dato"><span>Paciente</span><b>${esc(d.paciente)}</b></div>
    <div class="dato"><span>${esc(destino)}</span><span></span></div>
    <table>${filas}</table>
    ${d.notas ? `<h2>Indicaciones</h2><p class="parrafo">${esc(d.notas)}</p>` : ""}
    <div class="firma">${esc(d.prescriptor)}<br>${esc(d.rol_prescriptor)}</div>
    <p class="pie">Documento generado por el sistema. Conserve esta receta.</p>`
  )
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
