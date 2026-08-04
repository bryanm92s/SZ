# 📋 Guía de configuración paso a paso

## Arquitectura
```
Vercel (React App)  ←→  Google Apps Script  ←→  Google Sheets + Google Calendar
```

---

## PASO 1 — Crear el Google Spreadsheet

1. Ve a **sheets.google.com** con tu cuenta de Google
2. Crea una hoja nueva → nómbrala **"Studio Beauty DB"**
3. Copia el **ID** de la URL:
   ```
   https://docs.google.com/spreadsheets/d/  →ESTE_ES_EL_ID←  /edit
   ```
   (No necesitas hacer nada más, el script crea las hojas automáticamente)

---

## PASO 2 — Configurar Google Apps Script

1. Ve a **script.google.com**
2. Crea un proyecto nuevo → nómbralo **"Studio Beauty API"**
3. Pega todo el contenido del archivo `apps-script/Code.gs`
4. **Cambia el token** en la línea 7:
   ```javascript
   const SECRET_TOKEN = 'TuTokenSuperSecreto2024';  // ← pon algo único
   ```
5. Vincula el script a tu spreadsheet:
   - Menú → **Recursos** → **Proyecto de Google Cloud Platform** → Sigue las instrucciones
   - O más fácil: desde el Spreadsheet, ve a **Extensiones → Apps Script** y pega el código ahí

   > 💡 **Recomendado**: Desde el Spreadsheet > Extensiones > Apps Script. Así el script tiene acceso automático a ese spreadsheet.

---

## PASO 3 — Desplegar como Web App

1. En Apps Script, clic en **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Configuración:
   - **Ejecutar como:** Yo (tu cuenta de Google)
   - **Quién tiene acceso:** Cualquier usuario
4. Clic en **Implementar**
5. Autoriza los permisos cuando te lo pida (Calendar + Sheets)
6. **Copia la URL** que aparece, se ve así:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

---

## PASO 4 — Subir a GitHub

```bash
# Descomprime el ZIP, entra a la carpeta
cd studio-beauty

git init
git add .
git commit -m "feat: Studio Beauty inicial"

# Crea repo en github.com y conecta:
git remote add origin https://github.com/TU_USUARIO/studio-beauty.git
git branch -M main
git push -u origin main
```

---

## PASO 5 — Deploy en Vercel

1. Ve a **vercel.com** → New Project → Importa tu repo
2. Antes de hacer deploy, agrega las **Variables de entorno**:

   | Variable | Valor |
   |---|---|
   | `VITE_SCRIPT_URL` | La URL del Apps Script del Paso 3 |
   | `VITE_TOKEN` | El mismo token que pusiste en `Code.gs` |

3. Clic en **Deploy** ✅

---

## PASO 6 — Actualizar el script (si cambias algo)

Cada vez que modifiques el `Code.gs`:
- Menú → **Implementar → Gestionar implementaciones**
- Edita la implementación existente → **Nueva versión** → Implementar

---

## ✅ Verificar que funciona

1. Abre tu app en Vercel
2. En el header debe aparecer **"✓ Sincronizado"** en verde
3. Agrega una cliente de prueba → verifica que aparece en Google Sheets
4. Agenda una cita → verifica que aparece en Google Calendar con color rosado

---

## ❓ Solución de problemas

**"Sin conexión" en la app**
- Verifica que `VITE_SCRIPT_URL` y `VITE_TOKEN` están bien en Vercel
- Asegúrate que el Apps Script está desplegado como "Cualquier usuario"
- El token en Vercel debe ser idéntico al `SECRET_TOKEN` en Code.gs

**El evento de Calendar no se crea**
- Verifica que autorizaste permisos de Calendar al desplegar el script
- En Apps Script → Implementar → Gestionar → vuelve a implementar y autoriza

**Datos no aparecen entre dispositivos**
- Verifica que ambos dispositivos apuntan a la misma URL de Vercel
- Los datos viven en Google Sheets, no en el navegador
