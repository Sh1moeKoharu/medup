import { defineConfig, loadEnv } from '@medusajs/framework/utils'
import * as nodePath from 'path'
import { HIDDEN_MENU_ROUTES } from './src/lib/menu-policy'

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

/**
 * ── ARCHIVOS SUBIDOS ────────────────────────────────────────────────────────
 * Sin declarar el módulo, el proveedor local escribe en `<cwd>/static`, es
 * decir dentro de `.medusa/server`, que `medusa build` borra en cada
 * compilación — y ahí viven las imágenes de producto que la base referencia
 * por URL.
 *
 * Con ALTUS_DATA_DIR definida se apunta fuera del árbol de build. Sin ella se
 * conserva exactamente el valor por omisión anterior.
 *
 * ⚠️ No basta con esto: Medusa sirve /static desde una ruta CODIFICADA en el
 * framework. Ver deploy/link-persistent-dirs.sh.
 */
const dataDir = process.env.ALTUS_DATA_DIR?.trim()
const uploadDir = dataDir
  ? nodePath.join(nodePath.resolve(dataDir), 'static')
  : nodePath.join(process.cwd(), 'static')

const backendUrl = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000'

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
    /**
     * Idioma inicial del panel de administración.
     *
     * EL PROBLEMA: el admin detecta el idioma con react-i18next en el orden
     * `cookie -> localStorage -> header`, con respaldo en inglés. Es decir que
     * depende de la configuración del navegador de cada usuario. Para un
     * cliente nacional eso significa que unos ven el menú en español y otros en
     * inglés, sin razón aparente.
     *
     * `AdminOptions` no expone ninguna opción de idioma (sólo disable, path,
     * backendUrl, storefrontUrl y este hook `vite`), y tampoco sirve un
     * middleware: el admin se monta en `promiseAll` ANTES que los middlewares
     * del proyecto, así que una ruta nuestra sobre /app nunca se ejecutaría.
     *
     * SOLUCIÓN: se inyecta un script en el index.html del admin durante el
     * build. Corre antes que la aplicación y siembra la preferencia de idioma
     * que i18next leerá después.
     *
     * Respeta al usuario: sólo escribe si NO hay preferencia previa, así que
     * quien cambie el idioma desde Ajustes conserva su elección.
     */
    vite: (config: any) => {
      const lang = process.env.ADMIN_DEFAULT_LANGUAGE || 'es'

      config.plugins = config.plugins || []
      config.plugins.push({
        name: 'altus-default-admin-language',
        transformIndexHtml(html: string) {
          // Vite invoca este hook más de una vez, así que se marca el script
          // para no duplicarlo en el HTML final.
          const marker = 'data-altus-lang'
          if (html.includes(marker)) {
            return html
          }

          const langScript = `<script ${marker}>(function(){try{` +
            `var hasCookie=document.cookie.indexOf('lng=')!==-1;` +
            `var hasStorage=window.localStorage&&window.localStorage.getItem('lng');` +
            `if(!hasCookie&&!hasStorage){` +
            `document.cookie='lng=${lang};path=/;max-age=31536000';` +
            `if(window.localStorage){window.localStorage.setItem('lng','${lang}');}` +
            `}}catch(e){}})();</script>`

          /**
           * Oculta del menú lo que cada rol no puede usar.
           *
           * La política se serializa desde src/lib/menu-policy.ts, así que sigue
           * habiendo un solo archivo TypeScript como fuente de verdad.
           *
           * Se inyecta aquí y no en un widget porque los widgets sólo se montan
           * en zonas concretas — listas de productos, pedidos y clientes —, que
           * son justamente las pantallas ocultas para el área médica: el widget
           * nunca llegaría a ejecutarse para un médico.
           *
           * ⚠️ Es usabilidad, no seguridad: se esquiva con F12. El control real
           * son los guards de src/api/middlewares.ts.
           */
          const policy = JSON.stringify(HIDDEN_MENU_ROUTES)
          const menuScript = `<script data-altus-menu>(function(){try{` +
            `var P=${policy};` +
            `fetch('/admin/users/me',{credentials:'include'})` +
            `.then(function(r){return r.ok?r.json():null})` +
            `.then(function(d){` +
            `var role=d&&d.user&&d.user.metadata?d.user.metadata.role:null;` +
            `var hide=role&&P[role]?P[role]:[];` +
            `if(!hide.length)return;` +
            `var sel=hide.map(function(h){return 'a[href^="'+h+'"]'}).join(',');` +
            `var s=document.createElement('style');` +
            `s.setAttribute('data-altus-menu','');` +
            `s.innerHTML=sel+'{display:none !important}';` +
            `document.head.appendChild(s);` +
            `}).catch(function(){});` +
            `}catch(e){}})();</script>`

          return html.replace('</head>', `${langScript}${menuScript}</head>`)
        },
      })

      return config
    },
  },
  modules: [
    ...infrastructureModules,
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: uploadDir,
              backend_url: `${backendUrl}/static`,
            },
          },
        ],
      },
    },
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
