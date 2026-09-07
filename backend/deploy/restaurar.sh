#!/usr/bin/env bash
#
# Restaurar desde un respaldo — y, sobre todo, comprobar que se puede.
#
#     sudo bash backend/deploy/restaurar.sh --listar     Qué respaldos hay
#     sudo bash backend/deploy/restaurar.sh --ensayo     Simulacro (no toca nada)
#     sudo bash backend/deploy/restaurar.sh <archivo>    Restauración de verdad
#
# ── POR QUÉ EL ENSAYO ES LO IMPORTANTE ──────────────────────────────────────
# Un respaldo que nunca se restauró no se sabe si sirve. Se sabe que el archivo
# se generó, que pesa lo razonable y que no dio error — y ninguna de esas tres
# cosas es lo que se necesita el día que hace falta.
#
# El ensayo restaura el respaldo en una base de datos DESECHABLE, cuenta las
# filas, las compara con el manifiesto que se guardó al hacerlo y borra la base
# de prueba. La base real no se toca en ningún momento. Corre solo cada semana
# desde el temporizador de systemd.
#
# Si el ensayo pasa, el respaldo sirve. Esa es la única forma de saberlo.

set -uo pipefail

CONFIG="/etc/altus/backend.env"
CLAVE="/etc/altus/respaldo.pass"
DESTINO_LOCAL="/var/backups/altus"

if [ -t 1 ]; then
  ROJO=$'\033[31m'; VERDE=$'\033[32m'; AMARILLO=$'\033[33m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'
else
  ROJO=''; VERDE=''; AMARILLO=''; NEGRITA=''; FIN=''
fi
ok()    { echo "  ${VERDE}OK${FIN}    $*"; }
aviso() { echo "  ${AMARILLO}AVISO${FIN} $*"; }
falla() { echo "  ${ROJO}FALLA${FIN} $*" >&2; }
titulo(){ echo; echo "${NEGRITA}$*${FIN}"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo:  sudo bash $0 $*" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
[ -r "$CONFIG" ] && . "$CONFIG"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  falla "no se pudo leer DATABASE_URL de $CONFIG"
  exit 1
fi

# Conexión de mantenimiento: la misma URL apuntando a la base 'postgres', que
# siempre existe. Hace falta para poder crear y borrar la base del ensayo.
url_hacia() {
  local base="$1" sin_query="${DATABASE_URL%%\?*}" query=""
  [ "$sin_query" != "$DATABASE_URL" ] && query="?${DATABASE_URL#*\?}"
  echo "${sin_query%/*}/${base}${query}"
}
URL_MANTENIMIENTO="$(url_hacia postgres)"

ultimo_respaldo() {
  find "$DESTINO_LOCAL" -name 'altus-*.tar.gz.gpg' -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | head -1 | cut -d' ' -f2-
}

# ── --listar ────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--listar" ]; then
  titulo "RESPALDOS EN $DESTINO_LOCAL"
  if ! find "$DESTINO_LOCAL" -name 'altus-*.tar.gz.gpg' -type f >/dev/null 2>&1 \
     || [ -z "$(ultimo_respaldo)" ]; then
    falla "no hay ninguno"
    echo "         Crea el primero:  sudo bash $(dirname "$0")/respaldar.sh" >&2
    exit 1
  fi
  find "$DESTINO_LOCAL" -name 'altus-*.tar.gz.gpg' -type f -printf '%TY-%Tm-%Td %TH:%TM  %10s  %f\n' \
    | sort -r | awk '{ printf "  %s %s  %8.1f MB  %s\n", $1, $2, $3/1048576, $4 }'
  echo
  exit 0
fi

# ── Elegir el archivo ───────────────────────────────────────────────────────

ENSAYO=0
ARCHIVO=""
case "${1:-}" in
  --ensayo) ENSAYO=1; ARCHIVO="${2:-$(ultimo_respaldo)}" ;;
  "")       echo "Uso: $0 [--listar | --ensayo | <archivo>]" >&2; exit 1 ;;
  *)        ARCHIVO="$1" ;;
esac

if [ -z "$ARCHIVO" ] || [ ! -r "$ARCHIVO" ]; then
  falla "no hay respaldo que usar${ARCHIVO:+: $ARCHIVO}"
  exit 1
fi

for programa in pg_restore psql gpg; do
  command -v "$programa" >/dev/null 2>&1 || { falla "falta '$programa'"; exit 1; }
done

# ── Abrir el respaldo ───────────────────────────────────────────────────────

TRABAJO="$(mktemp -d)"
chmod 700 "$TRABAJO"
BASE_ENSAYO="altus_ensayo_$$"

limpiar() {
  rm -rf "$TRABAJO"
  if [ "$ENSAYO" = "1" ]; then
    # WITH (FORCE) echa a las conexiones que hayan quedado colgadas; existe
    # desde PostgreSQL 13, y si no está se intenta sin él.
    psql "$URL_MANTENIMIENTO" -q -c \
      "DROP DATABASE IF EXISTS \"$BASE_ENSAYO\" WITH (FORCE)" 2>/dev/null \
      || psql "$URL_MANTENIMIENTO" -q -c \
        "DROP DATABASE IF EXISTS \"$BASE_ENSAYO\"" 2>/dev/null \
      || true
  fi
}
trap limpiar EXIT

titulo "$([ "$ENSAYO" = "1" ] && echo "ENSAYO DE RESTAURACIÓN" || echo "RESTAURACIÓN")"
echo "  Archivo: $(basename "$ARCHIVO")"

if ! gpg --batch --quiet --decrypt --passphrase-file "$CLAVE" "$ARCHIVO" 2>"$TRABAJO/gpg.err" \
   | tar -xzf - -C "$TRABAJO"; then
  falla "no se pudo descifrar o desempaquetar"
  sed 's/^/         /' "$TRABAJO/gpg.err" >&2
  echo "         Si la clave de $CLAVE cambió, este respaldo necesita la ANTERIOR." >&2
  exit 1
fi

CONTENIDO="$(find "$TRABAJO" -maxdepth 1 -type d -name 'altus-*' | head -1)"
DUMP="$CONTENIDO/base-de-datos.dump"
if [ ! -r "$DUMP" ]; then
  falla "el respaldo no contiene base-de-datos.dump"
  exit 1
fi
ok "abierto"

if [ -r "$CONTENIDO/MANIFIESTO.txt" ]; then
  echo
  sed 's/^/    /' "$CONTENIDO/MANIFIESTO.txt"
fi

# ── Ensayo: base desechable, contar, comparar, borrar ───────────────────────

if [ "$ENSAYO" = "1" ]; then
  titulo "RESTAURANDO EN UNA BASE DE PRUEBA"
  echo "  La base real no se toca."

  if ! psql "$URL_MANTENIMIENTO" -q -c "CREATE DATABASE \"$BASE_ENSAYO\"" 2>"$TRABAJO/createdb.err"; then
    falla "no se pudo crear la base de prueba"
    sed 's/^/         /' "$TRABAJO/createdb.err" >&2
    exit 1
  fi

  URL_ENSAYO="$(url_hacia "$BASE_ENSAYO")"

  # pg_restore avisa de cosas inofensivas (extensiones que ya existen, dueños
  # que no coinciden). No se toma el codigo de salida como veredicto: el
  # veredicto son los conteos.
  pg_restore --no-owner --no-privileges --dbname="$URL_ENSAYO" "$DUMP" \
    >"$TRABAJO/restore.log" 2>&1 || true
  ok "restaurado en $BASE_ENSAYO"

  titulo "COMPROBACIÓN: GUARDADO CONTRA RESTAURADO"
  printf "    %-22s %10s %10s   %s\n" "TABLA" "GUARDADO" "AHORA" ""

  fallos=0; comprobadas=0
  while read -r tabla esperado; do
    case "$tabla" in ""|RESPALDO|Fecha*|Servidor*|Versión*|FILAS|TABLA) continue ;; esac
    [ "$esperado" = "-" ] && continue
    [[ "$esperado" =~ ^[0-9]+$ ]] || continue

    real="$(psql "$URL_ENSAYO" -tAc "SELECT count(*) FROM \"$tabla\"" 2>/dev/null || echo "-")"
    comprobadas=$((comprobadas + 1))
    if [ "$real" = "$esperado" ]; then
      printf "    %-22s %10s %10s   ${VERDE}igual${FIN}\n" "$tabla" "$esperado" "$real"
    else
      printf "    %-22s %10s %10s   ${ROJO}NO COINCIDE${FIN}\n" "$tabla" "$esperado" "$real"
      fallos=$((fallos + 1))
    fi
  done < <(sed -n '/^FILAS POR TABLA/,$p' "$CONTENIDO/MANIFIESTO.txt" | tail -n +2)

  titulo "VEREDICTO"
  if [ "$comprobadas" -eq 0 ]; then
    falla "no se pudo comparar ninguna tabla; el manifiesto no se entiende"
    exit 1
  elif [ "$fallos" -eq 0 ]; then
    ok "las $comprobadas tablas restauraron con el mismo número de filas."
    echo
    echo "  Este respaldo sirve. Ensayo del $(date '+%d/%m/%Y %H:%M')."
    echo
    exit 0
  else
    falla "$fallos de $comprobadas tablas no coinciden."
    echo "         Registro completo: $TRABAJO/restore.log (se borra al salir)." >&2
    exit 1
  fi
fi

# ── Restauración de verdad ──────────────────────────────────────────────────

titulo "${ROJO}ESTO SOBRESCRIBE LA BASE DE DATOS EN USO${FIN}"
echo "  Todo lo capturado después de este respaldo se pierde."
echo "  Fecha del respaldo: $(basename "$ARCHIVO" | sed 's/altus-//; s/.tar.gz.gpg//')"
echo
read -r -p "  Escribe RESTAURAR para continuar: " respuesta
if [ "$respuesta" != "RESTAURAR" ]; then
  echo "  Cancelado. No se tocó nada."
  exit 1
fi

# Red de seguridad: si la restauración era la equivocada, todavía queda vuelta
# atrás. Es el momento en que más falta hace y el más fácil de olvidar.
titulo "RESPALDO DE SEGURIDAD DEL ESTADO ACTUAL"
if bash "$(dirname "$0")/respaldar.sh" >/dev/null 2>&1; then
  ok "guardado antes de sobrescribir"
else
  aviso "no se pudo. Si sigues, no habrá vuelta atrás."
  read -r -p "  ¿Continuar de todos modos? (escribe SI): " r2
  [ "$r2" = "SI" ] || { echo "  Cancelado."; exit 1; }
fi

titulo "RESTAURANDO"
systemctl stop altus 2>/dev/null && ok "backend detenido" || aviso "el backend no estaba en marcha"

pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" "$DUMP" >"$TRABAJO/restore.log" 2>&1 || true
ok "base de datos restaurada"

DIR_SUBIDAS="${ALTUS_DATA_DIR:-/var/lib/altus}"
if [ -r "$CONTENIDO/archivos-subidos.tar" ]; then
  tar -xf "$CONTENIDO/archivos-subidos.tar" -C "$DIR_SUBIDAS" && ok "archivos subidos restaurados"
fi

echo
aviso "la configuración NO se sobrescribe sola"
echo "         Está en $CONTENIDO/backend.env (se borra al salir)."
echo "         Cópiala a mano sólo si la actual se perdió."

systemctl start altus 2>/dev/null && ok "backend levantado" || falla "no se pudo levantar; revisa: sudo altus estado"

titulo "LISTO"
echo "  Comprueba:  sudo altus estado"
echo "  Y que la bitácora siga entera:"
echo "    cd ~/altus/backend && npx medusa exec ./src/scripts/verificar-bitacora.ts"
echo
