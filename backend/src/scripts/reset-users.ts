import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { ROLE_LABELS, Role } from "../lib/roles"
import {
  TEST_PASSWORD,
  TEST_USERS,
  assertEveryRoleCovered,
  assertNotProduction,
} from "../lib/test-users"

/**
 * ⚠️ SCRIPT DESTRUCTIVO — borra TODOS los usuarios del sistema.
 *
 *   npx medusa exec ./src/scripts/reset-users.ts          (simulación)
 *   npx medusa exec ./src/scripts/reset-users.ts confirm  (ejecuta)
 *
 * Deja exactamente un usuario por rol canónico, para pruebas.
 *
 * Antes de borrar guarda un respaldo JSON (usuarios + identidades de auth) en
 * `.backups/`, que está fuera del control de versiones. El borrado de usuarios
 * es definitivo: los registros históricos (órdenes médicas, cortes de caja,
 * bitácora) guardan el id del usuario como texto plano, así que seguirán
 * apuntando a ids que ya no existen. En una base de producción esto NO se corre.
 */

export default async function resetUsers({ container, args }: ExecArgs) {
  const execArgs = args ?? []
  const confirmed = execArgs.includes("confirm")

  const userModuleService = container.resolve(Modules.USER)
  const authModuleService = container.resolve(Modules.AUTH)

  assertNotProduction("reset-users")
  assertEveryRoleCovered()

  const existing = await userModuleService.listUsers({}, { take: 1000 })

  console.log("")
  console.log("=== RESET DE USUARIOS ===")
  console.log(
    `Modo: ${confirmed ? "EJECUTAR (destructivo)" : "SIMULACIÓN (sin cambios)"}`
  )
  console.log("")
  console.log(`── Se ELIMINARÁN ${existing.length} usuario(s):`)
  existing.forEach((u) =>
    console.log(`   · ${u.email} (${(u.metadata as any)?.role ?? "sin rol"})`)
  )
  console.log("")
  console.log(`── Se CREARÁN ${TEST_USERS.length} usuario(s):`)
  TEST_USERS.forEach((u) =>
    console.log(`   · ${u.email.padEnd(24)} -> ${u.role}`)
  )
  console.log("")

  if (!confirmed) {
    console.log("Simulación. Para ejecutar:")
    console.log("   npx medusa exec ./src/scripts/reset-users.ts confirm")
    return
  }

  // ── Respaldo antes de destruir ────────────────────────────────────────────
  const backupDir = path.resolve(process.cwd(), ".backups")
  fs.mkdirSync(backupDir, { recursive: true })

  const oldEmails = existing.map((u) => u.email).filter(Boolean)

  // `entity_id` está tipado como string, no acepta arreglo: se consulta por
  // email y se acumula.
  const oldAuthIdentities: any[] = []
  for (const email of oldEmails) {
    const found = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: email },
    })
    oldAuthIdentities.push(...found)
  }

  const backupPath = path.join(backupDir, `users-backup-${Date.now()}.json`)
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ users: existing, authIdentities: oldAuthIdentities }, null, 2),
    "utf8"
  )
  console.log(`Respaldo escrito en: ${backupPath}`)
  console.log("")

  // ── Borrado ───────────────────────────────────────────────────────────────
  if (existing.length) {
    await userModuleService.deleteUsers(existing.map((u) => u.id))
    console.log(`   ✓ ${existing.length} usuario(s) eliminado(s)`)
  }

  if (oldAuthIdentities.length) {
    // Hay que liberar también las identidades de auth: si sólo se borra el
    // usuario, el email queda ocupado y el alta posterior falla.
    await authModuleService.deleteAuthIdentities(
      oldAuthIdentities.map((a: any) => a.id)
    )
    console.log(`   ✓ ${oldAuthIdentities.length} identidad(es) de auth liberada(s)`)
  }

  console.log("")

  // ── Alta ──────────────────────────────────────────────────────────────────
  const created: { email: string; role: Role; label: string }[] = []

  for (const spec of TEST_USERS) {
    // `register` delega el hashing al proveedor emailpass; nunca se escriben
    // hashes a mano.
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

    created.push({ email: spec.email, role: spec.role, label: ROLE_LABELS[spec.role] })
    console.log(`   ✓ ${spec.email.padEnd(24)} ${spec.role}`)
  }

  console.log("")
  console.log("=== CREDENCIALES DE PRUEBA ===")
  console.log(`Contraseña (todas las cuentas): ${TEST_PASSWORD}`)
  console.log("")
  created.forEach((u) =>
    console.log(`   ${u.email.padEnd(24)} ${u.label}`)
  )
  console.log("")
  console.log("Cuentas de prueba locales. No usar este script ni estas")
  console.log("credenciales en un entorno con datos reales.")
}
