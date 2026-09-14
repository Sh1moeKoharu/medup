/**
 * Nombres de usuario.
 *
 * ── POR QUÉ ESTÁ DUPLICADO ──────────────────────────────────────────────────
 * Esto es la copia de `backend/src/lib/usuarios.ts`. El punto de venta y el
 * servidor son dos paquetes de npm distintos y no comparten código, igual que
 * pasa con la paleta. La regla es de una línea y el dominio es un valor fijo,
 * así que la copia se paga barata; lo que no se puede es que se separen sin que
 * nadie lo note, y por eso el archivo de allá y este dicen lo mismo y lo dicen
 * en el mismo sitio.
 *
 * ── QUÉ SE GUARDA ───────────────────────────────────────────────────────────
 * La persona escribe `caja`. Lo que viaja al servidor es `caja@sigh.local`.
 * El motivo entero está en el archivo del backend: en resumen, el formulario de
 * acceso del panel de Medusa valida el formato de correo y viene compilado, así
 * que el identificador tiene que parecer un correo aunque nadie lo escriba.
 */

export const DOMINIO_INTERNO = 'sigh.local';

/**
 * De lo que se teclea, a lo que se manda.
 *
 * Idempotente: si ya trae arroba se devuelve igual. Eso es lo que permite que
 * una cuenta antigua, con un correo de verdad todavía sin migrar, siga
 * entrando escribiéndolo completo.
 */
export const aIdentificador = (entrada: string): string => {
  const limpio = entrada.trim().toLowerCase();
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO_INTERNO}`;
};

/**
 * De lo guardado, a lo que se enseña.
 *
 * Sólo quita NUESTRO dominio. Un correo de verdad se sigue viendo entero,
 * porque es con lo que esa persona entra y enseñar otra cosa sería mentir.
 */
export const aUsuario = (identificador: string | null | undefined): string => {
  if (!identificador) return '';
  const sufijo = `@${DOMINIO_INTERNO}`;
  return identificador.endsWith(sufijo)
    ? identificador.slice(0, -sufijo.length)
    : identificador;
};
