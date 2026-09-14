// Sirve un build estático del admin con fallback SPA y reenvía la API a un
// backend real, para poder iniciar sesión y comprobar las rutas propias.
//
//   node servir-admin.mjs <ruta a public/admin> <puerto> [backend]
import http from "http"
import fs from "fs"
import path from "path"

const RAIZ = process.argv[2]
const PUERTO = Number(process.argv[3] || 4173)
const BACKEND = process.argv[4] || "http://localhost:9000"

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
}

// Todo lo que es API va al backend; el resto se sirve del build.
const ES_API = (u) => /^\/(admin|auth|store|health|static)\b/.test(u)

http
  .createServer(async (req, res) => {
    const url = req.url

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
        // Las cookies de sesión llegan como set-cookie múltiples.
        const cookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : []
        res.writeHead(resp.status, cookies.length ? { ...h, "set-cookie": cookies } : h)
        res.end(salida)
      } catch (e) {
        res.writeHead(502)
        res.end("proxy: " + e.message)
      }
      return
    }

    // La raíz no es del panel: el panel vive bajo /app.
    //
    // Servir el index.html en "/" dejaba una pantalla NEGRA, porque la
    // aplicación arranca con base /app y en la raíz su enrutador no encuentra
    // ninguna pantalla que pintar. Se manda a /app, que ya decide solo: si hay
    // sesión abre el panel y si no, lleva al acceso.
    //
    // Esto es sólo para desarrollo. En el servidor manda nginx, y ahí la raíz
    // es el punto de venta, que es lo correcto.
    const soloRuta = url.split("?")[0]
    if (soloRuta === "/" || soloRuta === "") {
      res.writeHead(302, { Location: "/app" })
      res.end()
      return
    }

    let rel = decodeURIComponent(soloRuta).replace(/^\/app/, "") || "/"
    let archivo = path.join(RAIZ, rel)

    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      archivo = path.join(RAIZ, "index.html")
    }

    try {
      const cuerpo = fs.readFileSync(archivo)
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" })
      res.end(cuerpo)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  .listen(PUERTO, () => console.log(`admin: ${RAIZ}\npuerto: ${PUERTO}\nAPI -> ${BACKEND}`))
