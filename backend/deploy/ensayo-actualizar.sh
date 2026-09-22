#!/usr/bin/env bash
#
# Ensayo en seco de `actualizar.sh`, contra un servidor de mentira.
#
#     bash backend/deploy/ensayo-actualizar.sh
#
# POR QUÉ EXISTE
# `actualizar.sh` se corre una vez cada varias semanas, en el servidor de la
# clínica, por AnyDesk, con la caja cerrada y la gente esperando. No es el
# momento de descubrir que una variable estaba mal escrita. Aquí se recorre
# entero —sus diez pasos— con `systemctl`, `npm`, `psql` y `rsync` fingidos y
# una instalación de juguete en un directorio temporal: no toca nada real y
# dice si el guion llega al final.
#
# Lo que NO prueba: que las migraciones corran, que el build compile o que el
# servicio arranque. Eso es el despliegue de verdad.
set -euo pipefail

REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAIZ="$(mktemp -d)"
trap 'rm -rf "$RAIZ"' EXIT

mkdir -p "$RAIZ/bin" "$RAIZ/destino/backend/deploy" "$RAIZ/destino/backend/src/modules/caja/migrations" \
         "$RAIZ/destino/backend/.medusa/server" "$RAIZ/destino/frontend" \
         "$RAIZ/origen/backend/deploy" "$RAIZ/origen/backend/src/modules/caja/migrations" \
         "$RAIZ/origen/frontend/dist" "$RAIZ/origen/pruebas-ui" "$RAIZ/pos-web" "$RAIZ/etc"

# ── La instalación de juguete ───────────────────────────────────────────────
echo '{"version":"0.0.1"}' > "$RAIZ/destino/backend/package.json"
echo '{"version":"0.0.1"}' > "$RAIZ/origen/backend/package.json"
touch "$RAIZ/destino/backend/src/modules/caja/migrations/Migration20260910120000.ts"
touch "$RAIZ/origen/backend/src/modules/caja/migrations/Migration20260910120000.ts"
touch "$RAIZ/origen/backend/src/modules/caja/migrations/Migration20260914150000.ts"
echo 'echo "   (respaldo de mentira hecho)"' > "$RAIZ/destino/backend/deploy/respaldar.sh"
echo "unidad de mentira" > "$RAIZ/origen/backend/deploy/altus.service"
echo "una ruta retirada que no debe sobrevivir" > "$RAIZ/destino/backend/src/ruta-retirada.ts"
echo '{}' > "$RAIZ/origen/frontend/package.json"
echo '{}' > "$RAIZ/origen/pruebas-ui/package.json"
echo "pos" > "$RAIZ/origen/frontend/dist/index.html"
cp "$REAL/backend/deploy/actualizar.sh" "$RAIZ/origen/backend/deploy/actualizar.sh"
printf 'DATABASE_URL=postgres://x\nJWT_SECRET=x\n' > "$RAIZ/etc/backend.env"

# ── Las órdenes del sistema, fingidas ───────────────────────────────────────
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$RAIZ/bin/$1"; chmod +x "$RAIZ/bin/$1"; }
stub id 'if [ "${1:-}" = "-u" ]; then echo 0; else echo "root"; fi'
stub systemctl 'echo "   [systemctl $*]"; exit 0'
stub runuser 'while [ "${1:-}" != "--" ] && [ $# -gt 0 ]; do shift; done; shift; exec "$@"'
stub getent 'echo "altus:x:1000:1000::/home/altus:/bin/bash"'
stub stat 'echo "altus"'
stub chown 'true'
stub psql 'echo 1'
stub curl 'echo 200'
stub npm 'echo "   [npm $*]"'
stub npx 'echo "   [npx $*]"'
stub readlink 'echo "/var/lib/altus/static"'
# rsync de mentira: copia, y respeta que `--exclude` se lleva su argumento.
stub rsync '
args=(); saltar=0
for a in "$@"; do
  if [ "$saltar" = "1" ]; then saltar=0; continue; fi
  case "$a" in --exclude) saltar=1;; -*) ;; *) args+=("$a");; esac
done
mkdir -p "${args[1]}"
cp -a "${args[0]}". "${args[1]}" 2>/dev/null || true
echo "   [rsync ${args[0]} -> ${args[1]}]"'

# ── A correr ────────────────────────────────────────────────────────────────
PATH="$RAIZ/bin:$PATH" \
ALTUS_DIR="$RAIZ/destino" \
ALTUS_ENV="$RAIZ/etc/backend.env" \
ALTUS_POS_WEB="$RAIZ/pos-web" \
ALTUS_UNIT_DIR="$RAIZ/etc" \
bash "$RAIZ/origen/backend/deploy/actualizar.sh" --si > "$RAIZ/salida.txt" 2>&1 || {
  echo "El ensayo FALLÓ. Lo último que dijo:"
  tail -20 "$RAIZ/salida.txt"
  exit 1
}

# ── Qué tenía que haber pasado ──────────────────────────────────────────────
fallos=0
comprobar() { if eval "$2"; then echo "   ok   $1"; else echo "   FALLA $1"; fallos=$((fallos + 1)); fi; }

comprobar "recorre los diez pasos"            'grep -q "10 de 10" "$RAIZ/salida.txt"'
comprobar "guarda la versión anterior"        'compgen -G "$RAIZ/destino-*" > /dev/null'
comprobar "publica el punto de venta"         '[ -f "$RAIZ/pos-web/index.html" ]'
comprobar "instala la unidad de systemd"      '[ -f "$RAIZ/etc/altus.service" ]'
comprobar "avisa de lo que falta en el panel" 'grep -q "Esquemas de pago" "$RAIZ/salida.txt"'
comprobar "dice cómo volver atrás"            'grep -q "volver a la versión anterior" "$RAIZ/salida.txt"'

echo
if [ "$fallos" -eq 0 ]; then
  echo "Ensayo correcto: el guion de actualización llega al final."
else
  echo "El ensayo encontró $fallos problema(s)."
  exit 1
fi
