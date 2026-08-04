// ╔══════════════════════════════════════════════════════════════╗
// ║  Salome Zuluaga | Micropigmentación — DEMO Apps Script  ║
// ╚══════════════════════════════════════════════════════════════╝

const SECRET_TOKEN = 'CAMBIA_TU_TOKEN';

const SHEETS = { clients:'Clientes', services:'Servicios', appointments:'Citas', expenses:'Gastos', priceHistory:'HistorialPrecios' };

const JS_KEYS = {
  clients:      ['id','name','phone','createdAt'],
  services:     ['id','name','price'],
  appointments: ['id','clientId','clientName','clientPhone',
                 'serviceIds','serviceNames','servicePrice','servicePrices',
                 'domicilio','domicilioPrice','totalPrice','address',
                 'date','time','createdAt','calendarCreated','calendarEventId','completed'],
  expenses:     ['id','description','amount','category','date'],
  priceHistory: ['serviceId','serviceName','price','changedAt'],
};

const HEADERS_ES = {
  clients:      ['ID','Nombre','Celular','Fecha Registro'],
  services:     ['ID','Nombre','Precio'],
  appointments: ['ID','ID Cliente','Nombre Cliente','Celular',
                 'IDs Servicios','Nombres Servicios','Precio Servicios','Precios x Servicio',
                 'Domicilio','Precio Domicilio','Total','Dirección',
                 'Fecha','Hora','Fecha Creación','Evento Creado','ID Evento Calendar','Completada'],
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheets(ss);
    if (b.action==='deleteCalendarEvent') return ok({calResult:deleteCalEvent(b.eventId)});
    if (b.action==='updateCalendarEvent') return ok({calResult:updateCalEvent(b.eventId,b.calendarEvent)});
    if (b.clients      !== undefined) writeSheet(ss,'clients',b.clients);
    if (b.services !== undefined) {
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

function createCalEvent(evt) {
  try {
    const cal=CalendarApp.getDefaultCalendar();
    const s=mkDate(evt.date,evt.time,0), e=mkDate(evt.date,evt.time,60);
    const dom=evt.domicilio==='true'||evt.domicilio===true;
    const desc='👤 '+evt.clientName+'\n📱 '+evt.clientPhone+
                '\n✨ '+evt.serviceNames+
                '\n💳 Total: $'+Number(evt.totalPrice||0).toLocaleString('es-CO')+
                (dom?'\n🛵 Domicilio: $'+Number(evt.domicilioPrice||0).toLocaleString('es-CO')+
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
    event.setTime(mkDate(evt.date,evt.time,0),mkDate(evt.date,evt.time,60));
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
