# Manual de uso · Caja / Recepción

Punto de venta Altus · tableta apaisada · versión del 14 de septiembre de 2026

Este manual describe lo que ve y lo que hace la persona que atiende el mostrador con el perfil
**Caja / Recepción**. Está escrito para quien va a usar el sistema, no para quien lo programa: no
hay términos técnicos y cada paso lleva la pantalla tal como se ve en la tableta del mostrador.

Las capturas se tomaron con la cuenta de pruebas «Caja Pruebas» y pacientes de ejemplo. En la
clínica aparecerán los nombres reales.

---

## 1. Qué hace Caja

Caja cobra. Es el perfil que convierte lo que la clínica entrega en dinero registrado: abre el
turno con un fondo, vende lo que se pide en mostrador, cobra lo que se consumió en consulta,
registra las entradas y salidas de efectivo, y cierra el turno con un corte que dice cuánto
debería haber en el cajón y cuánto hay.

| Puede | No puede |
|---|---|
| Abrir y cerrar **su** turno de caja, con fondo inicial y corte impreso | Abrir caja mientras otra persona tenga la suya abierta: hay **una sola caja** en la clínica |
| Vender productos de mostrador en efectivo, tarjeta o transferencia | Cobrar sin turno abierto: el sistema lo impide |
| Cobrar con tarjeta **sólo** con la referencia de la terminal (4 a 6 dígitos) | Completar un cobro con tarjeta sin esa referencia |
| Cobrar la **cuenta de consulta** de un paciente (lo que Enfermería le aplicó) | Cambiar lo que Enfermería aplicó ni ver la nota de atención |
| Dar de alta pacientes (nombre, apellidos y teléfono; **sin correo**) y corregir sus datos | Dar de baja a un paciente ni leer su expediente clínico |
| Ver las órdenes cobradas y **reimprimir** cualquier ticket | Cancelar, devolver o modificar una venta ya cobrada |
| Registrar entradas y salidas de efectivo con su descripción | Tocar el inventario: lotes, existencias, caducidades y traspasos son de Almacén |
| Reimprimir cortes anteriores | Consultar la bitácora de actividad (es de Administración y Auditoría) |
| Configurar la impresora de tickets de su equipo | Entrar al panel de administración |

Todo lo que Caja hace queda registrado con su nombre y su número de empleado en la bitácora del
sistema, incluidas las entradas y salidas de efectivo y cada corte.

---

## 2. Las pantallas de Caja

Al entrar, Caja ve cinco pestañas en la parte de abajo. Arriba siempre está la **barra de
sesión**: quién está trabajando y con qué perfil, el acceso a la impresora, **Pausar** y **Salir**.

| Pestaña | Para qué sirve |
|---|---|
| **Productos** | El catálogo. Buscar, escanear y añadir al carrito, que va a la derecha |
| **Órdenes** | Lo ya cobrado. Ver el detalle y reimprimir el ticket |
| **Pacientes** | El directorio. Dar de alta, corregir datos y **cobrar la cuenta de consulta** |
| **Caja** | El turno: abrirlo, ver el resumen, entradas y salidas, y el corte |
| **Ajustes** | Canal, región, ubicación de inventario e impresión |

No aparecen para Caja: **Actividad** (la bitácora), el botón **Panel**, ni nada de almacén.

---

## 3. El turno, paso a paso

### 3.1 Entrar

Escribe tu **usuario** (sin arroba ni dominio: sólo `caja`, o el que te dieron) y tu contraseña,
y pulsa **Entrar**. La dirección del servidor ya viene puesta; sólo se cambia si te lo pide
Administración.

![Pantalla de inicio de sesión con usuario y contraseña escritos](img/caja/01-inicio-de-sesion.png)

### 3.2 Aterrizas en la Caja

Al entrar, el sistema te lleva directo a la pestaña **Caja**. Lo primero que verás ahí es la lista
**Por cobrar**: cada paciente al que Enfermería ya aplicó su consulta, con el importe y un botón
**Cobrar** en la misma fila. Debajo, en gris, quien está todavía en consulta aparece como
**Esperando a Enfermería**: el médico ya emitió la orden, pero hasta que Enfermería la aplique no
hay cuenta que cobrar — no la armes a mano desde el mostrador. La lista se actualiza sola.

Con la caja cerrada la lista se ve igual, pero **Cobrar** está apagado y dice por qué: abre la
caja primero.

 En la clínica hay **una sola caja**: si
otra persona dejó la suya abierta, lo verás en el aviso amarillo, con su nombre y la hora a la que
la abrió, y **Abrir caja** estará apagado. Pide que la cierren con su corte; la pantalla se
actualiza sola en cuanto la cierran.

![Caja ocupada: abierta por Admin Pruebas, con el botón de abrir apagado](img/caja/02-caja-ocupada.png)

### 3.3 Abrir el turno con el fondo de caja

Con la caja libre, la pantalla te muestra quién eres (no se puede cambiar: el turno queda a tu
nombre) y te pide el **fondo inicial**, el efectivo con el que empieza el cajón. Escríbelo y pulsa
**Abrir caja**. Debajo están los **cortes anteriores**, por si hay que reimprimir alguno.

![Pantalla de caja cerrada con el fondo inicial de 500 escrito](img/caja/03-caja-cerrada-fondo.png)

Al abrir, el sistema **actualiza todos los datos** (existencias, pacientes, precios) y te lleva a
**Productos**, listo para la primera venta.

![Catálogo recién actualizado tras abrir la caja](img/caja/04-productos-tras-abrir.png)

En la pestaña Caja, con el turno abierto, está el **resumen del turno**: total vendido, número de
transacciones, ventas por método de pago y el **efectivo esperado en caja**, que empieza siendo
el fondo.

![Resumen del turno recién abierto con 500 de fondo y ventas en cero](img/caja/05-caja-abierta.png)

### 3.4 Vender en mostrador y cobrar en efectivo

Vuelve a **Productos**. Escribe en el buscador o usa el botón de **código de barras** (a la
derecha del buscador) para escanear.

![Búsqueda de Paracetamol en el catálogo](img/caja/06-productos-buscar.png)

Toca el producto (o su «+») para añadirlo al carrito. Si lo tocas dos veces, **se suma al mismo
renglón**: aquí dos cajas de Paracetamol. En el carrito puedes cambiar la cantidad con − y +,
quitar un renglón con el bote de basura, **añadir un paciente** para que la venta quede en su
historial, y aplicar una promoción si la hay. Pulsa **Cobrar**.

![Carrito con dos cajas de Paracetamol y el total de 90](img/caja/07-carrito-con-producto.png)

En la pantalla de **Cobro** eliges el método de pago. Con **Efectivo**, escribe cuánto te dieron y
el sistema calcula el **cambio**. El número de receta es opcional: sirve cuando el paciente trae
una receta de fuera. Pulsa **Completar orden**.

![Cobro en efectivo: total 90, recibido 100, cambio 10](img/caja/08-cobro-efectivo.png)

Al pulsar **Completar orden** se abre de inmediato la **impresión del recibo**. La venta queda
registrada, aparece el aviso «Venta registrada» y vuelves al catálogo con el carrito vacío para la
siguiente. Si el recibo no salió, se reimprime desde **Órdenes**. Quien no tenga impresora en su
equipo puede apagar «Imprimir al terminar la venta» en Ajustes → Impresión: entonces, en lugar de
imprimir, el sistema ofrece imprimir, ver la venta o volver al catálogo.

![Aviso de venta registrada con el catálogo listo para la siguiente venta](img/caja/09-venta-registrada.png)

### 3.5 Cobrar con tarjeta: la referencia de la terminal

Con **Tarjeta** aparece un campo más: la **referencia de la terminal**, los 4 a 6 dígitos del
comprobante que imprime la terminal bancaria. Mientras no la escribas, **Completar orden se queda
apagado**: no hay forma de registrar un cobro con tarjeta sin su comprobante.

![Cobro con tarjeta sin referencia: el botón de completar está apagado](img/caja/10-cobro-tarjeta-sin-referencia.png)

Con la referencia escrita, el botón se enciende. La referencia sale impresa en el ticket y queda
en el corte.

![Cobro con tarjeta con la referencia 4512 y el botón encendido](img/caja/11-cobro-tarjeta-con-referencia.png)

### 3.6 Ver lo cobrado y reimprimir un ticket

En **Órdenes** están las ventas, la más reciente primero, con su número, la fecha, a quién se
le vendió (o «Venta de mostrador») y el importe. Se pueden buscar y filtrar por estado y fechas.

![Lista de órdenes con número, paciente e importe](img/caja/12-ordenes.png)

Al tocar una orden se abre su detalle: los renglones, el estado y el resumen. El botón
**Reimprimir recibo** vuelve a mandar el ticket a la impresora, las veces que haga falta.

![Detalle de una orden con el botón de reimprimir recibo](img/caja/13-detalle-de-orden.png)

> Nota: los estados «Sin pagar» y «Sin surtir» que se ven en el detalle son estados internos del
> sistema de pedidos y **no** significan que falte cobrar: la venta ya está registrada en tu
> turno. Está anotado para corregirlo en una versión próxima.

### 3.7 Pacientes: alta, ficha y cuenta de consulta

**Pacientes** es el directorio. Se busca por nombre o teléfono, y cada tarjeta lleva a los
**Detalles**.

![Directorio de pacientes con el botón Nuevo paciente](img/caja/14-pacientes.png)

**Nuevo paciente** abre el alta: nombre, apellidos y teléfono (opcional). Los pacientes **no llevan
correo**. Con eso basta para que el
médico lo atienda. El expediente clínico no lo captura Caja.

![Formulario de alta de paciente](img/caja/15-nuevo-paciente.png)

En la ficha de un paciente se ven sus datos de contacto, sus compras anteriores y, cuando la hay,
la **cuenta pendiente**: lo que Enfermería le aplicó en consulta y todavía no se ha cobrado, con
quién lo aplicó. El botón **Cobrar cuenta** la lleva al cobro.

![Ficha de María Ramírez con una cuenta pendiente de 90 y el botón Cobrar cuenta](img/caja/16-ficha-de-paciente.png)

La cuenta se cobra igual que una venta: método de pago, efectivo recibido o referencia de
tarjeta, y **Completar orden**. Si el paciente además compra algo de mostrador, se puede añadir al
mismo cobro desde Productos antes de completar.

![Cobro de la cuenta de consulta: 2 Paracetamol, total 90](img/caja/17-cobro-de-cuenta.png)

### 3.8 Entradas y salidas de efectivo

Cuando entra o sale dinero del cajón sin ser una venta —cambio de billetes, un retiro parcial,
un pago a proveedor autorizado— se registra en **Caja** con **Entrada** o **Salida**: monto y
descripción. Así el efectivo esperado sigue cuadrando.

![Diálogo de entrada de efectivo: 200, cambio de billetes](img/caja/18-caja-entrada-de-efectivo.png)

El resumen del turno lo refleja de inmediato: aquí, tres ventas (180 en efectivo y 38 con
tarjeta), una entrada de 200, y un efectivo esperado de 880 = fondo 500 + efectivo 180 + entrada
200. Las ventas con tarjeta **no** suman al efectivo del cajón.

![Resumen del turno con 218 vendidos y 880 de efectivo esperado](img/caja/19-caja-resumen-del-turno.png)

### 3.9 El corte

Al terminar el turno, pulsa **Hacer corte de caja**. Cuenta el efectivo del cajón y escríbelo: el
sistema lo compara con lo esperado y te dice si la **caja cuadra**, o si hay **sobrante** o
**faltante** y de cuánto. Puedes anotar observaciones. Al pulsar **Cerrar caja**, el corte se
imprime solo.

![Corte de caja: esperado 880, contado 880, caja cuadrada](img/caja/20-corte-de-caja.png)

Cerrado el turno, la pestaña Caja vuelve al estado inicial y el corte aparece el primero en
**Cortes anteriores**, listo para reimprimirse.

![Caja cerrada con el corte recién hecho en la lista de cortes anteriores](img/caja/21-caja-cerrada-cortes-anteriores.png)

### 3.10 Ajustes e impresión

**Ajustes** muestra el canal de venta, la región (moneda e impuestos) y la ubicación de inventario
del equipo. Son datos que configura Administración; Caja sólo los ve, salvo en la puesta en
marcha de una tableta nueva.

![Pantalla de ajustes con canal, región, ubicación e impresión](img/caja/22-ajustes.png)

La **impresión** también está a un toque desde la barra de sesión (el icono de impresora). Aquí está
«Imprimir al terminar la venta», encendido de fábrica, y se prueba con un ticket. La impresora en sí se elige en el sistema del equipo, no en la aplicación;
la pantalla explica cómo.

![Pantalla de impresión con la opción de imprimir al terminar y el ticket de prueba](img/caja/23-impresion.png)

---

## 4. Lo que Caja no puede hacer, y cómo se ve

**La bitácora no está disponible.** La pestaña Actividad no aparece, y si alguien llega a esa
pantalla por una dirección directa, el sistema lo dice en vez de enseñar una lista vacía.

![Pantalla de Actividad que explica que la bitácora es de Administración](img/caja/24-no-puede-bitacora.png)

**El almacén tampoco.** Si Caja intenta entrar a las pantallas de Almacén (existencias, lotes,
traspasos), el sistema la devuelve a su catálogo sin más aviso. El inventario se descuenta solo al
cobrar; Caja nunca lo toca.

![De vuelta en el catálogo tras intentar entrar a una pantalla de almacén](img/caja/25-no-puede-almacen.png)

Además, aunque no se vea en pantalla: el servidor rechaza cualquier intento de Caja de escribir en
inventario, órdenes médicas, notas de atención, personal o configuración, y **no le da acceso al
panel de administración**. El botón «Panel» sólo lo ve Administración.

---

## 5. Pausar y salir

**Pausar** bloquea la pantalla sin cerrar nada: el turno de caja y el carrito siguen abiertos.
Para volver, escribes tu contraseña y pulsas **Continuar**. Sirve para apartarte del mostrador un
momento sin que nadie use tu sesión. La sesión también se pausa sola tras un rato sin actividad.

![Pantalla de sesión en pausa pidiendo la contraseña para continuar](img/caja/26-sesion-en-pausa.png)

**Salir** pide confirmación —**Confirmar salida**— porque cerrar sesión vacía el carrito. **El turno
de caja no se cierra al salir**: si sales sin hacer el corte, al volver a entrar seguirá abierto
a tu nombre, y **nadie más podrá abrir caja** mientras tanto. Cierra siempre el turno con el corte
antes de irte.

![Barra de sesión pidiendo confirmar la salida](img/caja/27-cerrar-sesion.png)

Al confirmar, vuelves a la pantalla de entrada.

![Pantalla de inicio de sesión tras salir](img/caja/28-sesion-cerrada.png)

---

## 6. Si algo no sale

| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| Aviso amarillo «Abre una sesión en la pestaña Caja» | No hay turno abierto a tu nombre | Pestaña Caja → fondo → Abrir caja |
| «La caja está ocupada» | Otra persona tiene la caja abierta | Que haga su corte y cierre; no se puede abrir una segunda |
| «Completar orden» apagado con tarjeta | Falta la referencia de la terminal | Escribe los 4 a 6 dígitos del comprobante |
| «El usuario o la contraseña no son correctos» | Usuario o clave mal escritos | Revisa mayúsculas; el usuario va sin arroba |
| «Cuenta bloqueada» | Administración bloqueó tu cuenta | Habla con Administración; tu clave sigue siendo la misma |
| Faltante o sobrante en el corte | El efectivo contado no coincide con el esperado | Recuenta; si persiste, anótalo en observaciones y cierra: queda registrado |
| El ticket no sale | La impresora predeterminada del equipo no es la térmica | Ajustes → Impresión, sigue los pasos; prueba con «Imprimir ticket de prueba» |
| Un paciente sale en gris como «Esperando a Enfermería» | El médico ya emitió, Enfermería aún no aplica | Espera; en cuanto apliquen, pasa a **Por cobrar** con su botón. No lo cobres desde el mostrador |
| **Cobrar** apagado con «Abre la caja para cobrar» | No hay turno abierto a tu nombre | Fondo → Abrir caja; la lista se conserva |

---

*Este manual se genera a partir de un recorrido real del sistema. Las capturas se regeneran con
`npm run caja` dentro de `docs/manual/`; el texto se revisa a mano cuando cambia una pantalla.*
