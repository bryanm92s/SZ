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
// «Transferencia» se RETIRÓ de la lista: las citas viejas lo conservan
// (LEGACY) y siguen contando en reportes y Excel, pero ya no se puede elegir.
// Nequi, Daviplata y Bancolombia son transferencias (hay total aparte).
export const PAYMENT_METHODS = ['Efectivo', 'Nequi', 'Daviplata', 'Bancolombia']
export const LEGACY_PAYMENT_METHODS = ['Transferencia']
export const TRANSFER_METHODS = ['Nequi', 'Daviplata', 'Bancolombia']
export const READABLE_PAYMENT_METHODS = [...PAYMENT_METHODS, ...LEGACY_PAYMENT_METHODS]
export const payMethodOf = a => {
  const m = String((a && a.paymentMethod) || '').trim()
  return READABLE_PAYMENT_METHODS.includes(m) ? m : ''
}

// ── Estado de la cita (fuente única para la UI) ──────────────────────
export const apptStatus = a => {
  if (a && a.completed === 'noshow') return 'noshow'
  return bool(a && a.completed) ? 'done' : 'pending'
}

// Restricción compartida de editar/eliminar: solo citas pendientes.
// La pestaña Citas y el Calendario usan esta misma regla.
export const canModifyAppt = a => apptStatus(a) === 'pending'

/* ── ¿Se puede enviar el recordatorio de esta cita? ──────────────────
   Regla ÚNICA para el Panel, la pestaña Citas y el Calendario: no se
   manda recordatorio de una cita que ya empezó o ya pasó (el mensaje
   anuncia una fecha y una hora; avisar de algo que ya ocurrió
   confunde a la clienta). El aviso y los botones desaparecen EN el
   momento en que la cita arranca: `graceMin` quedó en 0 (antes eran
   10 min de tolerancia tras el inicio).
   También devuelve false si la cita está completada o marcada como
   «no asistió», o si no tiene fecha y hora válidas: sin ellas no hay
   recordatorio posible (el mensaje las lleva dentro).
   `graceMin` sigue inyectable (nadie lo usa hoy) por si algún día se
   quisiera volver a tolerar retrasos tras el inicio.              */
export const canRemindAppt = (a, now = new Date(), graceMin = 0) => {
  if (!a) return false
  if (bool(a.completed) || a.completed === 'noshow') return false
  const d = cleanDate(a.date)
  const t = cleanTime(a.time)
  if (!d || !t) return false
  const td = localDateStr(now)
  if (d < td) return false                  // otro día: ya pasó
  if (d > td) return true                   // futuro: siempre
  const [h, m] = t.split(':').map(Number)   // hoy: gracia tras empezar
  if (isNaN(h)) return false
  const start = new Date(now); start.setHours(h, m, 0, 0)
  return (now.getTime() - start.getTime()) <= graceMin * 60000
}

/* ── PROTOCOLO DEL RECORDATORIO (manual + respaldo automático) ──
   Solo aplica en instalaciones con el envío automático ARMADO
   (el backend reporta `waAuto` en doGet, que a su vez lee
   SB_WA_ENABLED y las propiedades de Meta en Script Properties).
   Sin él, la app se comporta como siempre: botón manual, nada
   registrado, nada automático.

   Ventanas para una cita pendiente de HOY:
   · REMIND_OPEN_MIN (60): abre la fase manual — el aviso del Panel
     y la pregunta «¿ya lo enviaste?» cuentan desde aquí.
   · REMIND_AUTO_MIN (30): el respaldo automático toma el relevo —
     la confirmación manual ya no bloquea nada y el barrido es el
     dueño del recordatorio.                                      */
export const REMIND_OPEN_MIN = 60
export const REMIND_AUTO_MIN = 30

/* Minutos que faltan para que empiece la cita (solo citas de HOY).
   null si la cita es de otro día o no trae fecha/hora válidas.
   + = aún no empieza · 0 = empieza ya · − = ya empezó.          */
export const apptMinsToStart = (a, now = new Date()) => {
  if (!a) return null
  const d = cleanDate(a.date)
  const t = cleanTime(a.time)
  if (!d || !t) return null
  if (d !== localDateStr(now)) return null   // otra fecha: sin ventana
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h)) return null
  const start = new Date(now); start.setHours(h, m, 0, 0)
  return Math.round((start.getTime() - now.getTime()) / 60000)
}

/* Fase del protocolo para una cita:
   'antes'  → fuera de la ventana (>60 min, cita de otro día o sin
               datos válidos): el botón abre el chat, nada se
               pregunta y nada se registra.
   'manual' → ventana del manual (30,60]: la pregunta «¿ya lo
               enviaste?» SÍ cuenta y bloquea el automático.
   'auto'   → (0,30]: el barrido es el dueño; el manual ya no cuenta.
   'cerrada'→ cita ya iniciada o decidida (✓/✗): nada que hacer.  */
export const remindPhase = (a, now = new Date()) => {
  if (!a) return 'cerrada'
  if (bool(a.completed) || a.completed === 'noshow') return 'cerrada'
  const mins = apptMinsToStart(a, now)
  if (mins === null) return 'antes'
  if (mins <= 0) return 'cerrada'
  if (mins > REMIND_OPEN_MIN) return 'antes'
  if (mins > REMIND_AUTO_MIN) return 'manual'
  return 'auto'
}

/* Estado del recordatorio de una cita según la colección `reminders`
   que devuelve doGet (hoja «Recordatorios» del backend, de SOLO
   LECTURA en el frontend: jamás viaja en un POST de sync, porque
   writeSheet reemplaza hojas completas y la pisaría).
   Sin fila → 'pending' (el estado inicial implícito).
   REMINDER_TERMINAL: estados que cierran el protocolo de la cita:
   nada más se envía ni se pregunta por ella.                    */
export const REMINDER_TERMINAL = ['manual_confirmed', 'auto_sent', 'auto_failed_final']
export const reminderStatusOf = (reminders, apptId) => {
  const r = (Array.isArray(reminders) ? reminders : [])
    .find(x => x && String(x.appointmentId) === String(apptId))
  return (r && r.status) || 'pending'
}

/* ── ¿Se puede MARCAR (✓ o ✗) esta cita? ──────────────────────────
   Regla ÚNICA compartida por la pestaña Citas y el Calendario:
   · corregir (quitar un ✓ o un ✗ ya puesto) SIEMPRE se puede;
   · una cita de un día pasado, o de hoy con la hora ya iniciada, se
     puede marcar siempre — es el grupo «Sin marcar»;
   · una cita de un día futuro (mañana o más) nunca: «Cita futura»;
   · una cita de HOY que aún no empieza solo dentro de la VENTANA de
     antelación MARK_LEAD_MIN: la de las 8:00 p. m. se puede marcar
     desde las 7:30 p. m. (con 30 min), no a mediodía.
   Sin hora válida el mismo día no hay ventana que comprobar → false. */
export const MARK_LEAD_MIN = 30
export const canMarkAppt = (a, now = new Date(), leadMin = MARK_LEAD_MIN) => {
  if (!a) return false
  if (bool(a.completed) || a.completed === 'noshow') return true
  const d = cleanDate(a.date)
  const t = cleanTime(a.time)
  const td = localDateStr(now)
  if (!d) return false
  if (d < td) return true
  if (d > td) return false
  if (!t) return false
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h)) return false
  const start = new Date(now); start.setHours(h, m, 0, 0)
  return start.getTime() - now.getTime() <= leadMin * 60000
}

/* ── Inasistencias por clienta ─────────────────────────────────────
   Lo usan el historial del cliente (aviso arriba de la lista) y el
   asistente de nueva cita (aviso al elegir clienta).
   • `phone` se compara SOLO por dígitos (mismo criterio que phoneMatch).
   • «Decididas» = completadas o no asistió; las pendientes no cuentan.
   • `recent` = las últimas NOSHOW_WINDOW decididas, más reciente
     primero; `windowNoshow` cuenta cuántas de esas fueron no-show.
   • `warn` = patrón frecuente (faltó 2+ de sus últimas decididas):
     ese es el umbral del aviso al agendar.                       */
export const NOSHOW_WINDOW = 7
export const clientNoShowStats = (appts, phone) => {
  const dig = String(phone || '').replace(/\D/g, '')
  const A = Array.isArray(appts) ? appts : []
  const mine = dig
    ? A.filter(a => String(a && a.clientPhone || '').replace(/\D/g, '') === dig)
    : []
  const noshow = mine.filter(a => a && a.completed === 'noshow')
  const decided = mine
    .filter(a => a && (a.completed === 'noshow' || bool(a.completed)))
    .sort((a, b) =>
      `${cleanDate(b.date)}${cleanTime(b.time)}`.localeCompare(`${cleanDate(a.date)}${cleanTime(a.time)}`))
  const recent = decided.slice(0, NOSHOW_WINDOW)
  const windowNoshow = recent.filter(a => a.completed === 'noshow').length
  return {
    total: mine.length,
    noshow: noshow.length,
    decided: decided.length,
    recent,
    windowNoshow,
    warn: windowNoshow >= 2,
  }
}

/**
 * Grupo de la pestaña Citas en el que cae una cita.
 * Réplica de los filtros de `groups` en ApptsTab: sirve para abrir y
 * localizar el grupo correcto cuando se llega desde el Panel o desde
 * el Calendario.
 * Una cita PASADA sin decisión (ni ✓ completada ni ✗ no asistió) cae
 * en «unmarked»: es la lista de citas que esperan una marca y que antes
 * se perdían dentro de «Pasadas». La pasada completada sigue en
 * «past»; «No asistió» gana siempre.
 */
export const apptGroup = (a, now = new Date()) => {
  if (!a) return 'past'
  if (a.completed === 'noshow') return 'noshow'
  const d  = cleanDate(a.date)
  const td = localDateStr(now)
  const pastDone = () => (bool(a.completed) ? 'past' : 'unmarked')
  if (!d || d < td) return pastDone()
  if (d > td) {
    const tm = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    return d === tm ? 'tomorrow' : 'upcoming'
  }
  // Mismo día: «pasada» si su hora de inicio ya empezó.
  const [h, m] = cleanTime(a.time).split(':').map(Number)
  if (isNaN(h)) return 'today'
  const start = new Date(now); start.setHours(h, m, 0, 0)
  return start < now ? pastDone() : 'today'
}

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

/* Separador con el que la app concatenaba los nombres al agendar
   (selSvcs.map(s => s.name).join(', ')). Tiene que ser el MISMO aquí,
   en App.jsx y en Code.gs. */
const SNAP_SEP = ', '

/**
 * Recupera los nombres del snapshot cuando ALGÚN id ya no está en el
 * catálogo, apoyándose en los nombres que sí se conocen.
 *
 * `serviceNames` es un CSV: los nombres van en el MISMO orden que los ids
 * de `serviceIds`, separados por «, ». Eso basta… salvo cuando un nombre
 * lleva coma: «Cejas, Diseño, depilación de pestañas» son DOS servicios,
 * pero partirlo por la coma da TROZOS y las posiciones se desplazan, con
 * lo que el servicio borrado se quedaba con «Diseño».
 *
 * Con al menos un nombre del catálogo como ANCLA se recorre el texto en
 * orden: cada nombre perdido ocupa desde donde acaba el anterior conocido
 * hasta donde empieza el siguiente. Si no hay ninguna ancla no hay manera
 * de saber dónde corta cada uno, y se devuelve '' para caer al respaldo
 * posicional (comportamiento anterior).
 *
 * @param {string} raw       serviceNames tal cual, sin partir
 * @param {Array}  resolved  nombre del catálogo por id; '' si ya no existe
 * @returns {Array}          un nombre por id, en el mismo orden
 */
const recoverSnapshotNames = (raw, resolved) => {
  const txt = String(raw === null || raw === undefined ? '' : raw)
  // Busca `name` solo donde puede empezar un nombre: al principio del
  // texto o justo después de «, ». Sin esta restricción, si una ancla es
  // PREFIJO de otra («Cejas» dentro de «Cejas full») la búsqueda por
  // subcadena devolvía la posición equivocada y se comía el nombre.
  const atBoundary = (name, from) => {
    let i = Math.max(0, from)
    while (i <= txt.length) {
      const j = txt.indexOf(name, i)
      if (j === -1) return -1
      const before = j === 0 || txt.startsWith(SNAP_SEP, j - SNAP_SEP.length)
      const after  = j + name.length === txt.length || txt.startsWith(SNAP_SEP, j + name.length)
      if (before && after) return j
      i = j + 1
    }
    return -1
  }

  const out = []
  let pos = 0
  for (let i = 0; i < resolved.length; i++) {
    const known = resolved[i]
    if (known) {
      const idx = atBoundary(known, pos)
      if (idx === -1) { out.push(''); continue }   // renombrado: sin ancla
      out.push(known)
      pos = idx + known.length + SNAP_SEP.length
      continue
    }
    // Sin ancla a la izquierda: termina donde empieza el siguiente nombre
    // conocido, o al final del texto.
    let end = txt.length
    for (let j = i + 1; j < resolved.length; j++) {
      if (!resolved[j]) continue
      const k = atBoundary(resolved[j], pos)
      if (k !== -1) { end = Math.max(pos, k - SNAP_SEP.length); break }
    }
    out.push(txt.slice(pos, end).trim())
    pos = end + SNAP_SEP.length
  }
  return out
}

/**
 * Servicios de una cita YA resueltos contra el catálogo: [{id, name}].
 *
 * La relación real son los IDs (CSV). Un ID no lleva comas, pero un
 * NOMBRE sí puede —«Diseño, depilación y sombreado» es UN solo
 * servicio—, así que partir `serviceNames` por la coma inventaba
 * servicios que no existían: el ranking salía con dos entradas y el
 * importe se repartía a medias. De ahí que el nombre SIEMPRE venga del
 * catálogo por id, y que el snapshot solo se parta como último recurso.
 */
export const apptServiceRefs = (a, services) => {
  const svcs = Array.isArray(services) ? services : []
  const ids  = apptServiceIds(a)
  const snap = apptServiceNames(a)
  const porId = id => {
    const s = svcs.find(x => String(x.id) === String(id))
    return s ? String(s.name || '').trim() : ''
  }

  if (ids.length === 1) {
    // Con UN servicio, el snapshot ENTERO es su nombre: no hay manera de
    // confundirlo con un separador, así que sobrevive aunque el servicio
    // ya no exista en el catálogo (o este no haya cargado todavía).
    const name = porId(ids[0]) || snap.join(', ')
    return name ? [{ id: String(ids[0]), name }] : []
  }

  if (ids.length > 1) {
    // Varios servicios: el nombre sale del catálogo, nunca de partir el
    // snapshot. Para los que ya no existen se recupera el texto recorriéndolo
    // con los nombres conocidos como ANCLA (recoverSnapshotNames), y no por
    // la posición i: si un nombre lleva coma, las posiciones se desplazaban
    // y el servicio borrado se quedaba con un trozo («Diseño» por «Diseño,
    // depilación de pestañas»). Sin ninguna ancla se cae al respaldo
    // posicional de antes, porque no hay información para reconstruir.
    const raw   = String(a.serviceNames || '')
    const known = ids.map(porId)           // '' = ya no está en el catálogo
    const rec   = known.some(Boolean) ? recoverSnapshotNames(raw, known) : known
    return ids.map((id, i) => ({ id: String(id), name: rec[i] || snap[i] || '' }))
      .filter(r => r.name)
  }

  // Sin ids: primero el nombre snapshot ENTERO si existe en el catálogo
  // (así un servicio cuyo nombre lleve coma tampoco se parte).
  const whole = snap.join(', ')
  const s = svcs.find(x => normName(x.name) === normName(whole))
  if (s) return [{ id: String(s.id), name: String(s.name || '').trim() }]

  // Último recurso: partido por comas (citas antiguas sin ids).
  return snap.map(name => ({ id: '', name }))
}

/**
 * Top 3 de servicios por demanda, sobre las citas COMPLETADAS: cuántas
 * veces se pidió y cuánto facturó cada uno (la facturación de una cita
 * se reparte por igual entre sus servicios).
 *
 * Es el «✨ Top servicios del período» del reporte. `_buildReport` en
 * Code.gs replica esto línea por línea para que el correo salga igual
 * que el WhatsApp del admin, y el test de paridad los compara.
 */
export const topServicesByDemand = (appts, services) => {
  const stats = {}
  ;(Array.isArray(appts) ? appts : [])
    .filter(a => bool(a.completed) && a.completed !== 'noshow')
    .forEach(a => {
      const refs = apptServiceRefs(a, services)
      refs.forEach(r => {
        if (!stats[r.name]) stats[r.name] = { name: r.name, count: 0, revenue: 0 }
        stats[r.name].count += 1
        stats[r.name].revenue += refs.length ? toN(a.servicePrice) / refs.length : toN(a.servicePrice)
      })
    })
  // Orden estable por demanda: a igual número de citas, manda el orden
  // de aparición (el mismo en ambos lados, porque salen de la misma
  // lista), que es lo que ya venía pasando.
  return Object.values(stats).sort((a, b) => b.count - a.count).slice(0, 3)
}

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
  // Totales por método: los 4 actuales + el heredado «Transferencia»,
  // en ese orden (el reporte y el Excel reparten con esta misma lista).
  const byMethod = {}
  READABLE_PAYMENT_METHODS.forEach(m => { byMethod[m] = sumBy(m) })
  const totalCash = byMethod.Efectivo
  // Nequi + Daviplata + Bancolombia + las citas viejas en «Transferencia».
  const totalTransfer = TRANSFER_METHODS.reduce((s, m) => s + byMethod[m], 0) + byMethod.Transferencia
  const totalKnown = READABLE_PAYMENT_METHODS.reduce((s, m) => s + byMethod[m], 0)
  const totalNoMethod = totalIncome - totalKnown // citas completadas antes de existir el método
  const rows = [...incomes, ...outs].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'in' ? -1 : 1))
  return {
    incomes, outs, rows, totalIncome, totalService, totalDelivery, totalExpenses,
    byMethod, totalCash, totalTransfer, totalNoMethod, neto: totalIncome - totalExpenses,
  }
}

// Atajo para un mes completo ('YYYY-MM')
export const monthLedger = (appts, expenses, month) =>
  periodLedger(appts, expenses, month + '-01', month + '-31')

/**
 * Métricas del reporte (Fase de presentación).
 * FUENTE ÚNICA de las cifras que muestra la pestaña Reporte, para que el
 * diseño pueda cambiar sin tocar los números.
 *
 * Deficiones (conservadas tal cual):
 *  - CREADAS:    citas registradas durante el período (por createdAt),
 *                aunque estén programadas para otra fecha.
 *  - AGENDADAS:  citas cuya fecha cae en el período, aunque se crearon antes.
 *  - COMPLETADAS / PENDIENTES / %: mismas fórmulas que ya usaba la vista.
 *
 * `inPeriod` define qué fechas pertenecen al período (cierre de día, mes
 * completo o rango) y `from`/`to` son el rango normalizado que recibe
 * `periodLedger`.
 *
 * IMPORTANTE: el neto NO es «Proyectado − Gastos». Sale del libro único
 * (`periodLedger.neto` = ingresos de citas completadas − gastos), de modo
 * que las citas pendientes no inflan el resultado.
 */
export const reportMetrics = ({ appts, expenses, inPeriod, from, to }) => {
  const A = Array.isArray(appts) ? appts : []
  const E = Array.isArray(expenses) ? expenses : []
  const inP = d => { const x = cleanDate(d); return !!x && !!inPeriod(x) }

  const apptsInPeriod = A.filter(a => inP(a.date))
  const createdInPeriod = A.filter(a => {
    const c = cleanDate(String(a.createdAt || '').slice(0, 10)) || cleanDate(a.date)
    return inP(c)
  })

  const created = createdInPeriod.length

  const scheduled = apptsInPeriod.length
  const completed = apptsInPeriod.filter(a => bool(a.completed) && a.completed !== 'noshow').length
  const pending   = apptsInPeriod.filter(a => !bool(a.completed) && a.completed !== 'noshow').length
  const noshow    = apptsInPeriod.filter(a => a.completed === 'noshow').length

  const ledger      = periodLedger(A, E, from, to)
  const domicilios  = apptsInPeriod.filter(a => bool(a.domicilio)).length

  return {
    created, scheduled, completed, pending, noshow, domicilios,
    completionRate: scheduled > 0 ? Math.round(completed / scheduled * 100) : 0,
    cancelledRate:  scheduled > 0 ? Math.round(noshow / scheduled * 100) : 0,
    revenue:      ledger.totalIncome,   // «Total ingresos» (solo completadas)
    projected:    projectedIncome(apptsInPeriod),
    domRevenue:   ledger.totalDelivery,
    totalExpenses: ledger.totalExpenses,
    neto:         ledger.neto,
    avgTicket:    completed > 0 ? Math.round(ledger.totalIncome / completed) : 0,
    ledger,
    apptsInPeriod,
  }
}

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

/**
 * TEXTO DEL REPORTE DE ACTIVIDAD (fuente única del formato en el frontend).
 *
 * Lo usa el botón «💬 WhatsApp admin» de Reportes, y el correo automático
 * del trigger (`_sendReportEmail` en Code.gs) replica línea por línea el
 * mismo orden: el reporte programado por correo DEBE ser el mismo que el
 * que se manda a mano. El test de paridad en backend.test.js los compara.
 *
 * `m`      → el objeto de `reportMetrics` (trae `ledger` adentro).
 * `stamp`  → texto del pie «_Generado …_» (cada lado pone el suyo).
 */
export const reportLines = ({ label, m, topByDemand, stamp }) => {
  const L = m.ledger
  const money = n => `$${(Number(n) || 0).toLocaleString('es-CO')}`
  // Pocos gastos → el detalle uno por uno; muchos → una línea por
  // categoría. Con `grupos = null` se queda el detalle (ver
  // REPORT_EXPENSE_DETAIL_MAX).
  const grupos = L.outs.length > REPORT_EXPENSE_DETAIL_MAX ? groupExpensesByCategory(L.outs) : null
  const lines = [
    `✨ *Reporte de actividad*`,
    `📅 ${label}`,
    '',
    `📊 *Citas*`,
    `• Creadas (registradas): *${m.created}*`,
    `• Agendadas para el período: *${m.scheduled}*`,
    `• Completadas: *${m.completed}*${m.pending ? ` · Pendientes: ${m.pending}` : ''}`,
    ...(m.noshow > 0 ? [`• No asistió: *${m.noshow}*`] : []),
    '',
    `💰 *Ingresos*`,
    `• Servicio(s): *${money(L.totalService)}*`,
    `• Domicilios: *${money(L.totalDelivery)}*`,
    `• Total recibido: *${money(L.totalIncome)}*`,
    // Los 4 métodos actuales salen SIEMPRE (aunque en $0), y debajo el
    // total de transferencias; el heredado «Transferencia» solo aparece
    // si hay citas viejas con ese método. El correo automático replica
    // esta lista en el mismo orden (paridad).
    ...PAYMENT_METHODS.map(m => `   - ${m}: *${money(L.byMethod[m] || 0)}*`),
    ...(L.byMethod.Transferencia > 0
      ? [`   - · Transferencia (dato anterior): *${money(L.byMethod.Transferencia)}*`]
      : []),
    `   - Transferencias: *${money(L.totalTransfer || 0)}*`,
    ...(L.totalNoMethod > 0 ? [`   - Sin método registrado: *${money(L.totalNoMethod)}*`] : []),
    `• Proyectado: *${money(m.projected)}*`,
    '',
    `💸 ${grupos ? '*Gastos (por categoría)*' : '*Gastos*'}`,
  ]
  // Gastos: si son pocos, un renglón por gasto; si son muchos, un
  // renglón por CATEGORÍA de mayor a menor con el conteo («Gasolina:
  // $150.000 (5)»), que además no se corta: el número de categorías es
  // chico. El tope solo aplica a esa vista agrupada, y el total de
  // abajo SIEMPRE suma todos los gastos del período.
  if (!grupos) {
    L.outs.forEach(r => lines.push(`   - ${expenseLabel(r)}: *${money(r.amount)}*`))
  } else {
    grupos.slice(0, MAX_REPORT_EXPENSES).forEach(c =>
      lines.push(`   - ${c.cat}: *${money(c.amount)}* (${c.count})`))
    if (grupos.length > MAX_REPORT_EXPENSES)
      lines.push(`   … y ${grupos.length - MAX_REPORT_EXPENSES} categoría(s) más`)
  }
  lines.push(`• Total gastos: *${money(L.totalExpenses)}*`)
  lines.push('')
  lines.push(`💳 *Neto*: *${money(m.neto)}*`)
  if (m.domicilios > 0) lines.push('', `🛵 *Domicilios*: ${m.domicilios} citas · ${money(m.domRevenue)}`)
  const top = (topByDemand || []).slice(0, 3)
  if (top.length > 0) {
    lines.push('', `✨ *Top servicios*`)
    top.forEach((s, i) => lines.push(`${['1.', '2.', '3.'][i]} ${s.name} — ${s.count}x (${money(Math.round(s.revenue))})`))
  }
  lines.push('', `_Generado ${stamp}_`)
  return lines
}

// Renglones de detalle de gastos que caben en el mensaje (ver arriba).
export const MAX_REPORT_EXPENSES = 20

/**
 * Umbral del reporte: con 8 gastos o menos se lee mejor el detalle uno
 * por uno; con más, una línea por CATEGORÍA («Gasolina: $150.000 (5)»),
 * que además casi nunca llega a tocar el límite de MAX_REPORT_EXPENSES.
 */
export const REPORT_EXPENSE_DETAIL_MAX = 8

/**
 * Gastos agrupados por categoría, de mayor a menor monto, con su conteo.
 *
 * `Sin categoría` reúne los que no traen categoría: nunca se pierden.
 * Los empates se desempatan por nombre con comparación simple (NO
 * localeCompare, que puede variar entre entornos y rompería la paridad
 * con el correo en Code.gs).
 */
export const groupExpensesByCategory = outs => {
  const mapa = new Map()
  outs.forEach(r => {
    const cat = String(r.who || '').trim() || 'Sin categoría'
    const g = mapa.get(cat) || { cat, amount: 0, count: 0 }
    g.amount += toN(r.amount)
    g.count += 1
    mapa.set(cat, g)
  })
  return [...mapa.values()].sort((a, b) =>
    b.amount - a.amount || (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : 0))
}

// Nombre de un gasto para el reporte: «Categoría — Descripción», sin
// repetir si las dos son iguales y sin dejarlo vacío.
export const expenseLabel = r =>
  [r.who, r.detail].filter((s, i, a) => s && a.indexOf(s) === i).join(' — ') || 'Gasto'

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

/* ── Restablecimiento: comprobación contra el servidor ────────────
   El transporte NO es una prueba: el POST del reset puede perderse
   por el camino DESPUÉS de que el servidor lo ejecutara (pasó en
   producción: la app mostró "Load failed" y la hoja ya estaba vacía).
   Antes de decirle a la dueña que falló, se lee la hoja y se compara
   el resultado con lo que se pidió borrar:
     · clientes, citas y gastos vacíos, y
     · el catálogo otra vez en los servicios por defecto
       (nombre + precio; los IDs se regeneran en cada sesión, por eso
       NO se comparan).
   `false` no prueba que el reset fallara — podría ser una cuenta ya
   vacía con servicios a medida — por eso quien lo llama lo usa como
   sospecha, no como veredicto.                                     */
export const isResetOutcome = (data, defaults) => {
  if (!data || typeof data !== 'object') return false
  const vacio = k => Array.isArray(data[k]) && data[k].length === 0
  if (!vacio('clients') || !vacio('appointments') || !vacio('expenses')) return false

  const svc  = Array.isArray(data.services) ? data.services : []
  const def  = Array.isArray(defaults) ? defaults : []
  if (svc.length !== def.length || def.length === 0) return false
  const clave = s => `${String((s && s.name) || '')}|${toN((s && s.price) || 0)}`
  const reales = new Set(svc.map(clave))
  return def.every(d => reales.has(clave(d)))
}

/* ── Desglose de precios para los mensajes ──────────────────────
   El domicilio viene SUMADO dentro del total de la cita (totalPrice =
   servicePrice + domicilioPrice). Para mostrarlo por aparte se resta,
   acotando el domicilio al total: así la suma servicios + domicilio
   siempre cuadra con el total y los servicios no pueden quedar en
   negativo aunque los datos vengan incompletos (citas antiguas sin
   totalPrice, o un domicilio mayor que el total).               */
export const domBreakdown = (total, isDom, domPrice = 0) => {
  const tot  = Math.max(0, toN(total || 0))
  const fee  = bool(isDom) ? Math.max(0, Math.min(toN(domPrice || 0), tot)) : 0
  return { services: Math.max(0, tot - fee), delivery: fee, total: tot }
}
