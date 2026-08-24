import { ROLES, Role } from "./roles"

/**
 * QUIÉN PUEDE HACER QUÉ — tabla única de permisos de la API.
 *
 * Transcribe los perfiles del documento de propuesta (sección "Niveles de
 * Privilegios de Usuario"):
 *
 *   Administrador General  Acceso total. Configuración del sistema, gestión de
 *                          usuarios, autorización de ajustes.
 *   Farmacia               Gestión de inventario, surtido de órdenes, registro
 *                          de entradas. No elimina registros históricos.
 *   Caja / Recepción       Cobros, tickets, corte de caja. No modifica inventario.
 *   Médico                 Genera órdenes, consulta historial del paciente.
 *                          No ve precios de compra.
 *   Enfermería             Igual que Médico (el documento la lista como área).
 *   Auditor / Dirección    Reportes y bitácora. SOLO LECTURA.
 *
 * ── POR QUÉ UNA TABLA ───────────────────────────────────────────────────────
 * Antes las reglas cubrían sólo las rutas propias del proyecto. Medusa expone
 * además ~50 grupos de rutas nativas, y entre ellas su PROPIA gestión de
 * usuarios (`/admin/users`, `/admin/invites`): un cajero podía entrar a
 * Ajustes → Usuarios y dar de alta personal, aunque nuestra ruta `/admin/staff`
 * sí estuviera bloqueada. Cerrar huecos de uno en uno garantiza dejar otros
 * abiertos; una tabla se revisa de un vistazo contra el documento.
 *
 * ── CRITERIO ────────────────────────────────────────────────────────────────
 * ESCRITURA: lista explícita. Lo que no aparece aquí queda restringido a
 * Administrador — es la omisión segura, porque una ruta nueva de Medusa nace
 * cerrada en lugar de abierta.
 *
 * LECTURA: abierta a cualquier usuario autenticado salvo donde el dato es
 * sensible en sí mismo (usuarios, invitaciones, llaves de API, bitácora).
 * Restringir lecturas de más rompe pantallas legítimas sin ganar seguridad: al
 * auditor hay que dejarlo leer, y `denyReadOnlyMutations` ya le impide escribir.
 */

/** Todos menos el auditor, que nunca escribe. */
const OPERATIVOS: Role[] = [
  ROLES.ADMIN,
  ROLES.PHARMACY,
  ROLES.CASHIER,
  ROLES.DOCTOR,
  ROLES.NURSE,
]

export type ApiPolicy = {
  /** Prefijo de ruta. Cubre subrutas: "/admin/users" incluye "/admin/users/:id". */
  path: string
  /** Roles que pueden ESCRIBIR (POST/PUT/PATCH/DELETE). */
  write: Role[]
  /** Roles que pueden LEER. Si se omite, cualquiera autenticado. */
  read?: Role[]
  /** Rutas exactas exentas de la regla. */
  except?: string[]
  /** Para qué sirve, en términos del documento. */
  nota: string
}

export const API_POLICIES: ApiPolicy[] = [
  // ── GESTIÓN DE USUARIOS ───────────────────────────────────────────────────
  // "Gestión de usuarios" figura sólo bajo Administrador General.
  {
    path: "/admin/staff",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN, ROLES.AUDITOR],
    nota: "Alta y baja de personal (pantalla propia)",
  },

  // ── CREDENCIALES Y BITÁCORA ───────────────────────────────────────────────
  {
    path: "/admin/api-keys",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN],
    nota: "Llaves de API: son credenciales, ni el auditor las necesita",
  },
  {
    path: "/admin/audit-logs",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN, ROLES.AUDITOR],
    nota: "Bitácora — perfil Auditor / Dirección",
  },
  {
    path: "/admin/rbac",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN, ROLES.AUDITOR],
    nota: "Permisos del sistema",
  },

  // ── CONFIGURACIÓN DEL SISTEMA — sólo Administrador ────────────────────────
  ...[
    ["/admin/stores", "Datos de la tienda"],
    ["/admin/regions", "Regiones y moneda"],
    ["/admin/currencies", "Catálogo de monedas"],
    ["/admin/tax-rates", "Tasas de impuesto"],
    ["/admin/tax-regions", "Regiones fiscales"],
    ["/admin/tax-providers", "Proveedores de impuestos"],
    ["/admin/sales-channels", "Canales de venta"],
    ["/admin/stock-locations", "Ubicaciones de inventario"],
    ["/admin/shipping-options", "Opciones de envío"],
    ["/admin/shipping-profiles", "Perfiles de envío"],
    ["/admin/shipping-option-types", "Tipos de envío"],
    ["/admin/fulfillment-providers", "Proveedores de surtido"],
    ["/admin/fulfillment-sets", "Conjuntos de surtido"],
    ["/admin/plugins", "Complementos"],
    ["/admin/feature-flags", "Banderas de funcionalidad"],
    ["/admin/workflows-executions", "Ejecución de workflows"],
    ["/admin/locales", "Idiomas"],
    ["/admin/translations", "Traducciones"],
    ["/admin/views", "Vistas"],
    ["/admin/notifications", "Notificaciones"],
    ["/admin/price-preferences", "Preferencias de precio"],
  ].map(([path, nota]) => ({
    path,
    write: [ROLES.ADMIN],
    nota: `Configuración del sistema: ${nota}`,
  })),

  // ── PRECIOS Y PROMOCIONES — condición comercial, sólo Administrador ───────
  ...[
    ["/admin/price-lists", "Listas de precios"],
    ["/admin/promotions", "Promociones"],
    ["/admin/campaigns", "Campañas"],
    ["/admin/b2b-agreements", "Convenios empresariales"],
  ].map(([path, nota]) => ({
    path,
    write: [ROLES.ADMIN],
    nota: `Condición comercial: ${nota}`,
  })),

  // ── DEVOLUCIONES Y AJUSTES DE PEDIDO ──────────────────────────────────────
  // El documento exige "Autorización obligatoria de administrador" para
  // devoluciones y notas de crédito.
  ...[
    ["/admin/returns", "Devoluciones"],
    ["/admin/claims", "Reclamaciones"],
    ["/admin/exchanges", "Cambios"],
    ["/admin/order-edits", "Edición de pedidos"],
    ["/admin/order-changes", "Cambios de pedido"],
    ["/admin/refund-reasons", "Motivos de reembolso"],
    ["/admin/return-reasons", "Motivos de devolución"],
  ].map(([path, nota]) => ({
    path,
    write: [ROLES.ADMIN],
    nota: `Requiere autorización de administrador: ${nota}`,
  })),

  // ── CATÁLOGO E INVENTARIO — Farmacia ──────────────────────────────────────
  // "Gestión de inventario, registro de entradas". Caja NO modifica inventario.
  ...[
    ["/admin/products", "Catálogo de medicamentos"],
    ["/admin/product-variants", "Presentaciones"],
    ["/admin/product-categories", "Categorías"],
    ["/admin/product-tags", "Etiquetas"],
    ["/admin/product-types", "Tipos"],
    ["/admin/collections", "Colecciones"],
    ["/admin/inventory-items", "Existencias"],
    ["/admin/reservations", "Reservas de stock"],
    ["/admin/uploads", "Imágenes de producto"],
    ["/admin/medical-batches", "Lotes y caducidades"],
    ["/admin/inventory-counts", "Inventario físico"],
  ].map(([path, nota]) => ({
    path,
    write: [ROLES.ADMIN, ROLES.PHARMACY],
    nota: `Almacén: ${nota}`,
  })),

  // ── VENTAS Y COBRO — Caja / Recepción ─────────────────────────────────────
  // "Realizar cobros, emitir tickets, hacer corte de caja".
  ...[
    ["/admin/orders", "Pedidos"],
    ["/admin/draft-orders", "Pedidos en borrador (carrito del POS)"],
    ["/admin/payments", "Pagos"],
    ["/admin/payment-collections", "Cobros"],
    ["/admin/fulfillments", "Entregas"],
    ["/admin/cash-sessions", "Corte de caja por turno"],
  ].map(([path, nota]) => ({
    path,
    write: [ROLES.ADMIN, ROLES.CASHIER],
    nota: `Punto de cobro: ${nota}`,
  })),

  // ── PACIENTES ─────────────────────────────────────────────────────────────
  // Los atiende todo el personal operativo: el médico consulta su historial,
  // caja los da de alta al cobrar, farmacia los identifica al dispensar.
  ...[
    ["/admin/customers", "Pacientes"],
    ["/admin/customer-groups", "Grupos de pacientes"],
    ["/admin/medical-customers", "Expediente del paciente"],
  ].map(([path, nota]) => ({
    path,
    write: OPERATIVOS,
    nota: `Pacientes: ${nota}`,
  })),

  // ── ÓRDENES MÉDICAS ───────────────────────────────────────────────────────
  // Emitir es acto del área médica; surtir es acto de Farmacia. La separación
  // se refuerza con reglas específicas en middlewares.ts.
  {
    path: "/admin/medical-orders",
    write: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.PHARMACY],
    nota: "Órdenes médicas: emitir (médico) y surtir (farmacia)",
  },

  // ── REPORTES ──────────────────────────────────────────────────────────────
  {
    path: "/admin/inventory-movements",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN, ROLES.PHARMACY, ROLES.AUDITOR, ROLES.CASHIER],
    nota: "Kardex (solo lectura; se escribe desde el libro mayor)",
  },
  {
    path: "/admin/inventory-reports",
    write: [ROLES.ADMIN],
    read: [ROLES.ADMIN, ROLES.PHARMACY, ROLES.AUDITOR],
    nota: "Inventario valorizado: expone costos de compra",
  },
  {
    path: "/admin/expiring-inventory",
    write: [ROLES.ADMIN, ROLES.PHARMACY],
    nota: "Alertas de caducidad",
  },
]

/**
 * Verifica que la tabla no tenga prefijos que se solapen de forma ambigua.
 * Dos entradas donde una es prefijo de la otra aplicarían ambas reglas, y la
 * más restrictiva ganaría sin que se note al leer la tabla.
 */
export function findOverlappingPolicies(): string[] {
  const problemas: string[] = []
  for (const a of API_POLICIES) {
    for (const b of API_POLICIES) {
      if (a === b) continue
      if (b.path.startsWith(a.path + "/")) {
        problemas.push(`"${b.path}" queda dentro de "${a.path}"`)
      }
    }
  }
  return problemas
}
