import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ROLE_LABELS, normalizeRole } from "../lib/roles"
import { aIdentificador } from "../lib/usuarios"
import {
  TEST_PASSWORD,
  TEST_USERS,
  TestUserSpec,
  assertEveryRoleCovered,
  assertNotProduction,
} from "../lib/test-users"
import { CLAVE_NUMERO_EMPLEADO, numeroDeEmpleado } from "../lib/personal"
import { CLAVE_PERFIL_PROFESIONAL, perfilCompleto, perfilDe } from "../lib/perfil-profesional"

/**
 * Siembra un usuario por cada rol canónico, para pruebas.
 *
 *   npm run seed
 *   npx medusa exec ./src/scripts/seed-test-users.ts
 *
 * Es IDEMPOTENTE: se puede correr las veces que haga falta.
 *   · Si la cuenta no existe -> la crea.
 *   · Si existe con el rol correcto -> la deja intacta.
 *   · Si existe con otro rol -> corrige el rol (sin tocar el resto del metadata).
 * No borra nada. Para empezar de cero usa `scripts/reset-users.ts`.
 *
 * Sustituyó a seed-auditor.ts / seed-enfermero.ts / seed_doctor.ts (eliminados),
 * que creaban cuentas sueltas en @pos.com y registraban por HTTP contra
 * localhost:9000, obligando a tener el servidor arriba. Aquí se usa el módulo
 * de auth directamente, así que corre sin servidor.
 */
export default async function seedTestUsers({ container }: ExecArgs) {
  assertNotProduction("seed-test-users")
  assertEveryRoleCovered()

  const userModuleService = container.resolve(Modules.USER)
  const authModuleService = container.resolve(Modules.AUTH)

  const created: TestUserSpec[] = []
  const repaired: { spec: TestUserSpec; from: string }[] = []
  const untouched: TestUserSpec[] = []

  console.log("")
  console.log("=== SEED DE USUARIOS DE PRUEBA ===")
  console.log("")

  for (const spec of TEST_USERS) {
    const [existing] = await userModuleService.listUsers({
      email: aIdentificador(spec.username),
    })

    if (existing) {
      const storedRole = (existing.metadata as any)?.role
      const currentRole = normalizeRole(storedRole)
      // Se reporta el valor CRUDO de la BD, no el normalizado: si alguien está
      // depurando quiere ver lo que realmente hay guardado.
      const storedLabel = storedRole ? `"${storedRole}"` : "sin rol"

      const numeroActual = numeroDeEmpleado(existing)

      const faltaPerfil = !!spec.perfil_profesional && !perfilCompleto(perfilDe(existing))

      if (currentRole === spec.role && numeroActual === spec.employee_number && !faltaPerfil) {
        untouched.push(spec)
        console.log(`   = ${spec.username.padEnd(16)} ya existe (${spec.role}, Nº ${spec.employee_number})`)
        continue
      }

      // Corrige sólo el rol y el número, conservando el resto del metadata.
      await userModuleService.updateUsers([
        {
          id: existing.id,
          metadata: {
            ...((existing.metadata as Record<string, unknown>) ?? {}),
            role: spec.role,
            [CLAVE_NUMERO_EMPLEADO]: spec.employee_number,
            ...(faltaPerfil ? { [CLAVE_PERFIL_PROFESIONAL]: spec.perfil_profesional } : {}),
          },
        },
      ])

      repaired.push({ spec, from: storedLabel })
      console.log(
        `   ~ ${spec.username.padEnd(16)} corregido: rol ${storedLabel} -> ${spec.role}, ` +
          `Nº ${numeroActual ?? "sin número"} -> ${spec.employee_number}`
      )
      continue
    }

    // `register` delega el hashing al proveedor emailpass.
    const { success, error } = await authModuleService.register("emailpass", {
      body: { email: aIdentificador(spec.username), password: TEST_PASSWORD },
    } as any)

    if (!success) {
      throw new Error(`No se pudo registrar ${spec.username}: ${error}`)
    }

    const [authIdentity] = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: aIdentificador(spec.username) },
    })

    if (!authIdentity) {
      throw new Error(`Identidad de auth no encontrada para ${spec.username}`)
    }

    const [user] = await userModuleService.createUsers([
      {
        email: aIdentificador(spec.username),
        first_name: spec.first_name,
        last_name: "Pruebas",
        metadata: {
          role: spec.role,
          [CLAVE_NUMERO_EMPLEADO]: spec.employee_number,
          ...(spec.perfil_profesional ? { [CLAVE_PERFIL_PROFESIONAL]: spec.perfil_profesional } : {}),
        },
      },
    ])

    await authModuleService.updateAuthIdentities([
      { id: authIdentity.id, app_metadata: { user_id: user.id } },
    ])

    created.push(spec)
    console.log(`   + ${spec.username.padEnd(16)} creado (${spec.role}, Nº ${spec.employee_number})`)
  }

  console.log("")
  console.log(
    `Resumen: ${created.length} creado(s), ${repaired.length} corregido(s), ${untouched.length} sin cambios.`
  )

  console.log("")
  console.log("=== CREDENCIALES DE PRUEBA ===")
  console.log(`Contraseña (todas las cuentas): ${TEST_PASSWORD}`)
  console.log("")
  for (const spec of TEST_USERS) {
    console.log(`   ${spec.username.padEnd(16)} ${ROLE_LABELS[spec.role]} · Nº ${spec.employee_number}`)
    console.log(`   ${" ".repeat(16)} ${spec.purpose}`)
  }
  console.log("")
  console.log("Cuentas de prueba locales. No sembrar en un entorno con datos reales.")
}
