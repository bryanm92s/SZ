# 🙋 Manual de Usuario — SZ

Guía para usar **SZ** en el día a día del estudio. **No hace falta saber de
programación**: todo se explica paso a paso, con lenguaje sencillo.

> **¿Buscas la instalación técnica?** Eso está en
> [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md).

---

## Índice

1. [Qué es SZ y para qué sirve](#1-qué-es-sz-y-para-qué-sirve)
2. [Cómo acceder](#2-cómo-acceder)
3. [Navegación general](#3-navegación-general)
4. [Panel principal y Citas de Hoy](#4-panel-principal-y-citas-de-hoy)
5. [Crear una cita](#5-crear-una-cita)
6. [Consultar, editar, reprogramar y eliminar citas](#6-consultar-editar-reprogramar-y-eliminar-citas)
7. [Estados de las citas](#7-estados-de-las-citas)
8. [Cita pasada ≠ estado de la cita](#8-cita-pasada-≠-estado-de-la-cita)
9. [Restricciones de edición y eliminación](#9-restricciones-de-edición-y-eliminación)
10. [Clientes](#10-clientes)
11. [Servicios](#11-servicios)
12. [Calendario](#12-calendario)
13. [Domicilios, dirección, duración y precios](#13-domicilios-dirección-duración-y-precios)
14. [Recordatorios y WhatsApp](#14-recordatorios-y-whatsapp)
15. [Finanzas](#15-finanzas)
16. [Reportes, filtros y exportaciones](#16-reportes-filtros-y-exportaciones)
17. [Restablecer el sistema ⚠️](#17-restablecer-el-sistema-️)
18. [Errores frecuentes](#18-errores-frecuentes)
19. [Buenas prácticas](#19-buenas-prácticas)

---

## 1. Qué es SZ y para qué sirve

**SZ** es una aplicación que se abre en el navegador del celular (o de la
computadora) y te permite administrar tu estudio de cejas y pestañas:

- **Agendar citas** con horarios que nunca se enciman.
- **Guardar clientas** y ver su historial.
- **Controlar ingresos y gastos** y ver cuánto ganaste.
- **Mandar recordatorios por WhatsApp** con un clic.
- **Sincronizar con Google Calendar** automáticamente.
- **Exportar reportes** a Excel o mandártelos por WhatsApp/correo.

**No se instala nada** y tus datos viven en tu cuenta de Google, en una hoja de
cálculo.

---

## 2. Cómo acceder

1. Abre la dirección de tu app (la que te entregaron al instalar SZ).
2. Listo: **no hay usuario ni contraseña** que teclear.

> ⚠️ **Si ves «Modo sin conexión»** en la parte de arriba, significa que la app
> no pudo hablar con el servidor. Puedes seguir trabajando: lo que escribas se
> guarda en el celular y se sincroniza después. Si el aviso no desaparece,
> revisa la [sección 18](#18-errores-frecuentes).

### Si te sale un error de «varias cuentas de Google»

Google no permite que una app como SZ funcione si tienes **varias cuentas de
Google abiertas** en el mismo navegador. La solución:

1. Abre una **ventana de incógnito** (Ctrl+Shift+N en Chrome).
2. Entra **solo** con la cuenta de la dueña de SZ.
3. Abre la app ahí.

---

## 3. Navegación general

En la parte inferior hay 7 botones:

| Botón | Para qué sirve |
|---|---|
| 🏠 **Panel** | Resumen del día |
| 📅 **Citas** | Ver, crear y editar citas |
| 👥 **Clientes** | Buscar y administrar clientas |
| ✂️ **Servicios** | Catálogo de servicios y precios |
| 💰 **Finanzas** | Ingresos, gastos y reportes |
| 📆 **Calendario** | Vista mensual de las citas |
| ⚙️ **Ajustes** | Colores, tema y restablecer |

**En la barra de arriba** verás:

- **«✓ Sincronizado»** en verde → todo bien, los datos están guardados.
- **«⟳ Sincronizando»** → la app está guardando o leyendo.
- **«⚠»** en rojo y, debajo del menú, una franja **«⚠️ Modo sin conexión —
  \<motivo\>»** → la app no pudo hablar con el servidor. **No hay cola
  mágica**: lo que cambies en ese estado queda solo en la pantalla y se
  pierde si recargas. Vuelve a pulsar **↻** o a guardar cuando vuelva la
  conexión, y confirma con **«✓ Sincronizado»**.
- El nombre del negocio y su emoji (si se configuraron).

---

## 4. Panel principal y Citas de Hoy

**Objetivo:** ver de un vistazo cómo está tu día.

**El Panel muestra:**

- **Citas de Hoy** — la lista de las citas de hoy con su hora y estado.
- **Citas por recordar** — citas de mañana (u hoy) a las que aún no les has
  mandado recordatorio, con un botón para mandarlo.
- **Accesos rápidos** — «+ Nueva cita», «Ver calendario», «Finanzas».
- **Balances** — ingresos del día y del mes, y gastos.

**Pasos:**

1. Toca **🏠 Panel**.
2. Revisa la tarjeta **Citas de Hoy**.
3. Toca una cita para ver su detalle.

**Si algo falla:** si el Panel aparece vacío aunque tengas citas, pulsa el
botón **↻** de la barra superior para recargar.

---

## 5. Crear una cita

**Objetivo:** agendar una nueva cita con su clienta.

**Objetivo:** tienes una clienta nueva o una fecha libre y quieres agendarla.

**Pasos:**

1. Toca **📅 Citas** y después **«+ Nueva cita»**.
2. **Paso 1 — Cliente:** teclea el nombre o el celular.
   - Si la clienta ya existe, la app **la sugiere**: tócala para elegirla.
   - Si es nueva, la app ofrece **«+ Crear "nombre"»** con nombre y celular.
3. **Paso 3 — Servicios:** elige uno o **varios servicios** (se suman).
   - Verás el **total** actualizándose.
   - Puedes marcar **«Domicilio»** y poner la dirección (ver
     [sección 13](#13-domicilios-dirección-duración-y-precios)).
4. **Paso 4 — Fecha y hora:**
   - Elige el día en el calendario.
   - Elige la hora tocando un bloque de **07:00 a 20:30** (bloques de 30 min).
   - **Las horas ocupadas aparecen deshabilitadas**: no se puede agendar encima
     de otra cita.
5. Toca **«Guardar cita»**.

**Resultado esperado:**

- La cita aparece en la lista de **Citas**.
- Se crea automáticamente un evento en **Google Calendar**.
- La clienta queda guardada en la pestaña **Clientes** (no hace falta darla de
  alta antes).

**Advertencias:**

- ⚠️ Una cita **no puede terminar después de las 21:00**. Por ejemplo, si
  eliges las 20:30, solo cabe un servicio de 30 minutos.
- ⚠️ La hora se bloquea si **hay solape** con otra cita. La validación es en el
  teléfono: si alguien más agenda a la vez desde otro celular, puede haber
  choque.

**Si algo falla:**

- Si al guardar dice «No se pudo guardar», **no se guardó**. Revisa la conexión
  y vuelve a intentar.
- Si dice «Error al agendar en Calendar», la cita **sí quedó en SZ** pero el
  evento no se creó. Revisa la [sección 18](#18-errores-frecuentes).

---

## 6. Consultar, editar, reprogramar y eliminar citas

### Consultar

1. Toca **📅 Citas**.
2. Las citas están agrupadas en acordeones:
   - **HOY · MAÑANA · PRÓXIMAS · NO ASISTIÓ · PASADAS**
3. Solo **HOY** está abierto; toca el título de otro grupo para abrirlo.
4. Toca **«👁 Detalle»** en una cita para ver todo: clienta, servicios,
   dirección, total, método de pago y estado.

### Editar o reprogramar

1. En la tarjeta de la cita toca **«✏️ Editar»**.
2. Cambia lo que necesites (hora, servicios, domicilio, dirección…).
3. Toca **«Guardar»**.

**Resultado:** el evento de Google Calendar **se mueve** a la nueva hora (no se
crea otro).

> ⚠️ Solo las citas **pendientes** se pueden editar. Mira la
> [sección 9](#9-restricciones-de-edición-y-eliminación).

### Eliminar

1. En la tarjeta toca **«🗑 Eliminar»**.
2. Confirma.

**Resultado:** se borra la cita **y su evento de Calendar**.

**Si algo falla:** si el mensaje dice que la cita se borró de SZ pero **no se
pudo borrar el evento de Calendar**, la app te ofrece **reintentar**. Si el
reintento también falla, te mostrará el **ID del evento** para que lo borres a
mano en Google Calendar (abre Calendar, busca el evento y elimínalo).

---

## 7. Estados de las citas

| Estado | Significado | ¿Cómo se llega? |
|---|---|---|
| 🟡 **Pendiente** | Aún no ocurre o no se ha marcado | Estado inicial |
| ✅ **Completada** | La clienta asistió y se cobró | Toca **«✓ Completar»** y elige **Efectivo** o **Transferencia** |
| ❌ **No asistió** | La clienta no fue | Toca **«✗ No asistió»** |

**Al marcar «Completar»** aparece un diálogo para elegir el **método de pago**:
**Efectivo** o **Transferencia**. Ese dato se usa en Finanzas para separar lo
cobrado.

> 📌 **«No asistió» se cuenta como un número** en los reportes (no como dinero
> perdido). Nunca se mezcla con los ingresos.

---

## 8. Cita pasada ≠ estado de la cita

Esta es la confusión más común, así que va aparte:

- **«Pasada»** es una **fecha**: la cita ya pasó en el calendario (ayer, la
  semana pasada…). Es solo un **grupo** de visualización.
- **«Pendiente / Completada / No asistió»** es un **estado** que tú marcas.

Entonces puede haber una cita **pasada y pendiente** (ya venció y no le pusiste
nada). Eso es normal: las citas viejas siguen quedando en el grupo **PASADAS**
hasta que les pongas un estado.

> 💡 **Consejo:** al final del día repasa las citas de hoy y márcalas
> **Completada** o **No asistió**. Así el balance de Finanzas queda exacto.

---

## 9. Restricciones de edición y eliminación

**Regla de oro: solo las citas PENDIENTES se pueden editar o eliminar.**

| Estado | ¿Se puede editar? | ¿Se puede eliminar? |
|---|:---:|:---:|
| 🟡 Pendiente | ✅ Sí | ✅ Sí |
| ✅ Completada | ❌ No | ❌ No |
| ❌ No asistió | ❌ No | ❌ No |
| Pasadas (fechas viejas) | Solo si siguen **pendientes** | Solo si siguen **pendientes** |

**¿Por qué?** Para que un cobro ya registrado o una inasistencia ya anotada no
se pierda por accidente.

**¿Qué haces si necesitas cambiar algo de una cita completada?**

- Si es un **dato equivocado** (hora, servicio): elimina la cita **antes** de
  marcarla completada, o contacta a quien administra SZ.
- Si solo quieres **corregir el pago**: en Finanzas, en el detalle de ingresos,
  verás el método registrado.

**Si algo falla:** si el botón no responde y aparece un aviso explicando la
regla, es correcto: la app te está diciendo por qué no puede.

---

## 10. Clientes

**Objetivo:** encontrar, crear o corregir una clienta.

### Buscar

1. Toca **👥 Clientes**.
2. Escribe en el buscador: **celular** o **nombre**.
3. Busca por:
   - **sufijo** del celular (los últimos 4 dígitos encuentran rápido), o
   - **subcadena** del nombre.

### Ver el historial de una clienta

1. Toca la clienta.
2. Verás sus **citas**, los **montos** y su **última visita**.
3. En **🗓️ Todas las citas** la lista sale de la más reciente a la más
   antigua y, si hay **más de 5**, al final aparece **‹ Ant. · 1–5 de 23
   citas · pág. 1 de 5 · Sig. ›**. Los **totales de arriba no cambian** al
   paginar: siempre son de la clienta completa.
   - La página vuelve a **1** cuando entras a otra clienta.

### Crear una clienta

- **Automático:** al agendar una cita con un nombre nuevo, la clienta se crea
  sola.
- **Manual:** desde **👥 Clientes** → **«+ Nueva»** y llena nombre y celular.

### Editar

1. Toca la clienta → **«✏️ Editar»**.
2. Corrige nombre o celular y guarda.

> ⚠️ **No edites las hojas de Google Sheets a mano.** La app guarda la lista
> completa cada vez; si cambias algo directo en la hoja, se pierde en el
> siguiente guardado.

---

## 11. Servicios

**Objetivo:** mantener el catálogo de servicios con su precio y duración.

### Crear un servicio

1. Toca **✂️ Servicios**.
2. Escribe **nombre**, **precio** y elige la **duración**.
3. Toca **«Agregar»**.

### Editar precio o duración

1. Toca **«✏️ Editar»** en el servicio.
2. Cambia el valor y guarda.

> 💡 **Historial de precios:** cuando cambias un precio, SZ **guarda la fecha
> del cambio**. Las citas viejas **conservan el precio que tenían en su
> momento**, así tu historial de ingresos no se altera.

### Duración

La duración define **cuánto tiempo se bloquea la agenda** con ese servicio. Si
no tiene duración, SZ usa **60 minutos** por defecto.

- Opciones rápidas: 30, 60, 90, 120, 150, 180 minutos.
- Valores permitidos: de **15 a 480** minutos.

### Eliminar un servicio

1. Toca **«🗑 Eliminar»**.
2. Confirma.

> ⚠️ **No se puede eliminar un servicio que todavía tengan citas futuras
> activas o citas en curso.** La app te avisará y te dirá cuántas citas lo usan.
> Esta regla **también la controla el servidor**, así que no se puede saltar.
>
> **Solución:** esas citas deben pasar (completarse, no asistirse o
> eliminarse) antes de poder borrar el servicio.

---

## 12. Calendario

**Objetivo:** ver el mes completo y abrir cualquier cita.

**Pasos:**

1. Toca **📆 Calendario**.
2. Navega entre meses con **‹** y **›**.
3. Verás las citas pintadas en cada día.
4. Toca un día para ver sus citas.
5. Toca una cita para **abrir su detalle** o **editarla**.

**¿Y si un evento no aparece en Google Calendar?**

1. Comprueba en **📅 Citas** que la cita sí existe.
2. Revisa la columna del **ID de evento** (lo puedes ver en el detalle).
3. Abre Google Calendar y busca el título `✨ servicio — clienta`.
4. Si falta, revisa la [sección 18](#18-errores-frecuentes).

**Sincronización:**

- SZ y Google Calendar se sincronizan **en el momento** al crear, editar o
  borrar.
- **No hay re-sincronización automática** en sentido contrario: si borras el
  evento **directo en Google Calendar**, esa cita **seguirá existiendo en SZ**.
  Borra o edita la cita **desde la app**.

---

## 13. Domicilios, dirección, duración y precios

### Cita a domicilio

1. En el paso de servicios, marca **«Domicilio»**.
2. Escribe el **valor del domicilio** y (opcional) la **dirección**.
3. El **total** de la cita suma: servicios + domicilio.

**Resultado:** el evento de Google Calendar incluye el valor y la dirección.

### Dirección

- Es **opcional**. Si no la pones, la cita sigue siendo a domicilio pero sin
  dirección escrita.

### Duración

- La duración de la cita = **suma de la duración de cada servicio** elegido.
- Si eliges dos servicios de 60 min, la cita dura **120 min** y bloquea ese
  hueco completo en la agenda.

### Precios

- El precio de cada servicio está en **✂️ Servicios**.
- Al agendar, SZ calcula el **total** sumando los servicios + domicilio.
- Al **editar** una cita, se respeta el **precio que tenía al crearse** (no se
  recalcula con los precios nuevos), salvo que cambies los servicios.

---

## 14. Recordatorios y WhatsApp

### Mandar un recordatorio a una clienta

1. Ve a **🏠 Panel** → tarjeta **«Citas por recordar»**, o a **📅 Citas**.
2. Toca **« recordar»** (o el botón de WhatsApp de la cita).
3. Se abre **WhatsApp** con el mensaje **ya escrito**, incluyendo:
   - Fecha y hora
   - **Servicio(s)**
   - **Domicilio** (si aplica)
   - **Total**
4. Solo tienes que darle **Enviar**.

**Resultado:** la clienta recibe el mensaje con todos los datos.

> ⚠️ **No se puede mandar recordatorio de una cita que ya pasó.** Si la fecha
> ya venció, el botón no aparece o está deshabilitado.

> 💡 SZ **no envía mensajes solo**: siempre se abre WhatsApp con el texto
> listo. **Tú decides** si lo envías.

### El botón «💬 WhatsApp admin» (del reporte)

Está en la pestaña **Reportes**. Envía el resumen del período al **número del
administrador**.

> Si ese botón aparece **deshabilitado**, es porque la app no tiene configurado
> el número del admin (es un ajuste técnico; ver
> [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md), variable `VITE_ADMIN_WHATSAPP`).

---

## 15. Finanzas

**Objetivo:** saber cuánto entró, cuánto salió y cuánto queda.

**Para llegar:** toca **💰 Finanzas**.

### Las tarjetas principales

| Tarjeta | Qué significa |
|---|---|
| **Ingresos recibidos** | Lo que **ya cobraste** (citas completadas) |
| **Pendiente** | Citas **pendientes** por cobrar |
| **Proyectado** | Total que entra si se completan todas las pendientes |
| **Gastos** | Lo que gastaste en el período |
| **Balance neto** | Ingresos recibidos **−** gastos |

### ¿Cómo se calculan?

- **Ingresos** = citas **Completadas** con su monto.
  - Las **no asistidas NO suman** (solo se cuentan como número).
- **Gastos** = lo que registres en **«+ Gasto»**.
- **Balance neto** = ingresos recibidos − gastos.

### Registrar un gasto

1. En Finanzas, toca **«+ Gasto»**.
2. Escribe la **descripción**, el **monto** y elige la **categoría**
   (Insumos, Arriendo, Publicidad… o una nueva).
3. Guarda.

### Secciones de Finanzas

- **Detalle de ingresos** — lista las citas del mes, agrupadas por día, con
  los filtros **Todo · Recibido · Pendiente · No asistió**.
  - Los días salen del **más reciente al más antiguo** y, **dentro de cada
    día**, las citas van **de la hora más temprana a la más tarde** (como
    se repasa una agenda).
  - Si hay **más de 7 días** con citas, aparece una **paginación** al pie de
    la lista de días: **‹ Ant. · 1–7 de 20 días · pág. 1 de 3 · Sig. ›**
    - Toca **‹ Ant.** y **Sig. ›**; el contador te dice en qué página vas.
    - Con **7 días o menos no aparece nada**: la lista sale completa.
  - Además, **dentro de cada día** solo se ven **5 citas por página**, con su
    **propio paginador de círculos** debajo: **‹ 1 2 3 ›**, donde la página
    activa va en un **círculo relleno** y los extremos son **flechas ‹ ›**,
    nunca números. Cada día recuerda **su propia** página.
  - Cada tarjeta de día muestra sus citas con la hora, la clienta y el
    monto recibido o pendiente.
  - Si **cambias de mes o de filtro**, ambas paginaciones **vuelven a la
    página 1**.
  - ⚠️ Los montos y los contadores de las 4 tarjetas de arriba
    (Todo / Recibido / Pendiente / No asistió) **siempre** corresponden al
    **mes completo**, no a la página que estás mirando. Pasa por todas las
    páginas y verás que no cambian.
- **Detalle de gastos** — lista los gastos del mes en dos vistas.
  - Los días salen del **más reciente al más antiguo** y, **dentro de cada
    día**, van **por descripción de la A a la Z** (sin importar mayúsculas
    ni acentos) y, si dos gastos se llaman igual, **el más caro primero**.
    Así el orden es siempre el mismo, sin importar en qué orden los
    hayas ido registrando.
  - Si hay **más de 7 días** con gastos, aparece una **paginación** al pie de
    los días (**‹ Ant. · pág. 1 de 3 · Sig. ›**) y, **dentro de cada día**,
    se ven **5 gastos** por página con su **círculo de páginas** debajo
    (**‹ 1 2 3 ›**).
  - 👉 Primero se ve **«Por categoría»**: una línea por categoría con su
    color, su monto y una barra de participación, de **mayor a menor**.
  - 👉 **Toca una categoría** para **abrir sus gastos**: se despliega una
    tarjeta justo debajo con **todos los gastos de esa categoría**, del más
    reciente al más antiguo (y, dentro del día, por descripción A→Z), **10
    por página**. Vuelve a tocarla para
    cerrarla. Al **abrir otra categoría** la paginación **vuelve a la
    página 1**.
  - Debajo van los **gastos por día**, uno por uno, con ✏️ para editarlos y
    ✕ para borrarlos.
  - ⚠️ El **Total del mes** y el desglose **por categoría** **siempre**
    salen de **todos** los gastos del mes: no cambian al abrir o cerrar
    una categoría ni al pasar de página. Tampoco cambian por el orden:
    los totales son sumas, y una suma no depende de cómo se ordene la
    lista.
- **Gastos del mes** — la lista de gastos del mes seleccionado, del **más
  reciente al más antiguo** y, dentro del mismo día, por **descripción
  A→Z** (y si empatan, por el **mayor monto**).
  - Si el mes tiene **más de 10 gastos**, aparece una **paginación** al
    final de la lista: **‹ Ant. · 1–10 de 23 gastos · pág. 1 de 3 · Sig. ›**
  - Con **10 gastos o menos no aparece nada**: la lista sale completa.
  - Toca **‹ Ant.** y **Sig. ›** para moverte. El contador te dice en qué
    página vas y cuántos registros hay en total.
  - Si **cambias de mes**, la paginación **vuelve a la página 1**.
  - El **balance y los totales del mes NO cambian** al paginar: siempre
    corresponden al mes completo.
- **Comparación** — mes a mes.
- **Top servicios** — por ingresos y por demanda.
- **Reportes** — ver [sección 16](#16-reportes-filtros-y-exportaciones).

> 💡 Toca una tarjeta de balance para ir directo a su detalle.

---

## 16. Reportes, filtros y exportaciones

**Objetivo:** obtener el resumen de un período y exportarlo.

**Para llegar:** **💰 Finanzas** → **«📊 Reportes»**.

### Elegir el período

Hay **4 botones** en este orden:

| Botón | Qué abarca |
|---|---|
| **📅 Por día** | Un día específico |
| **🗓️ Por mes** | Un mes completo |
| **📆 Por rango** | Dos fechas que tú eliges — también puede **llegar al futuro**, para revisar citas ya agendadas |
| **📅 Por año** | Un año completo (1 ene – 31 dic) y elige el año |

**Pasos:**

1. Toca el tipo de período.
2. Elige la fecha / mes / rango / año.
3. El resumen se recalcula al instante: ingresos, gastos, balance, citas,
   no asistidos y desglose.

### Los movimientos del período

Debajo del resumen verás **🧾 Movimientos del período**: la lista de todo lo
que entró y salió, con los filtros **Todo · Ingresos · Gastos**, ordenados
**del más reciente al más antiguo**.

- Si el período tiene **más de 10 movimientos**, aparece una **paginación**:
  **‹ Ant. · 1–10 de 37 movimientos · pág. 1 de 4 · Sig. ›**
- Con **10 movimientos o menos no aparece nada**: la lista sale completa.
- El contador te dice en qué página vas y cuántos movimientos hay en total.
- Si **cambias de período o de filtro**, la paginación **vuelve a la
  página 1**.
- ⚠️ El **Neto del período** del final **siempre suma TODOS los
  movimientos**, no solo los de la página que estás mirando. Pasa por todas
  las páginas y verás que el neto no cambia.

### Exportar a Excel

1. Toca **«📊 Exportar Excel»**.
2. Se descarga un archivo **`.xlsx`** con **3 hojas**:
   - **Resumen**
   - **Citas**
   - **Gastos**
3. El Excel **trae todos los gastos uno por uno** (la agrupación de la
   [sección 15](#15-finanzas) es solo para la vista en pantalla y para el
   mensaje).

### Enviar el reporte por WhatsApp

1. Toca **«💬 WhatsApp admin»**.
2. Se abre WhatsApp con el resumen ya escrito.
3. Dale **Enviar**.

### ⚠️ WhatsApp y correo deben decir lo mismo

SZ genera **el mismo texto** para el mensaje de WhatsApp y para el correo
automático. **No hay una versión corta y otra larga**: si ves una diferencia,
es un error y hay que reportarlo.

### Reportes automáticos por correo

Si el administrador configuró los disparadores, llegan por correo (a las
12:00):

| Reporte | Cuándo | Qué abarca |
|---|---|---|
| **Diario** | Todos los días | Ese día |
| **Semanal** | Los domingos | Lun–Dom de esa semana |
| **Mensual** | El último día del mes | Ese mes |
| **Anual** | El 31 de diciembre | Ese año |

Cada correo trae el **Excel adjunto**. Si el Excel no se pudiera generar, el
correo **igual llega**, pero sin adjunto y con un aviso en el cuerpo.

> 📌 En los registros de ejecución verás a diario
> `SKIP reporte mensual/anual: hoy no es el último día` — **eso es normal**:
> esos disparadores corren a diario y deciden no enviar.

---

## 17. Restablecer el sistema ⚠️

> 🚨 **ATENCIÓN: esto BORRA TODO** — clientas, citas, gastos y **todos los
> eventos de Google Calendar**. **NO SE PUEDE DESHACER.** Hazlo solo si de
> verdad quieres empezar de cero.

**Qué NO borra:** tus servicios y tu catálogo (se conservan), y la hoja en
sí.

### Pasos

1. Ve a **⚙️ Ajustes**.
2. Busca **Restablecer el sistema**.
3. Téclea la **palabra de confirmación** que pide la pantalla.
4. Toca **«Enviar código»**. SZ mandará un **código de 8 caracteres** a
   **tu correo** (el de la dueña).
5. Abre el correo, copia el código y **pégalo** en la app.
6. Confirma. Se borra todo.

### Reglas de seguridad que protegen este botón

- El código **solo llega al correo autorizado**.
- El código **vence en 15 minutos**.
- Solo sirve **una vez**.
- Máximo **5 intentos** para escribirlo bien; si fallas 5 veces, hay un
  **bloqueo de 30 minutos**.
- Máximo **3 envíos por hora**.
- Cada código se usa **una sola vez**: si ya lo usaste, no sirve otra vez.

### Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «Código incorrecto» | Revísalo bien en el correo (no lleva letras confusas como O ni 1). Espera 1 min y revisa spam. |
| «Demasiados intentos» | Espera **30 minutos** y pide un código nuevo. |
| «El código venció» | Pide **«Enviar código»** de nuevo. |
| «El código ya se usó» | El reset **ya se ejecutó**. Revisa la app. |
| «No se pudo comprobar… revisa la hoja» | El servidor no respondió pero pudo haberse ejecutado. **Revisa Google Sheets** para saber si se borró o no. |

> 💡 **Recomendación:** antes de restablecer, haz un **respaldo manual** de la
> hoja de Google Sheets (Archivo → Descargar → Excel). Así puedes volver atrás.

---

## 18. Errores frecuentes

### «Modo sin conexión» no se quita

1. Revisa que tengas internet.
2. Pulsa **↻** (recargar).
3. Si sigue: es un ajuste técnico del servidor →
   [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección G.

### «Hay varias cuentas de Google abiertas…»

Cierra las otras cuentas o abre una **ventana de incógnito** solo con la cuenta
de la dueña. (Ver [sección 2](#2-cómo-acceder).)

### La cita no guarda

Mira el texto dentro de la tarjeta **⚠️** que queda en la pantalla de la
cita. Son **tres casos distintos**:

| Texto | ¿Se guardó? | Qué hacer |
|---|---|---|
| `⚠️ No se pudo guardar la cita en el servidor; no se envió nada a Google Calendar.` | **NO** | Revisa la conexión y vuelve a pulsar **Guardar cambios**. |
| `⚠️ La cita se guardó, pero Google Calendar NO se actualizó: …` | **Sí** | Pulsa **🔄 Reintentar Calendar** (o **Listo** si prefieres). |
| `✅ Cita guardada. Esta cita no tiene un evento de Calendar enlazado…` | **Sí** | Es normal en citas viejas: **no se crea un evento nuevo** para no duplicar los que ya existen. |

### «La cita se guardó, pero Google Calendar NO se actualizó»

1. Pulsa **🔄 Reintentar Calendar** en la misma tarjeta.
2. Si también falla, te mostrará el motivo (permisos de Google, cuota…).
3. Si persiste, es un problema de autorización →
   [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección D.7.

### El evento quedó pero la cita se borró (o al revés)

SZ **no puede deshacer** una operación entre la hoja y Calendar. Si el aviso te
da el **ID del evento**, bórralo a mano en Google Calendar.

### Una hora «no está disponible» y no sé por qué

Hay otra cita en ese bloque (o la tuya la ocuparía). Prueba con otro bloque de
30 minutos o con menos servicios.

### No puedo editar ni borrar una cita

Es la regla de la [sección 9](#9-restricciones-de-edición-y-eliminación): solo
las **pendientes** se pueden modificar.

### No puedo eliminar un servicio

Tiene citas futuras. Mira la [sección 11](#11-servicios).

### Los reportes no cuadran

1. Revisa que las citas tengan su **estado** bien puesto
   ([sección 7](#7-estados-de-las-citas)).
2. Recuerda: **no asistió = número**, no dinero.
3. En gastos con muchos registros, el detalle se agrupa pero **el total sí
   suma todo**.

### Se perdió información

Mira la [sección 19](#19-buenas-prácticas) y, si tienes respaldos, la
restauración está en [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección G.7.

---

## 19. Buenas prácticas para no perder información

1. **No edites las hojas de Google Sheets a mano.** La app reescribe la hoja
   completa en cada guardado: lo que cambies a mano **se pierde**.
2. **Marca el estado de las citas** el mismo día (Completada / No asistió).
3. **No cierres la app** justo mientras dice «⟳ Sincronizando».
4. **Mira el indicador verde «✓ Sincronizado»** antes de cerrar la pestaña.
5. **Haz respaldos** de la hoja al menos una vez al mes:
   Archivo → Descargar → Excel.
6. **Guarda el correo de restablecimiento** en un lugar seguro: sin ese correo
   no puedes recuperar el acceso por código.
7. **No compartas la dirección de la app** con personas que no deban ver tus
   datos: quien la tenga y sepa el token puede consultar todo.
8. **Si borras una cita, verifica Calendar**: revisa que el evento también
   desapareciera.
9. **Si cambias precios**, recuerda que las citas viejas conservan su precio
   original: eso es correcto y protege tu historial.

---

> 📖 **Documentos relacionados**
>
> - [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) — instalar y configurar SZ
> - [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md) —
>   cómo funciona por dentro
> - [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md) — pruebas,
>   diagnóstico y respaldos
> - [`INDEX.md`](INDEX.md) — índice completo
