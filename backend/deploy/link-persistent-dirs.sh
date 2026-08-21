#!/usr/bin/env bash
#
# Enlaza el directorio de archivos subidos a una ruta persistente.
#
# POR QUÉ EXISTE
# Medusa sirve /static desde `<directorio de arranque>/static` con la ruta
# codificada en el framework ("Currently we don't allow configuration of static
# files"), así que apuntar `upload_dir` a otro lado hace que las subidas se
# guarden bien pero NO se puedan servir. Hace falta además este enlace.
#
# Y como `medusa build` borra y regenera `.medusa/server` en cada compilación,
# el enlace se pierde cada vez. Por eso lo invoca `ExecStartPre` en la unidad de
# systemd: se recrea en cada arranque, sin pasos manuales que olvidar.
#
# Uso:
#   ALTUS_DATA_DIR=/var/lib/altus ./link-persistent-dirs.sh /ruta/a/.medusa/server
#
# Sin ALTUS_DATA_DIR no hace nada y termina bien: el entorno local sigue
# funcionando relativo al directorio de trabajo.

set -euo pipefail

DATA_DIR="${ALTUS_DATA_DIR:-}"
SERVER_DIR="${1:-}"

if [ -z "$DATA_DIR" ]; then
  echo "[link-persistent-dirs] ALTUS_DATA_DIR no está definida; no hay nada que enlazar."
  exit 0
fi

if [ -z "$SERVER_DIR" ]; then
  echo "[link-persistent-dirs] ERROR: falta el directorio del servidor como argumento." >&2
  exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
  echo "[link-persistent-dirs] ERROR: no existe '$SERVER_DIR'. ¿Falta ejecutar 'npm run build'?" >&2
  exit 1
fi

mkdir -p "$DATA_DIR/static" "$DATA_DIR/reports"

LINK="$SERVER_DIR/static"

# Guarda de seguridad: más abajo se borra esta ruta, así que se verifica que sea
# exactamente la esperada y no algo heredado de un argumento mal formado.
case "$LINK" in
  */.medusa/server/static) ;;
  *)
    echo "[link-persistent-dirs] ERROR: ruta inesperada '$LINK'; se aborta por seguridad." >&2
    exit 1
    ;;
esac

# Si quedó un directorio REAL (por ejemplo de un arranque anterior sin enlace),
# se conserva su contenido antes de reemplazarlo. `-n` no sobrescribe lo que ya
# exista en destino: en un conflicto gana la copia persistente.
if [ -d "$LINK" ] && [ ! -L "$LINK" ]; then
  if [ -n "$(ls -A "$LINK" 2>/dev/null)" ]; then
    echo "[link-persistent-dirs] Migrando archivos existentes a $DATA_DIR/static"
    cp -rn "$LINK"/. "$DATA_DIR/static"/ || true
  fi
  rm -rf "$LINK"
fi

ln -sfn "$DATA_DIR/static" "$LINK"
echo "[link-persistent-dirs] $LINK -> $DATA_DIR/static"
