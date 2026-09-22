# Manual de uso · Almacén

Punto de venta Altus · tableta apaisada · versión del 14 de septiembre de 2026

Este manual describe lo que ve y lo que hace quien lleva el inventario de la clínica con el perfil
**Almacén**. Está escrito para quien va a usar el sistema, no para quien lo programa, y cada paso lleva
la pantalla tal como se ve en la tableta.

Las capturas se tomaron con la cuenta de pruebas «Almacén Pruebas». En la clínica aparecerán los
nombres reales.

---

## 1. Qué hace Almacén

Almacén **es el dueño del inventario**. Entra lo que se compra, sale lo que se traspasa o se da de baja,
y todo queda con su lote, su costo y su motivo. Tres cosas ocupan el día: dar de alta lo que llega con
los datos de la factura, surtir lo que Enfermería pide para el consultorio, y mantener el almacén al
corriente: mínimos, bajas, caducidades.

Antes esto lo hacía Farmacia. Desde septiembre de 2026 Farmacia sólo **surte recetas y consulta
existencias**; lo que mueve el inventario es de Almacén.

| Puede | No puede |
|---|---|
| Ver las **existencias** de los dos almacenes, con lotes, cuarentena y **costo** | Cobrar, abrir turno de caja ni imprimir tickets |
| Fijar el **mínimo y el máximo** de cada presentación en cada almacén | Surtir recetas de mostrador: eso es de Farmacia |
| **Surtir las requisiciones** de Enfermería, completas o en partes | Confirmar que llegaron: eso lo hace Enfermería al recibirlas |
| Dar de **alta lotes** con los datos de la factura y su costo | Editar ni borrar un lote ya registrado |
| Dar de **baja con motivo** en los dos almacenes (daño o ajuste) | Deshacer una baja o una destrucción |
| **Destruir** un lote en cuarentena, reconfirmando su contraseña | Leer recetas, notas de atención ni expedientes |
| Consultar el **kardex**, las **caducidades** y sacar **reportes de inventario** | Ver la bitácora ni la actividad del personal |
| Registrar **su turno** (sus horas cuentan para su pago) | Entrar al panel de administración |

Cada traspaso, alta, baja y destrucción queda en el kardex con el nombre de quien lo hizo.

---

## 2. Las pantallas de Almacén

Siete pestañas abajo. Arriba, la barra de sesión: quién está trabajando, **Pausar** y **Salir**.

| Pestaña | Para qué sirve |
|---|---|
| **Almacén** | Existencias por presentación, sus lotes y su mínimo. **Es la pantalla de entrada** |
| **Traspasos** | Lo que Enfermería pidió, pendiente de surtir |
| **Lotes** | El alta de lote, y la baja o la destrucción de un lote ya registrado |
| **Kardex** | Cada movimiento de inventario, con lote, motivo y persona |
| **Caducidad** | Lo que caduca en 90 días y lo que ya caducó |
| **Reportes** | Inventario valorizado, movimientos y caducidades, para Excel o impresos |
| **Ajustes** | Tu turno, los datos del equipo y cerrar sesión |

---

## 3. El día en el almacén, paso a paso

### 3.1 Entrar

Escribe tu **usuario** (`almacen`, o el que te dieron, sin arroba) y tu contraseña, y pulsa **Entrar**.

![Pantalla de inicio de sesión con el usuario de almacén escrito](img/almacen/01-inicio-de-sesion.png)

### 3.2 Lo primero: qué falta

Aterrizas en **Existencias**. Arriba, los dos almacenes; abajo, cada presentación con sus unidades **de
venta** (tabletas, cápsulas, piezas), no cajas. Lo que está **bajo su mínimo** se pinta de rojo y sube al
principio de la lista, con el aviso de cuántas presentaciones faltan.

![Existencias del almacén general, con lo que está bajo mínimo hasta arriba](img/almacen/02-existencias.png)

### 3.3 Abrir una presentación y fijar su mínimo

Toca una presentación para ver **sus lotes en ese almacén**, el que caduca antes primero, con su número,
su caducidad y su estante. Abajo, el **mínimo** y el **máximo** de esa presentación en ese almacén: el
mínimo dispara el aviso de cada mañana; el máximo es opcional y sirve para no sobrecomprar.

![Paracetamol abierto: su lote, su caducidad y el mínimo actual](img/almacen/03-presentacion-abierta.png)

Escribe y pulsa **Guardar**.

![Mínimo 20 y máximo 60 guardados, con el aviso de confirmación](img/almacen/04-minimo-guardado.png)

---

## 4. Traspasos a Enfermería

### 4.1 Lo que pidieron

**Traspasos** lista lo que Enfermería pidió: quién, cuándo, de qué almacén a cuál, su nota, y cada
medicamento con lo pedido. El campo de la derecha trae **lo que falta por surtir**. Si Enfermería lo
pidió desde su bandeja para aplicar una orden, la nota lo dice.

![Traspasos con una requisición pendiente de paracetamol](img/almacen/05-traspasos.png)

### 4.2 Surtir completo o en partes

Si no hay para todo, **cambia la cantidad**: el botón se ajusta solo. Lo que no se surta sigue pendiente y
se puede completar después.

![Cantidad bajada a la mitad de lo pedido](img/almacen/06-traspaso-parcial.png)

La confirmación repite qué sale de dónde y a dónde entra: **si a algún renglón no le alcanza la
existencia, no se mueve nada**.

![Confirmación del traspaso](img/almacen/07-confirmar-traspaso.png)

Surtido, la tarjeta sigue **Pendiente** hasta completarla. Abajo, en **Anteriores**, las últimas veinte
con su estado: **Surtida · en camino** mientras Enfermería no confirme que la recibió.

![Traspaso parcial y el historial de las anteriores](img/almacen/08-traspaso-surtido.png)

Lo traspasado **viaja con su costo promedio**: el almacén de Enfermería queda valorizado igual que el
general. La existencia entra a Enfermería cuando **Enfermería** pulsa «Confirmar que llegó», con el mismo
número de lote que salió de aquí.

---

## 5. Lotes: el almacén por dentro

### 5.1 La pantalla

**Lotes** tiene dos partes: arriba el **alta**, abajo los **lotes del almacén** filtrados por almacén y
por estado (Activos, En cuarentena, Todos).

![Pantalla de lotes, con el buscador del alta y la lista de lotes activos](img/almacen/09-lotes.png)

### 5.2 Dar de alta lo que llegó

Busca el medicamento, elígelo y **copia los datos de la factura**: número de lote, caducidad, cuántas
unidades de compra llegaron, cómo se llama esa unidad (caja), **cuántas unidades de venta trae cada una**
(12 cápsulas), cómo se llama la unidad de venta, la fecha de compra, el **costo por unidad de compra** y
el estante.

El renglón de abajo hace la cuenta antes de guardar: cuántas unidades de venta entran y cuánto cuesta
cada una. Ahí se cacha un cero de más.

![Alta de lote con los datos de la compra y la cuenta calculada](img/almacen/10-alta-de-lote.png)

**Registrar lote** guarda y avisa cuántas unidades entraron. El costo alimenta el inventario valorizado
y, si el producto tiene margen automático, fija su precio de venta.

![Aviso de lote registrado](img/almacen/11-lote-registrado.png)

### 5.3 Dar de baja con motivo

Toca un lote de la lista. Elige el tipo —**Daño, rotura o robo** o **Ajuste de inventario**—, escribe
cuántas unidades salen y el **motivo** (obligatorio, cinco letras o más).

![Lote seleccionado, 2 unidades y el motivo escrito](img/almacen/12-dar-de-baja.png)

La confirmación repite lote, cantidad y motivo, y avisa: queda en el kardex, Administración recibe el
aviso, y no se puede deshacer.

![Confirmación de la baja](img/almacen/13-confirmar-baja.png)

Confirmada, el lote muestra su nueva existencia.

![Lista de lotes con la existencia ya descontada](img/almacen/14-baja-registrada.png)

### 5.4 Destruir un lote en cuarentena

Lo que caduca pasa solo a **cuarentena**: deja de venderse pero sigue contado, porque físicamente sigue
ahí. Filtra por **En cuarentena**, toca el lote y escribe el motivo. Como la destrucción es irreversible,
se pide **tu contraseña** otra vez antes de asentarla.

![Lote en cuarentena, con el motivo y la contraseña para destruirlo](img/almacen/15-destruir-lote.png)

---

## 6. Kardex, caducidades y reportes

### 6.1 Kardex

**Kardex** es el libro del inventario: cada movimiento con su lote, su motivo y quién lo hizo. Filtra por
almacén, por periodo y por tipo. Arriba, el resumen del periodo: entradas, salidas y mermas.

![Kardex de los dos almacenes](img/almacen/16-kardex.png)

El filtro **Mermas** deja sólo lo que se perdió: bajas por daño, ajustes y caducidades, cada una con su
motivo. Es lo que se revisa al cierre de mes.

![Kardex filtrado por mermas](img/almacen/17-kardex-mermas.png)

### 6.2 Caducidades

**Caducidad** muestra lo que vence en los próximos 90 días y lo que ya venció, en cuatro casillas
(caducado, 30 días o menos, 31 a 60, 61 a 90). **Descargar CSV** se lo lleva a una hoja de cálculo.

![Caducidades de los dos almacenes](img/almacen/18-caducidades.png)

### 6.3 Reportes

**Reportes** trae tres: **Inventario valorizado** (existencia, costo promedio y valor por almacén),
**Movimientos de inventario** (el kardex de un periodo) y **Caducidades**. Elige uno, el almacén o el
periodo, revisa la muestra y pulsa **Descargar para Excel** o **Imprimir**: sale en hoja carta
horizontal con el membrete de la clínica, quién lo generó y cuándo.

![Reporte de inventario valorizado de los dos almacenes](img/almacen/19-reportes-inventario.png)

Cada exportación queda en la bitácora del sistema.

---

## 7. Ajustes y tu turno

**Mi turno**: ábrelo al empezar la jornada y ciérralo al terminar. Tus horas y tus turnos son la base del
pago por turno o por hora que fija RH. Debajo, con qué canal, región y ubicación trabaja este equipo, y
cerrar sesión.

![Ajustes de Almacén con el turno abierto](img/almacen/20-ajustes-turno.png)

---

## 8. Lo que Almacén no puede hacer, y cómo se ve

Si intenta entrar a una pantalla de Caja por una dirección directa, el sistema lo devuelve a sus
existencias. El servidor rechaza cualquier intento de cobrar, surtir una receta, leer una nota de
atención o la bitácora, aunque se haga fuera de la aplicación.

![De vuelta en Existencias tras intentar entrar a la caja](img/almacen/21-no-puede-caja.png)

---

## 9. Pausar y salir

**Pausar** bloquea la pantalla sin cerrar nada; para volver, tu contraseña y **Continuar**. **Salir** pide
**Confirmar salida**; un alta de lote a medio escribir se pierde.

![Pantalla de sesión en pausa pidiendo la contraseña](img/almacen/22-sesion-en-pausa.png)

![Barra de sesión pidiendo confirmar la salida](img/almacen/23-cerrar-sesion.png)

---

## 10. Si algo no sale

| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| Al surtir un traspaso: aviso de existencia y no pasa nada | A algún renglón no le alcanza la existencia | Surte menos, o da de alta el lote que acaba de llegar |
| Un traspaso sigue **Surtida · en camino** desde ayer | Enfermería no ha confirmado que lo recibió | Pídeles que confirmen; la existencia no entra a su almacén hasta entonces |
| Un lote aparece **En cuarentena** y no se puede traspasar | Caducó; el sistema lo saca cada mañana | Destrúyelo con motivo, o resérvalo para devolución al proveedor |
| «Entran N unidades» no cuadra con la factura | El factor (unidades de venta por unidad de compra) está mal | Corrígelo antes de registrar; un lote ya registrado no se edita, se ajusta con una baja |
| En el inventario valorizado una presentación sale **sin costo** | Sus entradas se registraron sin costo | Registra el costo en las próximas compras; lo anterior no se reescribe |
| «Cuenta bloqueada» al entrar | Administración bloqueó tu cuenta | Habla con Administración; tu clave sigue siendo la misma |

---

*Este manual se genera a partir de un recorrido real del sistema. Las capturas se regeneran con
`npm run almacen` dentro de `docs/manual/`; el texto se revisa a mano cuando cambia una pantalla.*
