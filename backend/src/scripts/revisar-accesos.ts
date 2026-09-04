import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ROLES, ROLE_LABELS, Role, normalizeRole } from "../lib/roles"
import { HIDDEN_MENU_ROUTES } from "../lib/menu-policy"

/**
 * Quién es quién: lista cada cuenta con el rol que tiene GUARDADO.
 *
 *   npx medusa exec ./src/scripts/revisar-accesos.ts
 *
 * No escribe nada. Sólo lee y explica.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * Cuando alguien reporta "este usuario entra donde no debe", hay dos causas
 * posibles y se confunden con facilidad:
 *
 *   1. El CÓDIGO decide mal.  → se arregla en la tabla de acceso.
 *   2. La CUENTA tiene guardado un rol distinto del que suponemos.
 *      → el código está bien; lo que hay que corregir es el dato.
 *
 * La segunda es la más frecuente y la más difícil de ver, porque el nombre de
 * la cuenta ("director", "cajero1") sugiere un rol que nadie ha comprobado que
 * esté escrito en `metadata.role`. Una cuenta llamada "director" con rol
 * `admin` guardado entra al punto de venta, y el código está haciendo
 * exactamente lo que se le pidió.
 *
 * Esto imprime el dato, para dejar de suponer.
 *
 * ── LA TABLA DEL POS ESTÁ DUPLICADA AQUÍ ────────────────────────────────────
 * El punto de venta es un paquete npm aparte y no se puede importar desde el
 * backend. La fuente de verdad es `frontend/constants/acceso.ts`; lo de abajo
 * es una copia para poder explicar el destino en el informe. Si cambia allí,
 * cambia aquí.
 */

/** Espejo de `INICIO_POR_ROL` en frontend/constants/acceso.ts. */
const INTERFAZ_POS: Record<Role, string> = {
  [ROLES.ADMIN]: "Caja (punto de venta)",
  [ROLES.CASHIER]: "Caja (punto de venta)",
  [ROLES.PHARMACY]: "Caja (punto de venta)",
  [ROLES.DOCTOR]: "Médico",
  [ROLES.NURSE]: "Enfermería",
  [ROLES.AUDITOR]: "NINGUNA — pantalla 'sin POS'",
}

/** Espejo de `ROLES_CAJA`. Los únicos que pueden cobrar. */
const PUEDE_COBRAR: Role[] = [ROLES.ADMIN, ROLES.CASHIER, ROLES.PHARMACY]

export default async function revisarAccesos({ container }: ExecArgs) {
  const userService = container.resolve(Modules.USER)
  const users = await userService.listUsers({}, { take: 1000 })

  const linea = "─".repeat(78)
  console.log("")
  console.log("=== ACCESOS POR USUARIO ===")
  console.log(`${users.length} cuenta(s)`)
  console.log("")

  const problemas: string[] = []
  const porRol = new Map<string, number>()

  // Los sospechosos primero: sin rol, rol ilegible, o con acceso a caja.
  const orden = [...users].sort((a, b) => {
    const ra = normalizeRole((a.metadata as any)?.role)
    const rb = normalizeRole((b.metadata as any)?.role)
    const peso = (r: Role | null) => (r === null ? 0 : PUEDE_COBRAR.includes(r) ? 1 : 2)
    return peso(ra) - peso(rb) || (a.email ?? "").localeCompare(b.email ?? "")
  })

  for (const u of orden) {
    const crudo = (u.metadata as any)?.role
    const rol = normalizeRole(crudo)
    const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ") || "(sin nombre)"

    console.log(linea)
    console.log(`  ${u.email}`)
    console.log(`  Nombre        : ${nombre}`)

    if (!rol) {
      const guardado =
        crudo === undefined || crudo === null || crudo === ""
          ? "(vacío)"
          : `"${String(crudo)}"`
      console.log(`  Rol guardado  : ${guardado}  <-- NO SE ENTIENDE`)
      console.log(`  Punto de venta: NINGUNA — pantalla 'sin POS'`)
      console.log(`  Panel         : entra, pero el servidor le niega escribir`)
      console.log("")
      console.log(`  Esta cuenta no puede trabajar. Asígnale un rol en`)
      console.log(`  Personal, o corre migrate-roles.ts si es una cuenta antigua.`)
      problemas.push(`${u.email}: rol ${guardado} — la cuenta no puede trabajar`)
      porRol.set("(sin rol)", (porRol.get("(sin rol)") ?? 0) + 1)
      continue
    }

    porRol.set(rol, (porRol.get(rol) ?? 0) + 1)

    const cobra = PUEDE_COBRAR.includes(rol)
    const ocultas = HIDDEN_MENU_ROUTES[rol] ?? []

    console.log(`  Rol guardado  : "${String(crudo)}" -> ${rol}  (${ROLE_LABELS[rol]})`)
    console.log(`  Punto de venta: ${INTERFAZ_POS[rol]}`)
    console.log(`  ¿Puede cobrar?: ${cobra ? "SÍ" : "no"}`)
    console.log(
      `  Panel         : ${ocultas.length ? `${ocultas.length} sección(es) oculta(s)` : "todo visible"}`
    )

    if (rol === ROLES.ADMIN) {
      console.log("")
      console.log(`  ADMINISTRADOR: acceso total, incluida la caja.`)
      console.log(`  Si esta cuenta es de dirección o auditoría, el rol correcto`)
      console.log(`  es "${ROLES.AUDITOR}" — sólo lectura, sin punto de venta.`)
      problemas.push(`${u.email}: es administrador (acceso total). Confirma que debe serlo.`)
    }
  }

  console.log(linea)
  console.log("")
  console.log("RESUMEN")
  for (const [rol, n] of [...porRol.entries()].sort()) {
    const etiqueta = ROLE_LABELS[rol as Role] ?? rol
    console.log(`   ${String(n).padStart(3)}  ${etiqueta}`)
  }

  console.log("")
  if (problemas.length) {
    console.log("REVISAR")
    for (const p of problemas) console.log(`   · ${p}`)
  } else {
    console.log("Ninguna cuenta con rol vacío, ilegible ni administrador de más.")
  }

  console.log("")
  console.log("Para cambiar el rol de alguien: panel -> Personal.")
  console.log("")
}
