/**
 * CSV listo para Excel en español.
 *
 * Tres detalles que, si faltan, hacen que el archivo "se vea mal" al abrirlo:
 *   · BOM UTF-8 al inicio: sin él, Excel lee las tildes como "Ã¡".
 *   · Fin de línea CRLF, que es lo que espera Excel en Windows.
 *   · Campos con coma, punto y coma, comillas o saltos de línea entre comillas,
 *     con las comillas dobladas.
 *
 * Los números van con punto decimal y sin separador de miles, para que la
 * celda se lea como número y se pueda sumar.
 */

export const BOM = "﻿"

export function campoCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return ""
  const s = typeof valor === "number" ? (Number.isFinite(valor) ? String(valor) : "") : String(valor)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function aCsv(cabecera: string[], filas: unknown[][]): string {
  const lineas = [cabecera, ...filas].map((f) => f.map(campoCsv).join(","))
  return BOM + lineas.join("\r\n") + "\r\n"
}
