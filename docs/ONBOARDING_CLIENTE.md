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

| Es la **plantilla** (igual para todos) | Es del **cliente** (único por despliegue) |
|---|---|
| El código (`src/`, `apps-script/`) y **todas las reglas de negocio** | Su cuenta de Google: Sheets, Calendar, Drive y Gmail |
| Los tests, la arquitectura, los reportes | Sus datos (clientes, citas, gastos) |
| El repositorio y el pipeline de build | Su nombre, emoji, logo, WhatsApp y catálogo |
| | Sus variables en Vercel y sus propiedades en Apps Script |

> 🔑 **Los datos nunca están en el repo.** Viven en Google Sheets. Por eso
> puedes tener 10 clientes con el mismo código y ninguno ve la información
> de otro.

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

**Lo que NO copia** (porque cada cliente es un mundo):

- `.git`, `node_modules`, `dist`, `coverage`, `.zcode` ni los `.env`.
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
| **🤖 Automático** | El script | Copia la plantilla a la carpeta del cliente (sin `.git`, `node_modules`, `dist`, `.env` ni `logo.png`), renombra la marca en los docs, `git init` con historia propia, `package.json` → `name`, `.env`, tu `logo.png`, `CUSTOMIZACIONES.md`, remote `madre`, `npm install` + **339 pruebas** + build, y **genera un token nuevo** para `SB_SYNC_TOKEN` / `VITE_TOKEN` |
| **🧑 Manual** | Tú | Google, GitHub y Vercel: el script **imprime el paso completo** (con las rutas y valores ya rellenados) y espera tu respuesta |
| **✅ Verificación** | Tú | Los 9 chequeos de la fase D, uno por uno, con la causa probable si algo falla |

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

---

## 1. Resumen: 5 artefactos por cliente

| # | Artefacto | Dónde se crea | Qué lo hace único |
|---|---|---|---|
| 1 | **Google Spreadsheet** | `sheets.google.com` con la cuenta del cliente | Su base de datos |
| 2 | **Apps Script (Web App)** | `script.google.com` o *Extensiones → Apps Script* desde la hoja | `SB_SYNC_TOKEN` (nueva), `SB_AUTHORIZED_EMAIL`, `SB_BIZ_NAME`, `SB_BACKUP_EMAIL` (opcional) |
| 3 | **Repo en GitHub** | `github.com` (tu misma cuenta, un repo por cliente) | Código + `package.json` `name` |
| 4 | **Proyecto en Vercel** | `vercel.com` | `VITE_SCRIPT_URL`, `VITE_TOKEN`, `VITE_BIZ_*`, `VITE_CATALOG`, `VITE_ADMIN_WHATSAPP` |
| 5 | **Triggers de Apps Script** | Editor → ⏰ | Reportes diario/semanal/mensual/anual y respaldos |

---

## 2. Fase A — Identidad (lo que se ve)

Todo esto se pone en **Vercel → Settings → Environment Variables**. Ninguno
requiere tocar el código.

| Variable | Qué es | Ejemplo |
|---|---|---|
| `VITE_BIZ_NAME` | Nombre del negocio (pestaña, encabezado, pie y mensajes) | `Uñas de Valentina` |
| `VITE_BIZ_SUBTITLE` | Subtítulo corto (`NOMBRE · SUBTITULO` en la pestaña) | `Spa de uñas` |
| `VITE_BIZ_EMOJI` | Emoji de favicon, encabezado y cierre del WhatsApp | `💅` |
| `VITE_BIZ_LOGO` | URL **absoluta** del logo (opcional; sustituye al emoji) | `https://…/logo.png` |
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

## 3. Fase B — Google del cliente

Sigue [`SETUP.md`](../SETUP.md) pasos 1 a 3 y 6, con estas claves del
cliente:

1. **Decisión previa (la única que no es técnica):** ¿los datos viven en
   **la cuenta de Google del cliente** o en **la tuya**?
   - *Cuenta del cliente:* él es dueño de todo; tú necesitas permiso de
     edición para soportar (compártele el proyecto de Apps Script).
   - *Tu cuenta:* todo centralizado; el cliente no controla su información
     ni puede revidarte. Para un negocio real, **recomendado: la suya**.
2. **Spreadsheet nuevo** en su cuenta → nómbralo con su negocio
   (p. ej. `Uñas DB`). Solo necesitas el ID de la URL.
3. **Apps Script nuevo**, pegar `apps-script/appsscript.json` y
   `apps-script/Code.gs`. (Lo más cómodo: desde el propio spreadsheet,
   *Extensiones → Apps Script*, así ya tiene acceso a la hoja.)
4. **Propiedades de script** (⚙️ → Propiedades del proyecto → Propiedades
   de script):

   | Propiedad | Valor | Nota |
   |---|---|---|
   | `SB_SYNC_TOKEN` | Token **nuevo**, largo y aleatorio | **Nunca** reutilices el de otro cliente; debe coincidir con `VITE_TOKEN` |
   | `SB_AUTHORIZED_EMAIL` | Correo **del cliente** | Obligatoria: a él llegan los códigos de recuperación y los reportes |
   | `SB_BACKUP_EMAIL` | Otro correo (opcional) | Si el cliente quiere la **copia semanal de la hoja** en otro sitio (gestoría, correo personal…). Vacío → el respaldo va a `SB_AUTHORIZED_EMAIL` |
   | `SB_BIZ_NAME` | Nombre del negocio | Es el que firma los correos. Si falta → «SZ» |

5. **Desplegar como Web App** (*Implementar → Nueva implementación*):
   ejecutar como **Yo**, acceso **Cualquier usuario**. Copia la URL
   `…/exec` → esa va en `VITE_SCRIPT_URL`.
6. **Triggers** (una sola vez por cliente), según
   [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) / `SETUP.md`:
   - `setupAllReportTriggers()` → reportes automáticos.
   - `setupDailyBackupTrigger()` → copia diaria 23:00 (crea las carpetas).
   - `setupWeeklyEmailTrigger()` → correo de respaldo los sábados 9:00.
   > Sin el trigger diario, el correo del sábado falla con «Carpeta de
   > backups no encontrada».
7. **Zona horaria:** `appsscript.json` trae `America/Bogota`. Si el cliente
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
npm test      # debe pasar: 339 tests (o: npx vitest run --environment node)
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

Después, **siempre**: `npm test` (339 en verde) y el checklist de la
fase D.

> ⚠️ **La trampa real de los repos independientes no es git, es
> `App.jsx`** (~5.500 líneas). Si en ABC personalizaste esa pantalla y
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

- [ ] La pestaña dice el nombre del cliente y el favicon es su emoji.
- [ ] Header en verde: **«✓ Sincronizado»**.
- [ ] En «Servicios» aparece el catálogo de su actividad.
- [ ] Creo una cliente de prueba → **aparece en su Google Sheets**.
- [ ] Agenda una cita → **aparece en su Google Calendar** con el color
      correspondiente.
- [ ] Su WhatsApp admin abre `wa.me` con su número (reporte).
- [ ] Correo de restablecimiento: pide código → llega con **su nombre**,
      nunca «SZ» → comprueba asunto, cuerpo y HTML.
- [ ] Ejecuté `createDailyBackup()` a mano → se creó
      `BACKUP-PROYECTO/Backups/…` en **su** Drive.
- [ ] El repo de SZ y los datos de SZ **no** se tocaron (nada nuevo en su
      spreadsheet, ningún trigger extra).

---

## 6. Qué NO cambiar nunca

1. **La lógica de `Code.gs` y de `src/`.** Las reglas de negocio son el
   producto; si el cliente necesita una regla distinta, es una
   personalización, no un onboarding.
2. **Los tests.** `npm test` debe pasar siempre (339 tests). Si un cambio
   de cliente los rompe, el cambio estaba mal hecho.
3. **El token del cliente en el código.** Vive en `SB_SYNC_TOKEN`
   (servidor) y `VITE_TOKEN` (Vercel). El repo es público.
4. **`SB_AUTHORIZED_EMAIL` (o `SB_BACKUP_EMAIL`) con el correo de otro
   cliente.** Los reportes, los códigos y los respaldos de uno no pueden
   llegar a la bandeja de otro.
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
| Llega correo de otro negocio | `SB_AUTHORIZED_EMAIL` mal copiada |
| «Carpeta de backups no encontrada» | No se ejecutó `setupDailyBackupTrigger()` / `createDailyBackup()` |
| Las citas salen desfasadas | Zona horaria de `appsscript.json` ≠ UTC-5 |
| Sin reportes automáticos | Falta `SB_AUTHORIZED_EMAIL` o no corriste `setupAllReportTriggers()` |

Detalle y solución ampliada en [`SETUP.md`](../SETUP.md) (Solución de
problemas) y [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección F.

---

## 9. Checklist final del cliente

```text
[ ] Cuenta de Google del cliente (decidida y con acceso de soporte)
[ ] Spreadsheet creado + Apps Script vinculado + manifiesto pegado
[ ] Code.gs pegado y desplegado como Web App (URL …/exec copiada)
[ ] Propiedades: SB_SYNC_TOKEN (nueva) · SB_AUTHORIZED_EMAIL · SB_BIZ_NAME · SB_BACKUP_EMAIL (opcional)
[ ] Triggers: reportes + backup diario + correo semanal
[ ] Repo nuevo en GitHub (historia propia, `madre` como remote de solo lectura)
[ ] `package.json` → "name" + `CUSTOMIZACIONES.md` creado
[ ] npm test en verde (339) + npm run build
[ ] Vercel: proyecto nuevo + 7 variables de la fase A + 2 críticas
[ ] Deploy → checklist de la sección 5 completo
[ ] Anotado en el gestor de contraseñas: token y correo del cliente
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
npm test        # ✅ 339 pruebas
npm run build   # ✅ built in ~3s

# 6. SZ intacto
cd ..\SZ
git status -sb                     # ## main...origin/main
git remote -v                      # solo origin = .../SZ.git
git --no-pager log --oneline -1    # el sha de la plantilla
```

### A.2 — Google (≈20 min) — el orden importa

1. **Drive (cuenta del cliente) → Nuevo → Google Sheets** → `NOMBRE DB`.
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
   | `SB_AUTHORIZED_EMAIL` | correo del dueño (códigos y reportes) |
   | `SB_BACKUP_EMAIL` | otro correo si la copia semanal va a otro sitio (opcional) |
   | `SB_BIZ_NAME` | nombre del negocio (firma los correos) |
6. **Implementar → Nueva implementación → Aplicación web** →
   *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier usuario** →
   Implementar → autorizar permisos → **copiar URL `…/exec`**.
7. (Después, no bloquea) `setupAllReportTriggers()` ·
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
5. **Prueba:** «✓ Sincronizado» → cliente de prueba en la hoja → cita en
   **su** Calendar → correo de restablecimiento con **su** nombre.

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
