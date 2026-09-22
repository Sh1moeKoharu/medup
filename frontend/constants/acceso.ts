import { ROLES, Role } from '@/constants/roles';

/**
 * QUÉ INTERFAZ LE TOCA A CADA ROL.
 *
 * ── POR QUÉ UNA SOLA TABLA ──────────────────────────────────────────────────
 * Antes había dos cosas separadas y ninguna completa: `getHomeRoute` decidía a
 * dónde mandar a cada quien al entrar, y los grupos de pantallas no validaban
 * nada. El resultado es lo que reportó el tester: un médico entraba y aparecía
 * en la interfaz de CAJA.
 *
 * Y no era un caso raro. `getHomeRoute` sólo reconocía médico y enfermería, y
 * TODO lo demás caía en caja por omisión: administrador, farmacia, auditoría y
 * cualquier cuenta cuyo rol no se pudiera interpretar. Un valor que no se
 * entiende debe llevar a una pantalla que lo diga, no a la caja registradora.
 *
 * Ahora el destino y el permiso salen de aquí, así que no pueden discrepar.
 *
 * ── ESTO NO ES LA SEGURIDAD ─────────────────────────────────────────────────
 * Es la interfaz. Lo que de verdad impide que un médico cobre son los permisos
 * del servidor (backend/src/lib/api-policy.ts), que se aplican sobre cada
 * llamada a la API. Esto evita que alguien acabe en una pantalla que no le
 * corresponde, no sustituye a aquello.
 */

/**
 * Pantalla para una cuenta cuyo rol no se reconoce. Desde la fase 7 los seis
 * perfiles tienen interfaz aquí, así que sólo llega quien no tiene rol.
 */
export const RUTA_SIN_POS = '/sin-pos';

/** A dónde va cada rol al entrar. */
export const INICIO_POR_ROL: Record<Role, string> = {
  [ROLES.ADMIN]: '/(tabs)/products',
  // Caja entra a la caja: lo primero del turno es abrirla (o ver quién la tiene).
  [ROLES.CASHIER]: '/(tabs)/cash-register',
  // Farmacia ya no comparte la interfaz de Caja: lleva el almacén, surte las
  // recetas de mostrador y los traspasos a Enfermería. No cobra ni ve el corte.
  [ROLES.PHARMACY]: '/(almacen)/existencias',
  [ROLES.DOCTOR]: '/(doctor)/products',
  // Enfermería entra a su bandeja: lo pendiente de aplicar es su trabajo del día.
  [ROLES.NURSE]: '/(nurse)/bandeja',
  // Auditoría / Dirección es de SOLO LECTURA: no cobra, no dispensa y no
  // prescribe. Consulta la bitácora, el kardex, las caducidades y los cortes.
  [ROLES.AUDITOR]: '/(auditoria)/bitacora',
  // Almacén comparte grupo con Farmacia; cada uno ve sus pestañas.
  [ROLES.WAREHOUSE]: '/(almacen)/existencias',
  [ROLES.HR]: '/(rh)/reportes',
};

/**
 * Quién puede estar en cada grupo de pantallas.
 *
 * El administrador entra en todos a propósito: es quien configura y quien
 * acompaña al personal cuando algo no funciona.
 */
/**
 * Grupo de pantallas en el que trabaja cada rol, y las pantallas que ese grupo
 * define. Sirve para resolver una ruta escrita "a secas" (/cart, /settings) al
 * grupo correcto: /products existe en los tres grupos y, sin esto, un enlace
 * directo de un medico caeria en la version de caja.
 */
export const GRUPO_POR_ROL: Record<Role, string> = {
  [ROLES.ADMIN]: "(tabs)",
  [ROLES.CASHIER]: "(tabs)",
  [ROLES.PHARMACY]: "(almacen)",
  [ROLES.DOCTOR]: "(doctor)",
  [ROLES.NURSE]: "(nurse)",
  [ROLES.AUDITOR]: "(auditoria)",
  [ROLES.WAREHOUSE]: "(almacen)",
  [ROLES.HR]: "(rh)",
};

export const PANTALLAS_DE_GRUPO: Record<string, string[]> = {
  "(tabs)": ["products", "orders", "scan", "crm", "activity", "cash-register", "settings", "cart"],
  "(doctor)": ["products", "crm", "recetas", "settings", "cart"],
  "(nurse)": ["products", "crm", "recetas", "bandeja", "almacen", "settings", "cart"],
  "(almacen)": ["existencias", "recetas", "traspasos", "lotes", "kardex", "caducidades", "reportes", "settings"],
  "(auditoria)": ["bitacora", "reportes", "kardex", "caducidades", "cortes", "settings"],
  "(rh)": ["reportes", "nomina", "cortes", "settings"],
};

export const ROLES_CAJA: Role[] = [ROLES.ADMIN, ROLES.CASHIER];
export const ROLES_MEDICO: Role[] = [ROLES.ADMIN, ROLES.DOCTOR];
export const ROLES_ENFERMERIA: Role[] = [ROLES.ADMIN, ROLES.NURSE];
/** El grupo del almacén: Farmacia (consulta y surte) y Almacén (gestiona). */
export const ROLES_ALMACEN: Role[] = [ROLES.ADMIN, ROLES.PHARMACY, ROLES.WAREHOUSE];
/**
 * Quién MUEVE el inventario: altas de lote, bajas, destrucción, traspasos,
 * mínimos y máximos. Farmacia entra al grupo, pero sólo consulta y surte.
 */
export const ROLES_GESTION_ALMACEN: Role[] = [ROLES.ADMIN, ROLES.WAREHOUSE];
/** Quién surte recetas de mostrador. */
export const ROLES_SURTE_RECETAS: Role[] = [ROLES.ADMIN, ROLES.PHARMACY];
/** RH y contabilidad: nómina, honorarios y actividad del personal. */
export const ROLES_RH: Role[] = [ROLES.ADMIN, ROLES.HR];
/** Auditoría / Dirección: todo de sólo lectura. */
export const ROLES_AUDITORIA: Role[] = [ROLES.ADMIN, ROLES.AUDITOR];

/**
 * Quién puede ELEGIR la configuración del punto de venta cuando hay más de una
 * opción: región y moneda, canal de venta, ubicación de inventario.
 *
 * ── POR QUÉ ESTA LISTA ──────────────────────────────────────────────────────
 * El asistente se autoconfigura solo cuando hay exactamente una opción de cada
 * cosa, que es el caso normal de una clínica. Pero si hay varias —porque alguien
 * creó un duplicado, o durante la puesta en marcha— pide elegir, y esa barrera
 * se levanta ANTES de que actúe el enrutado por rol.
 *
 * El resultado observado: un MÉDICO acabó ante la pantalla de crear regiones y
 * configurar impuestos. Región, moneda y canal de venta no son decisiones
 * suyas, y equivocarse ahí deja los precios en otra divisa sin que nada avise.
 *
 * Caja entra porque es quien pone en marcha la tableta del mostrador.
 */
export const ROLES_CONFIGURACION: Role[] = [ROLES.ADMIN, ROLES.CASHIER];

/**
 * Quien puede consultar la BITACORA desde el punto de venta.
 *
 * Es el registro de lo que hace todo el personal, asi que el servidor solo se
 * lo entrega a Administracion y Auditoria (ver `/admin/audit-logs` en
 * backend/src/lib/api-policy.ts). Auditoria no entra al POS —va a la pantalla
 * de solo lectura—, de modo que aqui queda Administracion.
 *
 * Sirve para OCULTAR la pestana a quien no puede leerla, en vez de ensenarle
 * una pantalla que siempre responderia "prohibido". El permiso de verdad lo
 * aplica el servidor.
 */
export const ROLES_BITACORA: Role[] = [ROLES.ADMIN];

/**
 * Quién tiene trabajo de verdad en el PANEL de administración.
 *
 * Determina a quién se le enseña el paso al panel desde la barra de sesión.
 * Desde la fase 7 el panel es SÓLO de Administración, y lo cierra el servidor
 * (`PANEL_SOLO_ADMINISTRACION`, ver backend/src/lib/require-role.ts): a los
 * demás perfiles `POST /auth/session` les responde 403. Farmacia y Auditoría,
 * que antes trabajaban allí, tienen ahora su interfaz aquí.
 *
 * Un botón que lleva a una negativa es peor que no tener botón, así que a
 * nadie más se le enseña.
 */
export const ROLES_PANEL: Role[] = [ROLES.ADMIN];
