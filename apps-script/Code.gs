// ╔══════════════════════════════════════════════════════════════╗
// ║  Salome Zuluaga | SZ  ║
// ╚══════════════════════════════════════════════════════════════╝

const SECRET_TOKEN = 'CAMBIA_TU_TOKEN';

const SHEETS = { clients:'Clientes', services:'Servicios', appointments:'Citas', expenses:'Gastos', priceHistory:'HistorialPrecios' };

const JS_KEYS = {
  clients:      ['id','name','phone','createdAt'],
  services:     ['id','name','price','duration'],
  appointments: ['id','clientId','clientName','clientPhone',
                 'serviceIds','serviceNames','servicePrice','servicePrices',
                 'domicilio','domicilioPrice','totalPrice','address',
                 'date','time','createdAt','calendarCreated','calendarEventId','completed','duration','paymentMethod'],
  expenses:     ['id','description','amount','category','date'],
  priceHistory: ['serviceId','serviceName','price','changedAt'],
};

const HEADERS_ES = {
  clients:      ['ID','Nombre','Celular','Fecha Registro'],
  services:     ['ID','Nombre','Precio','Duración (min)'],
  appointments: ['ID','ID Cliente','Nombre Cliente','Celular',
                 'IDs Servicios','Nombres Servicios','Precio Servicios','Precios x Servicio',
                 'Domicilio','Precio Domicilio','Total','Dirección',
                 'Fecha','Hora','Fecha Creación','Evento Creado','ID Evento Calendar','Completada','Duración (min)','Método de pago'],
  expenses:     ['ID','Descripción','Monto','Categoría','Fecha'],
  priceHistory: ['ID Servicio','Nombre Servicio','Precio','Fecha Cambio'],
};

function doGet(e) {
  try {
    if (e.parameter.token !== SECRET_TOKEN) return err('No autorizado');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheets(ss);
    return ok({
      clients:      readSheet(ss,'clients'),
      services:     readSheet(ss,'services'),
      appointments: readSheet(ss,'appointments'),
      expenses:     readSheet(ss,'expenses'),
      priceHistory: readSheet(ss,'priceHistory'),
    });
  } catch(ex) { return err('GET: '+ex.message); }
}

function doPost(e) {
  // Acquire a script lock to prevent concurrent writes from corrupting sheets
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(ex) { return err('Servidor ocupado, reintenta'); }
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.token !== SECRET_TOKEN) { lock.releaseLock(); return err('No autorizado'); }
    // Defensa en profundidad: clip a 0 todo campo monetario antes de
    // persistir, por si alguien llama al endpoint con valores negativos.
    try { sanitizePayload(b); } catch(_) {}
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheets(ss);
    if (b.action==='deleteCalendarEvent') return ok({calResult:deleteCalEvent(b.eventId)});
    if (b.action==='updateCalendarEvent') return ok({calResult:updateCalEvent(b.eventId,b.calendarEvent)});
    if (b.clients      !== undefined) writeSheet(ss,'clients',b.clients);
    if (b.services !== undefined) {
      // ── Regla de negocio: no eliminar servicios con citas futuras
      // activas o en curso. Se valida ANTES de escribir nada (y antes
      // de trackPriceChanges, que sí escribe en HistorialPrecios).
      // Si el payload trae `appointments` se usan esas (son las que van
      // a quedar tras el POST); si no, se leen de la hoja.
      var apptsForCheck = (b.appointments !== undefined && b.appointments !== null)
        ? b.appointments
        : readSheet(ss, 'appointments');
      var svcErr = _serviceDeletionError(b.services, readSheet(ss, 'services'), apptsForCheck, new Date());
      if (svcErr) { lock.releaseLock(); return err(svcErr); }

      if (b.resetPriceHistory) {
        // Full reset: wipe history and seed with the new service prices
        const sh = ss.getSheetByName(SHEETS.priceHistory);
        if (sh) sh.clearContents();
        const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
        const phSh = ss.getSheetByName(SHEETS.priceHistory);
        const headers = HEADERS_ES.priceHistory;
        phSh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]);
        if (b.services.length > 0) {
          const initRows = b.services.map(s => [s.id, s.name, String(s.price), now]);
          phSh.getRange(2, 1, initRows.length, 4).setNumberFormat('@').setValues(initRows);
        }
      } else {
        // Normal save: detect and record price changes
        trackPriceChanges(ss, b.services);
      }
      writeSheet(ss,'services',b.services);
    }
    if (b.appointments !== undefined) writeSheet(ss,'appointments',b.appointments);
    if (b.expenses     !== undefined) writeSheet(ss,'expenses',b.expenses);
    let calResult=null;
    if (b.calendarEvent) calResult=createCalEvent(b.calendarEvent);
    lock.releaseLock();
    return ok({saved:true,calResult});
  } catch(ex) { lock.releaseLock(); return err('POST: '+ex.message); }
}

/* ══════════════════════════════════════════════════════════════
   ELIMINACIÓN DE SERVICIOS — validación de negocio
   Réplica de `serviceDeletionCheck` (src/helpers.js) para que la
   regla no dependa de un botón deshabilitado en React: el backend
   rechaza la escritura si el servicio eliminado tiene citas
   futuras activas o citas en curso.

   Relación cita ⇄ servicio: la cita guarda el id real en
   `serviceIds` (CSV) y, como respaldo, las claves de
   `servicePrices` (JSON {id: precio}). `serviceNames` es solo un
   snapshot del nombre, así que SOLO se usa como último recurso y
   únicamente cuando la cita no trae ningún id y ese nombre es
   único en el catálogo (evita bloquear un servicio homónimo).
══════════════════════════════════════════════════════════════ */

function _normName(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
}

// IDs de servicio que referencia una cita (ver apptServiceIds en helpers.js).
function _apptServiceIds(a) {
  if (!a) return [];
  var out = String(a.serviceIds || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if (out.length > 0) return out;
  var sp = a.servicePrices;
  var parsed = null;
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) parsed = sp;
  else if (typeof sp === 'string' && sp.trim()) {
    try { parsed = JSON.parse(sp); } catch(_) { parsed = null; }
    if (parsed && (typeof parsed !== 'object' || Array.isArray(parsed))) parsed = null;
  }
  return parsed ? Object.keys(parsed).filter(Boolean) : [];
}

function _apptServiceNames(a) {
  return String((a && a.serviceNames) || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}

// Duración efectiva de una cita en minutos (misma regla que safeDuration:
// inválida → 60; válida → recortada a [15, 480]).
function _apptMinutes(a) {
  var n = Math.round(Number(a && a.duration));
  if (!(n > 0)) return 60;
  return Math.min(Math.max(n, 15), 480);
}

// Momento de la cita respecto a `now`:
//   'done'   → finalizada (completada o 'noshow'); es histórico.
//   'past'   → su franja [inicio, fin) ya terminó; sigue pendiente.
//   'live'   → EN CURSO: inicio <= now < fin.
//   'future' → aún no empieza.
//   'unknown'→ sin fecha/hora válida: no se puede evaluar.
// Usa fecha + hora + duración + estado, nunca solo la fecha.
function _apptLife(a, now) {
  if (!a) return 'unknown';
  if (a.completed === true || a.completed === 'true' || a.completed === 'noshow') return 'done';
  var d = _cleanDate(a.date);
  var m = String(a.time || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!d || !m) return 'unknown';
  var start = new Date(Number(d.slice(0,4)), Number(d.slice(5,7)) - 1, Number(d.slice(8,10)),
                       Number(m[1]), Number(m[2]), 0);
  if (isNaN(start.getTime())) return 'unknown';
  var end = new Date(start.getTime() + _apptMinutes(a) * 60000);
  var t = now.getTime();
  if (t >= end.getTime()) return 'past';
  if (t >= start.getTime()) return 'live';
  return 'future';
}

function _apptUsesService(a, ids, nameKey, nameAmbiguous) {
  var aid = _apptServiceIds(a);
  if (aid.length > 0) {
    for (var i = 0; i < aid.length; i++) if (ids[aid[i]]) return true;
    return false;
  }
  if (!nameKey || nameAmbiguous) return false;
  var names = _apptServiceNames(a);
  for (var j = 0; j < names.length; j++) if (_normName(names[j]) === nameKey) return true;
  return false;
}

// `newServices` : catálogo que el cliente pide persistir.
// `curServices` : catálogo actual en la hoja (para detectar qué se eliminó).
// `appts`       : citas vigentes (las del payload o las de la hoja).
// Devuelve null si la eliminación está permitida, o un mensaje de error.
function _serviceDeletionError(newServices, curServices, appts, now) {
  var list    = Array.isArray(newServices) ? newServices : [];
  var catalog = Array.isArray(curServices) ? curServices : [];
  var apptList = Array.isArray(appts) ? appts : [];

  var keep = {};
  list.forEach(function(s){ if (s && s.id !== undefined && s.id !== null) keep[String(s.id)] = true; });
  var removed = catalog.filter(function(s){
    return s && s.id !== undefined && s.id !== null && !keep[String(s.id)];
  });
  if (removed.length === 0) return null;

  var now2 = now || new Date();
  var nameCount = {};
  catalog.forEach(function(s){ var k = _normName(s && s.name); nameCount[k] = (nameCount[k] || 0) + 1; });

  for (var r = 0; r < removed.length; r++) {
    var svc = removed[r];
    var ids = {}; ids[String(svc.id)] = true;
    var nameKey = _normName(svc.name);
    var ambiguous = !!nameKey && nameCount[nameKey] > 1;
    var blockers = apptList.filter(function(a){
      var life = _apptLife(a, now2);
      if (life !== 'future' && life !== 'live') return false;
      return _apptUsesService(a, ids, nameKey, ambiguous);
    });
    if (blockers.length > 0) {
      var n = blockers.length;
      return 'No se puede eliminar el servicio "' + (svc.name || svc.id) + '": ' + n +
             ' cita' + (n === 1 ? '' : 's') + ' programada' + (n === 1 ? '' : 's') +
             ' o en curso aún lo utiliza' + (n === 1 ? '' : 'n') +
             '. Completa o elimina esas citas primero.';
    }
  }
  return null;
}

function createCalEvent(evt) {
  try {
    const cal=CalendarApp.getDefaultCalendar();
    const dur=safeDuration(evt.duration);
    const s=mkDate(evt.date,evt.time,0), e=mkDate(evt.date,evt.time,dur);
    const dom=evt.domicilio==='true'||evt.domicilio===true;
    const desc='👤 '+evt.clientName+'\n📱 '+evt.clientPhone+
                '\n✨ '+evt.serviceNames+
                '\n💳 Total: $'+clip0(Number(evt.totalPrice||0)).toLocaleString('es-CO')+
                (dom?'\n🛵 Domicilio: $'+clip0(Number(evt.domicilioPrice||0)).toLocaleString('es-CO')+
                     (evt.address?'\n📍 '+evt.address:''):'');
    const event=cal.createEvent('✨ '+evt.serviceNames+' — '+evt.clientName,s,e,{description:desc,sendInvites:false});
    event.setColor(CalendarApp.EventColor.MAUVE);
    return {ok:true,eventId:event.getId()};
  } catch(ex){return {ok:false,error:ex.message};}
}

function updateCalEvent(eventId,evt) {
  try {
    if(!eventId) return {ok:false,error:'Sin ID'};
    const event=CalendarApp.getEventById(eventId);
    if(!event) return {ok:false,error:'Evento no encontrado'};
    // Duración: la que envía la app; si no viene, se conserva la que ya tenía el evento.
    const sent=Number(evt.duration);
    const dur=sent>0 ? safeDuration(sent) : (Math.round((event.getEndTime().getTime()-event.getStartTime().getTime())/60000) || 60);
    event.setTime(mkDate(evt.date,evt.time,0),mkDate(evt.date,evt.time,dur));
    return {ok:true};
  } catch(ex){return {ok:false,error:ex.message};}
}

function deleteCalEvent(eventId) {
  try {
    if(!eventId) return {ok:false,error:'Sin ID'};
    const event=CalendarApp.getEventById(eventId);
    if(!event) return {ok:true};
    event.deleteEvent();
    return {ok:true};
  } catch(ex){return {ok:false,error:ex.message};}
}

// Duración válida en minutos: entero entre 15 y 480; si no es válida → 60.
function safeDuration(v) {
  const n = Math.round(Number(v));
  if (!(n > 0)) return 60;
  return Math.min(Math.max(n, 15), 480);
}

function mkDate(dateStr,timeStr,offsetMin) {
  const [y,m,d]=String(dateStr).split('-').map(Number);
  const [hh,mm]=String(timeStr).split(':').map(Number);
  const dt=new Date(y,m-1,d,hh,mm,0);
  dt.setMinutes(dt.getMinutes()+offsetMin);
  return dt;
}


/* ══════════════════════════════════════════════════════════════
   RESPALDO AUTOMÁTICO DIARIO — Google Drive
   Se ejecuta todos los días a las 11:00 PM automáticamente.
   Guarda una copia de la Sheet en Drive → carpeta "PROYECTOS/Backups / [nombre]"
   Conserva los últimos 30 días y elimina los más antiguos.
══════════════════════════════════════════════════════════════ */

/**
 * Crea una copia de seguridad de la hoja activa en Google Drive.
 * Llamar manualmente la primera vez o dejar que el trigger lo haga.
 */
function createDailyBackup() {
  try {
    const ss         = SpreadsheetApp.getActiveSpreadsheet();
    const ssName     = ss.getName();
    const ssId       = ss.getId();
    const today      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const backupName = ssName + ' — Backup ' + today;

    // Buscar o crear la carpeta PROYECTOS en Drive
    const proyectosIt = DriveApp.getFoldersByName('BACKUP-PROYECTO');
    const rootFolder  = proyectosIt.hasNext() ? proyectosIt.next() : DriveApp.createFolder('BACKUP-PROYECTO');

    // Buscar o crear la carpeta Backups dentro de BACKUP-PROYECTO
    const parentName = 'Backups';
    const parentIt   = rootFolder.getFoldersByName(parentName);
    const parentFolder = parentIt.hasNext() ? parentIt.next() : rootFolder.createFolder(parentName);

    // Buscar o crear la subcarpeta con el nombre del Spreadsheet
    const childIt = parentFolder.getFoldersByName(ssName);
    const backupFolder = childIt.hasNext() ? childIt.next() : parentFolder.createFolder(ssName);

    // Verificar si ya existe un backup de hoy (evitar duplicados)
    const existing = backupFolder.getFilesByName(backupName);
    if (existing.hasNext()) {
      console.log('Backup de hoy ya existe: ' + backupName);
      return;
    }

    // Copiar el archivo
    const original = DriveApp.getFileById(ssId);
    original.makeCopy(backupName, backupFolder);
    console.log('✅ Backup creado: ' + backupName);

    // Limpiar backups con más de 30 días
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const files = backupFolder.getFiles();
    let deleted = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated() < cutoff) {
        file.setTrashed(true);
        deleted++;
      }
    }
    if (deleted > 0) console.log('🗑️ Backups eliminados (>30 días): ' + deleted);

  } catch(ex) {
    console.error('❌ Error en backup: ' + ex.message);
  }
}

/**
 * Instala el trigger automático diario a las 11:00 PM.
 * Ejecutar UNA SOLA VEZ manualmente desde el editor de Apps Script.
 * Menú: Ejecutar → setupDailyBackupTrigger
 */
function setupDailyBackupTrigger() {
  // Eliminar triggers anteriores del mismo nombre para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'createDailyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Crear trigger diario a las 11:00 PM
  ScriptApp.newTrigger('createDailyBackup')
    .timeBased()
    .everyDays(1)
    .atHour(23)           // 11 PM hora del script
    .nearMinute(0)
    .create();

  console.log('✅ Trigger configurado: backup diario a las 11:00 PM en carpeta "Backups / ' +
    SpreadsheetApp.getActiveSpreadsheet().getName() + '"');
}

/**
 * Desactiva el trigger de backup (si ya no se necesita).
 */
function removeDailyBackupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'createDailyBackup') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log(removed > 0 ? '✅ Trigger eliminado' : 'No se encontró el trigger');
}

/* ══════════════════════════════════════════════════════════════
   ENVÍO SEMANAL DEL ÚLTIMO BACKUP — Sábados 9:00 AM
   Busca el backup más reciente en Drive y lo envía por correo.
══════════════════════════════════════════════════════════════ */

/**
 * Envía por correo el último backup de esta Sheet.
 * Se ejecuta automáticamente los sábados a las 9:00 AM.
 */
function sendWeeklyBackupEmail() {
  try {
    const ss         = SpreadsheetApp.getActiveSpreadsheet();
    const ssName     = ss.getName();
    const recipient  = 'bryanmorales8240@gmail.com';

    // ── Localizar la carpeta de backups ──────────────────────
    const proyectosIt = DriveApp.getFoldersByName('BACKUP-PROYECTO');
    if (!proyectosIt.hasNext()) throw new Error('Carpeta BACKUP-PROYECTO no encontrada.');
    const rootFolder = proyectosIt.next();

    const parentIt = rootFolder.getFoldersByName('Backups');
    if (!parentIt.hasNext()) throw new Error('Carpeta Backups no encontrada.');
    const parentFolder = parentIt.next();

    const childIt = parentFolder.getFoldersByName(ssName);
    if (!childIt.hasNext()) throw new Error('Carpeta de backups de "' + ssName + '" no encontrada.');
    const backupFolder = childIt.next();

    // ── Encontrar el backup más reciente ─────────────────────
    const files = backupFolder.getFiles();
    let latestFile = null;
    let latestDate = new Date(0);

    while (files.hasNext()) {
      const file = files.next();
      const created = file.getDateCreated();
      if (created > latestDate) {
        latestDate = created;
        latestFile = file;
      }
    }

    if (!latestFile) throw new Error('No se encontraron backups en la carpeta.');

    // ── Exportar como Excel real (.xlsx) ─────────────────────
    const exportUrl = 'https://docs.google.com/spreadsheets/d/' +
                      latestFile.getId() +
                      '/export?format=xlsx';

    const token    = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const blob = response.getBlob().setName(latestFile.getName() + '.xlsx');

    // ── Preparar y enviar el correo con el archivo adjunto ───
    const dateStr = Utilities.formatDate(latestDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const subject = '[BACKUP] ' + ssName + ' | ' + dateStr;
    const body =
      'Hola,<br><br>' +
      'Se adjunta el último backup disponible de la base de datos <b>' + ssName + '</b>.<br><br>' +
      '&#128196; Archivo: ' + latestFile.getName() + '<br>' +
      '&#128197; Fecha del backup: ' + dateStr + '<br><br>' +
      'Este correo se genera automáticamente cada sábado a las 9:00 AM.<br><br>' +
      '&#8212; Sistema de respaldo automático';

    GmailApp.sendEmail(recipient, subject, '', {
      htmlBody: body,
      attachments: [blob]
    });
    console.log('✅ Backup enviado a ' + recipient + ': ' + latestFile.getName());

  } catch(ex) {
    console.error('❌ Error al enviar backup: ' + ex.message);
  }
}

/**
 * Instala el trigger semanal los sábados a las 9:00 AM.
 * Ejecutar UNA SOLA VEZ manualmente desde el editor de Apps Script.
 */
function setupWeeklyEmailTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'sendWeeklyBackupEmail') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('sendWeeklyBackupEmail')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(9)
    .nearMinute(0)
    .create();

  console.log('✅ Trigger configurado: envío semanal los sábados a las 9:00 AM');
}

/**
 * Desactiva el trigger de envío semanal (si ya no se necesita).
 */
function removeWeeklyEmailTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'sendWeeklyBackupEmail') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log(removed > 0 ? '✅ Trigger de email eliminado' : 'No se encontró el trigger');
}

/* ══════════════════════════════════════════════════════════════
   REPORTES AUTOMÁTICOS POR CORREO (12:00 p.m. hora Colombia)
   - DIARIO  : todos los días, solo citas/gastos de HOY.
   - SEMANAL : cada domingo, abarca Lun-Dom ISO de la semana en curso.
   - MENSUAL : último día del mes, abarca el mes completo en curso.
   Cada envío replica el cuerpo del botón "WhatsApp admin" del ReportTab
   (App.jsx), con emojis vía String.fromCharCode (plain text) + entidades
   HTML hex &#xNNNNN; (htmlBody, immune a charset). Si el día no tuvo
   actividad, se envía igual con todo en 0.
   - setupAllReportTriggers()  : instala los 3 (idempotente). Ejecutar 1 vez.
   - removeAllReportTriggers() : los elimina.
══════════════════════════════════════════════════════════════ */

// ── Helpers de período (réplica del ReportTab de App.jsx) ──
// cleanDate permissive: acepta 'YYYY-MM-DD' literal o cualquier string
// parseable por new Date(). Devuelve '' si no se puede normalizar.
function _cleanDate(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    var p = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  } catch(_) { return ''; }
}

// period = {type:'day'|'week'|'month', day?, from?, to?, ym?}
// 'week' se trata como range from..to (Lun-Dom ISO).
function _inPeriod(d, period) {
  var x = _cleanDate(d); if (!x) return false;
  if (period.type === 'day')   return x === period.day;
  if (period.type === 'month') return x.slice(0,7) === period.ym;
  // week (range Lun-Dom ISO)
  return x >= period.from && x <= period.to;
}

// Devuelve {from, to} del Lun-Dom ISO de la semana que contiene dateStr.
function _weekRange(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var dow = d.getDay();  // 0=Dom ... 6=Sab
  var monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  var p = function(n){ return String(n).padStart(2, '0'); };
  return {
    from: monday.getFullYear() + '-' + p(monday.getMonth()+1) + '-' + p(monday.getDate()),
    to:   sunday.getFullYear()   + '-' + p(sunday.getMonth()+1)   + '-' + p(sunday.getDate())
  };
}

// Devuelve 'YYYY-MM-DD' del último día del mes m (1-12) del año y.
function _lastDayOfMonth(y, m) {
  var d = new Date(y, m, 0);  // día 0 del mes siguiente = último día de m
  var p = function(n){ return String(n).padStart(2, '0'); };
  return y + '-' + p(m) + '-' + p(d.getDate());
}

// 'YYYY-MM-DD' → 'vie, 14 ago 2026' (es-CO vía Utilities.formatDate).
function _fmtDayLabel(dateStr) {
  return Utilities.formatDate(
    new Date(dateStr + 'T00:00:00'),
    Session.getScriptTimeZone(),
    "EEE, d 'de' MMM yyyy"
  );
}

// 'YYYY-MM-DD','YYYY-MM-DD' → 'Lun 10 a Dom 16 ago 2026'
function _fmtRangeLabel(from, to) {
  return _fmtDayLabel(from) + ' a ' + _fmtDayLabel(to);
}

// Etiqueta "Mes Año" para el subject/cuerpo.
function _monthLabel(ym) {
  var NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = String(ym).split('-');
  return NAMES[Number(parts[1]) - 1] + ' ' + parts[0];
}

// ── _buildReport(period) → agregados globales del período ─────
// Réplica fiel del ReportTab del App.jsx acá: citas (creadas/agendadas/
// completadas/pendientes), ingresos (recibido), proyectado, gastos, neto,
// domicilios (cantidad + domRevenue), top servicios por demanda.
function _buildReport(period) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var appts = readSheet(ss, 'appointments');
  var exps  = readSheet(ss, 'expenses');

  var toN = function(v){ var n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
  var boolV = function(v){ return v === true || v === 'true'; };

  // Citas agendadas PARA el período (por fecha de la cita)
  var apptsInPeriod = (appts || []).filter(function(a){
    var d = _cleanDate(a.date);
    if (!d) return false;
    return _inPeriod(d, period);
  });

  // Citas CREADAS en el período (por createdAt), permite tener la cita en otro día
  var createdInPeriod = (appts || []).filter(function(a){
    var c = _cleanDate(String(a.createdAt||'').slice(0,10)) || _cleanDate(a.date);
    if (!c) return false;
    return _inPeriod(c, period);
  });

  var created   = createdInPeriod.length;
  var scheduled = apptsInPeriod.length;
  var completed = apptsInPeriod.filter(function(a){ return boolV(a.completed) && a.completed !== 'noshow'; }).length;
  var pending   = apptsInPeriod.filter(function(a){ return !boolV(a.completed) && a.completed !== 'noshow'; }).length;
  var noshow    = apptsInPeriod.filter(function(a){ return a.completed === 'noshow'; }).length;
  var completionRate = scheduled > 0 ? Math.round(completed / scheduled * 100) : 0;

  var revenue   = apptsInPeriod
    .filter(function(a){ return boolV(a.completed) && a.completed !== 'noshow'; })
    .reduce(function(s,a){ return s + toN(a.totalPrice || a.servicePrice || 0); }, 0);
  var projected = apptsInPeriod
    .reduce(function(s,a){ return a.completed === 'noshow' ? s : s + toN(a.totalPrice || a.servicePrice || 0); }, 0);

  // Gastos del período (por range from..to o day)
  var fromStr, toStr;
  if (period.type === 'day')   { fromStr = period.day; toStr = period.day; }
  else if (period.type === 'month') { fromStr = period.ym + '-01'; toStr = _lastDayOfMonth(Number(period.ym.slice(0,4)), Number(period.ym.slice(5,7))); }
  else                          { fromStr = period.from; toStr = period.to; }
  var expensesInPeriod = (exps || []).filter(function(e){
    var x = _cleanDate(e.date);
    if (!x) return false;
    return x >= fromStr && x <= toStr;
  });
  var totalExpenses = expensesInPeriod.reduce(function(s,e){ return s + toN(e.amount||0); }, 0);
  var neto = revenue - totalExpenses;

  // Domicilios (cantidad de citas + ingresos por domicilio en completadas)
  var domicilios = apptsInPeriod.filter(function(a){ return boolV(a.domicilio); }).length;
  var domRevenue = apptsInPeriod
    .filter(function(a){ return boolV(a.completed) && a.completed !== 'noshow' && boolV(a.domicilio); })
    .reduce(function(s,a){ return s + toN(a.domicilioPrice||0); }, 0);

  // Top servicios por demanda (sobre completadas)
  var svcStats = {};
  apptsInPeriod.filter(function(a){ return boolV(a.completed) && a.completed !== 'noshow'; })
    .forEach(function(a){
      var names = String(a.serviceNames || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      names.forEach(function(n){
        if (!svcStats[n]) svcStats[n] = { name: n, count: 0, revenue: 0 };
        svcStats[n].count += 1;
        svcStats[n].revenue += names.length ? toN(a.servicePrice) / names.length : toN(a.servicePrice);
      });
    });
  var topByDemand = Object.keys(svcStats).map(function(k){ return svcStats[k]; })
    .sort(function(a,b){ return b.count - a.count; }).slice(0, 3);

  var label;
  if (period.type === 'day')        label = _fmtDayLabel(period.day);
  else if (period.type === 'week')  label = _fmtRangeLabel(period.from, period.to);
  else                              label = _monthLabel(period.ym);

  return {
    created: created, scheduled: scheduled, completed: completed,
    pending: pending, noshow: noshow, completionRate: completionRate,
    revenue: revenue, projected: projected,
    totalExpenses: totalExpenses, neto: neto,
    domicilios: domicilios, domRevenue: domRevenue,
    topByDemand: topByDemand,
    label: label
  };
}

// ── Núcleo: arma el mensaje (plain + HTML) y lo envía ─────────
// period + kind ('DIARIO'|'SEMANAL'|'MENSUAL'). Réplica del sendWA
// del ReportTab de App.jsx acá, adaptada a correo.
function _sendReportEmail(period, kind) {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var recipient = 'bryanmorales8240@gmail.com';

  initSheets(SpreadsheetApp.getActiveSpreadsheet());
  var r = _buildReport(period);

  // ── Emojis (plain text via String.fromCharCode)
  var SPARK  = String.fromCharCode(0x2728);                   // ✨
  var CAL    = String.fromCharCode(0xD83D, 0xDCC5);             // 📅
  var CHART  = String.fromCharCode(0xD83D, 0xDCCA);             // 📊
  var MONEY  = String.fromCharCode(0xD83D, 0xDCB0);             // 💰
  var MOTO   = String.fromCharCode(0xD83D, 0xDEF5);             // 🛵
  var BULLET = String.fromCharCode(0x2022);                     // •

  // ── Emojis (HTML hex entities para htmlBody — immune a charset)
  var hSPARK = '&#x2728;', hCAL = '&#x1F4C5;', hCHART = '&#x1F4CA;',
      hMONEY = '&#x1F4B0;', hMOTO = '&#x1F6F5;', hBULLET = '&#x2022;';

  function fmtM(n){ n = Number(n) || 0; return '$' + n.toLocaleString('es-CO'); }

  // ── PLAIN TEXT ──────────────────────────────────────
  var lines = [];
  lines.push(SPARK + ' *Reporte de actividad*');
  lines.push(CAL + ' ' + r.label);
  lines.push('');
  lines.push(CHART + ' *Citas*');
  lines.push(BULLET + ' Creadas (registradas): *' + r.created + '*');
  lines.push(BULLET + ' Agendadas para el per\u00edodo: *' + r.scheduled + '*');
  lines.push(BULLET + ' Completadas: *' + r.completed + '*' + (r.pending ? ' \u00b7 Pendientes: ' + r.pending : ''));
  lines.push(BULLET + ' Tasa completado: *' + r.completionRate + '%*');
  lines.push('');
  lines.push(MONEY + ' *Ingresos*');
  lines.push(BULLET + ' Recibido: *' + fmtM(r.revenue) + '*');
  lines.push(BULLET + ' Proyectado: *' + fmtM(r.projected) + '*');
  lines.push(BULLET + ' Gastos: *' + fmtM(r.totalExpenses) + '*');
  lines.push(BULLET + ' Neto: *' + fmtM(r.neto) + '*');
  if (r.domicilios > 0) {
    lines.push('', MOTO + ' *Domicilios*: ' + r.domicilios + ' \u00b7 ' + fmtM(r.domRevenue));
  }
  if (r.topByDemand.length > 0) {
    lines.push('', SPARK + ' *Top servicios*');
    var ord = ['1.','2.','3.'];
    r.topByDemand.forEach(function(s, i){
      lines.push(ord[i] + ' ' + s.name + ' \u2014 ' + s.count + 'x (' + fmtM(Math.round(s.revenue)) + ')');
    });
  }
  lines.push('', '_Generado ' + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss") + '_');

  var msg = lines.join('\n');
  var stamp = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm");
  var subject = '[REPORTE ' + kind + '] Actividad - ' + r.label + ' (' + stamp + ')';

  // ── HTML entity escape (concat-built entities to dodge editor normalization)
  var AMP = '&' + 'amp;', LT = '&' + 'lt;', GT = '&' + 'gt;';
  function esc(s){ return String(s)
    .replace(/&/g, AMP).replace(/</g, LT).replace(/>/g, GT);
  }

  // ── HTML BODY ──────────────────────────────────────
  var hlines = [];
  hlines.push(hSPARK + ' <b>Reporte de actividad</b>');
  hlines.push(hCAL + ' ' + esc(r.label));
  hlines.push('');
  hlines.push(hCHART + ' <b>Citas</b>');
  hlines.push(hBULLET + ' Creadas (registradas): <b>' + r.created + '</b>');
  hlines.push(hBULLET + ' Agendadas para el per&#x00ed;odo: <b>' + r.scheduled + '</b>');
  hlines.push(hBULLET + ' Completadas: <b>' + r.completed + '</b>' + (r.pending ? ' \u00b7 Pendientes: ' + r.pending : ''));
  hlines.push(hBULLET + ' Tasa completado: <b>' + r.completionRate + '%</b>');
  hlines.push('');
  hlines.push(hMONEY + ' <b>Ingresos</b>');
  hlines.push(hBULLET + ' Recibido: <b>' + esc(fmtM(r.revenue)) + '</b>');
  hlines.push(hBULLET + ' Proyectado: <b>' + esc(fmtM(r.projected)) + '</b>');
  hlines.push(hBULLET + ' Gastos: <b>' + esc(fmtM(r.totalExpenses)) + '</b>');
  hlines.push(hBULLET + ' Neto: <b>' + esc(fmtM(r.neto)) + '</b>');
  if (r.domicilios > 0) {
    hlines.push('', hMOTO + ' <b>Domicilios</b>: ' + r.domicilios + ' \u00b7 ' + esc(fmtM(r.domRevenue)));
  }
  if (r.topByDemand.length > 0) {
    hlines.push('', hSPARK + ' <b>Top servicios</b>');
    var hord = ['1.','2.','3.'];
    r.topByDemand.forEach(function(s, i){
      hlines.push(hord[i] + ' ' + esc(s.name) + ' \u2014 ' + s.count + 'x (' + esc(fmtM(Math.round(s.revenue))) + ')');
    });
  }
  hlines.push('', '<i>Generado ' + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss") + '</i>');

  var htmlBody =
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<div style="font-family:monospace;white-space:pre-wrap;line-height:1.5;color:#222;background:#fff;padding:8px">' +
    hlines.join('\n').replace(/\n/g, '<br>') +
    '</div>' +
    '<br><br><small style="color:#888">Reporte autom\u00e1tico ' + kind.toLowerCase() +
    ' \u2014 12:00 p.m. (hora Colombia). Activa/desactiva con ' +
    '<code>setupAllReportTriggers()</code> / <code>removeAllReportTriggers()</code>.</small>' +
    '</body></html>';

  GmailApp.sendEmail(recipient, subject, msg, { htmlBody: htmlBody, noReply: true });
  console.log('OK Reporte ' + kind + ' enviado a ' + recipient);
}

/**
 * REPORTE DIARIO (todos los días a las 12 p.m.) — solo citas/gastos de HOY.
 */
function sendDailyReportEmail() {
  try {
    var tz = Session.getScriptTimeZone();
    var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    _sendReportEmail({ type: 'day', day: today }, 'DIARIO');
  } catch(ex) {
    console.error('ERROR al enviar reporte diario: ' + ex.message);
  }
}

/**
 * REPORTE SEMANAL (cada domingo a las 12 p.m.) — Lun-Dom ISO de esta semana.
 * Guard: si hoy no es domingo, sale sin enviar (defensive programming).
 */
function sendWeeklyReportEmail() {
  try {
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    if (now.getDay() !== 0) {
      console.log('SKIP reporte semanal: hoy no es domingo (' + now.getDay() + ')');
      return;
    }
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    var wr = _weekRange(today);
    _sendReportEmail({ type: 'week', from: wr.from, to: wr.to }, 'SEMANAL');
  } catch(ex) {
    console.error('ERROR al enviar reporte semanal: ' + ex.message);
  }
}

/**
 * REPORTE MENSUAL (último día del mes a las 12 p.m.) — mes completo en curso.
 * Apps Script no tiene trigger "último día del mes"; el trigger dispara
 * todos los días y esta función sale sin enviar salvo que hoy sea el último.
 */
function sendMonthlyReportEmail() {
  try {
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth() + 1;
    var lastDay = _lastDayOfMonth(y, m);
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    if (today !== lastDay) {
      console.log('SKIP reporte mensual: hoy (' + today + ') no es fin de mes (' + lastDay + ')');
      return;
    }
    var ym = Utilities.formatDate(now, tz, 'yyyy-MM');
    _sendReportEmail({ type: 'month', ym: ym }, 'MENSUAL');
  } catch(ex) {
    console.error('ERROR al enviar reporte mensual: ' + ex.message);
  }
}

/**
 * Instala los 3 triggers: diario (everyDays 12:00), semanal (domingo 12:00),
 * mensual (everyDays 12:00 + guard de fin-de-mes). Idempotente.
 */
function setupAllReportTriggers() {
  removeAllReportTriggers();
  ScriptApp.newTrigger('sendDailyReportEmail')
    .timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendWeeklyReportEmail')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendMonthlyReportEmail')
    .timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  console.log('OK 3 triggers (daily / weekly-sun / monthly-lastDay) a las 12:00 p.m.');
}

/**
 * Elimina los 3 triggers de reporte (o los que existan). Idempotente.
 */
function removeAllReportTriggers() {
  var names = ['sendDailyReportEmail','sendWeeklyReportEmail','sendMonthlyReportEmail'];
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (names.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log(removed > 0
    ? 'OK ' + removed + ' trigger(s) de reporte eliminados'
    : 'No hab\u00eda triggers de reporte');
}

function trackPriceChanges(ss, newServices) {
  try {
    // Read current prices from the sheet before overwriting
    const current = readSheet(ss, 'services');
    const currentMap = {};
    current.forEach(s => { currentMap[s.id] = s; });

    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
    const changes = [];

    newServices.forEach(s => {
      const prev = currentMap[s.id];
      if (!prev) {
        // New service — record its initial price
        changes.push({ serviceId: s.id, serviceName: s.name, price: String(s.price), changedAt: now });
      } else if (String(prev.price) !== String(s.price)) {
        // Price changed — record the NEW price with timestamp
        changes.push({ serviceId: s.id, serviceName: s.name, price: String(s.price), changedAt: now });
      }
    });

    if (changes.length === 0) return;

    // Append to HistorialPrecios sheet
    initSheets(ss); // ensure sheet exists
    const sh = ss.getSheetByName(SHEETS.priceHistory);
    const keys = JS_KEYS.priceHistory;
    const headers = HEADERS_ES.priceHistory;

    // Write header if sheet is empty
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]);
    }

    const rows = changes.map(c => keys.map(k => c[k] || ''));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, keys.length)
      .setNumberFormat('@')
      .setValues(rows);

  } catch(ex) {
    console.error('trackPriceChanges error: ' + ex.message);
  }
}

function initSheets(ss) {
  // Only create sheets that are actually missing (skip if all present)
  const names = Object.values(SHEETS);
  const existing = ss.getSheets().map(s=>s.getName());
  names.forEach(n=>{ if(!existing.includes(n)) ss.insertSheet(n); });
}

function readSheet(ss,key) {
  const sh=ss.getSheetByName(SHEETS[key]);
  const last=sh.getLastRow();
  if(last<2) return [];
  const nCols=JS_KEYS[key].length;
  const lastCol=sh.getLastColumn();
  const sCols=Math.min(nCols,lastCol);
  // Alertar si la hoja tiene más columnas de las esperadas (edición manual):
  // se ignorarían silenciosamente. Si tiene menos, los campos faltantes llegan como ''.
  if(lastCol>nCols) console.warn('[readSheet] "'+SHEETS[key]+'" tiene '+lastCol+' columnas, se esperaban '+nCols+'. Se ignoran las extras.');
  if(lastCol<nCols && lastCol>0) console.warn('[readSheet] "'+SHEETS[key]+'" tiene '+lastCol+' columnas, se esperaban '+nCols+'. Los campos faltantes se rellenan con "".');
  const data=sh.getRange(1,1,last,sCols).getValues();
  const keys=JS_KEYS[key];
  return data.slice(1).filter(row=>row[0]!==''&&row[0]!==null&&row[0]!==undefined).map(row=>{
    const obj={};
    keys.forEach((k,i)=>{obj[k]=i<sCols?cellStr(row[i],k):'';});
    return obj;
  });
}

function writeSheet(ss,key,rows) {
  const sh=ss.getSheetByName(SHEETS[key]);
  const keys=JS_KEYS[key]; const headers=HEADERS_ES[key];
  sh.clearContents();
  const nCols=keys.length; const nRows=Math.max((rows||[]).length+1,2);
  sh.getRange(1,1,nRows,nCols).setNumberFormat('@');
  const data=[headers,...(rows||[]).map(r=>keys.map(k=>(r[k]!==null&&r[k]!==undefined)?String(r[k]):''))];
  sh.getRange(1,1,data.length,nCols).setValues(data);
}

function cellStr(v,key) {
  if(v instanceof Date){const y=v.getFullYear(),m=String(v.getMonth()+1).padStart(2,'0'),d=String(v.getDate()).padStart(2,'0');return y+'-'+m+'-'+d;}
  if(typeof v==='number'&&v>=0&&v<1){const tot=Math.round(v*1440);return String(Math.floor(tot/60)).padStart(2,'0')+':'+String(tot%60).padStart(2,'0');}
  if(v===null||v===undefined) return '';
  return String(v);
}

function ok(data){return ContentService.createTextOutput(JSON.stringify({ok:true,data})).setMimeType(ContentService.MimeType.JSON);}
function err(msg){return ContentService.createTextOutput(JSON.stringify({ok:false,error:msg})).setMimeType(ContentService.MimeType.JSON);}

/* ───────────────────────────────────────────────────────────────
   SANITIZACIÓN DE ENTRADA — defensa en profundidad
   El frontend ya bloquea valores negativos en los inputs y al guardar,
   pero alguien podría llamar al endpoint directamente con un JSON
   malicioso. Aquí clipamos a 0 todo campo monetario antes de
   persistirlo, para que nunca se guarden valores negativos.
───────────────────────────────────────────────────────────────── */

// Devuelve el número si es >= 0, o 0 si es negativo/NaN. Strings
// numéricos y vacíos se normalizan; otros tipos pasan tal cual.
const clip0 = v => {
  const n = Number(v);
  return (n !== n || n < 0) ? 0 : n;   // NaN o negativo → 0
};

function sanitizeNumberField(obj, field) {
  if (!obj || obj[field] === undefined || obj[field] === null || obj[field] === '') return;
  obj[field] = clip0(obj[field]);
}

function sanitizeDurationField(obj) {
  if (!obj || obj.duration === undefined || obj.duration === null || obj.duration === '') return;
  obj.duration = safeDuration(obj.duration);
}

function sanitizePayload(b) {
  // Servicios: price y duración
  if (Array.isArray(b.services)) {
    b.services.forEach(s => { sanitizeNumberField(s, 'price'); sanitizeDurationField(s); });
  }
  // Gastos: amount
  if (Array.isArray(b.expenses)) {
    b.expenses.forEach(e => sanitizeNumberField(e, 'amount'));
  }
  // Citas: servicePrice, domicilioPrice, totalPrice; y cada precio
  // dentro de servicePrices (objeto {id: precio} serializado).
  if (Array.isArray(b.appointments)) {
    b.appointments.forEach(a => {
      sanitizeNumberField(a, 'servicePrice');
      sanitizeNumberField(a, 'domicilioPrice');
      sanitizeNumberField(a, 'totalPrice');
      sanitizeDurationField(a);
      if (a.servicePrices !== undefined && a.servicePrices !== null && a.servicePrices !== '') {
        let sp = a.servicePrices;
        let parsed = null;
        if (typeof sp === 'string') {
          try { parsed = JSON.parse(sp); } catch (_) { parsed = null; }
        } else if (typeof sp === 'object' && !Array.isArray(sp)) {
          parsed = sp;
        }
        if (parsed) {
          Object.keys(parsed).forEach(k => { parsed[k] = clip0(parsed[k]); });
          a.servicePrices = JSON.stringify(parsed);
        }
      }
    });
  }
  // Evento de calendario: totalPrice y domicilioPrice
  if (b.calendarEvent) {
    sanitizeNumberField(b.calendarEvent, 'totalPrice');
    sanitizeNumberField(b.calendarEvent, 'domicilioPrice');
    sanitizeDurationField(b.calendarEvent);
  }
  // Historial de precios (cuando se reseedea)
  if (b.action !== 'updateCalendarEvent' && b.action !== 'deleteCalendarEvent') {
    // resetPriceHistory reescribe el historial desde b.services; ya
    // se clipó b.services.price arriba, así que las filas sembradas
    // ya quedan saneadas. No se requiere acción extra aquí.
  }
}
