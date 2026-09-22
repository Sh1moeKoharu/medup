# Manual de uso · Enfermería

Punto de venta Altus · tableta apaisada · versión del 14 de septiembre de 2026

Este manual describe lo que ve y lo que hace quien atiende en consultorio con el perfil
**Enfermería**. Está escrito para quien va a usar el sistema, no para quien lo programa, y cada
paso lleva la pantalla tal como se ve en la tableta.

Las capturas se tomaron con la cuenta de pruebas «Enfermería Pruebas» y pacientes de ejemplo. En
la clínica aparecerán los nombres reales.

---

## 1. Qué hace Enfermería

Enfermería **aplica lo que el médico indica y lleva su propio almacén**. Recibe en su bandeja las
recetas que el médico emitió, ve dónde hay existencia de cada medicamento, pide a Farmacia lo que
falte, ajusta lo que de verdad se usó y aplica la orden: el medicamento sale del almacén de
Enfermería y el consumo queda en la cuenta del paciente para que Caja lo cobre. Después deja su nota.

| Puede | No puede |
|---|---|
| Ver la **bandeja** de recetas del médico, con la **existencia** de cada medicamento en Enfermería y en Farmacia | Ver ni surtir las recetas de mostrador: son de Farmacia |
| **Pedir a Farmacia** lo que falta desde la misma orden | Surtir requisiciones ni tocar otros almacenes |
| **Añadir** material y **subir** cantidades | **Quitar o reducir** lo recetado sin escribir el motivo (20 caracteres o más) |
| **Aplicar** la orden: sale de su almacén y se carga a la cuenta del paciente | Cobrar nada: la cuenta la cobra Caja |
| Escribir **su nota** de Enfermería e imprimir la receta | Leer las **notas de atención del médico**: a Enfermería sólo le llega la receta |
| Ver el historial del paciente y corregir sus datos | Dar de baja pacientes |
| **Dar de baja** con motivo lo que se rompió o contaminó, en su almacén | Destruir lotes en cuarentena |
| Registrar **su turno** | Leer la bitácora del sistema ni entrar al panel |

Cada aplicación, ajuste, requisición y baja queda registrada con su nombre; los ajustes a lo que
recetó el médico, además, con su motivo, a la vista del médico, de Administración y de Auditoría.

---

## 2. Las pantallas de Enfermería

Seis pestañas abajo. Arriba, la barra de sesión: quién está trabajando, **Pausar** y **Salir**.

| Pestaña | Para qué sirve |
|---|---|
| **Productos** | El catálogo, para emitir una receta propia |
| **Pacientes** | El directorio, con **los que tienen orden pendiente primero** |
| **Bandeja** | Las órdenes del médico pendientes de aplicar. **Es la pantalla de entrada** |
| **Mis recetas** | Lo que Enfermería ha emitido por su cuenta, con su estado |
| **Almacén** | Pedir a Farmacia, ver las requisiciones y dar de baja |
| **Ajustes** | **Mi turno** y los datos del equipo |

---

## 3. El día en consultorio, paso a paso

### 3.1 Entrar

Escribe tu **usuario** (`enfermeria`, o el que te dieron, sin arroba) y tu contraseña, y pulsa
**Entrar**.

![Pantalla de inicio de sesión con el usuario de enfermería escrito](img/enfermeria/01-inicio-de-sesion.png)

### 3.2 Aterrizas en la Bandeja

La **Bandeja** lista las órdenes que el médico emitió, la más reciente primero: paciente, hora,
médico, cuántos renglones y unidades.

![Bandeja con las órdenes pendientes de Jorge Villanueva y María Ramírez](img/enfermeria/02-bandeja.png)

### 3.3 Revisar al paciente

En **Pacientes**, los que tienen una **orden pendiente** aparecen primero, con su etiqueta. Busca por
nombre y abre el **Historial**: datos de contacto, expediente y recetas anteriores. Las notas que
ves son **las de Enfermería**; las notas de atención del médico no se muestran a Enfermería.

![Directorio con María y Jorge primero, marcados con Orden pendiente](img/enfermeria/03-pacientes-con-pendientes.png)

![Perfil de María Ramírez con su historial](img/enfermeria/04-ficha-de-paciente.png)

### 3.4 Dónde hay existencia, y pedir lo que falta

Toca una orden para abrirla. Cada medicamento muestra sus **indicaciones** y **cuánto hay en
Enfermería y en Farmacia**. Si a Enfermería no le alcanza, la cifra sale en rojo con **faltan N en
Enfermería**, y la tarjeta ofrece **Pedir faltantes a Farmacia**. Debajo, las **Notas para
Enfermería** que dejó el médico.

![Orden de Jorge: Amoxicilina con 0 en Enfermería y 37 en Farmacia, faltan 2](img/enfermeria/05-orden-con-faltantes.png)

**Pedir faltantes a Farmacia** crea la requisición con exactamente lo que falta, ligada a esta
orden, sin salir de la bandeja. La tarjeta pasa a decir **Requisición en camino**; cuando Almacén la
surta, dirá que la recibas en **Almacén**, y entonces se aplica.

![La misma orden con la requisición en camino](img/enfermeria/06-faltantes-pedidos.png)

### 3.5 Quitar o reducir, con motivo

Si hay que dar **menos** de lo que recetó el médico, o quitar un renglón, el sistema pide el
**motivo** ahí mismo, bajo el renglón: por qué se cambia, con **20 caracteres como mínimo**. El
contador dice cuánto falta; con el motivo suficiente se enciende **Confirmar**.

![Orden de María abierta con Paracetamol 2](img/enfermeria/07-orden-abierta.png)

![Bajar Paracetamol de 2 a 1 con el motivo escrito](img/enfermeria/08-reducir-con-motivo.png)

El cambio queda en la sección **Ajustes** de la orden: quién, de cuánto a cuánto y por qué. El médico
lo ve en Mis recetas, y Auditoría en el reporte de recetas.

![La orden con el ajuste registrado y su motivo](img/enfermeria/09-ajuste-registrado.png)

### 3.6 Añadir lo que se usó

En **Añadir material o medicamento** buscas lo que se usó y el médico no anotó (unos guantes, una
gasa). Añadir o subir cantidades no pide motivo, pero también queda en los ajustes.

![Orden con guantes añadidos y los dos ajustes anotados](img/enfermeria/10-orden-ajustada.png)

### 3.7 Aplicar la orden

**Aplicar (n)** —n es el total de unidades— pide confirmación: sale del almacén de Enfermería, se
carga a la cuenta del paciente para que Caja lo cobre, y **si a algo no le alcanza la existencia, no
se aplica nada**.

![Confirmación de aplicar la orden](img/enfermeria/11-confirmar-aplicar.png)

Aplicada, la tarjeta cambia a verde y dice qué salió y de qué **lote** (el que caduca antes,
siempre), cuánto queda y cuánto quedó **cargado a la cuenta del paciente**. Desde aquí se imprime la
receta y se escribe la nota.

![Orden aplicada: lotes descontados y cuenta del paciente cargada](img/enfermeria/12-orden-aplicada.png)

### 3.8 La nota de Enfermería

Escribe qué se aplicó y cómo respondió el paciente, y pulsa **Guardar** (o **Guardar e imprimir**).
Queda en el expediente ligada a esta orden, con tu nombre y la hora. Es independiente de las notas
para Enfermería del médico y de su nota de atención. **Listo** retira la tarjeta de la bandeja.

![Nota de Enfermería guardada](img/enfermeria/13-nota-guardada.png)

---

## 4. El almacén de Enfermería

### 4.1 Pedir a Farmacia

Además de pedir desde la bandeja, **Almacén** permite pedir cualquier cosa: busca el medicamento y
añádelo.

![Almacén de Enfermería con el buscador y las requisiciones](img/enfermeria/14-almacen.png)

Ajusta las **unidades** con − y +, añade una nota si hace falta y pulsa **Enviar requisición**.

![Requisición de 10 Paracetamol con nota para Farmacia lista para enviar](img/enfermeria/15-pedir-a-farmacia.png)

La requisición aparece en **Mis requisiciones** como **Pendiente en Farmacia**, con «0/10»: cero
surtidas de diez pedidas; ahí también está la que se pidió desde la bandeja. Mientras no se surta, se
puede **cancelar**.

![Requisiciones pendientes en Farmacia, con el botón de cancelar](img/enfermeria/16-requisicion-enviada.png)

Cuando Almacén surte, el estado cambia a **Surtida · confirma que llegó** y aparece **Confirmar que
llegó**: al pulsarlo, la existencia entra a tu almacén con el mismo lote. Si se surtió menos de lo
pedido, lo verás en la fracción (por ejemplo «6/10»).

### 4.2 Dar de baja

**Dar de baja** lista los lotes con existencia en Enfermería, el que caduca antes primero. Toca el
lote, escribe cuántas unidades y el **motivo**, y pulsa **Dar de baja**.

![Lote seleccionado con cantidad 1 y motivo «Ampolleta rota al abrir la caja»](img/enfermeria/17-dar-de-baja.png)

La confirmación repite lote, cantidad y motivo, y avisa: queda en el kardex, Administración
recibe el aviso, y no se puede deshacer.

![Confirmación de la baja con el motivo](img/enfermeria/18-confirmar-baja.png)

![Lista de lotes con la existencia ya descontada tras la baja](img/enfermeria/19-baja-registrada.png)

---

## 5. Recetas propias

Enfermería también puede emitir recetas desde **Productos**. **Mis recetas** muestra las que ha
emitido con su estado.

![Lista de recetas emitidas por Enfermería con sus estados](img/enfermeria/20-mis-recetas.png)

---

## 6. Lo que Enfermería no puede hacer, y cómo se ve

Si intenta entrar a una pantalla de Caja o de otro perfil por una dirección directa, el sistema la
devuelve a su bandeja. El servidor rechaza cualquier intento de cobrar, surtir recetas de mostrador,
leer las notas de atención del médico, reducir una receta sin motivo o leer la bitácora, aunque se
haga fuera de la aplicación.

![De vuelta en la bandeja tras intentar entrar a la caja](img/enfermeria/21-no-puede-caja.png)

---

## 7. Mi turno, pausar y salir

En **Ajustes → Mi turno**: ábrelo al empezar y ciérralo al terminar; tus horas cuentan para tu pago.

![Ajustes con el turno de Enfermería abierto](img/enfermeria/22-ajustes-turno-abierto.png)

**Pausar** bloquea la pantalla sin cerrar nada; para volver, tu contraseña y **Continuar**. **Salir**
pide **Confirmar salida**; las órdenes de la bandeja no se pierden (siguen pendientes).

![Pantalla de sesión en pausa pidiendo la contraseña](img/enfermeria/23-sesion-en-pausa.png)

![Barra de sesión pidiendo confirmar la salida](img/enfermeria/24-cerrar-sesion.png)

---

## 8. Si algo no sale

| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| «faltan N en Enfermería» en rojo | Tu almacén no alcanza para esa orden | **Pedir faltantes a Farmacia**; aplica cuando lo recibas |
| Al aplicar: «no se aplica nada» | A algún renglón no le alcanza la existencia | Recibe la requisición en Almacén, o reduce ese renglón con motivo |
| **Confirmar** apagado al reducir | El motivo tiene menos de 20 caracteres | Explica por qué se cambia la receta |
| «Surtida · confirma que llegó» y no te llegó nada | Se marcó surtida antes de entregar | No confirmes hasta tenerlo; habla con Almacén |
| No ves la nota del médico | Es a propósito: a Enfermería sólo le llega la receta | Lo que debas saber va en las notas para Enfermería |
| «Cuenta bloqueada» al entrar | Administración bloqueó tu cuenta | Habla con Administración |

---

*Este manual se genera a partir de un recorrido real del sistema. Las capturas se regeneran con
`npm run enfermeria` dentro de `docs/manual/`; el texto se revisa a mano cuando cambia una pantalla.*
