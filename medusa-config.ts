import { defineConfig, loadEnv } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    disable: false,
  },
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              api_key: process.env.RESEND_API_KEY,
              from: "Agilo POS <onboarding@resend.dev>",
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
  ]
})
