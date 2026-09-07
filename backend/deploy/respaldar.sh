#!/usr/bin/env bash
#
# Respaldo cifrado del SIGH.
#
#     sudo bash backend/deploy/respaldar.sh
#
# Lo ejecuta solo el temporizador de systemd todas las noches. A mano se usa
# antes de tocar algo delicado: una importación de inventario, una limpieza,
# una actualización.
#
# ── QUÉ GUARDA ──────────────────────────────────────────────────────────────
#   · La base de datos completa (pg_dump en formato propio, comprimido).
#   · Los archivos subidos, si ALTUS_DATA_DIR apunta a algún sitio.
#   · La configuración (/etc/altus/backend.env).
#   · Un manifiesto con el conteo de filas de las tablas que importan.
#
# La configuración va DENTRO a propósito. Sin JWT_SECRET ni COOKIE_SECRET, una
# base de datos restaurada no da un sistema que funcione: da una copia de los
# datos y un día de trabajo averiguando por qué nadie puede iniciar sesión. Por
# eso el archivo se cifra: contiene la contraseña de la base de datos.
#
# El manifiesto es lo que convierte el respaldo en algo comprobable. Un dump
# vacío pesa poco pero no falla; con los conteos guardados, `restaurar.sh
# --ensayo` puede decir si lo que se restauró es lo que se guardó.
#
# ── DÓNDE QUEDA ─────────────────────────────────────────────────────────────
# En /var/backups/altus, y —si está configurado ALTUS_RESPALDO_DESTINO— también
# fuera del servidor.
#
# Un respaldo que vive sólo en la máquina que respalda NO es un respaldo: el
# disco que se lleva la base de datos se lleva también las copias. Si el
# destino externo no está configurado, este script lo dice cada vez, porque el
# riesgo sigue ahí aunque el archivo se haya generado bien.

set -uo pipefail

CONFIG="/etc/altus/backend.env"
CLAVE="/etc/altus/respaldo.pass"
DESTINO_LOCAL="/var/backups/altus"
DIAS_A_CONSERVAR=14

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
  echo "Ejecuta con sudo:  sudo bash $0" >&2
  exit 1
fi

# ── Comprobaciones previas ──────────────────────────────────────────────────
# Se hacen TODAS antes de empezar. Fallar a mitad deja un archivo incompleto
# que parece un respaldo.

titulo "COMPROBACIONES"

for programa in pg_dump pg_restore gpg tar; do
  if ! command -v "$programa" >/dev/null 2>&1; then
    falla "falta '$programa'. Instala:  sudo apt install postgresql-client gnupg tar"
    exit 1
  fi
done
ok "herramientas presentes"

if [ ! -r "$CONFIG" ]; then
  falla "no se puede leer $CONFIG"
  exit 1
fi

# `set -a` exporta lo que se lea; el formato de EnvironmentFile es KEY=VALUE.
set -a
# shellcheck disable=SC1090
. "$CONFIG"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  falla "$CONFIG no define DATABASE_URL"
  exit 1
fi
ok "configuración leída"

if [ ! -r "$CLAVE" ]; then
  falla "falta la clave de cifrado en $CLAVE"
  echo "         La crea el instalador:  sudo bash backend/deploy/instalar-servicios.sh" >&2
  exit 1
fi
if [ "$(stat -c '%a' "$CLAVE")" != "600" ]; then
  aviso "$CLAVE debería tener permisos 600; corrigiendo"
  chmod 600 "$CLAVE"
fi
ok "clave de cifrado presente"

mkdir -p "$DESTINO_LOCAL"
chmod 700 "$DESTINO_LOCAL"

# ── Preparación ─────────────────────────────────────────────────────────────

MARCA="$(date +%Y-%m-%d-%H%M)"
NOMBRE="altus-${MARCA}"
TRABAJO="$(mktemp -d)"
ETAPA="$TRABAJO/$NOMBRE"
mkdir -p "$ETAPA"

# Pase lo que pase, no dejar la copia sin cifrar en el disco.
limpiar() { rm -rf "$TRABAJO"; }
trap limpiar EXIT

titulo "RESPALDO $MARCA"

# ── 1. Base de datos ────────────────────────────────────────────────────────
# Formato propio (-Fc): comprimido, y permite restaurar tablas sueltas sin
# tener que recuperarlo todo.

if ! pg_dump --format=custom --no-owner --no-privileges \
     --file="$ETAPA/base-de-datos.dump" "$DATABASE_URL" 2>"$TRABAJO/pg_dump.err"; then
  falla "pg_dump no terminó"
  sed 's/^/         /' "$TRABAJO/pg_dump.err" >&2
  exit 1
fi

# Un dump puede "terminar bien" y estar vacío —una URL que apunta a una base
# recién creada, por ejemplo—. Se comprueba que dentro haya tablas de verdad.
TABLAS="$(pg_restore --list "$ETAPA/base-de-datos.dump" 2>/dev/null | grep -c 'TABLE DATA' || true)"
if [ "${TABLAS:-0}" -lt 5 ]; then
  falla "el volcado sólo contiene ${TABLAS:-0} tabla(s) con datos. Se aborta."
  echo "         Revisa que DATABASE_URL apunte a la base correcta." >&2
  exit 1
fi
PESO_DB="$(du -h "$ETAPA/base-de-datos.dump" | cut -f1)"
ok "base de datos: $TABLAS tablas, $PESO_DB"

# ── 2. Manifiesto ───────────────────────────────────────────────────────────
# Los conteos son la prueba. Sin ellos, "el respaldo se restauró" sólo
# significa que el archivo no estaba corrupto.

TABLAS_CLAVE=(product customer "order" medical_batch inventory_movement
              medical_order medical_customer cash_session cash_movement audit_log)

{
  echo "RESPALDO SIGH / ALTUS"
  echo "Fecha    : $(date --iso-8601=seconds)"
  echo "Servidor : $(hostname)"
  echo "Versión  : $(git -C "$(dirname "$0")/../.." rev-parse --short HEAD 2>/dev/null || echo desconocida)"
  echo ""
  echo "FILAS POR TABLA"
} > "$ETAPA/MANIFIESTO.txt"

for t in "${TABLAS_CLAVE[@]}"; do
  n="$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "-")"
  printf '%-22s %s\n' "$t" "$n" >> "$ETAPA/MANIFIESTO.txt"
done
ok "manifiesto con el conteo de $(( ${#TABLAS_CLAVE[@]} )) tablas"

# ── 3. Archivos subidos ─────────────────────────────────────────────────────

DIR_SUBIDAS="${ALTUS_DATA_DIR:-/var/lib/altus}/uploads"
if [ -d "$DIR_SUBIDAS" ]; then
  tar -cf "$ETAPA/archivos-subidos.tar" -C "$(dirname "$DIR_SUBIDAS")" "$(basename "$DIR_SUBIDAS")" 2>/dev/null
  ok "archivos subidos: $(du -h "$ETAPA/archivos-subidos.tar" | cut -f1)"
else
  ok "sin archivos subidos que guardar"
fi

# ── 4. Configuración ────────────────────────────────────────────────────────

cp "$CONFIG" "$ETAPA/backend.env"
ok "configuración incluida (por eso se cifra)"

# ── 5. Empaquetar y cifrar ──────────────────────────────────────────────────
# Simétrico con frase de paso: no hay que gestionar claves públicas ni un
# llavero, que en un servidor sin nadie delante es una pieza menos que puede
# quedarse a medias.

ARCHIVO="$DESTINO_LOCAL/${NOMBRE}.tar.gz.gpg"

if ! tar -czf - -C "$TRABAJO" "$NOMBRE" \
   | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
         --passphrase-file "$CLAVE" --output "$ARCHIVO" 2>"$TRABAJO/gpg.err"; then
  falla "el cifrado no terminó"
  sed 's/^/         /' "$TRABAJO/gpg.err" >&2
  rm -f "$ARCHIVO"
  exit 1
fi
chmod 600 "$ARCHIVO"
ok "cifrado: $(basename "$ARCHIVO") ($(du -h "$ARCHIVO" | cut -f1))"

# Se comprueba que se puede DESCIFRAR, ahora, no el día que haga falta.
if ! gpg --batch --quiet --decrypt --passphrase-file "$CLAVE" "$ARCHIVO" 2>/dev/null | tar -tzf - >/dev/null 2>&1; then
  falla "el archivo cifrado no se puede volver a abrir. Se descarta."
  rm -f "$ARCHIVO"
  exit 1
fi
ok "se comprobó que abre"

# ── 6. Fuera del servidor ───────────────────────────────────────────────────

titulo "COPIA EXTERNA"
if [ -n "${ALTUS_RESPALDO_DESTINO:-}" ]; then
  if rsync -a --timeout=120 "$ARCHIVO" "$ALTUS_RESPALDO_DESTINO" 2>"$TRABAJO/rsync.err"; then
    ok "copiado a $ALTUS_RESPALDO_DESTINO"
  else
    falla "NO se pudo copiar fuera del servidor"
    sed 's/^/         /' "$TRABAJO/rsync.err" >&2
    echo
    echo "  El respaldo local existe, pero mientras la copia externa falle" >&2
    echo "  el sistema NO está protegido contra la pérdida del disco." >&2
    exit 1
  fi
else
  aviso "ALTUS_RESPALDO_DESTINO no está configurado"
  echo "         El respaldo vive SÓLO en este servidor. El disco que se lleve"
  echo "         la base de datos se lleva también las copias."
  echo
  echo "         Configúralo en $CONFIG, por ejemplo:"
  echo "           ALTUS_RESPALDO_DESTINO=usuario@otra-maquina:/respaldos/altus/"
fi

# ── 7. Purga ────────────────────────────────────────────────────────────────
# Después de copiar fuera, nunca antes.

BORRADOS="$(find "$DESTINO_LOCAL" -name 'altus-*.tar.gz.gpg' -mtime "+$DIAS_A_CONSERVAR" -print -delete | wc -l)"
CUANTOS="$(find "$DESTINO_LOCAL" -name 'altus-*.tar.gz.gpg' | wc -l)"

titulo "RESUMEN"
ok "$CUANTOS respaldo(s) en $DESTINO_LOCAL"
[ "$BORRADOS" -gt 0 ] && ok "$BORRADOS purgado(s) por tener más de $DIAS_A_CONSERVAR días"

echo
echo "  Comprueba que sirve, sin tocar la base real:"
echo "    sudo bash $(dirname "$0")/restaurar.sh --ensayo"
echo
