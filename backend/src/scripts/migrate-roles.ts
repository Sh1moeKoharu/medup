import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  ALL_ROLES,
  FALLBACK_ROLE_FOR_LEGACY_USERS,
  Role,
  normalizeRole,
} from "../lib/roles"

/**
 * Migra `user.metadata.role` al vocabulario canónico de `lib/roles.ts`.
 *
 *   npx medusa exec ./src/scripts/migrate-roles.ts        (simulación)
 *   npx medusa exec ./src/scripts/migrate-roles.ts apply  (escribe)
 *
 * Qué hace:
 *   · "cajero"    -> "cashier"
 *   · "enfermero" -> "nurse"
 *   · usuarios sin rol (el admin de arranque creado por CLI) -> "admin"
 *     explícito, para poder endurecer después el fallback implícito.
 *   · reporta los roles desconocidos SIN tocarlos: requieren decisión humana.
 *
 * Corre en simulación por omisión. Nada se escribe sin `apply`.
 */
export default async function migrateRoles({ container, args }: ExecArgs) {
  // `medusa exec` declara `exec [file] [args..]` con yargs, así que un flag
  // con guiones se consume como opción y nunca llega aquí. Se acepta la forma
  // posicional (`apply`) y también `--apply` por si se invoca de otro modo.
  const execArgs = args ?? []
  const apply = execArgs.includes("apply") || execArgs.includes("--apply")
  const userModuleService = container.resolve(Modules.USER)

  const users = await userModuleService.listUsers({}, { take: 1000 })

  const planned: { id: string; email: string; from: string; to: Role }[] = []
  const unchanged: string[] = []
  const unknown: { id: string; email: string; value: string }[] = []

  for (const user of users) {
    const stored = (user.metadata as Record<string, unknown> | null)?.role
    const raw =
      stored === undefined || stored === null || stored === ""
        ? null
        : String(stored)

    // Usuario sin rol: se estampa el fallback de forma explícita.
    if (raw === null) {
      planned.push({
        id: user.id,
        email: user.email,
        from: "(sin rol)",
        to: FALLBACK_ROLE_FOR_LEGACY_USERS,
      })
      continue
    }

    const canonical = normalizeRole(raw)

    if (!canonical) {
      unknown.push({ id: user.id, email: user.email, value: raw })
      continue
    }

    if (canonical === raw) {
      unchanged.push(`${user.email} (${raw})`)
      continue
    }

    planned.push({ id: user.id, email: user.email, from: raw, to: canonical })
  }

  console.log("")
  console.log("=== MIGRACIÓN DE ROLES ===")
  console.log(`Modo: ${apply ? "APLICAR (escribe en BD)" : "SIMULACIÓN (sin cambios)"}`)
  console.log(`Vocabulario canónico: ${ALL_ROLES.join(", ")}`)
  console.log(`Usuarios encontrados: ${users.length}`)
  console.log("")

  if (unchanged.length) {
    console.log(`── Ya canónicos (${unchanged.length}):`)
    unchanged.forEach((u) => console.log(`   · ${u}`))
    console.log("")
  }

  if (planned.length) {
    console.log(`── Por migrar (${planned.length}):`)
    planned.forEach((p) =>
      console.log(`   · ${p.email}: "${p.from}" -> "${p.to}"`)
    )
    console.log("")
  }

  if (unknown.length) {
    console.log(`── ⚠️  ROL DESCONOCIDO (${unknown.length}) — NO se tocan:`)
    unknown.forEach((u) => console.log(`   · ${u.email}: "${u.value}"`))
    console.log("")
    console.log("   Asígnales un rol válido desde Ajustes > Personal, o añade")
    console.log("   el alias correspondiente en LEGACY_ROLE_ALIASES (lib/roles.ts).")
    console.log("")
  }

  if (!planned.length) {
    console.log("Nada que migrar.")
    return
  }

  if (!apply) {
    console.log("Simulación. Para aplicar:")
    console.log("   npx medusa exec ./src/scripts/migrate-roles.ts apply")
    return
  }

  for (const change of planned) {
    const [existing] = await userModuleService.listUsers({ id: change.id })
    await userModuleService.updateUsers([
      {
        id: change.id,
        metadata: {
          ...((existing?.metadata as Record<string, unknown>) ?? {}),
          role: change.to,
        },
      },
    ])
    console.log(`   ✓ ${change.email} -> ${change.to}`)
  }

  console.log("")
  console.log(`Listo. ${planned.length} usuario(s) migrado(s).`)
}
