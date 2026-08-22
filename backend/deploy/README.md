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

## 6. Servicio

```
sudo mkdir -p /etc/altus
sudo cp ~/altus/backend/.env /etc/altus/backend.env
sudo chown root:altus /etc/altus/backend.env && sudo chmod 640 /etc/altus/backend.env

sudo cp ~/altus/backend/deploy/altus.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now altus
systemctl status altus --no-pager
```

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
