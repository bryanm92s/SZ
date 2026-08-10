## Cambios en `C:\Users\guem01\Desktop\SZ\SZ-ROLES\apps-script\Code.gs`

### 1. Promover `cleanDate` y `_helpers` a top-level
La función `cleanDate` ya está duplicada (local dentro de `sendDailyReportEmail` en líneas 962-972, y en otra forma más estricta dentro de `findClientConflicts` en 242-245). La promuevo a top-level para que los tres reportes y el conflict check la usen igual. Estilo:
```js
function _cleanDate(raw) {
  if(!raw) return '';
  var s = String(raw).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s); if(isNaN(d.getTime())) return '';
  var p = function(n){ return String(n).padStart(2,'0') };
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
```
Borro la copia local dentro de sendDailyReportEmail. (La del conflict check la dejo intacta; es más estricta y no la rompo.)

### 2. Refactor del cálculo de período → un solo `inPeriod(d, period)`
Extraer el predicado a top-level con la MISMA semántica que `ReportsTab.jsx` líneas 198-205, pero parametrizable:
```js
// period = {type:'day'|'week'|'month', day:'YYYY-MM-DD', from:'YYYY-MM-DD', to:'YYYY-MM-DD', ym:'YYYY-MM'}
function _inPeriod(d, period) {
  var x = _cleanDate(d); if(!x) return false;
  if (period.type === 'day')   return x === period.day;
  if (period.type === 'month') return x.slice(0,7) === period.ym;
  // week (Lun-Dom ISO) treatada como range from..to
  return x >= period.from && x <= period.to;
}
```

### 3. Helper `_weekRange(dateStr)` → `{from, to}` Lun-Dom ISO
```js
function _weekRange(todayStr) {
  // dateStr = 'YYYY-MM-DD'
  var d = new Date(todayStr + 'T00:00:00');
  var dow = d.getDay(); // 0=Dom ... 6=Sab
  var monday  = new Date(d);  monday.setDate(d.getDate() - ((dow + 6) % 7));
  var sunday  = new Date(monday); sunday.setDate(monday.getDate() + 6);
  var p = function(n){ return String(n).padStart(2,'0') };
  return {
    from: monday.getFullYear()+'-'+p(monday.getMonth()+1)+'-'+p(monday.getDate()),
    to:   sunday.getFullYear()+'-'+p(sunday.getMonth()+1)+'-'+p(sunday.getDate())
  };
}
```
`((dow + 6) % 7)` → Lunes=0, Domingo=6. El domingo de esa semana es lunes + 6. (Confirmado por AskUserQuestion: rango semanal = Lun-Dom ISO.)

### 4. Helper `_lastDayOfMonth(y, m)` → 'YYYY-MM-DD'
```js
function _lastDayOfMonth(y, m) {
  var d = new Date(y, m, 0); // día 0 del mes siguiente = último día de m
  var p = function(n){ return String(n).padStart(2,'0') };
  return y + '-' + p(m) + '-' + p(d.getDate());
}
```

### 5. Reescribir `_buildReport(period)` como función top-level reutilizable
Esta ES el corazón del cambio. Recibe un `period = {type, day?, from?, to?, ym?}` y devuelve `{userList, totales, label, subjectKind, pageTitle}`. Arma los agregados idénticos a los actuales (citasCreadas/citasAtendidas/ingresos/gastos/domicilios por usuario) pero filtrando por `_inPeriod(a.date, period)` en vez del monthly `inPeriod` actual. La saco del cuerpo de `sendDailyReportEmail` y la uso desde los tres senders.

Cuerpo ≈ 40 líneas (copia de las líneas 978-1023 actuales sustituyendo la lambda `inPeriod` local por `_inPeriod`).

### 6. Tres senders delgados: `sendDailyReportEmail`, `sendWeeklyReportEmail`, `sendMonthlyReportEmail`
Cada uno:
1. Calcula `today`, `tz`.
2. Construye el `period` apropiado:
   - Diario: `{type:'day', day: today}`
   - Semanal: si hoy NO es domingo → `return` (no enviar; el trigger se dispara todos los días pero solo acting on Sunday). Si es domingo: `_weekRange(today)` → `{type:'week', from, to}`.
   - Mensual: si hoy NO es último día del mes → `return`. Si lo es: `{type:'month', ym: yyyy-MM}`.
   
   **Nota de arquitectura de triggers**: Apps Script NO trae trigger "último día del mes" ni "el domingo". La convención usada por el backup existente (líneas 900-905) es `.onWeekDay(ScriptApp.WeekDay.SATURDAY)`. Para el semanal usaré `.onWeekDay(ScriptApp.WeekDay.SUNDAY)`. Para el mensual no existe equivalente: el patrón elegante es dispararlo `everyDays(1)` y salir temprano los días no-últimos (decisión mía, no del usuario). El monthly trigger por lo tanto se incuba con `everyDays(1).atHour(12).nearMinute(0)` igual que el daily; ambos disparan diariamente a las 12, pero el mensual sale sin enviar salvo el día 28/29/30/31 que corresponda. (Esto es aceptable porque un `return` antes del `try` es barato y el email solo se construye/dispara cuando aplica.)
   
3. Llama `_buildReport(period)`.
4. Arma el asunto: `[REPORTE DIARIO] Actividad del equipo — <label>`, `[REPORTE SEMANAL] Actividad del equipo — <label>`, `[REPORTE MENSUAL] Actividad del equipo — <label>` (según AskUserQuestion).
5. Arma el label bajo la emoji 📅 para el cuerpo del mensaje:
   - day: `fmtDate(today)` estilo "vie, 14 ago 2026" — replico el `fmtDate` del frontend (líneas 208-211 usan `Intl.DateTimeFormat`).
   - week: `Lun 10 a Dom 16 ago 2026` (en español).
   - month: `Agosto 2026` (igual que hoy).
6. Cuerpo del mensaje: mismo formato que hoy (✨ header, 📅 label, 📊 Totales, 👥 Por persona, incluyendo el bloque 🛵 domicilios), pero solo con lo del período calculado.
7. Si userList está vacío (día sin actividad) → **enviar igual con ceros** (decisión del AskUserQuestion). En la sección "👥 Por persona" poner la línea `(sin actividad en este período)`.
8. Envía por `GmailApp.sendEmail(recipient, subject, msg, { htmlBody, noReply: true })` — htmlBody con entidades hex (mantengo todo lo del fix de emojis de la sesión previa).

### 7. Helpers de formato de fecha (`_fmtDayLabel`, `_fmtRangeLabel`)
Réplica del `fmtDate` del frontend pero usando `Utilities.formatDate` (Apps Script no tiene `Intl.DateTimeFormat` en v8):
```js
function _fmtDayLabel(dateStr) {
  // 'YYYY-MM-DD' → 'vie, 14 ago 2026'
  return Utilities.formatDate(new Date(dateStr + 'T00:00:00'),
    Session.getScriptTimeZone(), "EEE, d 'de' MMM yyyy");
}
```
Para el rango semanal construyo `"Lun <d> a Dom <d> <Mes> <yyyy>"` combinando `_fmtDayLabel(from)` y `_fmtDayLabel(to)`. Para el mensual uso `_dailyReportMonthLabel(ym)` ya existente.

### 8. Sustituir `setupDailyReportTrigger` / `removeDailyReportTrigger` por el par unitario `setupAllReportTriggers` / `removeAllReportTriggers` (decisión del usuario)
```js
function setupAllReportTriggers() {
  removeAllReportTriggers(); // idempotente: limpia los viejos (incluyendo el antiguo 'sendDailyReportEmail' suelto)
  ScriptApp.newTrigger('sendDailyReportEmail').timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendWeeklyReportEmail').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendMonthlyReportEmail').timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  console.log('OK 3 triggers (daily / weekly-sun / monthly-lastDay) a las 12 p.m.');
}
function removeAllReportTriggers() {
  var names = ['sendDailyReportEmail','sendWeeklyReportEmail','sendMonthlyReportEmail'];
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (names.indexOf(t.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(t); removed++; }
  });
  console.log(removed > 0 ? 'OK '+removed+' triggers eliminados' : 'No habia triggers de reporte');
}
```
Mantengo `setupDailyReportTrigger`/`removeDailyReportTrigger` existentes en desuso por compatibilidad? **NO** — el usuario pidió "una sola fn que instala/elimina los tres", lo reemplazo y aviso en el resumen. Los viejos se borran.

### 9. Caso de coincidencia (domingo + último día del mes)
Ese día se disparan los 3 triggers a las 12, y la admin recibe 3 correos casi simultáneos (DIARIO + SEMANAL + MENSUAL). El usuario eligió "Los tres a las 12 p.m." (no repartir horas), así que respeto eso. Cada uno trae datos distintos (hoy / 7 días / 31 días), los subject los diferencian.

## No cambia
- Frontend (`App.jsx`, `ReportsTab.jsx`, `api.js`, `Auth.jsx`) — sin tocar.
- `findClientConflicts`, `doPost`, `sanitizePayload`, `trackPriceChanges`, layout de Google Sheets — sin tocar.
- Cálculo de los agregados por usuario — copia idéntica del actual, solo cambia la función `inPeriod` (de "mes en curso" a `_inPeriod(d, period)`).
- Estructura del mensaje (emojis, hex entities, `<meta charset>`, wording "incl. en ingresos", "Domicilios: N ($X incl. en ingresos)", per-user line) — 100% idéntica a la sesión previa.
- `getAdminEmail` — sin tocar.

## Verificación
Tres pruebas recomendadas desde el editor de Apps Script:
1. `run sendDailyReportEmail()` hoy (día normal) → correo con datos de SOLO HOY. Si hoy no hubo citas, llega con todo en 0 y "(sin actividad en este período)" (decisión del usuario).
2. `run sendWeeklyReportEmail()` un día NO domingo → no hace nada (`return` silencioso). Fuerza probar el envío escribiendo temporalmente `var FORCE_WEEKLY=true` o testeándolo el domingo.
3. `run sendMonthlyReportEmail()` un día no-fin-de-mes → no hace nada. Forzar como arriba.
4. Run `setupAllReportTriggers()` una vez. Ver en Triggers (panel izquierdo) que existan 3 con handlers `sendDailyReportEmail`, `sendWeeklyReportEmail`, `sendMonthlyReportEmail`.

## Riesgos
- **Coincidencia dom+fin-de-mes = 3 correos a las 12**: posible doble envío si Apps Script dispara delays hacen que dos triggers corran al mismo segundo. Apps Script encola los triggers; el orden es determinista y no hay race en el envío (cada `sendEmail` es independiente). No hay corrección que aplicar — el usuario eligió explícitamente esto.
- **`sendMonthlyReportEmail` dispara todos los días pero solo envía el último**: ligero desperdicio, pero Apps Script no ofrece trigger "último día del mes". Alternativa más barata: cron manual vía Google Calendar API — fuera de scope.
- **`_fmtDayLabel` con `Utilities.formatDate` y tz = America/Bogota**: produce "jue, 13 ago 2026" con mes abreviado en español solo si el script timezone está configurado como America/Bogota; si está mal configurado, saldrá en inglés o con tz distinto. Redundante: el tz ya se usa para `ym` y se asume Colombia. Si sale en inglés, ya lo veras y lo ajustamos a `es-CO` vía strings hardcodeados de días/meses.
- **Bug actual resuelto**: hoy el reporte diario está mostrando mes porque `inPeriod` usa `ym === meses`. Tras el refactor, `_inPeriod(d, {type:'day', day:today})` hace `x === today` estricto. Ese es el fix principal que reportó el usuario ("Los reportes que está enviando son TOTALES").

## Pasos para que tome efecto
1. (Automático) Aplico todos los cambios a `Code.gs`.
2. Apps Script → Deploy → Manage deployments → Edit → New version → Deploy.
3. Apps Script → Run `setupAllReportTriggers()` una vez. Revisa el panel Triggers para confirmar los 3.
4. Si quieres probar el semanal/mensual sin esperar al domingo/fin-de-mes, ejecuta `sendWeeklyReportEmail()` / `sendMonthlyReportEmail()` manualmente desde el editor (eligir la fn en el dropdown + Run). Si tu día de prueba no es domingo/fin-de-mes, los senders saldrán sin enviar; comenta temporalmente el guard `if (...) return;` o cambia la condición para forzarlo.