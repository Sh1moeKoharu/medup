/**
 * La hora de la clínica.
 *
 * Los reportes, la actividad por día, la nómina por horario y la fecha de una
 * nota de atención cuentan en la hora del lugar donde está la clínica, no en
 * UTC: una venta a las 19:00 del lunes es del lunes.
 *
 * Se configura con `ALTUS_ZONA_HORARIA` (nombre IANA: `America/Mexico_City`,
 * `America/Tijuana`, `America/Cancun`…). Por omisión, Tijuana, donde está la
 * clínica. El
 * desfase se calcula para cada fecha, así que las zonas con horario de verano
 * (Tijuana) cuentan bien todo el año.
 */

export const ZONA_CLINICA = process.env.ALTUS_ZONA_HORARIA || "America/Tijuana"

/** "-07:00" para esa zona en ese instante. */
export function desfaseEn(instante: Date, zona: string = ZONA_CLINICA): string {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: zona, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(nombre ?? "")
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00"
}

/**
 * Un día y una hora de reloj de la clínica ("2026-09-14", "23:59:59.999") como
 * instante. El desfase se toma del mediodía de ese día para no caer en el
 * cambio de horario de la madrugada.
 */
export function instanteDeLaClinica(dia: string, hora = "00:00:00.000", zona: string = ZONA_CLINICA): Date {
  const mediodia = new Date(`${dia}T12:00:00Z`)
  return new Date(`${dia}T${hora}${desfaseEn(mediodia, zona)}`)
}
