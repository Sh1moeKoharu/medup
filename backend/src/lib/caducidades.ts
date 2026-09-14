/**
 * Caducidades: el tramo de alerta de cada lote y su exportación.
 *
 * Los tramos son los de la propuesta: 90 / 60 / 30 días, y "caducado" aparte
 * (eso ya no es una alerta sino existencia que debe estar en cuarentena).
 * Funciones puras; la consulta vive en caducidades-servidor.ts.
 */

export type Tramo = "expired" | "30" | "60" | "90"

export const ETIQUETA_TRAMO: Record<Tramo, string> = {
  expired: "Caducado",
  "30": "30 días o menos",
  "60": "31 a 60 días",
  "90": "61 a 90 días",
}

export function inicioDelDia(ahora: Date = new Date()): Date {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
}

export function diasRestantes(caducidad: string | Date, hoy: Date = inicioDelDia()): number {
  return Math.floor((new Date(caducidad).getTime() - hoy.getTime()) / 86400000)
}

export function tramoDe(dias: number): Tramo {
  if (dias < 0) return "expired"
  if (dias <= 30) return "30"
  if (dias <= 60) return "60"
  return "90"
}

export type LoteProximo = {
  batch_id: string
  batch_number: string
  variant_id: string
  title: string
  product_title: string | null
  expiration_date: string
  quantity: number
  shelf_location: string | null
  stock_location_id: string | null
  stock_location_name: string | null
  status: string
  days_left: number
  tier: Tramo
}

export type ResumenTramos = Record<Tramo, { batches: number; units: number }>

export function resumirTramos(items: LoteProximo[]): ResumenTramos {
  const r: ResumenTramos = {
    expired: { batches: 0, units: 0 },
    "30": { batches: 0, units: 0 },
    "60": { batches: 0, units: 0 },
    "90": { batches: 0, units: 0 },
  }
  for (const i of items) {
    r[i.tier].batches += 1
    r[i.tier].units += Number(i.quantity) || 0
  }
  return r
}

/** Un campo CSV: entre comillas si hace falta, comillas dobladas. */
function campo(valor: unknown): string {
  const s = String(valor ?? "")
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV de caducidades, listo para Excel: BOM UTF-8 para que las tildes salgan
 * bien y fecha en ISO para que no se reinterprete.
 */
export function csvDeCaducidades(items: LoteProximo[]): string {
  const cabecera = ["Almacén", "Presentación", "Lote", "Caducidad", "Días restantes", "Tramo", "Existencia", "Estado", "Estante"]
  const filas = items.map((i) =>
    [
      i.stock_location_name ?? i.stock_location_id ?? "",
      i.title,
      i.batch_number,
      String(i.expiration_date).slice(0, 10),
      i.days_left,
      ETIQUETA_TRAMO[i.tier],
      i.quantity,
      i.status === "quarantined" ? "En cuarentena" : i.status === "destroyed" ? "Destruido" : "Activo",
      i.shelf_location ?? "",
    ]
      .map(campo)
      .join(",")
  )
  return "﻿" + [cabecera.map(campo).join(","), ...filas].join("\r\n") + "\r\n"
}
