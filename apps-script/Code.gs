// ╔══════════════════════════════════════════════════════════════╗
// ║  Proyecto original: Salome Zuluaga | SZ  ·  marca: SB_BIZ_NAME ║
// ╚══════════════════════════════════════════════════════════════╝

/* ── Token de sincronización ────────────────────────────────────
   El repo es PÚBLICO, así que el token nunca puede vivir aquí ni
   en el frontend como secreto fijo: va en Script Properties
   (Editor → Propiedades del proyecto → Script properties), clave
   TOKEN_PROP_KEY, y su gemelo del lado del cliente es VITE_TOKEN
   (.env en local y Variables de entorno en Vercel).

   Si la propiedad no existe, NO se autoriza nada (fail closed) y se
   avisa con un mensaje propio, para que un fallo de configuración
   no se confunda con un token malo.                                */
const TOKEN_PROP_KEY = 'SB_SYNC_TOKEN';

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
    const tok = _checkToken(e.parameter.token);
    if (!tok.ok) return err(tok.error);
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
    const tok = _checkToken(b.token);
    if (!tok.ok) { lock.releaseLock(); return err(tok.error); }

    // ── Recuperación de acceso (solo el propietario) ──
    // No escriben nada y responden siempre igual, para no filtrar
    // si el destinatario registrado existe o cuál es.
    if (b.action==='requestResetCode') { const r=_requestResetCode(); lock.releaseLock(); return ok(r); }
    if (b.action==='verifyResetCode')  {
      const v=_verifyResetCode(b.code); lock.releaseLock();
      return v.ok ? ok({grantId:v.grantId,grantSecret:v.grantSecret,expiresAt:v.expiresAt})
                  : err(v.error);
    }

    // ── Guarda destructiva: se decide ANTES de escribir, borrar o
    // modificar CUALQUIER recurso (hojas o calendario). Una operación
    // normal de sincronización nunca lleva grant, y un reset nunca
    // se vuelve a permitir sin él. ──
    const auth = _checkResetAuth(b);
    if (!auth.ok) { lock.releaseLock(); return err(auth.error); }

    try { sanitizePayload(b); } catch(_) {}
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheets(ss);
    if (b.action==='deleteCalendarEvent') { const r=deleteCalEvent(b.eventId);      lock.releaseLock(); return ok({calResult:r}); }
    if (b.action==='updateCalendarEvent') { const r=updateCalEvent(b.eventId,b.calendarEvent); lock.releaseLock(); return ok({calResult:r}); }
    if (b.action==='resetData')           { const r=_resetData(ss, b, auth); lock.releaseLock(); return ok(r); }
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
        // Full reset: wipe history and seed with the new service prices.
        // Esta rama solo es alcanzable con una autorización válida
        // (ver _checkResetAuth), nunca desde una sincronización normal.
        _seedPriceHistory(ss, b.services);
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
   RESTABLECIMIENTO PROTEGIDO — autorización SOLO del lado servidor

   Problema: el token de sincronización (VITE_TOKEN, que viaja
   dentro del bundle JS público; su gemelo SB_SYNC_TOKEN vive en
   Script Properties) no puede considerarse un secreto. Cualquiera
   con la URL podía reproducir el payload de restablecimiento y
   borrarlo todo.

   Por eso el restablecimiento es ahora una operación EXPLÍCITA
   (`action:'resetData'`) que exige una autorización temporal y de
   un solo uso emitida por el servidor tras verificar a su dueño por
   correo. Esa autorización NUNCA existe en el frontend.

   ── Flujo (tres pasos, todos explícitos) ──
     1. `requestResetCode` → el backend genera un código aleatorio,
        lo guarda con vencimiento y lo envía SOLO al correo
        autorizado. La respuesta es siempre idéntica.
     2. `verifyResetCode`  → valida el código (un solo uso,
        vencimiento, límite de intentos) y emite un grant.
     3. `resetData`        → exige el grant. Se consume ANTES de
        escribir nada y no puede repetirse.

   ── Detección de operación destructiva ──
   Las sincronizaciones normales de la app envían UNA sola colección
   por petición (`SC`/`SS`/`SA`/`SE`). Un restablecimiento envía
   varias a la vez y/o `resetPriceHistory`. Se trata como
   destructivo cualquier payload con: `action:'resetData'`,
   `resetPriceHistory:true` o más de una colección definida.

   ── Configuración ──
   El correo vive ÚNICAMENTE en la propiedad de script
   `SB_AUTHORIZED_EMAIL` (Editor → Propiedades del proyecto). No hay
   ningún correo escrito en este archivo ni en el repositorio, que es
   público. No existe ninguna acción pública que lo modifique.

   Si la propiedad falta, NO se envía nada: el código de
   restablecimiento se descarta sin consumir intentos (ver
   _requestResetCode) y el reporte/backups se omiten avisando en el
   registro de ejecución. Cambiar el correo NO exige tocar código ni
   el frontend.
══════════════════════════════════════════════════════════════ */

const PROP_KEY = {
  email:  'SB_AUTHORIZED_EMAIL', // ÚNICA fuente del correo autorizado
  bizName:'SB_BIZ_NAME',          // marca que firma los correos del script
  code:   'SB_RESET_CODE',        // JSON {hash, expiresAt, tries}
  grants: 'SB_RESET_GRANTS',      // JSON {grantId: {hash, expiresAt, usedAt}}
  limits: 'SB_RESET_LIMITS'       // JSON {sends:[ms], lockedUntil:ms}
};

const CODE_TTL_MS      = 15 * 60 * 1000;  // vigencia del código de recuperación
const GRANT_TTL_MS     = 10 * 60 * 1000;  // vigencia de la autorización de reset
const MAX_VERIFY_TRIES = 5;               // intentos de verificación por código
const LOCKOUT_MS       = 30 * 60 * 1000;  // bloqueo tras agotar intentos/solicitudes
const MAX_SENDS        = 3;               // códigos por ventana
const SEND_WINDOW_MS   = 60 * 60 * 1000;  // ventana de solicitudes (1 h)

function _props() {
  return PropertiesService.getScriptProperties();
}

// Vacío si la propiedad no está configurada. Quien llame debe decidir
// qué hacer en ese caso (no enviar y avisar), nunca inventar un destino.
function _authorizedEmail() {
  try { return String(_props().getProperty(PROP_KEY.email) || '').trim(); }
  catch(_) { return ''; }
}

/* ── Marca del negocio ──
   Firma los correos que envía el propio script (asunto, texto plano y
   tarjeta HTML del código de restablecimiento). Vive en la propiedad
   de script `SB_BIZ_NAME` para que un despliegue nuevo cambie de
   nombre SIN editar este archivo: el repo es compartido entre todos
   los clientes. Si la propiedad falta, se usa BIZ_NAME_DEFAULT, que
   es el nombre del despliegue original. OJO: se lee en crudo (no con
   _readProp), porque _readProp hace JSON.parse y un nombre como
   `Uñas de Cristina` no es JSON válido. */
const BIZ_NAME_DEFAULT = 'SZ';

function _bizName() {
  try {
    const n = String(_props().getProperty(PROP_KEY.bizName) || '').trim();
    if (n) return n;
  } catch(_) {}
  return BIZ_NAME_DEFAULT;
}

function _readProp(key, fallback) {
  let raw = null;
  try { raw = _props().getProperty(key); } catch(_) { raw = null; }
  if (raw === null || raw === undefined || raw === '') return fallback;
  try { const v = JSON.parse(raw); return (v === null || v === undefined) ? fallback : v; }
  catch(_) { return fallback; }
}
function _writeProp(key, value) {
  try { _props().setProperty(key, JSON.stringify(value)); } catch(_) {}
}
function _deleteProp(key) {
  try { _props().deleteProperty(key); } catch(_) {}
}

// Alfabeto sin 0/O/I/1 para que el dueño pueda teclearlo sin errores.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos (256 % 32 = 0)

// Utilities.getUuid() se alimenta del CSPRNG del sistema.
function _randomToken(byteLen) {
  let s = '';
  while (s.length < byteLen * 2) s += String(Utilities.getUuid()).replace(/-/g, '');
  return s.substring(0, byteLen * 2);
}

function _randomCode(len) {
  const hex = _randomToken(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[parseInt(hex.substr(i * 2, 2), 16) % CODE_ALPHABET.length];
  return out;
}

function _hash(s) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i]; if (b < 0) b += 256;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

// Comparación en tiempo lineal: no deja atajar el código por timing.
function _secureEqual(a, b) {
  a = String(a === null || a === undefined ? '' : a);
  b = String(b === null || b === undefined ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Valida el token de sincronización contra Script Properties.
// Compara en tiempo lineal igual que el código de recuperación.
function _checkToken(given) {
  let secret = '';
  try { secret = String(_props().getProperty(TOKEN_PROP_KEY) || '').trim(); } catch(_) { secret = ''; }
  if (!secret) return { ok: false,
    error: 'Token de sincronización no configurado: añade la propiedad ' + TOKEN_PROP_KEY + ' en Propiedades del proyecto.' };
  if (!_secureEqual(String(given === null || given === undefined ? '' : given), secret))
    return { ok: false, error: 'No autorizado' };
  return { ok: true };
}

// ── ¿Es una operación destructiva? ──
// OJO: `resetPriceHistory` se evalúa por ser VERDADERO, no solo `=== true`,
// para que valores como `1` o `"true"` no esquiven la guarda y aun así
// consigan borrar HistorialPrecios en la rama de abajo.
function _isDestructivePayload(b) {
  if (!b || typeof b !== 'object') return false;
  if (b.action === 'resetData') return true;
  if (b.resetPriceHistory) return true;
  let cols = 0;
  const keys = ['clients', 'services', 'appointments', 'expenses'];
  for (let i = 0; i < keys.length; i++) if (b[keys[i]] !== undefined) cols++;
  return cols > 1; // las syncs normales mandan una sola colección
}

function _checkResetAuth(b) {
  if (!_isDestructivePayload(b)) return { ok: true };  // sync normal: no toca el grant
  return _consumeGrant(b);
}

function _consumeGrant(b) {
  const grantId = String((b && b.grantId) || '').trim();
  const secret  = String((b && b.grantSecret) || '');
  if (!grantId || !secret) return { ok: false, error: 'Restablecimiento no autorizado.' };

  const now = Date.now();
  const grants = _readProp(PROP_KEY.grants, {});
  const g = grants[grantId];
  if (!g) return { ok: false, error: 'Restablecimiento no autorizado.' };
  if (g.usedAt) return { ok: false, error: 'Autorización ya utilizada.' };
  if (now > g.expiresAt) {
    delete grants[grantId]; _writeProp(PROP_KEY.grants, grants);
    return { ok: false, error: 'Autorización vencida.' };
  }
  if (!_secureEqual(_hash(secret), g.hash)) return { ok: false, error: 'Restablecimiento no autorizado.' };
  // Un solo uso: se consume ANTES de escribir nada en las hojas.
  g.usedAt = now; grants[grantId] = g; _writeProp(PROP_KEY.grants, grants);
  return { ok: true, grantId: grantId };
}

// ── Paso 1: solicitar el código. ──
// Devuelve SIEMPRE lo mismo: no revela si hay un correo configurado,
// si es distinto del registrado, si se está rate-limited ni nada más.
function _requestResetCode() {
  const now = Date.now();

  // Sin correo configurado no se genera código ni se consume un intento,
  // así el propietario puede configurarlo y volver a intentar sin gastar
  // su cupo. La respuesta es idéntica a la normal para no revelar si hay
  // un correo configurado (ver cabecera de esta sección); el diagnóstico
  // va al registro de ejecución, que solo lee el propietario del proyecto.
  if (!_authorizedEmail()) {
    console.error(_bizName() + ': falta la propiedad SB_AUTHORIZED_EMAIL; ' +
                  'no se envió código de restablecimiento.');
    return { sent: true };
  }

  const lim = _readProp(PROP_KEY.limits, { sends: [], lockedUntil: 0 });
  lim.sends = (Array.isArray(lim.sends) ? lim.sends : []).filter(t => now - t < SEND_WINDOW_MS);

  if (lim.lockedUntil && now < lim.lockedUntil) return { sent: true };
  if (lim.sends.length >= MAX_SENDS) {
    lim.lockedUntil = now + LOCKOUT_MS;
    _writeProp(PROP_KEY.limits, lim);
    return { sent: true };
  }

  const code = _randomCode(8);
  _writeProp(PROP_KEY.code, { hash: _hash(code), expiresAt: now + CODE_TTL_MS, tries: 0 });
  lim.sends.push(now);
  _writeProp(PROP_KEY.limits, lim);

  // Se envía EXCLUSIVAMENTE al correo autorizado. El código no se
  // guarda en claro, no se registra y no se devuelve al cliente.
  // La lógica (generación, hash, vigencia e intentos) NO cambia: solo
  // se mejora la presentación. Se envía HTML + texto plano.
  try {
    GmailApp.sendEmail(
      _authorizedEmail(),
      _bizName() + ' · Código de restablecimiento',
      _resetEmailText(code),
      { htmlBody: _resetEmailHtml(code) });
  } catch(_) {}
  return { sent: true };
}

/* ── Plantillas del correo de restablecimiento ──
   Solo presentación: leen CODE_TTL_MS para no inventar una duración.
   El código sale de CODE_ALPHABET (A-Z y 2-9), sin caracteres HTML,
   pero se escapa igual por robustez ante cambios de alfabeto. */
function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _resetEmailText(code) {
  const mins = CODE_TTL_MS / 60000;
  const biz  = _bizName();
  return biz + ' · Código de restablecimiento\n\n' +
    'Se recibió una solicitud para restablecer los datos del sistema.\n' +
    'Usa el siguiente código para autorizarla:\n\n' +
    code + '\n\n' +
    'Vigencia: ' + mins + ' minutos. Solo puede usarse una vez.\n\n' +
    'No compartas este código con nadie. ' + biz + ' nunca te lo pedirá por\n' +
    'teléfono ni por mensaje.\n\n' +
    '— ' + biz;
}

function _resetEmailHtml(code) {
  const mins  = CODE_TTL_MS / 60000;
  const c     = _escHtml(code);
  const biz   = _escHtml(_bizName());
  // Tablas + estilos en línea: máxima compatibilidad (Gmail, Outlook, iOS).
  return '' +
  '<div style="margin:0;padding:0;background-color:#f4f5f7;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">' +
    '<tr><td align="center" style="padding:28px 14px;">' +

    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #e6e8eb;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +

      // Encabezado
      '<tr><td align="center" style="background-color:#1f2937;padding:20px 24px;">' +
        '<span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:3px;">' + biz + '</span>' +
      '</td></tr>' +

      // Cuerpo
      '<tr><td style="padding:32px 28px 8px;">' +
        '<h1 style="margin:0 0 14px;font-size:20px;line-height:26px;font-weight:700;color:#111827;text-align:center;">Código de restablecimiento</h1>' +
        '<p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;text-align:center;">Se recibió una solicitud para restablecer los datos del sistema. Usa el siguiente código para autorizarla:</p>' +
      '</td></tr>' +

      // Código destacado
      '<tr><td style="padding:22px 28px 6px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">' +
          '<tr><td align="center" style="padding:22px 12px;">' +
            '<span style="display:inline-block;font-family:\'SFMono-Regular\',Consolas,\'Liberation Mono\',Menlo,monospace;font-size:32px;font-weight:700;color:#111827;letter-spacing:9px;">' + c + '</span>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +

      // Vigencia
      '<tr><td style="padding:14px 28px 0;">' +
        '<p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;text-align:center;">Vigencia: <strong style="color:#374151;">' + mins + ' minutos</strong>. Solo puede usarse una vez.</p>' +
      '</td></tr>' +

      // Aviso de seguridad
      '<tr><td style="padding:18px 28px 4px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">' +
          '<tr><td style="padding:12px 14px;">' +
            '<p style="margin:0;font-size:13px;line-height:19px;color:#9a3412;">No compartas este código con nadie. ' + biz + ' nunca te lo pedirá por teléfono ni por mensaje.</p>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +

      // Pie
      '<tr><td align="center" style="padding:22px 28px 28px;">' +
        '<p style="margin:0;font-size:12px;color:#9ca3af;letter-spacing:1px;">' + biz + '</p>' +
      '</td></tr>' +

    '</table>' +
    '</td></tr>' +
  '</table>' +
  '</div>';
}

// ── Paso 2: verificar el código y emitir el grant. ──
function _verifyResetCode(rawCode) {
  const now = Date.now();
  const lim = _readProp(PROP_KEY.limits, { sends: [], lockedUntil: 0 });
  if (lim.lockedUntil && now < lim.lockedUntil)
    return { ok: false, error: 'Demasiados intentos. Intenta de nuevo más tarde.' };

  const st = _readProp(PROP_KEY.code, null);
  if (!st || !st.hash) return { ok: false, error: 'Código inválido o vencido.' };
  if (now > st.expiresAt) {
    _deleteProp(PROP_KEY.code);
    return { ok: false, error: 'Código inválido o vencido.' };
  }

  st.tries = (st.tries || 0) + 1;
  const given = String(rawCode === null || rawCode === undefined ? '' : rawCode).trim().toUpperCase();
  if (!_secureEqual(_hash(given), st.hash)) {
    if (st.tries >= MAX_VERIFY_TRIES) {
      _deleteProp(PROP_KEY.code);
      lim.lockedUntil = now + LOCKOUT_MS;
      _writeProp(PROP_KEY.limits, lim);
      return { ok: false, error: 'Demasiados intentos. Intenta de nuevo más tarde.' };
    }
    _writeProp(PROP_KEY.code, st);
    return { ok: false, error: 'Código inválido.' };
  }

  // Válido → el código queda invalidado (un solo uso) y se emite el grant.
  _deleteProp(PROP_KEY.code);
  const grantId     = _randomToken(16);
  const grantSecret = _randomToken(32);
  const grants = _readProp(PROP_KEY.grants, {});
  Object.keys(grants).forEach(k => {
    if (!grants[k] || now > grants[k].expiresAt) delete grants[k];
  });
  grants[grantId] = { hash: _hash(grantSecret), expiresAt: now + GRANT_TTL_MS, usedAt: 0 };
  _writeProp(PROP_KEY.grants, grants);
  return { ok: true, grantId: grantId, grantSecret: grantSecret, expiresAt: now + GRANT_TTL_MS };
}

function _seedPriceHistory(ss, services) {
  const sh = ss.getSheetByName(SHEETS.priceHistory);
  if (!sh) return;
  sh.clearContents();
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  const headers = HEADERS_ES.priceHistory;
  sh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]);
  if (services && services.length > 0) {
    const initRows = services.map(s => [s.id, s.name, String(s.price), now]);
    sh.getRange(2, 1, initRows.length, 4).setNumberFormat('@').setValues(initRows);
  }
}

// ── Paso 3: ejecutar el restablecimiento. ──
// Solo se llega aquí con un grant consumido previamente y válido.
function _resetData(ss, b, auth) {
  const services = Array.isArray(b.services) ? b.services : [];

  // Borra los eventos de Calendar del lado del servidor y ya
  // autorizados: el frontend ya no elimina nada antes de autorizar.
  const curAppts = readSheet(ss, 'appointments');
  let deletedEvents = 0;
  for (let i = 0; i < curAppts.length; i++) {
    const id = curAppts[i] && curAppts[i].calendarEventId;
    if (id) { try { if (deleteCalEvent(id).ok) deletedEvents++; } catch(_) {} }
  }

  writeSheet(ss, 'clients', []);
  writeSheet(ss, 'appointments', []);
  writeSheet(ss, 'expenses', []);
  writeSheet(ss, 'services', services);
  _seedPriceHistory(ss, services);

  return { reset: true, deletedEvents: deletedEvents, grantId: auth.grantId };
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

// Utilidades de normalización (réplicas de helpers.js). Están a nivel de
// archivo para que las funciones de abajo (_apptServiceRefs y
// _topServicesByDemand) compartan una sola definición con _buildReport.
function _toN(v) { var n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; }
function _boolV(v) { return v === true || v === 'true'; }

// Separador con el que el frontend concatenaba los nombres al agendar
// (selSvcs.map(s => s.name).join(', ')). Debe ser el MISMO que SNAP_SEP
// en helpers.js.
var SNAP_SEP = ', ';

/**
 * Recupera los nombres del snapshot cuando ALGÚN id ya no está en el
 * catálogo (réplica de recoverSnapshotNames en helpers.js).
 *
 * `serviceNames` es un CSV con los nombres en el MISMO orden que los ids
 * de `serviceIds`, separados por «, ». Si un nombre lleva coma, partirlo
 * desplaza las posiciones y el servicio borrado se quedaba con un trozo
 * («Diseño» por «Diseño, depilación de pestañas»). Con al menos un nombre
 * conocido como ANCLA se recorre el texto en orden; sin ninguna ancla no
 * hay información para cortar, así que se devuelve '' y se cae al
 * respaldo posicional de antes.
 */
function _recoverSnapshotNames(raw, resolved) {
  var txt = String(raw === null || raw === undefined ? '' : raw);
  // Busca `name` solo donde puede empezar un nombre: al principio del texto
  // o justo después de «, ». Sin esto, si una ancla es PREFIJO de otra
  // («Cejas» dentro de «Cejas full») la búsqueda por subcadena devolvía la
  // posición equivocada y se comía el nombre.
  function atBoundary(name, from) {
    var i = Math.max(0, from);
    while (i <= txt.length) {
      var j = txt.indexOf(name, i);
      if (j === -1) return -1;
      var before = (j === 0) || txt.startsWith(SNAP_SEP, j - SNAP_SEP.length);
      var after  = (j + name.length === txt.length) || txt.startsWith(SNAP_SEP, j + name.length);
      if (before && after) return j;
      i = j + 1;
    }
    return -1;
  }

  var out = [];
  var pos = 0;
  for (var i = 0; i < resolved.length; i++) {
    var known = resolved[i];
    if (known) {
      var idx = atBoundary(known, pos);
      if (idx === -1) { out.push(''); continue; }   // renombrado: sin ancla
      out.push(known);
      pos = idx + known.length + SNAP_SEP.length;
      continue;
    }
    // Sin ancla a la izquierda: termina donde empieza el siguiente nombre
    // conocido, o al final del texto.
    var end = txt.length;
    for (var j = i + 1; j < resolved.length; j++) {
      if (!resolved[j]) continue;
      var k = atBoundary(resolved[j], pos);
      if (k !== -1) { end = Math.max(pos, k - SNAP_SEP.length); break; }
    }
    out.push(txt.slice(pos, end).trim());
    pos = end + SNAP_SEP.length;
  }
  return out;
}

/**
 * Servicios de una cita YA resueltos contra el catálogo: [{id, name}]
 * (réplica de apptServiceRefs en helpers.js).
 *
 * Un NOMBRE puede llevar coma —«Diseño, depilación y sombreado» es UN
 * solo servicio—, así que el nombre sale SIEMPRE del catálogo por id y
 * el snapshot `serviceNames` solo se parte como último recurso. Partir
 * el nombre a ciegas inventaba servicios fantasma y partía el ranking.
 */
function _apptServiceRefs(a, services) {
  var svcs = Array.isArray(services) ? services : [];
  var ids  = _apptServiceIds(a);
  var snap = _apptServiceNames(a);
  var porId = function(id){
    for (var j = 0; j < svcs.length; j++) {
      if (String(svcs[j].id) === String(id)) return String(svcs[j].name || '').trim();
    }
    return '';
  };

  if (ids.length === 1) {
    // Con UN servicio, el snapshot ENTERO es su nombre: no hay manera de
    // confundirlo con un separador, así que sobrevive aunque el servicio
    // ya no exista en el catálogo (o este no haya cargado todavía).
    var unico = porId(ids[0]) || snap.join(', ');
    return unico ? [{ id: String(ids[0]), name: unico }] : [];
  }

  if (ids.length > 1) {
    // Varios servicios: el nombre sale del catálogo, nunca de partir el
    // snapshot. Para los que ya no existen se recupera el texto con los
    // nombres conocidos como ANCLA (_recoverSnapshotNames), y no por la
    // posición i: si un nombre lleva coma, las posiciones se desplazaban
    // y el servicio borrado se quedaba con un trozo. Sin ninguna ancla se
    // cae al respaldo posicional de antes, por falta de información.
    var rawSnap = String(a.serviceNames || '');
    var known   = ids.map(porId);           // '' = ya no está en el catálogo
    var rec     = known.some(Boolean) ? _recoverSnapshotNames(rawSnap, known) : known;
    return ids.map(function(id, i){
      return { id: String(id), name: rec[i] || snap[i] || '' };
    }).filter(function(r){ return r.name; });
  }

  // Sin ids: primero el nombre snapshot ENTERO si existe en el catálogo.
  var whole = snap.join(', ');
  var hitAll = null;
  for (var k = 0; k < svcs.length; k++) {
    if (_normName(svcs[k].name) === _normName(whole)) { hitAll = svcs[k]; break; }
  }
  if (hitAll) return [{ id: String(hitAll.id), name: String(hitAll.name || '').trim() }];

  // Último recurso: partido por comas (citas antiguas sin ids).
  return snap.map(function(name){ return { id: '', name: name }; });
}

/**
 * Top 3 de servicios por demanda sobre COMPLETADAS (réplica de
 * topServicesByDemand en helpers.js): cuántas veces se pidió y cuánto
 * facturó cada uno, repartiendo la cita por igual entre sus servicios.
 */
function _topServicesByDemand(appts, services) {
  var stats = {};
  (Array.isArray(appts) ? appts : [])
    .filter(function(a){ return _boolV(a.completed) && a.completed !== 'noshow'; })
    .forEach(function(a){
      var refs = _apptServiceRefs(a, services);
      refs.forEach(function(r){
        if (!stats[r.name]) stats[r.name] = { name: r.name, count: 0, revenue: 0 };
        stats[r.name].count += 1;
        stats[r.name].revenue += refs.length ? _toN(a.servicePrice) / refs.length : _toN(a.servicePrice);
      });
    });
  // Orden estable por demanda: a igual número de citas manda el orden
  // de aparición (el mismo en ambos lados), igual que en helpers.js.
  return Object.keys(stats).map(function(k){ return stats[k]; })
    .sort(function(a, b){ return b.count - a.count; }).slice(0, 3);
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
    const event=cal.createEvent(calTitle_(evt),s,e,{description:calDescription_(evt),sendInvites:false});
    event.setColor(CalendarApp.EventColor.MAUVE);
    return {ok:true,eventId:event.getId()};
  } catch(ex){return {ok:false,error:ex.message};}
}

/* ── Título y descripción del evento ──
   Compartidos por crear y actualizar: si se editaran por separado, una
   edición dejaría en Google Calendar el texto de la cita anterior. */
function calTitle_(evt) {
  return '✨ ' + (evt.serviceNames || '') + ' — ' + (evt.clientName || '');
}

function calDescription_(evt) {
  const dom = evt.domicilio === 'true' || evt.domicilio === true;
  return '👤 ' + evt.clientName + '\n📱 ' + evt.clientPhone +
         '\n✨ ' + evt.serviceNames +
         '\n💳 Total: $' + clip0(Number(evt.totalPrice || 0)).toLocaleString('es-CO') +
         (dom ? '\n🛵 Domicilio: $' + clip0(Number(evt.domicilioPrice || 0)).toLocaleString('es-CO') +
                (evt.address ? '\n📍 ' + evt.address : '') : '');
}

/* ── BUG-01: actualizar el evento EXISTENTE al editar una cita ──
   Devuelve {ok, error?, code?} para que el frontend nunca comunique
   como exitosa una sincronización que no llegó a producirse.
   No crea eventos: el id que trae la cita es el que se actualiza. */
function updateCalEvent(eventId, evt) {
  try {
    if (!eventId) return {ok:false, code:'no_id',
      error:'La cita no tiene un evento de Calendar enlazado; no se actualizó ninguno.'};
    if (!evt || !evt.date || !evt.time) return {ok:false, code:'bad_payload',
      error:'Faltan la fecha o la hora de la cita.'};

    const start = mkDate(evt.date, evt.time, 0);
    if (isNaN(start.getTime())) return {ok:false, code:'bad_date',
      error:'Fecha u hora inválidas (' + evt.date + ' ' + evt.time + ').'};

    const event = CalendarApp.getEventById(eventId);
    if (!event) return {ok:false, code:'not_found',
      error:'No se encontró el evento en Google Calendar (id ' + eventId + ').'};

    // Duración: la que envía la app; si no viene, la que ya tenía el evento.
    const sent = Number(evt.duration);
    const dur = sent > 0 ? safeDuration(sent)
      : (Math.round((event.getEndTime().getTime() - event.getStartTime().getTime()) / 60000) || 60);
    const end = mkDate(evt.date, evt.time, dur);
    if (isNaN(end.getTime())) return {ok:false, code:'bad_duration',
      error:'Duración inválida (' + evt.duration + ').'};

    // Solo se reescribe el texto si la cita lo trae: un payload mínimo
    // (fecha/hora/duración) no debe borrar el contenido existente.
    const hasContent = evt.clientName !== undefined || evt.serviceNames !== undefined ||
                       evt.clientPhone !== undefined || evt.totalPrice !== undefined;
    const title = hasContent ? calTitle_(evt) : null;

    event.setTime(start, end);
    if (title !== null) { event.setTitle(title); event.setDescription(calDescription_(evt)); }

    // Comprobación post-escritura: si Calendar no aplicó el cambio,
    // NO se devuelve ok:true (evita un éxito falso).
    const gotS = event.getStartTime(), gotE = event.getEndTime();
    const tol = 1000; // ms: tolera el redondeo de almacenamiento
    if (!gotS || !gotE ||
        Math.abs(gotS.getTime() - start.getTime()) > tol ||
        Math.abs(gotE.getTime() - end.getTime()) > tol) {
      return {ok:false, code:'not_applied',
        error:'Google Calendar no aplicó el cambio de hora.',
        expected:{start:String(start), end:String(end)},
        got:{start:String(gotS), end:String(gotE)}};
    }

    return {ok:true, eventId:eventId, durationMin:dur,
            start:gotS.toISOString(), end:gotE.toISOString(), title:title};
  } catch(ex) { return {ok:false, code:'exception', error:ex.message}; }
}

/* ── BUG-02: eliminar el evento ASOCIADO al eliminar la cita ──
   Usa solo el id que trae la cita: no barre el calendario ni toca
   eventos ajenos. Si el evento ya no existe se trata como éxito
   (idempotente), y si falla se devuelve ok:false con motivo. */
function deleteCalEvent(eventId) {
  try {
    if (!eventId) return {ok:false, code:'no_id',
      error:'La cita no tiene un evento de Calendar enlazado; no se eliminó ninguno.'};
    const event = CalendarApp.getEventById(eventId);
    if (!event) return {ok:true, alreadyGone:true, eventId:eventId}; // ya no está: nada que hacer
    event.deleteEvent();
    return {ok:true, deleted:true, eventId:eventId};
  } catch(ex) { return {ok:false, code:'exception', error:ex.message}; }
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
    // Destinatario desde SB_AUTHORIZED_EMAIL. El catch de esta función
    // lo deja registrado en el log de ejecución sin tumbar el trigger.
    const recipient  = _authorizedEmail();
    if (!recipient) throw new Error(
      'Falta la propiedad SB_AUTHORIZED_EMAIL: no hay destinatario para el backup.');

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

// '9:5' → '09:05'; '' si no hay hora válida. Réplica de cleanTime
// (helpers.js): el Excel adjunto usa la misma normalización que el
// que se descarga desde la app.
function _cleanTime(raw) {
  if (!raw) return '';
  var m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return String(Number(m[1])).padStart(2, '0') + ':' + m[2];
}

// period = {type:'day'|'week'|'month', day?, from?, to?, ym?}
// 'week' se trata como range from..to (Lun-Dom ISO).
function _inPeriod(d, period) {
  var x = _cleanDate(d); if (!x) return false;
  if (period.type === 'day')   return x === period.day;
  if (period.type === 'month') return x.slice(0,7) === period.ym;
  if (period.type === 'year')  return x.slice(0,4) === period.y;
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
  // Catálogo: hace falta para resolver los nombres del top de servicios
  // (un nombre puede llevar coma y no se puede partir el snapshot).
  var svcs  = readSheet(ss, 'services');

  // toN y boolV ahora viven a nivel de archivo (_toN / _boolV), junto a
  // _apptServiceRefs y _topServicesByDemand, que los comparten.

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
  var completed = apptsInPeriod.filter(function(a){ return _boolV(a.completed) && a.completed !== 'noshow'; }).length;
  var pending   = apptsInPeriod.filter(function(a){ return !_boolV(a.completed) && a.completed !== 'noshow'; }).length;
  var noshow    = apptsInPeriod.filter(function(a){ return a.completed === 'noshow'; }).length;
  var completionRate = scheduled > 0 ? Math.round(completed / scheduled * 100) : 0;

  // ── LIBRO ÚNICO (réplica de periodLedger del frontend) ────────
  // Ingreso = cita completada. El domicilio viene sumado dentro del
  // total de la cita, así que aquí se separa. Con esto el correo sale
  // con los MISMOS números que el WhatsApp que se manda a mano.
  var incomes = apptsInPeriod.filter(function(a){ return _boolV(a.completed); });
  var totalIncome = 0, totalService = 0, totalDelivery = 0, totalCash = 0, totalTransfer = 0;
  incomes.forEach(function(a){
    var amount   = _toN(a.totalPrice || a.servicePrice || 0);
    var isDom    = a.domicilio === true || a.domicilio === 'true';
    var delivery = isDom ? Math.min(_toN(a.domicilioPrice || 0), amount) : 0;
    totalIncome   += amount;
    totalDelivery += delivery;
    totalService  += amount - delivery;
    var m = String(a.paymentMethod || '').trim();
    if (m === 'Efectivo') totalCash += amount;
    else if (m === 'Transferencia') totalTransfer += amount;
  });
  var revenue      = totalIncome;                      // «Total recibido»
  var totalNoMethod = totalIncome - totalCash - totalTransfer;  // citas de antes del método
  var projected = apptsInPeriod
    .reduce(function(s,a){ return a.completed === 'noshow' ? s : s + _toN(a.totalPrice || a.servicePrice || 0); }, 0);

  // Gastos del período (por range from..to o day)
  var fromStr, toStr;
  if (period.type === 'day')   { fromStr = period.day; toStr = period.day; }
  else if (period.type === 'month') { fromStr = period.ym + '-01'; toStr = _lastDayOfMonth(Number(period.ym.slice(0,4)), Number(period.ym.slice(5,7))); }
  else if (period.type === 'year')  { fromStr = period.y + '-01-01'; toStr = period.y + '-12-31'; }   // 1 de enero a 31 de diciembre
  else                          { fromStr = period.from; toStr = period.to; }
  var expensesInPeriod = (exps || []).filter(function(e){
    var x = _cleanDate(e.date);
    if (!x) return false;
    return x >= fromStr && x <= toStr;
  });
  // Detalle de CADA gasto del período (lo que pide el reporte: gasolina,
  // cera, … con su monto) en el MISMO orden de la hoja Gastos.
  var expenseItems = expensesInPeriod.map(function(e){
    var who    = String(e.category || '').trim();
    var detail = String(e.description || '').trim();
    var name   = (who && detail && who !== detail) ? who + ' \u2014 ' + detail
               : (who || detail || 'Gasto');
    // `cat` es la categoría sola: es la que usa la vista «por categoría»
    // del reporte cuando hay muchos gastos (réplica de helpers.js).
    return { name: name, cat: who, amount: _toN(e.amount || 0) };
  });
  var totalExpenses = expensesInPeriod.reduce(function(s,e){ return s + _toN(e.amount||0); }, 0);
  var neto = revenue - totalExpenses;

  // ── Filas del libro (las que van al Excel adjunto) ────────────
  // Una fila por cita completada y una por gasto, en el mismo orden
  // que el libro del frontend (periodLedger): fecha, hora, y dentro
  // del mismo momento los ingresos antes que los gastos.
  var movsRows = [];
  incomes.forEach(function(a){
    var amount   = _toN(a.totalPrice || a.servicePrice || 0);
    var isDom    = a.domicilio === true || a.domicilio === 'true';
    var delivery = isDom ? Math.min(_toN(a.domicilioPrice || 0), amount) : 0;
    var m = String(a.paymentMethod || '').trim();
    movsRows.push({
      kind: 'in', date: _cleanDate(a.date), time: _cleanTime(a.time),
      who: a.clientName || '', detail: a.serviceNames || '',
      service: amount - delivery, delivery: delivery, amount: amount,
      payMethod: (m === 'Efectivo' || m === 'Transferencia') ? m : 'Sin registrar'
    });
  });
  expensesInPeriod.forEach(function(e){
    movsRows.push({
      kind: 'out', date: _cleanDate(e.date), time: '',
      who: e.category || '', detail: e.description || '',
      service: 0, delivery: 0, amount: _toN(e.amount || 0), payMethod: ''
    });
  });
  movsRows.sort(function(a, b){
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    if (a.kind === b.kind) return 0;
    return a.kind === 'in' ? -1 : 1;
  });

  // ── Hoja «Citas» del Excel ────────────────────────────────────
  // Las agendadas para el período MÁS las creadas en él (una cita
  // agendada para mañana y creada hoy aparece en ambos mundos).
  var citasRows = [];
  var yaVistas = {};
  var pushCita = function(a){
    var key = String(a.id || '');
    if (yaVistas[key]) return;
    yaVistas[key] = true;
    var tot    = _toN(a.totalPrice || a.servicePrice || 0);
    var isDom  = a.domicilio === true || a.domicilio === 'true';
    var dv     = isDom ? Math.min(_toN(a.domicilioPrice || 0), tot) : 0;
    var done   = _boolV(a.completed);
    var falta  = a.completed === 'noshow';
    var m = String(a.paymentMethod || '').trim();
    citasRows.push({
      date: _cleanDate(a.date), time: _cleanTime(a.time),
      clientName: a.clientName || '', clientPhone: a.clientPhone || '',
      serviceNames: a.serviceNames || '',
      service: tot - dv, delivery: dv, total: tot,
      dom: isDom ? 'Sí' : 'No', address: a.address || '',
      status: falta ? 'No asistió' : (done ? 'Completada' : 'Pendiente'),
      payMethod: (done && !falta)
        ? ((m === 'Efectivo' || m === 'Transferencia') ? m : 'Sin registrar') : '',
      createdAt: String(a.createdAt || '').slice(0, 19).replace('T', ' ')
    });
  };
  apptsInPeriod.forEach(pushCita);
  createdInPeriod.forEach(pushCita);
  citasRows.sort(function(a, b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

  // Domicilios (cantidad de citas + ingresos por domicilio en completadas)
  var domicilios = apptsInPeriod.filter(function(a){ return _boolV(a.domicilio); }).length;
  var domRevenue = totalDelivery;

  // Top servicios por demanda (sobre completadas). Resuelto contra el
  // catálogo por ID: partir `serviceNames` por la coma partía también
  // los servicios cuyo nombre traiga coma («Diseño, depilación y
  // sombreado» es UN servicio) y aparecían dos veces en el ranking.
  var topByDemand = _topServicesByDemand(apptsInPeriod, svcs);

  var label;
  if (period.type === 'day')        label = _fmtDayLabel(period.day);
  else if (period.type === 'week')  label = _fmtRangeLabel(period.from, period.to);
  else if (period.type === 'year')  label = 'Año ' + period.y;
  else                              label = _monthLabel(period.ym);

  return {
    created: created, scheduled: scheduled, completed: completed,
    pending: pending, noshow: noshow, completionRate: completionRate,
    revenue: revenue, projected: projected,
    totalService: totalService, totalDelivery: totalDelivery,
    totalCash: totalCash, totalTransfer: totalTransfer, totalNoMethod: totalNoMethod,
    expenseItems: expenseItems,
    totalExpenses: totalExpenses, neto: neto,
    domicilios: domicilios, domRevenue: domRevenue,
    topByDemand: topByDemand,
    movsRows: movsRows, citasRows: citasRows,
    range: { from: fromStr, to: toStr },
    label: label
  };
}

// ── Excel adjunto del reporte ───────────────────────────────────
// Apps Script no escribe .xlsx directamente: se crea una hoja de
// cálculo TEMPORAL con la MISMA estructura que el botón «📊 Exportar
// Excel» del ReportTab (Resumen / Movimientos / Citas), se descarga
// como xlsx por Drive y se adjunta al correo. La hoja temporal va a
// la papelera al terminar: no queda basura en el Drive.
//
// Devuelve el Blob listo para adjuntar, o null si algo falla. En ese
// caso el correo sale SIN adjunto: un reporte nunca se pierde por un
// problema del Excel.
function _buildReportXlsx(period, r) {
  var ssNew = null;
  try {
    // Misma guarda que el botón de Excel de la app: sin filas no hay
    // libro (evita rangos invertidos como SUM(F2:F1)).
    if (!r.movsRows.length) return null;

    ssNew = SpreadsheetApp.create('Reporte ' + r.label);
    var wsR = ssNew.getSheets()[0];
    wsR.setName('Resumen');
    var wsM = ssNew.insertSheet('Movimientos');
    var wsC = ssNew.insertSheet('Citas');

    var PESO  = '"$"#,##0';
    var first = 2;                        // 1ª fila de datos
    var last  = r.movsRows.length + 1;    // última fila de datos
    var tRow  = r.movsRows.length + 3;    // fila del TOTAL

    // Anchos de columna: puramente COSMÉTICO, y van en su propio
    // try/catch para que un detalle de formato nunca vuelva a hacer
    // perder el adjunto entero.
    //
    // OJO con las unidades: Sheet.setColumnWidth(col, ancho) recibe
    // PÍXELOS, pero los números de siempre (11, 7, 9, 22 …) venían
    // copiados de los `wch` del Excel de la app, que son CARACTERES.
    // Pasados como píxeles dejaban las columnas APRETADAS (11 px ≈ 2
    // letras) y había que hacer clic para ajustarlas. Ahora se
    // convierten a píxeles y encima se pide el ajuste automático al
    // contenido —justo lo que hacía ese clic—, que es el que manda.
    var anchosDe = function(ws, anchos){
      try {
        anchos.forEach(function(caracteres, i){
          ws.setColumnWidth(i + 1, caracteres * 7 + 5);
        });
        ws.autoResizeColumns(1, anchos.length);
      } catch (ign) { /* cosmético: se ignora */ }
    };

    // ── Hoja Movimientos ──────────────────────────────────────
    // A Fecha, B Hora, C Tipo, D Cliente/Categoría, E Detalle,
    // F Servicios, G Domicilio, H Ingreso (=F+G), I Gasto, J Método
    var movs = [['Fecha','Hora','Tipo','Cliente / Categoría','Detalle (servicios / gasto)',
                 'Servicios','Domicilio','Ingreso (total cita)','Gasto','Método de pago']];
    r.movsRows.forEach(function(row){
      movs.push(row.kind === 'in'
        ? [row.date, row.time, 'Ingreso', row.who, row.detail,
           row.service, row.delivery, row.amount, '', row.payMethod]
        : [row.date, row.time, 'Gasto', row.who, row.detail,
           '', '', '', row.amount, '']);
    });
    // Ojo con el renglón en blanco: setValues exige un arreglo
    // rectangular, así que va lleno con 10 celdas vacías (una fila []
    // lanza excepción y se pierde el adjunto entero).
    movs.push(['', '', '', '', '', '', '', '', '', '']);
    movs.push(['', '', '', '', 'TOTAL', '', '', '', '', '']);
    movs.push(['', '', '', '', 'NETO (Ingreso − Gasto)', '', '', '', '', '']);
    wsM.getRange(1, 1, movs.length, 10).setValues(movs);

    // La fórmula del ingreso se aplica celda por celda y SOLO en los
    // renglones de ingreso (los de gasto quedan vacíos, que es lo
    // mismo que hace el Excel de la app). Se evita setFormulas con
    // cadenas vacías, que es la única forma ambigua de esa API.
    r.movsRows.forEach(function(row, i){
      if (row.kind === 'in')
        wsM.getRange(i + 2, 8).setFormula('=F' + (i + 2) + '+G' + (i + 2));
    });
    wsM.getRange(tRow, 6, 1, 4).setFormulas([[
      '=SUM(F' + first + ':F' + last + ')',
      '=SUM(G' + first + ':G' + last + ')',
      '=SUM(H' + first + ':H' + last + ')',
      '=SUM(I' + first + ':I' + last + ')',
    ]]);
    wsM.getRange(tRow + 1, 8, 1, 1).setFormula('=H' + tRow + '-I' + tRow);
    // Datos + fila en blanco + TOTAL + NETO
    wsM.getRange(first, 6, r.movsRows.length + 3, 4).setNumberFormat(PESO);
    anchosDe(wsM, [11, 7, 9, 22, 40, 13, 13, 18, 13, 16]);

    // ── Hoja Resumen ──────────────────────────────────────────
    // Mismo cuidado que en Movimientos: todas las filas con 2 celdas,
    // aunque la segunda quede vacía (setValues exige filas rectangulares).
    var resumen = [
      ['REPORTE DE ACTIVIDAD', ''],
      ['Período', r.label],
      ['Generado', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')],
      ['', ''],
      ['Métrica', 'Valor'],
      ['Citas creadas (registradas en el período)', r.created],
      ['Citas agendadas para el período', r.scheduled],
      ['Citas completadas', r.completed],
      ['Citas pendientes', r.pending],
      ['No asistió', r.noshow],
      ['', ''],
      ['Ingresos por servicios', ''],
      ['Ingresos por domicilios', ''],
      ['TOTAL INGRESOS', ''],
      ['Gastos del período', ''],
      ['NETO (ingresos − gastos)', ''],
      ['', ''],
      ['Domicilios (cantidad de citas)', r.domicilios],
      ['Ingresos proyectados (con pendientes, incl. domicilios)', r.projected],
      ['', ''],
      ['Cobrado en efectivo', ''],
      ['Cobrado por transferencia', ''],
      ['Cobrado sin método registrado', ''],
    ];
    wsR.getRange(1, 1, resumen.length, 2).setValues(resumen);

    // filaDe() devuelve el NÚMERO DE FILA de Excel (el índice 0-based
    // del arreglo + 1), que es lo que piden las fórmulas.
    var filaDe = function(etiqueta){
      for (var i = 0; i < resumen.length; i++) if (resumen[i][0] === etiqueta) return i + 1;
      return -1;
    };
    var sumif = function(metodo){
      return '=SUMIF(Movimientos!J' + first + ':J' + last + ',"' + metodo +
             '",Movimientos!H' + first + ':H' + last + ')';
    };
    var fServ = filaDe('Ingresos por servicios');
    var fDom  = filaDe('Ingresos por domicilios');
    var fTot  = filaDe('TOTAL INGRESOS');
    var fGas  = filaDe('Gastos del período');
    var fNeto = filaDe('NETO (ingresos − gastos)');
    wsR.getRange(fServ, 2).setFormula('=Movimientos!F' + tRow);
    wsR.getRange(fDom,  2).setFormula('=Movimientos!G' + tRow);
    wsR.getRange(fTot,  2).setFormula('=B' + fServ + '+B' + fDom);
    wsR.getRange(fGas,  2).setFormula('=Movimientos!I' + tRow);
    wsR.getRange(fNeto, 2).setFormula('=B' + fTot + '-B' + fGas);
    var fEfe = filaDe('Cobrado en efectivo');
    wsR.getRange(fEfe,     2).setFormula(sumif('Efectivo'));
    wsR.getRange(fEfe + 1, 2).setFormula(sumif('Transferencia'));
    wsR.getRange(fEfe + 2, 2).setFormula(sumif('Sin registrar'));
    wsR.getRange(fServ, 2, fNeto - fServ + 1, 1).setNumberFormat(PESO);
    wsR.getRange(filaDe('Ingresos proyectados (con pendientes, incl. domicilios)'), 2)
       .setNumberFormat(PESO);
    wsR.getRange(fEfe, 2, 3, 1).setNumberFormat(PESO);
    anchosDe(wsR, [52, 18]);

    // ── Hoja Citas ────────────────────────────────────────────
    var citas = [['Fecha','Hora','Cliente','Teléfono','Servicios','Valor servicios',
                  'Valor domicilio','Total','Domicilio','Dirección','Estado',
                  'Método de pago','Creada el']];
    r.citasRows.forEach(function(c){
      citas.push([c.date, c.time, c.clientName, c.clientPhone, c.serviceNames,
                  c.service, c.delivery, c.total, c.dom, c.address, c.status,
                  c.payMethod, c.createdAt]);
    });
    wsC.getRange(1, 1, citas.length, 13).setValues(citas);
    if (r.citasRows.length) wsC.getRange(2, 6, r.citasRows.length, 3).setNumberFormat(PESO);
    anchosDe(wsC, [10, 6, 20, 14, 30, 14, 14, 12, 10, 30, 12, 16, 20]);

    // ── Descargar como .xlsx y devolver el blob ──
    var id  = ssNew.getId();
    var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
    var token = 'Bearer ' + ScriptApp.getOAuthToken();

    // Forzar a que las escrituras queden aplicadas y dejarle un momento
    // al backend del export: si se exporta apenas se escribió, Google
    // devuelve el .xlsx VACÍO aunque la hoja ya tenga datos (y encima
    // con código 200, así que el reintento de abajo no lo pilla solo).
    SpreadsheetApp.flush();
    Utilities.sleep(1500);

    var resp = null, bytes = null, blob = null;
    // Hasta 3 intentos. Cada uno se descarta si el export falla
    // (código != 200) o si no devuelve un .xlsx de verdad.
    for (var intento = 1; intento <= 3; intento++) {
      resp = UrlFetchApp.fetch(url, {
        headers: { Authorization: token }, muteHttpExceptions: true
      });
      if (resp.getResponseCode() === 200) {
        // Ojo: HTTPResponse NO tiene getBytes(); el binario sale del
        // blob (Blob.getBytes() sí existe en Apps Script).
        blob = resp.getBlob();
        bytes = blob.getBytes();
        // Un .xlsx es un ZIP: tiene que empezar por 'PK'. Si no, Google
        // devolvió una página HTML de error con código 200: eso era lo
        // que producía el adjunto «vacío». (0x50 y 0x4B son los bytes
        // de «PK», que además son positivos: sirven igual si Apps
        // Script devuelve los bytes con signo.)
        if (bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B) break;
        bytes = null;
        blob = null;
      }
      Utilities.sleep(900);
    }
    if (!blob) {
      var codigo = resp ? resp.getResponseCode() : 0;
      throw new Error(codigo === 200
        ? 'El export .xlsx no devolvi\u00f3 un archivo v\u00e1lido'
        : 'El export .xlsx respondi\u00f3 ' + codigo);
    }

    return blob.setName(_xlsxName(period));
  } catch (ex) {
    console.error('ERROR generando el Excel del reporte: ' + ex.message);
    return null;
  } finally {
    // La hoja temporal se manda a la papelera sin importar el resultado.
    try { if (ssNew) DriveApp.getFileById(ssNew.getId()).setTrashed(true); } catch (_) {}
  }
}

// Nombre del archivo: igual que el del botón de la app
// (reporte_<día> / reporte_<mes> / reporte_<año> / reporte_<desde>_<hasta>.xlsx).
function _xlsxName(period) {
  if (period.type === 'day')   return 'reporte_' + period.day + '.xlsx';
  if (period.type === 'month') return 'reporte_' + period.ym + '.xlsx';
  if (period.type === 'year')  return 'reporte_' + period.y + '.xlsx';
  return 'reporte_' + period.from + '_' + period.to + '.xlsx';
}

// ── Gastos por categoría (vista agrupada del reporte) ───────────
// Cuando el período trae muchos gastos, el reporte deja de listarlos uno
// por uno y pasa a UNA LÍNEA POR CATEGORÍA con su conteo
// («Gasolina: $150.000 (5)»), de mayor a menor monto.
//
// Réplica de groupExpensesByCategory (helpers.js): MISMO orden y mismo
// criterio de desempate (por nombre, SIN localeCompare, que puede variar
// entre entornos), porque la prueba de paridad exige que el correo salga
// idéntico al WhatsApp del admin.
function _groupExpenses(items) {
  var mapa = {};
  items.forEach(function(e){
    var cat = String(e.cat || '').trim() || 'Sin categor\u00eda';
    if (!mapa[cat]) mapa[cat] = { cat: cat, amount: 0, count: 0 };
    mapa[cat].amount += Number(e.amount) || 0;
    mapa[cat].count  += 1;
  });
  var lista = [];
  for (var k in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, k)) lista.push(mapa[k]);
  }
  lista.sort(function(a, b){
    if (b.amount !== a.amount) return b.amount - a.amount;
    if (a.cat < b.cat) return -1;
    if (a.cat > b.cat) return 1;
    return 0;
  });
  return lista;
}

// ── Núcleo: arma el mensaje (plain + HTML) y lo envía ─────────
// period + kind ('DIARIO'|'SEMANAL'|'MENSUAL').
// IMPORTANTE: el cuerpo replica LÍNEA POR LÍNEA el texto de
// `reportLines` (helpers.js) que usa el botón «💬 WhatsApp admin» del
// ReportTab. Si cambia el formato de uno, hay que cambiar el otro:
// el test de paridad en backend.test.js los compara y falla si se
// desalinean.
function _sendReportEmail(period, kind) {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  // Destinatario desde SB_AUTHORIZED_EMAIL: si falta, se omite el
  // reporte avisando en el log en vez de fallar el trigger.
  var recipient = _authorizedEmail();
  if (!recipient) {
    console.warn(_bizName() + ': falta la propiedad SB_AUTHORIZED_EMAIL; se omite el reporte ' + kind + '.');
    return;
  }

  initSheets(SpreadsheetApp.getActiveSpreadsheet());
  var r = _buildReport(period);

  // Con DETALLE_MAX gastos o menos el reporte lista el detalle uno por
  // uno; con más, una línea por categoría (mismos umbrales del frontend).
  var DETALLE_MAX = 8;
  var agrupar = r.expenseItems.length > DETALLE_MAX;
  var grupos = agrupar ? _groupExpenses(r.expenseItems) : [];
  // Tope de categorías visibles en la vista agrupada (son poquísimas en
  // la práctica); el total de abajo SIEMPRE suma todos los gastos.
  var MAX_EXP = 20;

  // ── Emojis (plain text via String.fromCharCode)
  var SPARK  = String.fromCharCode(0x2728);                   // ✨
  var CAL    = String.fromCharCode(0xD83D, 0xDCC5);             // 📅
  var CHART  = String.fromCharCode(0xD83D, 0xDCCA);             // 📊
  var MONEY  = String.fromCharCode(0xD83D, 0xDCB0);             // 💰
  var MOTO   = String.fromCharCode(0xD83D, 0xDEF5);             // 🛵
  var BULLET = String.fromCharCode(0x2022);                     // •
  var EXPENSE = String.fromCharCode(0xD83D, 0xDCB8);            // 💸
  var CARD   = String.fromCharCode(0xD83D, 0xDCB3);             // 💳

  // ── Emojis (HTML hex entities para htmlBody — immune a charset)
  var hSPARK = '&#x2728;', hCAL = '&#x1F4C5;', hCHART = '&#x1F4CA;',
      hMONEY = '&#x1F4B0;', hMOTO = '&#x1F6F5;', hBULLET = '&#x2022;',
      hEXPENSE = '&#x1F4B8;', hCARD = '&#x1F4B3;';

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
  if (r.noshow > 0) lines.push(BULLET + ' No asisti\u00f3: *' + r.noshow + '*');
  lines.push('');
  lines.push(MONEY + ' *Ingresos*');
  lines.push(BULLET + ' Servicio(s): *' + fmtM(r.totalService) + '*');
  lines.push(BULLET + ' Domicilios: *' + fmtM(r.totalDelivery) + '*');
  lines.push(BULLET + ' Total recibido: *' + fmtM(r.revenue) + '*');
  lines.push('   - Efectivo: *' + fmtM(r.totalCash) + '*');
  lines.push('   - Transferencia: *' + fmtM(r.totalTransfer) + '*');
  if (r.totalNoMethod > 0) lines.push('   - Sin m\u00e9todo registrado: *' + fmtM(r.totalNoMethod) + '*');
  lines.push(BULLET + ' Proyectado: *' + fmtM(r.projected) + '*');
  lines.push('');
  lines.push(EXPENSE + (agrupar ? ' *Gastos (por categor\u00eda)*' : ' *Gastos*'));
  // Pocos gastos → un renglón por gasto; muchos → un renglón por
  // CATEGORÍA de mayor a menor con el conteo («Gasolina: $150.000 (5)»),
  // que no se corta casi nunca. El tope solo aplica a esa vista agrupada
  // y el total de abajo SIEMPRE suma todos los gastos del período.
  if (!agrupar) {
    r.expenseItems.forEach(function(e){
      lines.push('   - ' + e.name + ': *' + fmtM(e.amount) + '*');
    });
  } else {
    grupos.slice(0, MAX_EXP).forEach(function(c){
      lines.push('   - ' + c.cat + ': *' + fmtM(c.amount) + '* (' + c.count + ')');
    });
    if (grupos.length > MAX_EXP)
      lines.push('   \u2026 y ' + (grupos.length - MAX_EXP) + ' categor\u00eda(s) m\u00e1s');
  }
  lines.push(BULLET + ' Total gastos: *' + fmtM(r.totalExpenses) + '*');
  lines.push('');
  lines.push(CARD + ' *Neto*: *' + fmtM(r.neto) + '*');
  if (r.domicilios > 0) {
    lines.push('', MOTO + ' *Domicilios*: ' + r.domicilios + ' citas \u00b7 ' + fmtM(r.domRevenue));
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
  if (r.noshow > 0) hlines.push(hBULLET + ' No asisti\u00f3: <b>' + r.noshow + '</b>');
  hlines.push('');
  hlines.push(hMONEY + ' <b>Ingresos</b>');
  hlines.push(hBULLET + ' Servicio(s): <b>' + esc(fmtM(r.totalService)) + '</b>');
  hlines.push(hBULLET + ' Domicilios: <b>' + esc(fmtM(r.totalDelivery)) + '</b>');
  hlines.push(hBULLET + ' Total recibido: <b>' + esc(fmtM(r.revenue)) + '</b>');
  hlines.push('   - Efectivo: <b>' + esc(fmtM(r.totalCash)) + '</b>');
  hlines.push('   - Transferencia: <b>' + esc(fmtM(r.totalTransfer)) + '</b>');
  if (r.totalNoMethod > 0) hlines.push('   - Sin m\u00e9todo registrado: <b>' + esc(fmtM(r.totalNoMethod)) + '</b>');
  hlines.push(hBULLET + ' Proyectado: <b>' + esc(fmtM(r.projected)) + '</b>');
  hlines.push('');
  hlines.push(hEXPENSE + (agrupar ? ' <b>Gastos (por categor\u00eda)</b>' : ' <b>Gastos</b>'));
  if (!agrupar) {
    r.expenseItems.forEach(function(e){
      hlines.push('   - ' + esc(e.name) + ': <b>' + esc(fmtM(e.amount)) + '</b>');
    });
  } else {
    grupos.slice(0, MAX_EXP).forEach(function(c){
      hlines.push('   - ' + esc(c.cat) + ': <b>' + esc(fmtM(c.amount)) + '</b> (' + c.count + ')');
    });
    if (grupos.length > MAX_EXP)
      hlines.push('   \u2026 y ' + (grupos.length - MAX_EXP) + ' categor\u00eda(s) m\u00e1s');
  }
  hlines.push(hBULLET + ' Total gastos: <b>' + esc(fmtM(r.totalExpenses)) + '</b>');
  hlines.push('');
  hlines.push(hCARD + ' <b>Neto</b>: <b>' + esc(fmtM(r.neto)) + '</b>');
  if (r.domicilios > 0) {
    hlines.push('', hMOTO + ' <b>Domicilios</b>: ' + r.domicilios + ' citas \u00b7 ' + esc(fmtM(r.domRevenue)));
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
    '<br><br><small style="color:#888">Reporte autom\u00e1tico ' + kind.toLowerCase() + '</small>' +
    '</body></html>';

  // Excel adjunto: la MISMA estructura que el botón de la app
  // (Resumen / Movimientos / Citas). Si falla, sale null y el correo
  // se manda igual, sin adjunto.
  var xlsx = _buildReportXlsx(period, r);
  var opts = { htmlBody: htmlBody, noReply: true };
  if (xlsx) {
    opts.attachments = [xlsx];
  } else {
    // Señal VISIBLE de que el adjunto no salió (el texto plano no se
    // toca: tiene que quedar idéntico al WhatsApp del admin).
    opts.htmlBody += '<br><small style="color:#c0392b">' +
      String.fromCharCode(0x26A0) + ' El Excel del reporte no se pudo generar: el correo va sin adjunto.</small>';
  }

  GmailApp.sendEmail(recipient, subject, msg, opts);
  console.log('OK Reporte ' + kind + ' enviado a ' + recipient +
              (xlsx ? ' (con Excel adjunto)' : ' (sin adjunto)'));
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
 * REPORTE ANUAL (31 de diciembre a las 12 p.m.) — año completo en curso,
 * del 1 de enero al 31 de diciembre. Igual guarda que el mensual: Apps
 * Script no tiene trigger "último día del año", así que el trigger
 * dispara todos los días y esta función sale sin enviar salvo que hoy
 * sea el 31 de diciembre.
 */
function sendYearlyReportEmail() {
  try {
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    if (today.slice(5) !== '12-31') {   // 'MM-DD'
      console.log('SKIP reporte anual: hoy (' + today + ') no es 31 de diciembre');
      return;
    }
    var y = Utilities.formatDate(now, tz, 'yyyy');
    _sendReportEmail({ type: 'year', y: y }, 'ANUAL');
  } catch(ex) {
    console.error('ERROR al enviar reporte anual: ' + ex.message);
  }
}

/**
 * Instala los 4 triggers: diario (everyDays 12:00), semanal (domingo 12:00),
 * mensual (everyDays 12:00 + guard de fin-de-mes) y anual (everyDays
 * 12:00 + guard de 31 de diciembre). Idempotente.
 */
function setupAllReportTriggers() {
  removeAllReportTriggers();
  ScriptApp.newTrigger('sendDailyReportEmail')
    .timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendWeeklyReportEmail')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendMonthlyReportEmail')
    .timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  ScriptApp.newTrigger('sendYearlyReportEmail')
    .timeBased().everyDays(1).atHour(12).nearMinute(0).create();
  console.log('OK 4 triggers (daily / weekly-sun / monthly-lastDay / yearly-dec31) a las 12:00 p.m.');
}

/**
 * Elimina los 4 triggers de reporte (o los que existan). Idempotente.
 */
function removeAllReportTriggers() {
  var names = ['sendDailyReportEmail','sendWeeklyReportEmail','sendMonthlyReportEmail','sendYearlyReportEmail'];
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
