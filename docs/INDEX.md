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
| [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md) | Operadora / usuario final | Cómo usar la app día a día, sin lenguaje técnico |
| [`ARQUITECTURA_Y_FUNCIONALIDADES.md`](ARQUITECTURA_Y_FUNCIONALIDADES.md) | Desarrollador | Comportamiento real: arquitectura, entidades, reglas de negocio y matriz de funcionalidades |
| [`PRUEBAS_Y_MANTENIMIENTO.md`](PRUEBAS_Y_MANTENIMIENTO.md) | Mantenimiento | Cómo probar, diagnosticar, respaldar, restaurar y desplegar |

### Ruta de lectura sugerida

- **Voy a instalar SZ por primera vez** → [`MANUAL_TECNICO.md`](MANUAL_TECNICO.md)
  (secciones A → G).
- **Voy a usar la app en el estudio** → [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md)
  completo.
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
[`MANUAL_TECNICO.md`](MANUAL_TECNICO.md) sección G.

1. **Destinatario del reporte por correo hardcodeado.** `_sendReportEmail`
   (`apps-script/Code.gs` línea 1540) y `sendWeeklyBackupEmail` (línea 908)
   usan una dirección de correo escrita **dentro del código**, mientras que el
   correo del restablecimiento **sí** es configurable vía la propiedad de
   script `SB_AUTHORIZED_EMAIL`. Para instalar SZ "desde cero" en otro negocio
   hay que editar esas dos líneas.
2. **Dos manifiestos de Apps Script distintos.** Existen `appsscript.json`
   (el activo) y `appsscript.json.txt` (parece una versión anterior) con
   **scopes diferentes**. Ver detalle en `MANUAL_TECNICO.md` sección D.
3. **`SETUP.md` parcialmente desactualizada.** No menciona los reportes
   automáticos por correo, los respaldos automáticos, `VITE_ADMIN_WHATSAPP`
   ni la recuperación de acceso por código.
4. **`README.md` anterior desactualizado.** Decía que los tests cubrían solo
   `helpers.js` y que el reporte era "por día, mes o rango". Ambas cosas
   cambiaron (hay tests del backend y reporte anual). Fue corregido en este
   documento.
