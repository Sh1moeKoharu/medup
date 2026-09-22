#!/usr/bin/env bash
#
# Actualiza el servidor de la clínica con el paquete `altus-subir.tar.gz`.
#
#     mkdir -p /tmp/altus-nuevo
#     tar -xzf ~/Escritorio/altus-subir.tar.gz -C /tmp/altus-nuevo
#     sudo bash /tmp/altus-nuevo/backend/deploy/actualizar.sh
#
# POR QUÉ EXISTE
# El servidor se atiende por AnyDesk, tecleando en su teclado. La actualización
# son veinte órdenes largas —respaldo, parar, sincronizar, migrar, compilar,
# arrancar, publicar el punto de venta— y teclearlas a mano es donde se cometen
# los errores: un `--delete` mal escrito borra lo que no era. Aquí van en el
# orden correcto, con las comprobaciones que hay que hacer ANTES de tocar nada
# y con qué hacer si algo falla.
#
# QUÉ NO TOCA
#   · /etc/altus/backend.env  — la configuración del servidor
#   · static/                 — los logotipos subidos
#   · frontend/.env           — la dirección del servidor horneada en el POS
#   · la base de datos        — las migraciones sólo añaden; ninguna borra
#
# Se ejecuta como root (sudo) y hace el trabajo de archivos y compilación como
# el dueño de la instalación, para no dejar nada propiedad de root: el servicio
# corre como `altus` y no podría escribir.
set -euo pipefail

# ── Dónde está todo ─────────────────────────────────────────────────────────
DESTINO="${ALTUS_DIR:-/home/altus/altus}"
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ALTUS_ENV:-/etc/altus/backend.env}"
POS_WEB="${ALTUS_POS_WEB:-/var/www/altus-pos}"
UNIDADES="${ALTUS_UNIT_DIR:-/etc/systemd/system}"
SELLO="$(date +%F-%H%M)"
RESPALDO_CARPETA="${DESTINO}-${SELLO}"

rojo() { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
paso() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

fin_con_error() {
  local codigo=$?
  [ $codigo -eq 0 ] && return 0
  echo
  rojo "La actualización se detuvo en el paso anterior (código $codigo)."
  echo
  echo "Para dejar el servidor como estaba:"
  echo "  sudo systemctl stop altus"
  echo "  sudo rm -rf $DESTINO && sudo mv $RESPALDO_CARPETA $DESTINO"
  echo "  sudo systemctl start altus"
  echo
  echo "El respaldo de la base quedó en /var/backups/altus."
}
trap fin_con_error EXIT

# ── Comprobaciones antes de tocar nada ──────────────────────────────────────
paso "1 de 10 · Comprobaciones"

[ "$(id -u)" -eq 0 ] || { rojo "Corre esto con sudo:  sudo bash $0"; exit 1; }
[ -d "$DESTINO/backend" ] || { rojo "No encuentro la instalación en $DESTINO."; exit 1; }
[ -f "$ORIGEN/backend/package.json" ] || { rojo "No encuentro el código nuevo en $ORIGEN."; exit 1; }
[ -f "$ENV_FILE" ] || { rojo "No encuentro la configuración en $ENV_FILE."; exit 1; }

DUENO="$(stat -c %U "$DESTINO")"
HOGAR="$(getent passwd "$DUENO" | cut -d: -f6)"
como_dueno() { runuser -u "$DUENO" -- env HOME="$HOGAR" PATH="$PATH" "$@"; }

# La última migración de cada lado dice si la base va a cambiar, y cuánto.
ultima_migracion() { ls "$1"/backend/src/modules/*/migrations/*.ts 2>/dev/null | sed "s#.*/##" | sort | tail -1; }
MIGRA_NUEVA="$(ultima_migracion "$ORIGEN")"
MIGRA_VIEJA="$(ultima_migracion "$DESTINO")"
echo "   Instalación:      $DESTINO  (de $DUENO)"
echo "   Código nuevo:     $ORIGEN"
echo "   Última migración: ${MIGRA_VIEJA:-ninguna} → ${MIGRA_NUEVA:-ninguna}"
if [ "$MIGRA_VIEJA" = "$MIGRA_NUEVA" ]; then
  echo "   (la base no cambia: son las mismas migraciones)"
fi

# Una sola caja abierta: la migración del candado no puede crear su índice si
# al migrar hay dos. Se avisa ahora, no a media actualización.
DATABASE_URL="$(grep -oP '(?<=^DATABASE_URL=).*' "$ENV_FILE" || true)"
if [ -n "$DATABASE_URL" ] && command -v psql >/dev/null; then
  ABIERTAS="$(psql "$DATABASE_URL" -tAc "select count(*) from cash_session where status='open' and deleted_at is null" 2>/dev/null || echo "?")"
  if [ "$ABIERTAS" = "?" ]; then
    echo "   Cajas abiertas: no se pudo consultar (se sigue igual)"
  elif [ "$ABIERTAS" -gt 1 ]; then
    rojo "Hay $ABIERTAS cajas abiertas. Ciérralas desde el punto de venta y vuelve a correr esto:"
    psql "$DATABASE_URL" -c "select cashier_name, opened_at from cash_session where status='open' and deleted_at is null;"
    exit 1
  else
    echo "   Cajas abiertas: $ABIERTAS"
  fi
fi

if [ "${1:-}" != "--si" ]; then
  echo
  read -r -p "¿Actualizo el servidor? Escribe SI para continuar: " respuesta
  [ "$respuesta" = "SI" ] || { echo "Cancelado. No se tocó nada."; trap - EXIT; exit 0; }
fi

# ── El trabajo ──────────────────────────────────────────────────────────────
paso "2 de 10 · Respaldo de la base y de la configuración"
bash "$DESTINO/backend/deploy/respaldar.sh"

paso "3 de 10 · Deteniendo el sistema"
systemctl stop altus || true

paso "4 de 10 · Copia de la versión que estaba corriendo"
cp -a "$DESTINO" "$RESPALDO_CARPETA"
echo "   Quedó en $RESPALDO_CARPETA"

paso "5 de 10 · Sustituyendo el código"
# --delete se lleva los archivos que ya no existen: dejarlos puede resucitar
# una ruta retirada, porque Medusa registra lo que encuentra en src/api.
rsync -a --delete \
  --exclude node_modules --exclude .medusa --exclude static \
  --exclude .env --exclude .backups --exclude reports \
  "$ORIGEN/backend/" "$DESTINO/backend/"
rsync -a --delete \
  --exclude node_modules --exclude .expo --exclude dist --exclude .env \
  "$ORIGEN/frontend/" "$DESTINO/frontend/"
if [ -d "$ORIGEN/pruebas-ui" ]; then
  rsync -a --delete --exclude node_modules "$ORIGEN/pruebas-ui/" "$DESTINO/pruebas-ui/"
fi
chown -R "$DUENO":"$DUENO" "$DESTINO"

paso "6 de 10 · Dependencias del servidor"
como_dueno npm --prefix "$DESTINO/backend" ci

paso "7 de 10 · Migraciones de la base"
# Todas añaden columnas, tablas o índices. Ninguna borra.
#
# La configuración del servidor la da systemd al servicio, no a esta
# terminal: sin cargarla aquí, `db:migrate` no sabe a qué base conectarse y
# falla con un mensaje que no dice por qué.
set -a; . "$ENV_FILE"; set +a
(cd "$DESTINO/backend" && como_dueno npx medusa db:migrate)

paso "8 de 10 · Compilando el servidor y el panel"
(cd "$DESTINO/backend" && como_dueno npm run build)
como_dueno npm --prefix "$DESTINO/backend/.medusa/server" ci --omit=dev

paso "9 de 10 · Arrancando"
cp "$DESTINO/backend/deploy/altus.service" "$UNIDADES/"
systemctl daemon-reload
systemctl start altus

SALUD="no responde"
for _ in $(seq 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' localhost:9000/health || true)" = "200" ]; then
    SALUD="responde"
    break
  fi
  sleep 3
done
if [ "$SALUD" != "responde" ]; then
  rojo "El servidor no respondió en dos minutos. Mira el registro:  sudo altus registro"
  exit 1
fi
echo "   El servidor responde en el puerto 9000."

paso "10 de 10 · Compilando y publicando el punto de venta"
como_dueno npm --prefix "$DESTINO/frontend" ci
(cd "$DESTINO/frontend" && como_dueno npm run build:web)
if [ -d "$POS_WEB" ]; then
  rm -rf "${POS_WEB:?}"/*
  cp -r "$DESTINO/frontend/dist/." "$POS_WEB/"
  chown -R www-data:www-data "$POS_WEB"
  echo "   Publicado en $POS_WEB"
else
  echo "   $POS_WEB no existe: el punto de venta quedó compilado en frontend/dist, sin publicar."
fi

# ── Cierre ──────────────────────────────────────────────────────────────────
trap - EXIT
ENLACE="$(readlink -f "$DESTINO/backend/.medusa/server/static" 2>/dev/null || echo "")"
echo
verde "════════════════════════════════════════════════════════════════"
verde "  Servidor actualizado"
verde "════════════════════════════════════════════════════════════════"
echo
echo "Estado:"
systemctl is-active altus >/dev/null && echo "  · el servicio está activo" || echo "  · OJO: el servicio NO está activo"
[ -L "$DESTINO/backend/.medusa/server/static" ] \
  && echo "  · los logotipos persisten (static → $ENLACE)" \
  || echo "  · OJO: static NO es un enlace; los logotipos se perderían en la próxima actualización"
echo "  · la versión anterior quedó en $RESPALDO_CARPETA"
echo
echo "Falta hacerlo en el panel (http://<este servidor>/app), en este orden:"
echo "  1. Personal: al encargado del inventario, cámbiale el rol a Almacén."
echo "  2. Personal: da de alta la cuenta de RH y contabilidad."
echo "  3. Personal: a cada médico, cédula profesional y universidad (ya son obligatorias)."
echo "  4. Datos de la clínica: sube el logotipo; y el de cada médico en su cuenta."
echo "  5. Honorarios y nómina → Esquemas de pago: define cómo se paga a cada quien."
echo
echo "Si algo salió mal, para volver a la versión anterior:"
echo "  sudo systemctl stop altus"
echo "  sudo rm -rf $DESTINO && sudo mv $RESPALDO_CARPETA $DESTINO"
echo "  sudo systemctl start altus"
echo
