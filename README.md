<div align="center">

# 💫 SZ
### Sistema de gestión para estudios de cejas y pestañas (micropigmentación)

**Panel · Citas · Clientes · Servicios · Finanzas · Calendario · Reportes**

React 18 + Vite · Google Apps Script + Sheets + Calendar · Deploy en Vercel

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/Tests-317_passing-brightgreen)](#-testing)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Backend](https://img.shields.io/badge/Backend-Google_Apps_Script-34A853?logo=googleapps&logoColor=white)](https://script.google.com)

<img src="logo.png" alt="Logo SZ" width="120" />

</div>

---

## 📖 Acerca del proyecto

**SZ** es una aplicación web **mobile-first** diseñada para que una
esteticista / micropigmentadora gestione su estudio de cejas y pestañas desde el
celular, sin instalar nada: agenda citas, lleva clientes y servicios, controla
ingresos y gastos, recuerda por WhatsApp y sincroniza todo con **Google Calendar**.

Los datos no viven en el navegador ni en un servidor propio: se guardan en una
**hoja de Google Sheets** vía un **Web App de Google Apps Script**, lo que significa
**base de datos gratis, en la nube y accesible desde cualquier dispositivo**.

> ✨ Pensado para una operadora (no para un equipo de ingeniería): interfaz grande,
> táctil, en español (Colombia), con paletas de colores y modo oscuro.

---

## 📚 Documentación

La documentación completa vive en [`docs/`](docs/INDEX.md):

| Documento | Para qué sirve |
|---|---|
| 📋 [`docs/MANUAL_TECNICO.md`](docs/MANUAL_TECNICO.md) | **Instalar SZ desde cero**: requisitos, variables de entorno, Google Apps Script, Sheets, Calendar, Vercel, seguridad y mantenimiento |
| 🧬 [`docs/ONBOARDING_CLIENTE.md`](docs/ONBOARDING_CLIENTE.md) | **Llevar este programa a otro negocio**: duplicar el despliegue, cambiar de nombre, elegir catálogo y qué NO se toca |
| 🙋 [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | **Manual del usuario final**: cómo usar cada pantalla, paso a paso y sin lenguaje técnico |
| 🏗️ [`docs/ARQUITECTURA_Y_FUNCIONALIDADES.md`](docs/ARQUITECTURA_Y_FUNCIONALIDADES.md) | **Informe técnico-funcional**: arquitectura, entidades, reglas de negocio y matriz de funcionalidades |
| 🧪 [`docs/PRUEBAS_Y_MANTENIMIENTO.md`](docs/PRUEBAS_Y_MANTENIMIENTO.md) | **Pruebas, diagnóstico, respaldo, restauración y despliegue** |
| 🗂 [`docs/INDEX.md`](docs/INDEX.md) | Índice y observaciones pendientes |

> 📄 `SETUP.md` (guía de despliegue original), `SESION_2026-08-04.md` (bitácora
> de desarrollo) y `Manual_Sistema_Gestion.docx` (manual operativo en Word) son
> documentos **preexistentes** que se conservan sin modificar.

---

## ✨ Características principales

### 🗓️ Citas
- **Agenda por bloques** de 30 min (07:00 → 20:30), con **bloqueo automático de
  horarios ocupados** (sin doble reserva) y cierre a las **21:00**.
- **Duración real por servicio**: la duración de la cita es la **suma** de la
  duración de cada servicio seleccionado (15–480 min; sin dato → 60 min).
- **Cita a domicilio** con valor adicional y dirección opcional.
- **Múltiples servicios por cita** (combo) con cálculo automático del total.
- Estados: **Pendiente · Completada · No asistió**, con **método de pago**
  (Efectivo / Transferencia) al completar.
- Agrupación en acordeón: **Hoy · Mañana · Próximas · No asistió · Pasadas**.
- **Solo las citas pendientes** se pueden editar o eliminar (regla compartida
  por la pestaña Citas y el Calendario).
- Edición de cita preservando el **precio que tenía al momento de crearla**
  (historial de precios en la hoja `HistorialPrecios`).
- **Integración con Google Calendar**: cada cita crea/actualiza/borra un evento
  automático, con comprobación post-escritura.

### 👥 Clientes
- Base de clientes con **búsqueda por celular** (sufijo primero, luego subcadena).
- **Historial de cada cliente**: citas, montos, última visita.
- Registro automático al agendar (no hay que dar de alta al cliente antes).

### ✂️ Servicios
- Catálogo de servicios con **precio y duración**.
- **Historial de precios**: cuando cambias un precio, se registra la fecha, y
  las citas antiguas conservan el precio que regía en su momento.
- **No se puede eliminar** un servicio que todavía tengan citas futuras activas
  o en curso. La regla la valida **también el backend**, no solo el botón.

### 💰 Finanzas
- **Balance neto** (ingresos recibidos − gastos) general y por mes.
- **Recibido · Pendiente · Proyectado** (lo cobrado vs. lo que falta por cobrar).
- Gastos por **categoría** (Insumos, Arriendo, Publicidad…) con colores
  personalizables.
- **Comparación mes a mes** y **Top servicios** (por ingresos y por demanda).
- **Detalle de ingresos** y **detalle de gastos** con filtros.
- **Paginación** en *Gastos del mes* y *Movimientos del período* (10 por
  página, **‹ Ant. · Sig. ›**) y en *Detalle de ingresos* y *Detalle de
  gastos*: **7 días por página** con ese mismo **‹ Ant. · Sig. ›** y **5
  registros dentro de cada día** con **círculos numerados**. Los totales
  siguen sumando el período completo.
- **Categorías desplegables** en *Detalle de gastos*: toca una categoría
  para ver sus gastos uno por uno.
- **Orden consistente**: lo más reciente primero; **dentro de un día** las
  citas van **por hora** y los gastos **por descripción (A→Z)** y, si dos
  gastos se llaman igual, **el mayor monto** — nunca en el orden en que se
  registraron.
- Desglose de **domicilios** (cantidad e ingreso).

### 📊 Reportes
- Reporte por **día, mes, rango de fechas o año completo**.
- **Exportación a Excel (`.xlsx`)** con tres hojas: Resumen, Citas y Gastos.
- **Botón de WhatsApp al admin** con el resumen del período.
- **Reportes automáticos por correo** (Apps Script, con el Excel adjunto):
  diario, semanal, mensual y anual.

### 📅 Calendario (vista mensual)
- Vista de mes completa con las citas pintadas por día.
- Toca un día para ver/abrir sus citas.

### ⚙️ Ajustes
- **6 paletas de color** (Rosa · Morado · Azul · Verde · Dorado · Fucsia) +
  **modo claro/oscuro**, guardados en el navegador.
- **Restablecimiento del sistema** protegido por **código enviado al correo**
  del propietario (un solo uso, con vencimiento y límite de intentos).

### 🔔 Extras de experiencia
- **Recordatorios por WhatsApp con 1 clic** (mensaje pre-escrito con emoji,
  fecha, hora, desglose de servicios/domicilio y total). **No se puede enviar
  recordatorio de una cita que ya pasó.**
- **Avisos de “cita por recordar”** en el Panel.
- **Sincronización automática cada 30 s**, pausada cuando la pestaña no está
  visible.
- **Modo sin conexión**: si falla la red, se sigue trabajando con respaldo en
  `localStorage`.
- **Branding dinámico**: nombre, subtítulo, emoji y logo del negocio desde
  variables de entorno (título y favicon se actualizan en runtime).
- **Respaldo automático** de la hoja en Google Drive (diario, 30 días de
  retención) y **envío semanal del último respaldo por correo**.

---

## 🛠️ Stack tecnológico

| Capa | Tecnología | Versión confirmada |
|---|---|---|
| Framework UI | **React** + **Vite** (JSX, sin TypeScript) | React 18.3 · Vite 5.4 |
| Estilos | **CSS-in-JS** (estilos inline + un `<style>` global inyectado, sin librería UI) | — |
| Exportación Excel (app) | **xlsx (SheetJS)** | 0.18.5 |
| Tests | **Vitest** + **jsdom** | 1.6 |
| Lint / formato | **ESLint** + **Prettier** | ESLint 8.57 · Prettier 3.3 |
| Backend | **Google Apps Script** (`apps-script/Code.gs`), runtime V8 | — |
| Base de datos | **Google Sheets** (5 hojas: Clientes, Servicios, Citas, Gastos, HistorialPrecios) | — |
| Agenda | **Google Calendar** (vía Apps Script) | — |
| Correo | **GmailApp** (reportes automáticos, respaldos y códigos de recuperación) | — |
| Hosting | **Vercel** (frontend estático) | — |
| Offline | `localStorage` como respaldo de lectura/escritura | — |

> No hay servidor que mantener ni base de datos que pagar. Todo el estado
> persistente vive en tu cuenta de Google.

---

## 🏗️ Arquitectura

```
┌─────────────────────────┐         HTTPS (token)          ┌──────────────────────────┐
│   Vercel  (React SPA)   │  ────────────────────────────► │  Google Apps Script Web │
│                         │   ◄──────────────────────────  │  (apps-script/Code.gs)  │
│  • Panel / Citas / ...  │         JSON { ok, data }       │                          │
│  • localStorage (cache) │                                │  • LockService (concurrencia)
│  • Polling 30s          │                                │  • sanitize (montos ≥ 0) │
│  • WhatsApp (wa.me)     │                                │  • timezone America/Bogota│
└─────────────────────────┘                                └──────┬───────┬───────┬───┘
                                                                   │       │       │
                                              ┌────────────────────┘       │       └──────────────┐
                                              ▼                            ▼                      ▼
                                       ┌──────────────┐         ┌─────────────────┐    ┌───────────────────┐
                                       │ Google Sheets│         │ Google Calendar │    │ GmailApp          │
                                       │ (5 hojas/BD) │         │ (eventos cita)  │    │ (reportes+respaldo│
                                       └──────────────┘         └─────────────────┘    │  +código de reset)│
                                                                                      └───────────────────┘
```

**Flujo de datos:** el `App` carga todo (`loadData`) al inicio y luego guarda
(`saveData`) tras cada cambio, enviando el **arreglo completo** de la entidad
modificada. El backend usa **`LockService`** para evitar escrituras concurrentes
y **sanea** los montos monetarios (nunca negativos) como defensa en profundidad.

> 🔁 **Importante:** los reportes automáticos por correo replican **línea por
> línea** el texto del botón «💬 WhatsApp admin». Existe una **prueba de paridad**
> que compara ambos textos y falla si se desalinean.

---

## 📁 Estructura del proyecto

```
SZ/
├── index.html                 # HTML raíz (título + favicon emoji por defecto)
├── package.json               # Scripts y dependencias
├── vite.config.js             # Configuración de Vite + plugin React
├── vitest.config.ts           # Configuración de tests (jsdom, globals)
├── .eslintrc.cjs              # Reglas de ESLint
├── .prettierrc.json           # Reglas de Prettier
├── .env.example               # Plantilla de variables de entorno
├── logo.png                   # Logo / apple-touch-icon
│
├── README.md                  # ← Estás aquí
├── SETUP.md                   # Guía de despliegue original (preexistente)
├── SESION_2026-08-04.md       # Bitácora de desarrollo (preexistente)
├── Manual_Sistema_Gestion.docx# Manual operativo en Word (preexistente)
│
├── docs/                      # 📚 Documentación completa
│   ├── INDEX.md               # Índice y observaciones pendientes
│   ├── MANUAL_TECNICO.md      # Instalación y configuración desde cero
│   ├── ONBOARDING_CLIENTE.md  # Cómo llevar el programa a otro negocio
│   ├── MANUAL_USUARIO.md      # Manual para la operadora
│   ├── ARQUITECTURA_Y_FUNCIONALIDADES.md
│   └── PRUEBAS_Y_MANTENIMIENTO.md
│
├── src/
│   ├── main.jsx               # Entry point de React
│   ├── App.jsx                # 🟡 Toda la UI (~4.490 líneas): componentes y estado
│   ├── api.js                 # load/save contra el Web App de Apps Script
│   ├── helpers.js             # Funciones puras (~857 líneas) — la fuente de las reglas
│   ├── catalogs.js            # Catálogos por tipo de negocio (VITE_CATALOG)
│   ├── index.css              # Reset mínimo
│   ├── api.test.js            # Tests del módulo de transporte
│   ├── helpers.test.js        # Tests unitarios de helpers
│   ├── catalogs.test.js       # Tests de los catálogos iniciales
│   └── backend.test.js        # Ejecuta el Code.gs REAL dentro de un sandbox
│
└── apps-script/               # 🟢 Backend (desplegar en Google Apps Script)
    ├── Code.gs                # Lógica completa (~2.072 líneas)
    ├── appsscript.json        # Manifiesto ACTIVO (scopes + zona horaria)
    └── appsscript.json.txt    # Manifiesto alternativo (preexistente; ver docs)
```

> **Nota de diseño:** `App.jsx` concentra toda la UI en un solo archivo a
> propósito, para mantenerlo simple de navegar y modificar; la lógica
> reutilizable y testeable vive en `helpers.js` (sin dependencias de React ni
> del navegador).

---

## ✅ Prerrequisitos

- **Node.js 18+** y npm. *(Confirmado con Node 18.20.2.)*
- **Git**.
- Una **cuenta de Google** (gratis) para Sheets, Calendar, Apps Script, Drive y Gmail.
- Una cuenta de **GitHub** y **Vercel** (gratis) para el despliegue.

No necesitas Postgres, Redis ni ningún servidor.

---

## 🚀 Instalación y uso local

```bash
# 1. Clona el repositorio
git clone https://github.com/bryanm92s/SZ.git
cd SZ

# 2. Instala las dependencias
npm install

# 3. Copia el archivo de variables de entorno y completa los valores
cp .env.example .env
#   → Edita .env con VITE_SCRIPT_URL y VITE_TOKEN (ver docs/MANUAL_TECNICO.md sección D)

# 4. Arranca el servidor de desarrollo
npm run dev
```

Abre **http://localhost:5173**. Sin `VITE_SCRIPT_URL` la app muestra la pantalla
«Configura VITE_SCRIPT_URL y VITE_TOKEN en Vercel», pero el resto del código y
los tests funcionan igual.

> 🧪 Para probar la interfaz **sin tocar el backend real**, puedes usar un valor
> inválido a propósito, por ejemplo
> `VITE_SCRIPT_URL=https://example.invalid/exec`: la app entra en «Modo sin
> conexión» y puedes sembrar datos de prueba en `localStorage`. Borra ese
> `.env.local` después.

### Scripts disponibles

| Script | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) con hot reload |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build de producción localmente |
| `npm run lint` | ESLint sobre `src/` (`*.js` y `*.jsx`) |
| `npm run format` | Prettier — formatea todo `src/` |
| `npm run test` | Tests unitarios (Vitest), una sola ejecución |
| `npm run test:watch` | Tests en modo observador |

---

## 🔐 Variables de entorno

Copia `.env.example` a `.env` (local) o configúralas en
**Vercel → Settings → Environment Variables** (producción).

| Variable | Obligatoria | Sensible | Descripción |
|---|:---:|:---:|---|
| `VITE_SCRIPT_URL` | ✅ | interna | URL del Web App de Apps Script (`…/exec`) |
| `VITE_TOKEN` | ✅ | ⚠️ **expuesta** | Debe coincidir exactamente con la propiedad de script `SB_SYNC_TOKEN` |
| `VITE_BIZ_NAME` | — | pública | Nombre del negocio (header + `<title>`). Defecto: `SZ` (despliegue original) → **obligatoria en un cliente nuevo** |
| `VITE_BIZ_SUBTITLE` | — | pública | Subtítulo corto: aparece bajo el nombre **y** en la pestaña (`NOMBRE · SUBTITULO`) |
| `VITE_BIZ_EMOJI` | — | pública | Emoji del icono de la pestaña (favicon), del encabezado y del cierre del mensaje de WhatsApp. Defecto: `🌸` |
| `VITE_BIZ_LOGO` | — | pública | URL absoluta del logo para `apple-touch-icon` |
| `VITE_CATALOG` | — | pública | Catálogo inicial de servicios: `cejas` \| `unas` \| `peluqueria` \| `barberia` \| `depilacion` \| `masajes` \| `estetica` \| `maquillaje` (`src/catalogs.js`). Defecto: `cejas` |
| `VITE_DEFAULT_SERVICES` | — | pública | Lista JSON con los servicios exactos del cliente. **Tiene prioridad** sobre `VITE_CATALOG` |
| `VITE_ADMIN_WHATSAPP` | — | ⚠️ **personal** | Número de WhatsApp del admin, destino del botón «💬 WhatsApp admin». Sin número, el botón sale **deshabilitado** |

> ⚠️ **Todas las variables `VITE_*` quedan embebidas en el JavaScript del
> navegador** una vez compilado. Por eso **`VITE_TOKEN` no es un secreto
> efectivo**: el auténtico vive en Apps Script (`SB_SYNC_TOKEN`). El número del
> admin es privado *dentro del repo*, pero inevitablemente visible en el bundle
> desplegado. Detalle en [`docs/MANUAL_TECNICO.md`](docs/MANUAL_TECNICO.md)
> sección G.

> 📝 **Por qué no usar placeholders `VITE_*` en `index.html`:** Vite ejecuta
> `decodeURI()` durante el build y revienta con “URI malformed” si hay un `%`
> inválido. Por eso el `title` y el favicon se definen dinámicamente en
> `App.jsx`.

---

## 🟢 Configuración del backend (Google Apps Script)

La app necesita un **Web App de Apps Script** que lee/escribe Sheets, Calendar
y correo. **[`docs/MANUAL_TECNICO.md`](docs/MANUAL_TECNICO.md) secciones D y E**
tiene el procedimiento completo; el resumen:

1. **Crea un Spreadsheet** y ábrelo con **Extensiones → Apps Script** (así queda
   vinculado automáticamente).
2. **Pega el contenido de `apps-script/Code.gs`** y guarda el token en
   **Propiedades del proyecto** → *Propiedades de script*:
   - **Clave:** `SB_SYNC_TOKEN`
   - **Valor:** algo único y largo, el mismo que usarás en `VITE_TOKEN`
3. **Despliega como Web App** (*Implementar → Nueva implementación → Aplicación web*):
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario
   - Autoriza los permisos (Sheets, Calendar, Gmail, Drive).
4. **Copia la URL**: `https://script.google.com/macros/s/«…»/exec`.
5. **Instala los triggers automáticos** ejecutando una sola vez
   `setupAllReportTriggers()`, y si quieres respaldos, `setupDailyBackupTrigger()`
   y `setupWeeklyEmailTrigger()`.

> 🔄 **OJO:** cada vez que edites `Code.gs`, vuelve a
> *Implementar → Gestionar → Nueva versión*. **Nunca crees una implementación
> nueva desde cero**: cambiaría la URL `/macros/u/N/s/…/exec` y rompería
> `VITE_SCRIPT_URL`.

---

## ☁️ Despliegue en Vercel

1. Sube el repositorio a **GitHub**.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. Framework: **Vite** (se detecta solo).
4. **Settings → Environment Variables** → agrega `VITE_SCRIPT_URL` y `VITE_TOKEN`
   (y las opcionales).
5. **Deploy** ✅.

> 📌 Vercel despliega **automáticamente** con cada push a `main`. Los cambios en
> `Code.gs` **no** despliegan nada: hay que pegarlos y publicar la versión a mano.

### ✅ Cómo verificar que quedó bien

- En el header aparece **“✓ Sincronizado”** (verde).
- Agrega una clienta de prueba → debe aparecer en la hoja **Clientes** de Sheets.
- Agenda una cita → debe aparecer como evento en **Google Calendar**.
- Desde otro dispositivo, abre la URL de Vercel: los datos están sincronizados.

Detalle completo en [`docs/MANUAL_TECNICO.md`](docs/MANUAL_TECNICO.md) sección F.

---

## 🧪 Testing

Hay **317 pruebas** en 4 suites, ejecutadas y verificadas en esta ronda de
documentación:

| Suite | Pruebas | Qué cubre |
|---|---:|---|
| `src/helpers.test.js` | 165 | Lógica pura: fechas, slots, teléfono, duraciones, estados, finanzas, reportes |
| `src/backend.test.js` | 131 | **Ejecuta el `Code.gs` real** en un sandbox (`node:vm`): API, reset, Calendar, reportes, Excel, paridad correo/WhatsApp y marca de los correos (`SB_BIZ_NAME`) |
| `src/catalogs.test.js` | 14 | Catálogo inicial por tipo de negocio (`VITE_CATALOG` / `VITE_DEFAULT_SERVICES`) |
| `src/api.test.js` | 7 | Transporte: mensajes de error, `loadData`/`saveData`, restablecimiento |

```bash
npm test              # una vez
npm run test:watch    # en watch
npm run lint          # ESLint
npm run build         # build de producción
```

> 📖 Qué **no** cubren las pruebas, cómo probar a mano y cómo diagnosticar
> errores: [`docs/PRUEBAS_Y_MANTENIMIENTO.md`](docs/PRUEBAS_Y_MANTENIMIENTO.md).

---

## 🧭 Guía rápida de uso (dentro de la app)

| Pestaña | Para qué sirve |
|---|---|
| **Panel** | Resumen del día: citas de hoy, citas por recordar, balance neto, accesos. |
| **Citas** | Crear/editar/eliminar citas, marcar completada o no asistió, enviar WhatsApp. |
| **Clientes** | Buscar y administrar clientes; ver historial individual. |
| **Servicios** | Catálogo, precios y duración; el historial de precios se guarda automáticamente. |
| **Finanzas** | Ingresos vs. gastos, detalle, comparación mensual, top servicios y reportes. |
| **Calendario** | Vista mensual de las citas. |
| **Ajustes** | Tema/paleta, modo oscuro y restablecimiento protegido. |

> 🙋 Procedimientos paso a paso con ejemplos:
> [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md).

---

## 🩹 Solución de problemas

| Síntoma | Solución |
|---|---|
| **“Sin conexión”** en la app | Revisa `VITE_SCRIPT_URL` y `VITE_TOKEN` en Vercel. El Apps Script debe estar desplegado como *Cualquier usuario*. El token debe ser **idéntico** a la propiedad `SB_SYNC_TOKEN` (si falta, el servidor responde *«Token de sincronización no configurado»*). |
| **“Varias cuentas de Google”** | Apps Script no soporta varias cuentas en el mismo navegador: Google reescribe la URL con `/u/N/`. Entra en ventana de incógnito. |
| El evento de Calendar no se crea | Autoriza permisos de Calendar: *Implementar → Gestionar → volver a implementar* y aceptar los permisos. |
| Los datos no aparecen en otro dispositivo | Confirma que ambos apuntan a la **misma URL de Vercel**. Los datos viven en Sheets. |
| Horas desplazadas | El backend usa la zona `America/Bogota` (UTC-5) y `localNowISO` evita el desfase de `toISOString()`. |
| Build falla con *“URI malformed”* | No pongas emojis o `%` literal en atributos `href`/`src` del `index.html`; el favicon va vía `App.jsx`. |

> 📖 Diagnóstico completo (cómo distinguir un error de frontend, de Apps Script,
> de permisos o de despliegue):
> [`docs/PRUEBAS_Y_MANTENIMIENTO.md`](docs/PRUEBAS_Y_MANTENIMIENTO.md).

---

## ⚠️ Limitaciones conocidas

Confirmadas en el código, no corregidas:

- **Una sola usuaria.** No hay roles ni autenticación de usuario: quien tiene la
  URL y el token ve y edita todo. El token **no es un secreto efectivo** (viaja
  en el bundle).
- **No hay concurrencia real entre usuarios.** La validación de horarios
  (`checkSlot`) es **en el cliente**; el `LockService` evita corromper la hoja,
  pero no evita que dos personas reserven la misma hora a la vez.
- **Sheets y Calendar no son transaccionales.** Si el borrado del evento de
  Calendar falla, la app avisa y ofrece reintento, pero **no se puede hacer
  rollback** de la cita ya borrada. La app muestra el ID del evento para borrarlo
  a mano.
- **El correo del destinatario vive solo en Script Properties.** Ni el
  reporte, ni el respaldo semanal, ni el código de restablecimiento tienen
  una dirección escrita en el código: los tres leen `SB_AUTHORIZED_EMAIL`.
  **Si falta esa propiedad no se envía nada** (el reset no gasta su cupo de
  solicitudes y los reportes/backups se omiten avisando en el log).
- **El restablecimiento borra todo** (clientes, citas, gastos y eventos de
  Calendar) y **no se puede deshacer**.
- **`writeSheet` reescribe la hoja completa** en cada guardado: cualquier fila
  que alguien haya escrito a mano **fuera de las columnas esperadas se pierde**.

---

## 📄 Licencia

Distribuido bajo licencia **MIT**. Libre para adaptar a tu propio estudio.

---

<div align="center">

**© 2026 Bryan Morales** — Hecho con 💗 para estudios de belleza.

</div>
