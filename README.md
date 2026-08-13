<div align="center">

# 💫 SZ — Studio Beauty
### Sistema de gestión para estudios de cejas y pestañas (micropigmentación)

**Panel · Citas · Clientes · Servicios · Finanzas · Calendario · Reportes**

React 18 + Vite · Google Apps Script + Sheets + Calendar · Deploy en Vercel

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Backend](https://img.shields.io/badge/Backend-Google_Apps_Script-34A853?logo=googleapps&logoColor=white)](https://script.google.com)
[![License](https://img.shields.io/badge/Licencia-MIT-blue)](LICENSE)

<img src="logo.png" alt="Logo SZ" width="120" />

</div>

---

## 📖 Acerca del proyecto

**SZ (Studio Beauty)** es una aplicación web **mobile-first** diseñada para que una
esteticista / micropigmentadora gestione su estudio de cejas y pestañas desde el
celular, sin instalar nada: agenda citas, lleva clientes y servicios, controla
ingresos y gastos, recuerda por WhatsApp y sincroniza todo con **Google Calendar**.

Los datos no viven en el navegador ni en un servidor propio: se guardan en una
**hoja de Google Sheets** vía un **Web App de Google Apps Script**, lo que significa
**base de datos gratis, en la nube y accesible desde cualquier dispositivo**.

> ✨ Pensado para una operadora (no para un equipo de ingeniería): interfaz grande,
> táctil, en español (Colombia), con paletas de colores y modo oscuro.

---

## ✨ Características principales

### 🗓️ Citas
- **Agenda por bloques** de 30 min (07:00 → 20:30), con **bloqueo automático de
  horarios ocupados** (sin doble reserva).
- **Cita a domicilio** con valor adicional y dirección opcional.
- **Múltiples servicios por cita** (combo) con cálculo automático del total.
- Estados: **Pendiente · Completada · No asistió** — las citas futuras no se pueden
  marcar (no tiene sentido cobrarlas antes).
- Agrupación en acordeón: **Hoy · Mañana · Próximas · No asistió · Pasadas**.
- Edición de cita preservando el **precio que tenía al momento de crearla**
  (historial de precios).
- **Integración con Google Calendar**: cada cita crea/actualiza/borra un evento
  automático en el calendario del negocio.

### 👥 Clientes
- Base de clientes con **búsqueda por celular** (sufijo primero, luego subcadena).
- **Historial de cada cliente**: citas, montos, última visita.
- Registro automático al agendar (no hay que dar de alta al cliente antes).

### ✂️ Servicios
- Catálogo de servicios con **precio y nombre**.
- **Historial de precios**: cuando cambias un precio, se registra la fecha, y las
  citas antiguas conservan el precio que regía en su momento.

### 💰 Finanzas
- **Balance neto** (ingresos recibidos − gastos) general y por mes.
- **Recibido · Pendiente · Proyectado** (lo cobrado vs. lo que falta por cobrar).
- Gastos por **categoría** (Insumos, Arriendo, Publicidad…) con colores.
- **Comparación mes a mes** y **Top servicios** (más vendidos / más ingresos).
- **Detalle de ingresos** y **detalle de gastos** con filtros.

### 📊 Reportes
- Reporte por **día, mes o rango** de fechas.
- **Exportación a Excel (`.xlsx`)** con tres hojas: Resumen, Citas y Gastos.
- Genera un enlace de **WhatsApp al admin** con el resumen.

### 📅 Calendario (vista mensual)
- Vista de mes completa con las citas pintadas por día.
- Toca un día para ver/abrir sus citas.

### ⚙️ Ajustes
- **6 paletas de color** (Rosa · Morado · Azul · Verde · Dorado · Fucsia) +
  **modo claro/oscuro**, guardados en el navegador.
- **Reset total** con confirmación en dos pasos (borra datos + eventos de Calendar).

### 🔔 Extras de experiencia
- **Recordatorios por WhatsApp con 1 clic** (mensaje pre-escrito con emoji, fecha,
  hora, total y modalidad a domicilio).
- **Avisos de “cita por recordar”** en el Panel (≤ 60 min antes de la cita).
- **Sincronización automática cada 30 s**, pausada cuando la pestaña no está visible.
- **Modo sin conexión**: si falla la red, sigue trabajando con respaldo en
  `localStorage` y se sincroniza cuando vuelve.
- **Branding dinámico**: nombre, subtítulo, emoji y logo del negocio desde variables
  de entorno (título y favicon se actualizan en runtime).

---

## 🛠️ Stack tecnológico

| Capa           | Tecnología                                                                 |
|----------------|----------------------------------------------------------------------------|
| Framework UI   | **React 18** + **Vite 5** (JSX, sin TypeScript)                            |
| Estilos        | **CSS-in-JS** (inline styles + un `<style>` global inyectado, sin lib UI)  |
| Tests          | **Vitest** sobre helpers puros (sin acoplar el DOM de React)               |
| Export         | **xlsx (SheetJS)** para reportes Excel                                     |
| Backend        | **Google Apps Script** (`apps-script/Code.gs`) — Web App                   |
| Base de datos  | **Google Sheets** (5 hojas: Clientes, Servicios, Citas, Gastos, Historial) |
| Agenda         | **Google Calendar API** (Apps Script)                                      |
| Hosting        | **Vercel** (frontend estático)                                              |
| Offline        | `localStorage` como respaldo de lectura/escritura                          |

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
│  • Polling 30s          │                                │  • sanitize (montos ≥ 0)  │
│  • WhatsApp reminders   │                                │  • timezone America/Bogota│
└─────────────────────────┘                                └─────────────┬────────────┘
                                                                         │
                                                          ┌──────────────┴───────────────┐
                                                          ▼                               ▼
                                                 ┌─────────────────┐             ┌──────────────────┐
                                                 │  Google Sheets  │             │ Google Calendar   │
                                                 │  (5 hojas/BD)   │             │  (eventos cita)  │
                                                 └─────────────────┘             └──────────────────┘
```

**Flujo de datos:** el `App` carga todo (`loadData`) al inicio y luego guarda
(`saveData`) tras cada cambio, enviando el arreglo completo de la entidad modificada.
El backend usa **`LockService`** para evitar escrituras concurrentes y **sanea** los
montos monetarios (nunca negativos) como defensa en profundidad.

---

## 📁 Estructura del proyecto

```
SZ/
├── index.html                 # HTML raíz (título + favicon emoji por defecto)
├── package.json               # Scripts y dependencias
├── vite.config.js             # Configuración de Vite + plugin React
├── vitest.config.js           # Configuración de tests
├── .env.example               # Plantilla de variables de entorno
├── SETUP.md                   # Guía de despliegue paso a paso (Apps Script)
├── logo.png                   # Logo / apple-touch-icon
│
├── src/
│   ├── main.jsx               # Entry point de React
│   ├── App.jsx                # 🟡 Toda la app (~3.300 líneas): todos los componentes
│   ├── api.js                # load/save contra el Web App de Apps Script
│   ├── helpers.js            # Funciones puras (fechas, slots, teléfono…) + testeable
│   ├── helpers.test.js        # Tests unitarios con Vitest
│   ├── index.css              # Reset mínimo
│   └── App.jsx (contiene)     # Dashboard, ApptsTab, ClientsTab, ServicesTab,
│                              # FinancesTab, CalendarView, SettingsTab, ReportTab,
│                              # IncomeDetail, ExpenseDetail, ClientHistory,
│                              # MonthComparison, TopServices, NavIcon…
│
└── apps-script/               # 🟢 Backend (desplegar en Google Apps Script)
    ├── Code.gs                # Lógica completa (doGet/doPost, Sheets, Calendar)
    └── appsscript.json        # Scopes de OAuth (Sheets, Calendar, Drive…)
```

> **Nota de diseño:** `App.jsx` concentra toda la UI en un solo archivo de
> propósito para mantenerlo simple de navegar y modificar; la lógica reutilizable y
> testeable vive en `helpers.js` (sin dependencias de React ni del navegador).

---

## ✅ Prerrequisitos

- **Node.js 18+** y npm.
- Una **cuenta de Google** (gratis) para Sheets, Calendar y Apps Script.
- Una cuenta de **GitHub** y **Vercel** (gratis) para el despliegue.

No necesitas Postgres, Redis ni ningún servidor.

---

## 🚀 Instalación y uso local

```bash
# 1. Clona el repositorio
git clone https://github.com/TU_USUARIO/SZ.git
cd SZ

# 2. Instala las dependencias
npm install

# 3. Copia el archivo de variables de entorno y completa los valores
cp .env.example .env
#   → Edita .env con VITE_SCRIPT_URL y VITE_TOKEN (ver sección Backend)

# 4. Arranca el servidor de desarrollo
npm run dev
```

Abre **http://localhost:5173**. Sin `VITE_SCRIPT_URL` la app mostrará la pantalla de
“configura tus variables”, pero el resto del código y los tests funcionan igual.

### Scripts disponibles

| Script              | Acción                                                |
|---------------------|-------------------------------------------------------|
| `npm run dev`       | Servidor de desarrollo (Vite) con hot reload          |
| `npm run build`     | Build de producción en `dist/`                        |
| `npm run preview`   | Sirve el build de producción localmente               |
| `npm run lint`      | ESLint sobre `src/` (`*.js` y `*.jsx`)               |
| `npm run format`    | Prettier — formatea todo `src/`                      |
| `npm run test`      | Tests unitarios (Vitest), una sola ejecución          |
| `npm run test:watch`| Tests en modo observador                             |

---

## 🟢 Configuración del backend (Google Apps Script)

La app necesita un **Web App de Apps Script** que lee/escribe Sheets y Calendar.
Sigue `SETUP.md` para el detalle; aquí el resumen:

1. **Crea un Spreadsheet** en [sheets.google.com](https://sheets.google.com) y copia
   su **ID** de la URL:
   `https://docs.google.com/spreadsheets/d/«ESTE_ES_EL_ID»/edit`
   *(las 5 hojas se crean solas).*

2. **Abre Apps Script** desde el menú **Extensiones → Apps Script** del Spreadsheet
   (así queda vinculado automáticamente).

3. **Pega el contenido de `apps-script/Code.gs`** y cambia el token:
   ```js
   const SECRET_TOKEN = 'TuTokenSuperSecreto2024';   // ← pon algo único
   ```

4. **Despliega como Web App** (*Implementar → Nueva implementación → Aplicación web*):
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario
   - Autoriza los permisos de **Sheets** y **Calendar**.

5. **Copia la URL** del Web App: `https://script.google.com/macros/s/«…»/exec`.

> 🔄 Cada vez que edites `Code.gs`, vuelve a *Implementar → Gestionar → Nueva versión*.

---

## 🔐 Variables de entorno

Copia `.env.example` a `.env` (local) o configúralas en
**Vercel → Settings → Environment Variables** (producción).

| Variable            | Obligatoria | Descripción                                                          |
|---------------------|:-----------:|----------------------------------------------------------------------|
| `VITE_SCRIPT_URL`   |     ✅      | URL del Web App de Apps Script (`…/exec`)                            |
| `VITE_TOKEN`        |     ✅      | Debe coincidir exactamente con `SECRET_TOKEN` en `Code.gs`          |
| `VITE_BIZ_NAME`     |     —       | Nombre del negocio (header + `<title>`)                              |
| `VITE_BIZ_SUBTITLE` |     —       | Subtítulo corto del header                                           |
| `VITE_BIZ_EMOJI`    |     —       | Emoji del favicon (se inyecta en runtime, p. ej. `🌸`)              |
| `VITE_BIZ_LOGO`     |     —       | URL absoluta del logo para `apple-touch-icon`                        |

> ⚠️ Sin `VITE_SCRIPT_URL` y `VITE_TOKEN` la app **no puede cargar ni guardar datos**
> (ver `src/api.js`).

> 📝 **Por qué no usar placeholders `VITE_*` en `index.html`:** Vite ejecuta
> `decodeURI()` durante el build y revienta con “URI malformed” si hay un `%`
> inválido. Por eso el `title` y el favicon se definen dinámicamente en `App.jsx`.

---

## ☁️ Despliegue en Vercel

1. Sube el repositorio a **GitHub**.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. Framework: **Vite** (se detecta solo).
4. **Settings → Environment Variables** → agrega `VITE_SCRIPT_URL` y `VITE_TOKEN`
   (y las opcionales de branding si quieres).
5. **Deploy** ✅.

### ✅ Cómo verificar que quedó bien

- En el header aparece **“✓ Sincronizado”** (verde).
- Agrega una clienta de prueba → debe aparecer en la hoja **Clientes** de Sheets.
- Agenda una cita → debe aparecer como evento en **Google Calendar**.
- Desde otro dispositivo, abre la URL de Vercel: los datos están sincronizados.

---

## 🧪 Testing

Los tests cubren los **helpers puros** de `src/helpers.js` (fechas, formato, bloques
de horario, coincidencia de teléfono, números monetarios), de forma que se ejecutan
en Node sin arrastrar React ni el navegador.

```bash
npm test          # una vez
npm run test:watch   # en watch
```

---

## 🧭 Guía rápida de uso (dentro de la app)

| Pestaña     | Para qué sirve                                                                |
|-------------|-------------------------------------------------------------------------------|
| **Panel**   | Resumen del día: citas de hoy, citas por recordar, balance neto, accesos.    |
| **Citas**   | Crear/editar/eliminar citas, marcar completada o no asistió, enviar WhatsApp. |
| **Clientes**| Buscar y administrar clientes; ver historial individual.                      |
| **Servicios**| Catálogo y precios; el historial de precios se guarda automáticamente.     |
| **Finanzas**| Ingresos vs. gastos, detalle, comparación mensual y top servicios.            |
| **Calendario**| Vista mensual de las citas.                                                  |
| **Ajustes** | Tema/paleta, modo oscuro y reset total.                                       |

---

## 🩹 Solución de problemas

| Síntoma | Solución |
|---|---|
| **“Sin conexión”** en la app | Revisa `VITE_SCRIPT_URL` y `VITE_TOKEN` en Vercel. El Apps Script debe estar desplegado como *Cualquier usuario*. El token debe ser **idéntico** al `SECRET_TOKEN` de `Code.gs`. |
| El evento de Calendar no se crea | Autoriza permisos de Calendar: *Implementar → Gestionar → volver a implementar* y aceptar los permisos. |
| Los datos no aparecen en otro dispositivo | Confirma que ambos apuntan a la **misma URL de Vercel**. Los datos viven en Sheets, no en el navegador. |
| Horas desplazadas | El backend usa la zona `America/Bogota` (UTC-5) y `localNowISO` evita el desfase de `toISOString()`. No cambies la zona del script ni del navegador. |
| Build falla con *“URI malformed”* | No pongas emojis o `%` literal en atributos `href`/`src` del `index.html`; el favicon va vía `App.jsx`. |

---

## 🗺️ Roadmap

- [ ] Recordatorios automáticos programados (time-driven triggers).
- [ ] Roles multiusuario (operadora vs. admin).
- [ ] Exportación/importación respaldo completo.
- [ ] Estadísticas avanzadas (retención de clientes, ticket promedio).

---

## 📄 Licencia

Distribuido bajo licencia **MIT**. Libre para adaptar a tu propio estudio.

---

<div align="center">

**© 2026 Bryan Morales** — Hecho con 💗 para estudios de belleza.

`Manual_Sistema_Gestion.docx` incluye el manual de uso operativo del sistema.

</div>
