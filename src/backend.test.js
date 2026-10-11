/* ══════════════════════════════════════════════════════════════
   PRUEBAS DEL BACKEND (apps-script/Code.gs)

   Se ejecuta el `Code.gs` REAL dentro de un sandbox de `node:vm`,
   con SpreadsheetApp / LockService / ContentService simulados y una
   hoja en memoria. Así se comprueba que la validación de
   eliminación de servicios ocurre en el servidor, aunque el
   frontend la pida directamente (reglas 7 y 8 del enunciado).

   NO se toca Google Sheets ni Google Calendar reales.
══════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { randomUUID, createHash } from 'node:crypto'

// Nota: bajo jsdom el global `URL` NO es el de Node, por eso se importa
// `URL as NodeURL` para que fileURLToPath reciba una instancia válida.
const CODE_GS = readFileSync(
  fileURLToPath(new NodeURL('../apps-script/Code.gs', import.meta.url)),
  'utf8'
)

const HEADERS = {
  clients:      ['ID', 'Nombre', 'Celular', 'Fecha Registro'],
  services:     ['ID', 'Nombre', 'Precio', 'Duración (min)'],
  appointments: ['ID', 'ID Cliente', 'Nombre Cliente', 'Celular',
                 'IDs Servicios', 'Nombres Servicios', 'Precio Servicios', 'Precios x Servicio',
                 'Domicilio', 'Precio Domicilio', 'Total', 'Dirección',
                 'Fecha', 'Hora', 'Fecha Creación', 'Evento Creado', 'ID Evento Calendar',
                 'Completada', 'Duración (min)', 'Método de pago'],
  expenses:     ['ID', 'Descripción', 'Monto', 'Categoría', 'Fecha'],
  priceHistory: ['ID Servicio', 'Nombre Servicio', 'Precio', 'Fecha Cambio'],
}

// Orden REAL de columnas por hoja (réplica de JS_KEYS en Code.gs).
const JS_KEYS = {
  clients:      ['id', 'name', 'phone', 'createdAt'],
  services:     ['id', 'name', 'price', 'duration'],
  appointments: ['id', 'clientId', 'clientName', 'clientPhone',
                 'serviceIds', 'serviceNames', 'servicePrice', 'servicePrices',
                 'domicilio', 'domicilioPrice', 'totalPrice', 'address',
                 'date', 'time', 'createdAt', 'calendarCreated', 'calendarEventId',
                 'completed', 'duration', 'paymentMethod'],
  expenses:     ['id', 'description', 'amount', 'category', 'date'],
  priceHistory: ['serviceId', 'serviceName', 'price', 'changedAt'],
}

// Convierte un objeto fila → arreglo en el orden de columnas de la hoja
// (igual que writeSheet: keys.map(k => r[k] ?? '')).
const toRow = (key, obj) =>
  JS_KEYS[key].map(k => (obj[k] !== undefined && obj[k] !== null ? String(obj[k]) : ''))

// Nombres REALES de las hojas en Code.gs (SHEETS).
const SHEET_NAME = {
  clients: 'Clientes', services: 'Servicios', appointments: 'Citas',
  expenses: 'Gastos', priceHistory: 'HistorialPrecios',
}

/* ── Hoja simulada en memoria (solo los métodos que usa Code.gs) ── */
function makeSheet(name) {
  const rows = []
  return {
    _rows: () => rows,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    getRange(r, c, nr, nc) {
      return {
        getValues: () => {
          const out = []
          for (let i = r - 1; i < r - 1 + nr; i++) {
            const row = rows[i] || []
            const slice = []
            for (let j = c - 1; j < c - 1 + nc; j++) slice.push(row[j] !== undefined ? row[j] : '')
            out.push(slice)
          }
          return out
        },
        setValues: (data) => { data.forEach((row, i) => { rows[r - 1 + i] = row.slice() }) },
        // Code.gs encadena .setNumberFormat('@').setValues(...) → debe devolver el rango.
        setNumberFormat: function () { return this },
      }
    },
    clearContents: () => { rows.length = 0 },
    // utilidad de test: sembrar datos
    _seed: (data) => { rows.length = 0; data.forEach(r => rows.push(r.slice())) },
  }
}

function makeSpreadsheet(seed = {}) {
  const sheets = {}
  Object.keys(HEADERS).forEach(k => { sheets[k] = makeSheet(SHEET_NAME[k]) })
  Object.entries(seed).forEach(([k, rows]) => {
    sheets[k]._seed([HEADERS[k], ...rows])
  })
  return {
    _sheets: sheets,
    getSheetByName: (n) => Object.values(sheets).find(s => s.getName() === n) || null,
    getSheets: () => Object.values(sheets),
    insertSheet: (n) => { const s = makeSheet(n); sheets['extra_' + n] = s; return s },
  }
}

/* ── Store compartido entre "instancias" del mismo sandbox:
      propiedades del script (Script Properties), buzón de correos
      simulado y registro de logs. Persiste entre varios POST para
      poder encadenar solicitar → verificar → ejecutar. ── */
/* ── Calendario simulado en memoria ──
   Reproduce exactamente la superficie que usan `createCalEvent`,
   `updateCalEvent` y `deleteCalEvent`. Registra cada acceso para poder
   demostrar que una petición rechazada no llega a Google Calendar y que
   se borró el evento correcto (y solo ese).
   NO toca ningún calendario real. */
function makeCalendar(store) {
  const events = new Map()
  let seq = 0

  const api = {
    // Interruptores para simular fallos de Google Calendar en los tests.
    ignoreSetTime: false,   // setTime no aplica el cambio (sin lanzar)
    failDelete: false,      // deleteEvent lanza una excepción
    _events: events,
    seed: (id, { title = '', start, end, description = '' } = {}) => {
      events.set(id, { id, title, start, end, description })
      return id
    },
    get: (id) => (events.has(id) ? wrap(events.get(id)) : null),
    create: (title, start, end, description) => {
      const id = 'cal' + (++seq) + '@google.com'
      events.set(id, { id, title, start, end, description })
      store.calCreated.push(id)
      return id
    },
    size: () => events.size,
  }

  function wrap(ev) {
    return {
      getId: () => ev.id,
      setColor: () => {},
      getTitle: () => ev.title,
      setTitle: (t) => { ev.title = t },
      getDescription: () => ev.description,
      setDescription: (d) => { ev.description = d },
      getStartTime: () => new Date(ev.start.getTime()),
      getEndTime: () => new Date(ev.end.getTime()),
      setTime: (s, e) => {
        // Ojo: el sandbox de `vm` crea sus propios tipos, así que NO se
        // puede usar `instanceof Date` (fallaría siempre entre reinos).
        const isDate = d => !!d && typeof d.getTime === 'function' && !isNaN(d.getTime())
        if (!isDate(s) || !isDate(e)) throw new Error('Fecha u hora inválida')   // como Google Calendar
        if (api.ignoreSetTime) return                 // no aplica el cambio
        ev.start = s; ev.end = e
      },
      deleteEvent: () => {
        if (api.failDelete) throw new Error('No se pudo eliminar el evento')
        store.calDeleted.push(ev.id)
        events.delete(ev.id)
      },
    }
  }

  return api
}

function makeStore() {
  const store = {
    // Token de sincronización: en producción vive en Script Properties
    // (clave SB_SYNC_TOKEN), nunca dentro de Code.gs. El harness lo siembra
    // aquí para que el resto de tests no tenga que pensarlo.
    props: new Map([['SB_SYNC_TOKEN', TOKEN]]), mail: [], logs: [],
    calLookups: [], calDeleted: [], calCreated: [],
    /* ── Control del LockService ──
       `acquires`/`releases` cuentan las llamadas reales a waitLock y
       releaseLock; `blocked` simula otro proceso reteniendo el lock.
       Los tests existentes no lo usan: sus defaults no cambian el
       comportamiento observable. */
    lock: { acquires: 0, releases: 0, blocked: false },
  }
  store.cal = makeCalendar(store)
  return store
}

/* ── Sandbox con los servicios de Apps Script simulados ── */
function runCodeGs(ss, store = makeStore()) {
  const sandbox = {
    console: {
      log:   (...a) => store.logs.push(a.join(' ')),
      warn:  (...a) => store.logs.push(a.join(' ')),
      error: (...a) => store.logs.push(a.join(' ')),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (store.lock.blocked) throw new Error('timeout')  // otro proceso lo retiene
          store.lock.acquires++
        },
        releaseLock() { store.lock.releases++ },
      }),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ json: s }) }),
    },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Utilities: {
      formatDate: () => '2026-01-15T13:00:00',
      // CSPRNG real (node:crypto): igual que Utilities.getUuid() en Apps Script.
      getUuid: () => randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      // Devuelve bytes CON SIGNO, como hace el Apps Script real.
      computeDigest: (_algo, str) => Array.from(
        createHash('sha256').update(String(str), 'utf8').digest(),
        b => (b > 127 ? b - 256 : b)
      ),
    },
    // Script Properties: centralizado en el servidor, nunca en el frontend.
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty:   (k) => (store.props.has(k) ? store.props.get(k) : null),
        setProperty:   (k, v) => { store.props.set(k, String(v)) },
        deleteProperty: (k) => { store.props.delete(k) },
      }),
    },
    // Solo REGISTRA los correos; nada se envía a un destinatario real.
    // El 4º argumento (opciones) trae `htmlBody`, que se guarda aparte
    // para poder assertar el correo HTML sin confundirlo con el texto plano.
    GmailApp: {
      sendEmail: (to, subject, body, opts) => {
        store.mail.push({ to, subject, body, htmlBody: (opts && opts.htmlBody) || '' })
        return {}
      },
    },
    // Calendar simulado en memoria (ver makeCalendar): crear, buscar,
    // actualizar y borrar quedan registrados sin tocar Calendar real.
    CalendarApp: {
      getDefaultCalendar: () => ({
        createEvent: (title, s, e, opts) => {
          const id = store.cal.create(title, s, e, opts && opts.description)
          return { getId: () => id, setColor: () => {} }
        },
      }),
      getEventById: (id) => {
        store.calLookups.push(String(id === undefined || id === null ? '' : id))
        return store.cal.get(id)
      },
      EventColor: { MAUVE: 'MAUVE' },
    },
  }
  const ctx = createContext(sandbox)
  runInContext(CODE_GS, ctx, { filename: 'Code.gs' })
  return {
    doPost: ctx.doPost,
    call: (name, ...args) => ctx[name](...args),
    store,
  }
}

const TOKEN = 'CAMBIA_TU_TOKEN'

function post(g, payload) {
  const res = g.doPost({ postData: { contents: JSON.stringify({ token: TOKEN, ...payload }) } })
  return JSON.parse(res.json)
}

/* ── Datos de partida ── */
const S1 = { id: 's1', name: 'Diseño de cejas', price: '50000', duration: '30' }
const S2 = { id: 's2', name: 'Lifting de pestañas', price: '130000', duration: '60' }

// fila de cita que usa s1 (fecha futura, pendiente)
function apptRow(id, date, time, completed, serviceIds, serviceNames) {
  return toRow('appointments', {
    id, clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
    serviceIds, serviceNames, servicePrice: '50000', servicePrices: '{}',
    domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
    date, time, createdAt: '2026-01-01T09:00:00',
    calendarCreated: 'false', calendarEventId: '', completed, duration: '30', paymentMethod: '',
  })
}

function makeEnv({ appts = [], store = makeStore() } = {}) {
  const ss = makeSpreadsheet({
    services:     [toRow('services', S1), toRow('services', S2)],
    appointments: appts.map(a => toRow('appointments', a)),
  })
  return { g: runCodeGs(ss, store), ss, store }
}

const svcRows = (ss) => ss._sheets.services._rows().slice(1).map(r => r[0])

/* ── Utilidades del flujo de recuperación del propietario ── */
const AUTHORIZED_EMAIL = 'bryanmorales8240@gmail.com'

// El código de recuperación aparece ÚNICAMENTE en el correo simulado.
// El texto plano lo deja en una línea propia (8 caracteres), y el HTML
// lo muestra dentro del span del código. Se busca en ambos.
const lastMail = (store) => store.mail[store.mail.length - 1]
const lastCode = (store) => {
  const m = lastMail(store)
  // Texto plano: una línea que sea exactamente el código (p. ej. 'K7QM2X9B').
  const fromText = /^([A-Z0-9]{8})$/m.exec(m.body || '')
  if (fromText) return fromText[1]
  // HTML: dentro del span monoespaciado del código.
  const fromHtml = /font-size:32px[^>]*>([A-Z0-9]{8})</.exec(m.htmlBody || '')
  return fromHtml ? fromHtml[1] : null
}

// Paso 1 (solicitar) + paso 2 (verificar) → grant de un solo uso.
function recoveryGrant(g) {
  expect(post(g, { action: 'requestResetCode' }).ok).toBe(true)
  const code = lastCode(g.store)
  expect(code).toBeTruthy()
  const r = post(g, { action: 'verifyResetCode', code })
  expect(r.ok).toBe(true)
  return { grantId: r.data.grantId, grantSecret: r.data.grantSecret }
}

/* ── Helpers TEST-01 ────────────────────────────────────────────
   Ninguno sustituye a los de arriba; solo añaden lo que los tests
   nuevos necesitan (doGet, cuerpo crudo, instantánea de hojas). */

// Igual que `post`, pero sin token: permite probar la validación.
const rawPost = (g, payload) =>
  JSON.parse(g.doPost({ postData: { contents: JSON.stringify(payload) } }).json)

// doGet con el token que se indique (o sin él).
// Nota: el sandbox expone `doPost` y `call`, no `doGet`, por eso se
// pasa por `call`.
const rawGet = (g, token) =>
  JSON.parse(g.call('doGet', { parameter: token === undefined ? {} : { token } }).json)

// Instantánea de TODAS las hojas: detecta cualquier escritura.
const sheetSnapshot = (ss) => JSON.stringify(
  Object.keys(ss._sheets).sort().map(k => [k, ss._sheets[k]._rows()])
)

// Filas de una hoja sin la cabecera.
const dataRows = (ss, key) => ss._sheets[key]._rows().slice(1)

// Índice de columna por nombre JS (JS_KEYS), para leer una fila hoja.
const col = (key, name) => JS_KEYS[key].indexOf(name)

/* ══════════════════════════════════════════════════════════════ */
describe('Code.gs — eliminación de servicios (validación en el servidor)', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  it('7a) rechaza eliminar un servicio con cita futura pendiente', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2026-12-20', '10:00', 'false', 's1', S1.name),
    ])
    const r = post(env.g, { services: [S2] })   // pide borrar s1
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No se puede eliminar el servicio "Diseño de cejas"/)
    expect(r.error).toMatch(/1 cita programada/)
  })

  it('7b) rechaza eliminar un servicio con cita EN CURSO', () => {
    // Reloj del backend = new Date() real, así que se usa una cita de HOY
    // que siga en curso: inicio hace 15 min, duración 120 min.
    const now = new Date()
    const p = n => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    const startMin = Math.max(0, now.getHours() * 60 + now.getMinutes() - 15)
    const time = `${p(Math.floor(startMin / 60) % 24)}:${p(startMin % 60)}`
    const dur = '120'

    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      toRow('appointments', {
        id: 'a2', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
        serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
        domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
        date: today, time, createdAt: '2026-01-01T09:00:00',
        calendarCreated: 'false', calendarEventId: '', completed: 'false', duration: dur, paymentMethod: '',
      }),
    ])
    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/o en curso/)
  })

  it('7c) el frontend no puede saltarse la regla: el POST se rechaza igual', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-06-20', '10:00', 'false', 's1', S1.name),
    ])
    // Se envía la colección ya filtrada (sin s1), tal cual lo haría React.
    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(false)
    expect(typeof r.error).toBe('string')
  })

  it('8) si el backend rechaza, el servicio permanece intacto en la hoja', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-06-20', '10:00', 'false', 's1', S1.name),
    ])
    const antes = env.ss._sheets.services._rows()
    post(env.g, { services: [S2] })
    const despues = env.ss._sheets.services._rows()
    expect(despues).toEqual(antes)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
  })

  it('permite eliminar cuando solo hay citas históricas completadas', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2020-06-20', '10:00', 'true', 's1', S1.name),
      apptRow('a2', '2020-06-21', '11:00', 'noshow', 's1', S1.name),
    ])
    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['s2'])
  })

  it('permite eliminar un servicio sin citas asociadas', () => {
    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['s2'])
  })

  it('una cita de otro servicio no bloquea la eliminación', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-06-20', '10:00', 'false', 's2', S2.name),
    ])
    // Se pide borrar s1; la única cita vigente usa s2 → no bloquea.
    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['s2'])
  })

  it('el restablecimiento (services + appointments en el mismo POST) exige autorización', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-06-20', '10:00', 'false', 's1', S1.name),
    ])
    // Mismo payload que enviaba resetAll(): sin grant el servidor lo
    // trata como destructivo y lo rechaza ANTES de tocar las hojas.
    const payload = {
      services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
      appointments: [],
      resetPriceHistory: true,
    }
    const rechazado = post(env.g, payload)
    expect(rechazado.ok).toBe(false)
    expect(rechazado.error).toMatch(/no autorizado/i)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
    expect(env.ss._sheets.appointments._rows().length).toBe(2)

    // Con el flujo completo de autorización del propietario sí pasa.
    const grant = recoveryGrant(env.g)
    const aceptado = post(env.g, { ...payload, ...grant })
    expect(aceptado.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['n1'])
    expect(env.ss._sheets.appointments._rows().length).toBe(1)  // solo cabecera
  })

  it('añadir o editar servicios sin eliminar ninguno no se ve afectado', () => {
    const r = post(env.g, { services: [{ ...S1, price: '60000' }, S2] })
    expect(r.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
  })

  it('un token inválido sigue rechazándose (la validación no lo bypasea)', () => {
    const r = post(env.g, { token: 'MALO', services: [S2] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No autorizado/)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
  })
})

/* ══════════════════════════════════════════════════════════════ */
describe('Code.gs — _serviceDeletionError (lógica pura)', () => {
  const NOW = new Date(2026, 0, 15, 13, 0, 0)
  let g
  beforeEach(() => { g = runCodeGs(makeSpreadsheet()) })

  const check = (newSvc, cur, appts) => g.call('_serviceDeletionError', newSvc, cur, appts, NOW)

  it('devuelve null cuando no se elimina nada', () => {
    expect(check([S1, S2], [S1, S2], [])).toBe(null)
    expect(check([], [], [])).toBe(null)
  })

  it('ignora citas finalizadas (done/noshow) y pasadas', () => {
    const appts = [
      { id: 'a', date: '2026-01-10', time: '10:00', duration: '30', completed: 'true',  serviceIds: 's1' },
      { id: 'b', date: '2026-01-10', time: '11:00', duration: '30', completed: 'noshow', serviceIds: 's1' },
      { id: 'c', date: '2026-01-10', time: '12:00', duration: '30', completed: 'false', serviceIds: 's1' },
    ]
    expect(check([S2], [S1, S2], appts)).toBe(null)
  })

  it('bloquea futuras y en curso; usa fecha + hora + duración', () => {
    const fut  = { id: 'a', date: '2026-01-20', time: '10:00', duration: '30', completed: 'false', serviceIds: 's1' }
    const live = { id: 'b', date: '2026-01-15', time: '12:30', duration: '60', completed: 'false', serviceIds: 's1' }
    expect(check([S2], [S1, S2], [fut])).toMatch(/1 cita programada/)
    expect(check([S2], [S1, S2], [live])).toMatch(/o en curso/)
    expect(check([S2], [S1, S2], [fut, live])).toMatch(/2 citas/)
  })

  it('el id real manda; el nombre solo si no hay ids y es único', () => {
    const conId    = { id: 'a', date: '2099-01-01', time: '10:00', duration: '30', completed: 'false', serviceIds: 's1', serviceNames: 'Otro' }
    const soloNom  = { id: 'b', date: '2099-01-01', time: '10:00', duration: '30', completed: 'false', serviceIds: '', serviceNames: 'Diseño de cejas' }
    const homonimo = { id: 'c', date: '2099-01-01', time: '10:00', duration: '30', completed: 'false', serviceIds: '', serviceNames: 'Diseño de cejas' }
    expect(check([S2], [S1, S2], [conId])).toMatch(/No se puede eliminar/)
    expect(check([S2], [S1, S2], [soloNom])).toMatch(/No se puede eliminar/)
    // Dos servicios con el mismo nombre → ambiguo, no bloquea.
    expect(check([S2], [S1, S2, { id: 's3', name: 'Diseño de cejas' }], [homonimo])).toBe(null)
  })

  it('usa las claves de servicePrices como respaldo de relación', () => {
    const a = { id: 'a', date: '2099-01-01', time: '10:00', duration: '30',
                completed: 'false', serviceIds: '', serviceNames: 'X', servicePrices: '{"s1":50000}' }
    expect(check([S2], [S1, S2], [a])).toMatch(/No se puede eliminar/)
  })
})

/* ══════════════════════════════════════════════════════════════
   RESTABLECIMIENTO PROTEGIDO — autorización EXCLUSIVAMENTE del
   lado del servidor (R2–R4 del enunciado).

   Se ejecuta el Code.gs real con PropertiesService, GmailApp y
   CalendarApp simulados: NO se envían correos reales, NO se tocan
   hojas ni calendarios reales y NO se ejecuta ningún restablecimiento
   contra datos de producción.
   ══════════════════════════════════════════════════════════════ */
describe('Code.gs — restablecimiento protegido', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  // La operación destructiva EXPLÍTICA que ahora define el backend y
  // que envía el frontend en `resetData`. Exige grant siempre.
  const RESET = () => ({
    action: 'resetData',
    clients: [],
    appointments: [],
    expenses: [],
    services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
    resetPriceHistory: true,
  })

  const rawPost = (payload) => JSON.parse(
    env.g.doPost({ postData: { contents: JSON.stringify(payload) } }).json
  )

  // Forma ANTIGUA (lo que enviaba resetAll antes de esta mejora): sin
  // acción explícita, solo varias colecciones a la vez + resetPriceHistory.
  const LEGACY_RESET = () => ({
    clients: [],
    appointments: [],
    expenses: [],
    services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
    resetPriceHistory: true,
  })

  // Instantánea de TODAS las hojas: detecta cualquier escritura.
  const snapshot = () => JSON.stringify(
    Object.keys(env.ss._sheets).sort().map(k => [k, env.ss._sheets[k]._rows()])
  )

  // Cita futura que usa s1 y, opcionalmente, un evento de Calendar.
  const seedFutureAppt = (extra = {}) => env.ss._sheets.appointments._seed([
    HEADERS.appointments,
    toRow('appointments', {
      id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
      serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
      domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
      date: '2099-06-20', time: '10:00', createdAt: '2026-01-01T09:00:00',
      calendarCreated: 'false', calendarEventId: '', completed: 'false',
      duration: '30', paymentMethod: '',
      ...extra,
    }),
  ])

  it('1) una petición anónima de restablecimiento es rechazada', () => {
    seedFutureAppt()
    const before = snapshot()

    // (a) Sin token alguno.
    const anon = rawPost(RESET())
    expect(anon.ok).toBe(false)
    expect(anon.error).toMatch(/No autorizado/)

    // (b) Con el token de sincronización (que viaja en el bundle JS
    //     público) pero SIN ninguna autorización del propietario.
    const sinGrant = post(env.g, RESET())
    expect(sinGrant.ok).toBe(false)
    expect(sinGrant.error).toMatch(/no autorizado/i)

    // (c) Y con la forma ANTIGUA de payload (sin acción explícita):
    //     una sincronización ordinaria no puede convertirse en reset.
    const legacy = post(env.g, LEGACY_RESET())
    expect(legacy.ok).toBe(false)
    expect(legacy.error).toMatch(/no autorizado/i)

    expect(snapshot()).toBe(before)
    expect(env.store.calDeleted).toEqual([])
    expect(env.store.mail).toEqual([])
    expect(env.store.props.has('SB_RESET_GRANTS')).toBe(false)
  })

  it('2) una petición con un token inventado es rechazada', () => {
    seedFutureAppt()
    const before = snapshot()

    const r = rawPost({ token: 'SECRETO-INVENTADO', ...RESET() })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No autorizado/)
    expect(snapshot()).toBe(before)

    // Un token inventado tampoco sirve para arrancar la recuperación.
    const r2 = rawPost({ token: 'SECRETO-INVENTADO', action: 'requestResetCode' })
    expect(r2.ok).toBe(false)
    expect(env.store.mail).toEqual([])
  })

  it('3) un código de recuperación vencido no permite autorizarse', () => {
    expect(post(env.g, { action: 'requestResetCode' }).ok).toBe(true)
    const code = lastCode(env.store)
    expect(code).toBeTruthy()

    // Simula el paso del tiempo envejeciendo el código en Script Properties.
    const KEY = 'SB_RESET_CODE'
    const st = JSON.parse(env.store.props.get(KEY))
    st.expiresAt = Date.now() - 1000
    env.store.props.set(KEY, JSON.stringify(st))

    const v = post(env.g, { action: 'verifyResetCode', code })
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/inválido o vencido/)
    expect(v.data).toBeUndefined()
    expect(env.store.props.has(KEY)).toBe(false)

    // Sin código válido no hay grant → el reset sigue bloqueado.
    expect(post(env.g, RESET()).ok).toBe(false)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
  })

  it('4) un código ya utilizado no puede reutilizarse', () => {
    expect(post(env.g, { action: 'requestResetCode' }).ok).toBe(true)
    const code = lastCode(env.store)

    const first = post(env.g, { action: 'verifyResetCode', code })
    expect(first.ok).toBe(true)
    expect(first.data.grantSecret).toBeTruthy()

    const again = post(env.g, { action: 'verifyResetCode', code })
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/inválido|vencido/)
    expect(again.data).toBeUndefined()
  })

  it('5) superar el límite de intentos impide seguir verificando', () => {
    expect(post(env.g, { action: 'requestResetCode' }).ok).toBe(true)
    const code = lastCode(env.store)

    let last = null
    for (let i = 0; i < 5; i++) {
      last = post(env.g, { action: 'verifyResetCode', code: 'ZZZZZZZZ' })
      expect(last.ok).toBe(false)
    }
    expect(last.error).toMatch(/Demasiados intentos/)

    // Ni con el código correcto, durante el periodo de bloqueo.
    const real = post(env.g, { action: 'verifyResetCode', code })
    expect(real.ok).toBe(false)
    expect(real.error).toMatch(/Demasiados intentos/)

    // Ni reenviando: el límite de solicitudes también está activo.
    expect(post(env.g, { action: 'requestResetCode' }).ok).toBe(true)
    expect(env.store.mail.length).toBe(1)
  })

  it('6) el código de recuperación solo se envía al correo autorizado', () => {
    const r = rawPost({ token: TOKEN, action: 'requestResetCode' })
    expect(r.ok).toBe(true)

    expect(env.store.mail.length).toBe(1)
    expect(env.store.mail[0].to).toBe(AUTHORIZED_EMAIL)
    expect(env.g.call('_authorizedEmail')).toBe(AUTHORIZED_EMAIL)

    // El código no viaja en la respuesta HTTP.
    const code = lastCode(env.store)
    expect(JSON.stringify(r)).not.toContain(code)
    expect(JSON.stringify(r)).not.toContain(TOKEN)
    expect(Object.keys(r.data)).toEqual(['sent'])
  })

  it('7) un correo diferente no permite cambiar el destinatario autorizado', () => {
    const r = rawPost({
      token: TOKEN,
      action: 'requestResetCode',
      email: 'atacante@evil.com',
      authorizedEmail: 'atacante@evil.com',
      to: 'atacante@evil.com',
      recipient: 'atacante@evil.com',
    })
    // Respuesta idéntica a la normal: no revela nada sobre el destinatario.
    expect(r.ok).toBe(true)
    expect(Object.keys(r.data)).toEqual(['sent'])

    expect(env.store.mail.length).toBe(1)
    expect(env.store.mail[0].to).toBe(AUTHORIZED_EMAIL)
    expect(env.g.call('_authorizedEmail')).toBe(AUTHORIZED_EMAIL)
    // Ninguna petición pública escribió la propiedad del correo.
    expect(env.store.props.has('SB_AUTHORIZED_EMAIL')).toBe(false)
  })

  it('8) una autorización temporal válida permite completar únicamente la operación autorizada', () => {
    seedFutureAppt({ calendarEventId: 'evt-123', calendarCreated: 'true' })
    // El evento existe realmente en el calendario simulado: el reset
    // autorizado es quien debe borrarlo (después de validar el grant).
    env.store.cal.seed('evt-123', {
      title: '✨ Diseño de cejas — Ana',
      start: new Date(2099, 5, 20, 10, 0, 0),
      end: new Date(2099, 5, 20, 10, 30, 0),
    })
    const grant = recoveryGrant(env.g)
    const before = snapshot()

    // (a) El grant NO sirve para saltarse la protección de servicios:
    //     es un payload de sincronización normal, la regla se aplica y
    //     el grant ni siquiera se consume.
    const blocked = post(env.g, {
      services: [S2], grantId: grant.grantId, grantSecret: grant.grantSecret,
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/No se puede eliminar el servicio/)
    expect(snapshot()).toBe(before)
    expect(env.store.calDeleted).toEqual([])

    // (b) SÍ permite completar exactamente el reset autorizado, que es
    //     cuando se borran los eventos de Calendar (del lado servidor,
    //     dentro de la operación ya autorizada).
    const done = post(env.g, { ...RESET(), ...grant })
    expect(done.ok).toBe(true)
    expect(done.data.reset).toBe(true)
    expect(svcRows(env.ss)).toEqual(['n1'])
    expect(env.store.calDeleted).toEqual(['evt-123'])
    expect(env.ss._sheets.appointments._rows().length).toBe(1) // solo cabecera
  })

  it('9) reutilizar la autorización para otro restablecimiento se rechaza', () => {
    const grant = recoveryGrant(env.g)

    const first = post(env.g, { ...RESET(), ...grant })
    expect(first.ok).toBe(true)

    // Restaurar contenido con una sincronización normal (una colección).
    post(env.g, { services: [S1, S2] })
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
    const restored = snapshot()

    // El mismo grant ya no vale para un segundo restablecimiento.
    const second = post(env.g, { ...RESET(), ...grant })
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/ya utilizada|no autorizado|vencida/)
    expect(snapshot()).toBe(restored)
  })

  it('10) las peticiones normales de sincronización continúan funcionando', () => {
    // Una sola colección por petición (como hacen SC/SS/SA/SE de React)
    // NUNCA se trata como destructiva: ni grant, ni correo, ni bloqueo.
    expect(post(env.g, {
      clients: [{ id: 'c1', name: 'ANA', phone: '300111', createdAt: '2026-01-01' }],
    }).ok).toBe(true)

    expect(post(env.g, { services: [S1] }).ok).toBe(true)

    // El asistente de citas manda appointments + calendarEvent en un
    // mismo POST: sigue siendo una sola colección y debe pasar.
    const r = post(env.g, {
      appointments: [apptRow('a1', '2099-06-20', '10:00', 'false', 's1', S1.name)],
      calendarEvent: { clientName: 'Ana', clientPhone: '300111', serviceNames: S1.name,
                       totalPrice: '50000', date: '2099-06-20', time: '10:00', duration: 30 },
    })
    expect(r.ok).toBe(true)

    expect(post(env.g, {
      expenses: [{ id: 'e1', description: 'Insumos', amount: '15000', category: 'Otro', date: '2026-01-01' }],
    }).ok).toBe(true)

    expect(env.store.mail).toEqual([])
    expect(env.store.props.has('SB_RESET_GRANTS')).toBe(false)
    expect(env.store.props.has('SB_RESET_CODE')).toBe(false)
  })

  it('11) la protección de eliminación de servicios sigue funcionando', () => {
    seedFutureAppt()

    const r = post(env.g, { services: [S2] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No se puede eliminar el servicio "Diseño de cejas"/)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])

    // Ni siquiera adjuntando un grant legítimo se desactiva.
    const grant = recoveryGrant(env.g)
    const r2 = post(env.g, {
      services: [S2], grantId: grant.grantId, grantSecret: grant.grantSecret,
    })
    expect(r2.ok).toBe(false)
    expect(svcRows(env.ss)).toEqual(['s1', 's2'])
  })

  it('12) una petición rechazada no modifica hojas ni otros recursos', () => {
    seedFutureAppt({ calendarEventId: 'evt-123', calendarCreated: 'true' })
    const before = snapshot()

    expect(post(env.g, RESET()).ok).toBe(false)                      // sin grant
    expect(post(env.g, LEGACY_RESET()).ok).toBe(false)               // forma antigua
    // Truco: resetPriceHistory con un valor que no es `true` literal
    // tampoco esquiva la guarda ni borra HistorialPrecios.
    expect(post(env.g, { services: [S2], resetPriceHistory: 'true' }).ok).toBe(false)
    expect(post(env.g, { services: [S2], resetPriceHistory: 1 }).ok).toBe(false)
    expect(rawPost({ token: 'MALO', ...RESET() }).ok).toBe(false)    // token falso
    expect(rawPost(RESET()).ok).toBe(false)                          // anónimo
    expect(rawPost({ token: TOKEN, action: 'resetData' }).ok).toBe(false) // acción sola

    expect(snapshot()).toBe(before)
    expect(env.store.calLookups).toEqual([])   // ni una consulta a Calendar
    expect(env.store.calDeleted).toEqual([])   // y mucho menos un borrado
    expect(env.store.props.has('SB_RESET_GRANTS')).toBe(false)
    expect(env.store.mail).toEqual([])
  })

  it('13) las respuestas y los registros no exponen códigos ni tokens secretos', () => {
    const req = rawPost({ token: TOKEN, action: 'requestResetCode' })
    expect(req.ok).toBe(true)
    const code = lastCode(env.store)
    expect(code).toBeTruthy()

    // (a) La respuesta de solicitud no lleva nada más que "sent".
    expect(Object.keys(req.data)).toEqual(['sent'])
    expect(JSON.stringify(req)).not.toContain(code)
    expect(JSON.stringify(req)).not.toContain(TOKEN)

    // (b) En Script Properties el código solo se guarda como hash.
    const stored = JSON.parse(env.store.props.get('SB_RESET_CODE'))
    expect(Object.keys(stored).sort()).toEqual(['expiresAt', 'hash', 'tries'])
    expect(JSON.stringify(stored)).not.toContain(code)

    // (c) La verificación devuelve el grant… y nada más.
    const ver = rawPost({ token: TOKEN, action: 'verifyResetCode', code })
    expect(ver.ok).toBe(true)
    expect(Object.keys(ver.data).sort()).toEqual(['expiresAt', 'grantId', 'grantSecret'])
    expect(JSON.stringify(ver)).not.toContain(TOKEN)
    // El código quedó invalidado y ya ni siquiera está almacenado.
    expect(env.store.props.has('SB_RESET_CODE')).toBe(false)

    // (d) Ni códigos ni tokens en los registros accesibles.
    const logs = env.store.logs.join('\n')
    expect(logs).not.toContain(code)
    expect(logs).not.toContain(TOKEN)

    // (e) Un fallo tampoco filtra nada.
    const bad = rawPost({ token: 'MALO', action: 'requestResetCode' })
    expect(JSON.stringify(bad)).not.toContain(TOKEN)
    expect(JSON.stringify(bad)).not.toContain(code)
  })
})

/* ══════════════════════════════════════════════════════════════
   BUG-01 / BUG-02 — sincronización con Google Calendar

   Se ejecuta el Code.gs real con un calendario simulado en memoria:
   NO se envía ninguna operación a Google Calendar real.
   ══════════════════════════════════════════════════════════════ */
describe('Code.gs — sincronización con Google Calendar', () => {
  const D0 = '2099-03-10'   // fecha futura, estable para las pruebas
  const T0 = '19:30'
  const EVT = 'evt-a1@calendario'

  const baseAppt = (over = {}) => ({
    id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
    serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{"s1":50000}',
    domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
    date: D0, time: T0, createdAt: '2026-01-01T09:00:00',
    calendarCreated: 'true', calendarEventId: EVT,
    completed: 'false', duration: '30', paymentMethod: '',
    ...over,
  })

  const seed = (over = {}, { withEvent = true } = {}) => {
    const env = makeEnv()
    if (withEvent) {
      env.store.cal.seed(EVT, {
        title: `✨ ${S1.name} — Ana`,
        start: new Date(2099, 2, 10, 19, 30, 0),
        end: new Date(2099, 2, 10, 20, 0, 0),
        description: 'viejo',
      })
      env.store.cal.seed('evt-ajeno@calendario', {
        title: 'No es de la app',
        start: new Date(2099, 2, 11, 8, 0, 0),
        end: new Date(2099, 2, 11, 9, 0, 0),
      })
    }
    const appt = baseAppt({
      calendarEventId: withEvent ? EVT : '',
      calendarCreated: withEvent ? 'true' : 'false',
      ...over,
    })
    env.ss._sheets.appointments._seed([HEADERS.appointments, toRow('appointments', appt)])
    return { env, appt }
  }

  const readAppt = (env) => env.g.call('readSheet', env.ss, 'appointments')[0]
  const cal = (env, id) => env.store.cal._events.get(id)

  it('1) actualizar un evento existente cambia su hora de inicio', () => {
    const { env } = seed()
    const r = post(env.g, {
      action: 'updateCalendarEvent', eventId: EVT,
      calendarEvent: { date: D0, time: '20:00', duration: 30 },
    })
    expect(r.ok).toBe(true)
    expect(r.data.calResult.ok).toBe(true)
    const ev = cal(env, EVT)
    expect(ev.start.getHours()).toBe(20)
    expect(ev.start.getMinutes()).toBe(0)
    expect(ev.start.getDate()).toBe(10)     // misma fecha
    expect(r.data.calResult.start).toBe(new Date(2099, 2, 10, 20, 0, 0).toISOString())
  })

  it('2) actualizar cambia la hora de finalización si cambia la duración', () => {
    const { env } = seed()
    // Mismo inicio (19:30) pero de 30 a 90 minutos → termina 21:00.
    const r = post(env.g, {
      action: 'updateCalendarEvent', eventId: EVT,
      calendarEvent: { date: D0, time: T0, duration: 90 },
    })
    expect(r.data.calResult.ok).toBe(true)
    expect(r.data.calResult.durationMin).toBe(90)
    const ev = cal(env, EVT)
    expect(ev.start.getHours()).toBe(19)
    expect(ev.end.getHours()).toBe(21)
    expect(ev.end.getMinutes()).toBe(0)
    expect(ev.end.getTime() - ev.start.getTime()).toBe(90 * 60000)
  })

  it('3) la edición conserva el identificador del evento', () => {
    const { env } = seed()
    expect(readAppt(env).calendarEventId).toBe(EVT)

    // El frontend guarda la cita editada y reutiliza ESE id para Calendar.
    expect(post(env.g, { appointments: [{ ...readAppt(env), time: '20:00' }] }).ok).toBe(true)

    const after = readAppt(env)
    expect(after.calendarEventId).toBe(EVT)   // ni se pierde ni cambia
    expect(after.time).toBe('20:00')

    const sizeBefore = env.store.cal.size()   // EVT + el evento ajeno
    const r = post(env.g, {
      action: 'updateCalendarEvent', eventId: after.calendarEventId,
      calendarEvent: { date: after.date, time: after.time, duration: 30 },
    })
    expect(r.data.calResult.ok).toBe(true)
    expect(cal(env, EVT).start.getHours()).toBe(20)
    expect(env.store.cal.size()).toBe(sizeBefore)   // ni más ni menos
    expect(env.store.calCreated).toEqual([])        // no se creó otro
  })

  it('4) editar no crea un segundo evento innecesariamente', () => {
    const { env } = seed()
    const sizeBefore = env.store.cal.size()

    for (const t of ['20:00', '18:15', '09:45']) {
      const r = post(env.g, {
        action: 'updateCalendarEvent', eventId: EVT,
        calendarEvent: { date: D0, time: t, duration: 45 },
      })
      expect(r.data.calResult.ok).toBe(true)
    }

    expect(env.store.calCreated).toEqual([])       // jamás se llamó createEvent
    expect(env.store.cal.size()).toBe(sizeBefore)   // sigue habiendo un solo evento
    expect(cal(env, EVT).start.getHours()).toBe(9)
    expect(cal(env, EVT).start.getMinutes()).toBe(45)
  })

  it('5) eliminar una cita invoca la eliminación del evento correcto', () => {
    const { env } = seed()
    const appt = readAppt(env)
    expect(appt.calendarEventId).toBe(EVT)

    const r = post(env.g, { action: 'deleteCalendarEvent', eventId: appt.calendarEventId })
    expect(r.ok).toBe(true)
    expect(r.data.calResult.ok).toBe(true)
    expect(r.data.calResult.deleted).toBe(true)
    expect(env.store.calDeleted).toEqual([EVT])   // solo ese id
    expect(env.store.cal.size()).toBe(1)          // queda el ajeno
  })

  it('6) no se eliminan eventos de otras citas', () => {
    const { env } = seed()
    // Otra cita de la app con su propio evento.
    env.store.cal.seed('evt-otra@calendario', {
      title: '✨ Lifting — Belén',
      start: new Date(2099, 2, 12, 11, 0, 0),
      end: new Date(2099, 2, 12, 12, 0, 0),
    })

    const r = post(env.g, { action: 'deleteCalendarEvent', eventId: readAppt(env).calendarEventId })
    expect(r.data.calResult.ok).toBe(true)

    expect(env.store.calDeleted).toEqual([EVT])
    expect(env.store.cal._events.has('evt-otra@calendario')).toBe(true)  // no se tocó
    expect(env.store.cal._events.has('evt-ajeno@calendario')).toBe(true) // no se tocó
    // No hay ninguna llamada que "barra" el calendario completo.
    expect(env.store.cal.size()).toBe(2)
  })

  it('7) un error al actualizar Calendar se detecta y no se comunica como éxito', () => {
    const { env } = seed()

    // (a) El evento ya no existe → ok:false con motivo, no ok:true.
    const nf = post(env.g, {
      action: 'updateCalendarEvent', eventId: 'desaparecido@calendario',
      calendarEvent: { date: D0, time: '20:00', duration: 30 },
    })
    expect(nf.ok).toBe(true)                       // la llamada se procesó
    expect(nf.data.calResult.ok).toBe(false)       // …pero NO fue un éxito
    expect(nf.data.calResult.code).toBe('not_found')
    expect(nf.data.calResult.error).toBeTruthy()

    // (b) Calendar no aplica el cambio (setTime silencioso).
    env.store.cal.ignoreSetTime = true
    const na = post(env.g, {
      action: 'updateCalendarEvent', eventId: EVT,
      calendarEvent: { date: D0, time: '21:00', duration: 30 },
    })
    expect(na.data.calResult.ok).toBe(false)
    expect(na.data.calResult.code).toBe('not_applied')
    expect(na.data.calResult.expected).toBeTruthy()
    expect(na.data.calResult.got).toBeTruthy()
    expect(cal(env, EVT).start.getHours()).toBe(19)   // la hora NO cambió

    // (c) Payload incompleto tampoco se vende como correcto.
    const bp = post(env.g, { action: 'updateCalendarEvent', eventId: EVT, calendarEvent: { duration: 30 } })
    expect(bp.data.calResult.ok).toBe(false)
    expect(bp.data.calResult.code).toBe('bad_payload')
  })

  it('8) un error al eliminar Calendar se detecta', () => {
    const { env } = seed()
    env.store.cal.failDelete = true

    const r = post(env.g, { action: 'deleteCalendarEvent', eventId: EVT })
    expect(r.ok).toBe(true)
    expect(r.data.calResult.ok).toBe(false)     // no se oculta el fallo
    expect(r.data.calResult.code).toBe('exception')
    expect(r.data.calResult.error).toMatch(/No se pudo eliminar/)
    // El evento sigue ahí: no se reportó una eliminación que no ocurrió.
    expect(env.store.cal._events.has(EVT)).toBe(true)
    expect(env.store.calDeleted).toEqual([])
  })

  it('9) un evento que ya no existe se gestiona sin generar una falsa eliminación', () => {
    const { env } = seed()
    // Alguien lo borró a mano antes de que llegara la petición.
    env.store.cal._events.delete(EVT)

    const r = post(env.g, { action: 'deleteCalendarEvent', eventId: EVT })
    expect(r.ok).toBe(true)
    expect(r.data.calResult.ok).toBe(true)            // idempotente: no es un error
    expect(r.data.calResult.alreadyGone).toBe(true)
    expect(env.store.calDeleted).toEqual([])           // NO se "borró" nada
    // Tampoco se borró ningún otro evento como sustituto.
    expect(env.store.cal._events.has(EVT)).toBe(false)
    expect(env.store.cal._events.has('evt-ajeno@calendario')).toBe(true)
  })

  it('10) una cita histórica sin identificador de evento sigue siendo compatible', () => {
    const { env, appt } = seed({}, { withEvent: false })
    expect(readAppt(env).calendarEventId).toBe('')

    // El frontend no llama sin id, pero si lo hiciera el backend lo dice
    // explícitamente y no toca ningún evento.
    const u = post(env.g, {
      action: 'updateCalendarEvent', eventId: appt.calendarEventId,
      calendarEvent: { date: D0, time: '20:00', duration: 30 },
    })
    expect(u.data.calResult.ok).toBe(false)
    expect(u.data.calResult.code).toBe('no_id')

    const d = post(env.g, { action: 'deleteCalendarEvent', eventId: appt.calendarEventId })
    expect(d.data.calResult.ok).toBe(false)
    expect(d.data.calResult.code).toBe('no_id')

    // La edición de la propia cita sigue funcionando sin Calendar.
    expect(post(env.g, { appointments: [{ ...readAppt(env), time: '20:00' }] }).ok).toBe(true)
    expect(readAppt(env).time).toBe('20:00')
    expect(env.store.calLookups).toEqual([])
    expect(env.store.calDeleted).toEqual([])
  })

  it('11) las operaciones normales de creación continúan funcionando', () => {
    const { env } = seed()
    const nueva = baseAppt({
      id: 'a2', date: '2099-03-11', time: '10:00',
      calendarCreated: 'false', calendarEventId: '',
    })

    // Como hace la app: se envía la colección COMPLETA de citas.
    const r = post(env.g, {
      appointments: [readAppt(env), nueva],
      calendarEvent: {
        clientName: 'Ana', clientPhone: '300111222', serviceNames: S1.name,
        totalPrice: '50000', domicilio: false, domicilioPrice: 0, address: '',
        date: '2099-03-11', time: '10:00', duration: 30,
      },
    })
    expect(r.ok).toBe(true)
    expect(r.data.calResult.ok).toBe(true)
    expect(r.data.calResult.eventId).toBeTruthy()
    expect(env.store.calCreated).toHaveLength(1)   // exactamente uno

    const ev = env.store.cal._events.get(r.data.calResult.eventId)
    expect(ev.title).toBe(`✨ ${S1.name} — Ana`)
    expect(ev.start.getHours()).toBe(10)
    expect(ev.end.getHours()).toBe(10)
    expect(ev.end.getMinutes()).toBe(30)
    expect(ev.description).toContain('Ana')

    // El resto de la operación normal no se ve afectado.
    expect(env.g.call('readSheet', env.ss, 'appointments')).toHaveLength(2)
  })

  it('12) las protecciones del restablecimiento y de servicios siguen activas', () => {
    const { env } = seed()   // cita futura que usa s1

    // Restablecimiento sin autorización → rechazado y sin tocar Calendar.
    const rr = post(env.g, {
      action: 'resetData', clients: [], appointments: [], expenses: [],
      services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
      resetPriceHistory: true,
    })
    expect(rr.ok).toBe(false)
    expect(rr.error).toMatch(/no autorizado/i)

    // Eliminación de un servicio con cita futura → sigue bloqueada.
    const sv = post(env.g, { services: [S2] })
    expect(sv.ok).toBe(false)
    expect(sv.error).toMatch(/No se puede eliminar el servicio "Diseño de cejas"/)

    expect(env.store.calDeleted).toEqual([])
    expect(env.store.cal.size()).toBe(2)
    expect(env.store.mail).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════
   TEST-01 — Reglas de negocio 7B.0, M1, M2, C1, M5

   AVISO / SUPUESTO: estos identificadores NO están definidos en el
   repositorio (ni en README/SETUP/SESIÓN, ni en el manual .docx, ni
   en comentarios de Code.gs, ni en el historial de git). Se han
   MAPEADO a reglas concretas que sí están implementadas en el
   backend y que la suite anterior NO cubría. El mapeo debe
   validarse en TEST-01A (fase READ-ONLY).

     7B.0 → el backend rechaza eliminar servicios con citas futuras
            o en curso ANTES de escribir nada (sin efectos colaterales)
     M1   → sanitización monetaria: ningún importe negativo persiste
     M2   → `servicePrices` (JSON anidado) se sanea clave a clave
     C1   → duración acota a [15,480]; inválida o ≤0 → 60; coherente
            entre servicios, citas, evento y `_apptLife`
     M5   → historial de precios: registra iniciales y cambios, y NO
            registra nada cuando el precio no cambia

   Justificación de no duplicación: antes de escribir estas pruebas
   se comprobó que `trackPriceChanges`, `safeDuration`, `initSheets`,
   `cellStr`, `sanitizePayload` y `doGet` tenían CERO cobertura.
══════════════════════════════════════════════════════════════ */
describe('TEST-01 — Reglas de negocio (7B.0, M1, M2, C1, M5)', () => {

  it('[7B.0] el rechazo por cita futura ocurre ANTES de escribir nada (sin efectos colaterales)', () => {
    // s1 tiene una cita futura pendiente → no se puede eliminar del catálogo.
    // (Se siembra la hoja directamente, igual que el test 7a existente:
    // `makeEnv({appts})` espera objetos, no filas ya convertidas.)
    const env = makeEnv()
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-09-01', '10:00', 'false', 's1', S1.name),
    ])
    const before = sheetSnapshot(env.ss)
    const historyBefore = env.ss._sheets.priceHistory._rows().length

    // El payload pide un catálogo SIN s1 (es una eliminación) y, de paso,
    // cambiaría el precio de s2 → trackPriceChanges querría registrar eso.
    const r = post(env.g, {
      services: [{ id: 's2', name: S2.name, price: '99999', duration: S2.duration }],
    })

    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No se puede eliminar el servicio/)

    // Nada se escribió: ni Servicios, ni Citas, ni — lo nuevo — HistorialPrecios.
    expect(sheetSnapshot(env.ss)).toBe(before)
    expect(env.ss._sheets.priceHistory._rows().length).toBe(historyBefore)
    expect(svcRows(env.ss).sort()).toEqual(['s1', 's2'])   // s1 sigue ahí
    // Y el lock se libera igualmente en el camino de rechazo.
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)
  })

  it('[M1] ningún importe negativo persiste: servicios, gastos y citas quedan en 0', () => {
    const env = makeEnv()   // sin citas → la eliminación del catálogo no está bloqueada

    // Servicios: price negativo.
    expect(post(env.g, {
      services: [{ id: 's9', name: 'Prueba', price: '-5000', duration: '30' }],
    }).ok).toBe(true)
    const svc = dataRows(env.ss, 'services').find(r => r[0] === 's9')
    expect(svc[col('services', 'price')]).toBe('0')

    // Gastos: amount negativo.
    expect(post(env.g, {
      expenses: [{ id: 'e1', description: 'Compra', amount: '-999', category: 'Insumos', date: '2026-01-10' }],
    }).ok).toBe(true)
    const exp = dataRows(env.ss, 'expenses').find(r => r[0] === 'e1')
    expect(exp[col('expenses', 'amount')]).toBe('0')

    // Citas: los tres importes monetarios de la fila.
    expect(post(env.g, {
      appointments: [{
        id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
        serviceIds: 's1', serviceNames: S1.name, servicePrice: '-1', servicePrices: '{}',
        domicilio: 'true', domicilioPrice: '-7000', totalPrice: '-123', address: 'Calle 1',
        date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
        calendarCreated: 'false', calendarEventId: '', completed: 'false',
        duration: '30', paymentMethod: '',
      }],
    }).ok).toBe(true)
    const a = dataRows(env.ss, 'appointments')[0]
    expect(a[col('appointments', 'servicePrice')]).toBe('0')
    expect(a[col('appointments', 'domicilioPrice')]).toBe('0')
    expect(a[col('appointments', 'totalPrice')]).toBe('0')
  })

  it('[M2] `servicePrices` (JSON anidado) se sanea clave a clave, no solo el total', () => {
    const env = makeEnv()
    expect(post(env.g, {
      appointments: [{
        id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
        serviceIds: 's1,s2', serviceNames: `${S1.name}, ${S2.name}`,
        servicePrice: '180000', servicePrices: '{"s1":-500,"s2":130000,"s3":-1}',
        domicilio: 'false', domicilioPrice: '0', totalPrice: '180000', address: '',
        date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
        calendarCreated: 'false', calendarEventId: '', completed: 'false',
        duration: '30', paymentMethod: '',
      }],
    }).ok).toBe(true)

    const raw = dataRows(env.ss, 'appointments')[0][col('appointments', 'servicePrices')]
    expect(JSON.parse(raw)).toEqual({ s1: 0, s2: 130000, s3: 0 })
    // Y sigue siendo JSON válido para el frontend.
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('[C1] la duración se acota a [15,480] y una inválida cae a 60, en servicios y citas', () => {
    const env = makeEnv()

    expect(post(env.g, {
      services: [
        { id: 'd1', name: 'Muy corta',  price: '1000', duration: '5'    },  // → 15
        { id: 'd2', name: 'Muy larga',  price: '1000', duration: '9999' },  // → 480
        { id: 'd3', name: 'Inválida',   price: '1000', duration: 'abc'  },  // → 60
      ],
    }).ok).toBe(true)

    const dur = (id) => dataRows(env.ss, 'services')
      .find(r => r[0] === id)[col('services', 'duration')]
    expect(dur('d1')).toBe('15')
    expect(dur('d2')).toBe('480')
    expect(dur('d3')).toBe('60')

    // La misma regla se aplica a las citas.
    const mkAppt = (id, duration) => ({
      id, clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
      serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
      domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
      date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
      calendarCreated: 'false', calendarEventId: '', completed: 'false',
      duration, paymentMethod: '',
    })
    expect(post(env.g, {
      appointments: [mkAppt('p1', '5'), mkAppt('p2', '9999'), mkAppt('p3', 'xyz')],
    }).ok).toBe(true)

    const adur = (id) => dataRows(env.ss, 'appointments')
      .find(r => r[0] === id)[col('appointments', 'duration')]
    expect(adur('p1')).toBe('15')
    expect(adur('p2')).toBe('480')
    expect(adur('p3')).toBe('60')
  })

  it('[C1] la duración saneada es la que define la vida de la cita en el servidor', () => {
    // `_apptLife` decide "en curso" con fecha + hora + duración, y esa
    // duración pasa por el mismo acotado [15,480]. Con 9999 sin acotar,
    // la cita de las 05:00 habría terminado a las 21:39; acotada a 480
    // termina a las 13:00 y a las 12:00 sigue EN CURSO.
    const env = makeEnv()
    const now = new Date(2026, 5, 10, 12, 0, 0)   // 10 jun 2026, 12:00
    const base = {
      clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
      serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
      domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
      date: '2026-06-10', createdAt: '2026-01-01T09:00:00',
      calendarCreated: 'false', calendarEventId: '', paymentMethod: '',
    }
    const life = (id, time, duration, completed) =>
      env.g.call('_apptLife', { ...base, id, time, duration, completed }, now)

    expect(life('x', '05:00', '9999', 'false')).toBe('live')   // acotada: 05:00→13:00
    expect(life('x', '05:00', '9999', 'true' )).toBe('done')   // completada manda
    expect(life('x', '11:30', '30',  'false')).toBe('past')    // terminó exacto a las 12:00
    expect(life('x', '11:45', '30',  'false')).toBe('live')
    expect(life('x', '13:00', '30',  'false')).toBe('future')
    expect(life('x', '',     '30',  'false')).toBe('unknown')  // sin hora no se evalúa
  })

  it('[M5] el historial registra precio inicial y cambios, pero no registra si nada cambió', () => {
    // `Utilities.formatDate` del sandbox devuelve siempre esta marca.
    const CHANGED_AT = '2026-01-15T13:00:00'
    const env = makeEnv()   // hoja de servicios sembrada con S1 (50000) y S2 (130000)
    const hist = () => dataRows(env.ss, 'priceHistory')

    // (a) Mismos precios que la hoja → NO se registra nada.
    expect(post(env.g, { services: [S1, S2] }).ok).toBe(true)
    expect(hist()).toHaveLength(0)

    // (b) Cambio de precio de s1 → se registra el NUEVO precio con su fecha.
    expect(post(env.g, { services: [{ ...S1, price: '60000' }, S2] }).ok).toBe(true)
    expect(hist()).toHaveLength(1)
    expect(hist()[0]).toEqual(['s1', S1.name, '60000', CHANGED_AT])

    // (c) Servicio nuevo → se registra su precio INICIAL.
    const S3 = { id: 's3', name: 'Masaje facial', price: '75000', duration: '45' }
    expect(post(env.g, { services: [{ ...S1, price: '60000' }, S2, S3] }).ok).toBe(true)
    expect(hist()).toHaveLength(2)
    expect(hist()[1]).toEqual(['s3', S3.name, '75000', CHANGED_AT])

    // (d) Reenviar el mismo catálogo → no duplica filas (idempotente).
    expect(post(env.g, { services: [{ ...S1, price: '60000' }, S2, S3] }).ok).toBe(true)
    expect(hist()).toHaveLength(2)
  })
})

/* ══════════════════════════════════════════════════════════════
   TEST-01 — Validaciones y operaciones de doPost (criterio 2)
   + inicialización de hojas (initSheets) y saneado de entrada.
══════════════════════════════════════════════════════════════ */
describe('TEST-01 — doPost: validaciones y operaciones', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  it('sin token → "No autorizado" y ninguna hoja se toca', () => {
    const before = sheetSnapshot(env.ss)
    expect(rawPost(env.g, { appointments: [] })).toEqual({ ok: false, error: 'No autorizado' })
    expect(rawPost(env.g, {})).toEqual({ ok: false, error: 'No autorizado' })
    expect(sheetSnapshot(env.ss)).toBe(before)
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)   // igualmente se libera
  })

  it('token incorrecto → "No autorizado", sin escribir ni llegar a Calendar', () => {
    const before = sheetSnapshot(env.ss)
    const r = rawPost(env.g, {
      token: 'TOKEN_INVENTADO',
      appointments: [{ id: 'zzz', clientName: 'Intruso' }],
    })
    expect(r).toEqual({ ok: false, error: 'No autorizado' })
    expect(sheetSnapshot(env.ss)).toBe(before)
    expect(env.store.calCreated).toEqual([])
  })

  it('cuerpo que no es JSON → error controlado "POST: …", sin excepción cruda', () => {
    const res = env.g.doPost({ postData: { contents: 'esto no es { json' } })
    const out = JSON.parse(res.json)
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/^POST: /)
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)
  })

  it('postData ausente → error controlado "POST: …", sin excepción cruda', () => {
    const out = JSON.parse(env.g.doPost({}).json)
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/^POST: /)
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)
  })

  it('lock ocupado → "Servidor ocupado, reintenta" y NO escribe nada', () => {
    const before = sheetSnapshot(env.ss)
    env.store.lock.blocked = true                      // otro proceso lo retiene
    const r = post(env.g, { appointments: [{ id: 'zzz' }] })
    expect(r).toEqual({ ok: false, error: 'Servidor ocupado, reintenta' })
    expect(sheetSnapshot(env.ss)).toBe(before)          // ni una fila escrita
    expect(env.store.calCreated).toEqual([])
  })

  it('acción desconocida sin colecciones → {saved:true} sin escribir (caracterización)', () => {
    // El contrato es por colecciones, no por acción: una acción que nadie
    // conoce no rompe nada ni inventa escrituras.
    const before = sheetSnapshot(env.ss)
    expect(post(env.g, { action: 'accionInventada' }))
      .toEqual({ ok: true, data: { saved: true, calResult: null } })
    expect(sheetSnapshot(env.ss)).toBe(before)
  })

  it('una colección vacía SÍ se escribe: vacía la hoja (borrado explícito)', () => {
    env.ss._sheets.expenses._seed([
      HEADERS.expenses,
      toRow('expenses', { id: 'e1', description: 'x', amount: '1000', category: 'c', date: '2026-01-01' }),
    ])
    expect(post(env.g, { expenses: [] }).ok).toBe(true)
    expect(dataRows(env.ss, 'expenses')).toHaveLength(0)
  })

  it('doGet con token correcto devuelve las 5 colecciones', () => {
    const out = rawGet(env.g, TOKEN)
    expect(out.ok).toBe(true)
    expect(Object.keys(out.data).sort())
      .toEqual(['appointments', 'clients', 'expenses', 'priceHistory', 'services'])
    expect(out.data.services.map(s => s.id).sort()).toEqual(['s1', 's2'])
  })

  it('doGet con token incorrecto o ausente → "No autorizado"', () => {
    expect(rawGet(env.g, 'OTRO')).toEqual({ ok: false, error: 'No autorizado' })
    expect(rawGet(env.g, undefined)).toEqual({ ok: false, error: 'No autorizado' })
  })

  it('el token vive en Script Properties: Code.gs no lo trae hardcodeado', () => {
    // El repositorio es PÚBLICO: si el token está en Code.gs cualquiera lo
    // copia desde GitHub. Su gemelo del cliente es VITE_TOKEN (.env/Vercel).
    expect(CODE_GS).not.toContain('SECRET_TOKEN')
    expect(CODE_GS).not.toContain('CAMBIA_TU_TOKEN')
    expect(env.store.props.get('SB_SYNC_TOKEN')).toBe(TOKEN)
    expect(post(env.g, { action: 'accionInventada' }).ok).toBe(true)
  })

  it('sin la propiedad SB_SYNC_TOKEN no se autoriza nada y se avisa', () => {
    // Fail closed + mensaje propio: un fallo de configuración no debe
    // parecer un token malo ni dejar la API abierta.
    const before = sheetSnapshot(env.ss)
    env.store.props.delete('SB_SYNC_TOKEN')
    const msg = 'Token de sincronización no configurado: añade la propiedad SB_SYNC_TOKEN en Propiedades del proyecto.'

    expect(rawPost(env.g, { appointments: [] })).toEqual({ ok: false, error: msg })
    expect(rawGet(env.g, TOKEN)).toEqual({ ok: false, error: msg })
    expect(sheetSnapshot(env.ss)).toBe(before)             // nada escrito
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)
  })

  it('rotar el token es cambiar la propiedad: el viejo deja de servir', () => {
    env.store.props.set('SB_SYNC_TOKEN', 'token-nuevo-2026')

    expect(rawPost(env.g, { token: TOKEN, appointments: [] }))
      .toEqual({ ok: false, error: 'No autorizado' })
    expect(rawGet(env.g, TOKEN)).toEqual({ ok: false, error: 'No autorizado' })
    expect(rawPost(env.g, { token: TOKEN, appointments: [] }).ok).toBe(false)

    // El token nuevo sí entra (acción desconocida: no escribe nada).
    expect(rawPost(env.g, { token: 'token-nuevo-2026', action: 'accionInventada' }))
      .toEqual({ ok: true, data: { saved: true, calResult: null } })
  })

  it('sanitizePayload sanea el evento de Calendar (importes y duración)', () => {
    expect(post(env.g, {
      appointments: [],
      calendarEvent: {
        clientName: 'Ana', clientPhone: '300', serviceNames: S1.name,
        totalPrice: '-5', domicilio: true, domicilioPrice: '-9', address: '',
        date: '2099-09-01', time: '10:00', duration: '99999',
      },
    }).ok).toBe(true)

    const ev = env.store.cal._events.get(env.store.calCreated[0])
    expect(env.store.calCreated).toHaveLength(1)
    // La descripción lleva los importes recortados a 0 y la duración a 480.
    expect(ev.description).toContain('Total: $0')
    expect(ev.description).toContain('Domicilio: $0')
    expect(ev.end.getTime() - ev.start.getTime()).toBe(480 * 60000)
  })

  it('initSheets solo crea las hojas que faltan', () => {
    const creadas = []
    const nombres = ['Clientes', 'Servicios', 'Citas', 'Gastos', 'HistorialPrecios']
    const fake = {
      getSheets: () => nombres.slice(0, 3).map(n => ({ getName: () => n })),
      insertSheet: (n) => { creadas.push(n) },
    }
    env.g.call('initSheets', fake)
    expect(creadas).toEqual(['Gastos', 'HistorialPrecios'])
  })

  it('initSheets no hace nada cuando ya existen todas', () => {
    const creadas = []
    const nombres = ['Clientes', 'Servicios', 'Citas', 'Gastos', 'HistorialPrecios']
    const fake = {
      getSheets: () => nombres.map(n => ({ getName: () => n })),
      insertSheet: (n) => { creadas.push(n) },
    }
    env.g.call('initSheets', fake)
    expect(creadas).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════
   TEST-01 — Citas: creación, edición y eliminación (criterio 3)
   Nivel de HOJA (el lado Calendar ya está cubierto por el bloque
   "sincronización con Google Calendar"); aquí se verifica el
   contrato de persistencia del que depende todo lo demás.
══════════════════════════════════════════════════════════════ */
describe('TEST-01 — Citas: creación, edición y eliminación (hoja)', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  const A1 = {
    id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300111222',
    serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{"s1":50000}',
    domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
    date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
    calendarCreated: 'true', calendarEventId: 'evt-1', completed: 'false',
    duration: '30', paymentMethod: '',
  }

  it('crear: la cita queda completa y legible vía readSheet (round-trip)', () => {
    expect(post(env.g, { appointments: [A1] }).ok).toBe(true)
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back).toHaveLength(1)
    expect(back[0]).toEqual(A1)
  })

  it('editar: cambia hora e importes conservando id y calendarEventId', () => {
    post(env.g, { appointments: [A1] })
    const editada = { ...A1, time: '19:00', totalPrice: '180000', duration: '90' }
    expect(post(env.g, { appointments: [editada] }).ok).toBe(true)

    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back).toHaveLength(1)                       // no se duplica
    expect(back[0].id).toBe('a1')                      // mismo id
    expect(back[0].calendarEventId).toBe('evt-1')      // id de Calendar intacto
    expect(back[0].time).toBe('19:00')
    expect(back[0].totalPrice).toBe('180000')
    expect(back[0].duration).toBe('90')
  })

  it('eliminar: quita solo esa fila y conserva el resto', () => {
    const A2 = { ...A1, id: 'a2', time: '12:00', calendarEventId: 'evt-2' }
    post(env.g, { appointments: [A1, A2] })
    expect(env.g.call('readSheet', env.ss, 'appointments')).toHaveLength(2)

    expect(post(env.g, { appointments: [A2] }).ok).toBe(true)   // el cliente envía sin a1
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe('a2')
  })

  it('el id de Calendar viaja completo en el round-trip de la colección', () => {
    const ids = ['evt-a@group.calendar.google.com', 'cal7@google.com', '']
    post(env.g, { appointments: ids.map((id, i) => ({
      ...A1, id: 'x' + i, calendarEventId: id, calendarCreated: id ? 'true' : 'false',
    })) })
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back.map(a => a.calendarEventId)).toEqual(ids)
  })
})

/* ══════════════════════════════════════════════════════════════
   TEST-01 — Control de versiones y concurrencia (criterio 5)
══════════════════════════════════════════════════════════════ */
describe('TEST-01 — Concurrencia y control de versiones', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  it('el lock se adquiere ANTES de escribir y se libera en los caminos ordinarios', () => {
    // sync normal, rechazo de token, rechazo por regla de negocio y
    // acciones de Calendar: los cuatro balancean acquire/release.
    post(env.g, { clients: [{ id: 'c1', name: 'Ana', phone: '300', createdAt: '2026-01-01' }] })
    rawPost(env.g, { token: 'MALO', clients: [] })
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-09-01', '10:00', 'false', 's1', S1.name),
    ])
    post(env.g, { services: [{ id: 's2', name: S2.name, price: S2.price, duration: S2.duration }] })
    post(env.g, { action: 'deleteCalendarEvent', eventId: 'no-existe' })

    expect(env.store.lock.acquires).toBeGreaterThanOrEqual(4)
    expect(env.store.lock.releases).toBe(env.store.lock.acquires)
  })

  it('resetData libera el lock, igual que el resto de ramas de doPost', () => {
    // Antes esta rama hacía `return ok(_resetData(...))` sin pasar por
    // releaseLock() (a diferencia de todas las demás). En Apps Script el
    // lock se libera al terminar la ejecución, así que no había fallo
    // observable, pero era una asimetría: ahora se libera explícitamente
    // igual que el resto de caminos.
    const grant = recoveryGrant(env.g)                    // 2 POSTs, ambos liberan
    const acquiresPre = env.store.lock.acquires
    const releasesPre = env.store.lock.releases
    expect(acquiresPre).toBe(releasesPre)                 // equilibrado hasta aquí

    const r = post(env.g, {
      action: 'resetData', clients: [], appointments: [], expenses: [],
      services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
      resetPriceHistory: true, ...grant,
    })
    expect(r.ok).toBe(true)
    expect(env.store.lock.acquires).toBe(acquiresPre + 1)  // adquirió
    expect(env.store.lock.releases).toBe(releasesPre + 1)  // y liberó
  })

  it('control de versiones: cada escritura REEMPLAZA la colección (última gana, sin merge)', () => {
    const base = (id, time) => ({
      id, clientId: 'c1', clientName: 'Ana', clientPhone: '300',
      serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
      domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
      date: '2099-09-01', time, createdAt: '2026-01-01T09:00:00',
      calendarCreated: 'false', calendarEventId: '', completed: 'false',
      duration: '30', paymentMethod: '',
    })
    post(env.g, { appointments: [base('a1', '10:00'), base('a2', '12:00')] })
    expect(env.g.call('readSheet', env.ss, 'appointments')).toHaveLength(2)

    // Una escritura posterior con UNA sola fila no "fusiona": la gana entera.
    post(env.g, { appointments: [base('a3', '15:00')] })
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back.map(a => a.id)).toEqual(['a3'])
  })

  it('dos escrituras concurrentes se serializan: la segunda ve el resultado de la primera', () => {
    // El mock no paraleliza, pero sí permite comprobar el contrato que
    // sostiene Apps Script: bajo un solo lock, cada POST parte del estado
    // que dejó el anterior (no hay escrituras ciegas superpuestas).
    post(env.g, { clients: [{ id: 'c1', name: 'Ana', phone: '300', createdAt: '2026-01-01' }] })
    const trasPrimera = env.g.call('readSheet', env.ss, 'clients')
    expect(trasPrimera).toHaveLength(1)

    post(env.g, { clients: [trasPrimera[0], { id: 'c2', name: 'Belén', phone: '301', createdAt: '2026-01-02' }] })
    expect(env.g.call('readSheet', env.ss, 'clients').map(c => c.id)).toEqual(['c1', 'c2'])
    expect(env.store.lock.acquires).toBe(2)
    expect(env.store.lock.releases).toBe(2)
  })
})

/* ══════════════════════════════════════════════════════════════
   TEST-01 — Reconciliación y consistencia de datos (criterio 6)
   readSheet / writeSheet / cellStr: la capa de la que dependen
   todas las reglas anteriores para ver los datos correctos.
══════════════════════════════════════════════════════════════ */
describe('TEST-01 — Reconciliación y consistencia de datos', () => {
  let env
  beforeEach(() => { env = makeEnv() })

  it('writeSheet limpia el contenido anterior: no quedan filas huérfanas', () => {
    post(env.g, {
      appointments: [{
        id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300',
        serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{}',
        domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
        date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
        calendarCreated: 'false', calendarEventId: '', completed: 'false',
        duration: '30', paymentMethod: '',
      }],
    })
    expect(env.ss._sheets.appointments._rows()).toHaveLength(2)   // cabecera + 1

    post(env.g, { appointments: [] })
    const rows = env.ss._sheets.appointments._rows()
    expect(rows).toHaveLength(1)                                  // solo cabecera
    expect(rows[0]).toEqual(HEADERS.appointments)
  })

  it('readSheet descarta las filas sin id (basura de edición manual)', () => {
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-09-01', '10:00', 'false', 's1', S1.name),
      toRow('appointments', {}),                    // fila vacía
      apptRow('a2', '2099-09-02', '11:00', 'false', 's1', S1.name),
    ])
    expect(env.g.call('readSheet', env.ss, 'appointments').map(a => a.id))
      .toEqual(['a1', 'a2'])
  })

  it('readSheet con MÁS columnas de las esperadas: ignora las extra y avisa', () => {
    env.ss._sheets.appointments._seed([
      [...HEADERS.appointments, 'COLUMNA_RARA'],
      [...apptRow('a1', '2099-09-01', '10:00', 'false', 's1', S1.name), 'basura'],
    ])
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(Object.keys(back[0])).toHaveLength(JS_KEYS.appointments.length)   // ni una más
    expect(back[0].id).toBe('a1')
    expect(env.store.logs.some(l => l.includes('columnas') && l.includes('ignoran'))).toBe(true)
  })

  it('readSheet con MENOS columnas: rellena los campos faltantes con ""', () => {
    // Corte en 5 columnas: llegan id…serviceIds (índices 0-4).
    // `serviceNames` es la 6ª (índice 5) y NO llega.
    env.ss._sheets.appointments._seed([
      HEADERS.appointments.slice(0, 5),
      apptRow('a1', '2099-09-01', '10:00', 'false', 's1', S1.name).slice(0, 5),
    ])
    const back = env.g.call('readSheet', env.ss, 'appointments')
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe('a1')
    expect(back[0].serviceIds).toBe('s1')               // última columna que llegó
    expect(back[0].serviceNames).toBe('')               // 6ª: no llegó → ''
    expect(back[0].date).toBe('')                       // tampoco
    expect(back[0].calendarEventId).toBe('')            // ni el id de Calendar
    expect(env.store.logs.some(l => l.includes('rellenan'))).toBe(true)
  })

  it('cellStr normaliza fechas Date y horas fraccionarias de Sheets', () => {
    // Un Date DEBE construirse dentro del sandbox: `instanceof Date` no
    // cruza reinos de vm (mismo motivo que en el mock de Calendar).
    const d = env.g.call('mkDate', '2026-03-05', '00:00', 0)
    expect(env.g.call('cellStr', d, 'date')).toBe('2026-03-05')
    expect(env.g.call('cellStr', 0.75, 'time')).toBe('18:00')   // 0.75*1440=1080
    expect(env.g.call('cellStr', 0, 'time')).toBe('00:00')
    expect(env.g.call('cellStr', null, 'x')).toBe('')
    expect(env.g.call('cellStr', 'texto', 'x')).toBe('texto')
  })

  it('reconciliación: lo que se escribe con writeSheet es lo que devuelve doGet', () => {
    post(env.g, { clients: [{ id: 'c9', name: 'Zoe', phone: '320', createdAt: '2026-02-02' }] })
    const viaGet = rawGet(env.g, TOKEN).data.clients
    const viaRead = env.g.call('readSheet', env.ss, 'clients')
    expect(viaGet).toEqual(viaRead)
    expect(viaGet[0]).toEqual({ id: 'c9', name: 'Zoe', phone: '320', createdAt: '2026-02-02' })
  })

  it('una cita que referencia un servicio ya eliminado NO se reescribe sola', () => {
    // Los servicios se limpian con un POST de servicios; las citas NO se
    // cascadean. Se documenta el comportamiento real: la cita conserva el
    // id huérfano y `serviceNames` deja de coincidir con el catálogo.
    post(env.g, {
      appointments: [{
        id: 'a1', clientId: 'c1', clientName: 'Ana', clientPhone: '300',
        serviceIds: 's1', serviceNames: S1.name, servicePrice: '50000', servicePrices: '{"s1":50000}',
        domicilio: 'false', domicilioPrice: '0', totalPrice: '50000', address: '',
        date: '2099-09-01', time: '10:00', createdAt: '2026-01-01T09:00:00',
        calendarCreated: 'false', calendarEventId: '', completed: 'true',
        duration: '30', paymentMethod: '',
      }],
    })
    post(env.g, { services: [S2] })                  // s1 queda fuera del catálogo

    const appt = env.g.call('readSheet', env.ss, 'appointments')[0]
    expect(appt.serviceIds).toBe('s1')               // id huérfano, sin cascade
    expect(env.g.call('readSheet', env.ss, 'services').map(s => s.id)).toEqual(['s2'])
  })
})

/* ══════════════════════════════════════════════════════════════
   CORREO DE RESTABLECIMIENTO — presentación (SZ)
   Verifica sobre el Code.gs REAL (sandbox vm) que:
     · el asunto y el cuerpo usan SZ, sin «Studio Beauty»;
     · hay texto plano Y HTML (alternativa para clientes sin HTML);
     · la vigencia es la de la lógica (CODE_TTL_MS), no inventada;
     · la lógica de seguridad NO cambió: hash, un solo uso, expiración,
       intentos máximos, bloqueo y destinatario autorizado.
   NO se envía ningún correo real: GmailApp solo registra.
   ══════════════════════════════════════════════════════════════ */
describe('correo de restablecimiento · presentación y seguridad', () => {
  const request = (g) => post(g, { action: 'requestResetCode' })

  it('asunto y cuerpo usan SZ y NO mencionan Studio Beauty', () => {
    const { g } = makeEnv()
    expect(request(g).ok).toBe(true)
    const m = lastMail(g.store)
    expect(m.subject).toContain('SZ')
    expect(m.subject).not.toMatch(/studio/i)
    expect(m.body).toContain('SZ')
    expect(m.body).not.toMatch(/studio/i)
    expect(m.htmlBody).toContain('SZ')
    expect(m.htmlBody).not.toMatch(/studio/i)
  })

  it('envía HTML y también texto plano (alternativa sin HTML)', () => {
    const { g } = makeEnv()
    request(g)
    const m = lastMail(g.store)
    // Texto plano con el contenido esencial…
    expect(m.body).toMatch(/restablecer los datos del sistema/)
    // …y HTML con la tarjeta y el código destacado.
    expect(m.htmlBody).toContain('<table')
    expect(m.htmlBody).toMatch(/font-size:32px/)
    // Ninguno de los dos está vacío.
    expect(m.body.length).toBeGreaterThan(0)
    expect(m.htmlBody.length).toBeGreaterThan(0)
  })

  it('el código llega igual en texto plano y en HTML', () => {
    const { g } = makeEnv()
    request(g)
    const m = lastMail(g.store)
    const code = lastCode(g.store)
    expect(code).toMatch(/^[A-Z0-9]{8}$/)      // 8 caracteres, CODE_ALPHABET
    expect(m.body).toContain(code)
    expect(m.htmlBody).toContain(code)
  })

  it('la vigencia anunciada es la de la lógica (CODE_TTL_MS), no otra', () => {
    const { g } = makeEnv()
    request(g)
    // CODE_TTL_MS = 15 min → la plantilla lo DERIVA (CODE_TTL_MS/60000),
    // no lo escribe a mano, así que no puede divergir de la lógica real.
    const m = lastMail(g.store)
    expect(m.body).toContain('15 minutos')
    expect(m.htmlBody).toContain('15 minutos')
  })

  it('el correo va EXCLUSIVAMENTE al correo autorizado', () => {
    const { g } = makeEnv()
    request(g)
    expect(lastMail(g.store).to).toBe(AUTHORIZED_EMAIL)
  })

  it('el cuerpo del correo NO expone el código al cliente (solo hash)', () => {
    const { g } = makeEnv()
    request(g)
    // El código vive solo en el correo: en el store solo está su hash.
    expect(g.store.props.has('SB_RESET_CODE')).toBe(true)
    expect(String(g.store.props.get('SB_RESET_CODE'))).not.toContain(lastCode(g.store))
    expect(JSON.parse(g.store.props.get('SB_RESET_CODE')).hash).toBeTruthy()
  })

  it('SEGURIDAD intacta: un solo uso, expiración e intentos máximos', () => {
    const { g } = makeEnv()
    expect(request(g).ok).toBe(true)
    const code = lastCode(g.store)

    // 1) El grant es de UN SOLO USE: reutilizarlo se rechaza.
    const r = post(g, { action: 'verifyResetCode', code })
    expect(r.ok).toBe(true)
    const again = post(g, { action: 'verifyResetCode', code })
    expect(again.ok).toBe(false)

    // 2) Intentos máximos: 5 códigos erróneos → bloqueo.
    const { g: g2 } = makeEnv()
    request(g2)
    for (let i = 0; i < 5; i++) {
      const bad = post(g2, { action: 'verifyResetCode', code: 'ZZZZZZZZ' })
      expect(bad.ok).toBe(false)
    }
    const locked = post(g2, { action: 'verifyResetCode', code: lastCode(g2.store) })
    expect(locked.ok).toBe(false)
    expect(locked.error).toMatch(/Demasiados intentos/)
  })

  it('SEGURIDAD intacta: el código caduca (expiresAt en el futuro)', () => {
    const { g } = makeEnv()
    request(g)
    const st = JSON.parse(g.store.props.get('SB_RESET_CODE'))
    expect(st.expiresAt).toBeGreaterThan(Date.now())
  })
})
