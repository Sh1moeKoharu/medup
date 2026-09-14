/**
 * Barrido de texto visible en inglés, en el punto de venta y en el panel.
 *
 *   node pruebas/verificar-cadenas.mjs
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────
 * «Todo el texto visible va en español» es una regla del sistema de diseño
 * (DESIGN-SYSTEM.md, 5 bis). Nadie la rompe a propósito: se rompe al copiar
 * una pantalla del starter, al dejar un `placeholder` de prueba, o al enseñar
 * tal cual una etiqueta de estado de Medusa. Esto lo encuentra antes que un
 * paciente.
 *
 * Recorre los .tsx de app/ y components/ del POS y de routes/ y widgets/ del
 * panel, se queda sólo con lo que llega a la pantalla —texto entre etiquetas
 * JSX y los atributos que se leen (placeholder, title, label, accesibilidad,
 * avisos)— y busca palabras de interfaz en inglés como palabra completa. No
 * mira comentarios ni identificadores: ahí el inglés es legítimo.
 *
 * Sale con 1 si encuentra alguna fuera de la lista de excepciones de abajo,
 * que es corta y dice por qué cada una.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const CARPETAS = [
  "frontend/app",
  "frontend/components",
  "backend/src/admin/routes",
  "backend/src/admin/widgets",
  "backend/src/admin/lib",
]

/** Palabras de interfaz que no deberían verse. Se buscan como palabra completa, sin distinguir mayúsculas. */
const PALABRAS = [
  "loading", "submit", "cancel", "search", "save", "delete", "remove", "please", "failed",
  "success", "successfully", "login", "logout", "sign in", "sign out", "password", "username", "welcome",
  "continue", "back", "next", "close", "open", "add", "edit", "confirm", "retry", "required", "invalid",
  "not found", "something went wrong", "draft", "canceled", "cancelled", "completed", "pending",
  "requires action", "archived", "fulfilled", "shipped", "paid", "refunded", "captured", "authorized",
  "awaiting", "partially", "unknown", "products", "orders", "customers", "cart", "checkout",
  "quantity", "discount", "shipping", "payment", "amount", "name", "phone", "address", "select",
  "choose", "create", "update", "yes", "ok", "done", "qty", "tax total", "included", "stock",
  // Palabras que también existen en español ("no", "error", "total") no están: darían
  // falsos positivos en cada pantalla. Lo que se busca es lo que no puede ser español.
]

/**
 * Excepciones, con motivo. Se comparan por fragmento de ruta y por texto exacto.
 * Añadir aquí es una decisión, no una salida: cada línea dice por qué.
 */
const EXCEPCIONES = [
  // «OK» y «Done» los pone el teclado del sistema (returnKeyType), no la pantalla.
  { texto: /^(ok|done)$/i, motivo: "tecla del teclado del sistema" },
  // «No» es español también («¿Cerrar sesión? — No»).
  { texto: /^no$/i, motivo: "es español" },
  // «Error» y «Total» son palabras españolas cuando van solas o en una frase en español.
  { texto: /^(error|total|subtotal|email|no\.?|mostrar contraseña|ocultar contraseña)$/i, motivo: "es español" },
  // Los nombres de sección del panel de Medusa que se traducen por su propio i18n.
  { ruta: "backend/src/admin/i18n", motivo: "archivos de traducción" },
]

/** Español con las mismas letras: si la frase entera tiene tildes o eñes, es español. */
const pareceEspanol = (t) => /[áéíóúñ¿¡]/i.test(t)

function* archivos(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* archivos(p)
    else if (/\.tsx?$/.test(e.name) && !/\.spec\./.test(e.name)) yield p
  }
}

/** Texto que llega a la pantalla: nodos JSX y atributos legibles. */
function textosVisibles(fuente) {
  const sinComentarios = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  const encontrados = []
  // Texto entre etiquetas, sin expresiones {…}.
  for (const m of sinComentarios.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    encontrados.push(m[1])
  }
  // Texto dentro de una expresión entre etiquetas: `>{a ? "Uno" : "Otro"}<`.
  // Sin esto se escapaban los títulos y botones que cambian según el estado,
  // que son justo los que nadie revisa («Nuevo Rol de Personal»).
  for (const m of sinComentarios.matchAll(/>\s*\{([^<>]*?)\}\s*</g)) {
    // Lo que va a la derecha de una comparación es un dato, no un cartel:
    // en `status === "open" ? "Abierta" : "Cerrada"` sólo se leen las dos
    // últimas. Se quitan los operandos antes de mirar.
    const sinComparaciones = m[1].replace(/[=!]==?\s*["'][^"']*["']/g, " ")
    for (const c of sinComparaciones.matchAll(/["']([^"'`]{2,})["']/g)) encontrados.push(c[1])
  }
  // Las dos ramas de un ternario de textos: `? "Caja cuadrada" : "Sobrante"`.
  // Los ternarios largos se parten en varias líneas y con JSX dentro, así que
  // la captura de arriba no los alcanza. Se exige la forma COMPLETA para no
  // confundir un `clave: "valor"` de un objeto con un cartel: así `method:
  // "DELETE"` no cuenta.
  for (const m of sinComentarios.matchAll(/\?\s*["']([^"'`]{3,})["']\s*:\s*["']([^"'`]{3,})["']/g)) {
    // Un ternario dentro de un atributo técnico no es texto: `key={cargando ?
    // 'loading' : 'form'}` elige una clave de React, no un cartel.
    const antes = sinComentarios.slice(Math.max(0, m.index - 60), m.index)
    if (/\b(key|className|class|id|type|variant|color|name|mode|status|icon|autoComplete|inputMode|keyboardType|testID)\s*=\s*\{[^{}]*$/.test(antes)) continue
    encontrados.push(m[1], m[2])
  }
  // Atributos y campos que se leen tal cual.
  const atributos = /(?:placeholder|title|label|accessibilityLabel|accessibilityHint|text1|text2|submitText|cancelText|description|titulo|descripcion|heading)\s*[:=]\s*["'`]([^"'`]+)["'`]/g
  for (const m of sinComentarios.matchAll(atributos)) {
    encontrados.push(m[1])
  }
  // Cadenas que salen por Toast, alert o Error hacia el usuario.
  for (const m of sinComentarios.matchAll(/(?:alert|new Error|text1:|text2:)\s*\(?\s*["'`]([^"'`]+)["'`]/g)) {
    encontrados.push(m[1])
  }
  return encontrados
    // Las plantillas `${…}` son código: se quitan y se juzga el resto.
    .map((t) => t.replace(/\$\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim())
    // Lo capturado entre `>` y `<` puede ser una comparación de JavaScript, no
    // JSX. Un texto visible no lleva estos signos ni guiones bajos. Los
    // paréntesis SÍ aparecen en texto normal —«(opcional)», «(caja 20
    // tabletas)»—; lo que delata código es el paréntesis pegado a la palabra de
    // delante, que es una llamada.
    .filter((t) => t.length > 1 && !/^[,.:]/.test(t) && !/[;{}=\[\]&|_]|\w\(|\breturn\b|\bconst\b/.test(t))
}

const patron = new RegExp(`(^|[^a-z])(${PALABRAS.map((p) => p.replace(/ /g, "\\s+")).join("|")})(?=$|[^a-z])`, "i")

const hallazgos = []
let revisados = 0

for (const carpeta of CARPETAS) {
  const dir = path.join(raiz, carpeta)
  if (!fs.existsSync(dir)) continue
  for (const archivo of archivos(dir)) {
    const rel = path.relative(raiz, archivo).replace(/\\/g, "/")
    if (EXCEPCIONES.some((e) => e.ruta && rel.includes(e.ruta))) continue
    revisados++
    const fuente = fs.readFileSync(archivo, "utf8")
    for (const texto of textosVisibles(fuente)) {
      if (pareceEspanol(texto)) continue
      if (EXCEPCIONES.some((e) => e.texto && e.texto.test(texto))) continue
      const m = patron.exec(texto)
      if (!m) continue
      // Una sola palabra inglesa dentro de una frase claramente española
      // («Tu password») también cuenta: mejor un falso positivo que un cartel.
      hallazgos.push({ rel, texto, palabra: m[2] })
    }
  }
}

console.log(`\nBarrido de texto en inglés — ${revisados} archivos\n`)
if (hallazgos.length === 0) {
  console.log("  Sin texto en inglés a la vista.")
} else {
  for (const h of hallazgos) {
    console.log(`  ${h.rel}\n     «${h.texto}»  ← ${h.palabra}`)
  }
  console.log(`\n  ${hallazgos.length} ${hallazgos.length === 1 ? "hallazgo" : "hallazgos"}.`)
}

/**
 * Segundo barrido: mayúscula a la inglesa. En español sólo lleva mayúscula la
 * primera palabra y los nombres propios; «Nuevo Paciente» o «Método de Pago»
 * son calcos del inglés que venían del starter.
 *
 * Los nombres propios del sistema (las áreas, la marca) se declaran aquí para
 * que «Bandeja de Enfermería» o «Almacén de Enfermería» no cuenten.
 */
const PROPIOS = ["Altus", "SIGH", "Farmacia", "Enfermería", "Administración", "Auditoría", "Recepción", "Medusa", "México", "Linux", "Windows", "Android", "Hospital Ángeles", "Program Files"]
// `\b` es ASCII y falla delante de una mayúscula acentuada: así se colaba
// «Órdenes Médicas». Se usan miradas alrededor con las letras acentuadas
// dentro. «Caja» no está entre los nombres propios a propósito: «corte de
// caja» es un sustantivo común y se escribía «Cortes de Caja».
const LETRA = "A-Za-zÁÉÍÓÚÑáéíóúñ"

/**
 * Se buscan PAREJAS en mayúscula seguidas («Nuevo Paciente», «Método de Pago»),
 * que es como aparece el calco del inglés. Una sola palabra en mayúscula a
 * media frase también sobra a veces («Datos corporativos del Paciente»), pero
 * distinguirla de un nombre propio —«Caja», «Médico», «Chrome», «Variantes»—
 * necesitaría un diccionario: de quince avisos, once eran correctos. Un
 * guardián al que hay que ignorar no sirve, así que esos se revisan a mano.
 */
// String.raw y no una plantilla normal: dentro de backticks `\s` se queda en
// «s», y el patrón dejaba de reconocer el espacio sin avisar de nada.
const patronMayuscula = new RegExp(
  String.raw`(?<![${LETRA}])[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+(?:de|del|la|el|los|las|a|en|por|con|y)\s+|\s+)[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?![${LETRA}])`,
)

const mayusculas = []
for (const carpeta of CARPETAS) {
  const dir = path.join(raiz, carpeta)
  if (!fs.existsSync(dir)) continue
  for (const archivo of archivos(dir)) {
    const rel = path.relative(raiz, archivo).replace(/\\/g, "/")
    if (EXCEPCIONES.some((e) => e.ruta && rel.includes(e.ruta))) continue
    for (const texto of textosVisibles(fs.readFileSync(archivo, "utf8"))) {
      const m = patronMayuscula.exec(texto)
      if (!m) continue
      if (PROPIOS.some((p) => m[0].includes(p))) continue
      mayusculas.push({ rel, texto: m[0], palabra: m[0] })
    }
  }
}

console.log("\nBarrido de mayúscula a la inglesa\n")
if (mayusculas.length === 0) {
  console.log("  Sin títulos en mayúscula inglesa.")
} else {
  for (const h of mayusculas) console.log(`  ${h.rel}\n     «${h.texto}»`)
  console.log(`\n  ${mayusculas.length} ${mayusculas.length === 1 ? "hallazgo" : "hallazgos"}.`)
}

console.log("")
process.exit(hallazgos.length + mayusculas.length === 0 ? 0 : 1)
