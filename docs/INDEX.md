# SZ — Documentación

Esta carpeta contiene la documentación técnica, funcional y operativa completa
del sistema **SZ**. Está escrita en español y dirigida a tres audiencias
distintas: quien va a **instalar** SZ, quien lo va a **usar** a diario y
quien lo va a **mantener**.

> **Estado del sistema:** SZ está implementado, corregido y probado. Esta
> documentación describe el sistema **existente**, no un sistema planeado.
> Cuando algo no se pudo verificar desde el código, se dice explícitamente.

---

## 📚 Índice de documentos

| Documento | Para quién | Contenido |
|---|---|---|
| [`../README.md`](../README.md) | Todos | Punto de entrada: descripción, stack, estructura, comandos y enlaces |
| [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) | Administrador / implementador | Instalar SZ desde cero: requisitos, variables, Apps Script, Sheets, Calendar, Vercel, seguridad y mantenimiento |
| [`ONBOARDING_CLIENTE.md`](ONBOARDING_CLIENTE.md) | Administrador / comercial | Llevar este mismo programa a **otro negocio**: duplicar el despliegue, cambiar de nombre, elegir catálogo y qué NO se toca |
| [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) | Operadora / usuario final | Cómo usar la app día a día, sin lenguaje técnico |
| [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md) | Desarrollador | Comportamiento real: arquitectura, entidades, reglas de negocio y matriz de funcionalidades |
| [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md) | Mantenimiento | Cómo probar, diagnosticar, respaldar, restaurar y desplegar |

### Ruta de lectura sugerida

- **Voy a instalar SZ por primera vez** → [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md)
  (secciones A → G).
- **Voy a usar la app en el estudio** → [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md)
  completo.
- **Voy a llevar este programa a otro negocio** →
  [`ONBOARDING_CLIENTE.md`](ONBOARDING_CLIENTE.md) completo (es la lista de
  pasos; no exige leer nada más).
- **Necesito entender una regla de negocio concreta** →
  [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md)
  (sección 17: matriz de funcionalidades).
- **Algo falló y necesito saber por qué** →
  [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md)
  (sección "Diagnóstico").

---

## 🗂 Documentos preexistentes del repositorio

Estos archivos ya existían y **no se modificaron** en esta ronda de
documentación. Se conservan por su valor histórico:

| Archivo | Contenido |
|---|---|
| [`../SETUP.md`](../SETUP.md) | Guía de despliegue original, paso a paso. Es más breve que `MANUAL_TECNICO.md`; puede estar desactualizada en detalles (ver observaciones). |
| `../SESION_2026-08-04.md` | Bitácora de la sesión de desarrollo del 4-5 de agosto de 2026. Registro histórico de cambios. |
| `../Manual_Sistema_Gestion.docx` | Manual de uso operativo en formato Word. Es un documento binario; **no se pudo revisar su contenido** en esta tarea. |

---

## ⚠️ Observaciones pendientes detectadas al documentar

Durante el análisis del código real aparecieron puntos que **no se corrigieron**
(por instrucción expresa de documentar, no modificar). Quedan anotados aquí y en
[`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección G. Los **tres primeros fueron
corregidos** después, el **4.º** ya estaba resuelto, y el **5.º** es en realidad
una **restricción de diseño**, no un defecto.

1. ~~**Destinatario del reporte por correo hardcodeado.**~~ ✅ **CORREGIDO.**
   `_sendReportEmail` y `sendWeeklyBackupEmail` usaban una dirección de correo
   escrita **dentro del código**. Ahora los tres puntos (reporte, respaldo
   semanal y restablecimiento) leen `_authorizedEmail()`, que únicamente
   consulta la propiedad de script `SB_AUTHORIZED_EMAIL`. **Ninguna dirección
   de correo queda en el repositorio**, ni siquiera en los tests (usan un
   valor sintético).
   > ⚠️ **Exige acción al desplegar:** crea la propiedad
   > `SB_AUTHORIZED_EMAIL` en el editor de Apps Script **antes** de pegar el
   > `Code.gs` nuevo. Si falta, no se envía nada: el código de
   > restablecimiento se descarta sin gastar el cupo de solicitudes y los
   > reportes/backups se omiten dejando aviso en el log de ejecución.
2. ~~**Dos manifiestos de Apps Script distintos.**~~ ✅ **CORREGIDO.**
   Existían `appsscript.json` y `appsscript.json.txt` con **scopes
   diferentes** y con solo uno trayendo el bloque `webapp`. Se comparó
   contra el manifiesto **realmente desplegado** en producción y resultó
   ser el `.txt` el correcto: se eliminó el duplicado y `appsscript.json`
   se reescribió para que sea el archivo único y fiel a producción.
   > 🔑 **Por qué importaba:** `appsscript.json` carecía de
   > `"access": "ANYONE_ANONYMOUS"`. Copiar **ese** al editor habría
   > dejado la app de Vercel sin poder llamar al script.
3. ~~**`SETUP.md` parcialmente desactualizada.**~~ ✅ **CORREGIDO.**
   Ahora incluye el paso de pegar el **manifiesto**, las **dos** propiedades
   obligatorias (`SB_SYNC_TOKEN` y `SB_AUTHORIZED_EMAIL`), la variable
   `VITE_ADMIN_WHATSAPP`, una sección de **funcionalidades opcionales**
   (reportes y respaldos automáticos) y el diagnóstico de «no llegan los
   reportes». También se corrigió un consejo peligroso que sugería escribir
   el token en `Code.gs`.
4. ~~**`README.md` anterior desactualizado.**~~ ✅ Ya resuelto en esta misma
   documentación: decía que los tests cubrían solo `helpers.js` y que el
   reporte era "por día, mes o rango"; hoy hay tests del backend y reporte
   anual.
5. **Lógica de reporte duplicada (frontend y backend). 🔒 Restricción de
   diseño, NO un defecto.** `reportLines` (`src/helpers.js`) y
   `_sendReportEmail` (`apps-script/Code.gs`) producen el **mismo texto**,
   línea por línea. **No se puede eliminar**: Apps Script y el frontend
   corren en runtimes distintos y el flujo de despliegue es «pegar `Code.gs`
   en el editor de Apps Script», sin ningún paso de build intermedio que
   permita compartir el módulo.
   > ✅ **Mitigación vigente:** el test de paridad en `src/backend.test.js`
   > compara ambos textos y **falla** si se desalinean. No intentar
   > «unificarlos» a mano: rompería el despliegue.
