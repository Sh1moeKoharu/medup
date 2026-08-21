import { ALL_ROLES, Role, ROLES } from "./roles"

/**
 * Catálogo de cuentas de prueba del SIGH — FUENTE ÚNICA.
 *
 * Lo consumen `scripts/seed-test-users.ts` (idempotente) y
 * `scripts/reset-users.ts` (destructivo). Vive en un solo archivo justamente
 * para que no se repita el problema que originó todo este trabajo: dos lugares
 * con listas de roles que se desincronizan.
 *
 * ⚠️ Datos de prueba. Estas credenciales son públicas por diseño: sirven para
 * levantar un entorno local. Nunca deben existir en una base con datos reales.
 */

/** Contraseña compartida por todas las cuentas de prueba. */
export const TEST_PASSWORD = "Sigh#Test2026"

/**
 * Impide sembrar cuentas de prueba en un entorno productivo.
 *
 * `TEST_PASSWORD` es pública por diseño: está en este archivo, en el repo y en
 * la documentación del equipo. Sembrar estas cuentas en producción equivale a
 * publicar seis credenciales válidas, una de ellas de administrador.
 *
 * Se puede forzar con SIGH_ALLOW_TEST_SEED=1, para el caso legítimo de un
 * entorno de ensayo que corre con NODE_ENV=production a propósito.
 */
export function assertNotProduction(scriptName: string): void {
  const isProduction = process.env.NODE_ENV === "production"
  const override = process.env.SIGH_ALLOW_TEST_SEED === "1"

  if (isProduction && !override) {
    throw new Error(
      `[${scriptName}] BLOQUEADO: NODE_ENV=production.\n\n` +
        `Este script crea cuentas con una contraseña pública ("${TEST_PASSWORD}"), ` +
        `incluida una de administrador. Nunca debe correr sobre datos reales.\n\n` +
        `Para crear el administrador en producción usa:\n` +
        `   npx medusa user -e admin@tudominio.mx -p '<contraseña fuerte>'\n\n` +
        `Si esto es un entorno de ensayo y sabes lo que haces:\n` +
        `   SIGH_ALLOW_TEST_SEED=1 npm run seed`
    )
  }

  if (isProduction && override) {
    console.warn(
      `⚠️  [${scriptName}] NODE_ENV=production con SIGH_ALLOW_TEST_SEED=1. ` +
        `Se van a crear cuentas con contraseña PÚBLICA. ` +
        `Asegúrate de que esta base NO contiene datos reales de pacientes.`
    )
  }
}

export type TestUserSpec = {
  role: Role
  email: string
  first_name: string
  /** Qué se espera poder probar con esta cuenta. */
  purpose: string
}

/**
 * El dominio `.test` está reservado por RFC 2606 para pruebas: no resuelve en
 * DNS, así que ningún correo puede escaparse a un buzón real por accidente.
 */
export const TEST_USERS: TestUserSpec[] = [
  {
    role: ROLES.ADMIN,
    email: "admin@sigh.test",
    first_name: "Admin",
    purpose: "Acceso total: configuración, personal, autorizaciones.",
  },
  {
    role: ROLES.PHARMACY,
    email: "farmacia@sigh.test",
    first_name: "Farmacia",
    purpose: "Alta de lotes, entradas y surtido de órdenes médicas.",
  },
  {
    role: ROLES.CASHIER,
    email: "caja@sigh.test",
    first_name: "Caja",
    purpose: "Cobro en el POS y corte de caja por turno.",
  },
  {
    role: ROLES.DOCTOR,
    email: "medico@sigh.test",
    first_name: "Médico",
    purpose: "Emitir órdenes médicas. No debe ver precios de compra.",
  },
  {
    role: ROLES.NURSE,
    email: "enfermeria@sigh.test",
    first_name: "Enfermería",
    purpose: "Emitir órdenes médicas. No debe ver precios de compra.",
  },
  {
    role: ROLES.AUDITOR,
    email: "auditoria@sigh.test",
    first_name: "Auditoría",
    purpose: "Solo lectura: reportes y bitácora. Toda escritura debe dar 403.",
  },
]

/**
 * Verifica que exista una cuenta por cada rol canónico.
 *
 * Si mañana se agrega un rol a `roles.ts` y nadie actualiza este catálogo, ese
 * rol quedaría sin forma de probarse. Esto lo convierte en un fallo ruidoso en
 * vez de un hueco silencioso.
 */
export function assertEveryRoleCovered(): void {
  const covered = TEST_USERS.map((u) => u.role)

  const missing = ALL_ROLES.filter((r) => !covered.includes(r))
  if (missing.length) {
    throw new Error(
      `El catálogo de usuarios de prueba no cubre los roles: ${missing.join(", ")}. ` +
        `Agrégalos en src/lib/test-users.ts.`
    )
  }

  const duplicates = covered.filter((r, i) => covered.indexOf(r) !== i)
  if (duplicates.length) {
    throw new Error(
      `Hay más de una cuenta de prueba para: ${[...new Set(duplicates)].join(", ")}.`
    )
  }
}
