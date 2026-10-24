# 🏗️ Arquitectura y Funcionalidades — SZ

Informe técnico-funcional del sistema **tal como está implementado**. Cada regla
se cita con el **nombre real** de la función, componente o archivo que la
aplica.

> **Convención de sellos**
>
> - ✅ **Verificado en código** — se leyó la implementación en este repositorio.
> - 🧪 **Verificado en pruebas automatizadas** — existe un test que lo cubre
>   (354 pruebas, ejecutadas y en verde en esta ronda de documentación).
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
18. [Sistema de paletas y accesibilidad (AA)](#18-sistema-de-paletas-y-accesibilidad-aa)

---

## 1. Arquitectura general

```mermaid
flowchart TD
    subgraph Cliente["Navegador (celular o PC)"]
        UI["src/App.jsx — UI React (~5.570 líneas)"]
        HLP["src/helpers.js — lógica pura (~909 líneas)"]
        API["src/api.js — transporte HTTP"]
        LS[("localStorage<br/>sb_c · sb_s · sb_a · sb_e<br/>sz_palette · sz_hcats · sz_opening_balance")]
        UI --> HLP
        UI --> API
        UI <--> LS
    end

    subgraph Google["Cuenta de Google"]
        GAS["apps-script/Code.gs<br/>Web App (~2.235 líneas)"]
        SH[("Google Sheets — 6 hojas")]
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
| Carga inicial | `App.jsx` 395–428 | `loadData()` → si falla, lee `localStorage` y marca `error` |
| Polling | `App.jsx` 479–491 | Cada **30 s**, y al volver a la pestaña |
| Pausa con pestaña oculta | `App.jsx` 484–489 | `document.visibilitychange` |
| Evitar carreras | `App.jsx` 377, 396 | `savingRef`: si hay un guardado en curso, `refresh` **no** pisa el estado |
| Escritura optimista | `App.jsx` 493–522 | Escribe el estado local y `localStorage` **antes** de la respuesta |
| Si el servidor falla | `App.jsx` 517–520 | **No hay rollback inmediato**: deja el mensaje de error y devuelve `null` (los llamadores abortan). El estado real vuelve con el **próximo polling (≤30 s)** o al recargar |
| Telemetría | — | **No hay.** Cero `console.log`/`fetch` a terceros. ✅ |

---

## 3. Módulos y responsabilidades

| Archivo | Líneas | Responsabilidad | ¿Testeado? |
|---|---:|---|:---:|
| `src/main.jsx` | 10 | Punto de entrada de React (`StrictMode`) | — |
| `src/App.jsx` | 5.690 | **Toda la UI** + estado global + orquestación de guardado + sistema de 12 paletas | — (componentes no unit-testeados) |
| `src/helpers.js` | 909 | **Lógica pura**: fechas, slots, duraciones, estados, finanzas, reportes, servicio a domicilio, clasificación de citas | ✅ 171 tests |
| `src/api.js` | 131 | Transporte HTTP, mensajes de error, **tope de espera de 25 s** (`AbortController`) y **reintento automático de cargas** (1 reintento a los 4 s para fallos transitorios) | ✅ 12 tests |
| `apps-script/Code.gs` | 2.367 | Backend completo: API, seguridad, Sheets, Calendar (con `SB_CALENDAR_ID` y diagnóstico `pruebaCalendario`), reportes, respaldos | ✅ 157 tests (en sandbox `node:vm`) |
| `src/backend.test.js` | 3.539 | Ejecuta `Code.gs` **real** con mocks de Apps Script | — |
| `src/helpers.test.js` | 1.767 | Pruebas unitarias de `helpers.js` | — |
| `src/api.test.js` | 200 | Pruebas del transporte (incluidos el tope de espera y el reintento automático) | — |
| `src/excel.test.js` | 215 | Pruebas del libro Excel (`buildReportWorkbook`), de las 12 paletas y del contraste AA | — |

### 3.1 Componentes de `src/App.jsx`

| Componente | Línea | Responsabilidad |
|---|---:|---|
| `Modal` | 754 | Diálogo de confirmación genérico |
| `PayIcon` | 777 | Icono del método de pago: logo en `public/img/pagos/` (Nequi/Daviplata/Bancolombia), emoji (Efectivo sin icono, Transferencia 🏦) o `💳` de respaldo |
| `PayModal` | 785 | Selección de método de pago al completar |
| `NavIcon` | 806 | Iconos SVG de la navegación |
| `SyncBadge` | 877 | Indicador de sincronización |
| `Pager` | 930 | Paginación plana **‹ Ant. / Sig. ›** |
| `CirclePager` | 967 | Paginación anidada con el **número en un círculo** |
| `GS` | 1006 | **Bloque `<style>` global** (tema, modo oscuro, responsive) |
| `Dashboard` | 1623 | Panel principal; «Citas de Hoy» muestra ✓ (completada) o píldora «✗ No asistió» (`apptStatus`) |
| `MonthlyIncomeState` | 1862 | Estado de ingresos por mes |
| `MonthlyBalance` | 1920 | Balance mensual |
| `ApptsTab` | 1996 | Lista de citas en acordeones |
| `ApptDetail` | 2175 | Detalle de una cita |
| `ApptCard` | 2288 | Tarjeta de cita reutilizable |
| `EditAppt` | 2373 | Formulario de edición |
| `NewWizard` | 2674 | Asistente de nueva cita (4 pasos) |
| `ClientsTab` | 3016 | Clientas y búsqueda |
| `ServicesTab` | 3117 | Catálogo de servicios |
| `FinancesTab` | 3196 | Finanzas (tarjetas y secciones) |
| `ClientHistory` | 3385 | Historial de clienta |
| `MonthComparison` | 3538 | Comparación de meses |
| `TopServices` | 3669 | Top servicios |
| `ReportTab` | 3833 | Reportes y exportación |
| `IncomeDetail` | 4202 | Detalle de ingresos |
| `SettingsTab` | 4474 | Ajustes y restablecimiento |
| `ExpenseDetail` | 4812 | Detalle de gastos |
| `CalendarView` | 5040 | Vista de calendario |

> 📌 **Nota de diseño:** `App.jsx` concentra la UI en un archivo único
> **a propósito** (documentado en el `README.md`). La lógica reutilizable vive
> fuera, en `helpers.js`, precisamente para poder testearla.

---

## 4. Entidades y estructura de datos

### 4.1 Definición canónica en el backend

Están en `Code.gs` **líneas 17–53** (`SHEETS`, `JS_KEYS`, `HEADERS_ES`) y se
repiten en `helpers.js` (`DEFAULT_SERVICES`, `emptyState`). ✅
La hoja **Config** (clave/valor) no está en `JS_KEYS`: la definen
`CONFIG_OPENING_KEY` y `_readConfig` / `_writeConfig`. ✅

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
| `paymentMethod` | string | `Efectivo` / `Nequi` / `Daviplata` / `Bancolombia` (`PAYMENT_METHODS`) · heredado `Transferencia` (solo lectura) |

#### `expenses` → hoja **Gastos** (5 columnas)

`id` · `description` · `amount` · `category` · `date`

#### `priceHistory` → hoja **HistorialPrecios** (4 columnas)

`serviceId` · `serviceName` · `price` · `changedAt`

#### `config` → hoja **Config** (clave/valor, fuera de `JS_KEYS`)

| Clave | Valor | Actualizado |
|---|---|---|
| `opening_balance` | Saldo inicial ≥ 0 (número) | ISO 8601 del último cambio |

- `doGet` la devuelve como `data.config`; `doPost` la guarda con
  `{config: {openingBalance}}`. Se lee/escribe **solo la fila de la clave**
  (`_readConfig` / `_writeConfig`), así que **sí se puede editar a mano** en
  el Google Sheet: el frontend la relee en cada refresco (≤30 s) y sincroniza
  todos los dispositivos (localStorage solo queda como caché offline).
  `_resetData` **sí** la vacía (resetear es eliminar todo): solo queda la
  cabecera y el saldo inicial vuelve a 0. ✅

### 4.2 Reglas de snapshot

- **`serviceNames` es una foto histórica**: los nombres de servicios **no se
  actualizan** si luego cambias el catálogo (`NewWizard`, `App.jsx` 2787). ✅
- **`servicePrice` conserva el precio de cuando se creó la cita**, y el precio
  por servicio queda en `servicePrices` (`{id:precio}`, `App.jsx` 2788 al
  crear y 2504–2506 al editar). ✅
- Por eso **editar un servicio no reescribe las citas viejas**. 🧪

---

## 5. Operaciones de lectura y escritura

### 5.1 `readSheet(ss, key)` — `Code.gs` 2258

| Situación | Comportamiento |
|---|---|
| Hoja con menos de 2 filas | Devuelve `[]` |
| **Más columnas** de las esperadas | Ignora las extras y hace `console.warn` |
| **Menos columnas** | Los campos faltantes llegan como `''` y avisa |
| Filas **sin ID en la columna A** | Se descartan |
| Celdas | Todas se leen como texto; `cellStr` (1993) normaliza fechas y horas |

### 5.2 `writeSheet(ss, key, arr)` — `Code.gs` 2278

```
sh.clearContents()  →  setNumberFormat('@')  →  setValues([[HEADERS_ES[key]], …filas])
```

⚠️ **Reescribe la hoja completa en cada guardado.** Consecuencias:

- Ediciones manuales en la hoja **se pierden**.
- Las columnas fuera del esquema **se eliminan**.
- **No** hay `autoResizeColumn` aquí (el ancho de columnas solo se ajusta en
  el Excel que genera `_buildReportXlsx`).

### 5.3 `sanitizePayload(b)` — `Code.gs` 2323

Aplica a cada campo numérico una **clausura de saneamiento**
(`sanitizeNumberField` / `sanitizeDurationField`, líneas 2018–2026):

- Monto negativo o `NaN` → **`0`** (`clip0`, línea 2013; defensa en
  profundidad; la UI ya lo impide con `Math.max`)
- `duration`: se recorta al rango **15–480** (`safeDuration`); vacío → `60`
- `paymentMethod`: no se sanea aquí; el valor se normaliza al **leer** —
  `payMethodOf` (`helpers.js`) devuelve `''` si no está en `PAYMENT_METHODS`,
  y en el backend `_isPayMethod` → `'Sin registrar'`
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

### 5.4 `trackPriceChanges(oldSvcs, newSvcs)` — `Code.gs` 2138

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
| Duración válida | 15–480 min | **Solo el backend la recorta**: `safeDuration` (`Code.gs` 858). El frontend, `svcDuration` (`helpers.js` 106), no recorta: si falta o es ≤ 0 devuelve 60, y la UI solo ofrece 30/60/90/120/150/180 (`DURATION_OPTIONS`, `App.jsx` 301) | ✅ 🧪 |
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
1996):

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
| ✓ **Completar** (elige Efectivo / Nequi / Daviplata / Bancolombia) | `App.jsx` 2067, 2084 |
| ✗ **No asistió** | `App.jsx` 2067 |
| Crear cita → `completed: false` | `NewWizard`, `App.jsx` 2792 |

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
  `App.jsx` 2507–2513). ✅ 🧪
- Los precios **negativos** se rechazan en la UI (`setPErr`, `App.jsx` 3120,
  3150) **y** los sanea el backend. ✅ 🧪

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
> cita: `NewWizard` (`App.jsx` 2768). **`EditAppt` NO lo llama** — allí la
> hora se revalida con `getSlots` (`App.jsx` 2457), que marca cada bloque
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

Lo usan `EditAppt` (`App.jsx` 2457) y `NewWizard` (`App.jsx` 2759) para
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

**Implementación:** `EditAppt` (`App.jsx` 2373), `ApptDetail` (2175–2286) y
`deleteAppt` (625). 🧪 (cubierto en `helpers.test.js` y `backend.test.js`)

### 8.2 Flujo de «Completar»

```
«✓ Completar» → PayModal (Efectivo / Nequi / Daviplata / Bancolombia)
   → { completed:'true', paymentMethod }
   → saveData({ appointments })
```

`paymentMethod` se normaliza al leer contra `PAYMENT_METHODS` +
`LEGACY_PAYMENT_METHODS` (`_isPayMethod`, `Code.gs`; `payMethodOf`,
`helpers.js`): un valor desconocido no cuenta como método, y
`Transferencia` (heredado, retirado de la UI) sigue siendo válido para
leer. ✅ 🧪 (paridad: `PAYMENT_METHODS` ≡ `PAY_METHODS`)

### 8.3 Flujo de «No asistió»

```
«✗ No asistió» → confirm → { completed:'noshow' }
```

En los reportes, **«No asistió» aparece solo como número**, nunca como monto
(`reportLines`, `helpers.js` 702–755). ✅ 🧪 (prueba de paridad)

### 8.4 Eliminar una cita — `deleteAppt` (`App.jsx` 625–657)

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
**restaura la lista local** (`if (r === null) SS(safe)`, `App.jsx` 3133–3136)
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
> sin el otro, los 354 tests se caen.

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

- **Borrado:** avisar + reintento + mostrar el ID (`App.jsx` 644–656).
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
| Búsqueda | `phoneMatch` (`helpers.js` 50) + `ClientsTab` (`App.jsx` 3016) | **Sufijo** del celular primero, luego **subcadena** del nombre |
| Alta al agendar | `NewWizard` (`App.jsx` 2746) | Si el nombre no existe → se crea con `uid()` |
| Historial | `ClientHistory` (3385) | Citas, montos, última visita |
| Reutilización | — | ⚠️ Si **2 clientas** comparten celular, **no** se fusionan |

### 11.2 Servicios

| Función | Implementación |
|---|---|
| Crear | `ServicesTab.add` (`App.jsx` 3122): `{id:uid(), name, price, duration}` con `price ≥ 0` |
| Editar | `ServicesTab` (3176): recalcula `price` con `Math.max(0, …)` |
| Duración | Selector de 60 min por defecto; opciones 30/60/90/120/150/180 (`App.jsx` 301) |
| Eliminar | `tryDelete` (3127) → `serviceDeletionCheck` → confirm → `SS(next)` |
| Historial de precios | `trackPriceChanges` (`Code.gs` 2138) en el servidor |

### 11.3 Catálogo por defecto

`DEFAULT_SERVICES` (`App.jsx` 297) **no está escrito en el código**: se
resuelve en tiempo de compilación con `resolveCatalog()` (`src/catalogs.js`),
que aplica este orden:

1. **`VITE_DEFAULT_SERVICES`** → JSON con los servicios exactos del cliente.
   Tiene prioridad absoluta.
2. **`VITE_CATALOG`** → una de las **8 categorías** disponibles:
   `cejas` (9 servicios, la lista histórica), `unas` (11), `peluqueria` (10),
   `barberia` (10), `depilacion` (10), `masajes` (9), `estetica` (9) y
   `maquillaje` (9).
3. Clave desconocida, JSON roto o nada → `DEFAULT_CATALOG_KEY = 'cejas'`.

La resolución **nunca lanza**: una variable mal escrita no puede impedir el
arranque. La lista resultante se usa en el **primer arranque**
(`App.jsx` 325 y 334) y al **restablecer** (434, 439 y 449); en cuanto hay
datos, el catálogo real es el de Google Sheets. Detalle y paso a paso en
[`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) → **C.1.1**.

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
> `max={today}` y el de **Mes** `max={monthStr()}` (`App.jsx` 4035, 4037),
> pero el de **Desde/Hasta** solo se limita entre sí (`max={to}` /
> `min={from}`, 4045–4046): sirve para revisar citas ya agendadas con
> antelación. Ningún predicado compara contra hoy — ni `inPeriod`
> (`App.jsx` 3870–3877) ni `_inPeriod` (`Code.gs` 1319): solo hacen
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
`DETALLE_MAX`/`MAX_EXP` en `Code.gs` 1665/1670. ✅ 🧪

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
> compartida** y el `useEffect` de `App.jsx` 4827 la devuelve a **1**
> **cada vez que cambia `openCat` o `month`** — abrir otra categoría, o
> cerrar y volver a abrir, **arranca siempre en la página 1**. Los
> **totales no cambian** al abrir o cerrar. ✅
>
> Al **abrir** una categoría la vista **baja sola** hasta su **título**
> (`catTitleRef` + `useEffect` sobre `openCat`, `App.jsx` 4836–4887): la
> lista nace debajo de «Por categoría» y, con la página arriba, quedaba
> fuera de pantalla. El destino se calcula con la posición del título en
> el documento **menos el alto de la barra sticky completa (header +
> pestañas)**, más 10 px de aire, para que el título quede **exactamente**
> visible justo debajo de la barra (descontar solo el `<header>` dejaba
> el título tapado por las pestañas: parecía que el scroll pasaba de
> largo). Si la operadora no toca la vista, dos pases de re-alineación
> en seco (750 ms y 1600 ms) corrigen cualquier reacomodo del navegador
> (barra móvil que se pliega, fuentes que reflowean); un toque, rueda o
> tecla suya los cancela. El efecto salta si `openCat` es `null` →
> **cerrar no mueve la vista** (cambiar de mes tampoco: el efecto
> depende solo de `openCat`). 📌
>
> La lista de días se separa de la de categorías con su propio título,
> **«📅 Gastos por día»** (`App.jsx` 4991), para que no quede pegada a
> la tarjeta desplegada. ✅

### 12.4 Reparto por método de pago

No hay una función aparte: lo calcula **`periodLedger`** (`helpers.js`) sobre
sus `incomes`, con un `sumBy` local por método:

| Campo | Cómo sale |
|---|---|
| `byMethod` | objeto con los **4 actuales** + el heredado `Transferencia` (`READABLE_PAYMENT_METHODS`), siempre presente aunque sea `$0` |
| `totalCash` | `byMethod.Efectivo` (compatibilidad con lecturas previas) |
| `totalTransfer` | **total de transferencias** = Nequi + Daviplata + Bancolombia + las heredadas en `Transferencia` |
| `totalKnown` | suma de `byMethod` |
| `totalNoMethod` | `totalIncome − totalKnown` — citas completadas **antes** de que existiera el método (o con método vacío) |

En el reporte se pintan **los 4 métodos siempre** (`- Efectivo: $…` …
`- Bancolombia: $…`), luego el renglón heredado **solo si `> 0`**
(`- · Transferencia (dato anterior): $…`) y después el total
**`- Transferencias: $…`**; más «Sin método» si `totalNoMethod > 0`
(`reportLines`); en el Excel, `SUMIF` sobre la columna `Movimientos!J`
(fila por método) y `=B+B+B+B` para **TRANSFERENCIAS (total)**. 🧪

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
| `PAST_APPT_PAGE_SIZE` | 20 | Grupo **PASADAS** de la pestaña Citas (solo ese grupo) |

#### 12.5.1 Familia PLANA — `Pager` (‹ Ant. / Sig. ›)

| Lista | Componente | Se reinicia al… |
|---|---|---|
| **📋 Gastos del mes** | `FinancesTab` | cambiar de **mes** |
| **🧾 Movimientos del período** | `ReportTab` | cambiar de **período** (`mode`, `day`, `month`, `year`, `from`, `to`) o de **filtro** (`mvFilter`) |
| **💚 Detalle Ingresos** — lista de **días** | `IncomeDetail` | cambiar de **mes** o de **filtro** (`filter`: Todo / Recibido / Pendiente / No asistió) |
| **📤 Detalle Gastos** — lista de **días** | `ExpenseDetail` | cambiar de **mes** |
| **🗓️ Todas las citas** (historial de cliente) | `ClientHistory` | cambiar de **cliente** — el componente se desmonta y `apptPage` vuelve a 1 (no hace falta `useEffect`, `App.jsx` 3388–3392) |

**Reglas del control `Pager`:**

| Regla | Implementación |
|---|---|
| **No aparece** si la lista cabe entera (`total <= size`) | `if (total <= sz) return null` |
| Muestra el rango y la posición: `1–7 de 20 días · pág. 1 de 3` | `first`/`last` calculados sobre el total, **no** sobre la página |
| El rango se **recorta siempre** dentro de `[1, pages]` | `Math.min(Math.max(1,page),pages)` — una lista que encoge nunca deja la vista vacía |
| **‹ Ant.** deshabilitado en la primera página, **Sig. ›** en la última | `disabled` + opacidad 0,4 |
| El estado lo lleva el **padre**, no el propio `Pager` | `expPage` (3206) / `apptPage` (3392) / `mvPage` (3866) / `incPage` (4210) / `dayPage` (4819) + `useEffect` de reinicio |
| Acepta tamaño propio con `size` | `size={DAY_PAGE_SIZE}` (7) o `size={CLIENT_APPT_PAGE_SIZE}` (5) — sin `size` sigue en 10 |

#### 12.5.2 Familia ANIDADA — `CirclePager` (número dentro de un círculo)

> ℹ️ **Ojo, no hay que confundirlos:** en «Detalle Gastos» e «Detalle
> Ingresos» **los DÍA van con el `Pager` plano** de §12.5.1
> (`App.jsx` 4320 en Ingresos y 5031 en Gastos). El `CirclePager` se usa **solo** para lo que hay
> *dentro* de una tarjeta, donde un segundo `‹ Ant. / Sig. ›` seguido del
> primero se lee mal:

| Lista | Lo que pagina dentro | Tamaño | `App.jsx` |
|---|---|---:|---:|
| **💚 Detalle Ingresos** | citas de **un día** | `ITEM_PAGE_SIZE` = 5 | 4310 |
| **📤 Detalle Gastos** | gastos de **un día** | `ITEM_PAGE_SIZE` = 5 | 5025 |
| **📤 Detalle Gastos** | **categoría desplegada** | `CATEGORY_PAGE_SIZE` = 10 | 4982 |

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
| **Gastos del mes** (Finanzas) | fecha descendente + `cmpExpense` | `meSorted`, `App.jsx` 3234 |
| **Movimientos del período** (pantalla) | fecha descendente | `mvRows`, `App.jsx` 3946–3947 |
| **Días** en Detalle Gastos / Ingresos | fecha descendente | `dayEntries`, 4901 / 4244 |
| **Gastos de una categoría** desplegada | fecha descendente + `cmpExpense` | `catList`, 4910–4911 |
| **Todas las citas** (historial de cliente) | fecha descendente | `cAppts`, 3396 |
| **Citas de un día** (Detalle Ingresos) | **hora ascendente** | `ma`, 4225–4227 |
| **Gastos de un día** (Detalle Gastos) | **descripción A→Z** y, si empatan, **mayor monto** | `me` (4890) → `byDay`; criterio en `cmpExpense` |

#### 12.6.1 El desempate de gastos — `cmpExpense` (`App.jsx` 5566–5569)

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
`me` (4890, de donde salen los grupos `byDay`), `catList` (4910) y
`meSorted` (3234).

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

`exportExcel()` en `ReportTab` (`App.jsx` 3967):

- Usa la librería **`xlsx` 0.18.5** (dependencia de producción).
- Genera **3 hojas**: **Resumen · Citas · Gastos**.
- **Trae todos los gastos, línea por línea** (no agrupados).
- Descarga como `.xlsx`.

### 13.2 Reporte por WhatsApp (frontend)

- `sendWA` construye el texto con `reportLines` y abre **`wa.me`** con el
  número del admin (`VITE_ADMIN_WHATSAPP`).
- Si no hay número configurado, **el botón sale deshabilitado** (`App.jsx`
  272, 4175–4190). ✅

### 13.3 Reportes y respaldos automáticos (los 6 disparadores)

La app instala **6 disparadores** («Activadores» en el editor de Apps
Script), todos ejecutados **como la cuenta del proyecto** y con la zona
horaria de `appsscript.json` (`America/Bogota`):

| Disparador | Cuándo dispara | Qué hace | A quién llega | Variable que lo controla | Quién lo instala |
|---|---|---|---|---|---|
| `sendDailyReportEmail` (2027) | Todos los días, 12:00 | Reporte de **hoy** + `.xlsx` | **La usuaria** | `SB_REPORT_EMAIL` → si falta, `SB_AUTHORIZED_EMAIL` | `setupAllReportTriggers()` (2108) |
| `sendWeeklyReportEmail` (2041) | Domingos, 12:00 | Lun–Dom de la semana en curso | **La usuaria** | igual | `setupAllReportTriggers()` |
| `sendMonthlyReportEmail` (2062) | Dispara a diario 12:00; **envía solo el último día del mes** | Mes en curso | **La usuaria** | igual | `setupAllReportTriggers()` |
| `sendYearlyReportEmail` (2087) | Dispara a diario 12:00; **envía solo el 31 de diciembre** | 1 ene – 31 dic | **La usuaria** | igual | `setupAllReportTriggers()` |
| `createDailyBackup` (1067) | Todos los días, 23:00 | Copia la hoja a Drive (`BACKUP-PROYECTO/Backups/<hoja>/`), retención 30 días | **Nadie por correo**: la copia vive en Drive | — | `setupDailyBackupTrigger()` (1124) |
| `sendWeeklyBackupEmail` (1169) | Sábados, 9:00 | Adjunta el respaldo **más reciente** en `.xlsx` | **El dueño del proyecto** | `SB_BACKUP_EMAIL` → si falta, `SB_AUTHORIZED_EMAIL` | `setupWeeklyEmailTrigger()` (1246) |

Los 4 de reporte van a la usuaria; el respaldo semanal va al dueño. Los
códigos de restablecimiento **no** usan triggers: se piden desde la app.

> 📌 **Por qué dos disparan a diario:** Apps Script **no tiene** trigger de
> «último día del mes/año». Por eso la función misma decide no enviar. Ver
> `SKIP …` en los registros es **normal**.

> 🔁 Cada `setup*` **borra antes los suyos** y vuelve a crearlos: ejecutarlos
> repetido no duplica disparadores. En el panel debería haber **exactamente 6**.

### 13.4 El adjunto `.xlsx` generado por Apps Script

`_buildReportXlsx` (`Code.gs` 1576) — **no usa SheetJS**:

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
> Esto incluye los **cuatro renglones de método de pago** (`PAYMENT_METHODS`
> ≡ `PAY_METHODS`, mismo orden, siempre visibles), el heredado
> «· Transferencia (dato anterior)» (solo si `> 0`), el total
> «Transferencias» y el de «Sin método».
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

> 📦 **Respaldo previo (solo UI):** la pantalla de advertencia del reset
> ofrece **«📥 Descargar Excel de respaldo»** (`exportBackupXlsx` →
> `buildReportWorkbook`, `App.jsx`) — el **mismo informe** que los reportes
> (Resumen / Movimientos / Citas) pero con el **histórico completo**, más la
> hoja **Clientes**, con fecha `respaldo_YYYY-MM-DD.xlsx`. Es una red de
> seguridad del cliente, **no** cambia el flujo de autorización (el código
> por correo sigue intacto).

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

`resetAll` (`App.jsx` 554–602) contempla que el reset **se ejecutó pero la
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

Textos **literales** de `httpError()` (15–25) y de `call()` (44–69) — son los
que ve la operadora:

| Caso | Línea | Mensaje exacto |
|---|---:|---|
| 404 con `/macros/u/\d+/` | 17–18 | `HTTP 404: Google reescribió la dirección con /u/N/. ` + `MULTI_ACCOUNT_HINT` |
| 404 normal | 19 | `HTTP 404: Apps Script no encontró el Web App. Comprueba que la URL termine en /exec y publica de nuevo la última versión (Implementar → Administrar implementaciones).` |
| 401 / 403 | 21 | `HTTP 403: Google no autorizó la conexión. ` + `MULTI_ACCOUNT_HINT` |
| 429 | 22 | `HTTP 429: Google está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.` |
| 5xx | 23 | `HTTP 500: Apps Script falló del lado de Google. Reintenta en unos minutos.` |
| Red / `fetch` rechazado | 56–59 | `Sin respuesta de Apps Script (<motivo>). Revisa tu conexión a internet. ` + `MULTI_ACCOUNT_HINT` |
| **Tope de 25 s (`AbortError`)** | 38–42, 55 | `Apps Script no respondió en 25 s y se canceló la petición (límite de espera). Suele ser un arranque en frío o el límite de peticiones de Google…` |
| **Reintento automático de cargas** (`callWithRetry`, solo `loadData`) | 76–91 | Un fallo **transitorio** (tope de 25 s o cualquier HTTP 4xx/5xx) se reintenta **una vez** a los 4 s antes de declarar el error: el arranque en frío de la mañana o un 404 puntual al actualizarse el despliegue ya no muestran el banner. Los errores del **servidor** (JSON `ok:false`) no se reintentan, y los **guardados** siguen siendo manuales con la franja roja «Reintentar guardar». |
| Respuesta no-JSON | 66 | `Apps Script devolvió algo que no es JSON: publica de nuevo la última versión del Web App.` |
| **HTTP 200 con `{ok:false}`** | 67 | El **`json.error` del servidor**; si no lo hay, el `fallback` del llamador (`'Error guardando'`, `'Error cargando datos'`, …) |
| `VITE_SCRIPT_URL` sin definir | 72, 77 | `VITE_SCRIPT_URL no configurado` |

> 📌 `MULTI_ACCOUNT_HINT` (11) se aparca en varios de ellos: es el aviso de
> «Hay varias cuentas de Google abiertas en este navegador… entra en una
> ventana de incógnito». **Nunca se sustituye el `json.error` del servidor**:
> solo se «dora» el error de red/HTTP de abajo (comentario de `api.js` 4–10).

> 🚨 **Ojo con el 403:** `httpError` no puede distinguir un token malo de un
> permiso de Google, así que el texto habla de Google. El rechazo real de
> token llega **por JSON** con `«No autorizado»` (`_checkToken`, `Code.gs`
> 244–252), en una respuesta HTTP 200.

### 15.2 Modo offline

1. Si `loadData()` falla (tras su **reintento automático** de §15.1) →
   `setSt('error')` (420) y se leen las cuatro claves de `localStorage`
   (`App.jsx` 422–425): `sb_c`, `sb_s`, `sb_a`, `sb_e`.
2. En la parte superior aparece **`⚠️ Modo sin conexión — <mensaje>`** con un
   botón **✕ para cerrarlo** (`errHidden`, `App.jsx`). Cerrado, **no reaparece**
   en los fallos siguientes del ciclo de 30 s (el `SyncBadge` del header sigue
   informando en silencio) y **se rearma solo** cuando una carga vuelve a tener
   éxito (`useEffect` que resetea `errHidden` al salir de `error`).
3. **Los guardados no se reintentan solos**, pero el fallo **sí tiene aviso y
   reintento manual**: si `sync` falla, aparece la franja roja
   **«⚠️ No se pudo guardar»** con botón **«↻ Reintentar guardar»**
   (`saveFailed`/`failedSaveRef`, `App.jsx`), que reenvía `failedSaveRef.current`
   **sin** re-aplicar cambios optimistas. Mientras ese aviso esté activo,
   `refresh()` **no** reemplaza el estado local (no pisa la mutación pendiente)
   ni `setOpeningBalance`. El cambio queda también en `localStorage`; si no se
   reintenta, se recupera solo cuando un `refresh` posterior o una recarga
   vuelven a traer la hoja.
   - **Excepción: Calendar.** Ahí sí hay reintento **manual** —
     `retryCalendar` (`App.jsx` 2537) con su botón (2656–2657), para el
     caso de «se guardó la cita pero no el evento».
4. Mientras hay `savingRef` en vuelo, `refresh` **no corre** (396) para no
   pisar la escritura.

### 15.3 Escritura optimista (sin reversión inmediata)

`sync` (`App.jsx` 493–522), del que cuelgan `SC` / `SS` / `SA` / `SE`
(líneas 524–527):

```
setState(nuevo) + localStorage  →  saveData()
   → ok     → marca 'ok' y programa un refresh en 1,5 s
   → fallo  → marca 'error' 5 s y devuelve null  (NO revierte)
```

Los llamadores **abortan** al recibir `null` — `deleteAppt` no toca Calendar,
`EditAppt` no actualiza el evento, etc. — pero **la pantalla conserva el
cambio hasta el próximo `refresh`**, que ocurre como máximo **30 s
después** (o al recargar la pestaña). Mientras tanto, la **franja roja con
«↻ Reintentar guardar»** (§15.2) deja claro que el cambio **no** está en el
servidor y permite reenviarlo a mano. 🧪

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
| Montos negativos | Saneados a `0` en el servidor (`clip0`, `Code.gs` 2039) |
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
| 4 | **No hay transaccionalidad Sheets ↔ Calendar**: posible evento huérfano | `deleteAppt`, `App.jsx` 625–657 |
| 5 | **El reloj de la app** (agrupar por pasado/hoy, marcar horas vencidas) solo corre si el navegador está abierto | `apptGroup` / `apptLife`, `helpers.js` 231, 453 |
| 6 | **`writeSheet` borra ediciones manuales** de la hoja | `Code.gs` 2278 |
| 7 | ~~Destinatario de reportes hardcodeado~~ → **CORREGIDO**: los tres envíos leen propiedades de script (`_authorizedEmail()` / `SB_AUTHORIZED_EMAIL` **lista**, `_reportEmail()` / `SB_REPORT_EMAIL`, `_backupEmail()` / `SB_BACKUP_EMAIL`) | `Code.gs`, sección «Configuración» |
| 8 | **El guardado fallido no revierte la pantalla** de inmediato: espera al próximo polling (≤30 s). **Mitigado** con la franja roja + «↻ Reintentar guardar» y con `refresh()` protegido mientras el aviso esté activo | `sync`, `App.jsx` 517–520, 397–401 |
| 9 | **Eventos de Calendar no se respaldan** | — |
| 10 | **Dos clientas con el mismo celular no se fusionan** | — |
| 11 | **Lógica duplicada** frontend ↔ backend (revelada por las pruebas de paridad) | `helpers.js` / `Code.gs` |
| 12 | **Los `VITE_*` requieren rebuild** — no cambian en caliente | Vite |
| 13 | **`App.jsx` es monolítico** (~5.570 líneas) — decisión deliberada, documentada | `App.jsx` |
| 14 | ~~`VITE_BIZ_SUBTITLE` no llegaba al `<title>` de la pestaña~~ → **CORREGIDO**: había **dos** `useEffect` de branding y el segundo (`App.jsx` 462–471, deps `[]`) pisaba al primero (360–373). React ejecuta los efectos en orden de declaración, así que ganaba el segundo y se perdía el subtítulo — **solo en la pestaña**, porque en el encabezado (683) sí se veía, y por eso el fallo pasaba inadvertido. Ahora **solo existe el de 360–373**, único escritor del `document.title` (361, formato `NOMBRE · SUBTITULO`), del favicon (364–366) y del `apple-touch-icon` (369–371); el hueco donde estaba el segundo lleva un comentario que prohíbe reañadirlo. | `App.jsx` 360–373 |

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
| 12 | Snapshot de precios al crear | `App.jsx` 2788 (nueva) y 2504–2506 (edición) | ✅ | 🧪 |
| 13 | **Nada se marca «solo»** — `completed` solo lo toca la operadora | `App.jsx` 2067, 2084 | ✅ | 🧪 |
| 14 | Editar solo pendientes | `App.jsx` 2373, 2175 | ✅ | 🧪 |
| 15 | Eliminar solo pendientes | `App.jsx` 625 | ✅ | 🧪 |
| 16 | Método de pago al completar | `PayModal`, `sanitizePayload` | ✅ | 🧪 |
| 17 | Marcar no asistió | `App.jsx`, `helpers.js` | ✅ | 🧪 |
| **CALENDAR** | | | | |
| 18 | Crear evento | `Code.gs` `createCalEvent` (761) | ✅ | 🧪 |
| 19 | Actualizar con verificación post-escritura | `Code.gs` `updateCalEvent` (792) | ✅ | 🧪 |
| 20 | Borrar idempotente | `Code.gs` `deleteCalEvent` (846) | ✅ | 🧪 |
| 21 | Fallo de borrado → reintento + ID | `App.jsx` 638–657 | ✅ | — |
| **CLIENTES** | | | | |
| 22 | Búsqueda por sufijo/subcadena | `helpers.js` `phoneMatch`, `App.jsx` 3016 | ✅ | 🧪 |
| 23 | Alta automática al agendar | `App.jsx` 2746 | ✅ | — |
| 24 | Historial de clienta | `ClientHistory` (3385) | ✅ | — |
| **SERVICIOS** | | | | |
| 25 | Catálogo con precio y duración | `ServicesTab` (3117) | ✅ | 🧪 |
| 26 | Historial de precios | `Code.gs` `trackPriceChanges` (1912) | ✅ | 🧪 |
| 27 | Semilla del historial | `Code.gs` `_seedPriceHistory` (457) | ✅ | 🧪 |
| 28 | No eliminar con citas futuras | `helpers.js` 487 + `Code.gs` 724 | ✅ | 🧪 |
| 29 | Nombres ambiguos no bloquean | `helpers.js` 487, `Code.gs` 724 | ✅ | 🧪 |
| 30 | Resolución de servicios por ID | `helpers.js` `apptServiceRefs` + `recoverSnapshotNames` | ✅ | 🧪 |
| **FINANZAS** | | | | |
| 31 | Recibido / pendiente / proyectado | `helpers.js` `reportMetrics` | ✅ | 🧪 |
| 32 | Balance neto | `helpers.js` `reportMetrics` | ✅ | 🧪 |
| 32b | **Saldo inicial** (vista General del Panel, **aparte y a la derecha** del Balance Neto, nunca mezclado; ≥ 0; persistido en la hoja **Config** de Google Sheets —sincronizado entre dispositivos, editable a mano en la hoja y **se vacía con el reset**—, con aviso verde «guardado y sincronizado» al guardarlo; `sz_opening_balance` es solo caché local) | `App.jsx` `openingBalance` · `Code.gs` `_readConfig`/`_writeConfig` | ✅ | — |
| 32c | **Aviso de inasistencias por clienta** (historial: «Faltó X de sus últimas Y citas»; wizard: recuadro rojo con 2+ faltas) | `helpers.js` `clientNoShowStats`, `NOSHOW_WINDOW = 7` | ✅ | 🧪 |
| 33 | No asistido **solo como número** | `helpers.js` `reportLines` | ✅ | 🧪 |
| 34 | Gastos agrupados si > 8 (**solo texto del reporte**) | `helpers.js` `groupExpensesByCategory` | ✅ | 🧪 |
| 35 | Total gastos **siempre** = todo el período | `helpers.js` | ✅ | 🧪 |
| 36 | Reparto por método de pago (4 actuales + heredada + total Transferencias) | `helpers.js` `periodLedger` (`byMethod`, `totalTransfer`) | ✅ | 🧪 |
| 37 | Comparación mes a mes | `MonthComparison` (3538) | ✅ | 🧪 |
| 38 | Top servicios (ingresos y demanda) | `helpers.js` `topServicesByDemand`, `TopServices` (3669) | ✅ | 🧪 |
| 38b | **Paginación en «Gastos del mes»** (>10) | `App.jsx` `Pager`, `FinancesTab` | ✅ | — |
| 38c | **Paginación en «Detalle Ingresos»** (7 días / 5 citas) | `App.jsx` `Pager` + `CirclePager`, `IncomeDetail` | ✅ | — |
| 38d | **Paginación en «Detalle Gastos»** (7 días / 5 gastos) | `App.jsx` `Pager` + `CirclePager`, `ExpenseDetail` | ✅ | — |
| 38e | **Desplegar una categoría** con sus gastos (clic = abrir / cerrar) | `App.jsx` `ExpenseDetail`, `openCat` + `catPage` | ✅ | — |
| 38f | **Círculos numerados** para las listas anidadas | `App.jsx` `CirclePager` | ✅ | — |
| 38g | **Orden** de las listas: reciente → antiguo (citas del día: hora ↑; **gastos del día: `cmpExpense`** — descripción A→Z, luego mayor monto) | `App.jsx` `meSorted`, `mvRows`, `dayEntries`, `catList`, `ma`, `cmpExpense` | ✅ | — |
| 38h | **Paginación en «Pasadas»** (20 por página) | `App.jsx` `PAST_APPT_PAGE_SIZE`, `pastPage`, `AccGroup` | ✅ | — |
| 38i | **Bajada automática al abrir una categoría** (al tocarla, la vista baja sola hasta el **título** de la lista desplegada, exactamente debajo de la barra sticky completa —header + pestañas—; cerrar o cambiar de mes **no** la mueve) | `App.jsx` `ExpenseDetail`, `catTitleRef` + `useEffect` de `openCat` | ✅ | — |
| 38j | **Título «📅 Gastos por día»** sobre la lista de días del detalle de gastos (separa esa sección de la tarjeta de categoría) | `App.jsx` `ExpenseDetail` | ✅ | — |
| **REPORTES** | | | | |
| 39 | Períodos día / mes / rango / **año** | `helpers.js` `periodLedger` | ✅ | 🧪 |
| 40 | Excel con 3 hojas (app) | `App.jsx` `exportExcel` (3967), SheetJS | ✅ | — |
| 41 | Excel trae **todos** los gastos | `App.jsx` `exportExcel` | ✅ | 🧪 |
| 41b | **Paginación en «Movimientos del período»** (>10) | `App.jsx` `Pager`, `ReportTab` | ✅ | — |
| 41c | **Rango que llega al futuro** (revisar citas agendadas) | `App.jsx` `onFrom`/`onTo` (3854–3862) e `inPeriod` (3870–3877); backend `_inPeriod` (`Code.gs` 1319) | ✅ | 🧪 |
| 42 | WhatsApp al admin | `App.jsx` `sendWA`, `wa.me` | ✅ | — |
| 43 | Correo con adjunto `.xlsx` | `Code.gs` `_buildReportXlsx` (1375) | ✅ | 🧪 |
| 44 | Fallback sin adjunto | `Code.gs` `_sendReportEmail` (1623) | ✅ | 🧪 |
| 45 | Paridad WhatsApp ↔ correo | `backend.test.js` | ✅ | 🧪 |
| 46 | Reportes automáticos (4) y respaldos (2) | `Code.gs` 2027–2100 y 1067/1169 | ✅ | 🧪 |
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
| 56 | Recuperación si se pierde la respuesta | `App.jsx` 554–602 | ✅ | 🧪 |
| **OPERACIÓN** | | | | |
| 57 | `LockService` para concurrencia | `Code.gs` 59–60 | ✅ | 🧪 |
| 58 | Saneamiento de montos y duraciones | `Code.gs` `sanitizePayload` (2028) | ✅ | 🧪 |
| 59 | Respaldo diario a Drive (30 días) | `Code.gs` `createDailyBackup` (884) | ✅ | 🧪 |
| 60 | Respaldo semanal por correo | `Code.gs` `sendWeeklyBackupEmail` (986) | ✅ | 🧪 |
| 61 | Polling 30 s + pausa con pestaña oculta | `App.jsx` 479–491 | ✅ | — |
| 62 | Modo offline con `localStorage` | `App.jsx` 395–428 | ✅ | — |
| 63 | Escritura optimista (revisión en el próximo polling) | `App.jsx` 493–522 | ✅ | — |
| 63b | **Franja roja de guardado fallido + «↻ Reintentar»** (`refresh()` protegido mientras `saveFailed`) | `App.jsx` `saveFailed`, `failedSaveRef`, `retrySave` | ✅ | — |
| 63c | **Excel de respaldo antes del reset** = informe completo (Resumen / Movimientos / Citas, histórico entero) + hoja Clientes, `respaldo_YYYY-MM-DD.xlsx` | `App.jsx` `exportBackupXlsx` · `buildReportWorkbook` | ✅ | — |
| 64 | Tema y paletas persistentes (12 paletas AA, ver §18) | `PALETTES`/`applyTheme` (`App.jsx`), `localStorage` | ✅ | 🧪 |
| 65 | Branding dinámico (`VITE_BIZ_*`) | `App.jsx` 259–262, 360–373 | ✅ | — |
| 66 | Telemetría / análisis externo | **No existe** | ✅ | ✅ |

---

### Resumen de cobertura de verificación

| Sello | Significado |
|---|---|
| ✅ 🧪 | Verificado en código **y** cubierto por pruebas automatizadas |
| ✅ | Verificado en código, sin test unitario (mayormente UI) |
| 🔎 | No verificado en producción (integraciones reales de Google y Vercel) |

> ⚠️ **Ninguna funcionalidad fue probada manualmente en producción durante
> las rondas de documentación de agosto y octubre.** Las **368 pruebas**
> corren en un **sandbox con mocks** de Apps Script (`node:vm`), no contra
> Google real. La integración con Sheets, Calendar, Gmail, Drive y Vercel
> queda marcada como 🔎.
> La suite hoy son **368 pruebas** en 5 archivos.

---

## 18. Sistema de paletas y accesibilidad (AA)

> Fruto de las **dos auditorías UX/UI de octubre de 2026** (medición en
> navegador real: inspector de la skill `design-taste-frontend` + una matriz
> de contraste WCAG por tema). Los **gradientes, emojis, glass y sombras se
> conservaron** por decisión expresa del propietario; la accesibilidad se
> resolvió **sin tocar la identidad**.

### 18.1 Las 12 paletas

`PALETTES` (`App.jsx` 26–275) es la fuente única del selector de Ajustes.
Cada paleta define **18 campos obligatorios** (`id, name, emoji, primary, pd,
pl, bg, border, t, t2, gradient, gradientSoft, glass, glassStrong, neoLight,
neoDark, neoShadow, neoShadowDark`) y opcionales con defaults en `applyTheme`
(`??`): `card, surface, inputBg, green, greenBg, gold, goldBg, red, redBg,
warnBg, warnT, chromeBg, chromeBgr, chromeBrd, gradT, gradT2`.

| Paleta | Personalidad |
|---|---|
| `rosa` **Palo de Rosa** 🌸 | Fusión de Rosa+Coral: dusty rose `#A84B60` sobre crema `#F9F1F3` (default) |
| `morado` 💜 · `azul` 💙 · `verde` 💚 · `fucsia` 🌺 · `salvia` 🌿 | Clásicas con primarios ajustados a AA |
| `dorado` ✨ | Oro profundo `#896514` sobre crema `#FCF8F3` |
| `carbon` ⚫ · `marino` ⚓ | Sobrias |
| `barberia` **Barbería** 💈 | Gradiente **negro→azul→rojo** (`#10192B→#1D4FD7→#C8102E`) sobre blanco |
| `gala` **Gala** 🎩 | Crema champán `#F8F2E5` + oro antiguo `#846317` |
| `burdeos` **Burdeos** 🍷 | Vino `#6B1E2E` sobre crema `#FAF3F0`, espresso `#2A1A12` de texto |

Retiradas: `coral` y `crema` (fusionadas en Palo de Rosa). Un `id` guardado
que ya no existe cae en `PALETTES[0]` (`applyTheme`), así que nadie se queda
sin tema.

### 18.2 Variables de texto sobre rellenos (`gradT` / `gradT2`)

Todo texto que vive sobre una superficie saturada (gradiente del tema, chips
de `--primary`, tarjetas de balance y las tarjetas verde/rojo del neto) usa
**`--grad-t`** (texto principal) y **`--grad-t2`** (texto atenuado), con
defaults blanco/blanco-75%. Una paleta de rellenos claros puede redefinirlos
a oscuro. Regla de la casa: **la parada 0% del gradiente es donde vive el
título del header y la 50% donde vive el texto del botón** — ambas deben
pasar 4.5:1 con `gradT`.

### 18.3 Lo que exige la suite de regresión (`excel.test.js`)

Para **cada** paleta (una que no cumpla rompe el build):

- `primary` ≥4.5:1 como texto sobre blanco, su `pl` y su `bg`.
- `t` y `t2` ≥4.5:1 sobre el `bg`.
- Texto del botón (`gradT`): ≥4.5:1 sobre **todas las paradas del gradiente
  salvo la última**, y la última (punta decorativa, esquina sin texto)
  ≥3.0:1 — criterio WCAG 1.4.11 de componentes.
- Balance (`primary`→`pd`): legible con `gradT`.
- Semánticos `gold`/`green`/`red`/`warnT` ≥4.5:1 sobre sus fondos
  (defaults: gold `#8A6700`, greenBg `#F2FBF6`, red `#B03030`, warnT `#7A5000`).

### 18.4 Reglas de la casa aprendidas de las auditorías

- **Piso tipográfico 11px** en toda la UI; título `<h1>` por pantalla; cifras
  con `font-variant-numeric: tabular-nums` (`index.css`).
- **Objetivos táctiles ≥24×24** (WCAG 2.5.8); el botón «Hoy» del calendario
  fue el último corregido.
- Los rellenos con tinte verde/rojo usan `var(--green-bg)` / `var(--red-bg)`
  — nunca hexes sueltos (5 hardcodeados fueron migrados en octubre).
- Placeholders a `--t2` **sin opacidad** (a 60% eran 2.6:1).
- En grillas de 2 columnas angostas, las etiquetas de los inputs deben ser
  cortas y de una línea («Nombre», «Celular»): una etiqueta que envuelve
  desalinea los inputs (bug reportado desde un celular real, corregido).

---

> 📖 **Documentos relacionados**
>
> - [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) — instalación y configuración
> - [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) — guía para la operadora
> - [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md) — pruebas y diagnóstico
> - [`INDEX.md`](INDEX.md) — índice completo
