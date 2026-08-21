import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { ROLE_LABELS, normalizeRole } from "../lib/roles"
import {
  TEST_PASSWORD,
  TEST_USERS,
  TestUserSpec,
  assertEveryRoleCovered,
  assertNotProduction,
} from "../lib/test-users"

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
    const [existing] = await userModuleService.listUsers({ email: spec.email })

    if (existing) {
      const storedRole = (existing.metadata as any)?.role
      const currentRole = normalizeRole(storedRole)
      // Se reporta el valor CRUDO de la BD, no el normalizado: si alguien está
      // depurando quiere ver lo que realmente hay guardado.
      const storedLabel = storedRole ? `"${storedRole}"` : "sin rol"

      if (currentRole === spec.role) {
        untouched.push(spec)
        console.log(`   = ${spec.email.padEnd(24)} ya existe (${spec.role})`)
        continue
      }

      // Corrige sólo la clave `role`, conservando el resto del metadata.
      await userModuleService.updateUsers([
        {
          id: existing.id,
          metadata: {
            ...((existing.metadata as Record<string, unknown>) ?? {}),
            role: spec.role,
          },
        },
      ])

      repaired.push({ spec, from: storedLabel })
      console.log(
        `   ~ ${spec.email.padEnd(24)} rol corregido: ${storedLabel} -> ${spec.role}`
      )
      continue
    }

    // `register` delega el hashing al proveedor emailpass.
    const { success, error } = await authModuleService.register("emailpass", {
      body: { email: spec.email, password: TEST_PASSWORD },
    } as any)

    if (!success) {
      throw new Error(`No se pudo registrar ${spec.email}: ${error}`)
    }

    const [authIdentity] = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: spec.email },
    })

    if (!authIdentity) {
      throw new Error(`Identidad de auth no encontrada para ${spec.email}`)
    }

    const [user] = await userModuleService.createUsers([
      {
        email: spec.email,
        first_name: spec.first_name,
        last_name: "Pruebas",
        metadata: { role: spec.role },
      },
    ])

    await authModuleService.updateAuthIdentities([
      { id: authIdentity.id, app_metadata: { user_id: user.id } },
    ])

    created.push(spec)
    console.log(`   + ${spec.email.padEnd(24)} creado (${spec.role})`)
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
    console.log(`   ${spec.email.padEnd(24)} ${ROLE_LABELS[spec.role]}`)
    console.log(`   ${" ".repeat(24)} ${spec.purpose}`)
  }
  console.log("")
  console.log("Cuentas de prueba locales. No sembrar en un entorno con datos reales.")
}
