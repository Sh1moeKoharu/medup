/**
 * Convierte un manual en Markdown (caja.md, …) en una sola página HTML con
 * las capturas incrustadas, para leerla o publicarla sin depender del repositorio.
 *
 *   node generar-html.mjs caja        → dist/caja.html
 *
 * La página no lleva <html>, <head> ni <body>: la envuelve quien la publica
 * (el visor de artefactos añade su propio esqueleto). Sí lleva <title> y sus
 * estilos, con paleta clara y oscura.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { marked } from "marked"

const aqui = path.dirname(fileURLToPath(import.meta.url))
const nombre = process.argv[2] || "caja"
const fuente = fs.readFileSync(path.join(aqui, `${nombre}.md`), "utf8")

const titulo = (fuente.match(/^# (.+)$/m)?.[1] ?? nombre).replace(/^Manual de uso · /, "")

const renderer = new marked.Renderer()
renderer.image = ({ href, text }) => {
  const ruta = path.join(aqui, href)
  const datos = fs.existsSync(ruta) ? `data:image/png;base64,${fs.readFileSync(ruta).toString("base64")}` : href
  return `<figure><img src="${datos}" alt="${text}" loading="lazy"><figcaption>${text}</figcaption></figure>`
}
// Los párrafos que sólo contienen una imagen no se envuelven en <p>.
const cuerpo = marked.parse(fuente, { renderer, gfm: true }).replace(/<p>(<figure>[\s\S]*?<\/figure>)<\/p>/g, "$1")

const html = `<title>Manual de ${titulo} · Altus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--lienzo:#FDFCFC;--tarjeta:#FFFFFF;--superficie:#F5F3F1;--tinta:#17150F;--gris-200:#EBE8E4;--gris-300:#6F6960;--gris-400:#5C574F;--acento:#2F5FB5;--acento-200:#E4EBF8;--med-200:#FDF3D9;--med-500:#8A6410;--si-500:#2E6B3A;--no-500:#B4232B;--sombra:0 2px 10px rgba(23,21,15,.08);--voz:'Newsreader',Georgia,serif;--ui:'Inter',system-ui,sans-serif;--dato:'IBM Plex Mono',ui-monospace,Menlo,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--lienzo:#14130F;--tarjeta:#1C1A16;--superficie:#232019;--tinta:#F3F1ED;--gris-200:#35312A;--gris-300:#8F887D;--gris-400:#A9A197;--acento:#8FB0E4;--acento-200:#1E2A40;--med-200:#2E2617;--med-500:#E8C46A;--si-500:#8FD3A0;--no-500:#F0A0A4;--sombra:0 2px 12px rgba(0,0,0,.4)}}
:root[data-theme="dark"]{--lienzo:#14130F;--tarjeta:#1C1A16;--superficie:#232019;--tinta:#F3F1ED;--gris-200:#35312A;--gris-300:#8F887D;--gris-400:#A9A197;--acento:#8FB0E4;--acento-200:#1E2A40;--med-200:#2E2617;--med-500:#E8C46A;--si-500:#8FD3A0;--no-500:#F0A0A4;--sombra:0 2px 12px rgba(0,0,0,.4)}
*{box-sizing:border-box}
body{background:var(--lienzo);color:var(--tinta);font-family:var(--ui);font-size:15.5px;line-height:1.65;margin:0;-webkit-font-smoothing:antialiased}
.hoja{max-width:880px;margin:0 auto;padding:0 28px 96px}
h1{font-family:var(--voz);font-weight:300;font-size:clamp(36px,6vw,54px);line-height:1.06;letter-spacing:-.02em;margin:64px 0 10px;text-wrap:balance}
h1 + p{font-family:var(--dato);font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--gris-400);margin:0 0 28px}
h2{font-family:var(--voz);font-weight:400;font-size:30px;line-height:1.2;letter-spacing:-.01em;margin:56px 0 14px;padding-top:28px;border-top:1px solid var(--gris-200)}
h3{font-size:19px;font-weight:600;margin:38px 0 10px;text-wrap:balance}
h3::before{content:counter(paso) " ";counter-increment:paso;font-family:var(--dato);font-weight:500;font-size:12px;letter-spacing:.08em;color:var(--acento);display:block;margin-bottom:2px}
h2{counter-reset:paso}
p{max-width:70ch;margin:0 0 14px}
p strong,li strong,td strong{font-weight:600}
ul,ol{max-width:72ch;padding-left:22px;margin:0 0 14px}
li{margin-bottom:6px}
code{font-family:var(--dato);font-size:.88em;background:var(--superficie);padding:1px 5px;border-radius:4px}
hr{border:0;height:0;margin:0}
blockquote{margin:18px 0;padding:14px 18px;border-radius:12px;background:var(--med-200);color:var(--tinta);border:1px solid color-mix(in srgb,var(--med-500) 45%,transparent)}
blockquote p{margin:0;max-width:none}
figure{margin:22px 0 30px}
figure img{display:block;width:100%;border-radius:12px;border:1px solid var(--gris-200);box-shadow:var(--sombra);background:var(--tarjeta)}
figcaption{font-size:13px;color:var(--gris-400);margin-top:10px;padding-left:2px}
.envuelve{overflow-x:auto;border-radius:12px;background:var(--tarjeta);box-shadow:var(--sombra);margin:16px 0 22px}
table{width:100%;border-collapse:collapse;font-size:14.5px}
thead th{text-align:left;font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gris-400);padding:14px 16px 10px;border-bottom:1px solid var(--gris-200);white-space:nowrap}
tbody td{padding:12px 16px;border-bottom:1px solid var(--gris-200);vertical-align:top;line-height:1.5}
tbody tr:last-child td{border-bottom:0}
em{color:var(--gris-400)}
footer{margin-top:64px;padding-top:24px;border-top:1px solid var(--gris-200);font-family:var(--dato);font-size:11.5px;color:var(--gris-400)}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
</style>
<div class="hoja">
${cuerpo.replace(/<table>/g, '<div class="envuelve"><table>').replace(/<\/table>/g, "</table></div>")}
<footer>Altus · manual de ${titulo} · capturas generadas con docs/manual/capturar-${nombre}.mjs</footer>
</div>
`

fs.mkdirSync(path.join(aqui, "dist"), { recursive: true })
const salida = path.join(aqui, "dist", `${nombre}.html`)
fs.writeFileSync(salida, html)
console.log(`${salida}  (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`)
