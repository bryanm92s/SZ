# 🧪 Pruebas y Mantenimiento — SZ

Guía para **probar, diagnosticar, respaldar, restaurar y desplegar** SZ.

> **Estado:** las pruebas de este documento se **ejecutaron** en esta ronda de
> documentación. Los resultados están al final de la
> [sección 2](#2-qué-cubren-las-pruebas).

---

## Índice

1. [Comandos reales](#1-comandos-reales)
2. [Qué cubren las pruebas](#2-qué-cubren-las-pruebas)
3. [ESLint y build](#3-eslint-y-build)
4. [Qué NO cubren las pruebas](#4-qué-no-cubren-las-pruebas)
5. [Pruebas manuales antes de desplegar](#5-pruebas-manuales-antes-de-desplegar)
6. [Casos críticos](#6-casos-críticos)
7. [Diagnóstico de errores frecuentes](#7-diagnóstico-de-errores-frecuentes)
8. [Copias de seguridad y recuperación](#8-copias-de-seguridad-y-recuperación)
9. [Mantenimiento periódico](#9-mantenimiento-periódico)
10. [Publicación y verificación posterior](#10-publicación-y-verificación-posterior)

---

## 1. Comandos reales

Todos los comandos están tomados de `package.json` (`scripts`).

```bash
npm run test          # una ejecución de las 273 pruebas
npm run test:watch    # modo observador (re-ejecuta al guardar)
npm run lint          # ESLint sobre src/ (*.js y *.jsx)
npm run build         # build de producción en dist/
npm run preview       # sirve dist/ localmente
npm run dev           # servidor de desarrollo en http://localhost:5173
npm run format        # Prettier — formatea src/**
```

> ⚠️ **Si Node no está en tu `PATH`** (así ocurre en la máquina de desarrollo
> de este proyecto), usa la ruta completa al binario:
>
> ```bash
> "<ruta>\node.exe" .\node_modules\vitest\vitest.mjs run
> "<ruta>\node.exe" .\node_modules\eslint\bin\eslint.js src --ext .js,.jsx
> "<ruta>\node.exe" .\node_modules\vite\bin\vite.js build
> ```

### Resultados verificados (esta ronda)

| Comando | Resultado |
|---|---|
| `npm test` | ✅ **273/273 pruebas pasando** — 3 suites (4,40 s) |
| `npm run lint` | ✅ **0 errores**, 11 *warnings* |
| `npm run build` | ✅ OK (5,82 s) |

> ⚠️ Estos resultados corresponden al estado del código **al momento de
> documentar**. Si cambias el código, **vuelve a ejecutarlos** antes de
> afirmar que pasan.

---

## 2. Qué cubren las pruebas

### 2.1 Las tres suites

| Suite | Pruebas | Qué cubre |
|---|---:|---|
| `src/helpers.test.js` | **144** | Toda la lógica pura de `helpers.js` |
| `src/backend.test.js` | **122** | Ejecuta el `Code.gs` **real** en un sandbox |
| `src/api.test.js` | **7** | Transporte HTTP y mensajes de error |

### 2.2 `src/helpers.test.js` — lógica pura

Cubre sin depender de React ni del navegador:

- **Fechas y tiempo**: `localDateStr`, `todayStr`, `monthStr`, `tomorrowStr`,
  `cleanDate`, `fmtDate`, `cleanTime`, `fmtTime`, `toMin`.
- **Horarios**: `TIME_SLOTS`, `getSlots` (bloqueo de ocupados, cierre 21:00),
  `checkSlot`, `overlap`, `buildConflictMap`.
- **Duraciones**: `svcDuration`, `sumDuration`, `apptDuration`,
  `fmtDuration`, `endTime`.
- **Estados**: `apptLife`, `apptGroup`, `apptStatus`, `canModifyAppt`.
- **Teléfono**: `phoneMatch` (sufijo y subcadena).
- **Finanzas**: `reportMetrics`, `periodLedger`, `groupExpensesByCategory`,
  `splitPaid`, `topServicesByDemand`, `apptServiceRefs`.
- **Servicios**: `serviceDeletionCheck`, `normName`, nombres ambiguos.
- **Reportes**: `reportLines` (formato del mensaje).

### 2.3 `src/backend.test.js` — el backend real, en un sandbox

> 📌 **Este es el test más importante del proyecto.** Carga `apps-script/Code.gs`
> con **`node:vm`** y lo ejecuta con **mocks de Apps Script** (`SpreadsheetApp`,
> `CalendarApp`, `GmailApp`, `ScriptApp`, `UrlFetchApp`, `Utilities`,
> `PropertiesService`, `LockService`, `Session`).

Cubre:

- **API**: `doGet` / `doPost`, token, acciones.
- **Seguridad**: `_requestResetCode`, `_verifyResetCode`, `_resetData`,
  grant de un solo uso, rate-limiting, hash, comparación en tiempo lineal.
- **Sheets**: `readSheet`, `writeSheet`, `initSheets`, `sanitizePayload`,
  `trackPriceChanges`, `seedPriceHistory`.
- **Calendar**: `createCalEvent`, `updateCalEvent`, `deleteCalEvent`,
  verificación post-escritura, idempotencia.
- **Reportes**: `_buildReport`, `_groupExpenses`, `_xlsxName`, períodos.
- **Respaldos**: `createDailyBackup`, retención de 30 días.
- **Triggers**: `setupAllReportTriggers` (4 disparadores, idempotente).
- ⭐ **Paridad de texto**: compara la salida de `_buildReport` con
  `reportLines` **importada del frontend**. Si el correo y el WhatsApp se
  desalinean, **la suite falla**.
- ⭐ **Regresión de nombres con coma**: verifica que un servicio llamado
  `Diseño, depilación y sombreado` **no** se parte en dos entradas fantasma.

### 2.4 `src/api.test.js` — transporte

- Mensajes de error por código HTTP (`httpError`).
- `loadData` / `saveData` con `fetch` simulado.
- Flujo de restablecimiento.

### 2.5 Fidelidad de los mocks — lección aprendida

> ⚠️ **Cinco fallos de producción escaparon de pruebas en verde** porque el
> mock era **más capaz o menos fiel** que Apps Script real:
>
> | Bug | Causa del mock |
> |---|---|
> | `setValues` rectangular | El mock aceptaba matrices irregulares; el real no |
> | Anchos de columna como enteros | El mock aceptaba strings; el real exige `int` |
> | `setColumnWidths` | El mock tenía otra firma que la real |
> | `HTTPResponse.getBytes` | **Ese método no existe** y el mock lo inventaba |
> | `formatDate` | Stub fijo que no reproducía el formato real |
>
> **Regla para quien agregue pruebas:** antes de usar una API de Apps Script,
> **verifícala en `developers.google.com/apps-script/reference`** y refleja
> esa firma **exacta** en el mock. Un mock generoso produce falsa confianza.

---

## 3. ESLint y build

### ESLint

```bash
npm run lint
```

- **0 errores** (bloqueantes).
- **11 warnings** preexistentes de `no-unused-vars`. **No bloquean** el build.
  Están permitidos por la configuración
  (`varsIgnorePattern: '^_'` en `.eslintrc.cjs`).

### Build

```bash
npm run build
```

Genera `dist/`. Salida esperada (aprox.):

| Archivo | Tamaño |
|---|---|
| `dist/assets/index-*.css` | ~0,28 kB |
| `dist/assets/index-*.js` | ~334 kB (gzip ~91 kB) |
| `dist/assets/xlsx-*.js` | ~429 kB (gzip ~143 kB) — **carga diferida** |
| `dist/assets/logo-*.png` | ~285 kB |

> 📌 `xlsx` se genera como **chunk aparte** y se importa con
> `import('xlsx')` **bajo demanda**: no penaliza la carga inicial de la app.

### Formato

```bash
npm run format
```

Aplica Prettier (`semi: false`, `singleQuote: true`, `printWidth: 120`).

---

## 4. Qué NO cubren las pruebas

Esto es importante: **pasar las 273 pruebas no garantiza que producción
funcione.**

| No se prueba | Por qué |
|---|---|
| **Componentes React** | No hay `@testing-library/react`: toda la UI (~4.487 líneas) está **sin tests de componentes** |
| **Google Sheets real** | `SpreadsheetApp` está **mockeado** |
| **Google Calendar real** | `CalendarApp` está **mockeado** |
| **Gmail real** | `GmailApp` está **mockeado** |
| **Google Drive real** | `DriveApp` está **mockeado** |
| **UrlFetchApp real** | **Mockeado**: no se descarga ningún `.xlsx` de verdad |
| **La exportación Excel de la app** | SheetJS no se prueba (no hay test de `exportExcel`) |
| **El botón de WhatsApp** | Se abre `wa.me`; no se automatiza |
| **La red real** | `fetch` está simulado |
| **Vercel y el despliegue** | No hay tests E2E |
| **Disparadores programados** | `ScriptApp` está mockeado; no se ejecutan a las 12:00 reales |
| **Concurrencia real** | `LockService` está simulado en serie |

> 🔎 **En resumen:** todo lo que toca **Google** o **Vercel** queda marcado
> como *no verificado en producción* en
> [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md).

---

## 5. Pruebas manuales antes de desplegar

Haz esta lista **antes** de cada publicación importante. Usa un
**Spreadsheet de prueba** si puedes, para no tocar datos reales.

### 5.1 Frontend (local)

- [ ] `npm test` en verde.
- [ ] `npm run lint` sin errores.
- [ ] `npm run build` sin errores.
- [ ] `npm run dev` → la app abre en `http://localhost:5173`.
- [ ] El header muestra «✓ Sincronizado» (con backend de prueba).

### 5.2 Citas

- [ ] Crear una cita nueva → aparece en la lista **y** en Sheets.
- [ ] Intentar agendar **encima** de otra → el bloque está deshabilitado.
- [ ] Agendar a las **20:30** con un servicio de **60 min** → debe rechazar
      (excede las 21:00).
- [ ] Editar la hora de una cita **pendiente** → el evento de Calendar **se
      mueve** (no se duplica).
- [ ] Intentar **editar** una cita completada → debe bloquear con el aviso.
- [ ] Intentar **eliminar** una cita completada → debe bloquear.
- [ ] Eliminar una cita pendiente → **desaparece también de Calendar**.

### 5.3 Servicios

- [ ] Cambiar el precio de un servicio → aparece un registro en
      **HistorialPrecios**.
- [ ] Comprobar que una cita **vieja conserva su precio original**.
- [ ] Intentar eliminar un servicio con **citas futuras** → debe bloquear
      (tanto en la app como si lo intentaras por la API).

### 5.4 Finanzas y reportes

- [ ] Marcar una cita **Completada** con **Efectivo** → suma en ingresos.
- [ ] Marcar otra con **Transferencia** → aparece en su rubro.
- [ ] Marcar una **No asistió** → cuenta como **número**, no como dinero.
- [ ] Registrar varios gastos (**más de 8**) → el detalle se agrupa por
      categoría pero **el total suma todo**.
- [ ] **Paginación de gastos:** con **más de 10** gastos en el mes, debe
      aparecer `‹ Ant. · 1–10 de N gastos · pág. 1 de X · Sig. ›`. Con 10 o
      menos **no debe aparecer**.
- [ ] Al cambiar de **mes**, la paginación debe **volver a la página 1**.
- [ ] **Exportar Excel** → el `.xlsx` trae **Resumen, Citas y Gastos**, y
      **todos** los gastos uno por uno.
- [ ] Botón **WhatsApp admin** → se abre WhatsApp con el texto correcto.

### 5.5 Reportes (paginación de movimientos)

- [ ] Abrir **Finanzas → Reporte y Excel** y elegir un período con **más de
      10 movimientos** (p. ej. «Por mes» con varios días de actividad).
- [ ] Debe aparecer la paginación: `1–10 de N movimientos · pág. 1 de X`.
- [ ] **‹ Ant.** deshabilitado en la página 1 y **Sig. ›** deshabilitado en
      la última.
- [ ] ⭐ **Invariante:** el **Neto del período** debe ser **idéntico** en
      **todas** las páginas (suma el período completo, no la página visible).
- [ ] Al cambiar de **período** o de **filtro** (Todo / Ingresos / Gastos),
      la paginación debe **volver a la página 1**.
- [ ] Con un período de **10 movimientos o menos**, la paginación **no debe
      aparecer**.

### 5.6 Calendar (caso crítico)

- [ ] Crear cita → evento existe con título `✨ servicio — clienta`.
- [ ] Editar hora → evento **se mueve**.
- [ ] Eliminar cita → evento **desaparece**.
- [ ] Simular un fallo de borrado → la app debe **avisar y ofrecer
      reintento** con el ID del evento.

### 5.7 Reportes automáticos (si están activos)

- [ ] Ejecutar `sendDailyReportEmail()` **a mano** desde el editor de Apps
      Script.
- [ ] Revisar **Registros de ejecución**: debe decir
      `OK Reporte DIARIO enviado a … (con Excel adjunto)`.
- [ ] Verificar que el correo **llegó** y que el `.xlsx` **no está vacío**.
- [ ] Ejecutar `setupAllReportTriggers()` y comprobar en **⚙️ → Disparadores**
      que hay **4** triggers y **no hay duplicados**.

> ⚠️ Ver `SKIP reporte mensual: hoy no es el último día del mes` **es
> normal**: esos triggers corren a diario y deciden no enviar.

### 5.8 Restablecimiento (SOLO en entorno de prueba)

> 🚨 **Nunca pruebes esto con datos reales.** Borra **todo**, incluidos los
> eventos de Calendar, y **no se puede deshacer**.

- [ ] Pedir código → llega al correo autorizado.
- [ ] Escribirlo mal **5 veces** → bloqueo de 30 minutos.
- [ ] Usar el código **dos veces** → el segundo intento debe fallar.
- [ ] Ejecutar el reset con el grant correcto → borra todo.
- [ ] Verificar que **sin grant** la API rechaza el `resetData`.

---

## 6. Casos críticos

Estos son los puntos donde un fallo cuesta **dinero o datos**.

| Caso | Riesgo | Cómo probarlo |
|---|---|---|
| **Crear cita** | Doble reloj entre dos dispositivos | Agenda desde 2 celulares a la vez en la misma hora |
| **Editar cita** | Evento duplicado en Calendar | Edita la hora y revisa que no queden **dos** eventos |
| **Eliminar cita** | Evento huérfano | Elimina y verifica que el evento desaparezca |
| **Conflictos** | Cita en hora ocupada | Intenta agendar encima (bloqueado en cliente) |
| **Servicios con citas** | Borrar servicio usado | Intenta eliminar un servicio con citas futuras |
| **Reportes** | Texto desalineado WhatsApp/correo | Ejecutar `npm test` (hay prueba de paridad) |
| **Restablecimiento** | Borrado accidental | **Solo** en entorno de prueba; exige código + grant |

---

## 7. Diagnóstico de errores frecuentes

### 7.1 ¿De dónde vino el error?

| Señala hacia… | Evidencia |
|---|---|
| **Frontend** | Error en la consola del navegador (F12), o la UI no responde |
| **Apps Script** | La app muestra «⚠ Modo sin conexión» con un mensaje del **servidor** |
| **Permisos de Google** | Mensaje de Apps Script con `Authorization`, `Scope` o `Service invoked with illegal arguments` |
| **Despliegue** | Funcionaba y dejó de; revisa el último despliegue en Vercel o la última versión en Apps Script |

### 7.2 Distinguir frontend, backend, permisos o despliegue

**Paso 1 — ¿El header dice «✓ Sincronizado»?**

- **Sí** → el backend responde bien. Si algo falla, es de **frontend/UI**.
- **No** → sigue al paso 2.

**Paso 2 — ¿Qué dice el aviso exactamente?**

| Mensaje | Origen | Acción |
|---|---|---|
| «Configura `VITE_SCRIPT_URL` y `VITE_TOKEN` en Vercel» | Frontend | Falta la variable; se hornea en el build → **rebuild + redeploy** |
| «HTTP 404: Google reescribió la dirección con /u/N/…» | Google | Varias cuentas abiertas → **ventana de incógnito** |
| «HTTP 404: Apps Script no encontró el Web App» | Apps Script | URL o versión mal → revisa la implementación |
| «HTTP 403: No autorizado… `SB_SYNC_TOKEN`» | Apps Script | El token **no coincide** |
| «Token de sincronización no configurado» | Apps Script | **Falta la propiedad** en el servidor |
| «Sin conexión a Internet o el servidor no responde» | Red | Revisa internet o el dominio |
| «Apps Script está ocupado…» | Apps Script | `LockService` no liberó → reintenta |
| «Error interno (500)» | Apps Script | Mira **Registros de ejecución** |

**Paso 3 — Revisa los registros de Apps Script.**

Editor → **Registros de ejecución** → busca `ERROR`, `❌`, `not_applied`.

> 📌 **Ojo:** el `catch` de `_buildReportXlsx` **absorbe** los errores en
> `console.error`. Un fallo de adjunto solo se manifiesta como
> `(sin adjunto)` en la línea de log del correo.

### 7.3 Errores frecuentes

| Error | Causa | Solución |
|---|---|---|
| `URI malformed` en build | `%` inválido en un atributo del `index.html` | No usar placeholders `%VITE_*%` ahí; el favicon va vía `App.jsx` |
| `Failed to load url …/test/setup.ts` | `vitest.config` apuntaba a un archivo inexistente | **Ya corregido**: no hay `setupFiles` |
| `resp.getBytes is not a function` | **`HTTPResponse` no tiene `getBytes()`** | Usar `resp.getBlob().getBytes()` |
| `Cannot convert '11,7,9,…' to int` | Anchos de columna como string | `Sheet.setColumnWidth` exige **píxeles enteros** |
| xlsx adjunto **vacío** con HTTP 200 | Exportación antes de que Drive volcara los datos | `flush()` + `sleep(1500)` + validar prefijo `PK` + reintentar |
| Evento de Calendar no se aplica | Calendar tardó en reflejar la hora | `updateCalEvent` devuelve `not_applied`; reintenta |
| Los cambios en la hoja «no se guardan» | `writeSheet` reescribe la hoja completa | **No editar las hojas a mano** |
| Servicio «con fantasmas» en rankings | Partir `serviceNames` por coma | **Ya corregido**: resolución **por id** (`apptServiceRefs`) |

### 7.4 Cómo depurar en local

1. `.env.local` con `VITE_SCRIPT_URL=https://example.invalid/exec` → la app
   entra en **Modo sin conexión** y puedes sembrar datos en `localStorage`.
2. Claves útiles: `sb_c` (clientes), `sb_s` (servicios), `sb_a` (citas),
   `sb_e` (gastos), `sz_palette`, `sz_hcats`.
3. **Borra esas claves y el `.env.local`** después de probar.

---

## 8. Copias de seguridad y recuperación

### 8.1 Qué se respalda automáticamente

| Qué | Cómo | Frecuencia | Dónde |
|---|---|---|---|
| Hoja completa | `createDailyBackup` (`Code.gs` 802) | Diaria, 23:00 | Drive: `BACKUP-PROYECTO/Backups/<hoja>/` |
| Último respaldo | `sendWeeklyBackupEmail` (`Code.gs` 904) | Sábados, 9:00 | Correo (⚠️ destinatario hardcodeado) |

- **Retención:** 30 días (se eliminan los mayores).
- **No duplica** si ya existe un respaldo de hoy.
- **Instalación (una sola vez):**
  ```
  setupDailyBackupTrigger()
  setupWeeklyEmailTrigger()
  ```

### 8.2 Qué NO se respalda

| No se respalda | Cómo mitigarlo |
|---|---|
| **Propiedades del script** (`SB_SYNC_TOKEN`, `SB_AUTHORIZED_EMAIL`) | Anótalas en un **gestor de contraseñas** |
| **Variables de Vercel** | Anótalas; se re-entran en la consola |
| **Eventos de Google Calendar** | No hay respaldo: si se borran, hay que **recrear las citas** |
| **El código** | ✅ Sí está respaldado: es el repositorio de GitHub |

### 8.3 Respaldos manuales recomendados

- **Google Sheets:** Archivo → Descargar → Excel (al menos una vez al mes).
- **Google Calendar:** no tiene exportación directa; considera una copia
  periódica a otra calendario.
- **GitHub:** los pushes a `main` son el respaldo del código.

### 8.4 Procedimiento de restauración

**Restaurar la hoja:**

1. Drive → `BACKUP-PROYECTO/Backups/<nombre de la hoja>/`.
2. Abre el respaldo de la fecha que necesites.
3. **Copia cada hoja** (Clientes, Servicios, Citas, Gastos, HistorialPrecios)
   a la hoja de producción, **reemplazando** el contenido.
4. ⚠️ Conserva los **encabezados** de la primera fila.
5. Abre la app y pulsa **↻**.

> 🚨 **No borres la hoja de producción ni crees una nueva.** El script está
> **vinculado al archivo**: si lo cambias, tendrás que volver a vincularlo.

**Restaurar el código:**
`git revert` o *rollback* del commit, y deja que Vercel redespliegue (o usa
**Promote to Production**).

**Restaurar la configuración:**
vuelve a entrar las propiedades del script y las variables de Vercel.

| Qué se restaura | Fuente | ¿Automático? |
|---|---|:---:|
| Código | Git / Vercel | ✅ |
| Datos (hoja) | Drive / correo | ✅ |
| Propiedades del script | Anotación manual | ❌ |
| Variables de Vercel | Consola de Vercel | ❌ |
| Eventos de Calendar | — | ❌ |

---

## 9. Mantenimiento periódico

| Tarea | Frecuencia | Cómo |
|---|---|---|
| `npm test` + `npm run lint` + `npm run build` | **Antes de cada despliegue** | Ver [sección 1](#1-comandos-reales) |
| Revisar respaldos en Drive | Mensual | Comprobar archivos recientes en `BACKUP-PROYECTO/Backups/…` |
| Revisar reportes por correo | Mensual | Confirmar llegada y que el `.xlsx` **no esté vacío** |
| Revisar **Registros de ejecución** | Mensual | Buscar `ERROR`, `❌`, `not_applied` |
| Revisar **⚙️ → Disparadores** | Trimestral | Sin duplicados ni huérfanos |
| `npm outdated` | Trimestral | Actualizar **con pruebas** |
| Rotar `SB_SYNC_TOKEN` | Anual o ante sospecha | Ver ⚠️ abajo |
| Limpiar citas pasadas / gastos viejos | Según necesidad | **Desde la app**, nunca editando las hojas |

> 🚨 **Rotar el token implica DOS pasos obligatorios:**
>
> 1. Cambiar la propiedad `SB_SYNC_TOKEN` en **Apps Script**.
> 2. Cambiar `VITE_TOKEN` en **Vercel** y **re-desplegar**.
>
> Si solo haces uno, **la app deja de funcionar** («No autorizado»).

---

## 10. Publicación y verificación posterior

### 10.1 Flujo de publicación

1. **Rama** aparte (`git checkout -b fix/…`).
2. **Modificar** el código.
3. Ejecutar `npm test`, `npm run lint`, `npm run build`.
4. **Pull request** → Vercel genera una **Preview**.
5. **Probar la Preview.**
6. **Merge a `main`** → Vercel despliega a producción.
7. Si el cambio tocó `Code.gs` → **pegarlo en Apps Script** y publicar
   **Nueva versión**.
8. Si cambian funciones de trigger → volver a ejecutar `setupAllReportTriggers()`.

> 🚨 **NUNCA crees una «Nueva implementación» en Apps Script.** Cambiaría la
> URL `/macros/u/N/s/…/exec` y **rompería** `VITE_SCRIPT_URL`. Usa siempre
> **«Nueva versión»** sobre la implementación existente.

### 10.2 ¿Qué requiere actualizar Apps Script y qué solo Vercel?

| Cambio en… | ¿Vercel? | ¿Apps Script? | ¿Nueva versión? | ¿Nuevos triggers? |
|---|:---:|:---:|:---:|:---:|
| `src/App.jsx` o `src/helpers.js` | ✅ | — | — | — |
| Variable `VITE_*` | ✅ (rebuild) | — | — | — |
| `apps-script/Code.gs` | — | ✅ | ✅ | Solo si cambian las funciones de trigger |
| `appsscript.json` | — | ✅ | ✅ | Puede pedir **reautorizar** |
| Propiedad del script | — | ✅ (consola) | — | — |

> 📌 **Regla práctica:** si solo toca `src/`, con hacer push basta. Si toca
> `Code.gs`, además hay que pegarlo y publicar la versión.

### 10.3 Lista de verificación posterior al despliegue

- [ ] La app abre sin pantalla de error.
- [ ] El header muestra **«✓ Sincronizado»**.
- [ ] Se crea una cita de prueba y aparece en **Sheets**.
- [ ] El evento aparece en **Calendar** con título y hora correctos.
- [ ] **Editar** la cita → el evento **se mueve** (no se duplica).
- [ ] **Eliminar** la cita → el evento **desaparece**.
- [ ] El botón **«💬 WhatsApp admin»** está activo.
- [ ] **« Exportar Excel»** genera un `.xlsx` con las 3 hojas.
- [ ] Si tocaste reportes: ejecutar `sendDailyReportEmail()` a mano y revisar
      **Registros de ejecución**.
- [ ] Si tocaste triggers: comprobar que aparecen los esperados y **no hay
      duplicados**.
- [ ] **Borrar la cita de prueba** (y su evento).

### 10.4 Rollback

- **Frontend:** Vercel → **Deployments** → despliegue anterior →
  **Promote to Production**.
- **Backend:** Apps Script **no permite restaurar** una versión anterior, así
  que re-pegar el `Code.gs` de una versión de Git y publicar **Nueva versión**.

---

> 📖 **Documentos relacionados**
>
> - [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) — instalación y configuración
> - [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) — guía para la operadora
> - [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md) —
>   reglas de negocio y matriz de funcionalidades
> - [`INDEX.md`](INDEX.md) — índice completo
