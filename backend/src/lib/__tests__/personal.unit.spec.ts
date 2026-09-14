import { ROLES } from "../roles"
import {
  CLAVE_BLOQUEADA,
  CLAVE_CORREO_AVISO,
  CLAVE_NUMERO_EMPLEADO,
  correoDeAviso,
  normalizarNumeroDeEmpleado,
  numeroDeEmpleado,
  quienTieneElNumeroEntre,
  resolverDestinatarios,
  revisarCorreoDeAviso,
  revisarNumeroDeEmpleado,
} from "../personal"

/**
 * Número de empleado, correo de aviso y destinatarios por rol.
 *
 * Lo que más importa aquí: que un aviso nunca salga hacia `@sigh.local`, que
 * no es un buzón, y que una cuenta bloqueada no reciba nada.
 *
 *   npm run test:unit
 */

const cuenta = (
  usuario: string,
  rol: string | null,
  extra: Record<string, unknown> = {}
) => ({
  id: `usr_${usuario}`,
  email: usuario.includes("@") ? usuario : `${usuario}@sigh.local`,
  metadata: { ...(rol ? { role: rol } : {}), ...extra },
})

describe("número de empleado", () => {
  it("se guarda en mayúsculas y sin espacios", () => {
    expect(normalizarNumeroDeEmpleado("  a-12 ")).toBe("A-12")
  })

  it.each(["0001", "A-12", "EMP007", "X"])("acepta %s", (n) => {
    expect(revisarNumeroDeEmpleado(n)).toBeNull()
  })

  it.each(["", "   ", "A B", "A/B", "1234567890123", "ñ1"])("rechaza %p", (n) => {
    expect(revisarNumeroDeEmpleado(n)).not.toBeNull()
  })

  it("se lee del metadata, normalizado", () => {
    expect(numeroDeEmpleado(cuenta("caja", "cashier", { [CLAVE_NUMERO_EMPLEADO]: " 0003 " }))).toBe("0003")
    expect(numeroDeEmpleado(cuenta("caja", "cashier"))).toBeNull()
  })

  it("detecta a quién pertenece un número, ignorando la cuenta que se edita", () => {
    const lista = [
      cuenta("caja", "cashier", { [CLAVE_NUMERO_EMPLEADO]: "0003" }),
      cuenta("medico", "doctor", { [CLAVE_NUMERO_EMPLEADO]: "0004" }),
    ]
    expect(quienTieneElNumeroEntre(lista, "0003")).toBe("caja@sigh.local")
    expect(quienTieneElNumeroEntre(lista, "0003", "usr_caja")).toBeNull()
    expect(quienTieneElNumeroEntre(lista, "0009")).toBeNull()
  })
})

describe("correo de aviso", () => {
  it("vacío vale: es opcional", () => {
    expect(revisarCorreoDeAviso("")).toBeNull()
    expect(revisarCorreoDeAviso(undefined)).toBeNull()
  })

  it("rechaza lo que no es un correo", () => {
    expect(revisarCorreoDeAviso("caja")).not.toBeNull()
  })

  it("rechaza el dominio interno, que no es un buzón", () => {
    expect(revisarCorreoDeAviso("caja@sigh.local")).not.toBeNull()
  })

  it("prefiere el correo de aviso explícito", () => {
    const u = cuenta("caja", "cashier", { [CLAVE_CORREO_AVISO]: "Caja@Clinica.mx" })
    expect(correoDeAviso(u)).toBe("caja@clinica.mx")
  })

  it("usa el identificador sólo cuando es un correo de verdad", () => {
    expect(correoDeAviso(cuenta("ana.torres@clinica.mx", "admin"))).toBe("ana.torres@clinica.mx")
    expect(correoDeAviso(cuenta("caja", "cashier"))).toBeNull()
  })
})

describe("destinatarios por rol", () => {
  const personal = [
    cuenta("admin", "admin", { [CLAVE_CORREO_AVISO]: "direccion@clinica.mx" }),
    cuenta("farmacia", "pharmacy", { [CLAVE_CORREO_AVISO]: "farmacia@clinica.mx" }),
    cuenta("caja", "cashier", { [CLAVE_CORREO_AVISO]: "caja@clinica.mx" }),
    cuenta("auditoria", "auditor"),
    cuenta("ana.torres@clinica.mx", "admin"),
  ]

  it("devuelve sólo a quien tiene el rol y un buzón", () => {
    expect(resolverDestinatarios(personal, [ROLES.ADMIN, ROLES.PHARMACY]).sort()).toEqual([
      "ana.torres@clinica.mx",
      "direccion@clinica.mx",
      "farmacia@clinica.mx",
    ])
  })

  it("no incluye a quien no tiene buzón aunque tenga el rol", () => {
    expect(resolverDestinatarios(personal, [ROLES.AUDITOR])).toEqual([])
  })

  it("excluye a las cuentas bloqueadas", () => {
    const conBloqueo = [
      cuenta("admin", "admin", { [CLAVE_CORREO_AVISO]: "direccion@clinica.mx", [CLAVE_BLOQUEADA]: true }),
      cuenta("farmacia", "pharmacy", { [CLAVE_CORREO_AVISO]: "farmacia@clinica.mx" }),
    ]
    expect(resolverDestinatarios(conBloqueo, [ROLES.ADMIN, ROLES.PHARMACY])).toEqual(["farmacia@clinica.mx"])
  })

  it("no repite direcciones", () => {
    const dos = [
      cuenta("admin", "admin", { [CLAVE_CORREO_AVISO]: "misma@clinica.mx" }),
      cuenta("farmacia", "pharmacy", { [CLAVE_CORREO_AVISO]: "misma@clinica.mx" }),
    ]
    expect(resolverDestinatarios(dos, [ROLES.ADMIN, ROLES.PHARMACY])).toEqual(["misma@clinica.mx"])
  })

  it("nunca devuelve una dirección del dominio interno", () => {
    const todos = resolverDestinatarios(personal, [
      ROLES.ADMIN, ROLES.PHARMACY, ROLES.CASHIER, ROLES.DOCTOR, ROLES.NURSE, ROLES.AUDITOR,
    ])
    expect(todos.some((d) => d.endsWith("@sigh.local"))).toBe(false)
  })

  it("tolera roles heredados", () => {
    const viejo = [cuenta("farm", "farmacia", { [CLAVE_CORREO_AVISO]: "f@clinica.mx" })]
    expect(resolverDestinatarios(viejo, [ROLES.PHARMACY])).toEqual(["f@clinica.mx"])
  })
})
