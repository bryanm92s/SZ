# 🏗️ Arquitectura y Funcionalidades — SZ

Informe técnico-funcional del sistema **tal como está implementado**. Cada regla
se cita con el **nombre real** de la función, componente o archivo que la
aplica.

> **Convención de sellos**
>
> - ✅ **Verificado en código** — se leyó la implementación en este repositorio.
> - 🧪 **Verificado en pruebas automatizadas** — existe un test que lo cubre
>   (317 pruebas, ejecutadas y en verde en esta ronda de documentación).
> - 🔎 **No verificado en producción** — la regla existe en el código pero no
>   se probó en el entorno real de Google/Vercel.

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Flujo frontend → API → Apps Script → Sheets/Calendar](#2-flujo-frontend--api--apps-script--sheetscalendar)
3. [Módulos y responsabilidades](#3-módulos-y-responsabilidades)
4. [Entidades y estructura de datos](#4-entidades-y-estructura-de-datos)
5. [Operaciones de lectura y escritura](#5-operaciones-de-lectura-y-escritura)
6. [Reglas de negocio de las citas](#6-reglas-de-negocio-de-las-citas)
7. [Validación de horarios y solapamientos](#7-validación-de-horarios-y-solapamientos)
8. [Editar, completar, inasistencia y eliminar](#8-editar-completar-inasistencia-y-eliminar)
9. [Servicios y citas dependientes](#9-servicios-y-citas-dependientes)
10. [Google Calendar](#10-google-calendar)
11. [Clientes y servicios](#11-clientes-y-servicios)
12. [Finanzas y fórmulas de reportes](#12-finanzas-y-fórmulas-de-reportes)
13. [Exportaciones y reportes](#13-exportaciones-y-reportes)
14. [Restablecimiento y autorización](#14-restablecimiento-y-autorización)
15. [Manejo de errores y recuperación](#15-manejo-de-errores-y-recuperación)
16. [Limitaciones conocidas](#16-limitaciones-conocidas)
17. [Matriz de funcionalidades](#17-matriz-de-funcionalidades)

---

## 1. Arquitectura general

```mermaid
flowchart TD
    subgraph Cliente["Navegador (celular o PC)"]
        UI["src/App.jsx — UI React (~5.120 líneas)"]
        HLP["src/helpers.js — lógica pura (~857 líneas)"]
        API["src/api.js — transporte HTTP"]
        LS[("localStorage<br/>sb_c · sb_s · sb_a · sb_e<br/>sz_palette · sz_hcats")]
        UI --> HLP
        UI --> API
        UI <--> LS
    end

    subgraph Google["Cuenta de Google"]
        GAS["apps-script/Code.gs<br/>Web App (~2.072 líneas)"]
        SH[("Google Sheets — 5 hojas")]
        CAL["Google Calendar"]
        GMAIL["GmailApp<br/>reportes · respaldos · códigos"]
        DRV["Google Drive<br/>BACKUP-PROYECTO/Backups"]
        GAS <--> SH
        GAS --> CAL
        GAS --> GMAIL
        GAS --> DRV
    end

    Vercel["Vercel — hosting estático"] --> UI
    API <-->|"GET/POST + token"| GAS
    WA["wa.me (WhatsApp)"] -.->|"abre el FRONTEND"| UI
```

**Principios de diseño confirmados:**

- **Sin servidor propio.** El estado persistente vive en Google Sheets.
- **Sin autenticación de usuario.** Hay **una sola usuaria**; la única barrera
  es el token de sincronización (`SB_SYNC_TOKEN`).
- **Lógica pura separada de la UI.** Todo lo testeable está en `helpers.js`
  (sin React ni `import.meta.env`), declarado en su cabecera (líneas 1–5).
- **Réplicas backend/frontend.** `Code.gs` **reimplementa** varias funciones de
  `helpers.js` para que el texto del correo sea idéntico al del WhatsApp. Esa
  duplicación está **cubierta por pruebas de paridad**.

---

## 2. Flujo frontend → API → Apps Script → Sheets/Calendar

### 2.1 Lectura (`doGet`)

```
App → loadData() → call(GET, {cache:'no-store'}) → https://…/exec?token=…&t=…
   → doGet(e) [Code.gs 41] → _checkToken → initSheets → readSheet ×5
   → JSON { ok, data:{clients, services, appointments, expenses, priceHistory} }
   → App: setC / setS / setA / setE / setPH   (+ localStorage en el catch)
```

- `doGet` está en `Code.gs` **línea 41**. ✅
- `loadData` está en `src/api.js` **línea 47**. ✅
- Devuelve **siempre las 5 colecciones completas** en una sola petición
  (48–52): `clients`, `services`, `appointments`, `expenses`, `priceHistory`.
  ✅
- OJO: **no hay lista de espera ni paginación en la lectura**; el payload es
  el estado entero de la hoja.

### 2.2 Escritura (`doPost`)

```
App → saveData(payload) → call(URL, {method:'POST', body:{token, ...payload}})
   → doPost(e)                                     [Code.gs 57]
   → LockService.getScriptLock() + waitLock(10000) [59–60] 10 s → «Servidor ocupado, reintenta»
   → JSON.parse → _checkToken                      [62–63]
   → requestResetCode / verifyResetCode            [69–74]  (salen aquí, no escriben)
   → _checkResetAuth  →  _isDestructivePayload → _consumeGrant   [80 → 268 → 258 / 273]
   → sanitizePayload                               [83]
   → initSheets                                    [85]
   → deleteCalendarEvent / updateCalendarEvent / resetData       [86–88] (salen aquí)
   → writeSheet(clients|services|appointments|expenses)
        · services: _serviceDeletionError → _seedPriceHistory
          | trackPriceChanges → writeSheet          [90–112]
   → calendarEvent → createCalEvent                [116]
   → releaseLock() → { ok: true }                  [117]
```

- `doPost` está en `Code.gs` **línea 57**. ✅
- El **Lock se toma PRIMERO** (59–60): `waitLock(10000)` = **10 s**; si no se
  consigue, responde `«Servidor ocupado, reintenta»`. Se libera en **117** (y en
  cada salida temprana: 64, 69, 71, 81, 86–88, 100 y en el `catch`, 119). ✅
- El orden es importante: **se consume el grant ANTES de escribir nada** —
  `_checkResetAuth` (80) decide con `_isDestructivePayload` (258) y llama a
  `_consumeGrant` (273–291), que marca `usedAt` en la **línea 289**; solo
  después llegan los `writeSheet`. Un reset sin grant fallido no deja datos a
  medias. ✅ 🧪
- **El lock es de script**: `getScriptLock()` impide que dos peticiones
  POST concurrentes (dos celulares, o dos pestañas) ejecuten a la vez la
  sección crítica. **No** evita que ambas reserven la misma hora — eso lo
  resuelve `checkSlot` **en el cliente** (ver §16, limitación 3).

### 2.3 Transporte (`src/api.js`)

| Elemento | Línea | Detalle |
|---|---:|---|
| `URL` / `TOKEN` | 1–2 | `import.meta.env.VITE_SCRIPT_URL` y `VITE_TOKEN` |
| `MULTI_ACCOUNT_HINT` | 11 | Detecta `/macros/u/\d+/` y explica el problema de varias cuentas |
| `httpError()` | 15 | Traduce 404, 403/401, 429, 5xx y errores de red a mensajes accionables |
| `call()` | 29 | El único punto de red: `fetch` → `res.ok` → `res.json()` → `json.ok` → `json.data` |
| `loadData()` | 47 | **Un solo GET** `?token=…&t=…` con `cache:'no-store'`; devuelve el bundle completo |
| `saveData()` | 52 | **Un solo POST** con `method:'POST'`, `Content-Type: text/plain` y `{token, ...payload}` |
| `requestResetCode()` | 67 | `saveData({action:'requestResetCode'})` |
| `verifyResetCode()` | 72 | `saveData({action:'verifyResetCode', code})` |
| `resetData()` | 76 | `action:'resetData'` con `grantId`/`grantSecret` + `services` |

> 📌 **Hay DOS comprobaciones de estado**, una encima de otra, y ambas
> importan (✅):
> 1. **`if (!res.ok) throw … httpError(…)`** (línea **39**) — HTTP 404/403/429/
>    5xx y caídas de red se traducen aquí.
> 2. **`if (!json.ok) throw …`** (línea **43**) — la app usa `200 OK` con
>    `{ok:false, error}` para los rechazos de negocio (token mal, horario
>    ocupado, servicio con citas), así que leer solo el HTTP pasaría por alto
>    los errores del dominio.
>
> Además, si `res.json()` no parsea (Google devolvió una página HTML), cae en
> el `catch` de la línea **42** con un mensaje de acción. 🧪

### 2.4 Sincronización y estado offline

| Mecanismo | Ubicación | Comportamiento |
|---|---|---|
| Carga inicial | `App.jsx` 312–332 | `loadData()` → si falla, lee `localStorage` y marca `error` |
| Polling | `App.jsx` 358–370 | Cada **30 s**, y al volver a la pestaña |
| Pausa con pestaña oculta | `App.jsx` 363–368 | `document.visibilitychange` |
| Evitar carreras | `App.jsx` 310, 313 | `savingRef`: si hay un guardado en curso, `refresh` **no** pisa el estado |
| Escritura optimista | `App.jsx` 372–389 | Escribe el estado local y `localStorage` **antes** de la respuesta |
| Si el servidor falla | `App.jsx` 385–388 | **No hay rollback inmediato**: deja el mensaje de error y devuelve `null` (los llamadores abortan). El estado real vuelve con el **próximo polling (≤30 s)** o al recargar |
| Telemetría | — | **No hay.** Cero `console.log`/`fetch` a terceros. ✅ |

---

## 3. Módulos y responsabilidades

| Archivo | Líneas | Responsabilidad | ¿Testeado? |
|---|---:|---|:---:|
| `src/main.jsx` | 10 | Punto de entrada de React (`StrictMode`) | — |
| `src/App.jsx` | 5.120 | **Toda la UI** + estado global + orquestación de guardado | — (componentes no unit-testeados) |
| `src/helpers.js` | 857 | **Lógica pura**: fechas, slots, duraciones, estados, finanzas, reportes, servicio a domicilio, clasificación de citas | ✅ 165 tests |
| `src/api.js` | 83 | Transporte HTTP y mensajes de error | ✅ 7 tests |
| `apps-script/Code.gs` | 2.072 | Backend completo: API, seguridad, Sheets, Calendar, reportes, respaldos | ✅ 127 tests (en sandbox `node:vm`) |
| `src/backend.test.js` | 2.985 | Ejecuta `Code.gs` **real** con mocks de Apps Script | — |
| `src/helpers.test.js` | 1.664 | Pruebas unitarias de `helpers.js` | — |
| `src/api.test.js` | 108 | Pruebas del transporte | — |

### 3.1 Componentes de `src/App.jsx`

| Componente | Línea | Responsabilidad |
|---|---:|---|
| `Modal` | 595 | Diálogo de confirmación genérico |
| `PayModal` | 611 | Selección de método de pago al completar |
| `NavIcon` | 633 | Iconos SVG de la navegación |
| `SyncBadge` | 704 | Indicador de sincronización |
| `Pager` | 753 | Paginación plana **‹ Ant. / Sig. ›** |
| `CirclePager` | 790 | Paginación anidada con el **número en un círculo** |
| `GS` | 829 | **Bloque `<style>` global** (tema, modo oscuro, responsive) |
| `Dashboard` | 1445 | Panel principal |
| `MonthlyIncomeState` | 1670 | Estado de ingresos por mes |
| `MonthlyBalance` | 1728 | Balance mensual |
| `ApptsTab` | 1804 | Lista de citas en acordeones |
| `ApptDetail` | 1974 | Detalle de una cita |
| `ApptCard` | 2087 | Tarjeta de cita reutilizable |
| `EditAppt` | 2172 | Formulario de edición |
| `NewWizard` | 2473 | Asistente de nueva cita (4 pasos) |
| `ClientsTab` | 2802 | Clientas y búsqueda |
| `ServicesTab` | 2903 | Catálogo de servicios |
| `FinancesTab` | 2982 | Finanzas (tarjetas y secciones) |
| `ClientHistory` | 3171 | Historial de clienta |
| `MonthComparison` | 3311 | Comparación de meses |
| `TopServices` | 3442 | Top servicios |
| `ReportTab` | 3606 | Reportes y exportación |
| `IncomeDetail` | 4050 | Detalle de ingresos |
| `SettingsTab` | 4180 | Ajustes y restablecimiento |
| `ExpenseDetail` | 4427 | Detalle de gastos |
| `CalendarView` | 4591 | Vista de calendario |

> 📌 **Nota de diseño:** `App.jsx` concentra la UI en un archivo único
> **a propósito** (documentado en el `README.md`). La lógica reutilizable vive
> fuera, en `helpers.js`, precisamente para poder testearla.

---

## 4. Entidades y estructura de datos

### 4.1 Definición canónica en el backend

Están en `Code.gs` **líneas 19–39** (`SHEETS`, `JS_KEYS`, `HEADERS_ES`) y se
repiten en `helpers.js` (`DEFAULT_SERVICES`, `emptyState`). ✅

#### `clients` → hoja **Clientes** (4 columnas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | Identificador único |
| `name` | string | |
| `phone` | string | Celular |
| `createdAt` | string | Fecha de registro |

#### `services` → hoja **Servicios** (4 columnas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | |
| `name` | string | **Puede contener comas** |
| `price` | number | Precio |
| `duration` | number | Minutos (15–480) |

#### `appointments` → hoja **Citas** (20 columnas)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | |
| `clientId` | string | |
| `clientName` | string | **Snapshot** |
| `clientPhone` | string | **Snapshot** |
| `serviceIds` | string | **CSV** de ids |
| `serviceNames` | string | **CSV** — *snapshot histórico* |
| `servicePrice` | number | Suma de precios **al momento de crear** |
| `servicePrices` | string | JSON `{id: precio}` |
| `domicilio` | boolean | ¿Es a domicilio? |
| `domicilioPrice` | number | Valor del domicilio |
| `totalPrice` | number | **Total = servicios + domicilio** |
| `address` | string | Dirección (opcional) |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:MM` |
| `createdAt` | string | `YYYY-MM-DDTHH:mm:ss` local |
| `calendarCreated` | boolean | ¿Se creó el evento? |
| `calendarEventId` | string | ID en Google Calendar |
| `completed` | string | `true` / `false` / `noshow` |
| `duration` | number | Duración total en minutos |
| `paymentMethod` | string | `Efectivo` / `Transferencia` |

#### `expenses` → hoja **Gastos** (5 columnas)

`id` · `description` · `amount` · `category` · `date`

#### `priceHistory` → hoja **HistorialPrecios** (4 columnas)

`serviceId` · `serviceName` · `price` · `changedAt`

### 4.2 Reglas de snapshot

- **`serviceNames` es una foto histórica**: los nombres de servicios **no se
  actualizan** si luego cambias el catálogo (`NewWizard`, `App.jsx` 2586). ✅
- **`servicePrice` conserva el precio de cuando se creó la cita**, y el precio
  por servicio queda en `servicePrices` (`{id:precio}`, `App.jsx` 2587 al
  crear y 2303–2305 al editar). ✅
- Por eso **editar un servicio no reescribe las citas viejas**. 🧪

---

## 5. Operaciones de lectura y escritura

### 5.1 `readSheet(ss, key)` — `Code.gs` 1963

| Situación | Comportamiento |
|---|---|
| Hoja con menos de 2 filas | Devuelve `[]` |
| **Más columnas** de las esperadas | Ignora las extras y hace `console.warn` |
| **Menos columnas** | Los campos faltantes llegan como `''` y avisa |
| Filas **sin ID en la columna A** | Se descartan |
| Celdas | Todas se leen como texto; `cellStr` (1993) normaliza fechas y horas |

### 5.2 `writeSheet(ss, key, arr)` — `Code.gs` 1983

```
sh.clearContents()  →  setNumberFormat('@')  →  setValues([[HEADERS_ES[key]], …filas])
```

⚠️ **Reescribe la hoja completa en cada guardado.** Consecuencias:

- Ediciones manuales en la hoja **se pierden**.
- Las columnas fuera del esquema **se eliminan**.
- **No** hay `autoResizeColumn` aquí (el ancho de columnas solo se ajusta en
  el Excel que genera `_buildReportXlsx`).

### 5.3 `sanitizePayload(b)` — `Code.gs` 2028

Aplica a cada campo numérico una **clausura de saneamiento**
(`sanitizeNumberField` / `sanitizeDurationField`, líneas 2018–2026):

- Monto negativo o `NaN` → **`0`** (`clip0`, línea 2013; defensa en
  profundidad; la UI ya lo impide con `Math.max`)
- `duration`: se recorta al rango **15–480** (`safeDuration`); vacío → `60`
- `paymentMethod`: `in ('Efectivo','Transferencia')`, si no → `null`
- `completed`: se normaliza a `'true' | 'false' | 'noshow'`
- `servicePrices` (objeto `{id: precio}` serializado): cada precio se pasa
  por `clip0`

Los campos vacíos o ausentes **no se tocan**, así que un valor ya validado
por la UI no se marca como rechazado. ✅

> ⚠️ **No hay barrera de claves desconocidas.** El `payload` que llega se
> usa **tal cual**; lo que impide que una clave ajena llegue a la hoja es
> que `writeSheet` escribe **solo los campos del esquema fijo**
> (`HEADERS_ES`). Si algún día se añadiera un `Object.assign` del payload
> sobre un objeto compartido, habría que añadir la filtración de claves en
> este punto. *Antes se documentaba aquí un filtrado de `__proto__` /
> `constructor` / `prototype` que **no existe en el código**.*

### 5.4 `trackPriceChanges(oldSvcs, newSvcs)` — `Code.gs` 1912

Antes de guardar servicios, compara precio viejo vs. nuevo y registra cada
cambio en **HistorialPrecios** con `Utilities.formatDate(..., 'yyyy-MM-dd')`.
**No borra entradas** ni registra cambios que no existan. ✅ 🧪

### 5.5 `_seedPriceHistory(ss, services)` — `Code.gs` 457

Al ejecutarse, si **HistorialPrecios está vacía**, siembra un registro
inicial por cada servicio con `changedAt = createdAt` de la clienta. Así el
gráfico de historial **siempre tiene un punto de partida**. ✅ 🧪

---

## 6. Reglas de negocio de las citas

### 6.1 Agenda y bloques

| Regla | Valor | Implementación | Estado |
|---|---|---|:---:|
| Bloques | 07:00 → 20:30, cada 30 min | `TIME_SLOTS` (`helpers.js` 9–13) | ✅ 🧪 |
| Hora de cierre | **21:00** — una cita no puede **terminar** después | `CLOSING_TIME` (`helpers.js` 103) + `getSlots` (158–181) | ✅ 🧪 |
| Duración por defecto | 60 min | `SERVICE_DURATION` (`helpers.js` 15) | ✅ 🧪 |
| Duración válida | 15–480 min | **Solo el backend la recorta**: `safeDuration` (`Code.gs` 858). El frontend, `svcDuration` (`helpers.js` 106), no recorta: si falta o es ≤ 0 devuelve 60, y la UI solo ofrece 30/60/90/120/150/180 (`DURATION_OPTIONS`, `App.jsx` 237) | ✅ 🧪 |
| Duración de la cita | **suma** de sus servicios | `sumDuration` (`helpers.js` 112) | ✅ 🧪 |
| Zona horaria | `America/Bogota` | `appsscript.json` | ✅ |

**Ejemplo de la regla de cierre:** una cita a las **20:30** solo cabe si dura
**30 min** (termina exactamente a las 21:00). Con un servicio de 60 min, ese
bloque **no aparece**. 🧪

### 6.2 Estados de vida de una cita

`apptLife(a, now)` (`helpers.js` 453–485) devuelve `'past' | 'live' | 'future'`
y es **la única fuente de verdad** de la que cuelgan otras reglas. ✅ 🧪

| Estado | Definición |
|---|---|
| `past` | Terminó (según `duration`) **o** ya no es hoy y la fecha es pasada |
| `live` | Empezó pero **no ha terminado** (solo si es hoy) |
| `future` | Todavía no empieza |

### 6.3 Grupo visual de la lista de citas

`apptGroup(a, now)` (`helpers.js` 231–246), usado por `ApptsTab` (`App.jsx`
1839):

| Grupo | Condición |
|---|---|
| `noshow` | `completed === 'noshow'` |
| `today` | `date === hoy` |
| `tomorrow` | `date === mañana` |
| `upcoming` | `date > mañana` |
| `past` | todo lo demás |

> 📌 **«Pasada» es una fecha, no un estado.** Un `completed === 'false'` de
> ayer cae en `past`, **no** cambia de estado. Documentado también en el
> manual de usuario, sección 8.

### 6.4 Nada se marca «solo»

**No hay ningún proceso automático que cambie `completed`.** El campo solo
lo toca la operadora:

| Acción | Dónde |
|---|---|
| ✓ **Completar** (elige Efectivo / Transferencia) | `App.jsx` 1881, 1889 |
| ✗ **No asistió** | `App.jsx` 1881 |
| Crear cita → `completed: false` | `NewWizard`, `App.jsx` 2591 |

Lo único que cambia sin intervención es la **presentación**, nunca el dato:
`apptLife` y `apptGroup` clasifican por fecha y hora, y `apptStatus` deriva
lo que se muestra (`done` / `pending` / `noshow`) sin escribir nada.

> ⚠️ **Limitación real:** si a una cita **vencida** no le tocas «✓
> Completar», queda `pending` para siempre. Sus ingresos cuentan como
> **proyectados**, no como recibidos. Esto es coherente con §6.3 («pasada»
> es una fecha, no un estado) y con el manual de usuario §8.

> 📌 **Corregido:** esta sección describía antes un «agente de tiempo» en
> `App.jsx` 335–343 que completaba citas y borraba las marcadas
> `calStatus === 'deleted'`. Ese código **no existe en el repositorio ni
> existió en ningún commit**; era documentación de una funcionalidad no
> implementada.

### 6.5 Precios

```
totalPrice = sum(servicePrices) + (domicilio ? domicilioPrice : 0)
```

- `servicePrice` = suma de los precios **al crear**. ✅
- Al **editar servicios** de la cita, `servicePrice` **se recalcula** pero
  `paymentMethod` **se conserva** (`EditAppt` parte de `...appt`,
  `App.jsx` 2306–2312). ✅ 🧪
- Los precios **negativos** se rechazan en la UI (`setPErr`, `App.jsx` 2906,
  2936) **y** los sanea el backend. ✅ 🧪

---

## 7. Validación de horarios y solapamientos

### 7.1 `checkSlot` — `helpers.js` 532–545

Devuelve **`null`** si la hora sigue disponible, o un **mensaje legible en
español** si no (lo que pinta la UI directamente):

| Caso | Mensaje devuelto |
|---|---|
| Fecha vacía o ilegible | `La fecha no es válida.` |
| Fecha **anterior a hoy** | `La fecha ya pasó: elige un día desde hoy.` |
| Hora vacía | `Elige una hora.` |
| Duración ≤ 0 | `La duración del servicio no es válida.` |
| Hora fuera de `TIME_SLOTS` | `Las 21:30 no hacen parte del horario de atención.` |
| Slot **deshabilitado** | `Las 10:30 ya no están disponibles (Ocupada). Elige otra hora.` |
| Sin conflicto | `null` — **libre** ✅ |

El motivo entre paréntesis sale de `getSlots`: **`Ocupada`**, **`Hora
pasada`** o **`No alcanza antes del cierre`**. 🧪

**Cálculo de solape** — está **dentro de `getSlots`** (`helpers.js` 170),
no en una función aparte:

```
slotMin < b.start + b.dur  &&  b.start < slotMin + dur
```

Intervalos **medio-abiertos** `[inicio, fin)`: una cita que termina
exactamente cuando empieza otra **no solapa**, y no hace falta ninguna
tolerancia de minutos. ✅ 🧪

### 7.2 ¿Dónde se valida?

> ⚠️ **`checkSlot` se ejecuta SOLO en el cliente**, y solo al **crear** una
> cita: `NewWizard` (`App.jsx` 2567). **`EditAppt` NO lo llama** — allí la
> hora se revalida con `getSlots` (`App.jsx` 2256), que marca cada bloque
> como `disabled` y muestra el motivo.
>
> El backend **NO** vuelve a comprobar solapes: `doPost` delega en
> `calendarAction` (`createCalEvent` / `updateCalEvent`) **sin** validar
> choques. 🧪
>
> **Consecuencia:** dos personas agendando **a la vez desde dos dispositivos**
> pueden tomar la misma hora. `LockService` evita **corromper la hoja**, pero
> **no evita el doble reloj**. Es una limitación conocida, no un defecto
> oculto.

### 7.3 Horas tomadas en el selector

No hay un mapa de conflictos aparte: **`getSlots(date, _taken, allAppts,
excludeId, duration)`** (`helpers.js` 158–181) hace el trabajo entero. Para
cada bloque devuelve:

```js
{ time, disabled, conflict, reason }
```

- Filtra las citas **del mismo día** y les calcula su duración real
  (`apptDuration`), excluyendo `excludeId` (la propia cita al editar).
- `disabled` si **solapa**, si **no alcanza antes de las 21:00** o si es
  **hora pasada** (solo cuando el día es hoy).
- `reason` es el texto que ve la operadora: `Ocupada` / `Hora pasada` /
  `No alcanza antes del cierre`.

Lo usan `EditAppt` (`App.jsx` 2256) y `NewWizard` (`App.jsx` 2558) para
**deshabilitar** las horas tomadas. ✅ 🧪

---

## 8. Editar, completar, inasistencia y eliminar

### 8.1 Regla central: **solo las pendientes se modifican**

```
allowEdit     = appt.completed === 'false'      →  else «Solo las citas pendientes se pueden editar.»
allowDelete   = appt.completed === 'false'      →  else «Solo las citas pendientes se pueden eliminar.»
```

| Situación | ¿Editar? | ¿Eliminar? |
|---|:---:|:---:|
| 🟡 `completed === 'false'` | ✅ | ✅ |
| ✅ `completed === 'true'` | ❌ | ❌ |
| ❌ `completed === 'noshow'` | ❌ | ❌ |

**Implementación:** `EditAppt` (`App.jsx` 2172), `ApptDetail` (1974–2086) y
`deleteAppt` (479). 🧪 (cubierto en `helpers.test.js` y `backend.test.js`)

### 8.2 Flujo de «Completar»

```
«✓ Completar» → PayModal (Efectivo / Transferencia)
   → { completed:'true', paymentMethod }
   → saveData({ appointments })
```

`paymentMethod` se valida en el backend contra `in ('Efectivo','Transferencia')`
(`sanitizePayload`, `Code.gs` 2028). ✅ 🧪

### 8.3 Flujo de «No asistió»

```
«✗ No asistió» → confirm → { completed:'noshow' }
```

En los reportes, **«No asistió» aparece solo como número**, nunca como monto
(`reportLines`, `helpers.js` 702–755). ✅ 🧪 (prueba de paridad)

### 8.4 Eliminar una cita — `deleteAppt` (`App.jsx` 479–511)

**Secuencia real (4 pasos):**

1. Guarda el `calendarEventId`.
2. **Espera** la confirmación del servidor de que la cita se borró de la hoja.
3. Borra **solo** el evento de **esa** cita con `calDelete(appt.calendarEventId)`
   y comprueba `r.ok`.
4. Si falla → `confirm()` ofreciendo **reintento**; si el reintento también
   falla → `infoModal()` con el **ID del evento** para borrarlo a mano.

> 📌 **No se hace rollback.** Si el paso 3 falla, la cita **ya no está en
> Sheets** y el evento queda huérfano: la app prefiere **informar y dar vía de
> reintento** antes que inventar una transacción atómica que Sheets y Calendar
> no soportan. ✅ (documentado en el propio código, líneas 495–497)

---

## 9. Servicios y citas dependientes

### 9.1 Regla de eliminación

**No se puede eliminar un servicio que todavía tengan citas futuras activas o
en curso.**

| Bloqueadores | No bloquean |
|---|---|
| Citas con `life === 'future'` | Citas **pasadas** |
| Citas con `life === 'live'` | Completadas viejas |
| | No asistidas viejas |

### 9.2 Doble validación (cliente **y** servidor)

| Capa | Función | Archivo |
|---|---|---|
| Cliente | `serviceDeletionCheck(service, appts, services, now)` | `helpers.js` 487–518 |
| Servidor | `_serviceDeletionError(newServices, curServices, appts, now)` | `Code.gs` 724–760 |

**Ambas aplican los mismos criterios:**

1. **Por ID**: si la cita tiene `serviceIds`, compara **solo por id**.
2. **Por nombre**: solo si la cita **no** tiene ids y el nombre **no es
   ambiguo**.
3. **Ambigüedad**: si **dos o más servicios** comparten nombre normalizado
   (`normName`), el nombre **no sirve** para decidir y **se omite** — para no
   bloquear por un servicio homónimo. ✅ 🧪

**Resultado en el cliente:** `{ok, count, blockers, message}` con un mensaje
concreto. Si aun así el servidor rechaza la escritura, `ServicesTab.tryDelete`
**restaura la lista local** (`if (r === null) SS(safe)`, `App.jsx` 2918–2922)
para no mostrar de más un servicio que sigue en la hoja. ✅ 🧪

### 9.3 Resolución de servicios en reportes

`apptServiceRefs(a, services)` (`helpers.js`) **resuelve los servicios de una
cita contra el catálogo por `id`**. Esto es crítico porque `serviceNames` es un
CSV **ambiguo**: un servicio puede llamarse
`Diseño, depilación y sombreado`.

| Caso | Comportamiento |
|---|---|
| La cita trae `serviceIds` | Resuelve **por id** contra el catálogo |
| 1 solo servicio sin catálogo | Usa **el texto completo** del snapshot (sobrevive a un catálogo sin cargar) |
| Varias, con **algún** id todavía en catálogo | **Reconstrucción con anclas** (`recoverSnapshotNames`) |
| Varias, con **ningún** id en catálogo | Réserva **posicional** — sin anclas no hay por dónde cortar |
| Sin ids (citas antiguas) | Recién ahí se **parte por coma** (último recurso) |

> 📌 **Bug corregido:** antes se partía `serviceNames` por coma siempre, lo que
> **inventaba entradas fantasma** en los rankings y **desalineaba** la
> búsqueda de precios (que indexaba por posición). `topServicesByDemand(appts,
> services)` comparte esa misma resolución y mantiene el **orden de
> inserción** en los empates (sort estable).

> 🔎 **Reconstrucción con anclas** — el caso de varias citas es el que
> costaba: si un servicio **borrado** tenía coma en el nombre
> (`Diseño, depilación de pestañas`), posicionarlo por índice devolvía un
> **trozo** (`Diseño`). Ahora, con al menos un nombre del catálogo como
> **ancla**, se recorre el texto en orden y el que falta ocupa desde donde
> acaba el anterior conocido hasta donde empieza el siguiente.
>
> Detalle que costó un segundo arreglo: la ancla se busca **solo en
> límite de palabra** (inicio del texto o justo tras `«, »`). Por simple
> subcadena, si una ancla es **prefijo** de otra —`Cejas` dentro de
> `Cejas full`— devolvía la posición equivocada.
>
> Réplica obligatoria en **`Code.gs` → `_recoverSnapshotNames`** (ES5),
> cubierta por el test de **paridad frontend↔backend**. Si se toca un lado
> sin el otro, los 317 tests se caen.

---

## 10. Google Calendar

### 10.1 Operaciones

| Operación | Función | Línea | Comportamiento |
|---|---|---:|---|
| **Crear** | `createCalEvent` | 679 | Crea en el calendario **por defecto**, color `MAUVE`, sin invitaciones → `{ok, eventId}` |
| **Actualizar** | `updateCalEvent` | 710 | Usa **solo** el id que trae la cita; **nunca crea**. Comprueba **después** de escribir que Calendar aplicó la hora (tolerancia 1 s); si no → `{ok:false, error:'not_applied'}` |
| **Borrar** | `deleteCalEvent` | 764 | Usa solo el id. Si no existe → `{ok:true, alreadyGone:true}` (**idempotente**). **Nunca** barre el calendario |

### 10.2 Contenido del evento

| Elemento | Valor |
|---|---|
| Título | `✨ <servicios> — <cliente>` (`calTitle_`, 693) |
| Descripción | Cliente, celular, servicios, total y — si es a domicilio — valor y dirección (`calDescription_`, 697) |
| Color | `MAUVE` |
| Invitaciones | **No se envían** (`addGuests` ausente) |

### 10.3 Integración con la API de citas

En `doPost` (línea 72) el flujo es:

```
writeSheet  →  si hay calendarAction  →  create/update/deleteCalEvent
             →  si ok:true, se persiste calendarEventId / calendarCreated
             →  si ok:false, se devuelve el error al cliente
```

| Acción en la app | `calendarAction` |
|---|---|
| Crear cita | `create` |
| Editar (fecha/hora/servicios) | `update` |
| Eliminar | `delete` |
| Completar / marcar no asistió | **ninguno** (no afecta al evento) |

### 10.4 ¿Y si la sincronización falla?

**No hay transaccionalidad entre Sheets y Calendar.** El diseño acepta eso
explícitamente:

- **Borrado:** avisar + reintento + mostrar el ID (`App.jsx` 498–510).
- **Edición:** si Calendar no aplicó la hora, el backend devuelve error y la
  app **no** comunica el éxito.
- **Reset:** los eventos se borran **desde el servidor** dentro de la
  operación ya autorizada (`_resetData`, 457–476); el frontend no borra nada
  antes de autorizar.

> 🔎 **No verificado en producción:** la existencia de eventos en un entorno
> real de Google. Cubierto en `backend.test.js` con mocks de `CalendarApp`.

---

## 11. Clientes y servicios

### 11.1 Clientes

| Función | Implementación | Regla |
|---|---|---|
| Búsqueda | `phoneMatch` (`helpers.js` 50) + `ClientsTab` (`App.jsx` 2829) | **Sufijo** del celular primero, luego **subcadena** del nombre |
| Alta al agendar | `NewWizard` (`App.jsx` 2546) | Si el nombre no existe → se crea con `uid()` |
| Historial | `ClientHistory` (3171) | Citas, montos, última visita |
| Reutilización | — | ⚠️ Si **2 clientas** comparten celular, **no** se fusionan |

### 11.2 Servicios

| Función | Implementación |
|---|---|
| Crear | `ServicesTab.add` (`App.jsx` 2908): `{id:uid(), name, price, duration}` con `price ≥ 0` |
| Editar | `ServicesTab` (2936): recalcula `price` con `Math.max(0, …)` |
| Duración | Selector de 60 min por defecto; opciones 30/60/90/120/150/180 (`App.jsx` 237) |
| Eliminar | `tryDelete` (2913) → `serviceDeletionCheck` → confirm → `SS(next)` |
| Historial de precios | `trackPriceChanges` (`Code.gs` 1912) en el servidor |

### 11.3 Catálogo por defecto

`DEFAULT_SERVICES` (`App.jsx` 226) trae **9 servicios precargados** con precio y
duración, para que la app no arranque vacía.

---

## 12. Finanzas y fórmulas de reportes

### 12.1 Métricas (`reportMetrics`, `helpers.js`)

| Métrica | Fórmula |
|---|---|
| **Ingresos recibidos** | Suma de `totalPrice` de citas con `completed === 'true'` |
| **Pendiente** | Suma de `totalPrice` de citas con `completed === 'false'` |
| **Proyectado** | Recibido + pendiente |
| **Gastos** | Suma de `amount` de los gastos del período |
| **Balance neto** | Ingresos recibidos **−** gastos |
| **No asistidos** | **Conteo** de citas con `completed === 'noshow'` (**nunca dinero**) |

> 📌 **«No asistió» es un número.** Existe una **prueba de paridad** que
> compara el texto del WhatsApp con el del correo y falla si aparece como
> monto. ✅ 🧪

### 12.2 Períodos (`periodLedger`, `helpers.js`)

| Tipo | Selección | Etiqueta |
|---|---|---|
| `day` | `date === YYYY-MM-DD` | `Día d mmm` |
| `month` | `date` con prefijo `YYYY-MM` | `Mes yyyy MM` |
| `range` | `from ≤ date ≤ to` | `Día d mmm` … `—` … |
| **`year`** | `y-01-01 ≤ date ≤ y-12-31` | **`Año y`** |

⚠️ **La etiqueta `Año <y>` debe ser byte-idéntica** entre `helpers.js` y
`Code.gs`; si difiere, falla la prueba de paridad. 🧪

> 📌 **Solo «Por rango» puede ir al futuro.** El `<input>` de **Día** lleva
> `max={today}` y el de **Mes** `max={monthStr()}` (`App.jsx` 3886, 3888),
> pero el de **Desde/Hasta** solo se limita entre sí (`max={to}` /
> `min={from}`, 3896–3897): sirve para revisar citas ya agendadas con
> antelación. Ningún predicado compara contra hoy — ni `inPeriod`
> (`App.jsx` 3643–3650) ni `_inPeriod` (`Code.gs` 1135): solo hacen
> `desde ≤ fecha ≤ hasta`. 🧪

### 12.3 Detalle de gastos en el **texto del reporte** — regla de 8

> ℹ️ Esta regla gobierna **solo el mensaje** (`reportLines` /
> `_buildReport`): cómo se compacta la lista de gastos del período para
> que el WhatsApp y el correo no salgan interminables. **La pantalla
> «📤 Detalle Gastos» de Finanzas no la usa** (ver la nota al final).

| Situación | Comportamiento |
|---|---|
| **≤ 8** gastos | Se listan **uno por línea** |
| **> 8** gastos | **Una línea por categoría**, de mayor a menor, con conteo: `Gasolina: $150.000 (5)` |
| **> 20** categorías | Se muestran las **20 primeras** y avisa `… y N más` |
| Sin categoría | Van a un solo cubo **`Sin categoría`** |

**Constantes:** `REPORT_EXPENSE_DETAIL_MAX = 8` y
`MAX_REPORT_EXPENSES = 20` (`helpers.js` 764 y 757); réplicas
`DETALLE_MAX`/`MAX_EXP` en `Code.gs` 1639/1644. ✅ 🧪

> ⚠️ **Regla invariante:** el **`• Total gastos`** siempre suma **todo** el
> período **sin importar cuántas líneas se muestren**. Es una propiedad con
> prueba explícita. 🧪
>
> ⚠️ El **Excel exportado desde la app sí trae TODOS los gastos**, línea por
> línea: la agrupación aplica **solo** al texto del mensaje. 🧪

> 📌 **La pantalla «📤 Detalle Gastos» no agrupa por la regla de 8.** Mientras
> haya gastos en el mes pinta **siempre las dos vistas**: la tarjeta
> **«Por categoría»** (todas las categorías, de mayor a menor, con barra de
> participación) y debajo las tarjetas **por día**, con los gastos uno por
> uno y sus botones ✏️ / ✕. La única vista condicional es la de categoría:
> no aparece si `byCat` está vacía.
>
> La tarjeta **«Por categoría» es interactiva**: cada línea es un botón.
> Al tocarla, `openCat` despliega debajo, teñido con `--primary-l` y
> `--glass-strong` de la paleta activa, **todos los gastos de esa
> categoría** (del más reciente al más antiguo y, dentro del día, por
> `cmpExpense` — descripción A→Z y luego mayor monto;
> `CATEGORY_PAGE_SIZE = 10`
> por página con `CirclePager`); `catPage` es **una sola página
> compartida** y el `useEffect` de `App.jsx` 4442 la devuelve a **1**
> **cada vez que cambia `openCat` o `month`** — abrir otra categoría, o
> cerrar y volver a abrir, **arranca siempre en la página 1**. Los
> **totales no cambian** al abrir o cerrar. ✅

### 12.4 Reparto por método de pago

No hay una función aparte: lo calcula **`periodLedger`** (`helpers.js`
606–609) sobre sus `incomes`, con un `sumBy` local:

| Campo | Cómo sale |
|---|---|
| `totalCash` | `sumBy('Efectivo')` |
| `totalTransfer` | `sumBy('Transferencia')` |
| `totalNoMethod` | `totalIncome − totalCash − totalTransfer` — citas completadas **antes** de que existiera el método |

En el reporte se pinta como `- Efectivo: $…` / `- Transferencia: $…`
(`reportLines`, 723–724) y en el Excel como `SUMIF` sobre la columna
`Movimientos!J`. 🧪

> 📌 **Corregido:** aquí se citaba antes una función `splitPaid(appts)` que
> **no existe** en `helpers.js` (ni existió en el repositorio).

### 12.5 Paginación de las listas largas

Las listas que pueden crecer sin control saturaban la pantalla del celular.
Hay **dos familias** de control, definidas en `App.jsx` junto a
`SyncBadge`:

| Constante | Tamaño | Dónde |
|---|---:|---|
| `PAGE_SIZE` | 10 | Listas planas (por defecto del `Pager`) |
| `CLIENT_APPT_PAGE_SIZE` | 5 | «Todas las citas» del historial de cliente |
| `DAY_PAGE_SIZE` | 7 | **Días** de «Detalle Gastos» y «Detalle Ingresos» |
| `ITEM_PAGE_SIZE` | 5 | **Gastos / citas dentro de cada día** |
| `CATEGORY_PAGE_SIZE` | 10 | Gastos de **una categoría** desplegada en «Detalle Gastos» |

#### 12.5.1 Familia PLANA — `Pager` (‹ Ant. / Sig. ›)

| Lista | Componente | Se reinicia al… |
|---|---|---|
| **📋 Gastos del mes** | `FinancesTab` | cambiar de **mes** |
| **🧾 Movimientos del período** | `ReportTab` | cambiar de **período** (`mode`, `day`, `month`, `year`, `from`, `to`) o de **filtro** (`mvFilter`) |
| **💚 Detalle Ingresos** — lista de **días** | `IncomeDetail` | cambiar de **mes** o de **filtro** (`filter`: Todo / Recibido / Pendiente / No asistió) |
| **📤 Detalle Gastos** — lista de **días** | `ExpenseDetail` | cambiar de **mes** |
| **🗓️ Todas las citas** (historial de cliente) | `ClientHistory` | cambiar de **cliente** — el componente se desmonta y `apptPage` vuelve a 1 (no hace falta `useEffect`, `App.jsx` 3174–3178) |

**Reglas del control `Pager`:**

| Regla | Implementación |
|---|---|
| **No aparece** si la lista cabe entera (`total <= size`) | `if (total <= sz) return null` |
| Muestra el rango y la posición: `1–7 de 20 días · pág. 1 de 3` | `first`/`last` calculados sobre el total, **no** sobre la página |
| El rango se **recorta siempre** dentro de `[1, pages]` | `Math.min(Math.max(1,page),pages)` — una lista que encoge nunca deja la vista vacía |
| **‹ Ant.** deshabilitado en la primera página, **Sig. ›** en la última | `disabled` + opacidad 0,4 |
| El estado lo lleva el **padre**, no el propio `Pager` | `expPage` (2992) / `apptPage` (3178) / `mvPage` (3639) / `incPage` (4058) / `dayPage` (4434) + `useEffect` de reinicio |
| Acepta tamaño propio con `size` | `size={DAY_PAGE_SIZE}` (7) o `size={CLIENT_APPT_PAGE_SIZE}` (5) — sin `size` sigue en 10 |

#### 12.5.2 Familia ANIDADA — `CirclePager` (número dentro de un círculo)

> ℹ️ **Ojo, no hay que confundirlos:** en «Detalle Gastos» e «Detalle
> Ingresos» **los DÍA van con el `Pager` plano** de §12.5.1
> (`App.jsx` 4168 y 4582). El `CirclePager` se usa **solo** para lo que hay
> *dentro* de una tarjeta, donde un segundo `‹ Ant. / Sig. ›` seguido del
> primero se lee mal:

| Lista | Lo que pagina dentro | Tamaño | `App.jsx` |
|---|---|---:|---:|
| **💚 Detalle Ingresos** | citas de **un día** | `ITEM_PAGE_SIZE` = 5 | 4158 |
| **📤 Detalle Gastos** | gastos de **un día** | `ITEM_PAGE_SIZE` = 5 | 4576 |
| **📤 Detalle Gastos** | **categoría desplegada** | `CATEGORY_PAGE_SIZE` = 10 | 4537 |

| Regla | Implementación |
|---|---|
| **No aparece** si todo cabe (`total <= size`), igual que `Pager` | `if (total <= sz) return null` |
| Los dos extremos son **flechas `‹ ›`**, nunca números | `arrow(…, '‹', p-1, p<=1)` |
| La página activa va en círculo **relleno**; el resto, en claro | `background: n===p ? 'var(--primary)' : 'var(--primary-l)'` |
| Con muchas páginas no se listan todas: `1 … 4 5 6 … 10` | primera, última y vecinas de la actual, un `…` por hueco |
| Cada día guarda **su propia** página | `expPages` / `apptPages`: mapa **día → página** |

> 🔎 **Bug corregido:** los extremos pintaban primero el **número de la
> página a la que llevaban**, no una flecha. Salía un `0` en la primera
> página y, al avanzar, la numeración se descuadraba (`1 2 3 3`: «Sig.»
> repetía el último número).

> 📌 En «Detalle Gastos» e «Detalle Ingresos» se pagina la lista de
> **tarjetas de día** (el bloque `byDay`) y, además, el contenido de cada
> tarjeta. Cada tarjeta de día conserva **todos** sus gastos/citas repartidos
> entre sus páginas.

> ⚠️ **Invariante crítico:** los totales **no** se recalculan por página.
>
> - En `FinancesTab`, los balances salen de `monthLedger(safeA, safe, month)`,
>   que recibe **todos** los gastos del mes.
> - En `ReportTab`, el **Neto del período** sale de `M.neto` (`reportMetrics`
>   sobre el `ledger` completo), **no** de `mvShown`.
> - En `IncomeDetail`, los montos y contadores de las 4 tarjetas salen de
>   `ma` / `done` / `pend` / `noshow` **completos**, **no** de `dayShown`.
> - En `ExpenseDetail`, el total del mes, el desglose por categoría y el
>   total de cada tarjeta de día y de cada categoría desplegada salen de
>   `me` **completo**, **no** de lo que se ve en la página.

> 📌 **Limpieza incidental:** al paginar, el filtro de movimientos se refactorizó
> para calcularse **una sola vez** (`mvRows`); antes `ledger.rows.filter(…)`
> se ejecutaba **dos veces** (una para el chequeo de vacío y otra para el
> `.map`).

### 12.6 Orden de las listas

La regla general es **de lo más reciente a lo más antiguo**; cuando dos
registros comparten fecha se usa un **desempate explícito** en vez del orden
en que llegaron de la hoja.

| Lista | Orden | Dónde |
|---|---|---|
| **Gastos del mes** (Finanzas) | fecha descendente + `cmpExpense` | `meSorted`, `App.jsx` 3020 |
| **Movimientos del período** (pantalla) | fecha descendente | `mvRows`, `App.jsx` 3719–3720 |
| **Días** en Detalle Gastos / Ingresos | fecha descendente | `dayEntries`, 4092 / 4456 |
| **Gastos de una categoría** desplegada | fecha descendente + `cmpExpense` | `catList`, 4465–4466 |
| **Todas las citas** (historial de cliente) | fecha descendente | `cAppts`, 3184 |
| **Citas de un día** (Detalle Ingresos) | **hora ascendente** | `ma`, 4073–4075 |
| **Gastos de un día** (Detalle Gastos) | **descripción A→Z** y, si empatan, **mayor monto** | `me` (4445) → `byDay`; criterio en `cmpExpense` |

#### 12.6.1 El desempate de gastos — `cmpExpense` (`App.jsx` 5117–5120)

Una **cita** se puede ordenar por hora (`cleanTime`); un **gasto no tiene
hora**, así que ordenar solo por fecha dejaba cada día en el orden en que las
filas llegaban de Google Sheets — es decir, en el orden en que a la dueña le
dio por registrarlas.

```js
const cmpExpense = (a, b) =>
  String((a && a.description) || '').localeCompare(
    String((b && b.description) || ''), 'es', { sensitivity: 'base' })
  || toN(b && b.amount) - toN(a && a.amount)
```

| Paso | Criterio |
|---|---|
| 1 | `description` **A → Z**, con `sensitivity:'base'` → ignora mayúsculas y acentos (`«arriendo»` y `«Arriendo»` empatan) |
| 2 | Si siguen empatando → **monto mayor** primero |
| 3 | Si aún así → manda el **orden estable** de `Array.sort` (el del servidor) |

Se aplica **como segundo criterio de la fecha** en las tres listas de gastos:
`me` (4445, de donde salen los grupos `byDay`), `catList` (4466) y
`meSorted` (3020).

> ✅ **Los totales no cambian.** El total del mes, el desglose por categoría,
> el total de cada tarjeta de día y el de cada categoría desplegada son
> **`reduce` sobre la lista completa**: una suma no depende del orden. Y los
> cortes por página (`slice`) se hacen **después** de ordenar.

> 📌 **Invariante de la UI:** el criterio es el **mismo en las tres listas**,
> así un gasto aparece en la misma posición relativa en «Gastos del mes», en
> la tarjeta de su día y dentro de su categoría desplegada. ✅ sin test
> unitario: `cmpExpense` vive en `App.jsx`, que las pruebas no importan
> (ver §3.1, «componentes no unit-testeados»).

> ⚠️ En `ReportTab` el orden de pantalla se aplica **encima** de
> `ledger.rows`, que **no se toca**: `filter()` devuelve un arreglo nuevo.
> El libro se mantiene **cronológico** porque de ahí salen también el
> mensaje de WhatsApp, el Excel y la réplica `_periodLedger` de `Code.gs`
> que manda los reportes por correo. Ordenarlo ahí habría obligado a
> desplegar el backend.

---

## 13. Exportaciones y reportes

### 13.1 Exportación a Excel desde la app (SheetJS)

`exportExcel()` en `ReportTab` (`App.jsx` 3740):

- Usa la librería **`xlsx` 0.18.5** (dependencia de producción).
- Genera **3 hojas**: **Resumen · Citas · Gastos**.
- **Trae todos los gastos, línea por línea** (no agrupados).
- Descarga como `.xlsx`.

### 13.2 Reporte por WhatsApp (frontend)

- `sendWA` construye el texto con `reportLines` y abre **`wa.me`** con el
  número del admin (`VITE_ADMIN_WHATSAPP`).
- Si no hay número configurado, **el botón sale deshabilitado** (`App.jsx`
  206, 4021–4036). ✅

### 13.3 Reportes por correo (Apps Script)

| Función | Línea | Dispara | Período | Guard |
|---|---:|---|---|---|
| `sendDailyReportEmail` | 1801 | diario 12:00 | hoy | — |
| `sendWeeklyReportEmail` | 1815 | domingo 12:00 | Lun–Dom | si hoy no es domingo → `SKIP` |
| `sendMonthlyReportEmail` | 1836 | diario 12:00 | mes en curso | si no es el último día → `SKIP` |
| `sendYearlyReportEmail` | 1861 | diario 12:00 | 1 ene – 31 dic | si hoy no es 31 dic → `SKIP` |

**`setupAllReportTriggers()` (1882) instala 4 triggers** de forma idempotente. ✅

> 📌 **Por qué se disparan a diario:** Apps Script **no tiene** trigger de
> «último día del mes/año». Por eso la función misma decide no enviar. Ver
> `SKIP …` en los registros es **normal**.

### 13.4 El adjunto `.xlsx` generado por Apps Script

`_buildReportXlsx` (`Code.gs` 1375) — **no usa SheetJS**:

```
SpreadsheetApp.create()  →  poblar con setValues  →  SpreadsheetApp.flush()
   →  Utilities.sleep(1500)
   →  UrlFetchApp.fetch(Drive URL + UrlFetchApp.getOAuthToken())
   →  resp.getBlob().getBytes()          ← NO resp.getBytes()
   →  validar que empiece por «PK» (ZIP real)
   →  ¿no? → reintentar (máx. 3)  ¿sí? → adjuntar y File.setTrashed(true)
```

| Decisión | Motivo |
|---|---|
| `flush()` + `sleep(1500)` | Evita el **xlsx vacío con HTTP 200** (datos aún no volcados) |
| Validar prefijo `PK` | Un ZIP válido empieza por `PK`; si no, el archivo está vacío |
| **3 intentos** | Cubre la latencia eventual de Drive |
| `resp.getBlob().getBytes()` | **`HTTPResponse` no tiene `getBytes()`** — eso rompía en producción |
| **Si todo falla** | **El correo se envía igual, sin adjunto** y el HTML muestra `⚠ El Excel del reporte no se pudo generar: el correo va sin adjunto.` |

**Nombre del archivo** (`_xlsxName`, 1579):

| Período | Nombre |
|---|---|
| día | `reporte_YYYY-MM-DD.xlsx` |
| mes | `reporte_YYYY-MM.xlsx` |
| **año** | **`reporte_YYYY.xlsx`** |
| rango | `reporte_DE_DESDE_A_HASTA.xlsx` |

**Columnas** (`anchosDe`, 1451): anchos en **píxeles** (`caracteres * 7 + 5`)
**más** `autoResizeColumns(1, n)`, dentro de un `try/catch` cosmético — un fallo
de formato **nunca** debe romper el envío. ✅

### 13.5 Paridad WhatsApp ↔ correo

> 📌 **Regla:** el texto del WhatsApp y el del correo deben ser **exactamente
> el mismo**. `backend.test.js` importa `reportLines` del frontend y lo compara
> con la salida de `_buildReport`. Cualquier divergencia **rompe la suite**. 🧪
>
> Las réplicas en `Code.gs` (`_groupExpenses`, `_topServicesByDemand`) están
> comentadas como «MISMO orden y mismo criterio de desempate (por nombre, SIN
> `localeCompare`, que puede variar entre entornos)».

---

## 14. Restablecimiento y autorización

### 14.1 Token de sincronización

| Propiedad | Detalle |
|---|---|
| Backend | `TOKEN_PROP_KEY = 'SB_SYNC_TOKEN'` (`Code.gs` 15) |
| Frontend | `VITE_TOKEN` (`api.js` 2) |
| Verificación | `_checkToken` (244) |
| Si **falta** la propiedad | **Fail closed**: `«Token de sincronización no configurado: añade la propiedad SB_SYNC_TOKEN…»` |
| Si no coincide | `«No autorizado»` |
| Comparación | `_secureEqual` — **tiempo lineal** (233) |

> ⚠️ `VITE_TOKEN` **no es un secreto**: viaja en el bundle JS y en el query
> string. El auténtico es la propiedad del servidor.

### 14.2 El reset exige una autorización emitida por el servidor

El token **no basta** para destructivos. Se exige un **grant de un solo uso**.

| Paso | Función | Línea | Qué valida |
|---|---|---:|---|
| 1. Pedir código | `_requestResetCode` | 296 | Rate-limit: **3 envíos/hora** → si se agotan, bloqueo de **30 min**. Código de **8 caracteres** (`A-Z`, `2-9`, sin `0/O/I/1`). Vigencia **15 min**. Guarda **solo el hash**. Se envía **exclusivamente** al correo autorizado. **La respuesta siempre es idéntica** (no revela si el correo existe o si estás bloqueado). |
| 2. Verificar código | `_verifyResetCode` | 418 | Normaliza (quita espacios/saltos, mayúsculas) → compara **hashes** con comparación en **tiempo lineal**. Máx. **5 intentos**. **Un solo uso**. Si es válido → emite `grantId` + `grantSecret`, vigencia **10 min**, guardado **solo como hash**. |
| 3. Ejecutar | `_resetData` | 472 | `_checkResetAuth` → `_consumeGrant` (273): exige el grant y lo **consume antes de escribir nada**. No se puede repetir. |

### 14.3 ¿Cómo detecta el backend una operación destructiva?

`_isDestructivePayload(b)` (`Code.gs` 258):

```
action === 'resetData'
  OR resetPriceHistory truthy
  OR (más de UNA colección definida entre clients, services, appointments, expenses)
```

> 📌 Las sincronizaciones normales mandan **una sola** colección, así que
> **nunca** exigen grant. 🧪

### 14.4 Constantes de seguridad

| Constante | Valor | Línea |
|---|---|---:|
| `CODE_TTL_MS` | 15 min | 172 |
| `GRANT_TTL_MS` | 10 min | 173 |
| `MAX_VERIFY_TRIES` | 5 | 174 |
| `LOCKOUT_MS` | 30 min | 175 |
| `MAX_SENDS` / `SEND_WINDOW_MS` | 3 / 1 h | 176–177 |
| `CODE_ALPHABET` | 32 símbolos | — |

### 14.5 Recuperación si la respuesta del servidor se pierde

`resetAll` (`App.jsx` 414–456) contempla que el reset **se ejecutó pero la
respuesta se perdió**. En vez de asumir, **relee la hoja** y la compara
(`isResetOutcome`):

| Situación | Resultado |
|---|---|
| El servidor sí lo ejecutó | Aplica el estado local y reporta éxito (`confirmado: true`) |
| No se ejecutó | Pide código nuevo y lo dice claramente |
| No se pudo comprobar | Avisa de que hay que revisar la hoja |

> 🚨 **El reset borra:** `clients`, `services` (catálogo), `appointments`,
> `expenses`, `priceHistory` y **todos los eventos de Calendar** (hecho por el
> servidor en `Code.gs` 475–482, nunca por el frontend).
> **No se puede deshacer.**

---

## 15. Manejo de errores y recuperación

### 15.1 Mensajes de transporte (`src/api.js`)

Textos **literales** de `httpError()` (15–25) y de `call()` (29–45) — son los
que ve la operadora:

| Caso | Línea | Mensaje exacto |
|---|---:|---|
| 404 con `/macros/u/\d+/` | 17–18 | `HTTP 404: Google reescribió la dirección con /u/N/. ` + `MULTI_ACCOUNT_HINT` |
| 404 normal | 19 | `HTTP 404: Apps Script no encontró el Web App. Comprueba la URL y la versión publicada en Apps Script.` |
| 401 / 403 | 21 | `HTTP 403: Google no autorizó la conexión. ` + `MULTI_ACCOUNT_HINT` |
| 429 | 22 | `HTTP 429: Google está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.` |
| 5xx | 23 | `HTTP 500: Apps Script falló del lado de Google. Reintenta en unos minutos.` |
| Red / `fetch` rechazado | 34–37 | `Sin respuesta de Apps Script (<motivo>). Revisa tu conexión a internet. ` + `MULTI_ACCOUNT_HINT` |
| Respuesta no-JSON | 42 | `Apps Script devolvió algo que no es JSON: publica de nuevo la última versión del Web App.` |
| **HTTP 200 con `{ok:false}`** | 43 | El **`json.error` del servidor**; si no lo hay, el `fallback` del llamador (`'Error guardando'`, `'Error cargando datos'`, …) |
| `VITE_SCRIPT_URL` sin definir | 48, 53 | `VITE_SCRIPT_URL no configurado` |

> 📌 `MULTI_ACCOUNT_HINT` (11) se aparca en varios de ellos: es el aviso de
> «Hay varias cuentas de Google abiertas en este navegador… entra en una
> ventana de incógnito». **Nunca se sustituye el `json.error` del servidor**:
> solo se «dora» el error de red/HTTP de abajo (comentario de `api.js` 4–10).

> 🚨 **Ojo con el 403:** `httpError` no puede distinguir un token malo de un
> permiso de Google, así que el texto habla de Google. El rechazo real de
> token llega **por JSON** con `«No autorizado»` (`_checkToken`, `Code.gs`
> 244–252), en una respuesta HTTP 200.

### 15.2 Modo offline

1. Si `loadData()` falla → `setSt('error')` (324) y se leen las cuatro
   claves de `localStorage` (`App.jsx` 326–330): `sb_c`, `sb_s`, `sb_a`, `sb_e`.
2. En la parte superior aparece **`⚠️ Modo sin conexión — <mensaje>`**
   (`App.jsx` 562) y el `SyncBadge` (711) pasa a **`⚠️`**.
3. **No hay cola de reintentos.** `sync` devuelve `null` (387): el cambio
   queda solo en pantalla + `localStorage` y **no se vuelve a enviar**. Se
   recupera solo cuando el próximo `refresh` (cada 30 s) o una recarga
   vuelven a traer la hoja.
   - **Excepción: Calendar.** Ahí sí hay reintento **manual** —
     `retryCalendar` (`App.jsx` 2336) con su botón (2454–2455), para el
     caso de «se guardó la cita pero no el evento».
4. Mientras hay `savingRef` en vuelo, `refresh` **no corre** (313) para no
   pisar la escritura.

### 15.3 Escritura optimista (sin reversión inmediata)

`sync` (`App.jsx` 372–389), del que cuelgan `SC` / `SS` / `SA` / `SE`
(líneas 391–394):

```
setState(nuevo) + localStorage  →  saveData()
   → ok     → marca 'ok' y programa un refresh en 1,5 s
   → fallo  → marca 'error' 5 s y devuelve null  (NO revierte)
```

Los llamadores **abortan** al recibir `null` — `deleteAppt` no toca Calendar,
`EditAppt` no actualiza el evento, etc. — pero **la pantalla conserva el
cambio hasta el próximo `refresh`**, que ocurre como máximo **30 s
después** (o al recargar la pestaña). 🧪

> 📌 Esto es deliberado: el fallo pudo ser de **transporte** con el servidor
> ya escrito. Revertir a ciegas dejaría la pantalla en desacuerdo con la
> hoja. `refresh` es quien finalmente iguala ambas cosas.

### 15.4 Manejo de errores del backend

| Mecanismo | Lugar |
|---|---|
| `try/catch` global en `doPost` | Devuelve `{ok:false, error}` siempre en JSON |
| `console.error` en respaldos | `createDailyBackup`, `sendWeeklyBackupEmail` |
| `try/catch` cosmético en el Excel | `_buildReportXlsx` — un fallo de formato no rompe el envío |
| `catch(_){}` vacío en el correo de reset | `Code.gs` 335 — un fallo de Gmail **no** revela si el correo existe |

### 15.5 Integridad de datos

| Protección | Implementación |
|---|---|
| Escrituras concurrentes | `LockService.getScriptLock()` + `waitLock(10000)` → `«Servidor ocupado, reintenta»` (`Code.gs` 59–60) |
| Claves ajenas al esquema | **No hay filtrado**: nunca llegan a la hoja porque `writeSheet` solo escribe `HEADERS_ES` (ver §5.3) |
| Montos negativos | Saneados a `0` en el servidor (`clip0`, `Code.gs` 2013) |
| Duraciones absurdas | Recortadas a 15–480 (`safeDuration`) |
| Filas sin ID | Descartadas al leer |
| Hojas con columnas de más | Ignoradas con `console.warn` |

---

## 16. Limitaciones conocidas

Confirmadas leyendo el código; **no son defectos ocultos**.

| # | Limitación | Dónde |
|---|---|---|
| 1 | **Sin roles ni sesión**: cualquiera con URL + token ve y edita todo | Arquitectura general |
| 2 | **`VITE_TOKEN` no es secreto** — va en el bundle público | `api.js` 1–2 |
| 3 | **La validación de horarios es solo en el cliente**: doble reloj posible entre dos dispositivos | `checkSlot`, `helpers.js` 532 |
| 4 | **No hay transaccionalidad Sheets ↔ Calendar**: posible evento huérfano | `deleteAppt`, `App.jsx` 479–511 |
| 5 | **El reloj de la app** (agrupar por pasado/hoy, marcar horas vencidas) solo corre si el navegador está abierto | `apptGroup` / `apptLife`, `helpers.js` 231, 453 |
| 6 | **`writeSheet` borra ediciones manuales** de la hoja | `Code.gs` 1983 |
| 7 | ~~Destinatario de reportes hardcodeado~~ → **CORREGIDO**: los tres envíos leen `_authorizedEmail()` / `SB_AUTHORIZED_EMAIL` | `Code.gs` 185 |
| 8 | **El guardado fallido no revierte la pantalla** de inmediato: espera al próximo polling (≤30 s) | `sync`, `App.jsx` 385–388 |
| 9 | **Eventos de Calendar no se respaldan** | — |
| 10 | **Dos clientas con el mismo celular no se fusionan** | — |
| 11 | **Lógica duplicada** frontend ↔ backend (revelada por las pruebas de paridad) | `helpers.js` / `Code.gs` |
| 12 | **Los `VITE_*` requieren rebuild** — no cambian en caliente | Vite |
| 13 | **`App.jsx` es monolítico** (~5.120 líneas) — decisión deliberada, documentada | `App.jsx` |
| 14 | ~~`VITE_BIZ_SUBTITLE` no llegaba al `<title>` de la pestaña~~ → **CORREGIDO**: había **dos** `useEffect` de branding y el segundo (`App.jsx` 341–351, deps `[]`) pisaba al primero (293–306). React ejecuta los efectos en orden de declaración, así que ganaba el segundo y se perdía el subtítulo — **solo en la pestaña**, porque en el encabezado (533) sí se veía, y por eso el fallo pasaba inadvertido. Ahora **solo existe el de 293–306**, único escritor del `document.title` (294, formato `NOMBRE · SUBTITULO`), del favicon (297–299) y del `apple-touch-icon` (302–304); el hueco donde estaba el segundo lleva un comentario que prohíbe reañadirlo. | `App.jsx` 293–306 |

---

## 17. Matriz de funcionalidades

| # | Funcionalidad | Archivo / función | ✅ Código | 🧪 Tests |
|---:|---|---|:---:|:---:|
| **CITAS** | | | | |
| 1 | Bloques 07:00–20:30 / 30 min | `helpers.js` `TIME_SLOTS` | ✅ | 🧪 |
| 2 | Cierre a las 21:00 | `helpers.js` `CLOSING_TIME`, `getSlots` | ✅ | 🧪 |
| 3 | Duración por servicio (15–480) | `Code.gs` `safeDuration` (único que recorta) + `helpers.js` `svcDuration` (por defecto) | ✅ | 🧪 |
| 4 | Duración = suma de servicios | `helpers.js` `sumDuration` | ✅ | 🧪 |
| 5 | Detección de solapes | `helpers.js` `checkSlot` + `getSlots` | ✅ | 🧪 |
| 6 | Horas ocupadas marcadas en el selector | `helpers.js` `getSlots` → `{disabled, conflict, reason}` | ✅ | 🧪 |
| 7 | Estados de vida (`past/live/future`) | `helpers.js` `apptLife` | ✅ | 🧪 |
| 8 | Grupos de la lista | `helpers.js` `apptGroup` | ✅ | 🧪 |
| 9 | Múltiples servicios (combo) | `NewWizard`, `helpers.js` | ✅ | 🧪 |
| 10 | Cita a domicilio + dirección | `NewWizard`, `helpers.js` | ✅ | 🧪 |
| 11 | Total = servicios + domicilio | `helpers.js`, `Code.gs` | ✅ | 🧪 |
| 12 | Snapshot de precios al crear | `App.jsx` 2587 (nueva) y 2303–2305 (edición) | ✅ | 🧪 |
| 13 | **Nada se marca «solo»** — `completed` solo lo toca la operadora | `App.jsx` 1881, 1889 | ✅ | 🧪 |
| 14 | Editar solo pendientes | `App.jsx` 2172, 1974 | ✅ | 🧪 |
| 15 | Eliminar solo pendientes | `App.jsx` 479 | ✅ | 🧪 |
| 16 | Método de pago al completar | `PayModal`, `sanitizePayload` | ✅ | 🧪 |
| 17 | Marcar no asistió | `App.jsx`, `helpers.js` | ✅ | 🧪 |
| **CALENDAR** | | | | |
| 18 | Crear evento | `Code.gs` `createCalEvent` (761) | ✅ | 🧪 |
| 19 | Actualizar con verificación post-escritura | `Code.gs` `updateCalEvent` (792) | ✅ | 🧪 |
| 20 | Borrar idempotente | `Code.gs` `deleteCalEvent` (846) | ✅ | 🧪 |
| 21 | Fallo de borrado → reintento + ID | `App.jsx` 492–511 | ✅ | — |
| **CLIENTES** | | | | |
| 22 | Búsqueda por sufijo/subcadena | `helpers.js` `phoneMatch`, `App.jsx` 2829 | ✅ | 🧪 |
| 23 | Alta automática al agendar | `App.jsx` 2546 | ✅ | — |
| 24 | Historial de clienta | `ClientHistory` (3171) | ✅ | — |
| **SERVICIOS** | | | | |
| 25 | Catálogo con precio y duración | `ServicesTab` (2903) | ✅ | 🧪 |
| 26 | Historial de precios | `Code.gs` `trackPriceChanges` (1912) | ✅ | 🧪 |
| 27 | Semilla del historial | `Code.gs` `_seedPriceHistory` (457) | ✅ | 🧪 |
| 28 | No eliminar con citas futuras | `helpers.js` 487 + `Code.gs` 724 | ✅ | 🧪 |
| 29 | Nombres ambiguos no bloquean | `helpers.js` 487, `Code.gs` 724 | ✅ | 🧪 |
| 30 | Resolución de servicios por ID | `helpers.js` `apptServiceRefs` + `recoverSnapshotNames` | ✅ | 🧪 |
| **FINANZAS** | | | | |
| 31 | Recibido / pendiente / proyectado | `helpers.js` `reportMetrics` | ✅ | 🧪 |
| 32 | Balance neto | `helpers.js` `reportMetrics` | ✅ | 🧪 |
| 33 | No asistido **solo como número** | `helpers.js` `reportLines` | ✅ | 🧪 |
| 34 | Gastos agrupados si > 8 (**solo texto del reporte**) | `helpers.js` `groupExpensesByCategory` | ✅ | 🧪 |
| 35 | Total gastos **siempre** = todo el período | `helpers.js` | ✅ | 🧪 |
| 36 | Reparto Efectivo / Transferencia | `helpers.js` `periodLedger` (`totalCash` / `totalTransfer`) | ✅ | 🧪 |
| 37 | Comparación mes a mes | `MonthComparison` (3311) | ✅ | 🧪 |
| 38 | Top servicios (ingresos y demanda) | `helpers.js` `topServicesByDemand`, `TopServices` (3442) | ✅ | 🧪 |
| 38b | **Paginación en «Gastos del mes»** (>10) | `App.jsx` `Pager`, `FinancesTab` | ✅ | — |
| 38c | **Paginación en «Detalle Ingresos»** (7 días / 5 citas) | `App.jsx` `Pager` + `CirclePager`, `IncomeDetail` | ✅ | — |
| 38d | **Paginación en «Detalle Gastos»** (7 días / 5 gastos) | `App.jsx` `Pager` + `CirclePager`, `ExpenseDetail` | ✅ | — |
| 38e | **Desplegar una categoría** con sus gastos (clic = abrir / cerrar) | `App.jsx` `ExpenseDetail`, `openCat` + `catPage` | ✅ | — |
| 38f | **Círculos numerados** para las listas anidadas | `App.jsx` `CirclePager` | ✅ | — |
| 38g | **Orden** de las listas: reciente → antiguo (citas del día: hora ↑; **gastos del día: `cmpExpense`** — descripción A→Z, luego mayor monto) | `App.jsx` `meSorted`, `mvRows`, `dayEntries`, `catList`, `ma`, `cmpExpense` | ✅ | — |
| **REPORTES** | | | | |
| 39 | Períodos día / mes / rango / **año** | `helpers.js` `periodLedger` | ✅ | 🧪 |
| 40 | Excel con 3 hojas (app) | `App.jsx` `exportExcel` (3740), SheetJS | ✅ | — |
| 41 | Excel trae **todos** los gastos | `App.jsx` `exportExcel` | ✅ | 🧪 |
| 41b | **Paginación en «Movimientos del período»** (>10) | `App.jsx` `Pager`, `ReportTab` | ✅ | — |
| 41c | **Rango que llega al futuro** (revisar citas agendadas) | `App.jsx` `onFrom`/`onTo` (3627–3635) e `inPeriod` (3643–3650); backend `_inPeriod` (`Code.gs` 1135) | ✅ | 🧪 |
| 42 | WhatsApp al admin | `App.jsx` `sendWA`, `wa.me` | ✅ | — |
| 43 | Correo con adjunto `.xlsx` | `Code.gs` `_buildReportXlsx` (1375) | ✅ | 🧪 |
| 44 | Fallback sin adjunto | `Code.gs` `_sendReportEmail` (1623) | ✅ | 🧪 |
| 45 | Paridad WhatsApp ↔ correo | `backend.test.js` | ✅ | 🧪 |
| 46 | Reportes automáticos (4) | `Code.gs` 1801–1861 | ✅ | 🧪 |
| 47 | Triggers idempotentes | `setupAllReportTriggers` (1882) | ✅ | 🧪 |
| **SEGURIDAD** | | | | |
| 48 | Token en Script Properties (fail closed) | `Code.gs` 15, 244 | ✅ | 🧪 |
| 49 | Código de reset por correo | `Code.gs` 296 | ✅ | 🧪 |
| 50 | Hash + comparación en tiempo lineal | `Code.gs` 221, 233 | ✅ | 🧪 |
| 51 | Vigencia 15 min / grant 10 min | `Code.gs` 172–173 | ✅ | 🧪 |
| 52 | 5 intentos + bloqueo 30 min | `Code.gs` 174–175 | ✅ | 🧪 |
| 53 | 3 envíos por hora | `Code.gs` 176–177 | ✅ | 🧪 |
| 54 | Grant de un solo uso | `Code.gs` 273 | ✅ | 🧪 |
| 55 | Detección de operación destructiva | `Code.gs` 258 | ✅ | 🧪 |
| 56 | Recuperación si se pierde la respuesta | `App.jsx` 414–456 | ✅ | 🧪 |
| **OPERACIÓN** | | | | |
| 57 | `LockService` para concurrencia | `Code.gs` 59–60 | ✅ | 🧪 |
| 58 | Saneamiento de montos y duraciones | `Code.gs` `sanitizePayload` (2028) | ✅ | 🧪 |
| 59 | Respaldo diario a Drive (30 días) | `Code.gs` `createDailyBackup` (884) | ✅ | 🧪 |
| 60 | Respaldo semanal por correo | `Code.gs` `sendWeeklyBackupEmail` (986) | ✅ | 🧪 |
| 61 | Polling 30 s + pausa con pestaña oculta | `App.jsx` 358–370 | ✅ | — |
| 62 | Modo offline con `localStorage` | `App.jsx` 312–332 | ✅ | — |
| 63 | Escritura optimista (revisión en el próximo polling) | `App.jsx` 372–389 | ✅ | — |
| 64 | Tema y paletas persistentes | `GS` (829), `localStorage` | ✅ | — |
| 65 | Branding dinámico (`VITE_BIZ_*`) | `App.jsx` 193–196, 293–306 | ✅ | — |
| 66 | Telemetría / análisis externo | **No existe** | ✅ | ✅ |

---

### Resumen de cobertura de verificación

| Sello | Significado |
|---|---|
| ✅ 🧪 | Verificado en código **y** cubierto por pruebas automatizadas |
| ✅ | Verificado en código, sin test unitario (mayormente UI) |
| 🔎 | No verificado en producción (integraciones reales de Google y Vercel) |

> ⚠️ **Ninguna funcionalidad fue probada manualmente en producción durante
> esta ronda de documentación.** Las 317 pruebas corren en un **sandbox con
> mocks** de Apps Script (`node:vm`), no contra Google real. La integración
> con Sheets, Calendar, Gmail, Drive y Vercel queda marcada como 🔎.

---

> 📖 **Documentos relacionados**
>
> - [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) — instalación y configuración
> - [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) — guía para la operadora
> - [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md) — pruebas y diagnóstico
> - [`INDEX.md`](INDEX.md) — índice completo
