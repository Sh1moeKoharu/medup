/**
 * La ficha "invitado" del punto de venta.
 *
 * ── QUÉ ES ──────────────────────────────────────────────────────────────────
 * No es una persona. Es la ficha que el POS asigna a un pedido en borrador
 * mientras la venta todavía no tiene paciente: Medusa exige un `customer` para
 * abrir el borrador, y ésta hace de marcador de posición. La crea el propio
 * POS la primera vez que hace falta (ver `DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL`
 * en `frontend/api/hooks/draft-orders.tsx`), y el correo viene del starter de
 * Agilo del que salió el punto de venta.
 *
 * ── POR QUÉ HAY QUE ESCONDERLA, NO BORRARLA ─────────────────────────────────
 * Borrarla rompería toda venta que empiece sin paciente asignado, que es el
 * caso normal en el mostrador. Pero tampoco puede aparecer donde se elige a una
 * persona: en el directorio confunde, y en el buscador de una receta permitiría
 * emitir una orden médica a nombre de algo que no es un paciente.
 *
 * ⚠️ Este valor está duplicado en el POS a propósito: son dos paquetes npm
 * independientes. Si cambia uno, cambia el otro.
 */
export const POS_GUEST_EMAIL = "noreply+pos-guest@agilo.com";

/**
 * Cómo se llama la ficha, para que se pueda enseñar.
 *
 * Las pantallas de Medusa muestran el nombre del cliente y, si no hay, caen al
 * correo: la tabla de Pedidos del panel enseñaba `noreply+pos-guest@agilo.com`
 * en la columna Paciente de toda venta de mostrador. El dato era correcto pero
 * se leía como un error.
 *
 * El correo NO cambia: es lo que identifica a esta ficha en todo el sistema,
 * incluido `esInvitadoDelPos`. Lo que cambia es sólo lo que se enseña.
 *
 * El punto de venta la crea ya con este nombre (ver
 * `frontend/api/hooks/draft-orders.tsx`). Para las instalaciones que ya la
 * tenían sin nombre está `scripts/nombrar-invitado-pos.ts`.
 */
export const NOMBRE_INVITADO_POS = {
    first_name: "Venta",
    last_name: "de mostrador",
} as const;

/** `true` si la ficha es el invitado del POS y no una persona atendida. */
export function esInvitadoDelPos(cliente?: { email?: string | null } | null): boolean {
    return cliente?.email === POS_GUEST_EMAIL;
}
