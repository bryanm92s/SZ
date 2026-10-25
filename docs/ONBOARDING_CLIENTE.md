# 🧬 Onboarding de un cliente nuevo

**Mismo programa, otro negocio.** Esta guía es la lista de pasos para llevar
este sistema a un cliente (una peluquería, un spa de uñas, otro estudio de
cejas…) **sin editar código**: la marca, el catálogo y toda la identidad
salen de variables de entorno y de propiedades de Apps Script.

> Si algo de esta guía choca con lo que ves en el código, **manda el
> código**. Esta guía se escribió a partir del código real y de los tests
> (`src/catalogs.test.js`, `src/backend.test.js`).

---

## 0. La idea en una frase

| Es la **plantilla** (igual para todos) | Es del **despliegue** (único por cliente) |
|---|---|
| El código (`src/`, `apps-script/`) y **todas las reglas de negocio** | **La cuenta de Google del proyecto** (una por cliente): Sheets, Calendar, Drive y Gmail |
| Los tests, la arquitectura, los reportes | Sus datos (clientes, citas, gastos) |
| El repositorio y el pipeline de build | Su nombre, emoji, logo, WhatsApp y catálogo |
| | Las variables en Vercel y las propiedades en Apps Script |

> 🔑 **Los datos nunca están en el repo.** Viven en Google Sheets. Por eso
> puedes tener 10 clientes con el mismo código y ninguno ve la información
> de otro.

### 📧 Una cuenta de Google por proyecto (modelo recomendado)

En vez de montar el despliegue sobre **la cuenta de la usuaria** —que un día
puede «depurar» Drive y borrarte la hoja o el script sin querer—, cada
proyecto se instala sobre **su propia cuenta** (p. ej. `proyectoSZ@gmail.com`,
`proyectoABC@gmail.com`), de la que **tú eres dueño**:

| Pieza | Vive en | Quién puede borrarla |
|---|---|---|
| Spreadsheet + Apps Script + respaldos de Drive | Cuenta del proyecto | Solo tú |
| Calendario «Citas \<negocio\>» | Cuenta del proyecto | Solo tú (la usuaria lo ve en **solo lectura**) |
| Correos que salen (reportes, códigos, respaldos) | Cuenta del proyecto (`GmailApp`) | — |
| Código en GitHub + deploy en Vercel | Tus cuentas | Solo tú |

**Y a la usuaria se le entregan sus datos por tres canales**, sin que necesite
acceso a la infraestructura:

- **Reportes automáticos** a su correo → propiedad `SB_REPORT_EMAIL`.
- **Respaldo semanal `.xlsx`** a su correo → propiedad `SB_BACKUP_EMAIL`.
- **Excel de respaldo completo** desde la pantalla de Ajustes, cuando quiera.

Además, el **código de restablecimiento** llega a `SB_AUTHORIZED_EMAIL`
(**lista**: la cuenta del proyecto **y** su correo, separados por coma).

> ⚠️ Cuenta dedicada implica: **2FA + teléfono de recuperación** en esa
> cuenta, contraseña en tu gestor de contraseñas, y **entrar de vez en
> cuando** (Google desactiva las cuentas inactivas).

### 🤖 O deja que el script haga los pasos contigo

`onboarding-cliente.ps1` recorre **esta misma guía** en modo asistido.
**No vive dentro de ningún repo** (por eso no aparece en el árbol del
README): está en la raíz del espacio de trabajo, junto a SZ y a los
clientes:

```text
C:\Users\root\Desktop\PROYECTOS GITHUB\
├── onboarding-cliente.ps1   ← el asistente (fuera de git)
├── SZ\                       ← la plantilla: de aquí copia
├── WXYZ\                     ← los clientes nacen al lado
└── <siguiente cliente>\
```

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\root\Desktop\PROYECTOS GITHUB\onboarding-cliente.ps1"
```

La plantilla la detecta solo (busca `.\SZ` junto al script). Si algún día
la mueves, se la dices: `-Fuente "C:\...\SZ"`. Y el destino por defecto
es `...\PROYECTOS GITHUB\<nombre>`; puedes forzarlo con `-Destino`.

**Y antes de copiar nada comprueba la plantilla:** si el
`apps-script/Code.gs` de SZ está desactualizado (le falta el backend del
botón «📧 Enviar por correo», el borrado de eventos clasificado, el
anti-duplicados o la prueba de escritura de `pruebaCalendario()`), lo
avisa con las piezas exactas que faltan y **no deja seguir**: un backend
viejo instalaría clientes con el botón de correo mudo y 11 tests en rojo.

**Lo que NO copia** (porque cada cliente es un mundo):

- `.git`, `node_modules`, `dist`, `coverage`, `.zcode`, `.agents` ni los
  `.env` — y tampoco `skills-lock.json` (tooling local del workspace).
- **`logo.png`** — el icono de SZ no es el del cliente. El script pregunta
  en el paso 0 por la ruta del logo; si no la das, deja el repo sin él y
  **quita del README la imagen rota** hasta que lo agregues.

**Lo que renombra solo** — que la documentación del repo nuevo hable del
repo nuevo: `README`, `SETUP` y los cuatro manuales pasan de «SZ» a
`<NOMBRE>`, incluido el `git clone .../<NOMBRE>.git`. Con tres excepciones
a propósito:

- `«SZ»`, `` `SZ` `` y `'SZ'` **no se tocan**: son el valor por defecto del
  código, que sigue siendo «SZ».
- `SZ-ROLES` tampoco (es el nombre de una carpeta).
- `ONBOARDING_CLIENTE.md` y `SESION_*.md` siguen hablando de la madre SZ:
  son historial y la guía para crear *otros* clientes.

| Tipo de paso | Quién | Qué pasa |
|---|---|---|
| **🤖 Automático** | El script | Copia la plantilla a la carpeta del cliente (sin `.git`, `node_modules`, `dist`, `.env` ni `logo.png`), renombra la marca en los docs, `git init` con historia propia, `package.json` → `name`, `.env`, tu `logo.png`, `CUSTOMIZACIONES.md`, remote `madre`, `npm install` + **377 pruebas** + build, y **genera un token nuevo** para `SB_SYNC_TOKEN` / `VITE_TOKEN` |
| **🧑 Manual** | Tú | Google, GitHub y Vercel: el script **imprime el paso completo** (con las rutas y valores ya rellenados) y espera tu respuesta |
| **✅ Verificación** | Tú | Los 13 chequeos de la fase D, uno por uno, con la causa probable si algo falla |

**Las tres respuestas que necesitas saber:**

- **S** → ya lo hice → seguimos con el siguiente paso.
- **N** → aún no → te **repite las instrucciones** y vuelve a preguntar.
- **X** → saltarlo por ahora → queda en la lista de *pendientes* del
  resumen final.

Además es **reanudable**: guarda el progreso en
`%USERPROFILE%\.sz-onboarding\<cliente>.json` (incluye el token). Al
relanzarlo con el mismo nombre te propone retomar desde donde ibas, y al
final puedes borrar ese archivo.

> ⚠️ El script **solo lee** de la carpeta de SZ: escribe únicamente en la
> carpeta del cliente y en su carpeta de estado local. La copia usa
> robocopy **sin `/MIR`**, así que nada se borra.
>
> 🔒 **`apps-script/` viaja en la copia pero no a GitHub:** el backend se
> copia a la carpeta del cliente (hace falta pegarlo en Apps Script y
> porque los tests lo leen en local), pero el `.gitignore` que también se
> copia lo excluye del commit: cada repo mantiene su backend fuera de
> GitHub.

---

## 1. Resumen: 5 artefactos por cliente

| # | Artefacto | Dónde se crea | Qué lo hace único |
|---|---|---|---|
| 1 | **Google Spreadsheet** | `sheets.google.com` con la **cuenta del proyecto** | Su base de datos |
| 2 | **Apps Script (Web App)** | `script.google.com` o *Extensiones → Apps Script* desde la hoja | `SB_SYNC_TOKEN` (nueva), `SB_AUTHORIZED_EMAIL` (lista), `SB_BIZ_NAME` y, opcionales, `SB_REPORT_EMAIL`, `SB_BACKUP_EMAIL`, `SB_CALENDAR_ID` |
| 3 | **Repo en GitHub** | `github.com` (tu misma cuenta, un repo por cliente) | Código + `package.json` `name` |
| 4 | **Proyecto en Vercel** | `vercel.com` | `VITE_SCRIPT_URL`, `VITE_TOKEN`, `VITE_BIZ_*`, `VITE_CATALOG`, `VITE_ADMIN_WHATSAPP` |
| 5 | **Triggers de Apps Script** | Editor → ⏰ | Reportes diario/semanal/mensual/anual y respaldos |
| 6 | **Calendario «Citas \<negocio\>»** | calendar.google.com (cuenta del proyecto) | Compartido con la usuaria en **solo lectura** → `SB_CALENDAR_ID` |

---

## 2. Fase A — Identidad (lo que se ve)

Todo esto se pone en **Vercel → Settings → Environment Variables**. Ninguno
requiere tocar el código.

| Variable | Qué es | Ejemplo |
|---|---|---|
| `VITE_BIZ_NAME` | Nombre del negocio (pestaña, encabezado, pie y mensajes) | `Uñas de Valentina` |
| `VITE_BIZ_SUBTITLE` | Subtítulo corto (`NOMBRE · SUBTITULO` en la pestaña) | `Spa de uñas` |
| `VITE_BIZ_EMOJI` | Emoji de marca: favicon, splash de carga, encabezado (si no hay logo), pie, título «Citas de Hoy» y cierre del WhatsApp | `💅` |
| `VITE_BIZ_LOGO` | URL **absoluta** del logo (opcional; sustituye al emoji) | `https://raw.githubusercontent.com/bryanm92s/LOGOS/main/LOGO-<CLIENTE>/logo.png` |
| `VITE_ADMIN_WHATSAPP` | Número del admin para el botón «💬 WhatsApp admin» | `573001234567` |
| `VITE_CATALOG` | Catálogo inicial: `cejas` \| `unas` \| `peluqueria` \| `barberia` \| `depilacion` \| `masajes` \| `estetica` \| `maquillaje` | `unas` |
| `VITE_DEFAULT_SERVICES` | Catálogo en JSON si no encaja en un preset | `[{"name":"Corte","price":45000,"duration":60}]` |

> ⚠️ **`VITE_BIZ_NAME` es obligatoria en un cliente nuevo.** Es el único
> resto de marca escrito en el código: si falta, la app se llama «SZ»
> (el despliegue original). Lo mismo aplica al `<title>` de `index.html`,
> que es solo el respaldo previo a React.

> 🖼️ **Logo:** `logo.png` (raíz del repo) es el icono que se sirve en
> `/logo.png` mientras no haya `VITE_BIZ_LOGO`. Si no quieres que al
> cliente le aparezca el logo original en el iPhone (`apple-touch-icon`),
> define `VITE_BIZ_LOGO` con la URL de **su** logo o reemplaza el archivo
> `logo.png` en su repo. El favicon de la pestaña sí se pinta solo, con
> `VITE_BIZ_EMOJI`.
>
> 🔓 **Repos privados → repo LOGOS público.** Si el repo del cliente es
> privado, una URL que apunte a **ese** repo deja de servir el logo.
> Sube el logo a [github.com/bryanm92s/LOGOS](https://github.com/bryanm92s/LOGOS)
> (público, con sus URLs raw listas en el README) y usa esa URL en
> `VITE_BIZ_LOGO`. El `logo.png` del build (raíz del repo) **no se
> afecta**: lo sirve Vercel, no GitHub.

**Catálogo — elige entre 8 categorías** (`src/catalogs.js`):

| Categoría (`VITE_CATALOG`) | Tipo de negocio | Serv. |
|---|---|:---:|
| `cejas` ← *defecto* | Cejas y pestañas | 9 |
| `unas` | Spa de uñas / nail bar | 11 |
| `peluqueria` | Peluquería dama y caballero | 10 |
| `barberia` | Barbería (corte masculino) | 10 |
| `depilacion` | Depilación con cera | 10 |
| `masajes` | Spa de masajes | 9 |
| `estetica` | Estética facial | 9 |
| `maquillaje` | Maquillaje profesional | 9 |

**Paso a paso (Vercel → Environment Variables):**

1. **Settings → Environment Variables** → `VITE_CATALOG` → valor: la
   clave exacta, en **minúsculas y sin tildes** (p. ej. `barberia`).
2. **Save** y luego **Deployments → ⋮ → Redeploy**: las `VITE_*` solo
   se aplican al compilar.
3. Abre la app **sin datos** (o haz un restablecimiento) y comprueba en
   ✂️ Servicios que aparecen los servicios de esa categoría.

Reglas que ya vienen resueltas:

- `VITE_DEFAULT_SERVICES='[…]'` → gana sobre `VITE_CATALOG`; úsalo si el
  negocio no encaja en ninguna de las 8.
- JSON roto o clave desconocida → **cae al preset `cejas` y la app arranca
  igual** (decisión de diseño: una variable mal escrita nunca tumbe el
  despliegue).
- Ojo: el catálogo solo puebla el **primer arranque** y el resultado de un
  **restablecimiento**. En cuanto hay datos, el catálogo real es el de
  Google Sheets / la app, y se edita desde la pantalla «Servicios».

**Y además, en Google** (fase B): la **propiedad `SB_BIZ_NAME`**. La app y
los correos son dos marcas distintas y cada una tiene su llave:

| Dónde se ve el nombre | Llave |
|---|---|
| Pestaña, encabezado, mensajes de WhatsApp, avisos de la app | `VITE_BIZ_NAME` (Vercel) |
| Correos que manda el backend: código de restablecimiento | `SB_BIZ_NAME` (propiedades de script) |
| Carpeta de respaldos en Drive | `BACKUP-PROYECTO` (fijo, sin marca) |

---

## 3. Fase B — Google del PROYECTO (cuenta dedicada)

Sigue [`SETUP.md`](../SETUP.md) pasos 1 a 3 y 6, pero **todo dentro de la
cuenta de Google del proyecto** (una por cliente; ver §0). Si todavía no
existe, créala antes: 2FA, tu teléfono de recuperación y la contraseña en el
gestor de contraseñas.

1. **Cuenta del proyecto.** Hoja, script, respaldos de Drive y calendario se
   crean **ahí**, nunca en la cuenta de la usuaria: así un «ordenamiento»
   de Drive suyo no puede borrar la infraestructura y tú conservas el
   soporte sin pedirle permisos. Ella recibe sus datos por
   `SB_REPORT_EMAIL` (reportes automáticos), `SB_BACKUP_EMAIL` (respaldo
   semanal) y el **📥 Excel de respaldo** de Ajustes.
2. **Spreadsheet nuevo** en esa cuenta → nómbralo con su negocio
   (p. ej. `Uñas DB`). Solo necesitas el ID de la URL.
3. **Apps Script nuevo**, pegar `apps-script/appsscript.json` y
   `apps-script/Code.gs`. (Lo más cómodo: desde el propio spreadsheet,
   *Extensiones → Apps Script*, así ya tiene acceso a la hoja.)
4. **Propiedades de script** (⚙️ → Propiedades del proyecto → Propiedades
   de script):

   | Propiedad | Valor | Nota |
   |---|---|---|
   | `SB_SYNC_TOKEN` | Token **nuevo**, largo y aleatorio | **Nunca** reutilices el de otro cliente; debe coincidir con `VITE_TOKEN` |
   | `SB_AUTHORIZED_EMAIL` | **Lista:** `cuenta.proyecto@gmail.com, usuaria@gmail.com` | Obligatoria: el código de restablecimiento llega a **las dos** (tú controlas el despliegue, ella tiene copia). Direcciones separadas por **coma**; solo se admiten las que traen `@` |
   | `SB_REPORT_EMAIL` | Correo **de la usuaria** (o los dos, con coma) | Opcional: aquí llegan los 4 reportes automáticos. Si falta → van a `SB_AUTHORIZED_EMAIL` |
   | `SB_BACKUP_EMAIL` | Otro correo (opcional) | Si quiere la **copia semanal de la hoja** en otro sitio (gestoría, correo personal…). Vacío → el respaldo va a `SB_AUTHORIZED_EMAIL` |
   | `SB_BIZ_NAME` | Nombre del negocio | Es el que firma los correos. Si falta → «SZ» |
   | `SB_CALENDAR_ID` | Id del calendario «Citas \<negocio\>» (paso 5) | Opcional: manda las citas a ese calendario secundario. Vacío → calendario por defecto |

5. **Calendario dedicado y compartido con la usuaria** (5 min, una vez):

   1. Con la cuenta del proyecto: **calendar.google.com → ➕ → Crear
      calendario** → nombre `Citas <negocio>`.
   2. **Ajustes del calendario → Integrar calendario → ID del calendario**
      → cópialo y pégalo en la propiedad **`SB_CALENDAR_ID`**.
   3. **Ajustes del calendario → Compartir con personas con derechos
      específicos** → correo de la usuaria → permiso **«Ver todos los
      detalles»** (solo lectura: **no** le des «Hacer cambios y gestionar
      eventos»).
   4. Ella lo agrega en el celular: *calendar.google.com → ⋮ → Ajustes →
      Añadir otro calendario → Suscribirse* (o en la app de Calendar:
      *Añadir → Suscribirse a calendario → pegar el ID*).
      > 📱 **Tip del iPhone (pasó en la práctica):** en el iPhone el
      > calendario compartido **no siempre aparece solo**. Si ella usa el
      > **Calendario de Apple** con su cuenta Gmail, que abra
      > **`calendar.google.com/calendar/syncselect`** en Safari (con esa
      > sesión), marque el calendario y **Guarde** — sin ese paso no sale.
      > Con la **app de Google Calendar** basta activarlo en
      > *⚙️ Ajustes → su cuenta*.
   5. **Valídelo en 5 s:** en el editor de Apps Script ejecuta la función
      **`pruebaCalendario()`** y mira *Registro de ejecuciones → Registros*:
      `cal = OK → Citas <negocio>` significa que el id apunta al calendario
      correcto; `cal = NULL (no accesible…)` significa que el id está mal
      copiado o es de otra cuenta; `id = (sin SB_CALENDAR_ID)` significa que
      la propiedad no existe todavía. La segunda línea, **`escr = OK`**, es
      el **permiso de escritura**: la prueba crea y borra un evento de 5 min
      por ti. `escr = ERROR` = la cuenta del proyecto solo puede leer: si
      el calendario lo creó otra cuenta, el permiso para la del proyecto
      debe ser «Realizar cambios y ver los detalles» (con solo lectura
      Google **no deja borrar** y su excepción llega disfrazada de «No
      existe o se eliminó el evento»).

   > Si algún día ella lo quita de su celular, se vuelve a agregar y no se
   > pierde ningún evento. Y un evento creado **antes** de poner
   > `SB_CALENDAR_ID` sigue localizable para editarlo o borrarlo.

6. **Desplegar como Web App** (*Implementar → Nueva implementación*):
   ejecutar como **Yo**, acceso **Cualquier usuario**. Copia la URL
   `…/exec` → esa va en `VITE_SCRIPT_URL`.
7. **Triggers** (una sola vez por cliente). Ejecuta estas **3 funciones** y
   comprueba que en **Activadores** queden **6 disparadores**:

   | Disparador | Cuándo | A quién llega | Variable |
   |---|---|---|---|
   | `sendDailyReportEmail` | diario, 12:00 | **la usuaria** | `SB_REPORT_EMAIL` (si falta → `SB_AUTHORIZED_EMAIL`) |
   | `sendWeeklyReportEmail` | domingos, 12:00 | **la usuaria** | igual |
   | `sendMonthlyReportEmail` | dispara a diario, envía el **último día del mes** | **la usuaria** | igual |
   | `sendYearlyReportEmail` | dispara a diario, envía el **31 de diciembre** | **la usuaria** | igual |
   | `createDailyBackup` | diario, 23:00 | **nadie por correo**: va a Drive (`BACKUP-PROYECTO/Backups/<hoja>/`) | — |
   | `sendWeeklyBackupEmail` | sábados, 9:00 | **el dueño del proyecto** | `SB_BACKUP_EMAIL` (si falta → `SB_AUTHORIZED_EMAIL`) |

   Las funciones que los instalan son `setupAllReportTriggers()` (los 4 de
   reportes), `setupDailyBackupTrigger()` (la copia diaria, que **crea las
   carpetas**) y `setupWeeklyEmailTrigger()` (el correo del sábado). Detalle
   en [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) **E.9**.
   > Sin el trigger diario, el correo del sábado falla con «Carpeta de
   > backups no encontrada». Los códigos de restablecimiento **no** usan
   > triggers: se piden desde la app.
8. **Zona horaria:** `appsscript.json` trae `America/Bogota`. Si el cliente
   está en otro huso, cámbialo **antes** de desplegar: toda la lógica de
   fechas asume UTC-5.

---

## 4. Fase C — Repo y Vercel

### Opción recomendada: copia de archivos (repos INDEPENDIENTES)

Cada cliente se lleva su repo con su **propia historia**, sin parentezco
con SZ. Es lo que quieres si cada negocio va a evolucionar por su lado.

```powershell
# Estás en la carpeta que CONTIENE a SZ (p. ej. C:\...\PROYECTOS GITHUB)

# 1. Copia TODO excepto .git, node_modules, dist… y SIN secretos ni el logo
#    de la plantilla (robocopy: código 0–7 = OK).
#    /XF .env es OBLIGATORIO: sin él, el repo del cliente arrancaría con el
#    token de SZ apuntando a la base de datos de SZ. Tampoco se hereda
#    logo.png (cada cliente tiene el suyo) ni .env.local.
#    apps-script/ SÍ se copia (los tests lo necesitan en local), pero el
#    .gitignore que viene con la copia lo excluye del commit: no va a GitHub.
robocopy "SZ" "nombre-del-cliente" /E /XD .git node_modules dist coverage .zcode /XF .env .env.local logo.png /NFL /NDL /NJH

# 2. Entra y crea una historia NUEVA (nada que ver con la de SZ)
cd nombre-del-cliente
git init -b main
#    Anota el punto de partida en el propio mensaje:
git add .
git commit -m "chore: base de nombre-del-cliente (copia de SZ @ $(git -C ..\SZ rev-parse --short HEAD))"

# 3. Identidad interna: package.json y package-lock.json → "name": <cliente>

# 4. TU entorno local (nada que ver con el de SZ): copia .env.example a .env
#    y rellena VITE_SCRIPT_URL y VITE_TOKEN con las del cliente (luego,
#    en Vercel, las mismas). Verifica con pruebas y build:
npm install
npm test      # debe pasar: 377 tests (o: npx vitest run --environment node)
npm run build

# 5. Crea el repo VACÍO en github.com y conecta
git remote add origin https://github.com/TU_USUARIO/nombre-del-cliente.git
git push -u origin main

# 6. (Muy recomendado) La madre queda como remote de SOLO LECTURA:
#    no sincroniza nada, solo te permite comparar y portar arreglos.
git remote add madre https://github.com/TU_USUARIO/SZ.git
git fetch madre
```

> ⚠️ **Windows + PowerShell (pasó en la práctica):** si `npm` revienta con
> *«No se puede cargar el archivo `C:\Program Files\nodejs\npm.ps1` porque
> la ejecución de scripts está deshabilitada»*, no es un fallo de Node:
> PowerShell bloquea los `.ps1`. Solución, **una de las dos**:
> ```powershell
> # a) Ajuste único y definitivo (estándar de quien programa en Windows)
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # → Y
>
> # b) Sin tocar nada: usar la variante de CMD
> npm.cmd install ; npm.cmd test ; npm.cmd run build
> ```
> Si el test responde *«Package jsdom installed, re-run the command to
> start»*, vuelve a lanzarlo: faltaba `jsdom` y acaba de instalarse.

> 📌 El paso 4 **no rompe la independencia**: `madre` es un remote de
> consulta. Tus `main` siguen separados; lo único que ganas es poder
> hacer `git diff`, `git log` y `cherry-pick` **contra** la plantilla
> cuando quieras portar algo.

### Opción alternativa: clone con historia compartida

```bash
git clone https://github.com/TU_USUARIO/SZ.git nombre-del-cliente
cd nombre-del-cliente
git remote set-url origin https://github.com/TU_USUARIO/nombre-del-cliente.git
npm install && npm test && npm run build
```

Los dos repos nacen con el **mismo ancestro**. Útil con pocos clientes y
una plantilla que cambia seguido; el costo es que terminas manejando un
montón de remotes y ramas, y es fácil sincronizar algo por accidente.

### Qué cambia en la práctica

| | Independientes (recomendada) | Historia compartida |
|---|---|---|
| Parentezco entre SZ y el cliente | **Ninguno** (dos raíces) | Mismo ancestro |
| ¿Un cambio de SZ llega solo a ABC? | **No** (tampoco en la otra) | **No** |
| `git log` / `git diff` entre proyectos | Solo con `remote add madre` | Nativo |
| Portar un arreglo | `fetch madre` + `cherry-pick`, o parche | `cherry-pick` |
| Riesgo principal | **Divergencia silenciosa** si no registras lo que personalizaste | Mezclar remotes/ramas sin querer |
| Ideal para | Muchos clientes, personalizaciones por cliente | Pocos clientes, plantilla viva |

### 🤔 ¿Y si SZ pide un cambio que ABC no quiere?

**No pasa nada.** Ningún cambio viaja solo: los dos repos son remotes
distintos y cada uno tiene su `main`. Lo único que cambia entre opciones
es **cuánto te cuesta portarlo cuando SÍ lo quieres en varios**.

| Situación | Qué se hace |
|---|---|
| SZ pide una regla nueva y ABC no la quiere | Se hace **solo en el repo de SZ**. ABC no se entera y no hay nada que resolver ✅ |
| ABC pide algo que SZ no quiere | Igual, al revés: solo en ABC ✅ |
| Bug de la plantilla (aplica a todos) | Se corrige **primero en la madre (SZ)** y se **porta** a los demás |
| Feature que sí le sirve a todos | Igual: madre → portar |

**Cómo portar** (en repos independientes), de mejor a peor:

```bash
# A) cherry-pick (cómodo cuando el contexto del archivo no cambió)
git remote add madre https://github.com/TU_USUARIO/SZ.git && git fetch madre
git cherry-pick <sha-del-fix>

# B) parche (funciona aunque las historias no tengan nada en común)
git -C ../SZ diff -- src/helpers.js > fix.patch
git apply fix.patch

# C) a mano: copiar SOLO los archivos que el cliente NO personalizó
```

Después, **siempre**: `npm test` (377 en verde) y el checklist de la
fase D.

> ⚠️ **La trampa real de los repos independientes no es git, es
> `App.jsx`** (~5.570 líneas). Si en ABC personalizaste esa pantalla y
> copias encima el `App.jsx` de SZ, **borras su personalización** y ni
> siquiera hay un conflicto de git que te avise. Por eso:
>
> 1. **Cada repo lleva su `CUSTOMIZACIONES.md`** (plantilla abajo) con
>    lo que difiere de la madre y por qué.
> 2. **Porta por parches**, nunca archivos enteros, cuando el cliente
>    tocó ese archivo.
> 3. **Cambio de cliente → su repo. Fix de plantilla → madre → portar.**
> 4. Los tests son la red de seguridad: si al portar algo se rompe,
>    `npm test` lo dice antes que el cliente.

```markdown
# CUSTOMIZACIONES.md — <cliente>
> Diferencias respecto a la plantilla (madre: SZ @ <commit>).

| Archivo | Qué cambió | Por qué | Fecha |
|---|---|---|---|
| src/App.jsx | Nuevo campo «nota de color» en la cita | Lo pidió la clienta | 2026-10-12 |
| apps-script/Code.gs | (nada) | — | — |
```

### Vercel

1. *New Project* → importa el repo nuevo.
2. **Antes de desplegar**, define las variables (fase A + las dos críticas):

   | Variable | Valor |
   |---|---|
   | `VITE_SCRIPT_URL` | URL `…/exec` del Apps Script **del cliente** |
   | `VITE_TOKEN` | Idéntica a `SB_SYNC_TOKEN` **de ese cliente** |
   | `VITE_BIZ_NAME` | Nombre del cliente (**obligatoria**) |
   | `VITE_CATALOG` / `VITE_DEFAULT_SERVICES` | Su actividad |
   | `VITE_BIZ_EMOJI`, `VITE_BIZ_SUBTITLE`, `VITE_BIZ_LOGO` | Su marca |
   | `VITE_ADMIN_WHATSAPP` | Su WhatsApp |

3. *Deploy*. Después, opcionalmente: dominio propio del cliente.

> ⚠️ **El error clásico:** importar el repo nuevo en Vercel y desplegar con
> las variables de SZ. El resultado es la app de un cliente apuntando a la
> base de datos de **otro**. Verifica `VITE_SCRIPT_URL` **y** `VITE_TOKEN`
> juntas, siempre.

---

## 5. Fase D — Verificación (5 minutos)

- [ ] La pestaña dice el nombre del cliente, el favicon es su emoji y el
      Panel dice «\<su emoji\> Citas de Hoy».
- [ ] Header en verde: **«✓ Sincronizado»**.
- [ ] En «Servicios» aparece el catálogo de su actividad.
- [ ] Creo una cliente de prueba → **aparece en el Google Sheets de la cuenta
      del proyecto** (no en la de la usuaria).
- [ ] Agenda una cita → **aparece en el calendario «Citas \<negocio\>»**
      (o en el por defecto si no configuraste `SB_CALENDAR_ID`), con el
      color correspondiente.
- [ ] Ese calendario está **compartido con la usuaria en solo lectura** y
      ella lo ve en su celular (sin poder editarlo).
- [ ] **Borro una cita de prueba** → su evento **desaparece** del calendario
      «Citas \<negocio\>» (`pruebaCalendario()` → `cal = OK` y `escr = OK`;
      con solo lectura Google no deja borrar).
- [ ] Su WhatsApp admin abre `wa.me` con su número (reporte).
- [ ] Correo de restablecimiento: pide código → llega a **TODAS** las
      direcciones de `SB_AUTHORIZED_EMAIL` (la cuenta del proyecto y la
      usuaria), con **su nombre**, nunca «SZ» → comprueba asunto, cuerpo y
      HTML.
- [ ] Reporte de prueba (`sendDailyReportEmail()` o
      `sendWeeklyReportEmail()`) → llega a **`SB_REPORT_EMAIL`** (su correo).
- [ ] Botón **«📧 Enviar por correo»** (vista *Reporte y Excel*) → llega a
      **mi** correo con los emojis y 📎 el Excel del período, también en el
      modo **RANGO** (asunto `[REPORTE MANUAL] …`, con copia a
      `SB_REPORT_EMAIL`).
- [ ] Ejecuté `createDailyBackup()` a mano → se creó
      `BACKUP-PROYECTO/Backups/…` en el **Drive de la cuenta del proyecto**.
- [ ] El repo de SZ y los datos de SZ **no** se tocaron (nada nuevo en su
      spreadsheet, ningún trigger extra).

---

## 6. Qué NO cambiar nunca

1. **La lógica de `Code.gs` y de `src/`.** Las reglas de negocio son el
   producto; si el cliente necesita una regla distinta, es una
   personalización, no un onboarding.
2. **Los tests.** `npm test` debe pasar siempre (377 tests). Si un cambio
   de cliente los rompe, el cambio estaba mal hecho.
3. **El token del cliente en el código.** Vive en `SB_SYNC_TOKEN`
   (servidor) y `VITE_TOKEN` (Vercel). El repo es público.
4. **`SB_AUTHORIZED_EMAIL`, `SB_REPORT_EMAIL` o `SB_BACKUP_EMAIL` con el
   correo de otro cliente** (o con el token de otro). Los reportes, los
   códigos y los respaldos de uno no pueden llegar a la bandeja de otro:
   cada proyecto tiene **su** cuenta de Google y **sus** propiedades.
5. **No pegues un `Code.gs` de otro cliente encima.** Usa el del repo
   (es único y no lleva datos); solo cambian las propiedades.
6. **No arrastres personalizaciones de un cliente a otro.** Si a SZ le
   agregaste un campo y a ABC no se lo pediste, ese cambio vive **solo**
   en el repo de SZ. La fuente de verdad de lo que difiere de la
   plantilla es el `CUSTOMIZACIONES.md` de cada repo.
7. **No reimplementes dos veces el mismo arreglo.** Si el fix se hizo en
   la madre, **pórtalo** (sección 4) en vez de resolverlo "a tu manera"
   en cada cliente: a la tercera versión ya nadie sabe cuál es la buena.

---

## 7. Textos que siguen mencionando el proyecto original

La **documentación** (`README.md`, `docs/*.md`, `SETUP.md`,
`Manual_Sistema_Gestion.docx`) está escrita para el despliegue original y
**no se genera por cliente**: se copia tal cual a cada repo.

- Para uso interno tuyo: no hace falta tocarla.
- Si quieres entregarle un manual al cliente, copia
  `docs/MANUAL_USUARIO.md` a un archivo aparte (p. ej.
  `docs/MANUAL_USUARIO_<cliente>.md`) y renombra con un reemplazo
  **controlado** (a mano o buscando `\bSZ\b` **solo** en ese archivo).
  > ⚠️ Nunca hagas «reemplazar todo SZ» sobre el repo entero: también
  > tocaría `package-lock.json`, los tests y `BIZ_NAME_DEFAULT = 'SZ'`,
  > que es justamente el valor por defecto que debe seguir existiendo.

Lo que **sí** quedó parametrizado y no requiere tocar nada:

| Qué | Dónde |
|---|---|
| Nombre en la app, mensajes y WhatsApp | `VITE_BIZ_NAME` / `VITE_BIZ_EMOJI` |
| Nombre en los correos del backend | `SB_BIZ_NAME` (`Code.gs` → `_bizName()`) |
| `<title>` de respaldo | lo sobrescribe `App.jsx` con `VITE_BIZ_NAME` |
| Catálogo inicial | `VITE_CATALOG` / `VITE_DEFAULT_SERVICES` (`src/catalogs.js`) |
| Comentarios internos del código | ya no nombran al negocio |

---

## 8. Si algo falla

| Síntoma | Causa probable |
|---|---|
| «Sin conexión» | `VITE_SCRIPT_URL` o `VITE_TOKEN` mal; o el Web App no está en «Cualquier usuario» |
| «Token de sincronización no configurado» | Falta `SB_SYNC_TOKEN` **en el servidor** (no en Vercel) |
| App dice «SZ» | Falta `VITE_BIZ_NAME` |
| El correo de restablecimiento dice «SZ» | Falta `SB_BIZ_NAME` |
| Llega correo de otro negocio | `SB_AUTHORIZED_EMAIL` / `SB_REPORT_EMAIL` mal copiadas (revisa que **ninguna** dirección sea de otro cliente) |
| El código de reset **no le llega a la usuaria** | Su correo no está en la **lista** `SB_AUTHORIZED_EMAIL` (separa las direcciones con **coma**) |
| Los reportes llegan a tu bandeja en vez de a la suya | Falta `SB_REPORT_EMAIL` (sin ella, los reportes van a `SB_AUTHORIZED_EMAIL`) |
| La cita **no aparece** en el calendario de la usuaria | Ejecuta **`pruebaCalendario()`** en el editor: si dice `NULL`, el id de `SB_CALENDAR_ID` no es de un calendario accesible de esa cuenta. Si dice `OK`, falta compartírselo a ella en **solo lectura** |
| El calendario compartido **no aparece en su iPhone** | No se activó en el teléfono: con la **app de Google Calendar**, ⚙️ Ajustes → su cuenta → interruptor; con el **Calendario de Apple**, abrir `calendar.google.com/calendar/syncselect` en Safari (con su sesión), marcar el calendario y **Guardar** |
| La cita **no se borra** del calendario | `pruebaCalendario()` → `escr = ERROR`: falta «Realizar cambios y ver los detalles» para la cuenta del proyecto (el de la usuaria se queda en solo lectura). Si el mensaje de Google sale en crudo, el `Code.gs` pegado es viejo |
| El botón «📧 Enviar por correo» dice «No se pudo enviar el correo» | El `Code.gs` pegado es viejo (falta `sendReportEmailNow`) → pega el actual del repo. Si **no ves el botón**, el frontend de Vercel es viejo → Redeploy |
| «Carpeta de backups no encontrada» | No se ejecutó `setupDailyBackupTrigger()` / `createDailyBackup()` |
| Las citas salen desfasadas | Zona horaria de `appsscript.json` ≠ UTC-5 |
| Sin reportes automáticos | Faltan `SB_REPORT_EMAIL` y `SB_AUTHORIZED_EMAIL`, o no corriste `setupAllReportTriggers()` |

Detalle y solución ampliada en [`SETUP.md`](../SETUP.md) (Solución de
problemas) y [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección F.

---

## 9. Checklist final del cliente

```text
[ ] Cuenta de Google del PROYECTO creada (2FA + recuperación en tu gestor)
[ ] Spreadsheet creado + Apps Script vinculado + manifiesto pegado
[ ] Code.gs pegado y desplegado como Web App (URL …/exec copiada)
[ ] Propiedades: SB_SYNC_TOKEN (nueva) · SB_AUTHORIZED_EMAIL (lista: proyecto + usuaria)
      · SB_BIZ_NAME · SB_REPORT_EMAIL (usuaria) · SB_BACKUP_EMAIL (opcional)
      · SB_CALENDAR_ID (opcional)
[ ] Calendario «Citas <negocio>» creado, con ID en SB_CALENDAR_ID y
      compartido con la usuaria en SOLO LECTURA
[ ] Triggers: reportes + backup diario + correo semanal
[ ] Repo nuevo en GitHub (historia propia, `madre` como remote de solo lectura)
[ ] `package.json` → "name" + `CUSTOMIZACIONES.md` creado
[ ] npm test en verde (377) + npm run build
[ ] Vercel: proyecto nuevo + 7 variables de la fase A + 2 críticas
[ ] Deploy → checklist de la sección 5 completo
[ ] Anotado en el gestor de contraseñas: cuenta del proyecto, token,
      propiedades de script y correos (proyecto / usuaria)
```

---

## 10. Apéndice — Orden real (así se ejecutó, con lo que de verdad salió)

Esta es la secuencia **tal como se hizo** la primera vez, con los tropiezos
reales incluidos. Sirve de runbook: cada bloque es exactamente lo que hay
que pegar.

### A.1 — Local + GitHub (≈20 min)

```powershell
# 0. Estar en la CARPETA PADRE de SZ
cd "C:\...\PROYECTOS GITHUB"      # Get-Location debe terminar en \PROYECTOS GITHUB

# 1. Copia (SZ solo se LEE; sin /MIR ni /PURGE a propósito)
robocopy "SZ" "NOMBRE" /E /XD .git node_modules dist /NFL /NDL /NJH
Test-Path "NOMBRE\src\App.jsx"    # True
Test-Path "NOMBRE\.git"           # False ← se copia SIN historial

# 2. Historia nueva
cd NOMBRE
git init -b main
git add .                         # warnings "LF → CRLF": normales en Windows
git commit -m "chore: base de NOMBRE (copia de SZ @ <sha>)"

# 3. Subir
git remote add origin https://github.com/TU_USUARIO/NOMBRE.git
git push -u origin main

# 4. La madre como remote de SOLO LECTURA
git remote add madre https://github.com/TU_USUARIO/SZ.git
git fetch madre
git remote -v                     # ✅ origin (NOMBRE) + madre (SZ)

# 5. Validar (ver aviso de PowerShell arriba, sección 4)
npm install
npm test        # ✅ 377 pruebas
npm run build   # ✅ built in ~3s

# 6. SZ intacto
cd ..\SZ
git status -sb                     # ## main...origin/main
git remote -v                      # solo origin = .../SZ.git
git --no-pager log --oneline -1    # el sha de la plantilla
```

### A.2 — Google (≈25 min) — el orden importa

> 🔑 **Todo con la cuenta de Google del PROYECTO abierta** (una por
> cliente), nunca con la de la usuaria ni con otra de las tuyas. Compruébalo
> arriba a la derecha antes del paso 1.

1. **Drive (cuenta del proyecto) → Nuevo → Google Sheets** → `NOMBRE DB`.
2. Desde esa hoja: **Extensiones → Apps Script** (queda vinculado, sin IDs).
3. ⚙️ → **Mostrar archivo de manifiesto** → pegar **todo**
   `apps-script/appsscript.json` → Guardar.
   > ⚠️ Sin `"access": "ANYONE_ANONYMOUS"` la app queda en «Modo sin
   > conexión». **Esta la olvida todo el mundo.**
4. Pegar **todo** `apps-script/Code.gs` → Guardar → nombrar el proyecto
   `NOMBRE API`.
5. ⚙️ → Propiedades del proyecto → **Propiedades de script** — *antes* de
   implementar:
   | `SB_SYNC_TOKEN` | token nuevo: `(New-Guid).ToString('N') + (New-Guid).ToString('N')` |
   | `SB_AUTHORIZED_EMAIL` | **lista**: `cuenta.proyecto@gmail.com, usuaria@gmail.com` (ambas reciben el código de reset) |
   | `SB_REPORT_EMAIL` | correo de la usuaria: aquí van los 4 reportes (opcional) |
   | `SB_BACKUP_EMAIL` | otro correo si la copia semanal va a otro sitio (opcional) |
   | `SB_BIZ_NAME` | nombre del negocio (firma los correos) |
   | `SB_CALENDAR_ID` | id del calendario «Citas NOMBRE» (paso 7; opcional) |
6. **Implementar → Nueva implementación → Aplicación web** →
   *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier usuario** →
   Implementar → autorizar permisos → **copiar URL `…/exec`**.
7. **Calendario:** calendar.google.com → ➕ **Crear calendario** →
   `Citas NOMBRE` → *Ajustes → Integrar calendario → ID del calendario* →
   pegarlo en `SB_CALENDAR_ID` → *Ajustes → Compartir* con la usuaria en
   **«Ver todos los detalles»** (solo lectura).
8. (Después, no bloquea) `setupAllReportTriggers()` ·
   `setupDailyBackupTrigger()` · `setupWeeklyEmailTrigger()`.

### A.3 — Vercel (≈10 min)

1. *New Project* → importa el repo.
2. *Environment Variables* → crear: `VITE_SCRIPT_URL` (URL del A.2.6),
   `VITE_TOKEN` (**idéntica** a `SB_SYNC_TOKEN`), `VITE_BIZ_NAME`,
   `VITE_CATALOG` (**una de las 8 categorías** de §2; si se omite, queda
   `cejas`), `VITE_BIZ_EMOJI`, `VITE_BIZ_SUBTITLE`,
   `VITE_ADMIN_WHATSAPP` y — si hay logo — `VITE_BIZ_LOGO`.
3. *Build Settings* lo deja Vercel: Vite, `npm run build`, salida `dist`.
4. **Deploy**.
5. **Prueba:** «✓ Sincronizado» → cliente de prueba en la hoja → cita en el
   **calendario «Citas NOMBRE»** (visible en el celular de la usuaria) →
   correo de restablecimiento en **la cuenta del proyecto y en la de ella**.

### A.4 — Errores que SÍ salieron en la práctica

| Qué salió | Por qué | Qué se hizo |
|---|---|---|
| `fatal: not a git repository` al correr `git rev-parse --show-toplevel` | estaba escrito **antes** de `git init` | no era error: verificar la ruta con `Get-Location` **antes**, y `rev-parse` solo **después** del init |
| `npm.ps1 … la ejecución de scripts está deshabilitada` | PowerShell ExecutionPolicy bloquea los `.ps1` de npm | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` **o** usar `npm.cmd …` (ver sección 4) |
| `Package jsdom installed, re-run the command to start` | faltaba `jsdom` al primer `npm test` | volver a lanzar el test |
| `warning: LF will be replaced by CRLF` | `core.autocrlf=true` en Windows | normal; no afecta |
| La app dice «Configura `VITE_SCRIPT_URL` y `VITE_TOKEN`» | faltan las dos o el deploy es anterior a las variables | pegar **ambas** y **Redeploy** |
| La app muestra **emoji** en el encabezado en vez del logo | faltaba `VITE_BIZ_LOGO` | crearla y **Redeploy** |
| Tras editar `Code.gs`, sigue pasando lo viejo | Apps Script corre la versión anterior | *Implementar → Gestionar implementaciones → ✏️ → **Nueva versión*** |

> 🔑 **Las dos «red» del despliegue**: las `VITE_*` se **incrustan al
> compilar** → toda variable nueva exige **Redeploy**; y las propiedades
> `SB_*` se leen **en cada llamada** → no necesitan redeploy, pero tampoco
> existen en Vercel.

### A.5 — Lo único que es de verdad NO negociable

```
Google (URL /exec + SB_SYNC_TOKEN)  →  Vercel (VITE_SCRIPT_URL + VITE_TOKEN)  →  Deploy  →  Probar
```

Ese tramo va en ese orden. Todo lo demás — GitHub primero o Google
primero, triggers antes o después, logo al final — **es intercambiable**.
