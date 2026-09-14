import {
  ALL_ROLES,
  MIGRATION_ROLE_FOR_UNMARKED_USERS,
  ROLES,
  isMedicalOrderCreatorRole,
  normalizeRole,
} from "../roles"

/**
 * El vocabulario de roles, y sobre todo la regla que lo sostiene:
 * NO HAY ROL POR OMISIÓN.
 *
 * Antes, una cuenta sin `metadata.role` se resolvía como administrador. Esa
 * omisión escalaba privilegios: cualquier cuenta que perdiera su rol quedaba
 * ascendida en silencio. `require-role.ts` deriva el rol de la sesión con un
 * solo `normalizeRole(stored)`, así que el contrato de esta función ES el
 * control de acceso — si vuelve a devolver un rol para una entrada vacía, el
 * agujero vuelve sin que nada más cambie.
 *
 *   npm run test:unit
 */

describe("normalizeRole: ausencia de rol", () => {
  // Todo lo que `user.metadata.role` puede valer cuando no se asignó nunca.
  const vacios = [null, undefined, "", "   "]

  it.each(vacios)("no concede ningún rol para %p", (valor) => {
    expect(normalizeRole(valor)).toBeNull()
  })

  it("tampoco concede rol a un valor que no se reconoce", () => {
    expect(normalizeRole("superusuario")).toBeNull()
    expect(normalizeRole("root")).toBeNull()
    expect(normalizeRole(42)).toBeNull()
  })

  it("NUNCA devuelve admin por omisión", () => {
    for (const valor of [...vacios, "desconocido", {}, []]) {
      expect(normalizeRole(valor)).not.toBe(ROLES.ADMIN)
    }
  })
})

describe("normalizeRole: vocabulario canónico", () => {
  it.each(ALL_ROLES)("reconoce el rol canónico %s", (rol) => {
    expect(normalizeRole(rol)).toBe(rol)
  })

  it("tolera mayúsculas y espacios sobrantes", () => {
    expect(normalizeRole("  CASHIER ")).toBe(ROLES.CASHIER)
  })

  // El bug que originó la unificación: la UI creaba "enfermero" mientras el
  // POS comparaba contra "nurse", así que la enfermera nunca entraba.
  it.each([
    ["cajero", ROLES.CASHIER],
    ["recepcion", ROLES.CASHIER],
    ["enfermero", ROLES.NURSE],
    ["enfermera", ROLES.NURSE],
    ["médico", ROLES.DOCTOR],
    ["farmacéutico", ROLES.PHARMACY],
    ["administrador", ROLES.ADMIN],
  ])("traduce el alias heredado %s -> %s", (alias, esperado) => {
    expect(normalizeRole(alias)).toBe(esperado)
  })
})

describe("MIGRATION_ROLE_FOR_UNMARKED_USERS", () => {
  /**
   * Esta constante existe SÓLO para que `migrate-roles.ts` sepa qué estampar
   * en las cuentas heredadas. Si alguien la vuelve a usar como respaldo en
   * runtime, el agujero regresa. La prueba deja escrita la intención; el
   * candado real es que `require-role.ts` ya no la importa.
   */
  it("sigue siendo admin, que es lo que la migración debe estampar", () => {
    expect(MIGRATION_ROLE_FOR_UNMARKED_USERS).toBe(ROLES.ADMIN)
  })

  it("no la usa nadie del camino de autorización", () => {
    const requireRole = require("fs").readFileSync(
      require("path").join(__dirname, "..", "require-role.ts"),
      "utf8"
    )
    expect(requireRole).not.toContain("MIGRATION_ROLE_FOR_UNMARKED_USERS")
    expect(requireRole).not.toContain("FALLBACK_ROLE_FOR_LEGACY_USERS")
  })
})

describe("isMedicalOrderCreatorRole", () => {
  // Espejo del check-constraint de `medical_order.creator_role`.
  it("acepta sólo los tres roles que la base admite", () => {
    expect(isMedicalOrderCreatorRole(ROLES.DOCTOR)).toBe(true)
    expect(isMedicalOrderCreatorRole(ROLES.NURSE)).toBe(true)
    expect(isMedicalOrderCreatorRole(ROLES.ADMIN)).toBe(true)

    expect(isMedicalOrderCreatorRole(ROLES.CASHIER)).toBe(false)
    expect(isMedicalOrderCreatorRole(ROLES.PHARMACY)).toBe(false)
    expect(isMedicalOrderCreatorRole(ROLES.AUDITOR)).toBe(false)
    expect(isMedicalOrderCreatorRole(null)).toBe(false)
  })
})
