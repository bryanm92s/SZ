/* ══════════════════════════════════════════════════════════════
   HELPERS PUROS — funciones sin dependencias de React ni de
   import.meta.env, para poder testearlas en Node (vitest) sin arrastrar
   el contexto del navegador. App.jsx las reutiliza.
══════════════════════════════════════════════════════════════ */

// 30-min time slots 07:00 → 20:30 (la cita de las 20:30 solo cabe si dura
// 30 min y termina exactamente a las 21:00; ver CLOSING_TIME en getSlots)
export const TIME_SLOTS = []
for (let h = 7; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
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

// ── Estado de la cita (fuente única para la UI) ──────────────────────
export const apptStatus = a => {
  if (a && a.completed === 'noshow') return 'noshow'
  return bool(a && a.completed) ? 'done' : 'pending'
}

// Restricción compartida de editar/eliminar: solo citas pendientes.
// La pestaña Citas y el Calendario usan esta misma regla.
export const canModifyAppt = a => apptStatus(a) === 'pending'

/* ══════════════════════════════════════════════════════════════
   ELIMINACIÓN DE SERVICIOS — relación cita ⇄ servicio
   La cita guarda el identificador real en `serviceIds` (CSV) y,
   como respaldo de la relación, `servicePrices` (JSON {id: precio}).
   `serviceNames` es solo un SNAPSHOT del nombre en el momento de
   agendar, por lo que NO se usa como clave principal: el nombre
   puede repetirse entre servicios distintos y además cambia si se
   renombra el servicio.
   El nombre solo se usa como último recurso, y únicamente cuando
   la cita no trae ningún id y ese nombre es único en el catálogo.
══════════════════════════════════════════════════════════════ */

// Normaliza un nombre de servicio para compararlo (minúsculas + espacios).
const normName = v =>
  String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * IDs de servicio que referencia una cita.
 * 1) `serviceIds`  (CSV)  — campo real de la relación.
 * 2) claves de `servicePrices` (JSON {id: precio}) — respaldo si el CSV vino vacío.
 * Devuelve [] si la cita no aporta ningún id.
 */
export const apptServiceIds = a => {
  if (!a) return []
  const out = String(a.serviceIds || '').split(',').map(s => s.trim()).filter(Boolean)
  if (out.length > 0) return out
  const sp = a.servicePrices
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) return Object.keys(sp).filter(Boolean)
  if (typeof sp === 'string' && sp.trim()) {
    try {
      const parsed = JSON.parse(sp)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return Object.keys(parsed).filter(Boolean)
    } catch { /* snapshot ilegible → sin ids */ }
  }
  return []
}

// Nombres de servicio snapshot en la cita (fallback de la relación).
export const apptServiceNames = a =>
  String((a && a.serviceNames) || '').split(',').map(s => s.trim()).filter(Boolean)

// Duración efectiva de una cita en minutos (idéntico a apptDuration).
const apptMinutes = a => {
  const n = Math.round(toN(a && a.duration))
  return n > 0 ? n : SERVICE_DURATION
}

/**
 * Momento de la cita respecto a `now` (Date local, por defecto ahora).
 *
 * Usa fecha + hora + duración + estado, nunca solo la fecha:
 *   'done'    → finalizada (completada o 'noshow'); es histórico.
 *   'past'    → su franja [inicio, fin) ya terminó; sigue pendiente.
 *   'live'    → EN CURSO ahora: inicio <= now < fin.
 *   'future'  → aún no empieza.
 *   'unknown' → sin fecha/hora válida: no se puede evaluar.
 */
export const apptLife = (a, now = new Date()) => {
  if (!a) return 'unknown'
  if (bool(a.completed) || a.completed === 'noshow') return 'done'
  const d = cleanDate(a.date)
  const t = cleanTime(a.time)
  if (!d || !t) return 'unknown'
  const start = new Date(`${d}T${t}:00`)
  if (isNaN(start.getTime())) return 'unknown'
  const end = new Date(start.getTime() + apptMinutes(a) * 60000)
  if (now.getTime() >= end.getTime()) return 'past'
  if (now.getTime() >= start.getTime()) return 'live'
  return 'future'
}

// ¿La cita referencia al servicio? Usa ids si la cita los trae; solo si no
// tiene ninguno recurre al nombre, y solo si ese nombre es único en el catálogo
// (si no, la coincidencia sería ambigua y podría bloquear un servicio ajeno).
const apptUsesService = (a, ids, nameKey, nameAmbiguous) => {
  const aid = apptServiceIds(a)
  if (aid.length > 0) return aid.some(id => ids[id])
  if (!nameKey || nameAmbiguous) return false
  return apptServiceNames(a).some(n => normName(n) === nameKey)
}

/**
 * Regla de negocio: no permitir eliminar un servicio con citas futuras
 * activas o citas en curso.
 *
 * @param {object} service  Servicio a eliminar {id, name}
 * @param {Array}  appts    Todas las citas
 * @param {Array}  services Catálogo completo (para detectar nombres ambiguos)
 * @param {Date}   now      Reloj inyectable (para tests)
 * @returns {{ok:boolean, count:number, blockers:Array, message:string|null}}
 */
export const serviceDeletionCheck = (service, appts, services, now = new Date()) => {
  const svc = service || {}
  const list = Array.isArray(appts) ? appts : []
  const catalog = Array.isArray(services) ? services : []

  const ids = {}
  const rawId = String(svc.id === null || svc.id === undefined ? '' : svc.id).trim()
  if (rawId) ids[rawId] = true

  const nameKey = normName(svc.name)
  const nameAmbiguous = !!nameKey &&
    catalog.filter(s => s && normName(s.name) === nameKey).length > 1

  const blockers = list.filter(a => {
    const life = apptLife(a, now)
    // Solo bloquean las que aún van a ocurrir o están ocurriendo.
    if (life !== 'future' && life !== 'live') return false
    return apptUsesService(a, ids, nameKey, nameAmbiguous)
  })

  const count = blockers.length
  const name = svc.name || rawId || 'este servicio'
  return {
    ok: count === 0,
    count,
    blockers,
    message: count === 0 ? null
      : `No se puede eliminar el servicio "${name}": ${count} cita${count === 1 ? '' : 's'} ` +
        `programada${count === 1 ? '' : 's'} o en curso aún lo utiliza${count === 1 ? '' : 'n'}. ` +
        `Completa o elimina esas citas primero.`,
  }
}

/**
 * Revalida la disponibilidad de un horario justo antes de crear o guardar
 * una cita (el asistente puede llevar un rato abierto y los datos cambian
 * con el refresco periódico).
 *
 * Devuelve `null` si el horario sigue disponible, o un mensaje legible si no.
 * Valida fecha, hora, duración, horario de atención y solapamientos con las
 * mismas funciones que usa la UI (cleanDate/cleanTime/getSlots).
 *
 * Es una validación en el cliente: NO protege frente a reservas
 * simultáneas de distintos usuarios.
 */
export const checkSlot = (date, time, appts, duration, excludeId = null) => {
  const d = cleanDate(date)
  if (!d) return 'La fecha no es válida.'
  if (d < todayStr()) return 'La fecha ya pasó: elige un día desde hoy.'
  const t = cleanTime(time)
  if (!t) return 'Elige una hora.'
  const dur = Math.round(toN(duration))
  if (dur <= 0) return 'La duración del servicio no es válida.'
  const slot = getSlots(d, [], appts, excludeId, dur)
    .find(s => cleanTime(s.time) === t)
  if (!slot) return `Las ${fmtTime(t)} no hacen parte del horario de atención.`
  if (slot.disabled) return `Las ${fmtTime(t)} ya no están disponibles (${slot.reason}). Elige otra hora.`
  return null
}

/**
 * Decisión de `NewWizard.confirm()` cuando la validación previa falla.
 * `problem`     : mensaje legible del fallo (null si todo está bien).
 * `slotProblem` : mensaje si la hora dejó de estar disponible (null si no).
 *
 * Si la hora ya no está disponible hay que limpiarla antes de volver al
 * paso de fecha/hora: si no, la interfaz seguiría ofreciendo esa hora
 * (banner de "hora elegida" y avance al resumen con una hora inválida).
 */
export const confirmOutcome = (problem, slotProblem) => ({
  ok: !problem,
  message: problem || null,
  clearTime: !!slotProblem,
})

/**
 * Ingresos «proyectados» de un conjunto de citas: suma del total de todas
 * las citas EXCEPTO las marcadas como 'noshow' (un no-show no se cobra).
 * Criterio único: lo usan Panel, Finanzas, Detalle de ingresos y Reporte;
 * coincide con el correo del backend (Code.gs, _buildReport).
 */
export const projectedIncome = list =>
  (Array.isArray(list) ? list : [])
    .filter(a => a && a.completed !== 'noshow')
    .reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0)

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

/**
 * Rangos de fila de la hoja "Movimientos" del Excel exportado.
 * `rowCount` = filas de datos (citas + gastos). Los datos ocupan las filas
 * 2..(rowCount+1) y los totales van dos filas más abajo.
 *
 * Devuelve `null` si no hay filas exportables: en ese caso NO deben
 * generarse fórmulas (evita rangos invertidos como `SUM(F2:F1)`).
 */
export const movsRanges = rowCount => {
  const n = Math.round(toN(rowCount))
  if (n <= 0) return null
  return { first: 2, last: n + 1, tRow: n + 3 }
}

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
