/* ══════════════════════════════════════════════════════════════
   HELPERS PUROS — funciones sin dependencias de React ni de
   import.meta.env, para poder testearlas en Node (vitest) sin arrastrar
   el contexto del navegador. App.jsx las reutiliza.
══════════════════════════════════════════════════════════════ */

// 30-min time slots 07:00 → 20:30
export const TIME_SLOTS = []
for (let h = 7; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

export const SERVICE_DURATION = 60 // minutes per service

export const toN = v => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

export const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayStr = () => localDateStr()

export const monthStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// Timestamp ISO LOCAL (sin 'Z' final) —替代 a new Date().toISOString()
// que devuelve UTC y desplaza las horas en Colombia (UTC-5).
// Formato: 'YYYY-MM-DDTHH:mm:ss' con horas/minutos/segundos locales.
export const localNowISO = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

export const bool = v => v === true || v === 'true'

// Coincidencia telefónica: prefiero que el query coincida con el FINAL del
// número (sufijo) o con cualquier subcadena, pero dando prioridad al sufijo.
// Evita que buscar "300" devuelva cualquier cliente con "300" en el medio
// del número sin razón clara, manteniendo la flexibilidad de búsqueda parcial.
export const phoneMatch = (haystack, query) => {
  const h = String(haystack || '').replace(/\D/g, '')
  const q = String(query || '').replace(/\D/g, '')
  if (!q) return false
  return h.endsWith(q) || h.includes(q)
}

export const cleanDate = raw => {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export const fmtDate = raw => {
  const s = cleanDate(raw)
  if (!s) return '—'
  try {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return s
  }
}

export const cleanTime = raw => {
  if (!raw) return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
  return ''
}

export const fmtTime = raw => {
  const s = cleanTime(raw)
  if (!s) return '—'
  const [h, min] = s.split(':').map(Number)
  if (isNaN(h)) return '—'
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export const toMin = t => {
  const [h, m] = cleanTime(t).split(':').map(Number)
  return h * 60 + m
}

/**
 * Calcula los slots disponibles para una fecha.
 * - Bloquea los slots que se solapan con una cita existente de 60 min.
 * - Si la fecha es hoy, marca como pasadas las horas anteriores a ahora.
 * - excludeId permite ignorar la propia cita al editarla (para que no se
 *   bloquee a sí misma).
 *
 * @param {string} date        Fecha ISO 'YYYY-MM-DD'
 * @param {Array}  _taken      (legacy, no usado) se mantiene por compat
 * @param {Array}  allAppts    Lista de citas {id, date, time}
 * @param {string} excludeId   ID a ignorar (la cita que se edita)
 */
export const getSlots = (date, _taken, allAppts, excludeId = null) => {
  const now = new Date()
  const isToday = date === todayStr()
  const booked = (Array.isArray(allAppts) ? allAppts : [])
    .filter(a => cleanDate(a.date) === date && a.id !== excludeId)
    .map(a => toMin(a.time))

  return TIME_SLOTS.map(t => {
    const slotMin = toMin(t)
    // Solapamiento: nueva cita [slotMin, slotMin+60) vs existente [b, b+60)
    const isOverlap = booked.some(b => slotMin < b + SERVICE_DURATION && b < slotMin + SERVICE_DURATION)
    const isPast = isToday && (() => {
      const [h, m] = cleanTime(t).split(':').map(Number)
      const slot = new Date()
      slot.setHours(h, m, 0, 0)
      return slot <= now
    })()
    return { time: t, disabled: isOverlap || isPast, reason: isPast ? 'Hora pasada' : 'Ocupada' }
  })
}

/**
 * Libro de movimientos de un mes (YYYY-MM). FUENTE ÚNICA del neto:
 * Finanzas, Movimientos y el Excel usan esta misma función, así siempre cuadran.
 * Ingreso = cita completada (no cuenta pendiente ni 'noshow'), igual que antes.
 */
export const monthLedger = (appts, expenses, month) => {
  const A = Array.isArray(appts) ? appts : []
  const E = Array.isArray(expenses) ? expenses : []
  const incomes = A
    .filter(a => cleanDate(a.date).slice(0, 7) === month && bool(a.completed))
    .map(a => ({
      id: a.id, kind: 'in', date: cleanDate(a.date), time: cleanTime(a.time),
      who: a.clientName || '', detail: a.serviceNames || '',
      domicilio: bool(a.domicilio), amount: toN(a.totalPrice || a.servicePrice || 0),
    }))
  const outs = E
    .filter(e => cleanDate(e.date).slice(0, 7) === month)
    .map(e => ({
      id: e.id, kind: 'out', date: cleanDate(e.date), time: '',
      who: e.category || '', detail: e.description || '',
      domicilio: false, amount: toN(e.amount || 0),
    }))
  const totalIncome = incomes.reduce((s, r) => s + r.amount, 0)
  const totalExpenses = outs.reduce((s, r) => s + r.amount, 0)
  const rows = [...incomes, ...outs].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'in' ? -1 : 1))
  return { incomes, outs, rows, totalIncome, totalExpenses, neto: totalIncome - totalExpenses }
}
