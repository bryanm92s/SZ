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

/* ── Sandbox con los servicios de Apps Script simulados ── */
function runCodeGs(ss) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ json: s }) }),
    },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Utilities: { formatDate: () => '2026-01-15T13:00:00' },
  }
  const ctx = createContext(sandbox)
  runInContext(CODE_GS, ctx, { filename: 'Code.gs' })
  return {
    doPost: ctx.doPost,
    call: (name, ...args) => ctx[name](...args),
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

function makeEnv({ appts = [] } = {}) {
  const ss = makeSpreadsheet({
    services:     [toRow('services', S1), toRow('services', S2)],
    appointments: appts.map(a => toRow('appointments', a)),
  })
  return { g: runCodeGs(ss), ss }
}

const svcRows = (ss) => ss._sheets.services._rows().slice(1).map(r => r[0])

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

  it('el restablecimiento (services + appointments en el mismo POST) sigue funcionando', () => {
    // resetAll envía las citas vacías junto con servicios nuevos:
    // al no quedar citas vigentes, ninguna eliminación queda bloqueada.
    env.ss._sheets.appointments._seed([
      HEADERS.appointments,
      apptRow('a1', '2099-06-20', '10:00', 'false', 's1', S1.name),
    ])
    const r = post(env.g, {
      services: [{ id: 'n1', name: 'Nuevo', price: '1000', duration: '30' }],
      appointments: [],
      resetPriceHistory: true,
    })
    expect(r.ok).toBe(true)
    expect(svcRows(env.ss)).toEqual(['n1'])
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
