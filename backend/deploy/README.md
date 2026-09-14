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

Se entra con **nombre de usuario**, no con correo. La persona escribe `director`;
lo que queda guardado es `director@sigh.local`. El sufijo lo pone
`src/lib/usuarios.ts`, y ahí está explicado por qué existe: el formulario de
acceso del panel de Medusa valida el formato de correo y viene compilado, así
que el identificador tiene que parecer uno aunque nadie lo escriba.

Producción, un administrador real:

```
npx medusa exec ./src/scripts/crear-admin.ts usuario=director
```

Genera la contraseña en el servidor y la muestra **una sola vez**.

> ⚠️ **No uses `npx medusa user`.** Crea la cuenta pero no le pone rol, y en
> este sistema el rol vive en `user.metadata.role`: una cuenta sin rol no tiene
> acceso a ninguna operación. `crear-admin.ts` lo estampa. El mismo comando
> repara una cuenta existente que se haya quedado sin rol, así que es también
> la vía de recuperación si alguien queda fuera.

Ensayo, los seis roles con contraseña pública:

```
SIGH_ALLOW_TEST_SEED=1 npm run seed
```

El seed vive en el código fuente (`src/scripts/`), no en el build: se corre
desde `~/altus/backend`, no desde `.medusa/server`.

Comprobación (ninguna cuenta debe aparecer como "(sin rol)"):

```
npx medusa exec ./src/scripts/migrate-roles.ts
```

### Número de empleado y correo de aviso

Cada cuenta lleva, además del rol, dos datos opcionales que se capturan en
Ajustes → Personal:

- **Número de empleado**: el de nómina o credencial. Sale en cada asiento de la
  bitácora junto al usuario, y es único, también frente a las cuentas dadas de
  baja. Para las cuentas que ya existían:

  ```
  npx medusa exec ./src/scripts/numerar-personal.ts
  npx medusa exec ./src/scripts/numerar-personal.ts usuario=caja numero=0003
  ```

- **Correo de aviso**: a dónde le llegan los avisos del sistema. Hace falta
  porque el usuario con el que se entra (`caja@sigh.local`) no es un buzón.
  Los avisos de caducidad van a las cuentas de Administración y Farmacia que
  lo tengan; `ALERTAS_EMAIL` queda como respaldo si ninguna lo tiene.

### El panel, sólo para Administración

`PANEL_SOLO_ADMINISTRACION=1` en `/etc/altus/backend.env` hace que sólo las
cuentas con rol de Administración obtengan sesión del panel; las demás reciben
403 al intentarlo —en la pantalla de acceso del panel sale el motivo— y el
botón «Panel» del punto de venta sólo se le enseña a Administración.

**Desde la fase 7 va en `1`.** Farmacia y Auditoría tienen su interfaz en el
punto de venta (ver «Almacén y Auditoría en el punto de venta», más abajo), así
que ya no necesitan el panel. Sólo se apaga si hay que dar acceso temporal a
otro perfil, y se vuelve a encender. La prueba de extremo a extremo la exige
encendida (sección 13).

### Una sola salida para el panel y el punto de venta

Administración entra a los dos, y cada uno guarda la sesión a su manera (el
panel con una cookie del servidor, el punto de venta con un token en el
navegador). Salir de uno cierra el otro **en el mismo navegador**: quien sale
escribe la cookie `altus_salida` con la hora, y el otro, al verla, cierra su
sesión. Es una cookie y no el almacenamiento del navegador porque ésta se
comparte entre puertos del mismo host, así que funciona igual detrás de nginx
que en desarrollo (4173 y 8081). No toca sesiones de otros equipos.

Las dos mitades viven en `backend/medusa-config.ts` (bloque `data-altus-sesion`)
y `frontend/utils/sesion-compartida.ts`. La prueba
`scripts-del-panel.unit.spec.ts` compila los scripts inyectados en el panel:
un error de sintaxis ahí no da ningún aviso, el panel carga y la función
simplemente no ocurre.

### Servidores que ya venían con correos

Las cuentas creadas antes del cambio siguen entrando con su correo completo
hasta que se conviertan. El script simula por omisión y no escribe nada:

```
npx medusa exec ./src/scripts/migrar-a-usuarios.ts
npx medusa exec ./src/scripts/migrar-a-usuarios.ts confirm
```

De `ana.torres@clinica.com.mx` saca `ana.torres`. **Las contraseñas no cambian**:
el hash vive en la identidad de acceso y sigue valiendo.

Lo que no puede convertir lo lista para resolverlo a mano: nombres con acentos o
mayúsculas, y dos correos distintos que darían el mismo usuario. Esas cuentas se
quedan como están y siguen entrando con su correo, así que nadie se queda fuera.

La bitácora **no se toca**. Va encadenada por huella digital y los asientos ya
escritos guardan el identificador de entonces; reescribirlos rompería la cadena.
El historial queda mezclado y eso es correcto.

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

### Dos almacenes

La existencia vive en los lotes (`medical_batch`), y cada lote pertenece a un
almacén: una ubicación de inventario de Medusa marcada con un área en su
metadata (`altus_area`: `pharmacy` o `nursing`; ver `src/lib/almacenes.ts`).
El mostrador y el surtido de recetas salen de **Farmacia**; lo que se consume
en consulta sale de **Enfermería**, que se abastece por requisición.

```
npx medusa exec ./src/scripts/sumar-existencias.ts             # total ANTES
npx medusa exec ./src/scripts/preparar-almacenes.ts            # simula
npx medusa exec ./src/scripts/preparar-almacenes.ts confirm    # marca Farmacia y crea Enfermería
npx medusa exec ./src/scripts/sumar-existencias.ts             # el MISMO total, ahora por almacén
```

Todo lo que había queda en Farmacia. Nada se mueve solo: lo que deba estar en
Enfermería se pasa con una requisición, que deja rastro en los dos kardex. Con
varias ubicaciones previas sin marcar, el script pide cuál es Farmacia
(`farmacia=<id>`); no adivina.

Mínimos y máximos por presentación y almacén se fijan en la ficha del producto;
el job `check-stock-levels` avisa cada mañana a Farmacia y Administración de lo
que esté bajo mínimo.

### Requisiciones y bajas

Lo que Enfermería necesita lo **pide** desde el punto de venta (pestaña
Almacén), Farmacia lo **surte** desde el panel (Requisiciones) y Enfermería
**confirma** que llegó. Surtir descuenta de Farmacia por caducidad más próxima
y entra a Enfermería con el mismo lote; quedan dos asientos en el kardex,
`exit_transfer` y `entry_transfer`, con la misma referencia. Si no alcanza para
todo, no se mueve nada.

Las **bajas** (rotura, contaminación, diferencia) salen con motivo obligatorio y
avisan a Administración por correo de aviso; Enfermería sólo sobre su almacén.
La destrucción sanitaria también exige motivo desde esta versión.

### Circuito clínico

El médico emite la orden **a Enfermería** (consulta) o **a Farmacia**
(mostrador). Lo de consulta lo aplica Enfermería desde su Bandeja en el punto
de venta: ajusta lo que se usó, sale de su almacén y **se carga a la cuenta del
paciente** (un pedido en borrador a su nombre) que Caja abre desde Pacientes →
«Cobrar cuenta» y cobra con el flujo de siempre. Lo de mostrador lo surte
Farmacia desde el panel, como antes.

La **nota de atención** la escriben médico y Enfermería; la leen ellos,
Administración y Auditoría (Caja no) y queda redactada en la bitácora. La
receta, la nota y el corte de caja salen por la impresora desde
`/admin/documents/{receta|nota|corte}/:id`.

### Caja

El turno es **por cajero**: cada quien abre el suyo con su fondo y «mi turno»
es el de mi cuenta. **Sin turno abierto no se cobra**: el servidor responde 409
al convertir el carrito y el punto de venta manda a abrirlo. Con tarjeta, la
**referencia de la terminal** (4 a 6 dígitos) es obligatoria y sale en el
ticket. Al cerrar, el **corte** sale por la impresora y se reimprime desde
Caja (últimos cortes) o desde el panel; el ticket se reimprime desde el
detalle del pedido. `GET /admin/cash-sessions/stats?group=day|week|month`
suma los turnos cerrados por periodo.

### Auditoría

`GET /admin/audit-logs` filtra por fecha (`from`/`to`), perfil, usuario, número
de empleado, acción y ruta, y pagina (`limit` hasta 200, `offset`, `count`).
Además de las escrituras se registran las **lecturas sensibles**: abrir la
ficha de un paciente, el expediente y las notas de atención (quién miró qué).
El kardex tiene pantalla en el panel (Kardex) y las caducidades se exportan en
CSV por almacén desde el widget o `GET /admin/expiring-inventory/export`.

### Cuentas y honorarios

Administración **cambia la contraseña** de cualquier cuenta y la **bloquea de
forma reversible** (Personal → Bloquear / Reactivar): la cuenta no entra ni
con un token previo, y al reactivarla vuelve con su misma contraseña. La baja
definitiva sigue siendo Deshabilitar.

El médico abre y cierra **su turno** desde Ajustes en el punto de venta.
Administración fija la **comisión** por médico (Honorarios en el panel; el
médico no la ve) y el reporte de pagos (`/admin/reports/doctor-payments`)
cuenta lo cobrado de sus órdenes de consulta —sólo cuando Caja ya cobró la
cuenta— por turno. `/admin/reports/revenue?group=doctor|shift|day|week|month`
da los ingresos.

### Almacén y Auditoría en el punto de venta

Desde la fase 7 **Farmacia** ya no comparte la interfaz de Caja ni ve el corte
de turno: entra a su propio grupo de pantallas (Almacén, Recetas, Traspasos,
Lotes, Kardex, Caducidad, Ajustes). Ahí ve las existencias por almacén con sus
lotes y fija mínimos y máximos; surte las recetas de mostrador (las que el
médico dirige a Farmacia); surte las requisiciones de Enfermería, completas o
parciales; da de alta lotes con los datos de la compra (unidad de compra,
factor, unidad de venta, fecha y costo, con el precio de venta previsto si el
producto tiene margen); da de baja con motivo y destruye lotes en cuarentena
reconfirmando su contraseña; y consulta el kardex y las caducidades con
descarga del CSV.

**Auditoría** también entra al punto de venta, todo de sólo lectura: Bitácora
(con los filtros de la fase 5 y «Ayer»), Kardex de los dos almacenes,
Caducidad con exportación por almacén, y Cortes de caja (cada turno cerrado
con lo esperado, lo contado y la diferencia, el corte impreso y el agregado
por semana o mes). No hay ningún botón de escritura; el servidor tampoco se
los aceptaría.

No hay migración ni script de puesta al día para esta fase: sólo compilar el
punto de venta y encender `PANEL_SOLO_ADMINISTRACION`.

### Endurecimiento (fase 8)

**Lo aplicado en consulta ya no sale dos veces.** El día simulado enseñó en el
kardex que, al cobrar Caja la cuenta de una consulta, el suscriptor de ventas
volvía a descontar de Farmacia el medicamento que Enfermería ya había aplicado
de su almacén. Cada renglón cargado a la cuenta lleva ahora la marca
`altus_consumido_en_consulta` y el suscriptor lo salta; lo que Caja añada a esa
misma cuenta desde el mostrador sí sale de Farmacia. Sección 12 de la prueba.

Las páginas del panel que antes decían «no hay nada» cuando el servidor
denegaba la lectura ahora dicen **«Sin acceso»**, con el recurso y a quién
acudir (`src/admin/lib/sin-acceso.tsx`). El barrido de texto en inglés y de
mayúscula a la inglesa (`node pruebas/verificar-cadenas.mjs`) y el guardián de contraste del punto de
venta (`cd frontend && node scripts/verificar-tokens.mjs`) forman parte de la
verificación de cada despliegue, junto a la prueba de extremo a extremo.

### Pacientes de prueba

```
npm run seed:patients
```

12 pacientes con expediente (8 particulares, 4 con convenio) y los 3 convenios
empresariales que los respaldan.

### Demostración completa, desde una base vacía

Para un servidor de **demostración**: borra la base, créala de nuevo y deja
todas las pantallas de los seis perfiles con contenido.

```
sudo systemctl stop altus
sudo -u postgres psql -c "DROP DATABASE altus;"
sudo -u postgres psql -c "CREATE DATABASE altus OWNER altus;"
cd ~/altus/backend
npx medusa db:migrate --execute-safe-links
sudo systemctl start altus
SIGH_ALLOW_TEST_SEED=1 npm run seed:demo
```

`seed:demo` hace dos cosas, en orden:

1. **Estructura**, sin servidor: tienda en pesos, región México, canal
   «Mostrador», los dos almacenes, las seis cuentas de prueba, el catálogo con
   lotes de caducidades escalonadas (uno ya en cuarentena), los pacientes con
   expediente y los convenios. Sustituye al asistente del punto de venta y a
   los seeds sueltos.
2. **Un día de trabajo** de cada perfil, por la API y con la cuenta de cada uno
   (`pruebas/sembrar-actividad.mjs`): recetas en todos sus estados,
   requisiciones completa, parcial, recibida y cancelada, compra con costo,
   bajas por daño y por ajuste, notas de atención, cuentas de paciente cobradas,
   ventas en efectivo, tarjeta y transferencia, dos cortes (uno cuadrado y otro
   con faltante de $20) y un turno médico con su comisión.

La actividad va por la API y no directo a la base porque la bitácora, el
kardex y la cuenta del paciente los escriben las rutas: así cada registro queda
con el nombre de quien lo hizo y la cadena de la bitácora íntegra. Por eso
necesita el servidor arrancado; si no responde, `seed:demo` deja lista la
estructura y dice que falta `npm run seed:actividad`.

- Todo queda con la **fecha del día** en que se corre: la API no deja fechar
  hacia atrás. El filtro «Ayer» de la bitácora sale vacío el primer día.
- Se puede repetir. La estructura busca antes de crear, y la actividad deja una
  marca en la tienda y no se repite salvo con `npm run seed:actividad -- otra-vez`.
- ⚠️ Crea las seis cuentas con la contraseña pública de pruebas, una de ellas de
  administrador. **Nunca sobre datos reales**; para quitarlas después,
  `limpiar-datos-prueba.ts`.

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

> ⚠️ **Si el servidor viene de una versión anterior a la eliminación del rol
> por omisión**, corre el paso 2b ANTES de reiniciar. Hasta entonces, una cuenta
> sin `metadata.role` se trataba como administrador; ahora no tiene acceso a
> nada. Si te la saltas, esas cuentas dejan de entrar al reiniciar y el síntoma
> no dice por qué (sí lo dice `sudo altus registro`, con una línea `[ROLES]`).

```
# 1 · Código y dependencias
cd ~/altus && git pull
cd backend && npm ci

# 2 · Variables nuevas (una sola vez)
sudo mkdir -p /var/lib/altus && sudo chown altus:altus /var/lib/altus
echo 'ALTUS_DATA_DIR=/var/lib/altus' | sudo tee -a /etc/altus/backend.env

# 2b · Roles explícitos (una sola vez, ANTES de reiniciar)
#      Primero simula: lista las cuentas "(sin rol)" que perderían el acceso.
npx medusa exec ./src/scripts/migrate-roles.ts
npx medusa exec ./src/scripts/migrate-roles.ts apply

# 2c · Nombres de usuario (una sola vez). Simula primero.
#      Avisa al personal ANTES: cambia con qué se entra, no la contraseña.
npx medusa exec ./src/scripts/migrar-a-usuarios.ts
npx medusa exec ./src/scripts/migrar-a-usuarios.ts confirm

# 2d · Nombre de la ficha invitado del POS (una sola vez). Sin esto, la tabla
#      de Pedidos enseña el correo de la ficha en la columna Paciente.
npx medusa exec ./src/scripts/nombrar-invitado-pos.ts confirm

# 2e · Codificación de los textos de la clínica.
#      El nombre de la tienda se veía como "Cl<?>nica Altus": se habia tecleado
#      con acentos en una consola de Windows, que no habla UTF-8 por omision, y
#      el byte se perdio al escribirse. Los valores buenos viven en el script.
npx medusa exec ./src/scripts/revisar-textos.ts
npx medusa exec ./src/scripts/revisar-textos.ts confirm

# 2f · Número de empleado de las cuentas que ya existen (una sola vez).
#      Lista quién no tiene y asigna uno por uno; no inventa ninguno.
npx medusa exec ./src/scripts/numerar-personal.ts
npx medusa exec ./src/scripts/numerar-personal.ts usuario=caja numero=0003

# 2g · Dos almacenes (una sola vez). ANTES de migrar apunta el total de
#      existencias; la migración no mueve nada y el total debe repetirse.
npx medusa exec ./src/scripts/sumar-existencias.ts        # apunta "Unidades"
#      ... (migraciones del paso 3) ...
npx medusa exec ./src/scripts/preparar-almacenes.ts        # simula
npx medusa exec ./src/scripts/preparar-almacenes.ts confirm
npx medusa exec ./src/scripts/sumar-existencias.ts        # el mismo total, ahora por almacén

# 2h · El panel, sólo para Administración (fase 7). Farmacia y Auditoría ya
#      tienen su interfaz en el punto de venta; sin esto siguen entrando al panel.
sudo sed -i 's|^PANEL_SOLO_ADMINISTRACION=.*|PANEL_SOLO_ADMINISTRACION=1|' /etc/altus/backend.env
grep -q '^PANEL_SOLO_ADMINISTRACION=' /etc/altus/backend.env || echo 'PANEL_SOLO_ADMINISTRACION=1' | sudo tee -a /etc/altus/backend.env

# 3 · Migraciones (fases 0 a 6: número de empleado en la bitácora, almacén en
#     lote y movimiento, políticas de existencia, requisiciones, destinatario y
#     cuenta en la orden médica, notas de atención, turnos y comisiones).
#     Todas añaden columnas o tablas; ninguna borra. Después, el paso 2g.
npx medusa db:migrate

# 4 · Compilar y reinstalar dependencias de ejecución
npm run build
cd .medusa/server && npm ci --omit=dev

# 5 · Servicio (la unidad cambia cuando se agregan ExecStartPre u otros)
sudo cp ~/altus/backend/deploy/altus.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart altus

# 6 · Punto de venta (cada fase lo cambia; ver la sección 8)
cd ~/altus/frontend && npm ci && npm run build:web
```

Qué script va con qué fase, para no adivinar: 2b y 2c vienen de antes del plan;
2f es la fase 0; 2g la fase 1; 2h la fase 7. Las fases 2 a 6 y la 8 sólo traen
migraciones (paso 3) y código. Después de todo, la prueba de extremo a extremo
contra el servidor (ver «Verificación tras un despliegue»).

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

## Respaldos

Los instala `instalar-servicios.sh` y corren solos.

| Cuándo | Qué |
|---|---|
| Cada noche, 02:30 | Respaldo cifrado → `/var/backups/altus` (se conservan 14 días) |
| Domingos, 04:00 | Ensayo de restauración sobre una base desechable |

```bash
sudo altus respaldo                                  # ¿hay copias? ¿sirven?
sudo systemctl start altus-respaldo.service          # respaldar ahora
sudo bash backend/deploy/restaurar.sh --listar       # qué copias hay
sudo bash backend/deploy/restaurar.sh --ensayo       # comprobar sin tocar nada
sudo bash backend/deploy/restaurar.sh <archivo>      # restaurar de verdad
```

**El ensayo es la mitad que importa.** El fallo clásico no es que el respaldo
no se haga: es que se hace durante meses, nadie lo prueba, y el día que hace
falta resultó que llevaba medio año guardando una base vacía. Por eso cada
respaldo lleva un manifiesto con el conteo de filas, y el ensayo restaura en una
base desechable y compara. Si los números cuadran, el respaldo sirve; y esa es
la única forma de saberlo.

Dentro del archivo van la base de datos, los archivos subidos y
`/etc/altus/backend.env`. La configuración va incluida a propósito: sin
`JWT_SECRET` ni `COOKIE_SECRET`, una base restaurada no da un sistema que
funcione. Por eso el conjunto se cifra —contiene la contraseña de la base— con
AES-256 y la frase de `/etc/altus/respaldo.pass`.

### Las dos cosas que hay que hacer a mano

1. **Sacar la frase de paso del servidor.** Se genera en la instalación y se
   muestra una sola vez. Mientras viva únicamente en `/etc/altus/respaldo.pass`,
   el disco que se lleve los datos se lleva también la llave, y las copias no se
   podrán abrir. Al gestor de contraseñas, o impresa.

2. **Configurar el destino externo**, en `/etc/altus/backend.env`:

   ```
   ALTUS_RESPALDO_DESTINO=usuario@equipo:/respaldos/altus/
   ```

   Sin esto las copias se quedan en la misma máquina que protegen, y el script
   lo avisa en cada ejecución. Un respaldo que vive en el disco que puede
   fallar no es un respaldo.

---

## TLS y el puerto 9000

```bash
sudo bash backend/deploy/preparar-tls.sh
sudo altus tls          # estado del certificado y de las dos puertas
```

Se puede repetir cuando haga falta: la segunda vez renueva el certificado del
servidor reutilizando la misma autoridad, así que **los equipos de la clínica no
hay que volver a tocarlos**.

### Por qué una autoridad propia

Let's Encrypt necesita un dominio público y llegar al servidor desde internet.
Este servidor vive en la red interna de la clínica y no tiene ninguna de las dos
cosas.

Un certificado autofirmado suelto sería peor que inútil: el navegador avisa cada
vez, y en una semana el personal ha aprendido a saltarse avisos de seguridad sin
leerlos. Con una autoridad propia se firma una vez, se instala en los equipos y
a partir de ahí no hay ningún aviso.

El coste conviene saberlo antes de empezar: **hay que pasar por cada equipo una
vez** para instalar la autoridad, descargable desde `https://<ip>/ca/altus-ca.crt`.
Firefox usa su propio almacén, aparte del de Windows.

### El puerto 9000 no se cierra con cortafuegos

Se pone `HOST=127.0.0.1` y el backend deja de escuchar hacia la red. Una regla
de cortafuegos es una segunda puerta que hay que acordarse de mantener cerrada;
un proceso que sólo acepta conexiones locales es una puerta que no existe. Nginx
le sigue hablando por `127.0.0.1`, que es exactamente lo que se quiere.

### El orden importa

El certificado se emite, se pone en nginx y **se comprueba que responde por
HTTPS** antes de tocar el backend. Al revés —quitando primero
`ALLOW_INSECURE_COOKIES`— un fallo en el certificado dejaría a todo el mundo sin
poder iniciar sesión, incluido quien tuviera que arreglarlo. El script se detiene
si la comprobación falla, y en cada paso deja escrito cómo volver atrás.

### Dos trampas conocidas

**La IP va dentro del certificado.** Si el router se la cambia, deja de coincidir
y vuelven los avisos — el mismo tropiezo de la mudanza. Hay que reservar la IP
por MAC en el router. `altus tls` compara la IP actual contra el certificado y
avisa si dejaron de coincidir.

**Sin HSTS, a propósito.** Diría al navegador "esta dirección siempre por https,
sin excusas", y si el certificado caduca o hay que volver atrás un rato, los
equipos se negarían a abrir el sistema hasta limpiarlos uno por uno. Además no
se aplica a direcciones IP, que es como entra casi todo el mundo aquí.

---
## Verificación tras un despliegue

Con el servidor en marcha:

```
cd ~/altus/backend
node pruebas/verificar-api.mjs
BASE=http://192.168.1.114 node pruebas/verificar-api.mjs   # contra otro servidor
node pruebas/verificar-cadenas.mjs                          # ni texto en inglés ni mayúscula inglesa
npm run test:unit                                          # 196 pruebas, incluidos el contraste del tema y los scripts del panel
(cd ../frontend && node scripts/verificar-tokens.mjs)       # contraste del punto de venta
```

213 comprobaciones de extremo a extremo: la matriz de permisos de los 6 roles contra
`lib/api-policy.ts`, que una ruta no declarada queda cerrada, que el expediente clínico sólo lo
lee quien atiende, el ciclo completo de dispensación (descuento, 409 por falta de existencia,
cancelación y asiento en el kardex), el alta y baja de personal, los cimientos (quién obtiene
sesión del panel; número de empleado único, validado y en la bitácora) y el inventario por
almacén (alta en unidades de compra, filtros por almacén, FEFO que no cruza almacenes, margen
automático que fija el precio, mínimos con aviso de desabasto), y las requisiciones y bajas (quién
pide y quién surte, 409 sin existencia, surtido parcial, kardex cuadrado en los dos almacenes, baja
con motivo y aviso, destrucción con motivo), y el circuito clínico (orden a Enfermería, ajuste,
aplicación con descuento y carga a la cuenta del paciente, nota de atención redactada en bitácora,
receta, nota y corte impresos), y la caja (turno por cajero, 409 sin turno, referencia de
terminal obligatoria y en el ticket, corte impreso y reimpreso, estadísticas por periodo), y la auditoría (filtros reales y paginación,
lecturas sensibles registradas, exportación de caducidades por almacén), y cuentas y honorarios
(bloqueo reversible que invalida el token, cambio de contraseña, turno médico, comisión y reporte
de pagos que cuenta sólo lo cobrado), y los perfiles y el cierre del panel (sólo Administración
obtiene la cookie del panel y los otros cinco reciben 403 con el motivo; Farmacia alcanza con su
token todo lo de su interfaz —existencias, kardex, caducidades y CSV, mínimos, bandeja de
mostrador, requisiciones— y ya no abre turno de caja; Auditoría lee bitácora, kardex, caducidades,
cortes y estadísticas, y no escribe nada). La sección 13 **exige la guardia del panel
encendida**; `PANEL_CERRADO=1` en el entorno de la prueba la exige además en la sección 6.
Necesita los dos almacenes de `preparar-almacenes.ts confirm`.

> ⚠️ **Escribe en la base**: crea y borra un usuario de prueba, emite y cancela órdenes médicas
> y descuenta existencias al surtir. No ejecutarlo contra datos reales. Necesita las cuentas de
> `npm run seed` y el catálogo de `seed-catalogo-demo.ts`.

Además, sin necesidad de servidor:

```
npm run test:unit
npx medusa exec ./src/scripts/verificar-bitacora.ts
```

## Pendientes conocidos

- **`MEDUSA_WORKER_MODE`**: si se separa en `server` + `worker`, debe existir
  una instancia `worker`. Los jobs `check-expirations` y
  `block-expired-batches` sólo corren ahí, y una instalación con puro `server`
  deja de bloquear lotes caducados sin emitir ningún error.
