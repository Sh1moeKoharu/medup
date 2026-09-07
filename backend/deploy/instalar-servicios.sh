#!/usr/bin/env bash
#
# Deja el servidor listo para funcionar solo: todo arranca al encender, sin que
# nadie inicie sesión.
#
#     sudo bash backend/deploy/instalar-servicios.sh
#
# Se puede ejecutar las veces que haga falta; no rompe nada si ya estaba hecho.
#
# ── QUÉ HACE Y POR QUÉ ──────────────────────────────────────────────────────
# 1. Instala la unidad de systemd del backend con las rutas REALES de esta
#    copia del repositorio, en lugar de las de ejemplo.
# 2. Marca PostgreSQL, Redis, Nginx y el backend para que arranquen al
#    encender. Esto es lo que hace que no haga falta iniciar sesión: systemd
#    levanta los servicios en el arranque del sistema, mucho antes y con
#    independencia de que alguien entre con usuario y contraseña.
# 3. Impide que el equipo se suspenda. Un Ubuntu de escritorio se duerme solo
#    estando inactivo, y un servidor dormido deja de atender al punto de venta
#    aunque esté encendido.
# 4. Instala el mando `altus` para iniciar, reiniciar y diagnosticar.
# 5. Comprueba que todo quedó bien y lo dice.

set -uo pipefail

ROJO=$'\033[31m'; VERDE=$'\033[32m'; AMARILLO=$'\033[33m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'
ok()    { echo "  ${VERDE}OK${FIN}    $*"; }
aviso() { echo "  ${AMARILLO}AVISO${FIN} $*"; }
falla() { echo "  ${ROJO}FALLA${FIN} $*"; }
titulo(){ echo; echo "${NEGRITA}$*${FIN}"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo:  sudo bash $0" >&2
  exit 1
fi

# ── Rutas reales, deducidas de dónde vive este script ───────────────────────
DIR_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR_BACKEND="$(cd "$DIR_DEPLOY/.." && pwd)"
DIR_REPO="$(cd "$DIR_BACKEND/.." && pwd)"
DIR_SERVER="$DIR_BACKEND/.medusa/server"

# Usuario que ejecutará el backend: el dueño del repositorio, no root.
USUARIO_APP="$(stat -c '%U' "$DIR_REPO")"

titulo "RUTAS DETECTADAS"
echo "  repositorio : $DIR_REPO"
echo "  backend     : $DIR_BACKEND"
echo "  compilado   : $DIR_SERVER"
echo "  usuario     : $USUARIO_APP"

if [ ! -d "$DIR_SERVER" ]; then
  aviso "todavía no existe $DIR_SERVER"
  echo "        El backend no está compilado. Antes de que arranque hay que:"
  echo "          cd $DIR_BACKEND && npm run build && cd .medusa/server && npm ci --omit=dev"
  echo "        La instalación continúa; el servicio quedará configurado y"
  echo "        arrancará en cuanto exista el compilado."
fi

# ── 1. Configuración fuera del árbol de compilación ─────────────────────────
titulo "CONFIGURACIÓN"
mkdir -p /etc/altus
if [ -f /etc/altus/backend.env ]; then
  ok "/etc/altus/backend.env ya existe (no se toca)"
else
  falla "falta /etc/altus/backend.env"
  echo "        Créalo a partir de la plantilla y vuelve a ejecutar:"
  echo "          sudo cp $DIR_BACKEND/.env.template /etc/altus/backend.env"
  echo "          sudo nano /etc/altus/backend.env"
  echo "        Sin ese archivo el backend no arranca (le faltan la base de"
  echo "        datos y los secretos)."
fi
chmod 600 /etc/altus/backend.env 2>/dev/null || true
chown root:root /etc/altus/backend.env 2>/dev/null || true

# Directorio persistente de subidas y reportes: `medusa build` borra .medusa/
# en cada compilación, así que nada que deba sobrevivir puede vivir ahí dentro.
mkdir -p /var/lib/altus/static /var/lib/altus/reports
chown -R "$USUARIO_APP":"$USUARIO_APP" /var/lib/altus
ok "/var/lib/altus preparado"

# ── 2. Unidad de systemd con las rutas reales ───────────────────────────────
titulo "SERVICIO DEL BACKEND"
if [ ! -f "$DIR_DEPLOY/altus.service" ]; then
  falla "no se encuentra $DIR_DEPLOY/altus.service"
  exit 1
fi

sed -e "s|/home/altus/altus/backend/.medusa/server|$DIR_SERVER|g" \
    -e "s|/home/altus/altus/backend|$DIR_BACKEND|g" \
    -e "s|^User=.*|User=$USUARIO_APP|" \
    "$DIR_DEPLOY/altus.service" > /etc/systemd/system/altus.service
ok "instalada /etc/systemd/system/altus.service"

systemctl daemon-reload
ok "systemd recargado"

# ── 2b. Respaldos ─────────────────────────────────────────────────────────
titulo "RESPALDOS"

for u in altus-respaldo.service altus-respaldo.timer altus-ensayo.service altus-ensayo.timer; do
  if [ ! -f "$DIR_DEPLOY/$u" ]; then
    falla "no se encuentra $DIR_DEPLOY/$u"
    continue
  fi
  sed -e "s|/home/altus/altus/backend|$DIR_BACKEND|g"       "$DIR_DEPLOY/$u" > "/etc/systemd/system/$u"
done
systemctl daemon-reload
ok "unidades de respaldo instaladas"

install -d -m 700 /var/backups/altus
ok "carpeta /var/backups/altus"

# La frase de paso se genera una sola vez. Si ya existe NO se toca: cambiarla
# dejaria ilegibles todos los respaldos anteriores.
CLAVE=/etc/altus/respaldo.pass
CLAVE_NUEVA=0
if [ -s "$CLAVE" ]; then
  ok "clave de cifrado ya existente (no se toca)"
else
  install -d -m 750 /etc/altus
  openssl rand -base64 32 | tr -d '
' > "$CLAVE"
  chmod 600 "$CLAVE"
  CLAVE_NUEVA=1
  ok "clave de cifrado generada"
fi

for t in altus-respaldo.timer altus-ensayo.timer; do
  if systemctl enable --now "$t" >/dev/null 2>&1; then
    ok "$(printf '%-22s' "$t") programado"
  else
    falla "$(printf '%-22s' "$t") no se pudo programar"
  fi
done

echo
echo "  Respaldo cada noche a las 02:30. Ensayo de restauracion los domingos"
echo "  a las 04:00, sobre una base desechable: la real no se toca."

# ── 3. Arranque automático al encender ──────────────────────────────────────
titulo "ARRANQUE AUTOMÁTICO AL ENCENDER"
echo "  (esto es lo que hace que no haga falta iniciar sesión)"
echo
for s in postgresql redis-server nginx altus; do
  if ! systemctl list-unit-files "$s.service" --no-legend 2>/dev/null | grep -q .; then
    falla "$s no está instalado en el sistema"
    continue
  fi
  if systemctl enable "$s" >/dev/null 2>&1; then
    ok "$(printf '%-16s' "$s") arrancará al encender"
  else
    falla "$(printf '%-16s' "$s") no se pudo marcar para arranque automático"
  fi
done

# ── 4. Que el equipo no se duerma ───────────────────────────────────────────
titulo "SUSPENSIÓN DESACTIVADA"
echo "  Un equipo dormido no atiende al punto de venta aunque esté encendido,"
echo "  y nadie va a estar delante para despertarlo."
echo
if systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1; then
  ok "suspensión, hibernación y suspensión híbrida bloqueadas"
else
  aviso "no se pudieron bloquear los modos de suspensión"
fi

# Ubuntu de escritorio también apaga la pantalla y suspende por inactividad
# desde su propia configuración; esto cubre el caso de que esté instalado.
if command -v gsettings >/dev/null 2>&1 && [ -n "${SUDO_USER:-}" ]; then
  sudo -u "$SUDO_USER" gsettings set org.gnome.settings-daemon.plugins.power \
    sleep-inactive-ac-type 'nothing' >/dev/null 2>&1 \
    && ok "escritorio: suspensión por inactividad desactivada" \
    || true
fi

# ── 5. Mando `altus` ────────────────────────────────────────────────────────
titulo "MANDO DE CONTROL"
install -m 755 "$DIR_DEPLOY/altus-ctl" /usr/local/bin/altus
ok "instalado: usa  sudo altus estado"

# ── 6. Arrancar ahora ───────────────────────────────────────────────────────
titulo "ARRANCANDO"
for s in postgresql redis-server nginx; do
  systemctl start "$s" >/dev/null 2>&1 && ok "$s en marcha" || falla "$s no arrancó"
done

if [ -d "$DIR_SERVER" ]; then
  systemctl restart altus >/dev/null 2>&1 || true
  echo -n "  esperando al backend"
  arrancado=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:9000/health >/dev/null 2>&1; then
      arrancado=1; break
    fi
    echo -n "."; sleep 2
  done
  echo
  if [ "$arrancado" -eq 1 ]; then
    ok "backend respondiendo"
  else
    falla "el backend no respondió a tiempo — revisa:  sudo altus registro"
  fi
else
  aviso "backend sin compilar; se omite el arranque"
fi

# ── 7. Resumen ──────────────────────────────────────────────────────────────
titulo "COMPROBACIÓN FINAL"
/usr/local/bin/altus estado

cat <<RESUMEN

${NEGRITA}LISTO.${FIN}

  A partir de ahora, al encender el servidor todo arranca solo. No hay que
  iniciar sesión ni ejecutar nada.

  Para el día a día:
      sudo altus estado       ver si todo está bien
      sudo altus reiniciar    si algo va raro
      sudo altus registro     ver qué pasó
      sudo altus respaldo     ver los respaldos y su último ensayo

RESUMEN

if [ "$CLAVE_NUEVA" = "1" ]; then
  cat <<CLAVE_AVISO
${ROJO}${NEGRITA}  APUNTA ESTO ANTES DE CERRAR LA TERMINAL${FIN}

  Los respaldos van cifrados con esta frase:

      ${NEGRITA}$(cat "$CLAVE")${FIN}

  Ahora mismo la frase vive en el MISMO disco que los datos que protege. Si ese
  disco falla —que es justo el caso para el que existen los respaldos— se
  pierden los dos a la vez y las copias no se pueden abrir.

  Guárdala fuera del servidor: en el gestor de contraseñas, o impresa en un
  sobre. No se vuelve a mostrar, y sin ella ningún respaldo se puede recuperar.

CLAVE_AVISO
fi

cat <<PENDIENTE
  ${AMARILLO}Falta una cosa para que esto sea un respaldo de verdad:${FIN} hoy las copias
  se quedan en este mismo equipo. Define ${NEGRITA}ALTUS_RESPALDO_DESTINO${FIN} en
  /etc/altus/backend.env para que salgan también a otra máquina:

      ALTUS_RESPALDO_DESTINO=usuario@equipo:/respaldos/altus/

PENDIENTE
