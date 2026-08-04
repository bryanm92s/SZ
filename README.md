# 💫 SZ-Micropigmentacion-demo — Cejas & Pestañas

App de gestión para estudio de cejas y pestañas. Construida con React + Vite.

## Funcionalidades
- 📅 Gestión de citas con bloqueo de horarios ocupados
- 👤 Base de clientes (buscar por celular)
- ✂️ Catálogo de servicios con precios
- 💬 Recordatorios por WhatsApp (1 clic)
- 📅 Integración con Google Calendar
- 💰 Control de ingresos y gastos por mes

## Instalación local

```bash
npm install
npm run dev
```

## Deploy en Vercel

1. Sube este proyecto a GitHub
2. Ve a [vercel.com](https://vercel.com) → New Project
3. Importa el repositorio
4. Framework: **Vite** (se detecta automáticamente)
5. En **Settings → Environment Variables**, agrega:
   - `VITE_SCRIPT_URL` — URL del Web App de Google Apps Script (ver `SETUP.md`)
   - `VITE_TOKEN` — debe coincidir con `SECRET_TOKEN` en `apps-script/Code.gs`
   - Opcional: `VITE_BIZ_NAME`, `VITE_BIZ_SUBTITLE`, `VITE_BIZ_EMOJI`, `VITE_BIZ_LOGO`
6. Deploy ✅

> ⚠️ `VITE_SCRIPT_URL` y `VITE_TOKEN` son **obligatorias**: sin ellas la App no puede
> cargar ni guardar datos (ver `src/api.js`). Toma `SETUP.md` como referencia para
> desplegar la parte de Google Apps Script primero.
