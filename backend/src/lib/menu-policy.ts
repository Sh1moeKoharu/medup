import { ROLES, Role } from "./roles"

/**
 * Qué entradas del menú se ocultan a cada rol.
 *
 * ── POR QUÉ UNA LISTA DE EXCLUSIÓN ──────────────────────────────────────────
 * Se declara lo que se OCULTA, no lo que se muestra. Con una lista de inclusión,
 * cualquier pantalla nueva desaparecería para todos hasta que alguien se
 * acordara de añadirla — un fallo silencioso. Así, lo nuevo aparece por omisión
 * y se decide después si conviene esconderlo.
 *
 * ── ESTO NO ES SEGURIDAD ────────────────────────────────────────────────────
 * El SDK del admin no permite ocultar rutas por rol: `RouteConfig` sólo acepta
 * label, icon, nested y rank. La única palanca disponible es CSS, que se
 * esquiva con F12. El control real son los guards de `src/api/middlewares.ts`:
 * un médico que llame /admin/staff recibe 403 venga de donde venga.
 *
 * ── DÓNDE SE APLICA ─────────────────────────────────────────────────────────
 * `medusa-config.ts` lee esta política e inyecta el CSS correspondiente en el
 * index.html del admin durante el build. Se hace ahí, y no con un widget,
 * porque los widgets sólo se montan en zonas concretas (listas de productos,
 * pedidos y clientes) — precisamente las pantallas que un médico tiene
 * ocultas, así que el widget nunca llegaría a ejecutarse para él.
 *
 * Lo que esto resuelve es de usabilidad: el tester reportó que al médico le
 * aparecían Personal, Auditoría, Cortes de Caja y Lotes FEFO, todas puertas
 * cerradas.
 *
 * ── SOBRE EL AUDITOR / DIRECCIÓN ────────────────────────────────────────────
 * Se le deja LEER todo: su perfil es "reportes y bitácora, sólo lectura", y
 * esconderle pantallas contradice el rol. El servidor ya le impide escribir en
 * cualquier ruta.
 *
 * La excepción es el atajo al punto de venta. Ese no es un reporte: es una
 * puerta a la operación, y quien no cobra no tiene por qué verla. Antes se le
 * mostraba —criterio mío, equivocado— y el tester lo reportó dos veces.
 *
 * Los cortes de caja SÍ se le dejan: son un reporte, y revisarlos es
 * exactamente lo que hace una dirección.
 *
 * `settings` nunca se oculta: es donde se cambian contraseña e idioma.
 */
export const HIDDEN_MENU_ROUTES: Record<Role, string[]> = {
  [ROLES.ADMIN]: [],

  // Lee todo, salvo la puerta a la operación.
  [ROLES.AUDITOR]: ["/app/pos"],

  [ROLES.PHARMACY]: [
    "/app/staff",
    "/app/audit-logs",
    "/app/cash-sessions",
    "/app/b2b-agreements",
    "/app/customers-by-company",
    "/app/promotions",
    "/app/price-lists",
    "/app/campaigns",
  ],

  [ROLES.CASHIER]: [
    "/app/staff",
    "/app/audit-logs",
    "/app/inventory-batches",
    "/app/b2b-agreements",
    "/app/promotions",
    "/app/price-lists",
    "/app/campaigns",
  ],

  // Área médica: sólo órdenes médicas y expedientes de pacientes.
  // Es lo que pidió el cliente de forma explícita.
  [ROLES.DOCTOR]: [
    "/app/pos",
    "/app/staff",
    "/app/audit-logs",
    "/app/cash-sessions",
    "/app/inventory-batches",
    "/app/b2b-agreements",
    "/app/customers-by-company",
    "/app/products",
    "/app/orders",
    "/app/inventory",
    "/app/reservations",
    "/app/promotions",
    "/app/price-lists",
    "/app/campaigns",
  ],

  [ROLES.NURSE]: [
    "/app/pos",
    "/app/staff",
    "/app/audit-logs",
    "/app/cash-sessions",
    "/app/inventory-batches",
    "/app/b2b-agreements",
    "/app/customers-by-company",
    "/app/products",
    "/app/orders",
    "/app/inventory",
    "/app/reservations",
    "/app/promotions",
    "/app/price-lists",
    "/app/campaigns",
  ],
}

/** Rutas ocultas para un rol; vacío si el rol es desconocido. */
export function hiddenRoutesFor(role: Role | null): string[] {
  return role ? HIDDEN_MENU_ROUTES[role] ?? [] : []
}
