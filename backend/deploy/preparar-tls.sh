#!/usr/bin/env bash
#
# Pone TLS delante del sistema y cierra el puerto 9000.
#
#     sudo bash backend/deploy/preparar-tls.sh
#     sudo bash backend/deploy/preparar-tls.sh --ip 192.168.1.80 --nombre altus.clinica
#
# Se puede ejecutar las veces que haga falta. La segunda vez renueva el
# certificado del servidor reutilizando la misma autoridad, así que los equipos
# donde ya se instaló no hay que volver a tocarlos.
#
# ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
# Hoy todo viaja en claro por la red de la clínica: contraseñas incluidas.
# Cualquiera conectado al mismo wifi puede leer la sesión de un administrador.
#
# Y hay un segundo efecto, encadenado: Medusa marca la cookie de sesión como
# `Secure` en producción y el navegador se niega a guardar una cookie `Secure`
# servida por HTTP. Por eso hoy hace falta ALLOW_INSECURE_COOKIES=1, que es
# exactamente la bandera que no debe convivir con datos de pacientes. Con TLS
# desaparece la necesidad, y este script la quita.
#
# ── POR QUÉ UNA AUTORIDAD PROPIA Y NO LET'S ENCRYPT ─────────────────────────
# Let's Encrypt necesita un dominio público y llegar al servidor desde
# internet. Este servidor vive en la red interna de la clínica y no tiene ni
# una cosa ni la otra.
#
# La alternativa habitual —un certificado autofirmado suelto— es peor que
# inútil: el navegador avisa cada vez, y al cabo de una semana el personal ha
# aprendido a saltarse avisos de seguridad sin leerlos.
#
# Con una autoridad propia se firma una vez, se instala esa autoridad en los
# equipos de la clínica y a partir de ahí no hay ningún aviso. El coste es real
# y conviene saberlo antes de empezar: hay que pasar por cada equipo una vez.
#
# ── ORDEN, Y POR QUÉ IMPORTA ────────────────────────────────────────────────
# El certificado se emite, se pone en nginx y SE COMPRUEBA que responde por
# HTTPS antes de tocar la configuración del backend. Al revés —quitando primero
# ALLOW_INSECURE_COOKIES— un fallo en el certificado dejaría a todo el mundo sin
# poder iniciar sesión, incluido quien tuviera que arreglarlo.

set -uo pipefail

DIR_TLS="/etc/altus/tls"
CONFIG="/etc/altus/backend.env"
DIAS_CA=3650
DIAS_SERVIDOR=398

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

DIR_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Argumentos ──────────────────────────────────────────────────────────────

IP=""
NOMBRE="altus.clinica"
while [ $# -gt 0 ]; do
  case "$1" in
    --ip)     IP="${2:-}"; shift 2 ;;
    --nombre) NOMBRE="${2:-}"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

[ -z "$IP" ] && IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192|10|172)\.' | head -1)"
if [ -z "$IP" ]; then
  falla "no se pudo deducir la IP del servidor. Indícala:  $0 --ip 192.168.1.80"
  exit 1
fi

titulo "CONFIGURACIÓN"
echo "  IP     : $IP"
echo "  Nombre : $NOMBRE"
echo
echo "  El certificado servirá para las dos formas de entrar: escribiendo la IP"
echo "  o el nombre. Quien ya use la IP no tiene que cambiar nada."

# La IP va DENTRO del certificado. Si el router se la cambia, el certificado
# deja de valer para la dirección nueva — el mismo tropiezo de la mudanza.
aviso "reserva esta IP por MAC en el router antes de terminar"
echo "         Si el router se la cambia, el certificado deja de coincidir y"
echo "         los navegadores volverán a avisar."

# ── Comprobaciones ──────────────────────────────────────────────────────────

titulo "COMPROBACIONES"
for programa in openssl nginx curl; do
  command -v "$programa" >/dev/null 2>&1 || { falla "falta '$programa'"; exit 1; }
done
ok "herramientas presentes"

[ -r "$CONFIG" ] || { falla "no se puede leer $CONFIG"; exit 1; }
ok "configuración del backend accesible"

install -d -m 750 "$DIR_TLS"

# ── 1. Autoridad certificadora ──────────────────────────────────────────────
# Se crea UNA vez y se reutiliza siempre. Regenerarla obligaría a volver a
# instalarla en cada equipo de la clínica.

titulo "AUTORIDAD CERTIFICADORA"
if [ -s "$DIR_TLS/ca.crt" ] && [ -s "$DIR_TLS/ca.key" ]; then
  CADUCA_CA="$(openssl x509 -in "$DIR_TLS/ca.crt" -noout -enddate | cut -d= -f2)"
  ok "ya existe (caduca $CADUCA_CA); se reutiliza"
else
  openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$DIR_TLS/ca.key" -out "$DIR_TLS/ca.crt" \
    -days "$DIAS_CA" -sha256 \
    -subj "/C=MX/O=Clinica Altus/CN=Autoridad Altus" 2>/dev/null
  chmod 600 "$DIR_TLS/ca.key"
  chmod 644 "$DIR_TLS/ca.crt"
  ok "creada, válida $((DIAS_CA / 365)) años"
fi

# ── 2. Certificado del servidor ─────────────────────────────────────────────

titulo "CERTIFICADO DEL SERVIDOR"

EXT="$(mktemp)"
trap 'rm -f "$EXT"' EXIT
cat > "$EXT" <<EXTFIN
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @nombres

[nombres]
DNS.1 = $NOMBRE
DNS.2 = localhost
IP.1  = $IP
IP.2  = 127.0.0.1
EXTFIN

openssl req -newkey rsa:2048 -nodes \
  -keyout "$DIR_TLS/servidor.key" -out "$DIR_TLS/servidor.csr" \
  -subj "/C=MX/O=Clinica Altus/CN=$NOMBRE" 2>/dev/null

openssl x509 -req -in "$DIR_TLS/servidor.csr" \
  -CA "$DIR_TLS/ca.crt" -CAkey "$DIR_TLS/ca.key" -CAcreateserial \
  -out "$DIR_TLS/servidor.crt" -days "$DIAS_SERVIDOR" -sha256 \
  -extfile "$EXT" 2>/dev/null

rm -f "$EXT" "$DIR_TLS/servidor.csr"
chmod 600 "$DIR_TLS/servidor.key"
chmod 644 "$DIR_TLS/servidor.crt"

CADUCA="$(openssl x509 -in "$DIR_TLS/servidor.crt" -noout -enddate | cut -d= -f2)"
ok "emitido para $NOMBRE, $IP, localhost y 127.0.0.1"
ok "caduca el $CADUCA"

# 398 días y no más: Safari y iOS rechazan certificados de servidor con vida
# más larga, incluso de una autoridad instalada a mano.
echo
echo "  Para renovarlo cuando toque, basta con volver a ejecutar este script."
echo "  La autoridad no cambia, así que NO hay que volver a tocar los equipos."

# ── 3. Nginx ────────────────────────────────────────────────────────────────

titulo "NGINX"
RESPALDO_NGINX="/etc/nginx/sites-available/altus.antes-de-tls"
if [ -f /etc/nginx/sites-available/altus ]; then
  cp /etc/nginx/sites-available/altus "$RESPALDO_NGINX"
  ok "configuración anterior guardada en $RESPALDO_NGINX"
fi

cp "$DIR_DEPLOY/altus-nginx-tls.conf" /etc/nginx/sites-available/altus
ln -sfn /etc/nginx/sites-available/altus /etc/nginx/sites-enabled/altus
rm -f /etc/nginx/sites-enabled/default

if ! nginx -t 2>"$DIR_TLS/.nginx-test"; then
  falla "la configuración de nginx no es válida. Se revierte."
  sed 's/^/         /' "$DIR_TLS/.nginx-test" >&2
  [ -f "$RESPALDO_NGINX" ] && cp "$RESPALDO_NGINX" /etc/nginx/sites-available/altus
  rm -f "$DIR_TLS/.nginx-test"
  exit 1
fi
rm -f "$DIR_TLS/.nginx-test"
systemctl reload nginx
ok "nginx escuchando en 443, con el 80 redirigiendo"

# ── 4. Comprobar ANTES de tocar el backend ──────────────────────────────────

titulo "COMPROBACIÓN DE HTTPS"
if curl -fsS --cacert "$DIR_TLS/ca.crt" --resolve "$NOMBRE:443:127.0.0.1" \
   "https://$NOMBRE/health" >/dev/null 2>&1; then
  ok "responde por HTTPS y el certificado valida"
else
  falla "HTTPS no responde correctamente. NO se tocará el backend."
  echo "         Revisa:  sudo nginx -t  y  sudo altus estado" >&2
  echo "         Para volver atrás:" >&2
  echo "           sudo cp $RESPALDO_NGINX /etc/nginx/sites-available/altus" >&2
  echo "           sudo systemctl reload nginx" >&2
  exit 1
fi

# ── 5. Ahora sí: backend ────────────────────────────────────────────────────

titulo "CONFIGURACIÓN DEL BACKEND"
cp "$CONFIG" "$CONFIG.antes-de-tls"
ok "configuración anterior guardada en $CONFIG.antes-de-tls"

# Escribe o reemplaza una variable, sin duplicarla.
poner() {
  local clave="$1" valor="$2"
  if grep -q "^${clave}=" "$CONFIG"; then
    sed -i "s|^${clave}=.*|${clave}=${valor}|" "$CONFIG"
  else
    printf '%s=%s\n' "$clave" "$valor" >> "$CONFIG"
  fi
}

# La bandera que ya no hace falta. Se comenta en lugar de borrarla, para que
# quede constancia de que estuvo y de por qué se fue.
if grep -q "^ALLOW_INSECURE_COOKIES=" "$CONFIG"; then
  sed -i "s|^ALLOW_INSECURE_COOKIES=.*|# ALLOW_INSECURE_COOKIES: ya no hace falta, hay TLS ($(date +%F))|" "$CONFIG"
  ok "ALLOW_INSECURE_COOKIES retirada"
else
  ok "ALLOW_INSECURE_COOKIES no estaba puesta"
fi

# ── El puerto 9000 ──────────────────────────────────────────────────────────
# No se cierra con cortafuegos: se deja de escuchar en él desde fuera.
#
# Una regla de cortafuegos es una segunda puerta que hay que recordar mantener
# cerrada. Que el proceso sólo acepte conexiones de la propia máquina es una
# puerta que no existe. Nginx le sigue hablando por 127.0.0.1, que es justo lo
# que se quiere: al backend se entra por el proxy, con TLS, y por ningún otro
# sitio.
poner HOST 127.0.0.1
ok "el backend sólo aceptará conexiones locales (puerto 9000 cerrado a la red)"

# Todo es del mismo origen a través de nginx, así que CORS casi no interviene;
# aun así se declaran las direcciones nuevas para que nada dependa de eso.
ORIGENES="https://${NOMBRE},https://${IP}"
for clave in ADMIN_CORS AUTH_CORS STORE_CORS; do
  actual="$(grep "^${clave}=" "$CONFIG" | cut -d= -f2- || true)"
  case "$actual" in
    *"https://${IP}"*) : ;;
    "") poner "$clave" "$ORIGENES" ;;
    *)  poner "$clave" "${actual},${ORIGENES}" ;;
  esac
done
ok "orígenes HTTPS declarados en CORS"

titulo "REINICIANDO EL BACKEND"
systemctl restart altus
for i in $(seq 30); do
  curl -fsS "http://127.0.0.1:9000/health" >/dev/null 2>&1 && break
  sleep 2
done

if curl -fsS "http://127.0.0.1:9000/health" >/dev/null 2>&1; then
  ok "el backend responde"
else
  falla "el backend NO responde tras el reinicio"
  echo
  echo "  ${NEGRITA}PARA VOLVER ATRÁS:${FIN}" >&2
  echo "    sudo cp $CONFIG.antes-de-tls $CONFIG" >&2
  echo "    sudo cp $RESPALDO_NGINX /etc/nginx/sites-available/altus" >&2
  echo "    sudo systemctl reload nginx && sudo systemctl restart altus" >&2
  exit 1
fi

# Que ya NO escuche hacia fuera es el objetivo; se comprueba, no se supone.
if ss -ltn 2>/dev/null | grep -qE '0\.0\.0\.0:9000|\[::\]:9000'; then
  aviso "el 9000 sigue escuchando en todas las interfaces"
  echo "         Comprueba que HOST=127.0.0.1 está en $CONFIG y reinicia."
else
  ok "el 9000 ya no escucha hacia la red"
fi

# ── 6. La autoridad, lista para repartir ────────────────────────────────────

titulo "AUTORIDAD PARA LOS EQUIPOS DE LA CLÍNICA"
install -d -m 755 /var/www/altus-pos/ca
cp "$DIR_TLS/ca.crt" /var/www/altus-pos/ca/altus-ca.crt
chmod 644 /var/www/altus-pos/ca/altus-ca.crt
ok "descargable desde  https://$IP/ca/altus-ca.crt"

cat <<INSTRUCCIONES

${NEGRITA}LISTO. Falta una vuelta por los equipos.${FIN}

  Mientras no se instale la autoridad, los navegadores avisarán de que el
  certificado no es de confianza. El aviso es correcto: todavía no saben quién
  lo firmó. Se hace una vez por equipo.

  ${NEGRITA}Descargar${FIN} en cada equipo:   https://$IP/ca/altus-ca.crt
  (aceptando el aviso esa única vez)

  ${NEGRITA}Windows${FIN}
    Doble clic → Instalar certificado → Equipo local
    → Colocar todos en: Entidades de certificación raíz de confianza

  ${NEGRITA}Firefox${FIN} (usa su propio almacén, no el de Windows)
    Ajustes → Privacidad y seguridad → Certificados → Ver certificados
    → Autoridades → Importar → marcar "Identificar sitios web"

  ${NEGRITA}Android${FIN}
    Ajustes → Seguridad → Cifrado y credenciales → Instalar un certificado
    → Certificado de CA

  Después, entrar por:   ${NEGRITA}https://$IP${FIN}

  ${AMARILLO}Los dispositivos que ya habían iniciado sesión${FIN} tienen guardada la
  dirección con http://. El POS la corrige solo, siempre que se haya desplegado
  la versión que trae ese arreglo. Si alguno se queda en blanco: cerrar sesión
  y volver a entrar.

  Para revisar el estado del certificado en cualquier momento:
      sudo altus tls

  ${NEGRITA}Volver atrás${FIN}, si hiciera falta:
      sudo cp $CONFIG.antes-de-tls $CONFIG
      sudo cp $RESPALDO_NGINX /etc/nginx/sites-available/altus
      sudo systemctl reload nginx && sudo systemctl restart altus

INSTRUCCIONES
