import { GENESIS, calcularHuella, enFila, type ContenidoAsiento } from "../audit-chain"

/**
 * El encadenamiento de la bitácora.
 *
 * Se prueba simulando lo que haría alguien con acceso a la base: editar un
 * asiento, borrarlo, reordenarlos. En los tres casos la cadena tiene que dejar
 * de cuadrar — si no, la bitácora no prueba nada.
 *
 *   npm run test:unit
 */

const asiento = (parcial: Partial<ContenidoAsiento> = {}): ContenidoAsiento => ({
  user_id: "usr_1",
  user_email: "caja@clinica.mx",
  user_role: "cashier",
  method: "POST",
  endpoint: "/admin/orders",
  ip_address: "192.168.1.50",
  payload: { total: 499.96 },
  ...parcial,
})

/** Construye una cadena de asientos como lo hace el interceptor. */
function encadenar(contenidos: ContenidoAsiento[]) {
  const cadena: { contenido: ContenidoAsiento; prev_hash: string; hash: string }[] = []
  let previa = GENESIS
  for (const c of contenidos) {
    const hash = calcularHuella(c, previa)
    cadena.push({ contenido: c, prev_hash: previa, hash })
    previa = hash
  }
  return cadena
}

/** Recorre la cadena igual que verificar-bitacora.ts y devuelve los índices rotos. */
function verificar(cadena: { contenido: ContenidoAsiento; prev_hash: string; hash: string }[]) {
  const rotos: number[] = []
  let esperada = cadena.length ? cadena[0].prev_hash : GENESIS

  cadena.forEach((a, i) => {
    if (a.prev_hash !== esperada) {
      rotos.push(i)
      esperada = a.hash
      return
    }
    if (calcularHuella(a.contenido, a.prev_hash) !== a.hash) {
      rotos.push(i)
    }
    esperada = a.hash
  })

  return rotos
}

describe("encadenamiento de la bitácora", () => {
  it("una cadena recién escrita está intacta", () => {
    const cadena = encadenar([
      asiento({ endpoint: "/auth/user/emailpass" }),
      asiento({ endpoint: "/admin/orders" }),
      asiento({ endpoint: "/admin/cash-sessions" }),
    ])

    expect(verificar(cadena)).toEqual([])
  })

  it("detecta que alguien EDITÓ un asiento", () => {
    const cadena = encadenar([asiento(), asiento(), asiento()])

    // Alguien cambia el importe de una venta directamente en la base.
    cadena[1].contenido = { ...cadena[1].contenido, payload: { total: 0.01 } }

    expect(verificar(cadena)).toContain(1)
  })

  it("detecta que alguien BORRÓ un asiento", () => {
    const cadena = encadenar([asiento(), asiento(), asiento()])
    const sinElDeEnMedio = [cadena[0], cadena[2]]

    // El tercero sigue apuntando al segundo, que ya no está.
    expect(verificar(sinElDeEnMedio)).toContain(1)
  })

  it("detecta que alguien REORDENÓ los asientos", () => {
    const cadena = encadenar([asiento(), asiento(), asiento()])
    const revueltos = [cadena[0], cadena[2], cadena[1]]

    expect(verificar(revueltos).length).toBeGreaterThan(0)
  })

  it("detecta el cambio aunque sólo se toque el usuario", () => {
    // El caso que más importa: alguien se quita de encima una acción propia
    // atribuyéndosela a otro.
    const cadena = encadenar([asiento(), asiento()])
    cadena[1].contenido = { ...cadena[1].contenido, user_email: "otro@clinica.mx" }

    expect(verificar(cadena)).toContain(1)
  })

  it("no se rompe sola por el orden de las claves del payload", () => {
    // JSON.stringify respeta el orden de inserción. Sin canonicalizar, el mismo
    // contenido guardado con las claves en otro orden daria otra huella y la
    // cadena se romperia sin que nadie hubiera tocado nada.
    const a = calcularHuella(asiento({ payload: { total: 10, folio: 5 } }), GENESIS)
    const b = calcularHuella(asiento({ payload: { folio: 5, total: 10 } }), GENESIS)

    expect(a).toBe(b)
  })

  it("dos contenidos distintos nunca comparten huella", () => {
    const a = calcularHuella(asiento({ endpoint: "/admin/orders" }), GENESIS)
    const b = calcularHuella(asiento({ endpoint: "/admin/ordens" }), GENESIS)

    expect(a).not.toBe(b)
  })

  it("el mismo contenido en distinta posición da distinta huella", () => {
    // Es lo que impide mover un asiento de sitio sin que se note.
    const c = asiento()
    expect(calcularHuella(c, GENESIS)).not.toBe(calcularHuella(c, "otra-huella"))
  })

  it("enFila serializa: nadie lee la huella previa a medias", () => {
    const orden: number[] = []
    const tarea = (n: number, ms: number) =>
      enFila(async () => {
        await new Promise((r) => setTimeout(r, ms))
        orden.push(n)
      })

    // La primera tarda más que la segunda: sin la cola, terminaría después.
    return Promise.all([tarea(1, 30), tarea(2, 1)]).then(() => {
      expect(orden).toEqual([1, 2])
    })
  })
})
