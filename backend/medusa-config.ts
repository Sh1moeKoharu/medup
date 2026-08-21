import { defineConfig, loadEnv } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const isProduction = process.env.NODE_ENV === 'production'
const redisUrl = process.env.REDIS_URL

/**
 * ── SECRETOS ────────────────────────────────────────────────────────────────
 * Antes caían a la cadena "supersecret". Un JWT_SECRET conocido permite forjar
 * sesiones de cualquier usuario, incluido el administrador. En producción se
 * falla al arrancar en lugar de arrancar inseguro.
 */
const jwtSecret = process.env.JWT_SECRET
const cookieSecret = process.env.COOKIE_SECRET

if (isProduction) {
  const missing: string[] = []
  if (!jwtSecret || jwtSecret === 'supersecret') missing.push('JWT_SECRET')
  if (!cookieSecret || cookieSecret === 'supersecret') missing.push('COOKIE_SECRET')

  if (missing.length) {
    throw new Error(
      `[CONFIG] ${missing.join(' y ')} deben definirse con un valor propio en producción. ` +
        `Genera cada uno con: openssl rand -base64 48`
    )
  }

  if (!redisUrl) {
    throw new Error(
      '[CONFIG] REDIS_URL es obligatorio en producción. Sin él, Medusa usa un ' +
        'bus de eventos en memoria y un candado local: los jobs programados y ' +
        'los workflows no sobreviven a un reinicio ni funcionan con más de una ' +
        'instancia. Instala Redis y define REDIS_URL.'
    )
  }
}

/**
 * ── COOKIES DE SESIÓN SOBRE HTTP ────────────────────────────────────────────
 *
 * Con NODE_ENV=production (o staging) Medusa marca la cookie de sesión como
 * `secure: true` y `sameSite: "none"` — ver express-loader.js del framework.
 * El navegador RECHAZA guardar cookies `Secure` servidas por HTTP, así que el
 * admin acepta el login y acto seguido rebota a la pantalla de inicio, sin
 * mostrar ningún error.
 *
 * ALLOW_INSECURE_COOKIES=1 desactiva ese marcado. Existe para servidores de
 * ENSAYO que corren en modo producción sin certificado todavía.
 *
 * ⚠️ NUNCA activarla en un servidor con datos reales: la cookie de sesión
 * viajaría en claro y cualquiera en la red podría secuestrar la sesión de un
 * administrador. La solución correcta es poner TLS delante, no esta bandera.
 */
const allowInsecureCookies = process.env.ALLOW_INSECURE_COOKIES === '1'

if (allowInsecureCookies) {
  console.warn(
    '⚠️  [CONFIG] ALLOW_INSECURE_COOKIES=1 — la cookie de sesión NO se marcará ' +
      'como Secure. Válido sólo para ensayo sin TLS. No usar con datos reales.'
  )
}

/**
 * ── INFRAESTRUCTURA ─────────────────────────────────────────────────────────
 * Estos módulos NO estaban declarados. `.env.template` traía REDIS_URL pero
 * nadie la leía, así que en cada arranque Medusa avisaba:
 *
 *   "redisUrl not found. A fake redis instance will be used."
 *   "Local Event Bus installed. This is not recommended for production."
 *
 * Se declaran de forma condicional para que el entorno local siga funcionando
 * sin Redis (cae a los módulos en memoria por omisión), mientras que producción
 * lo exige de forma explícita arriba. Nada de degradación silenciosa.
 */
const infrastructureModules = redisUrl
  ? [
      {
        resolve: '@medusajs/medusa/event-bus-redis',
        options: { redisUrl },
      },
      {
        resolve: '@medusajs/medusa/cache-redis',
        options: { redisUrl },
      },
      {
        resolve: '@medusajs/medusa/workflow-engine-redis',
        // OJO: este módulo NO acepta `redisUrl` plano como los otros tres.
        // Su loader hace `const { ... } = options?.redis`, así que la URL va
        // anidada. Con la forma plana revienta al arrancar con
        // "Cannot destructure property 'url' of '(intermediate value)'".
        options: { redis: { redisUrl } },
      },
      {
        resolve: '@medusajs/medusa/locking',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/locking-redis',
              id: 'locking-redis',
              is_default: true,
              options: { redisUrl },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    /**
     * shared  = una sola instancia atiende API y ejecuta los jobs programados.
     * server  = sólo API.  worker = sólo jobs y workflows.
     *
     * ⚠️ Si algún día se separa en server + worker, DEBE existir una instancia
     * en modo `worker`: los jobs `check-expirations` y `block-expired-batches`
     * sólo corren ahí. Una instalación con puro `server` deja de bloquear lotes
     * caducados sin emitir ningún error.
     */
    workerMode:
      (process.env.MEDUSA_WORKER_MODE as 'shared' | 'server' | 'worker') ??
      'shared',
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: jwtSecret || 'supersecret',
      cookieSecret: cookieSecret || 'supersecret',
    },
    // Se aplica encima de los valores que calcula el framework.
    ...(allowInsecureCookies
      ? { cookieOptions: { secure: false, sameSite: 'lax' as const } }
      : {}),
  },
  admin: {
    disable: false,
  },
  modules: [
    ...infrastructureModules,
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              api_key: process.env.RESEND_API_KEY,
              from: process.env.NOTIFICATION_FROM || "Agilo POS <onboarding@resend.dev>",
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/medical-customer",
      key: "medical_customer",
    },
    {
      resolve: "./src/modules/medical-inventory",
      key: "medical_inventory",
    },
    {
      resolve: "./src/modules/cash-session",
      key: "cash_session",
    },
    {
      resolve: "./src/modules/medical-orders",
      key: "medical_orders",
    },
    {
      resolve: "./src/modules/audit-logs",
      key: "audit_logs",
    },
    {
      resolve: "./src/modules/b2b-agreements",
      key: "b2b_agreements",
    },
    {
      resolve: "./src/modules/inventory-movements",
      key: "inventory_movements",
    },
  ]
})
