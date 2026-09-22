import { calcularPagoDePersona, conDiasDelPeriodo, momentoLocal, periodosSeTraslapan, reglaQueAplica, revisarEsquema, revisarRegla } from "../nomina"

/**
 * Nómina y comisiones por persona (puntos 1 y 25).
 *
 *   npm run test:unit
 */

// 2026-09-14 es lunes. La clínica (Tijuana) está en UTC−7 en septiembre: 16:00Z = 09:00 local.
const lunesManana = "2026-09-14T16:00:00Z"
const lunesNoche = "2026-09-15T05:00:00Z" // lunes 22:00 local
const martesMadrugada = "2026-09-15T09:00:00Z" // martes 02:00 local
const sabado = "2026-09-19T19:00:00Z" // sábado 12:00 local

const diurna = { label: "Entre semana de día", days: "1,2,3,4,5", start_time: "08:00", end_time: "20:00", percent: 20 }
const nocturna = { label: "Noche", days: "0,1,2,3,4,5,6", start_time: "20:00", end_time: "08:00", percent: 30 }

describe("hora de la clínica", () => {
  it("día de la semana y minutos en la hora de la clínica (Tijuana)", () => {
    expect(momentoLocal(lunesManana)).toEqual({ dia: 1, minutos: 9 * 60 })
    expect(momentoLocal(martesMadrugada)).toEqual({ dia: 2, minutos: 2 * 60 })
  })
})

describe("reglas por horario", () => {
  it("de día entre semana aplica la diurna; de noche, la nocturna aunque cruce la medianoche", () => {
    expect(reglaQueAplica(lunesManana, [diurna, nocturna])?.percent).toBe(20)
    expect(reglaQueAplica(lunesNoche, [diurna, nocturna])?.percent).toBe(30)
    expect(reglaQueAplica(martesMadrugada, [diurna, nocturna])?.percent).toBe(30)
  })

  it("una franja que cruza la medianoche pertenece al día en que empieza", () => {
    const soloLunesNoche = { days: "1", start_time: "22:00", end_time: "06:00", percent: 40 }
    expect(reglaQueAplica(martesMadrugada, [soloLunesNoche])?.percent).toBe(40)
    expect(reglaQueAplica("2026-09-16T08:00:00Z", [soloLunesNoche])).toBeNull() // miércoles 02:00
  })

  it("si ninguna aplica, no hay regla", () => {
    expect(reglaQueAplica(sabado, [diurna])).toBeNull()
  })

  it("se validan días, horas y porcentaje", () => {
    expect(revisarRegla({ days: "", start_time: "08:00", end_time: "20:00", percent: 10 })).toMatch(/día/)
    expect(revisarRegla({ days: "1,7", start_time: "08:00", end_time: "20:00", percent: 10 })).toMatch(/día/)
    expect(revisarRegla({ days: "1", start_time: "8:00", end_time: "20:00", percent: 10 })).toMatch(/horas/)
    expect(revisarRegla({ days: "1", start_time: "08:00", end_time: "08:00", percent: 10 })).toMatch(/iguales/)
    expect(revisarRegla({ days: "1", start_time: "08:00", end_time: "20:00", percent: 120 })).toMatch(/porcentaje/)
    expect(revisarEsquema({ fixed_per_shift: -1 })).toMatch(/turno/)
    expect(revisarEsquema({ default_percent: 20, reglas: [diurna, nocturna] })).toBeNull()
  })
})

describe("pago de una persona", () => {
  it("fijo por turno + por hora + comisión por regla", () => {
    const d = calcularPagoDePersona({
      esquema: { fixed_per_shift: 300, hourly_rate: 50, default_percent: 10, reglas: [diurna, nocturna] },
      turnos: [
        { inicio: "2026-09-14T14:00:00Z", fin: "2026-09-14T22:00:00Z" }, // 8 h
        { inicio: "2026-09-15T02:00:00Z", fin: "2026-09-15T06:30:00Z" }, // 4.5 h
      ],
      atribuciones: [
        { fecha: lunesManana, monto: 1000 },
        { fecha: lunesNoche, monto: 500 },
        { fecha: sabado, monto: 200 },
      ],
    })
    expect(d.turnos).toBe(2)
    expect(d.horas).toBe(12.5)
    expect(d.fijo).toBe(600)
    expect(d.por_hora).toBe(625)
    expect(d.base_comisionable).toBe(1700)
    // 1000 × 20 % + 500 × 30 % + 200 × 10 % (sábado de día: base)
    expect(d.comision).toBe(370)
    expect(d.por_regla.map((r) => [r.etiqueta, r.percent, r.base, r.comision])).toEqual([
      ["Entre semana de día", 20, 1000, 200],
      ["Noche", 30, 500, 150],
      ["Porcentaje base", 10, 200, 20],
    ])
    expect(d.total).toBe(1595)
  })

  it("un turno abierto cuenta hasta ahora; sin esquema no se paga nada", () => {
    const d = calcularPagoDePersona({
      esquema: null,
      turnos: [{ inicio: "2026-09-14T14:00:00Z", fin: null }],
      atribuciones: [{ fecha: lunesManana, monto: 100 }],
      ahora: new Date("2026-09-14T16:00:00Z"),
    })
    expect(d.horas).toBe(2)
    expect(d.total).toBe(0)
  })

  it("las devoluciones restan de la base", () => {
    const d = calcularPagoDePersona({ esquema: { default_percent: 5 }, turnos: [], atribuciones: [{ fecha: sabado, monto: 1000 }, { fecha: sabado, monto: -200 }] })
    expect(d.base_comisionable).toBe(800)
    expect(d.comision).toBe(40)
  })
})

describe("periodos pagados", () => {
  it("dos periodos que comparten un día se traslapan; consecutivos no", () => {
    expect(periodosSeTraslapan({ desde: "2026-09-01T06:00:00Z", hasta: "2026-09-16T05:59:59Z" }, { desde: "2026-09-15T06:00:00Z", hasta: "2026-09-30T05:59:59Z" })).toBe(true)
    expect(periodosSeTraslapan({ desde: "2026-09-01T06:00:00Z", hasta: "2026-09-16T05:59:59Z" }, { desde: "2026-09-16T06:00:00Z", hasta: "2026-10-01T05:59:59Z" })).toBe(false)
  })
})

describe("el periodo de un pago en días de la clínica", () => {
  it("la medianoche de la clínica no se corre al día anterior", () => {
    // 1 de septiembre 00:00 en Tijuana = 07:00 UTC; un navegador en la Ciudad de México lo vería como la 01:00 del 1, y uno en UTC como el 31.
    const p = conDiasDelPeriodo({ period_from: "2026-09-01T07:00:00.000Z", period_to: "2026-09-16T06:59:59.999Z" })
    expect(p.dia_desde).toBe("2026-09-01")
    expect(p.dia_hasta).toBe("2026-09-15")
  })
})
