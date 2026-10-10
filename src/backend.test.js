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
    props: new Map(), mail: [], logs: [],
    calLookups: [], calDeleted: [], calCreated: [],
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
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
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
    GmailApp: {
      sendEmail: (to, subject, body) => { store.mail.push({ to, subject, body }); return {} },
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
const lastMail = (store) => store.mail[store.mail.length - 1]
const lastCode = (store) => {
  const m = /Tu código es: ([A-Z0-9]+)/.exec(lastMail(store).body)
  return m ? m[1] : null
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
