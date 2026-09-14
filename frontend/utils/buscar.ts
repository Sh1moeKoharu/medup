/**
 * Comparar texto como lo escribe la gente, no como está guardado.
 *
 * ── EL FALLO QUE ARREGLA ────────────────────────────────────────────────────
 * Los selectores filtraban con `label.toLowerCase().includes(consulta)`. Con un
 * catálogo en inglés casi nunca fallaba. Con uno en español falla a diario:
 *
 *   · escribir «Mexico» no encontraba «México»
 *   · escribir «Nuevo Leon» no encontraba «Nuevo León»
 *   · escribir «Queretaro» no encontraba «Querétaro»
 *
 * Y no daba error: la lista salía vacía y parecía que el país o el estado no
 * estuvieran en el catálogo. Los estados mexicanos ya venían acentuados desde
 * el principio, así que esto llevaba roto desde antes de traducir los países.
 *
 * ── CÓMO ────────────────────────────────────────────────────────────────────
 * `normalize('NFD')` separa cada letra de su acento y el rango U+0300–U+036F
 * borra los acentos ya sueltos, así que «é» queda en «e». Es la forma estándar
 * y no hay ninguna tabla que mantener. El rango va escrito con escapes y no con
 * los caracteres en crudo: son invisibles en un editor y cualquiera los borraría
 * sin darse cuenta.
 *
 * La eñe también se aplana, y es lo que se quiere aquí: quien escriba «Espana»
 * encuentra «España». Esto es SÓLO para comparar; no toca en ningún momento el
 * texto que se enseña, que conserva sus acentos.
 */
const ACENTOS_SUELTOS = new RegExp('[\\u0300-\\u036f]', 'g');

export const normalizarParaBuscar = (texto: string): string =>
  texto.normalize('NFD').replace(ACENTOS_SUELTOS, '').toLowerCase().trim();

/** ¿Aparece la consulta dentro del texto, ignorando acentos y mayúsculas? */
export const contieneTexto = (texto: string, consulta: string): boolean =>
  normalizarParaBuscar(texto).includes(normalizarParaBuscar(consulta));
