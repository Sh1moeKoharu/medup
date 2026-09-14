/**
 * Formatear dinero sin que la pantalla se caiga.
 *
 * ── EL FALLO QUE ARREGLA ────────────────────────────────────────────────────
 * `Intl.NumberFormat` con `style: 'currency'` y sin `currency` LANZA:
 *
 *     Uncaught Error: Currency code is required with currency style.
 *
 * No devuelve un texto raro: revienta el render. La ficha del paciente se caía
 * entera al abrirla, porque una de sus órdenes no traía `currency_code`.
 *
 * Y el código de moneda venía de sitios que perfectamente pueden estar vacíos:
 * la región de la orden, la del borrador, la de los ajustes del dispositivo.
 * Con encadenar `||` no basta si el último eslabón también es opcional, que es
 * lo que pasaba en once de los veintiocho sitios donde se formatea dinero.
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────
 * Si no hay moneda, usa la de la casa. Si el código es inválido, lo cual sólo
 * puede venir de datos corruptos, devuelve el número con el código detrás en
 * lugar de tirar la pantalla: se lee peor, pero se lee.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 * No divide ni multiplica. Cada sitio que llama trae su cantidad ya en unidades
 * mayores, y algunos dividen entre 100 y otros no, según de qué campo de Medusa
 * venga. Meter esa aritmética aquí uniformaría cosas que NO son iguales y sería
 * un error de contabilidad, que es peor que uno de formato.
 */

/** La moneda de la clínica. Se usa cuando el dato no trae ninguna. */
export const MONEDA_POR_OMISION = 'MXN';

/**
 * `es-MX` y no `en-US`, que era lo que había en los veintiocho sitios. Cambia
 * poco a la vista con pesos —el separador de millares es la coma en los dos—
 * pero es lo correcto para el sitio donde corre esto.
 */
export const LOCALE_DINERO = 'es-MX';

const LOCALE = LOCALE_DINERO;

export const formatearDinero = (
  cantidad: number | null | undefined,
  moneda?: string | null,
): string => {
  const valor = typeof cantidad === 'number' && Number.isFinite(cantidad) ? cantidad : 0;
  const codigo = (moneda || MONEDA_POR_OMISION).toUpperCase();

  try {
    return valor.toLocaleString(LOCALE, {
      style: 'currency',
      currency: codigo,
      currencyDisplay: 'narrowSymbol',
    });
  } catch {
    // Un código que no existe. No se pierde el importe, sólo el símbolo.
    return `${valor.toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${codigo}`;
  }
};
