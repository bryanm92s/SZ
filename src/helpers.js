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

// ── Duración por servicio ──────────────────────────────────────────────
// Hora de cierre: una cita no puede TERMINAR después de esta hora.
export const CLOSING_TIME = '21:00'

// Duración (min) de un servicio; si no tiene (servicios antiguos) → 60.
export const svcDuration = s => {
  const n = Math.round(toN(s && s.duration))
  return n > 0 ? n : SERVICE_DURATION
}

// Duración total de varios servicios seleccionados (suma).
export const sumDuration = list => {
  const L = Array.isArray(list) ? list : []
  return L.reduce((t, s) => t + svcDuration(s), 0) || SERVICE_DURATION
}

// Duración (min) guardada en una cita; citas antiguas sin dato → 60.
export const apptDuration = a => {
  const n = Math.round(toN(a && a.duration))
  return n > 0 ? n : SERVICE_DURATION
}

// 90 → '1 h 30 min' · 60 → '1 h' · 30 → '30 min'
export const fmtDuration = min => {
  const n = Math.round(toN(min))
  if (n <= 0) return '—'
  const h = Math.floor(n / 60), m = n % 60
  if (h && m) return `${h} h ${m} min`
  return h ? `${h} h` : `${m} min`
}

// Hora de fin 'HH:MM' = inicio + duración en minutos
export const endTime = (t, durationMin) => {
  const start = toMin(t)
  if (isNaN(start)) return ''
  const m = start + Math.round(toN(durationMin))
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Calcula los slots disponibles para una fecha.
 * - Bloquea los slots que se solapan con una cita existente, usando la
 *   duración REAL de cada cita (campo `duration`; si falta → 60 min).
 * - La cita nueva ocupa [inicio, inicio + duration). Si no cabe antes de
 *   CLOSING_TIME, el slot queda bloqueado.
 * - Si la fecha es hoy, marca como pasadas las horas anteriores a ahora.
 * - excludeId permite ignorar la propia cita al editarla (para que no se
 *   bloquee a sí misma).
 * - `conflict` = true cuando el bloqueo es por choque o cierre (no por
 *   hora pasada). Sirve para validar al editar una cita.
 *
 * @param {string} date        Fecha ISO 'YYYY-MM-DD'
 * @param {Array}  _taken      (legacy, no usado) se mantiene por compat
 * @param {Array}  allAppts    Lista de citas {id, date, time, duration}
 * @param {string} excludeId   ID a ignorar (la cita que se edita)
 * @param {number} duration    Duración (min) de la cita que se agenda
 */
export const getSlots = (date, _taken, allAppts, excludeId = null, duration = SERVICE_DURATION) => {
  const now = new Date()
  const isToday = date === todayStr()
  const dur = Math.round(toN(duration)) > 0 ? Math.round(toN(duration)) : SERVICE_DURATION
  const closeMin = toMin(CLOSING_TIME)
  const booked = (Array.isArray(allAppts) ? allAppts : [])
    .filter(a => cleanDate(a.date) === date && a.id !== excludeId)
    .map(a => ({ start: toMin(a.time), dur: apptDuration(a) }))

  return TIME_SLOTS.map(t => {
    const slotMin = toMin(t)
    // Solapamiento: nueva cita [slotMin, slotMin+dur) vs existente [b.start, b.start+b.dur)
    const isOverlap = booked.some(b => slotMin < b.start + b.dur && b.start < slotMin + dur)
    const tooLate = slotMin + dur > closeMin
    const isPast = isToday && (() => {
      const [h, m] = cleanTime(t).split(':').map(Number)
      const slot = new Date()
      slot.setHours(h, m, 0, 0)
      return slot <= now
    })()
    const reason = isPast ? 'Hora pasada' : isOverlap ? 'Ocupada' : 'No alcanza antes del cierre'
    return { time: t, disabled: isOverlap || tooLate || isPast, conflict: isOverlap || tooLate, reason }
  })
}

// Métodos de pago al completar una cita. Citas antiguas no tienen el dato → ''.
export const PAYMENT_METHODS = ['Efectivo', 'Transferencia']
export const payMethodOf = a => {
  const m = String((a && a.paymentMethod) || '').trim()
  return PAYMENT_METHODS.includes(m) ? m : ''
}

/**
 * Libro de movimientos de un PERÍODO (from..to, 'YYYY-MM-DD', inclusivo).
 * FUENTE ÚNICA del neto: Finanzas, Reporte y el Excel usan esta función.
 * Ingreso = cita completada (no cuenta pendiente ni 'noshow').
 */
export const periodLedger = (appts, expenses, from, to) => {
  const A = Array.isArray(appts) ? appts : []
  const E = Array.isArray(expenses) ? expenses : []
  const inP = d => { const x = cleanDate(d); return !!x && x >= from && x <= to }
  const incomes = A
    .filter(a => inP(a.date) && bool(a.completed))
    .map(a => {
      const amount = toN(a.totalPrice || a.servicePrice || 0)
      // El domicilio viene sumado dentro del total de la cita; aquí se separa.
      const delivery = bool(a.domicilio) ? Math.min(toN(a.domicilioPrice || 0), amount) : 0
      return {
        id: a.id, kind: 'in', date: cleanDate(a.date), time: cleanTime(a.time),
        who: a.clientName || '', detail: a.serviceNames || '',
        domicilio: bool(a.domicilio), amount, delivery, service: amount - delivery,
        payMethod: payMethodOf(a),
      }
    })
  const outs = E
    .filter(e => inP(e.date))
    .map(e => ({
      id: e.id, kind: 'out', date: cleanDate(e.date), time: '',
      who: e.category || '', detail: e.description || '',
      domicilio: false, amount: toN(e.amount || 0), delivery: 0, service: 0, payMethod: '',
    }))
  const totalIncome = incomes.reduce((s, r) => s + r.amount, 0)
  const totalService = incomes.reduce((s, r) => s + r.service, 0)
  const totalDelivery = incomes.reduce((s, r) => s + r.delivery, 0)
  const totalExpenses = outs.reduce((s, r) => s + r.amount, 0)
  const sumBy = m => incomes.filter(r => r.payMethod === m).reduce((s, r) => s + r.amount, 0)
  const totalCash = sumBy('Efectivo')
  const totalTransfer = sumBy('Transferencia')
  const totalNoMethod = totalIncome - totalCash - totalTransfer // citas completadas antes de existir el método
  const rows = [...incomes, ...outs].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'in' ? -1 : 1))
  return {
    incomes, outs, rows, totalIncome, totalService, totalDelivery, totalExpenses,
    totalCash, totalTransfer, totalNoMethod, neto: totalIncome - totalExpenses,
  }
}

// Atajo para un mes completo ('YYYY-MM')
export const monthLedger = (appts, expenses, month) =>
  periodLedger(appts, expenses, month + '-01', month + '-31')

// ¿iPhone/iPad? (incluye iPadOS, que se reporta como Mac con pantalla táctil)
export const isIOS = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// URL de WhatsApp según dispositivo:
// - iOS: wa.me (enlace universal) → iOS deja elegir WhatsApp o WhatsApp Business.
// - Escritorio: api.whatsapp.com/send → wa.me redirige a WhatsApp Web y ahí se
//   dañan los emojis (salen como �).
export const waUrl = (phone, msg, ios = false) => {
  const p = String(phone).replace(/\D/g, '')
  const text = encodeURIComponent(msg)
  return ios
    ? 'https://wa.me/' + p + '?text=' + text
    : 'https://api.whatsapp.com/send/?phone=' + p + '&text=' + text + '&type=phone_number&app_absent=0'
}

// Abre WhatsApp: en iOS navega directo (para que salga el selector);
// en escritorio abre pestaña nueva y no saca al usuario de la app.
export const openWhatsApp = (phone, msg) => {
  const ios = isIOS()
  const url = waUrl(phone, msg, ios)
  if (ios) window.location.href = url
  else window.open(url, '_blank')
}
