// Sirve el punto de venta YA COMPILADO (dist/) y reenvía la API al backend,
// igual que hace nginx en el servidor: todo bajo un mismo origen.
//
//   npm run build:web
//   node scripts/servir-pos.mjs dist 8081 http://localhost:9000
//
// ── POR QUÉ, TENIENDO `expo start --web` ────────────────────────────────────
// El servidor de desarrollo de Expo, con `web.output: "static"`, vuelve a
// compilar el render del servidor en CADA petición a una ruta. Cualquier
// sondeo de "¿ya estás listo?" —el del visor, el de un guion— le pega cada
// pocos segundos, cada golpe son 20 s de compilación y la memoria no se
// suelta: en esta máquina murió tres veces con 4 GB de heap (código 134).
//
// Esto no compila nada: sirve archivos. Y prueba lo mismo que verá la
// clínica —el POS compilado detrás de un proxy en el mismo origen—, que es
// más fiel que el servidor de desarrollo. El precio es recompilar (~90 s)
// para ver un cambio.
//
// Es primo de backend/pruebas/servir-admin.mjs; aquí la raíz ES el punto de
// venta, y las rutas del enrutador caen al html pre-renderizado o a index.
import http from "http"
import fs from "fs"
import path from "path"

const RAIZ = path.resolve(process.argv[2] || "dist")
const PUERTO = Number(process.argv[3] || 8081)
const BACKEND = (process.argv[4] || "http://localhost:9000").replace(/\/+$/, "")

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
}

// Lo mismo que reenvía nginx (backend/deploy/altus-nginx.conf).
const ES_API = (u) => /^\/(app|admin|auth|store|health|static)\b/.test(u)

if (!fs.existsSync(path.join(RAIZ, "index.html"))) {
  console.error(`No hay build en ${RAIZ}. Primero:  npm run build:web`)
  process.exit(1)
}

http
  .createServer(async (req, res) => {
    const url = req.url ?? "/"

    if (ES_API(url)) {
      try {
        const cuerpo =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await new Promise((r) => {
                const trozos = []
                req.on("data", (c) => trozos.push(c))
                req.on("end", () => r(Buffer.concat(trozos)))
              })
        const cabeceras = { ...req.headers }
        delete cabeceras.host
        delete cabeceras["content-length"]
        const resp = await fetch(BACKEND + url, {
          method: req.method,
          headers: cabeceras,
          body: cuerpo && cuerpo.length ? cuerpo : undefined,
          redirect: "manual",
        })
        const salida = Buffer.from(await resp.arrayBuffer())
        const h = {}
        resp.headers.forEach((v, k) => {
          if (k !== "content-encoding" && k !== "content-length" && k !== "transfer-encoding") h[k] = v
        })
        const cookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : []
        res.writeHead(resp.status, cookies.length ? { ...h, "set-cookie": cookies } : h)
        res.end(salida)
      } catch (e) {
        res.writeHead(502)
        res.end("proxy: " + e.message)
      }
      return
    }

    const soloRuta = decodeURIComponent(url.split("?")[0].split("#")[0])
    const candidatos = [
      path.join(RAIZ, soloRuta),
      path.join(RAIZ, soloRuta + ".html"),
      path.join(RAIZ, soloRuta, "index.html"),
      path.join(RAIZ, "index.html"),
    ]
    const archivo = candidatos.find((a) => a.startsWith(RAIZ) && fs.existsSync(a) && fs.statSync(a).isFile())

    try {
      const cuerpo = fs.readFileSync(archivo)
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" })
      res.end(cuerpo)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  .listen(PUERTO, () => console.log(`POS: ${RAIZ}\npuerto: ${PUERTO}\nAPI -> ${BACKEND}`))
