# Despliegue del backend SIGH / Altus

Probado sobre Ubuntu 26.04 con Node 22, PostgreSQL 18 y Redis 8 (paquetes del
sistema; no hace falta NodeSource).

---

## 1. Dependencias

```
sudo apt update
sudo apt install -y git curl build-essential
sudo apt install -y nodejs npm postgresql postgresql-contrib redis-server
sudo npm install -g npm@10
timedatectl set-timezone America/Mexico_City
```

La zona horaria no es cosmética: los cortes de caja por turno y los jobs de
caducidad dependen de la fecha local.

Verificación:

```
node -v && npm -v && redis-cli ping && systemctl is-active postgresql
```

## 2. Base de datos

```
sudo -u postgres psql -c "CREATE USER altus WITH PASSWORD '<clave>';"
sudo -u postgres psql -c "CREATE DATABASE altus OWNER altus;"
psql -h localhost -U altus -d altus -c "select current_user, current_database();"
```

## 3. Código y configuración

```
cd ~ && git clone <repo> altus && cd altus/backend
cp .env.template .env
sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -hex 32)#" .env
sed -i "s#^COOKIE_SECRET=.*#COOKIE_SECRET=$(openssl rand -hex 32)#" .env
```

Luego editar `.env` a mano para `DATABASE_URL` y descomentar `REDIS_URL`.

> Se usa `-hex` en vez de `-base64` porque no produce `/` ni `+`, que se pelean
> con `sed` y con el parseo del `.env`.

Comprobación (debe devolver 4):

```
grep -cE '^(JWT_SECRET|COOKIE_SECRET|DATABASE_URL|REDIS_URL)=.+' .env
```

## 4. Build y migraciones

```
npm ci
npm run build
npx medusa db:migrate --execute-safe-links
```

`--execute-safe-links` evita un prompt interactivo que cuelga en automatización.

### ⚠️ Verificación obligatoria tras migrar

Una migración generada automáticamente llegó a incluir
`drop table inventory_movement`, porque el snapshot de `medical_inventory` aún
declaraba modelos ya eliminados. Está corregida, pero conviene comprobarlo en
cada base nueva: si esa tabla falta, se perdió el libro mayor de inventario.

```
psql -h localhost -U altus -d altus -c "select table_name from information_schema.tables where table_name in ('inventory_movement','medical_batch','audit_log','b2b_agreement','medical_order','cash_session') order by 1;"
```

Deben aparecer las 6.

## 5. Usuarios

Producción, un administrador real:

```
npx medusa user -e admin@tudominio.mx -p '<clave fuerte>'
```

Ensayo, los seis roles con contraseña pública:

```
SIGH_ALLOW_TEST_SEED=1 npm run seed
```

El seed vive en el código fuente (`src/scripts/`), no en el build: se corre
desde `~/altus/backend`, no desde `.medusa/server`.

## 6. Servicios

Un solo comando deja el equipo listo para funcionar sin nadie delante:

```
sudo cp ~/altus/backend/.env.template /etc/altus/backend.env   # sólo la primera vez
sudo nano /etc/altus/backend.env                                # rellenar y guardar

sudo bash ~/altus/backend/deploy/instalar-servicios.sh
```

El instalador es idempotente: se puede repetir las veces que haga falta.

### Qué deja hecho

| | |
|---|---|
| Unidad de systemd | instalada con las rutas **reales** de esta copia del repositorio, no las de ejemplo |
| Arranque automático | PostgreSQL, Redis, Nginx y el backend marcados para arrancar al encender |
| Suspensión | bloqueada, para que el equipo no se duerma solo |
| Mando `altus` | instalado en `/usr/local/bin/altus` |
| Comprobación | ejecuta un diagnóstico al terminar y dice si algo quedó mal |

### Arranque sin iniciar sesión

Es lo que hace `systemctl enable`. Los servicios los levanta **systemd durante
el arranque del sistema**, antes de que aparezca la pantalla de acceso y con
total independencia de que alguien entre con usuario y contraseña. La sesión de
escritorio no interviene: se puede dejar el servidor encendido sin monitor ni
teclado y el punto de venta responde igual.

Para comprobarlo de verdad, reinicia el equipo y, **sin iniciar sesión**, abre
el POS desde otra máquina de la red.

### Uso diario

```
sudo altus estado          # qué está en marcha y qué no (no cambia nada)
sudo altus reiniciar       # si algo va raro
sudo altus registro        # últimas 80 líneas del backend
sudo altus registro seguir # registro en vivo
```

`sudo altus estado` avisa de un caso que de otro modo pasa inadvertido: un
servicio **en marcha pero sin arranque automático**. Funciona hasta el próximo
corte de luz y entonces ya no vuelve.

### Decisiones de la unidad de systemd

`Wants=` en lugar de `Requires=` sobre PostgreSQL y Redis. Con `Requires`, si
una dependencia tropieza, systemd detiene también el backend y lo deja parado
hasta que alguien lo levante a mano — y en la clínica no hay quien lo haga. Con
`Wants` + `Restart=always` el backend reintenta hasta que la base responde.

`StartLimitIntervalSec=0`. Por omisión systemd se rinde tras unos pocos
arranques fallidos seguidos. Sin nadie que intervenga, es preferible que siga
intentándolo.

---

## 7. Carga de datos

### Inventario (desde el Excel del almacén)

El archivo NO vive en el repo: contiene existencias, laboratorios y facturas
reales. Cópialo al servidor (AnyDesk tiene transferencia de archivos) y corre
primero la simulación:

```
npx medusa exec ./src/scripts/import-inventory.ts ~/inventario.xlsx
npx medusa exec ./src/scripts/import-inventory.ts ~/inventario.xlsx apply
```

Reporta las filas que no puede interpretar en vez de inventar datos. Es
idempotente por `handle` de producto y por número de lote.

### Pacientes de prueba

```
npm run seed:patients
```

12 pacientes con expediente (8 particulares, 4 con convenio) y los 3 convenios
empresariales que los respaldan.

---

## 8. Punto de venta (POS)

El cobro NO vive en el panel de administración: es una aplicación aparte
(`frontend/`, hecha con Expo). El panel sólo tiene el *corte* de caja.

### Compilar

La URL del servidor se **hornea en el bundle** al compilar, así que hay que
fijarla antes:

```
cd ~/altus/frontend
npm ci
echo 'EXPO_PUBLIC_MEDUSA_API_URL=http://192.168.1.114' > .env
npm run build:web
```

Sustituye la IP por la del servidor (o el dominio, cuando lo haya). Si cambia,
hay que recompilar.

### Publicar

```
sudo mkdir -p /var/www/altus-pos
sudo cp -r dist/* /var/www/altus-pos/
sudo chown -R www-data:www-data /var/www/altus-pos
```

### Nginx

```
sudo apt install -y nginx
sudo cp ~/altus/backend/deploy/altus-nginx.conf /etc/nginx/sites-available/altus
sudo ln -sfn /etc/nginx/sites-available/altus /etc/nginx/sites-enabled/altus
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

A partir de aquí todo se sirve desde **un mismo origen**, lo que elimina CORS:

| Dirección | Qué es |
|---|---|
| `http://192.168.1.114/` | POS |
| `http://192.168.1.114/app` | Panel de administración |
| `http://192.168.1.114/admin`, `/auth`, `/store` | API |

Con Nginx delante puedes simplificar los orígenes en `/etc/altus/backend.env`,
porque ya no hay peticiones entre orígenes distintos:

```
sudo sed -i 's|^ADMIN_CORS=.*|ADMIN_CORS=http://192.168.1.114|' /etc/altus/backend.env
sudo sed -i 's|^AUTH_CORS=.*|AUTH_CORS=http://192.168.1.114|' /etc/altus/backend.env
sudo sed -i 's|^MEDUSA_BACKEND_URL=.*|MEDUSA_BACKEND_URL=http://192.168.1.114|' /etc/altus/backend.env
sudo systemctl restart altus
```

### Primer arranque del POS

Al entrar pide región, canal de venta y ubicación de inventario; trae un
asistente que los crea. Son datos de Medusa que la base nueva no tiene.

> ⚠️ **Los productos importados no tienen precio.** El Excel del almacén trae
> lote, caducidad y existencia, pero ninguna columna de precio de venta. El POS
> mostrará el catálogo y permitirá armar el carrito, pero los importes saldrán
> en cero. Para probar cobros de verdad hace falta una lista de precios.

---

## Puesta al día de un servidor ya montado

Orden importa: las variables antes de compilar, y el servicio antes de
arrancar.

```
# 1 · Código y dependencias
cd ~/altus && git pull
cd backend && npm ci

# 2 · Variables nuevas (una sola vez)
sudo mkdir -p /var/lib/altus && sudo chown altus:altus /var/lib/altus
echo 'ALTUS_DATA_DIR=/var/lib/altus' | sudo tee -a /etc/altus/backend.env

# 3 · Compilar y reinstalar dependencias de ejecución
npm run build
cd .medusa/server && npm ci --omit=dev

# 4 · Servicio (la unidad cambia cuando se agregan ExecStartPre u otros)
sudo cp ~/altus/backend/deploy/altus.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart altus
```

Verificación mínima después de cada actualización:

```
systemctl status altus --no-pager | head -5
ls -l ~/altus/backend/.medusa/server/static     # debe ser un enlace
curl localhost:9000/health
```

### Acceso desde otros equipos de la red

Los orígenes CORS y la URL pública se declaran explícitamente. Sustituye la IP:

```
sudo sed -i 's|^ADMIN_CORS=.*|ADMIN_CORS=http://localhost:9000,http://192.168.1.114:9000|' /etc/altus/backend.env
sudo sed -i 's|^AUTH_CORS=.*|AUTH_CORS=http://localhost:9000,http://192.168.1.114:9000|' /etc/altus/backend.env
echo 'MEDUSA_BACKEND_URL=http://192.168.1.114:9000' | sudo tee -a /etc/altus/backend.env
sudo systemctl restart altus
```

Sin esto el admin carga pero falla al autenticar, y las imágenes de producto
apuntarían a `localhost` desde el dispositivo del usuario.

---

## Dos trampas que cuestan una tarde

**El servidor se ejecuta desde `.medusa/server`, no desde la raíz.**
`medusa build` genera ahí un proyecto autónomo con su propio `package.json`.
Arrancar en la raíz falla con
`Could not find index.html in the admin build directory`. Tras cada build hay
que reinstalar dependencias en ese directorio:

```
cd ~/altus/backend/.medusa/server && npm ci --omit=dev
```

**Sin TLS, el admin no mantiene la sesión.**
Con `NODE_ENV=production` el framework marca la cookie como `Secure`, y el
navegador se niega a guardarla sobre HTTP: el login funciona y acto seguido
rebota a la pantalla de inicio, sin mostrar error.

En un servidor de ensayo sin certificado se puede puentear con
`ALLOW_INSECURE_COOKIES=1`. **Nunca con datos reales**: la cookie de sesión
viajaría en claro y cualquiera en la red podría secuestrar una sesión de
administrador. La solución correcta es poner TLS delante.

---

## Pendientes conocidos

- **Respaldos**: `pg_dump` cifrado y fuera del servidor. Un respaldo que vive
  en la misma máquina no es un respaldo; y uno que nunca se restauró tampoco
  cuenta.
- **Nginx + TLS**: requisito real, no un extra (ver la trampa de la cookie).
- **`MEDUSA_WORKER_MODE`**: si se separa en `server` + `worker`, debe existir
  una instancia `worker`. Los jobs `check-expirations` y
  `block-expired-batches` sólo corren ahí, y una instalación con puro `server`
  deja de bloquear lotes caducados sin emitir ningún error.
