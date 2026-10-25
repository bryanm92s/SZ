# 📋 Manual Técnico — SZ

Guía completa para **instalar, configurar y mantener SZ desde cero** en un
entorno nuevo.

> **Alcance:** todo lo que se describe aquí está verificado contra el código del
> repositorio. Cuando un paso requiere confirmarlo en la consola del servicio
> (Google, Vercel), se dice explícitamente con el sello
> **🔑 Confirmar en consola**.

**Índice**

- [A. Requisitos y preparación](#a-requisitos-y-preparación)
- [B. Instalación local](#b-instalación-local)
- [C. Matriz de variables y configuración](#c-matriz-de-variables-y-configuración)
- [D. Google Apps Script desde cero](#d-google-apps-script-desde-cero)
- [E. Google Sheets y Google Calendar](#e-google-sheets-y-google-calendar)
- [F. Despliegue del frontend en Vercel](#f-despliegue-del-frontend-en-vercel)
- [G. Seguridad y recuperación](#g-seguridad-y-recuperación)
- [H. Actualización y mantenimiento](#h-actualización-y-mantenimiento)

---

## A. Requisitos y preparación

### A.1 Herramientas

| Herramienta | Versión mínima | Confirmado con | Para qué |
|---|---|---|---|
| **Node.js** | 18+ | 18.20.2 | Ejecutar Vite, Vitest y ESLint |
| **npm** | 10.x | incluido con Node | Gestión de dependencias |
| **Git** | 2.x | — | Control de versiones y despliegue |
| **Navegador** | Chromium / Safari / Firefox actual | — | Probar la app y acceder a los editores de Google y Vercel |

> ⚠️ **Node no está en el `PATH` de esta máquina de desarrollo.** Los comandos
> de este documento usan `npm`/`npx` (lo normal). Si tu entorno tampoco lo tiene
> en el `PATH`, usa la ruta completa al binario de `node`, p. ej.
> `"<ruta>\node.exe" .\node_modules\vitest\vitest.mjs run`.

### A.2 Cuentas necesarias

| Cuenta | Gratuita | Permiso mínimo | Para qué |
|---|:---:|---|---|
| **Google** | ✅ | Propietaria | Sheets, Apps Script, Calendar, Drive y Gmail |
| **GitHub** | ✅ | Escritura en el repo | Alojar el código |
| **Vercel** | ✅ | Proyecto propio | Alojar el frontend |

> 🔑 **Una cuenta de Google por proyecto.** Para que un cliente no pueda
> (ni tú por accidente) borrar la hoja, el script o los respaldos, cada
> despliegue se monta sobre **su propia cuenta** (p. ej.
> `proyectoSZ@gmail.com`, `proyectoABC@gmail.com`), con 2FA y el teléfono
> de recuperación anotados en tu gestor de contraseñas. De esa cuenta salen
> los correos (GmailApp), viven los respaldos de Drive y el calendario de las
> citas —compartido con la usuaria en **solo lectura**. A ella se le entregan
> sus datos por otros canales: los reportes a su correo (`SB_REPORT_EMAIL`),
> el respaldo semanal (`SB_BACKUP_EMAIL`) y el Excel de respaldo desde
> Ajustes. Google desactiva cuentas inactivas: **entra a cada cuenta de
> proyecto de vez en cuando**.

### A.3 Servicios externos que SZ toca

| Servicio | Uso en SZ | Dónde se configura |
|---|---|---|
| **Google Sheets** | Base de datos (6 hojas) | Vinculado al proyecto de Apps Script |
| **Google Calendar** | Eventos de cada cita | Calendario por defecto de la cuenta, o el de **`SB_CALENDAR_ID`** si está configurada |
| **Google Drive** | Respaldos automáticos de la hoja | Carpetas `BACKUP-PROYECTO/Backups/…` |
| **Gmail** | Reportes automáticos, respaldo semanal, código de recuperación | Cuenta que ejecuta el script (destinatarios en `SB_AUTHORIZED_EMAIL` / `SB_REPORT_EMAIL` / `SB_BACKUP_EMAIL`) |
| **Vercel** | Hosting del frontend | Variables de entorno |

### A.4 Restricciones de compatibilidad

- **Apps Script no soporta varias cuentas de Google abiertas en el mismo
  navegador.** Google reescribe la URL a `/macros/u/N/s/…/exec` y responde
  404. SZ detecta ese patrón y muestra un mensaje concreto
  (`src/api.js`, `MULTI_ACCOUNT_HINT`). **Solución:** ventana de incógnito con
  solo la cuenta del propietario.
- **`VITE_*` se inyectan en tiempo de build**, no en runtime: cambiar una
  variable de entorno exige **reconstruir y volver a desplegar**.
- **`index.html` no puede usar placeholders `%VITE_xxx%`** en atributos
  `href`/`src`: Vite ejecuta `decodeURI()` y el build falla con
  *URI malformed*. El título y el favicon se aplican en runtime desde
  `App.jsx`.

---

## B. Instalación local

### B.1 Clonar el repositorio

URL confirmada en la configuración del proyecto (`git remote -v`):

```bash
git clone https://github.com/bryanm92s/SZ.git
cd SZ
```

> 🔑 **Confirmar en consola:** esa es la URL del repo actual. Si instalaras SZ
> en otro entorno, usa la URL de **tu** fork o repo.

### B.2 Instalar dependencias

```bash
npm install
```

Esto instala las 3 dependencias de producción (`react`, `react-dom`, `xlsx`) y
las de desarrollo (Vite, Vitest, ESLint, Prettier). El archivo
`package-lock.json` fija las versiones exactas.

### B.3 Configurar el entorno local

```bash
cp .env.example .env
```

Edita `.env` y completa al menos `VITE_SCRIPT_URL` y `VITE_TOKEN`
(ver [sección C](#c-matriz-de-variables-y-configuración)).

> `.env` y `.env.local` están en `.gitignore`: **nunca** se suben al repo.
> Si pruebas sin backend, puedes poner una URL inválida a propósito
> (`https://example.invalid/exec`) para que la app entre en «Modo sin conexión».

### B.4 Ejecutar la aplicación

```bash
npm run dev
```

Abre **http://localhost:5173**.

### B.5 Pruebas, lint y build

```bash
npm test              # 354 pruebas, una sola ejecución
npm run test:watch    # modo observador
npm run lint          # ESLint sobre src/
npm run build         # build de producción en dist/
npm run preview       # sirve dist/ localmente
```

**Resultados verificados en esta ronda de documentación:**

| Comando | Resultado |
|---|---|
| `npm test` | ✅ **354/354 pruebas pasando** (5 suites) |
| `npm run lint` | ✅ **0 errores**, 11 *warnings* preexistentes (`no-unused-vars`) |
| `npm run build` | ✅ Build OK (~5,8 s) |

### B.6 Errores frecuentes de instalación

| Error | Causa y solución |
|---|---|
| `node: no se reconoce` | Node no está en el `PATH`. Usa la ruta completa al binario. |
| `Failed to load url …/test/setup.ts` | Un `vitest.config` apuntaba a un archivo inexistente. Ya está corregido: `vitest.config.ts` **no** define `setupFiles`. |
| `URI malformed` en `vite build` | Hay un `%` inválido en un atributo del `index.html`. No uses placeholders `%VITE_*%` ahí. |
| `Cannot find module 'xlsx'` | Faltan dependencias: vuelve a ejecutar `npm install`. |
| Los tests fallan solo en tu máquina | Comprueba que no hay un `.env.local` con variables que alteren el entorno. |

---

## C. Matriz de variables y configuración

### C.1 Variables de entorno del frontend (`VITE_*`)

Todas se leen con `import.meta.env` y **quedan embebidas en el bundle JS**
(`src/api.js` líneas 1–2, `src/App.jsx` líneas 193–206, 314).

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_SCRIPT_URL` |
| **Ubicación** | `.env` (local), Vercel → *Settings → Environment Variables* |
| **Uso** | URL del Web App de Apps Script. Sin ella la app muestra «Configura VITE_SCRIPT_URL y VITE_TOKEN en Vercel» (`App.jsx` línea 314) y no carga ni guarda nada. |
| **Obligatoria** | **Sí** |
| **Valor predeterminado** | Ninguno |
| **Cómo configurarla** | Copia la URL `https://script.google.com/macros/s/«ID»/exec` obtenida al publicar el Web App (sección D.9). |
| **Reinicio o despliegue** | **Sí:** las `VITE_*` se hornean en el build. Hay que reconstruir y redesplegar en Vercel. |
| **Sensibilidad** | **Interna.** No es un secreto fuerte (queda en el bundle), pero no la publiques en foros. |
| **Verificación** | Abre la app: si ves la pantalla «Configura VITE_SCRIPT_URL…», falta. Si ves «Modo sin conexión» con el mensaje del servidor, la URL está bien pero el backend respondió error. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_TOKEN` |
| **Ubicación** | `.env` (local), Vercel |
| **Uso** | Token de sincronización. Viaja en el `query string` del GET (`api.js` línea 49) y en el cuerpo del POST (línea 57). |
| **Obligatoria** | **Sí** |
| **Valor predeterminado** | Ninguno |
| **Cómo configurarla** | Debe ser **idéntica** a la propiedad de script `SB_SYNC_TOKEN` (sección D.5). |
| **Reinicio o despliegue** | **Sí** (rebuild + redeploy). |
| **Sensibilidad** | ⚠️ **Expuesta.** Va dentro del JavaScript público. **No es un secreto efectivo**: el auténtico es `SB_SYNC_TOKEN`, que vive en el servidor. |
| **Verificación** | Sin ella el backend responde «No autorizado». Si responde «Token de sincronización no configurado», falta la propiedad **del servidor**, no esta. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_BIZ_NAME` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Nombre del negocio: `<title>`, encabezado y pie (`App.jsx` 193, 294, 532, 580). |
| **Obligatoria** | No |
| **Valor predeterminado** | `SZ` |
| **Cómo configurarla** | Cualquier texto. |
| **Reinicio o despliegue** | **Sí** (rebuild). |
| **Sensibilidad** | Pública |
| **Verificación** | Cambia el título de la pestaña y el nombre del encabezado. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_BIZ_SUBTITLE` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Subtítulo bajo el nombre (`App.jsx` 194, 533) **y** en la pestaña, como `NOMBRE · SUBTITULO` (`App.jsx` 294). |
| **Obligatoria** | No |
| **Valor predeterminado** | `''` (vacío → en el pie se repite el nombre) |
| **Sensibilidad** | Pública |
| **Verificación** | Aparece en letras pequeñas bajo el nombre, en mayúsculas, y también en el texto de la pestaña (`NOMBRE · SUBTITULO`). |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_BIZ_EMOJI` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Emoji de marca en toda la app: favicon (`App.jsx` 461), pantalla de carga (809), encabezado (823; solo si no hay `VITE_BIZ_LOGO`), pie (889), título «Citas de Hoy» (1977), estado vacío de Citas (2320) y cierre del WhatsApp (412). ⚠️ **No va en el `<title>`** (459): el navegador pinta el icono y el texto juntos y se vería `🌸🌸`. |
| **Obligatoria** | No |
| **Valor predeterminado** | `🌸` |
| **Sensibilidad** | Pública |
| **Verificación** | Cambia el ícono de la pestaña y el título «… Citas de Hoy» del Panel. Se codifica con `encodeURIComponent`, así que un emoji inválido no rompe el data-URI. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_BIZ_LOGO` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | URL **absoluta** de la imagen para `apple-touch-icon` y, si existe, sustituye al emoji en el encabezado (`App.jsx` 196, 303, 527). |
| **Obligatoria** | No |
| **Valor predeterminado** | `''` (se usa el emoji) |
| **Sensibilidad** | Pública |
| **Verificación** | La app muestra la imagen en el encabezado en lugar del emoji. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_CATALOG` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Catálogo de servicios con el que **arranca** el programa (aún sin datos, y también tras un restablecimiento). Presets en `src/catalogs.js`: `cejas`, `unas`, `peluqueria`, `barberia`, `depilacion`, `masajes`, `estetica`, `maquillaje`. |
| **Obligatoria** | No |
| **Valor predeterminado** | `cejas` (el catálogo histórico de SZ) |
| **Cómo configurarla** | Una de las claves de `CATALOGS`. Una clave desconocida cae a `cejas` sin romper el arranque. |
| **Reinicio o despliegue** | **Sí** (rebuild). |
| **Sensibilidad** | Pública |
| **Verificación** | Con la app vacía, en «Servicios» aparecen los servicios del negocio correcto. |

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_DEFAULT_SERVICES` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Lista JSON con los servicios **exactos** del cliente: `[{"name":"Corte","price":45000,"duration":60}]`. **Tiene prioridad sobre `VITE_CATALOG`** y sirve para negocios que no encajan en un preset. |
| **Obligatoria** | No |
| **Valor predeterminado** | `''` (se usa el preset) |
| **Cómo configurarla** | Una sola línea JSON. Cada entrada necesita `name`; `price` y `duration` se normalizan (inválidos → 0 y 30). Una entrada sin nombre se descarta. |
| **Reinicio o despliegue** | **Sí** (rebuild). |
| **Sensibilidad** | Pública |
| **Verificación** | JSON roto o vacío → la app arranca igual, con el preset. Ese es el diseño: **nunca** reventar por una variable mal escrita. |

#### C.1.1 Categorías de catálogo: las 8 disponibles y paso a paso

`VITE_CATALOG` acepta **8 claves exactas**. Cada una puebla la pantalla
«✂️ Servicios» con los precios y duraciones típicos de ese tipo de negocio
(siempre editables desde la app):

| # | Clave (`VITE_CATALOG`) | Tipo de negocio | Serv. | Ejemplos de servicios |
|---:|---|---|:---:|---|
| 1 | `cejas` ← *defecto* | Cejas y pestañas | 9 | Micropigmentación (350.000 / 90 min), extensiones, lifting, laminado |
| 2 | `unas` | Spa de uñas / nail bar | 11 | Esmaltado semipermanente, acrílicas, builder gel, nail art |
| 3 | `peluqueria` | Peluquería dama y caballero | 10 | Corte, tinte, mechas, alisado, peinado de novia |
| 4 | `barberia` | Barbería (corte masculino) | 10 | Corte, corte de barba, afeitado, marcación, camuflaje de canas |
| 5 | `depilacion` | Depilación con cera | 10 | Axilas, brazos, piernas, ingles / bikini, brasileña |
| 6 | `masajes` | Spa de masajes | 9 | Relajante, descontracturante, piedras calientes, drenaje linfático |
| 7 | `estetica` | Estética facial | 9 | Higiene facial, peeling, microneedling, radiofrecuencia |
| 8 | `maquillaje` | Maquillaje profesional | 9 | Social, novia, quinceañera, fantasia, cejas con henna |

**Paso a paso para elegir (o cambiar) la categoría:**

1. Abre **vercel.com** → tu proyecto → **Settings → Environment Variables**.
2. Si `VITE_CATALOG` no existe, pulsa **Add**; si existe, **Edit**.
3. Valor: **solo la clave**, en minúsculas y sin tildes (p. ej. `masajes`).
   Marca el entorno **Production** (y **Preview** si lo usas).
4. **Save**.
5. Publica el cambio: **Deployments** → ⋮ del despliegue más reciente →
   **Redeploy**. ⚠️ Las `VITE_*` se leen **al compilar**: sin rebuild,
   no cambia nada.
6. Verificación: abre la app **sin datos** (o ejecuta un restablecimiento)
   y comprueba en ✂️ Servicios que aparecen los servicios correctos.

> 📌 **Tres reglas que conviene tener claras**
>
> - **La clave es exacta.** `Masajes` o `  UNAS ` sí funcionan (se pasa a
>   minúsculas y se recortan los espacios), pero `peluquería` con tilde
>   **no**: cae al defecto `cejas` sin ningún aviso en pantalla.
> - **Solo puebla el primer arranque** y el resultado de un
>   **restablecimiento**. En cuanto hay datos, el catálogo real vive en
>   Google Sheets y se edita desde ✂️ Servicios.
> - **Si nada encaja** (estudio de tatuajes, lavandería, etc.) se usa
>   `VITE_DEFAULT_SERVICES` con la lista JSON del negocio; esa tiene
>   prioridad sobre `VITE_CATALOG`.
>
> El archivo fuente de estas 8 categorías es `src/catalogs.js`; el test
> `src/catalogs.test.js` verifica que todas sean utilizables (nombre,
> precio y duración válidos).

| Campo | Contenido |
|---|---|
| **Nombre exacto** | `VITE_ADMIN_WHATSAPP` |
| **Ubicación** | `.env`, Vercel |
| **Uso** | Destino del botón «💬 WhatsApp admin» del reporte (`App.jsx` 206, 209). Se le agrega el prefijo `57` si no lo trae. |
| **Obligatoria** | No — **pero sin ella el botón sale deshabilitado** |
| **Valor predeterminado** | `''` (botón deshabilitado) |
| **Cómo configurarla** | Solo dígitos, con o sin `57`. p. ej. `57322XXXXXXX`. |
| **Reinicio o despliegue** | **Sí** (rebuild). |
| **Sensibilidad** | ⚠️ **Personal / interna.** No está en el repo ni en el historial de git, pero **sí queda en el bundle desplegado** (es una limitación de las `VITE_*`). |
| **Verificación** | En el reporte, el botón está activo y abre `wa.me` con el número correcto. |

### C.2 Propiedades de Google Apps Script (*Script Properties*)

Se editan en **Editor → ⚙️ Propiedades del proyecto → Propiedades de script**.
Ninguna se escribe dentro del código (el repo es público).

| Nombre exacto | Clave en el código | Uso | Obligatoria | Sensibilidad | Verificación |
|---|---|---|---|---|---|
| `SB_SYNC_TOKEN` | `TOKEN_PROP_KEY` (`Code.gs` 15) | Autentica GET y POST. **Si falta, no se autoriza nada** («fail closed») y el servidor responde «Token de sincronización no configurado: añade la propiedad SB_SYNC_TOKEN…» (`Code.gs` 349–350). | **Sí** | **Secreto** | Sin ella, cualquier petición es rechazada. Con ella y el token correcto, la app muestra «✓ Sincronizado». |
| `SB_AUTHORIZED_EMAIL` | `PROP_KEY.email` (`Code.gs` 198) | **ÚNICA** fuente del correo de **seguridad**: a él (o a **ella**, si es una lista) llega el código de restablecimiento. Admite **varias direcciones separadas por coma** (p. ej. la cuenta del proyecto y la usuaria); cada una recibe el mismo código, con la misma vigencia e intentos. Solo se aceptan direcciones con `@`. | **Sí** — sin ella no se envía nada de eso. | **Secreto / personal** | Con ella: el correo llega al indicado al pedir el código. Sin ella (o sin ninguna dirección válida): no sale nada y el log de ejecución avisa (el reset responde igual para no revelar la configuración, pero no gasta el cupo de solicitudes). |
| `SB_REPORT_EMAIL` | `PROP_KEY.reportEmail` (`Code.gs` 199) | Destinatario de los **4 reportes automáticos**. Para separar «quién recibe los reportes» de «quién recibe los códigos» (una cuenta de Google por proyecto). Admite varias direcciones con coma. | **No** — si falta, los reportes van a `SB_AUTHORIZED_EMAIL`. | **Secreto / personal** | Con ella: el reporte llega a esa dirección y el código sigue yendo a `SB_AUTHORIZED_EMAIL`. Sin ella: los reportes van a `SB_AUTHORIZED_EMAIL` (comportamiento original). |
| `SB_BACKUP_EMAIL` | `PROP_KEY.backupEmail` (`Code.gs` 200) | Destinatario del **respaldo semanal** (el `.xlsx` del sábado). Para separar «a quién le llega la copia» de «quién recibe los códigos». | **No** — si falta, el respaldo va a `SB_AUTHORIZED_EMAIL`. | **Secreto / personal** | Con ella: el sábado el backup llega a esa dirección. Sin ella: llega a `SB_AUTHORIZED_EMAIL` (comportamiento original). |
| `SB_CALENDAR_ID` | `PROP_KEY.calendarId` (`Code.gs` 201) | Id de un **calendario SECUNDARIO** de la misma cuenta (p. ej. «Citas <negocio>») al que van todos los eventos. Sirve para compartir la agenda con la usuaria en **solo lectura** sin exponer su calendario personal. | **No** — si falta, los eventos van al **calendario por defecto** (como siempre). | Interna | Con ella (y el calendario accesible): las citas salen en ese calendario. Si el id no existe o no es accesible: cae al por defecto y el log avisa (`SB_CALENDAR_ID`). |
| `SB_BIZ_NAME` | `PROP_KEY.bizName` (`Code.gs` 202) | Marca que firma los correos del script (asunto y texto). | **No** — si falta, firma «SZ». | Interna | Mira el asunto del correo: debe llevar el nombre del negocio. |
| `SB_RESET_CODE` | `PROP_KEY.code` (`Code.gs` 203) | JSON `{hash, expiresAt, tries}` del código vigente. **La gestiona el propio sistema.** | Automática | Interna | No se toca a mano. |
| `SB_RESET_GRANTS` | `PROP_KEY.grants` (`Code.gs` 204) | JSON `{grantId: {hash, expiresAt, usedAt}}`. **La gestiona el propio sistema.** | Automática | Interna | No se toca a mano. |
| `SB_RESET_LIMITS` | `PROP_KEY.limits` (`Code.gs` 205) | JSON `{sends:[ms], lockedUntil:ms}` de rate-limiting. **La gestiona el propio sistema.** | Automática | Interna | No se toca a mano. |

> 🔑 **Confirmar en consola:** los valores reales de estas propiedades viven en
> tu cuenta de Google y **no están en el repositorio**. Antes de migrar de
> entorno, verifícalas en el editor de Apps Script.

### C.3 Valores fijos escritos en el código (no son variables)

Estos valores **no se pueden cambiar sin editar `Code.gs`**. Es importante
saberlo al instalar en otro negocio:

| Valor | Ubicación | Uso | Configurable |
|---|---|---|---|
| `'America/Bogota'` | `appsscript.json` | Zona horaria del script | ✅ Sí, editando el manifiesto |
| `'BACKUP-PROYECTO'` y `'Backups'` | `Code.gs` (buscador de carpetas de Drive) | Carpetas de Drive para los respaldos | ❌ Hardcodeado |
| `'SZ'` (marca por defecto) | `App.jsx` (`BIZ_NAME`) y `Code.gs` (`BIZ_NAME_DEFAULT`) | Nombre con el que arranca la pestaña y con el que firman los correos **cuando no hay nada configurado** | ✅ Sí, sin editar código: `VITE_BIZ_NAME` (app) y `SB_BIZ_NAME` (correos). Es el **único** resto de marca escrita en el código |
| `'cejas'` (catálogo por defecto) | `src/catalogs.js` (`DEFAULT_CATALOG_KEY`) | Servicios con los que arranca el programa si nadie elige catálogo | ✅ Sí: `VITE_CATALOG` o `VITE_DEFAULT_SERVICES` |
| `'sb_c'`, `'sb_s'`, `'sb_a'`, `'sb_e'`, `'sz_opening_balance'` | `App.jsx` | Claves de `localStorage` (copia de trabajo offline; `sz_opening_balance` = caché local del saldo inicial, cuya fuente de verdad es la hoja **Config**) | ❌ Hardcodeado, pero **no es marca**: cada dominio tiene su propio `localStorage`, así que un cliente nuevo nunca las comparte con SZ |

> ✅ **El correo ya NO está escrito en el código.** Antes aparecía en tres
> sitios (`_sendReportEmail`, `sendWeeklyBackupEmail` y como respaldo del
> correo de restablecimiento); ahora los tres lo leen de propiedades de
> script: los códigos de recuperación usan `_authorizedEmail()` →
> `SB_AUTHORIZED_EMAIL` (lista), los reportes `_reportEmail()` →
> `SB_REPORT_EMAIL` si existe y si no `SB_AUTHORIZED_EMAIL`, y el respaldo
> semanal usa `_backupEmail()` → `SB_BACKUP_EMAIL` si existe, y si no,
> `SB_AUTHORIZED_EMAIL`. Ni `Code.gs` ni el repositorio contienen ninguna
> dirección de correo.

> 📌 **La dirección de correo no se reproduce aquí** por ser dato personal.
> Vive en tu cuenta de Google, en **⚙️ Propiedades del proyecto →
> Propiedades de script** de cada despliegue. Cambiarla no exige editar
> `Code.gs` ni volver a desplegar.

### C.4 Constantes de negocio

| Constante | Valor | Dónde | Significado |
|---|---|---|---|
| `TIME_SLOTS` | 07:00 → 20:30, cada 30 min | `helpers.js` 9–13 | Bloques de agenda |
| `CLOSING_TIME` | `21:00` | `helpers.js` 103 | Una cita no puede **terminar** después |
| `SERVICE_DURATION` | 60 min | `helpers.js` 15 | Duración por defecto sin dato |
| `safeDuration` | 15–480, defecto 60 | `Code.gs` 1041 | Recorte de duraciones (el frontend `svcDuration`, `helpers.js` 106, solo pone 60 si falta) |
| `DURATION_OPTIONS` | 30, 60, 90, 120, 150, 180 | `App.jsx` 237 | Opciones del selector |
| `CODE_TTL_MS` | 15 min | `Code.gs` 208 | Vigencia del código de reset |
| `GRANT_TTL_MS` | 10 min | `Code.gs` 209 | Vigencia de la autorización |
| `MAX_VERIFY_TRIES` | 5 | `Code.gs` 210 | Intentos de verificación |
| `LOCKOUT_MS` | 30 min | `Code.gs` 211 | Bloqueo tras agotar intentos |
| `MAX_SENDS` / `SEND_WINDOW_MS` | 3 / 1 h | `Code.gs` 212–213 | Códigos por ventana |
| `REPORT_EXPENSE_DETAIL_MAX` / `DETALLE_MAX` | 8 | `helpers.js` 764 / `Code.gs` 1852 | Umbral de detalle de gastos |
| `MAX_REPORT_EXPENSES` / `MAX_EXP` | 20 | `helpers.js` 757 / `Code.gs` 1857 | Tope de categorías en el reporte |
| `DEF_CATS` | 7 categorías | `App.jsx` 211 | Categorías de gasto por defecto |

---

## D. Google Apps Script desde cero

### D.1 Crear y asociar el proyecto

Hay **dos caminos**; el primero es el recomendado porque vincula el script a la
hoja automáticamente:

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva
   (p. ej. «SZ DB»).
2. Con la hoja abierta, ve a **Extensiones → Apps Script**.
3. Nombra el proyecto (p. ej. «SZ API»).

> 📌 **El script usa `SpreadsheetApp.getActiveSpreadsheet()`**, así que
> **necesita estar vinculado a la hoja**. Si creas el proyecto suelto en
> [script.google.com](https://script.google.com), tendrás que vincularlo después
> (*Recursos → Proyecto de Google Cloud Platform*) o el script no sabrá a qué
> hoja apuntar.

### D.2 Archivos que deben existir

| Archivo | Origen | Contenido |
|---|---|---|
| `Code.gs` | Pegar el contenido de `apps-script/Code.gs` | Toda la lógica (~2.340 líneas) |
| `appsscript.json` | Pegar el contenido de `apps-script/appsscript.json` | Manifiesto: zona horaria y scopes |

> 🔒 **`apps-script/` es solo local** (está en `.gitignore` y **no se sube
> a GitHub**): contiene el backend completo. Existe en tu disco y en
> Apps Script, no en el repo remoto. En un clone nuevo hay que copiar
> esa carpeta desde la plantilla (los tests la leen en local).

> 💡 El editor por defecto **no muestra el manifiesto**. Actívalo en
> **⚙️ → Mostrar archivo de manifiesto**.

### D.3 Manifiesto y permisos

`apps-script/appsscript.json` — **idéntico al manifiesto desplegado en
producción**:

```json
{
  "timeZone": "America/Bogota",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.scriptapp"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

**Para qué sirve cada scope:**

| Scope | Función de SZ que lo necesita |
|---|---|
| `spreadsheets` | Leer y escribir las 6 hojas |
| `calendar` | Crear, actualizar y borrar eventos de cita |
| `gmail.send` | `GmailApp.sendEmail` (reportes, respaldo semanal, código de reset) |
| `script.scriptapp` | `ScriptApp.newTrigger` / `deleteTrigger` (triggers automáticos) |
| `drive` | `DriveApp` para los respaldos diarios |
| `script.external_request` | `UrlFetchApp.fetch` (exportar la hoja a `.xlsx` para el adjunto) |
| `userinfo.email` / `userinfo.profile` | ⚠️ **No los usa `Code.gs`.** Viven en el manifiesto activo; quitarlos obligaría a reautorizar el script sin ningún beneficio, así que se dejan tal cual. |

> 🔑 **El bloque `webapp` es imprescindible.** `"access": "ANYONE_ANONYMOUS"`
> es lo que permite que la app de Vercel llame al script **sin sesión de
> Google**; sin él, la app se quedaría en «Modo sin conexión» para siempre.
> `"executeAs": "USER_DEPLOYING"` hace que el script corra con **tus**
> permisos, no con los del visitante.

> ✅ **Discrepancia corregida.** Existía un duplicado `appsscript.json.txt`
> con scopes distintos y **sin bloque `webapp`**. Se comparó contra el
> manifiesto realmente desplegado en producción y resultó ser **ese** el
> correcto: el duplicado se eliminó y `appsscript.json` se reescribió para
> que sea el archivo único y fiel a producción.
>
> ⚠️ **Por qué importaba:** `appsscript.json` declaraba `script.mail` en vez
> de `gmail.send` y carecía del bloque `webapp`. Copiar **ese** al editor de
> Apps Script habría dejado la app sin poder ser llamada desde Vercel.

### D.4 Zona horaria

`"timeZone": "America/Bogota"` es **crítico**: toda la lógica de fechas
(`_cleanDate`, `_fmtDayLabel`, los triggers a las 12:00 y 23:00) asume UTC-5.
Cambiarla desplazaría las citas y los reportes.

### D.5 Propiedades del script

En **⚙️ → Propiedades del proyecto → Propiedades de script**, agrega:

| Clave | Valor |
|---|---|
| `SB_SYNC_TOKEN` | Un texto **único y largo** (p. ej. 32+ caracteres aleatorios). El mismo que usarás en `VITE_TOKEN`. |
| `SB_AUTHORIZED_EMAIL` | **Obligatoria.** Correo(s) al que llega el **código de restablecimiento**. Acepta **varias direcciones separadas por coma** (p. ej. `tucuenta@gmail.com, clienta@gmail.com`): todas reciben el mismo código. |
| `SB_REPORT_EMAIL` | **Opcional.** Correo(s) de los **4 reportes automáticos**. Si quieres que los reportes vayan solo a la usuaria y los códigos a ti, ponla aquí. Varias direcciones con coma. Vacía → los reportes van a `SB_AUTHORIZED_EMAIL`. |
| `SB_BACKUP_EMAIL` | **Opcional.** Otro correo si quieres que la copia semanal de la hoja vaya a otro sitio (una gestoría, el correo personal del dueño…). Si la dejas vacía, el respaldo va a `SB_AUTHORIZED_EMAIL`. |
| `SB_CALENDAR_ID` | **Opcional.** Id de un **calendario secundario** de ESTA cuenta (Ajustes del calendario → *Integrar calendario* → *ID del calendario*) al que van las citas. Permite compartir ese calendario con la usuaria en **solo lectura**. Vacío → calendario por defecto. |
| `SB_BIZ_NAME` | Nombre del negocio **en los correos que envía el script** (asunto, cuerpo y tarjeta HTML del código de restablecimiento). No es secreto, pero vive aquí y no en el código: un cliente nuevo cambia de nombre sin editar `Code.gs`. Si falta → «SZ». |

> 🔑 **Nunca** escribas el token dentro de `Code.gs`: el repositorio es público.

### D.6 Preparar Calendar y Gmail

- **Calendar:** por defecto se usa el **calendario por defecto** de la
  cuenta. Con la propiedad opcional **`SB_CALENDAR_ID`** las citas van a un
  **calendario secundario** de esa misma cuenta (p. ej. «Citas <negocio>»),
  que puedes compartir con la usuaria en **solo lectura** desde
  *calendar.google.com → Ajustes del calendario → Compartir con personas con
  derechos específicos → «Ver todos los detalles»*. Así ella ve las citas en
  su celular sin poder borrarlas ni ver tu calendario personal. Si el id falta
  o no es accesible, se sigue usando el calendario por defecto (y el log
  avisa). Los eventos se crean con el color `MAUVE` (`Code.gs`).
  > ⚠️ **El calendario debe ser de ESTA cuenta** (la del proyecto). Si en su
  > lugar compartes a la cuenta del proyecto un calendario que vive en otra
  > cuenta, el permiso debe ser **«Realizar cambios y ver los detalles de
  > todos los eventos»**: con **«Ver los detalles»** (solo lectura) el
  > calendario **se ve**, pero Google **no deja crear, actualizar ni borrar**
  > eventos — y su error llega disfrazado de «No existe o se eliminó el
  > evento del calendario». Es exactamente el fallo que produjo los avisos
  > de borrado fallido del 24/10/2026 (corregido ese mismo día: `deleteCalEvent`
  > ahora verifica si el evento sigue ahí y explica el permiso).
  > 📱 **En el iPhone el calendario compartido no aparece solo** (pasó en
  > la práctica): la usuaria debe activarlo. Con la **app de Google
  > Calendar**: *⚙️ Ajustes → su cuenta → interruptor*. Con el
  > **Calendario de Apple** (su cuenta Gmail agregada): abrir
  > **`calendar.google.com/calendar/syncselect`** en Safari con su sesión,
  > marcar el calendario y **Guardar** — sin ese paso no sale.
- **Validar que `SB_CALENDAR_ID` quedó bien:** ejecuta la función
  **`pruebaCalendario()`** desde el editor de Apps Script (no usa token,
  hoja ni lock: solo escribe en *Registro de ejecuciones → Registros*) y
  mira las líneas `cal =` y `escr =` (la prueba de escritura crea un evento
  de 5 min titulado «⚙️ pruebaCalendario (se borra solo)» y lo borra en el
  mismo segundo):
  - `cal = OK → Citas <negocio>` → el id apunta al calendario correcto.
  - `escr = OK → …permiso de escritura correcto` → crear y borrar
    funcionan de verdad.
  - `escr = ERROR → …` → el calendario **no se puede escribir**: casi
    siempre el permiso de uso compartido; pide
    **«Realizar cambios y ver los detalles de todos los eventos»**.
  - `cal = NULL (no accesible → se usará el por defecto)` → el id está mal
    copiado o es de otra cuenta (Google Calendar sigue funcionando, pero
    en el calendario por defecto).
  - `id = (sin SB_CALENDAR_ID)` → la propiedad no existe todavía.
  - `cal = ERROR → <motivo>` → CalendarApp rechazó la llamada.
- **Gmail:** se usa la cuenta que ejecuta el script (la **del proyecto** si
  la creaste dedicada: los correos salen «desde» esa dirección). No requiere
  configuración adicional, pero sí el scope `script.mail`.

### D.7 Autorizar permisos

1. Ejecuta cualquier función (por ejemplo `initSheets` o simplemente abre la app
   y haz un GET).
2. Google mostrará la pantalla de consentimiento: acepta **Sheets, Calendar,
   Gmail y Drive**.

> 🔑 **Confirmar en consola:** si el proyecto de Google Cloud está en modo
> «prueba», solo tú puedes usarlo. Para que «Cualquier usuario» funcione, el
> proyecto debe estar verificado (o al menos el app de OAuth publicado). Esto
> depende de tu configuración de Google Cloud y **no se puede comprobar desde
> el repositorio**.

### D.8 Publicar como aplicación web

**Implementar → Nueva implementación → Aplicación web**:

| Opción | Valor | Por qué |
|---|---|---|
| **Descripción** | «SZ API v1» | Para identificarla |
| **Ejecutar como** | **Yo** (`USER_DEPLOYING`) | El script accede a **tu** hoja, tu calendario y tu Gmail. Si eligieras «Usuario que accede», cada visitante necesitaría acceso a tus datos. |
| **Quién tiene acceso** | **Cualquier usuario** | El frontend no tiene sesión de Google; se autentica solo con el token. |

**«Ejecutar como: Yo»** significa que **toda** la ejecución ocurre con tus
credenciales: no hay aislamiento entre usuarios, porque SZ **no tiene usuarios**.
Cualquier persona con la URL y el token actúa sobre tus datos. Por eso el token
es la única barrera (ver [sección G](#g-seguridad-y-recuperación)).

**«Quién tiene acceso: Cualquier usuario»** no significa que los datos sean
públicos: el endpoint exige el token en cada petición (`_checkToken`, `Code.gs`
241). Sin él responde «No autorizado». Pero sí significa que **cualquiera con la
URL puede intentar** llamarlo.

### D.9 Obtener la URL para el frontend

Tras implementar, Google muestra la URL:

```
https://script.google.com/macros/s/TU_ID_DE_IMPLEMENTACION/exec
```

Ese valor es el de **`VITE_SCRIPT_URL`**.

### D.10 Nueva versión al actualizar el código

Cada vez que cambies `Code.gs`:

**Implementar → Gestionar implementaciones → (editar) → Nueva versión → Implementar**

> 🚨 **NUNCA uses «Nueva implementación».** Crearía un Web App **distinto** con
> una URL `/macros/u/N/s/…/exec` **nueva**, lo que **rompería**
> `VITE_SCRIPT_URL` en Vercel y dejaría la app sin conexión hasta que
> actualices la variable **y** redespliegues. Usa siempre «Nueva versión» sobre
> la implementación existente: la URL `/macros/s/…` **se conserva**.

### D.11 Comprobar que el frontend usa el backend correcto

1. Abre la app → el header debe mostrar **«✓ Sincronizado»**.
2. Crea una clienta de prueba → debe aparecer en la hoja **Clientes**.
3. En el editor de Apps Script, **Registros de ejecución** debe mostrar la
   petición.
4. Si la app dice «No autorizado», la URL es correcta pero el token no coincide.
5. Si dice «HTTP 404», la implementación fue reemplazada por una nueva.

---

## E. Google Sheets y Google Calendar

### E.1 Estructura de las hojas

`initSheets()` (`Code.gs` 2182) **crea automáticamente** las 6 hojas que falten.
Cada hoja tiene una fila de encabezados en español (`HEADERS_ES`, `Code.gs` 44–53)
y **todas las celdas se guardan como texto** (`setNumberFormat('@')`).

#### `Clientes` — 4 columnas

| # | Encabezado | Clave JS | Notas |
|---|---|---|---|
| A | ID | `id` | Identificador único |
| B | Nombre | `name` | |
| C | Celular | `phone` | |
| D | Fecha Registro | `createdAt` | |

#### `Servicios` — 4 columnas

| # | Encabezado | Clave JS | Notas |
|---|---|---|---|
| A | ID | `id` | |
| B | Nombre | `name` | **Puede contener comas** |
| C | Precio | `price` | |
| D | Duración (min) | `duration` | 15–480 |

#### `Citas` — 20 columnas

| # | Encabezado | Clave JS |
|---|---|---|
| A | ID | `id` |
| B | ID Cliente | `clientId` |
| C | Nombre Cliente | `clientName` |
| D | Celular | `clientPhone` |
| E | IDs Servicios | `serviceIds` (CSV) |
| F | Nombres Servicios | `serviceNames` (CSV, **snapshot**) |
| G | Precio Servicios | `servicePrice` |
| H | Precios x Servicio | `servicePrices` (JSON `{id:precio}`) |
| I | Domicilio | `domicilio` |
| J | Precio Domicilio | `domicilioPrice` |
| K | Total | `totalPrice` |
| L | Dirección | `address` |
| M | Fecha | `date` (`YYYY-MM-DD`) |
| N | Hora | `time` (`HH:MM`) |
| O | Fecha Creación | `createdAt` |
| P | Evento Creado | `calendarCreated` |
| Q | ID Evento Calendar | `calendarEventId` |
| R | Completada | `completed` (`true`/`false`/`noshow`) |
| S | Duración (min) | `duration` |
| T | Método de pago | `paymentMethod` | Valores actuales: `Efectivo` / `Nequi` / `Daviplata` / `Bancolombia` (`PAYMENT_METHODS` en `helpers.js` ≡ `PAY_METHODS` en `Code.gs`, mismo orden). Heredado (solo lectura): `Transferencia` (`LEGACY_*`) — las citas viejas lo conservan, se cuentan en su renglón y en el total de **Transferencias**, pero ya no se puede elegir; vacío → «Sin método» |

#### `Gastos` — 5 columnas

| # | Encabezado | Clave JS |
|---|---|---|
| A | ID | `id` |
| B | Descripción | `description` |
| C | Monto | `amount` |
| D | Categoría | `category` |
| E | Fecha | `date` |

#### `HistorialPrecios` — 4 columnas

| # | Encabezado | Clave JS |
|---|---|---|
| A | ID Servicio | `serviceId` |
| B | Nombre Servicio | `serviceName` |
| C | Precio | `price` |
| D | Fecha Cambio | `changedAt` |

#### `Config` — clave/valor (parámetros del negocio)

| # | Encabezado | Contenido |
|---|---|---|
| A | Clave | `opening_balance` (saldo inicial) |
| B | Valor | Importe ≥ 0 (número) |
| C | Actualizado | Marca ISO 8601 del último cambio |

- **No usa `writeSheet`**: la leen/escriben `_readConfig` / `_writeConfig`
  (`Code.gs`), que solo tocan la fila de la clave. Por eso **sí se puede
  editar la celda a mano** en el Google Sheet (excepción a E.2).
- `doGet` la devuelve como `data.config`; el frontend la relee en cada
  refresco (≤30 s), así que un cambio —desde Ajustes o editando la celda
  directo en la hoja— se propaga a todos los dispositivos.
- No está en `JS_KEYS` (`readSheet` no la toca), y **se vacía con el reset**:
  `_resetData` la limpia hasta la cabecera, porque resetear es eliminar todo
  (el saldo inicial vuelve a 0).

### E.2 ⚠️ `writeSheet` reescribe la hoja completa

`writeSheet` (`Code.gs` 2278) hace `sh.clearContents()` y **reescribe encabezados
y todas las filas** en cada guardado. Consecuencias prácticas:

- **No edites las hojas a mano** mientras la app esté en uso: esas filas se
  pierden en el siguiente guardado. **Excepción: la hoja `Config`** (clave/valor)
  sí está pensada para edición manual (véase arriba).
- Si una hoja tiene **más columnas** de las esperadas, `readSheet` las ignora y
  avisa por consola (`Code.gs`, `readSheet`).
- Si tiene **menos**, los campos faltantes llegan como `''` (mismo `readSheet`).
- Las filas **sin ID en la columna A** se descartan al leer (idem).

### E.3 Formato de fechas, hora y moneda

| Dato | Formato | Ejemplo |
|---|---|---|
| Fecha de cita/gasto | `YYYY-MM-DD` | `2026-10-08` |
| Hora | `HH:MM` | `09:30` |
| Fecha de creación | `YYYY-MM-DDTHH:mm:ss` **local** (sin `Z`) | `2026-10-07T10:00:00` |
| Zona horaria | `America/Bogota` (UTC-5) | — |
| Moneda | Numérico, formato visual `$120.000` (locale `es-CO`) | — |

> `localNowISO` (`helpers.js` 33) existe precisamente para **no** usar
> `toISOString()` (que devuelve UTC y desplaza las horas en Colombia).

> `cellStr` (`Code.gs` 2288) normaliza al leer: si Sheets devuelve un `Date`, lo
> convierte a `YYYY-MM-DD`; si devuelve un número entre 0 y 1, lo interpreta como
> hora y lo convierte a `HH:MM`.

### E.4 Google Calendar: crear, actualizar y borrar

| Operación | Función | Comportamiento |
|---|---|---|
| **Crear** | `createCalEvent` (`Code.gs` 944) | Crea el evento en el calendario de **`SB_CALENDAR_ID`** si está configurada (y ese calendario es accesible); si no, en el **por defecto**. Color `MAUVE`, sin invitaciones. Devuelve `{ok, eventId}` o `{ok:false, error}`. |
| **Actualizar** | `updateCalEvent` (`Code.gs` 975) | Usa **solo el id que trae la cita** (busca primero en el calendario de `SB_CALENDAR_ID` y luego en el resto). Nunca crea eventos. Comprueba **después** de escribir que Calendar aplicó la hora (tolerancia 1 s) y si no, devuelve `ok:false` con código `not_applied`. |
| **Borrar** | `deleteCalEvent` (`Code.gs` 1029) | Usa solo el id (misma búsqueda que actualizar). Si el evento ya no existe, devuelve `ok:true, alreadyGone:true` (**idempotente**). Nunca barre el calendario. |

**Título y descripción** (`calTitle_` / `calDescription_`, `Code.gs` 958–972):

- Título: `✨ <servicios> — <cliente>`
- Descripción: cliente, celular, servicios, total y, si es a domicilio, el
  valor y la dirección.

### E.5 ¿Y si la sincronización falla?

**No existe transaccionalidad entre Sheets y Calendar.** SZ aborda el problema
así:

- **Al eliminar una cita** (`App.jsx` `deleteAppt`, 479–511): primero se borra
  la cita **esperando** la confirmación del servidor; después se borra el evento
  con **su** id y se comprueba la respuesta. Si el borrado del evento falla, la
  app **avisa** y ofrece un **reintento**. Si el reintento también falla,
  muestra el **ID del evento** para que lo borres a mano en Google Calendar.
- **Al editar**, si Calendar no aplicó el cambio de hora, el backend devuelve
  un error y la app no comunica el éxito.
- **Al restablecer**, los eventos se borran **desde el servidor** dentro de la
  operación ya autorizada (`_resetData`, `Code.gs` 576); el frontend no
  borra nada antes de autorizar.
- **Al fallar un guardado** (`saveData` → `sync`, `App.jsx`): la app mantiene
  el estado optimista y muestra la **franja roja «⚠️ No se pudo guardar»** con
  botón **«↻ Reintentar guardar»** (`saveFailed` + `failedSaveRef`), que
  reenvía el mismo payload. Además `refresh()` **no** reemplaza el estado
  local mientras ese aviso esté activo (evita perder la mutación pendiente),
  y el retry limpia el aviso sin re-aplicar cambios optimistas.
  **La espera tiene tope:** `call()` aborta la petición a los **25 s**
  (`TIMEOUT_MS`, `src/api.js`) y devuelve *«Apps Script no respondió en
  25 s…»*, así que el spinner de guardado nunca se queda colgado aunque
  Google no responda (arranque en frío, límite de peticiones o una
  respuesta CORS sin cabeceras).
- **Las cargas se reintentan solas** (`callWithRetry`, `loadData`): un fallo
  transitorio (tope de 25 s o un 404 puntual mientras se actualiza el
  despliegue) se reintenta **una vez a los 4 s** antes de declarar el error —
  de ahí que el aviso «Modo sin conexión» sea hoy mucho más raro. Ese aviso,
  cuando sí aparece, trae un botón **✕** para cerrarlo (`errHidden`): no
  reaparece en los fallos siguientes del ciclo de 30 s y se rearma solo tras
  una reconexión exitosa.
- **Los guardados también se reintentan solos** (`sync`, `App.jsx`): un fallo
  transitorio se reenvía a los **4 s y a los 12 s** antes de mostrar la franja
  roja — la operadora no ve avisos por un simple arranque en frío. Es seguro
  porque las hojas se reemplazan con el mismo array y `createCalEvent`
  (`Code.gs`) crea con **protección anti-duplicados**: si el reintento
  encuentra un evento con el mismo título y hora (±1 min), lo devuelve
  (`alreadyExisted`) en vez de crear un segundo. El **mensaje** que ve la
  operadora ante un fallo real es simple y sin jerga; el detalle técnico
  queda en la consola del navegador (`console.warn`).

### E.6 Cómo verificar que citas y eventos corresponden

1. Crea una cita en la app.
2. Abre Google Calendar: debe aparecer `✨ <servicio> — <cliente>` a la hora
   correcta.
3. Comprueba en la hoja **Citas** que la columna **Q (ID Evento Calendar)** no
   está vacía.
4. Edita la hora de la cita → el evento se mueve (no se duplica).
5. Elimina la cita → el evento desaparece.
6. Si algo falla, revisa **Registros de ejecución** en Apps Script.

### E.7 Respaldos automáticos (Google Drive)

| Función | Frecuencia | Qué hace |
|---|---|---|
| `createDailyBackup` (`Code.gs` 1067) | Diario, 23:00 | Copia la hoja a `BACKUP-PROYECTO/Backups/<nombre de la hoja>/` como `<nombre> — Backup yyyy-MM-dd`. **No duplica** si ya existe hoy. Elimina los mayores de **30 días**. |
| `sendWeeklyBackupEmail` (`Code.gs` 1169) | Sábados, 9:00 | Busca el respaldo más reciente, lo exporta a `.xlsx` y lo envía por correo. Destinatario desde **`SB_BACKUP_EMAIL`** si existe y si no desde `SB_AUTHORIZED_EMAIL`; si faltan las dos, se omite y queda aviso en el log. |

**Instalación (una sola vez):**

```
setupDailyBackupTrigger()     → trigger diario a las 23:00
setupWeeklyEmailTrigger()     → trigger los sábados a las 9:00
```

### E.8 Reportes automáticos por correo

`setupAllReportTriggers()` (`Code.gs` 2108) instala **4 triggers**, todos a las
**12:00** (hora del script):

| Función | Dispara | Período | Guard |
|---|---|---|---|
| `sendDailyReportEmail` | Todos los días | Hoy | — |
| `sendWeeklyReportEmail` | Domingos | Lun–Dom de la semana en curso | Si hoy no es domingo, sale sin enviar |
| `sendMonthlyReportEmail` | Todos los días | El mes en curso | Si hoy no es el último día del mes, sale sin enviar |
| `sendYearlyReportEmail` | Todos los días | 1 ene – 31 dic del año en curso | Si hoy no es 31 de diciembre, sale sin enviar |

> Los dos últimos disparan **a diario** porque **Apps Script no tiene trigger
> «último día del mes» ni «último día del año»**: la función misma decide no
> enviar. Ver `SKIP reporte mensual/anual…` en los registros es **normal**.

El correo incluye un **adjunto `.xlsx`** generado en el momento. Si la
generación falla, **el correo se envía igual, sin adjunto**, y el cuerpo HTML
muestra un aviso. El texto plano nunca cambia (para que coincida con el
WhatsApp del admin).

> 📬 **A quién llegan:** a `SB_REPORT_EMAIL` si existe (varias direcciones
> separadas por coma), y si no a `SB_AUTHORIZED_EMAIL`. Si faltan las dos, el
> reporte se omite y queda aviso en el log. Ninguna acción pública cambia ese
> destinatario.

### E.8b El botón «📧 Enviar por correo» (reporte manual)

En **Reportes**, la dueña puede mandar el mismo correo a cualquier dirección
que escriba. Arquitectura (fruto de cinco rondas de producción del 24/10):

- **La app solo envía el período** (`{action:'sendReportEmailNow', to,
  period}`) — día, mes, año o rango, validado con formato estricto en
  `_sanitizeReportPeriod`. **El texto del reporte NUNCA cruza la red**
  (Apps Script decodifica mal los emojis de 4 bytes del cuerpo del POST;
  por eso las cinco rondas: el fix final fue no transportar texto).
- **El backend construye el correo con la MISMA maquinaria de los
  triggers**: `_sendReportTo` es el núcleo compartido (`kind='MANUAL'`,
  asunto `[REPORTE MANUAL] Actividad - <rótulo> (<fecha>)`), incluido el
  **Excel adjunto** generado desde la hoja (`_buildReportXlsx`).
- **Copia SIEMPRE** a `_reportEmail()` vía `cc`; sin configuración, el
  envío sale igual (aviso en el log, `cc:''` en la respuesta).
- **Rieles**: un solo destinatario con dominio con punto (el «a@b» se
  detecta antes de que Gmail conteste «Invalid To header»); períodos
  estrictos; el rechazo crudo de Gmail se traduce a lenguaje simple.

### E.9 Los 6 disparadores, de un vistazo

Es **lo que debe aparecer** en el panel **Activadores** («Disparadores») del
editor de Apps Script, tras ejecutar los tres `setup*`:

| # | Disparador | Cuándo | Qué hace | **A quién llega** | **Variable** | Se instala con |
|---:|---|---|---|---|---|---|
| 1 | `sendDailyReportEmail` | Diario, 12:00 | Reporte de **hoy** con `.xlsx` adjunto | **La usuaria** | `SB_REPORT_EMAIL` (si falta → `SB_AUTHORIZED_EMAIL`) | `setupAllReportTriggers()` |
| 2 | `sendWeeklyReportEmail` | Domingos, 12:00 | Lun–Dom de la semana en curso | **La usuaria** | igual | `setupAllReportTriggers()` |
| 3 | `sendMonthlyReportEmail` | Dispara a diario, **envía solo el último día del mes** | El mes en curso | **La usuaria** | igual | `setupAllReportTriggers()` |
| 4 | `sendYearlyReportEmail` | Dispara a diario, **envía solo el 31 de diciembre** | 1 ene – 31 dic | **La usuaria** | igual | `setupAllReportTriggers()` |
| 5 | `createDailyBackup` | Diario, 23:00 | Copia `.xlsx` de la hoja a Drive (`BACKUP-PROYECTO/Backups/<hoja>/`, retención 30 días) | **Nadie por correo**: la copia vive en Drive | — | `setupDailyBackupTrigger()` |
| 6 | `sendWeeklyBackupEmail` | Sábados, 9:00 | Adjunta el respaldo **más reciente** | **El dueño del proyecto** | `SB_BACKUP_EMAIL` (si falta → `SB_AUTHORIZED_EMAIL`) | `setupWeeklyEmailTrigger()` |

Tres ideas que evitan sustos:

- **Los 4 reportes van a la usuaria; el respaldo semanal va a ti** (al dueño
  de la cuenta del proyecto). Los **códigos de restablecimiento no usan
  disparadores**: se piden desde la app.
- **`setupAllReportTriggers()` no instala los respaldos**: los de Drive y el
  correo del sábado se instalan con `setupDailyBackupTrigger()` y
  `setupWeeklyEmailTrigger()` (E.7). Sin el diario, el sábado falla con
  «Carpeta de backups no encontrada».
- **Los `setup*` son idempotentes** (borran los suyos antes de crearlos), así
  que ejecutarlos de nuevo no duplica disparadores. Si el panel muestra más
  de 6 o algún duplicado, bórralo a mano.
- Todos corren **como la cuenta del proyecto** y con la hora de
  `appsscript.json` (`America/Bogota`, ver D.4).

Verificación rápida: `createDailyBackup()` a mano → debe aparecer el archivo
de hoy en Drive; `sendDailyReportEmail()` a mano → debe llegar el correo con
el adjunto a `SB_REPORT_EMAIL`.

---

## F. Despliegue del frontend en Vercel

### F.1 Conectar GitHub

1. Sube el código a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project**.
3. Importa el repositorio.

### F.2 Configurar el proyecto

| Campo | Valor |
|---|---|
| **Framework Preset** | Vite (se detecta solo) |
| **Build Command** | `npm run build` (detectado de `package.json`) |
| **Output Directory** | `dist` (detectado) |
| **Install Command** | `npm install` (detectado) |

> 🔑 **Confirmar en consola:** no existe un `vercel.json` en el repositorio, así
> que la configuración es la que Vercel detecta por defecto. Verifícala en
> **Settings → General** de tu proyecto.

### F.3 Variables por entorno

En **Settings → Environment Variables**, define para cada entorno
(**Production**, **Preview**, **Development**):

| Variable | Production | Preview | Development |
|---|---|---|---|
| `VITE_SCRIPT_URL` | ✅ URL real | ⚠️ Ver F.4 | URL de prueba |
| `VITE_TOKEN` | ✅ Token real | ⚠️ Ver F.4 | Token de prueba |
| `VITE_BIZ_*` | según negocio | igual | igual |
| `VITE_ADMIN_WHATSAPP` | ✅ Número real | según necesidad | vacío |

> ⚠️ **Precaución con las variables públicas:** todas las `VITE_*` quedan en el
> bundle. No pongas allí ningún secreto que no quieras que sea visible para
> cualquiera que abra la app y mire el código fuente.

### F.4 Relación entre commits, despliegues y publicación

- Cada **push a `main`** genera un despliegue y **se publica automáticamente**.
- Cada **pull request** genera un despliegue de **Preview** con una URL propia.
- Los cambios de `VITE_*` **no se aplican** a un despliegue ya hecho: hay que
  volver a desplegar (**Redeploy**) para que se recuerden en el build.

> ⚠️ **Preview con variables de producción:** si en Preview usas la URL y el
> token reales, la Preview **escribe en la hoja de producción**. Para probar
> sin arriesgar datos, usa un Spreadsheet **de prueba** con su propio token.

### F.5 Cómo identificar una versión desplegueda

- En **Deployments** de Vercel: cada fila es un despliegue, con su commit y su
  rama. El marcado **«Ready»** + **Production** indica la versión activa.
- En la app: el código fuente del bundle (`dist/assets/index-*.js`) tiene un
  hash por build.

### F.6 Cómo comprobar una Preview antes de producción

1. Abre la URL de la Preview.
2. Comprueba que el header muestra «✓ Sincronizado».
3. Si muestra «Modo sin conexión», revisa que las variables de Preview estén
   bien y vuelve a desplegar.
4. Cuando esté bien, haz **Promote to Production** (o mergea la rama).

### F.7 Regresar a un despliegue anterior

Vercel permite **Redeploy** de cualquier despliegue anterior o
**Promote to Production** de uno más viejo:

1. **Deployments** → elige el despliegue correcto.
2. ⋯ → **Redeploy** (recrea el build) o **Promote to Production** (lo hace
   activo).

> 🔑 **Confirmar en consola:** la disponibilidad de estas opciones depende de tu
> plan de Vercel.

---

## G. Seguridad y recuperación

### G.1 Qué operaciones requieren autorización

| Operación | Autorización necesaria |
|---|---|
| Leer datos (`doGet`) | `SB_SYNC_TOKEN` |
| Guardar clientes/servicios/citas/gastos | `SB_SYNC_TOKEN` |
| Crear/actualizar/borrar evento de Calendar | `SB_SYNC_TOKEN` |
| **Borrar todo (restablecer)** | `SB_SYNC_TOKEN` **+** grant de un solo uso |

### G.2 Cómo funciona el restablecimiento

El token de sincronización **no es un secreto** (viaja en el bundle público).
Por eso el reset exige una **autorización temporal emitida por el servidor**
tras verificar al dueño por correo. Ver el comentario de cabecera del
restablecimiento en `Code.gs`.

**Tres pasos, todos explícitos:**

| Paso | Acción | Backend | Qué valida |
|---|---|---|---|
| 1 | Botón en Ajustes | `requestResetCode` (`_requestResetCode`, 293) | Rate-limiting: máx. **3** envíos por hora; tras agotarlos, bloqueo de **30 min**. Genera un código de **8 caracteres** (alfabeto sin `0/O/I/1`), guarda **solo su hash**, vigencia **15 min**. Lo envía **exclusivamente** al correo autorizado. **La respuesta siempre es idéntica** (no revela si el correo existe o si estás bloqueado). |
| 2 | El usuario teclea el código | `verifyResetCode` (`_verifyResetCode`, 403) | Normaliza el código (quita espacios y saltos de línea, mayúsculas). Compara **hashes** con comparación en **tiempo lineal** (`_secureEqual`). Máx. **5 intentos**; el código es de **un solo uso**. Si es válido, emite un **grant** (`grantId` + `grantSecret`), vigencia **10 min**, guardado **solo como hash**. |
| 3 | Se ejecuta el reset | `resetData` (`_resetData`, 457) | `_checkResetAuth` → `_consumeGrant` (270) exige el grant y lo **consume antes de escribir nada**. No se puede repetir. |

**Cómo detecta el backend una operación destructiva** (`_isDestructivePayload`,
255) — para que una sincronización normal nunca exija grant:

- `action === 'resetData'`, **o**
- `resetPriceHistory` truthy, **o**
- **más de una** colección definida entre `clients`, `services`, `appointments`,
  `expenses` (las syncs normales mandan **una sola**).

### G.3 Qué pasa si un fallo de red hace que el reset «no se confirme»

`resetAll` en `App.jsx` (414–456) contempla que la respuesta del servidor se
pierda **después** de ejecutar el reset. En vez de asumir, **relee la hoja** y
la compara con lo que se pidió borrar (`isResetOutcome`). Así:

- Si el servidor **sí** lo ejecutó → aplica el estado local y reporta éxito
  (`confirmado: true`).
- Si **no** → pide código nuevo e indica claramente que no se ejecutó.
- Si no se pudo comprobar → avisa de que hay que revisar la hoja.

### G.4 Riesgos de exponer secretos en el frontend

| Riesgo | Realidad en SZ |
|---|---|
| `VITE_TOKEN` es visible | **Sí, y no es evitable** con `VITE_*`. Por eso el mecanismo de reset **no** depende de él. |
| `VITE_ADMIN_WHATSAPP` es visible | **Sí**, dentro del bundle. No está en el repo ni en git, pero sí en la app desplegada. |
| Cualquiera con la URL puede llamar al endpoint | **Sí**, pero necesita el token. Sin él: «No autorizado». |
| Cualquiera puede borrar todo | **No.** Necesita además un grant de un solo uso emitido al correo del propietario. |

### G.5 Protección de datos y permisos de Google

- El script corre **como el propietario**: todo sucede con sus credenciales.
- Los scopes están declarados en `appsscript.json` (sección D.3).
- **Google Sheets no es una base de datos cifrada**: los datos están protegidos
  por los permisos del archivo. Revisa con quién lo has compartido.
- El código de restablecimiento se envía por **Gmail** (cifrado en tránsito y
  en reposo por Google).

### G.6 Qué respaldar y cómo

| Qué | Cómo | Frecuencia |
|---|---|---|
| **La hoja completa** | `createDailyBackup` (automático, 30 días en Drive) | Diaria |
| **Una copia por correo** | `sendWeeklyBackupEmail` (automático, sábados) | Semanal |
| **El código** | El repositorio de GitHub | Cada push |
| **Las propiedades del script** | ⚠️ **No se respaldan automáticamente.** Anota `SB_SYNC_TOKEN`, `SB_AUTHORIZED_EMAIL`, `SB_REPORT_EMAIL`, `SB_BACKUP_EMAIL`, `SB_CALENDAR_ID` y `SB_BIZ_NAME` en un lugar seguro (gestor de contraseñas). | Al crearlas y al cambiarlas |

### G.7 Procedimiento de restauración

**Restaurar la hoja desde un respaldo de Drive:**

1. Ve a Drive → `BACKUP-PROYECTO/Backups/<nombre de la hoja>/`.
2. Abre el respaldo de la fecha que necesites.
3. **Copia cada hoja** (Clientes, Servicios, Citas, Gastos, HistorialPrecios)
   a la hoja de producción, **reemplazando** el contenido.
4. ⚠️ Conserva los **encabezados** de la primera fila.
5. Abre la app y pulsa **↻** para recargar.

> 🚨 **No borres la hoja de producción ni crees una nueva:** el script está
> vinculado al archivo. Si lo haces, tendrás que volver a vincularlo y el
> respaldo automático apuntaría a otra carpeta.

**Restaurar el código:** haz *rollback* del commit en GitHub y deja que Vercel
redespliegue (o usa **Promote to Production**).

**Restaurar Calendar:** los eventos **no** se respaldan. Si se borraron, hay
que **recrear las citas** desde la hoja.

**Restaurar la configuración:** vuelve a entrar las propiedades del script
(sección C.2) y las variables de Vercel (sección F.3).

| Qué se restaura | Fuente | ¿Automático? |
|---|---|:---:|
| Código | Git / Vercel | ✅ |
| Datos (hoja) | Drive / correo | ✅ (respaldos) |
| Propiedades del script | Anotación manual | ❌ |
| Variables de Vercel | Consola de Vercel | ❌ |
| Eventos de Calendar | — | ❌ **No se respaldan** |

---

## H. Actualización y mantenimiento

### H.1 Flujo recomendado para un cambio

1. **Rama** aparte (`git checkout -b fix/…`).
2. **Modificar** el código.
3. **Ejecutar** `npm test`, `npm run lint`, `npm run build`.
4. **Pul request** → Vercel genera una **Preview**.
5. **Probar** la Preview.
6. **Merge a `main`** → Vercel despliega a producción.
7. Si el cambio tocó `Code.gs` → **pegar en Apps Script** y **Nueva versión**.

### H.2 Qué requiere actualizar Apps Script y qué solo Vercel

| Cambio en… | ¿Vercel? | ¿Apps Script? | ¿Nueva versión? | ¿Nuevos triggers? |
|---|:---:|:---:|:---:|:---:|
| `src/App.jsx` o `src/helpers.js` | ✅ | — | — | — |
| Variable `VITE_*` | ✅ (rebuild) | — | — | — |
| `apps-script/Code.gs` | — | ✅ | ✅ | Solo si cambian las funciones de trigger |
| `appsscript.json` | — | ✅ | ✅ | Puede pedir **reautorizar** |
| Propiedad del script | — | ✅ (consola) | — | — |

> 📌 **Regla práctica:** si el cambio solo toca `src/`, con hacer push basta.
> Si toca `Code.gs`, además hay que pegarlo y publicar la versión.

### H.3 Rollback

- **Frontend:** Vercel → **Deployments** → despliegue anterior →
  **Promote to Production**.
- **Backend:** Apps Script → **Implementar → Gestionar implementaciones** →
  la versión anterior ya no se puede «restaurar», así que guarda copias de tus
  `Code.gs` importantes en Git: **re-pegar** la versión anterior y **Nueva
  versión**.

### H.4 Lista de comprobación posterior al despliegue

- [ ] La app abre sin pantalla de error.
- [ ] El header muestra **«✓ Sincronizado»**.
- [ ] Se puede crear una cita nueva y aparece en **Sheets**.
- [ ] El evento aparece en **Calendar** con título y hora correctos.
- [ ] Se puede **editar** la cita y el evento **se mueve** (no se duplica).
- [ ] Se puede **eliminar** la cita y el evento **desaparece**.
- [ ] El botón **«💬 WhatsApp admin»** del reporte está activo.
- [ ] **«📊 Exportar Excel»** genera un `.xlsx` con las 3 hojas.
- [ ] Si tocaste reportes: ejecuta `sendDailyReportEmail()` a mano y revisa
      **Registros de ejecución**.
- [ ] Si tocaste triggers: comprueba en **⚙️ → Disparadores** que aparecen los
      esperados y **no hay duplicados**.

### H.5 Mantenimiento periódico

| Tarea | Frecuencia | Cómo |
|---|---|---|
| Revisar los respaldos de Drive | Mensual | Comprobar que hay archivos recientes en `BACKUP-PROYECTO/Backups/…` |
| Revisar los reportes por correo | Mensual | Confirmar que llegan y que el `.xlsx` no está vacío |
| Revisar **Registros de ejecución** | Mensual | Buscar `ERROR` o `❌` |
| Limpiar citas pasadas / gastos viejos | Según necesidad | ⚠️ A mano desde la app; **no** editando las hojas |
| Actualizar dependencias | Trimestral | `npm outdated` y pruebas antes de actualizar |
| Revisar los triggers | Trimestral | ⚙️ → Disparadores: sin duplicados ni huérfanos |
| Rotar `SB_SYNC_TOKEN` | Anual o ante sospecha | Cambiar la propiedad **y** `VITE_TOKEN` en Vercel, luego redeploy |

> 🚨 **Rotar el token implica dos pasos obligatorios:** (1) cambiar la propiedad
> en Apps Script y (2) cambiar `VITE_TOKEN` en Vercel **y redesplegar**. Si solo
> haces uno, **la app deja de funcionar** («No autorizado»).

---

> 📖 **Siguiente lectura:**
> [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md)
> para el detalle de las reglas de negocio, o
> [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md)
> para pruebas y diagnóstico.
