import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toN, bool, cleanDate, cleanTime, getSlots, TIME_SLOTS, phoneMatch, checkSlot, apptStatus, canModifyAppt, canRemindAppt, confirmOutcome, projectedIncome, movsRanges, serviceDeletionCheck, apptLife, apptServiceIds, apptServiceRefs, topServicesByDemand, apptGroup, reportMetrics, periodLedger, isResetOutcome, domBreakdown, reportLines, expenseLabel,
MAX_REPORT_EXPENSES, REPORT_EXPENSE_DETAIL_MAX, groupExpensesByCategory, clientNoShowStats, NOSHOW_WINDOW, PAYMENT_METHODS, payMethodOf } from './helpers.js'

// phoneMatch/getSlots depend on todayStr() (local today). Freeze the clock
// so the tests are deterministic.
const FROZEN = new Date(2026, 0, 15, 13, 0, 0) // 2026-01-15 13:00 local
let realDate

beforeAll(() => {
  realDate = global.Date
  function MockDate(...args) {
    if (args.length === 0) return new realDate(FROZEN)
    return new realDate(...args)
  }
  MockDate.now = () => realDate.now()
  global.Date = MockDate
})

afterAll(() => {
  global.Date = realDate
})

/* -- toN ---------------------------------------------------------- */
describe('toN', () => {
  it('parses plain numbers', () => {
    expect(toN(35000)).toBe(35000)
    expect(toN('35000')).toBe(35000)
  })
  it('strips currency symbols but NOT thousands dots (regex keeps ".")', () => {
    // toN keeps '.' as decimal, so '$35.000' parses as 35.0 -> 35 (by design).
    // Documented behaviour: not a thousands-separator-aware parser.
    expect(toN('$35.000')).toBe(35)
    expect(toN('$ 1000')).toBe(1000)
  })
  it('returns 0 for garbage', () => {
    expect(toN('abc')).toBe(0)
    expect(toN(null)).toBe(0)
    expect(toN(undefined)).toBe(0)
    expect(toN(NaN)).toBe(0)
  })
  it('preserves negative numbers', () => {
    expect(toN('-5000')).toBe(-5000)
  })
})

/* -- cleanDate ---------------------------------------------------- */
describe('cleanDate', () => {
  it('passthrough YYYY-MM-DD', () => {
    expect(cleanDate('2026-08-04')).toBe('2026-08-04')
  })
  it('normalizes a Date to YYYY-MM-DD', () => {
    expect(cleanDate(new Date(2026, 0, 15))).toBe('2026-01-15')
  })
  it('returns empty string for empty/invalid input', () => {
    expect(cleanDate('')).toBe('')
    expect(cleanDate(null)).toBe('')
    expect(cleanDate('no-fecha')).toBe('')
  })
  it('trims surrounding whitespace', () => {
    expect(cleanDate('  2026-08-04  ')).toBe('2026-08-04')
  })
})

/* -- cleanTime ---------------------------------------------------- */
describe('cleanTime', () => {
  it('normalizes HH:MM (zero-pads hour)', () => {
    expect(cleanTime('08:30')).toBe('08:30')
    expect(cleanTime('8:30')).toBe('08:30')
  })
  it('rejects invalid formats', () => {
    expect(cleanTime('')).toBe('')
    expect(cleanTime('nope')).toBe('')
    expect(cleanTime(null)).toBe('')
  })
  it('keeps only the leading HH:MM', () => {
    expect(cleanTime('10:00:00')).toBe('10:00')
  })
})

/* -- getSlots ----------------------------------------------------- */
describe('getSlots', () => {
  it('returns one slot per TIME_SLOTS entry on a free day', () => {
    const slots = getSlots('2026-01-20', [], [])
    expect(slots.length).toBe(TIME_SLOTS.length)
    // Dato nuevo: con la duración por defecto de 60 min, el último horario
    // (20:30) terminaría a las 21:30, así que es el único bloqueado en un
    // día libre. Con 30 min sí cabe (ver "getSlots — cierre 21:00").
    expect(slots.filter((s) => s.disabled).map((s) => s.time)).toEqual(['20:30'])
    expect(getSlots('2026-01-20', [], [], null, 30).every((s) => s.disabled === false)).toBe(true)
  })

  it('marks slots that overlap an existing 60-min appointment', () => {
    // Appt at 10:00 occupies [600, 660) => covers 10:00..10:59. Slots that
    // produce a 60-min appointment overlapping [600,660) are disabled.
    //   09:30 -> [570, 630) overlaps -> disabled
    //   10:00 -> [600, 660) overlaps -> disabled
    //   10:30 -> [630, 690) overlaps -> disabled (cita previa llega hasta 11:00)
    //   11:00 -> [660, 720) no overlap -> enabled
    const appts = [{ id: 'a', date: '2026-01-20', time: '10:00' }]
    const slots = getSlots('2026-01-20', [], appts)
    const at = (t) => slots.find((s) => s.time === t)
    expect(at('09:30').disabled).toBe(true)
    expect(at('10:00').disabled).toBe(true)
    expect(at('10:30').disabled).toBe(true)
    expect(at('11:00').disabled).toBe(false)
  })

  it('respects excludeId (edited appt does not block itself)', () => {
    const appts = [{ id: 'a', date: '2026-01-20', time: '10:00' }]
    const slots = getSlots('2026-01-20', [], appts, 'a')
    const at = (t) => slots.find((s) => s.time === t)
    expect(at('10:00').disabled).toBe(false)
  })

  it('on a past date, no slot is marked as past (only overlaps apply)', () => {
    // With the clock frozen at 2026-01-15 13:00, '2026-01-14' is yesterday.
    // Único bloqueado: 20:30 con 60 min (no cabe antes del cierre de 21:00).
    const slots = getSlots('2026-01-14', [], [])
    expect(slots.filter((s) => s.disabled).map((s) => s.time)).toEqual(['20:30'])
    expect(getSlots('2026-01-14', [], [], null, 30).every((s) => s.disabled === false)).toBe(true)
  })

  it('for today, marks already-elapsed times as disabled', () => {
    const slots = getSlots('2026-01-15', [], []) // today, clock at 13:00
    const at = (t) => slots.find((s) => s.time === t)
    expect(at('12:30').disabled).toBe(true) // before 13:00
    expect(at('13:30').disabled).toBe(false) // after 13:00
  })

  it('tolerates a malformed allAppts without crashing', () => {
    const slots = getSlots('2026-01-20', [], null)
    expect(slots.length).toBe(TIME_SLOTS.length)
  })
})

/* -- phoneMatch --------------------------------------------------- */
describe('phoneMatch', () => {
  it('matches by suffix (endsWith)', () => {
    expect(phoneMatch('3001234567', '1234567')).toBe(true)
  })
  it('matches by partial substring', () => {
    expect(phoneMatch('3001234567', '0123')).toBe(true)
  })
  it('does not match when substring absent', () => {
    expect(phoneMatch('3001234567', '9999')).toBe(false)
  })
  it('empty query never matches', () => {
    expect(phoneMatch('3001234567', '')).toBe(false)
  })
  it('strips non-digits from both sides', () => {
    expect(phoneMatch('300-123-4567', '  1234567')).toBe(true)
  })
})

/* -- getSlots · cierre a las 21:00 (último horario) --------------- */
describe('getSlots — cierre 21:00', () => {
  const day = '2026-01-20'
  const at = (t, dur) => getSlots(day, [], [], null, dur).find(s => s.time === t)

  it('el último horario disponible es 20:30', () => {
    expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toBe('20:30')
    expect(TIME_SLOTS).toContain('20:00')
  })

  it('permite iniciar a las 20:30 si dura 30 min y termina exacto a las 21:00', () => {
    const s = at('20:30', 30)
    expect(s.disabled).toBe(false)
    expect(s.conflict).toBe(false)
  })

  it('bloquea las 20:30 cuando la cita termina después del cierre (60 min)', () => {
    const s = at('20:30', 60)
    expect(s.disabled).toBe(true)
    expect(s.conflict).toBe(true)
  })

  it('sigue permitiendo 20:00 con 60 min (termina 21:00 exacto)', () => {
    expect(at('20:00', 60).disabled).toBe(false)
    expect(at('20:00', 90).disabled).toBe(true) // terminaría 21:30
  })
})

/* -- checkSlot · revalidación antes de confirmar la cita ---------- */
describe('checkSlot', () => {
  const day = '2026-01-20'
  const appts = [{ id: 'a', date: day, time: '10:00', duration: 60 }]

  it('devuelve null cuando el horario sigue disponible', () => {
    expect(checkSlot(day, '11:00', appts, 60)).toBe(null)
    expect(checkSlot(day, '20:30', appts, 30)).toBe(null)
  })

  it('rechaza un solapamiento con otra cita', () => {
    expect(checkSlot(day, '10:30', appts, 60)).toMatch(/ya no están disponibles/)
    expect(checkSlot(day, '10:30', appts, 60)).toMatch(/Ocupada/)
  })

  it('rechaza las horas que terminan después del cierre', () => {
    expect(checkSlot(day, '20:30', appts, 60)).toMatch(/cierre/i)
  })

  it('rechaza las horas fuera del horario de atención', () => {
    expect(checkSlot(day, '21:30', appts, 30)).toMatch(/horario de atención/)
    expect(checkSlot(day, '06:00', appts, 30)).toMatch(/horario de atención/)
  })

  it('rechaza fechas pasadas, fechas inválidas y horas vacías', () => {
    expect(checkSlot('2026-01-10', '11:00', [], 60)).toMatch(/ya pasó/)
    expect(checkSlot('no-fecha', '11:00', [], 60)).toMatch(/no es válida/)
    expect(checkSlot(day, '', [], 60)).toMatch(/Elige una hora/)
  })

  it('rechaza duraciones inválidas', () => {
    expect(checkSlot(day, '11:00', appts, 0)).toMatch(/duración/)
  })

  it('respeta excludeId: la propia cita no se bloquea a sí misma', () => {
    expect(checkSlot(day, '10:00', appts, 60, 'a')).toBe(null)
  })
})

/* -- apptStatus / canModifyAppt · regla de editar y eliminar ------ */
describe('apptStatus / canModifyAppt', () => {
  it('clasifica la cita como done / noshow / pending', () => {
    expect(apptStatus({ completed: true })).toBe('done')
    expect(apptStatus({ completed: 'true' })).toBe('done')
    expect(apptStatus({ completed: 'noshow' })).toBe('noshow')
    expect(apptStatus({ completed: false })).toBe('pending')
    expect(apptStatus({})).toBe('pending')
    expect(apptStatus(null)).toBe('pending')
  })

  it('solo las citas pendientes admiten editar/eliminar (Citas y Calendario)', () => {
    expect(canModifyAppt({ completed: false })).toBe(true)
    expect(canModifyAppt({ completed: true })).toBe(false)
    expect(canModifyAppt({ completed: 'noshow' })).toBe(false)
    expect(canModifyAppt({ completed: 'true' })).toBe(false)
  })
})

/* -- clientNoShowStats · inasistencias atadas a la clienta ---------
   Lo usan el historial del cliente y el aviso del asistente al agendar.
   «Decididas» = completadas o no asistió; el aviso «frecuente» (warn)
   dispara con faltó 2+ de las últimas NOSHOW_WINDOW decididas. */
describe('clientNoShowStats', () => {
  const P = '3001112222'
  const mk = (id, completed, date, time) =>
    ({ id, clientPhone: P, completed, date, time })
  // 7 decididas: 3 no-show + 4 completadas (más reciente primero por fecha).
  const appts = [
    mk('a7', 'true',      '2026-01-07', '10:00'),
    mk('a6', 'noshow',    '2026-01-06', '10:00'),
    mk('a5', 'true',      '2026-01-05', '10:00'),
    mk('a4', 'noshow',    '2026-01-04', '10:00'),
    mk('a3', 'true',      '2026-01-03', '10:00'),
    mk('a2', 'noshow',    '2026-01-02', '10:00'),
    mk('a1', 'true',      '2026-01-01', '10:00'),
    // Pendientes y otras clientas no cuentan.
    { id: 'p1', clientPhone: P, completed: 'false', date: '2026-01-08', time: '10:00' },
    { id: 'x1', clientPhone: '3009998888', completed: 'noshow', date: '2026-01-06', time: '11:00' },
  ]

  it('cuenta solo las inasistencias de ESA clienta (por dígitos del celular)', () => {
    const s = clientNoShowStats(appts, P)
    expect(s.noshow).toBe(3)
    expect(s.total).toBe(8)      // 7 decididas + 1 pendiente
    expect(s.decided).toBe(7)
  })

  it('«recent» trae las últimas NOSHOW_WINDOW decididas, más nueva primero', () => {
    const s = clientNoShowStats(appts, P)
    expect(s.recent.length).toBe(NOSHOW_WINDOW)
    expect(s.recent[0].id).toBe('a7')
    expect(s.recent[NOSHOW_WINDOW - 1].id).toBe('a1')
  })

  it('warn = faltó 2+ de las últimas decididas (umbral del aviso al agendar)', () => {
    expect(clientNoShowStats(appts, P).warn).toBe(true)
    // Solo 1 falta reciente → aviso informativo, sin «frecuente».
    const una = [mk('b2', 'noshow', '2026-01-02', '10:00'), mk('b1', 'true', '2026-01-01', '10:00')]
    expect(clientNoShowStats(una, P).warn).toBe(false)
    expect(clientNoShowStats(una, P).windowNoshow).toBe(1)
  })

  it('sin celular o sin citas devuelve todo en cero (nunca revienta)', () => {
    expect(clientNoShowStats(appts, '')).toEqual(
      { total: 0, noshow: 0, decided: 0, recent: [], windowNoshow: 0, warn: false })
    expect(clientNoShowStats(null, P).noshow).toBe(0)
    expect(clientNoShowStats([], P).warn).toBe(false)
  })
})

/* -- confirmOutcome · decisión de NewWizard.confirm() --------------
   Regresión del asistente: cuando la hora revalidada ya no está
   disponible hay que limpiar `time` antes de volver al paso 4, para que
   la interfaz no ofrezca una hora inválida. No renderizamos React
   (no hay @testing-library/react), así que probamos la lógica pura
   que decide esa acción. */
describe('confirmOutcome', () => {
  const day = '2026-01-20'
  const appts = [{ id: 'a', date: day, time: '10:00', duration: 60 }]

  it('hora todavía disponible → no limpia ni bloquea', () => {
    const slotProblem = checkSlot(day, '11:00', appts, 60)
    const out = confirmOutcome(slotProblem, slotProblem)
    expect(out.ok).toBe(true)
    expect(out.message).toBe(null)
    expect(out.clearTime).toBe(false)
  })

  it('hora ya ocupada → rechaza y pide limpiar la hora (regresión)', () => {
    const slotProblem = checkSlot(day, '10:30', appts, 60)
    expect(slotProblem).not.toBe(null)
    const out = confirmOutcome(slotProblem, slotProblem)
    expect(out.ok).toBe(false)
    expect(out.message).toBe(slotProblem)
    expect(out.clearTime).toBe(true) // la hora elegida ya no sirve
  })

  it('fallo sin conflicto de horario (p.ej. sin clienta) → no limpia la hora', () => {
    const out = confirmOutcome('Selecciona la clienta.', null)
    expect(out.ok).toBe(false)
    expect(out.message).toBe('Selecciona la clienta.')
    expect(out.clearTime).toBe(false) // la hora sigue válida: no se borra
  })
})

/* -- projectedIncome · «Proyectado» unificado ----------------------
   Regresión: Panel, Finanzas y Reporte deben usar el mismo criterio,
   excluyendo 'noshow'. */
describe('projectedIncome', () => {
  const base = [
    { id: 'p1', completed: false,        totalPrice: 50000 },  // pendiente
    { id: 'd1', completed: true,         totalPrice: 30000 },  // completada
    { id: 'n1', completed: 'noshow',     totalPrice: 40000 },  // no asistió
  ]

  it('suma pendientes y completadas, excluye noshow', () => {
    expect(projectedIncome(base)).toBe(80000)
  })

  it('no cambia cuando cambia el orden ni con duplicados', () => {
    expect(projectedIncome([base[2], base[0], base[1]])).toBe(80000)
  })

  it('el criterio coincide con el de Reporte (sin noshow)', () => {
    // Réplica del filtro que usa Reporte: pendientes + completadas.
    const enReporte = base
      .filter(a => a.completed !== 'noshow')
      .reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0)
    expect(projectedIncome(base)).toBe(enReporte)
  })

  it('sin noshow, proyectado = recibido + pendiente', () => {
    const done = base.filter(a => bool(a.completed) && a.completed !== 'noshow')
      .reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0)
    const pend = base.filter(a => !bool(a.completed) && a.completed !== 'noshow')
      .reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0)
    expect(projectedIncome(base)).toBe(done + pend)
  })

  it('solo noshow → 0; lista vacía o inválida → 0', () => {
    expect(projectedIncome([{ completed: 'noshow', totalPrice: 90000 }])).toBe(0)
    expect(projectedIncome([])).toBe(0)
    expect(projectedIncome(null)).toBe(0)
    expect(projectedIncome(undefined)).toBe(0)
  })

  it('usa servicePrice cuando falta totalPrice', () => {
    expect(projectedIncome([{ completed: false, servicePrice: 25000 }])).toBe(25000)
  })
})

/* -- movsRanges · rangos de la hoja Movimientos del Excel ----------
   Regresión: sin filas no debe generarse ningún rango (evita
   fórmulas invertidas como SUM(F2:F1)). */
describe('movsRanges', () => {
  it('0 filas → null (no se genera fórmula con rango invertido)', () => {
    expect(movsRanges(0)).toBe(null)
    expect(movsRanges('')).toBe(null)
  })

  it('1 fila → SUM va de la fila 2 a la 2', () => {
    expect(movsRanges(1)).toEqual({ first: 2, last: 2, tRow: 4 })
  })

  it('varias filas: datos 2..n+1 y totales en n+3', () => {
    expect(movsRanges(5)).toEqual({ first: 2, last: 6, tRow: 8 })
  })

  it('el rango de SUM nunca queda invertido', () => {
    for (const n of [1, 2, 7, 30]) {
      const { first, last } = movsRanges(n)
      expect(first).toBeLessThanOrEqual(last)
    }
  })
})

/* -- serviceDeletionCheck · no eliminar servicios con citas vivas ---
   Reglas cubiertas (1-6 del enunciado). El reloj se inyecta para que
   las pruebas no dependan de la fecha real. */
describe('serviceDeletionCheck', () => {
  const NOW  = new Date(2026, 0, 15, 13, 0, 0)  // mié 15 ene 2026, 13:00
  const TODAY = '2026-01-15'
  const FUT  = '2026-01-20'
  const PAST = '2026-01-10'

  const S1 = { id: 's1', name: 'Diseño de cejas', price: 50000, duration: 30 }
  const S2 = { id: 's2', name: 'Lifting de pestañas', price: 130000, duration: 60 }
  const catalog = [S1, S2]

  // (1) cita futura pendiente que usa S1
  it('bloquea si hay una cita futura pendiente que usa el servicio', () => {
    const appts = [{ id: 'a1', date: FUT, time: '10:00', duration: 30,
                     completed: false, serviceIds: 's1', serviceNames: S1.name }]
    const r = serviceDeletionCheck(S1, appts, catalog, NOW)
    expect(r.ok).toBe(false)
    expect(r.count).toBe(1)
    expect(r.message).toMatch(/No se puede eliminar el servicio "Diseño de cejas"/)
    expect(r.message).toMatch(/1 cita programada/)
    expect(r.message).toMatch(/Completa o elimina esas citas/)
  })

  // (2) cita EN CURSO: hoy 13:00, cita 12:00-12:30 ya pasó → no;
  //     cita 12:30-13:30 con now 13:00 → en curso.
  it('bloquea si hay una cita en curso (usa hora + duración, no solo la fecha)', () => {
    const enCurso = { id: 'a2', date: TODAY, time: '12:30', duration: 60,
                      completed: false, serviceIds: 's1', serviceNames: S1.name }
    const terminada = { id: 'a3', date: TODAY, time: '12:00', duration: 30,
                        completed: false, serviceIds: 's1', serviceNames: S1.name }
    expect(serviceDeletionCheck(S1, [enCurso], catalog, NOW).ok).toBe(false)
    // La de las 12:00-12:30 ya terminó → histórica, no bloquea.
    expect(serviceDeletionCheck(S1, [terminada], catalog, NOW).ok).toBe(true)
  })

  it('una cita hoy PERO aún no iniciada también bloquea (es futura)', () => {
    const poster = { id: 'a4', date: TODAY, time: '15:00', duration: 30,
                     completed: false, serviceIds: 's1', serviceNames: S1.name }
    expect(serviceDeletionCheck(S1, [poster], catalog, NOW).ok).toBe(false)
  })

  // (3) solo citas históricas finalizadas
  it('permite eliminar si solo hay citas históricas completadas', () => {
    const appts = [
      { id: 'a5', date: PAST, time: '10:00', duration: 30, completed: true,
        serviceIds: 's1', serviceNames: S1.name },
      { id: 'a6', date: PAST, time: '11:00', duration: 30, completed: 'true',
        serviceIds: 's1', serviceNames: S1.name },
    ]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(true)
  })

  it('permite eliminar si solo hay citas pasadas nunca completadas (históricas)', () => {
    const appts = [{ id: 'a7', date: PAST, time: '10:00', duration: 30,
                     completed: false, serviceIds: 's1', serviceNames: S1.name }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(true)
  })

  // (4) El modelo actual NO tiene estado 'cancelada': las citas se borran.
  //     El estado final más cercano es 'noshow', que no bloquea.
  it('las citas finalizadas como noshow no bloquean (no hay estado cancelada)', () => {
    const appts = [{ id: 'a8', date: FUT, time: '10:00', duration: 30,
                     completed: 'noshow', serviceIds: 's1', serviceNames: S1.name }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(true)
  })

  // (5) sin citas asociadas
  it('permite eliminar un servicio sin citas asociadas', () => {
    expect(serviceDeletionCheck(S1, [], catalog, NOW).ok).toBe(true)
    expect(serviceDeletionCheck(S1, undefined, catalog, NOW).ok).toBe(true)
  })

  // (6) cita de OTRO servicio no bloquea
  it('una cita que usa otro servicio no bloquea la eliminación', () => {
    const appts = [{ id: 'a9', date: FUT, time: '10:00', duration: 60,
                     completed: false, serviceIds: 's2', serviceNames: S2.name }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(true)
  })

  it('una cita con VARIOS servicios bloquea si incluye el que se elimina', () => {
    const appts = [{ id: 'a10', date: FUT, time: '10:00', duration: 90,
                     completed: false, serviceIds: 's2,s1', serviceNames: `${S2.name}, ${S1.name}` }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(false)
  })

  it('cuenta y lista todas las citas bloqueantes', () => {
    const appts = [
      { id: 'b1', date: FUT,  time: '10:00', duration: 30, completed: false, serviceIds: 's1' },
      { id: 'b2', date: TODAY, time: '12:30', duration: 60, completed: false, serviceIds: 's1' },
      { id: 'b3', date: FUT,  time: '11:00', duration: 30, completed: true,  serviceIds: 's1' },
    ]
    const r = serviceDeletionCheck(S1, appts, catalog, NOW)
    expect(r.count).toBe(2)
    expect(r.blockers.map(a => a.id).sort()).toEqual(['b1', 'b2'])
    expect(r.message).toMatch(/2 citas/)
  })
})

/* -- serviceDeletionCheck · cómo se resuelve la relación cita ⇄ servicio */
describe('serviceDeletionCheck · relación cita ⇄ servicio', () => {
  const NOW = new Date(2026, 0, 15, 13, 0, 0)
  const S1 = { id: 's1', name: 'Diseño de cejas' }
  const catalog = [S1, { id: 's2', name: 'Lifting de pestañas' }]

  it('usa el id real de serviceIds, no el nombre', () => {
    // Misma cita con el nombre cambiado (snapshot viejo) pero el id correcto:
    const appts = [{ id: 'x1', date: '2026-01-20', time: '10:00', duration: 30,
                     completed: false, serviceIds: 's1', serviceNames: 'Nombre viejo que ya no existe' }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(false)
  })

  it('sin serviceIds, usa las claves de servicePrices como respaldo', () => {
    const appts = [{ id: 'x2', date: '2026-01-20', time: '10:00', duration: 30,
                     completed: false, serviceIds: '', serviceNames: 'Otro nombre',
                     servicePrices: '{"s1":50000}' }]
    expect(apptServiceIds(appts[0])).toEqual(['s1'])
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(false)
  })

  it('sin ningún id, recurre al nombre snapshot SOLO si es único en el catálogo', () => {
    const appts = [{ id: 'x3', date: '2026-01-20', time: '10:00', duration: 30,
                     completed: false, serviceIds: '', serviceNames: 'Diseño de cejas' }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(false)
  })

  it('nombre homónimo en el catálogo → la coincidencia es ambigua y NO bloquea', () => {
    const dup = { id: 's3', name: 'Diseño de cejas' }   // mismo nombre que S1
    const appts = [{ id: 'x4', date: '2026-01-20', time: '10:00', duration: 30,
                     completed: false, serviceIds: '', serviceNames: 'Diseño de cejas' }]
    // No se puede saber a cuál de los dos homónimos pertenece la cita.
    expect(serviceDeletionCheck(S1, appts, [...catalog, dup], NOW).ok).toBe(true)
  })

  it('compara el nombre sin importar mayúsculas ni espacios extra', () => {
    const appts = [{ id: 'x5', date: '2026-01-20', time: '10:00', duration: 30,
                     completed: false, serviceIds: '', serviceNames: '  diseño   de CEJAS ' }]
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(false)
  })

  it('una cita sin fecha ni hora no se puede evaluar y no bloquea', () => {
    const appts = [{ id: 'x6', date: '', time: '', duration: 30,
                     completed: false, serviceIds: 's1' }]
    expect(apptLife(appts[0], NOW)).toBe('unknown')
    expect(serviceDeletionCheck(S1, appts, catalog, NOW).ok).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════
   apptServiceRefs / topServicesByDemand — el NOMBRE con coma NO se parte
   ────────────────────────────────────────────────────────────
   Regresión real: «Diseño, depilación y sombreado» es UN solo servicio,
   pero se partía `serviceNames` por la coma y salían DOS entradas en el
   ranking (Servicios rentables y el Top servicios del reporte), con el
   importe de la cita repartido a medias entre ambas. La relación real
   son los IDs, y un ID no lleva comas.
   ══════════════════════════════════════════════════════════════ */
describe('apptServiceRefs — se resuelve por ID, no partiendo el nombre', () => {
  const CATALOGO = [
    { id: 's1', name: 'Diseño de cejas', price: '350000' },
    { id: 's3', name: 'Diseño, depilación y sombreado', price: '60000' },
  ]

  it('un nombre con coma es UN servicio: no se parte', () => {
    const a = { serviceIds: 's3', serviceNames: 'Diseño, depilación y sombreado' }
    expect(apptServiceRefs(a, CATALOGO)).toEqual([
      { id: 's3', name: 'Diseño, depilación y sombreado' },
    ])
  })

  it('el catálogo vacío (o sin cargar) tampoco parte el nombre', () => {
    const a = { serviceIds: 's3', serviceNames: 'Diseño, depilación y sombreado' }
    expect(apptServiceRefs(a, [])).toEqual([
      { id: 's3', name: 'Diseño, depilación y sombreado' },
    ])
    expect(apptServiceRefs(a, null)).toEqual([
      { id: 's3', name: 'Diseño, depilación y sombreado' },
    ])
  })

  it('dos servicios de la cita van cada uno con su id y su nombre', () => {
    const a = { serviceIds: 's1,s3',
                serviceNames: 'Diseño de cejas, Diseño, depilación y sombreado' }
    expect(apptServiceRefs(a, CATALOGO)).toEqual([
      { id: 's1', name: 'Diseño de cejas' },
      { id: 's3', name: 'Diseño, depilación y sombreado' },
    ])
  })

  it('servicio ya eliminado: cae al nombre snapshot de la MISMA posición', () => {
    const a = { serviceIds: 's1,sX', serviceNames: 'Diseño de cejas, Cejas full' }
    expect(apptServiceRefs(a, CATALOGO)).toEqual([
      { id: 's1', name: 'Diseño de cejas' },
      { id: 'sX', name: 'Cejas full' },
    ])
  })

  it('sin ids: usa el nombre ENTERO si está en el catálogo', () => {
    const a = { serviceIds: '', serviceNames: 'Diseño, depilación y sombreado' }
    expect(apptServiceRefs(a, CATALOGO)).toEqual([
      { id: 's3', name: 'Diseño, depilación y sombreado' },
    ])
  })

  it('sin ids y sin coincidencia: último recurso, partido por comas', () => {
    const a = { serviceIds: '', serviceNames: 'Depilación de pierna, Cejas' }
    expect(apptServiceRefs(a, CATALOGO)).toEqual([
      { id: '', name: 'Depilación de pierna' },
      { id: '', name: 'Cejas' },
    ])
  })

  it('una cita sin nada no aporta servicios', () => {
    expect(apptServiceRefs({}, CATALOGO)).toEqual([])
    expect(apptServiceRefs(null, CATALOGO)).toEqual([])
  })
})

describe('topServicesByDemand — el ranking no inventa servicios', () => {
  const CATALOGO = [
    { id: 's1', name: 'Diseño de cejas', price: '350000' },
    { id: 's3', name: 'Diseño, depilación y sombreado', price: '60000' },
  ]

  it('un servicio con coma es UNA entrada, no dos', () => {
    const a = { completed: 'true', serviceIds: 's3',
                serviceNames: 'Diseño, depilación y sombreado', servicePrice: '60000' }
    const top = topServicesByDemand([a], CATALOGO)
    expect(top).toHaveLength(1)
    expect(top[0]).toEqual({ name: 'Diseño, depilación y sombreado', count: 1, revenue: 60000 })
  })

  it('dos citas con el mismo servicio con coma acumulan, no se duplican', () => {
    const mk = () => ({ completed: 'true', serviceIds: 's3',
                        serviceNames: 'Diseño, depilación y sombreado', servicePrice: '60000' })
    expect(topServicesByDemand([mk(), mk()], CATALOGO))
      .toEqual([{ name: 'Diseño, depilación y sombreado', count: 2, revenue: 120000 }])
  })

  it('reparte la cita por igual entre sus servicios', () => {
    const a = { completed: 'true', serviceIds: 's1,s3',
                serviceNames: 'Diseño de cejas, Diseño, depilación y sombreado',
                servicePrice: '410000' }
    const top = topServicesByDemand([a], CATALOGO)
    expect(top).toHaveLength(2)
    expect(top.map(t => t.revenue)).toEqual([205000, 205000])
  })

  it('cuenta solo las completadas (ni pendientes ni no-show)', () => {
    const base = { serviceIds: 's1', serviceNames: 'Diseño de cejas', servicePrice: '350000' }
    expect(topServicesByDemand([
      { ...base, completed: 'true' },
      { ...base, completed: 'false' },
      { ...base, completed: 'noshow' },
    ], CATALOGO)).toEqual([{ name: 'Diseño de cejas', count: 1, revenue: 350000 }])
  })

  it('ordena por número de citas y se queda con el top 3', () => {
    const a = id => ({ completed: 'true', serviceIds: id, serviceNames: 'x', servicePrice: '10000' })
    const top = topServicesByDemand([a('s3'), a('s3'), a('s1'), a('s1'), a('s1'), a('s9')], CATALOGO)
    expect(top.map(t => [t.name, t.count])).toEqual([
      ['Diseño de cejas', 3],
      ['Diseño, depilación y sombreado', 2],
      ['x', 1],           // s9 no está en el catálogo → queda el snapshot
    ])
  })

  it('entradas vacías no revientan', () => {
    expect(topServicesByDemand([], CATALOGO)).toEqual([])
    expect(topServicesByDemand(null, CATALOGO)).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════
   CARACTERES PROBLEMÁTICOS EN EL NOMBRE — `,` `-` `%`
   ────────────────────────────────────────────────────────────
   Petición del dueño: los nombres reales pueden traer coma, guion
   o porcentaje —«Extensiones de pestañas 30%», «Diseño-Depilación
   de pestañas», «Diseño, depilación de pestañas»— y ninguno de
   esos tres puede partir el servicio en dos.

   Por qué se cumplen (auditoría del código):
     · `-` y `%` NUNCA fueron separadores. Se parte por `,` en
       nombres, y además por `:` en horas y `-` en fechas, que son
       campos distintos. El `%` del enlace de WhatsApp lo protege
       `encodeURIComponent` (openWhatsApp), y los títulos de
       Calendar y los reportes concatenan sin parsear.
     · `,` es el ÚNICO separador del nombre, y actúa solo en el
       último recurso del helper: citas sin ningún id.
   Estos tests son la garantía: si alguien vuelve a partir el
   nombre a mano, fallan aquí.
   ══════════════════════════════════════════════════════════════ */
describe('nombres con , - % — ninguno parte el servicio', () => {
  const CAT = [
    { id: 'sA', name: 'Extensiones de pestañas 30%',    price: '90000' },
    { id: 'sB', name: 'Diseño-Depilación de pestañas',  price: '70000' },
    { id: 'sC', name: 'Diseño, depilación de pestañas', price: '80000' },
    { id: 'sD', name: 'Cejas',                          price: '20000' },
  ]

  it('%: el porcentaje se queda DENTRO del nombre', () => {
    const a = { serviceIds: 'sA', serviceNames: 'Extensiones de pestañas 30%' }
    expect(apptServiceRefs(a, CAT)).toEqual([
      { id: 'sA', name: 'Extensiones de pestañas 30%' },
    ])
  })

  it('-: el guion se queda DENTRO del nombre', () => {
    const a = { serviceIds: 'sB', serviceNames: 'Diseño-Depilación de pestañas' }
    expect(apptServiceRefs(a, CAT)).toEqual([
      { id: 'sB', name: 'Diseño-Depilación de pestañas' },
    ])
  })

  it('los tres mezclados en UNA cita de dos servicios', () => {
    const a = { serviceIds: 'sA,sC',
                serviceNames: 'Extensiones de pestañas 30%, Diseño, depilación de pestañas' }
    expect(apptServiceRefs(a, CAT)).toEqual([
      { id: 'sA', name: 'Extensiones de pestañas 30%' },
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
    ])
  })

  it('catálogo sin cargar tampoco parte ninguno', () => {
    const a = { serviceIds: 'sC', serviceNames: 'Diseño, depilación de pestañas' }
    expect(apptServiceRefs(a, [])).toEqual([
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
    ])
  })

  it('sin ids: el nombre ENTERO se reconoce en el catálogo', () => {
    const sinIds = n => ({ serviceIds: '', serviceNames: n })
    expect(apptServiceRefs(sinIds('Diseño, depilación de pestañas'), CAT))
      .toEqual([{ id: 'sC', name: 'Diseño, depilación de pestañas' }])
    expect(apptServiceRefs(sinIds('Diseño-Depilación de pestañas'), CAT))
      .toEqual([{ id: 'sB', name: 'Diseño-Depilación de pestañas' }])
    expect(apptServiceRefs(sinIds('Extensiones de pestañas 30%'), CAT))
      .toEqual([{ id: 'sA', name: 'Extensiones de pestañas 30%' }])
  })

  it('el ranking cuenta UNA vez cada uno de los tres', () => {
    const mk = (id, name, price) =>
      ({ completed: 'true', serviceIds: id, serviceNames: name, servicePrice: price })
    const top = topServicesByDemand([
      mk('sA', 'Extensiones de pestañas 30%',    '90000'),
      mk('sB', 'Diseño-Depilación de pestañas',  '70000'),
      mk('sC', 'Diseño, depilación de pestañas', '80000'),
    ], CAT)
    expect(top).toHaveLength(3)
    // Orden por código: coma (U+002C) antes que guion (U+002D), y D antes que E.
    expect(top.map(t => t.name).sort()).toEqual([
      'Diseño, depilación de pestañas',
      'Diseño-Depilación de pestañas',
      'Extensiones de pestañas 30%',
    ])
    expect(top.every(t => t.count === 1)).toBe(true)
  })

  it('dos citas de «…30%» acumulan en UNA entrada, sin duplicar', () => {
    const mk = () => ({ completed: 'true', serviceIds: 'sA',
                        serviceNames: 'Extensiones de pestañas 30%', servicePrice: '90000' })
    expect(topServicesByDemand([mk(), mk()], CAT))
      .toEqual([{ name: 'Extensiones de pestañas 30%', count: 2, revenue: 180000 }])
  })
})

/* ══════════════════════════════════════════════════════════════
   SNAPSHOT CON ANCLAS — el servicio BORRADO recupera su nombre
   ────────────────────────────────────────────────────────────
   `serviceNames` guarda los nombres en el MISMO orden que
   `serviceIds`, separados por «, ». Mientras todos sigan en el
   catálogo el nombre sale de él y no hay ningún parseo. El problema
   aparece cuando ALGUNO ya se borró y algún nombre lleva coma:
   partir el snapshot daba trozos, las posiciones se desplazaban y
   el servicio borrado se quedaba con un pedazo («Diseño» en vez de
   «Diseño, depilación de pestañas»).

   La solución son ANCLAS: los nombres que sí se conocen marcan por
   dónde corta el texto, y el perdido ocupa desde el final del
   anterior hasta el inicio del siguiente.
   ══════════════════════════════════════════════════════════════ */
describe('apptServiceRefs — el servicio borrado recupera su nombre completo', () => {
  const CEJAS     = { id: 's1', name: 'Cejas' }
  const CEJASFULL = { id: 's2', name: 'Cejas full' }
  const COMA      = { id: 'sC', name: 'Diseño, depilación de pestañas' }

  it('el borrado va el PRIMERO y su nombre lleva coma', () => {
    const a = { serviceIds: 'sC,s1',
                serviceNames: 'Diseño, depilación de pestañas, Cejas' }
    expect(apptServiceRefs(a, [CEJAS])).toEqual([
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
      { id: 's1', name: 'Cejas' },
    ])
  })

  it('el borrado va el ÚLTIMO y su nombre lleva coma', () => {
    const a = { serviceIds: 's1,sC',
                serviceNames: 'Cejas, Diseño, depilación de pestañas' }
    expect(apptServiceRefs(a, [CEJAS])).toEqual([
      { id: 's1', name: 'Cejas' },
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
    ])
  })

  it('el borrado va en MEDIO, entre dos anclas', () => {
    const a = { serviceIds: 's1,sC,s2',
                serviceNames: 'Cejas, Diseño, depilación de pestañas, Cejas full' }
    expect(apptServiceRefs(a, [CEJAS, CEJASFULL])).toEqual([
      { id: 's1', name: 'Cejas' },
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
      { id: 's2', name: 'Cejas full' },
    ])
  })

  it('una ancla que es PREFIJO de otra no engaña al recortar', () => {
    // «Cejas» aparece DENTRO de «Cejas full». Buscando por simple subcadena
    // el borrado se quedaba sin nombre; hay que cortar solo en límites.
    const a = { serviceIds: 's2,s1', serviceNames: 'Cejas full, Cejas' }
    expect(apptServiceRefs(a, [CEJAS])).toEqual([
      { id: 's2', name: 'Cejas full' },
      { id: 's1', name: 'Cejas' },
    ])
  })

  it('todos siguen en catálogo: no se toca el snapshot para nada', () => {
    const a = { serviceIds: 'sC,s1',
                serviceNames: 'Diseño, depilación de pestañas, Cejas' }
    expect(apptServiceRefs(a, [CEJAS, CEJASFULL, COMA])).toEqual([
      { id: 'sC', name: 'Diseño, depilación de pestañas' },
      { id: 's1', name: 'Cejas' },
    ])
  })

  it('sin NINGUNA ancla no se inventa nada: se cae al respaldo posicional', () => {
    // Ningún id resuelve, así que no hay por dónde cortar. Se conserva el
    // comportamiento anterior y queda documentado su límite.
    const a = { serviceIds: 'sX,sY', serviceNames: 'Cejas, Diseño, depilación de pestañas' }
    expect(apptServiceRefs(a, [])).toEqual([
      { id: 'sX', name: 'Cejas' },
      { id: 'sY', name: 'Diseño' },
    ])
  })
})

/* ══════════════════════════════════════════════════════════════
   ELIMINAR UN SERVICIO — el historial NO se pierde
   ────────────────────────────────────────────────────────────
   Escenario real del dueño: una promoción temporal («Extensiones
   de pestañas 30%»), una cita completada y cobrada con ese
   servicio, y una semana después el servicio se borra del catálogo.

   Lo que se comprueba aquí:
     · borrar NO lo bloquean las citas pasadas o completadas (solo
       las futuras y las en curso);
     · la cita NO se cascadea: conserva id, nombre y precios;
     · la vista y el ranking siguen mostrando el nombre COMPLETO,
       con su coma o su porcentaje, porque sale del snapshot entero
       y no de partir el texto.
   ══════════════════════════════════════════════════════════════ */
describe('eliminar un servicio con citas pasadas — el historial se conserva', () => {
  const NOW = new Date(2026, 6, 15, 13, 0, 0)   // 15 jul 2026
  const PROMO = { id: 'sA', name: 'Extensiones de pestañas 30%', price: '90000' }
  const CATALOGO = [PROMO, { id: 'sD', name: 'Cejas', price: '20000' }]

  // La cita de la promoción: completada y cobrada una semana antes.
  const cita = {
    id: 'a1', date: '2026-07-08', time: '10:00', duration: 60,
    completed: 'true', serviceIds: 'sA',
    serviceNames: 'Extensiones de pestañas 30%',
    servicePrices: '{"sA":90000}', servicePrice: '90000', totalPrice: '90000',
  }

  it('borrar la promoción NO lo bloquea: esa cita ya pasó', () => {
    const r = serviceDeletionCheck(PROMO, [cita], CATALOGO, NOW)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    expect(r.blockers).toEqual([])
  })

  it('pero sí bloquean las citas FUTURAS que la usen', () => {
    const futura = { ...cita, id: 'a2', date: '2026-07-20', completed: 'false' }
    const r = serviceDeletionCheck(PROMO, [futura], CATALOGO, NOW)
    expect(r.ok).toBe(false)
    expect(r.count).toBe(1)
    expect(r.blockers.map(a => a.id)).toEqual(['a2'])
  })

  it('la cita conserva id, nombre y dinero tras borrar el servicio', () => {
    const SIN_PROMO = CATALOGO.filter(s => s.id !== 'sA')   // catálogo ya sin ella
    // El nombre sale del snapshot ENTERO: no se parte por la coma del «30%».
    expect(apptServiceRefs(cita, SIN_PROMO)).toEqual([
      { id: 'sA', name: 'Extensiones de pestañas 30%' },
    ])
    // El dinero vive en la cita, no en el catálogo.
    expect(toN(cita.totalPrice)).toBe(90000)
    expect(toN(cita.servicePrice)).toBe(90000)
  })

  it('el ranking del reporte la sigue contando con su nombre completo', () => {
    const SIN_PROMO = CATALOGO.filter(s => s.id !== 'sA')
    expect(topServicesByDemand([cita], SIN_PROMO)).toEqual([
      { name: 'Extensiones de pestañas 30%', count: 1, revenue: 90000 },
    ])
  })

  it('mismo escenario con un nombre con coma: sigue sin partirse', () => {
    const promo2 = { id: 'sB', name: 'Diseño, depilación de pestañas', price: '80000' }
    const c2 = { ...cita, id: 'a3', serviceIds: 'sB',
                 serviceNames: 'Diseño, depilación de pestañas',
                 servicePrices: '{"sB":80000}', servicePrice: '80000', totalPrice: '80000' }
    expect(serviceDeletionCheck(promo2, [c2], [promo2], NOW).ok).toBe(true)
    expect(apptServiceRefs(c2, [])).toEqual([
      { id: 'sB', name: 'Diseño, depilación de pestañas' },
    ])
  })
})

/* ══════════════════════════════════════════════════════════════
   ELIMINAR UN CLIENTE — no descuadra las cuentas
   ────────────────────────────────────────────────────────────
   Borrar un cliente NO borra sus citas: ni la app ni el backend
   cascadean (el test de backend lo comprueba sobre el Code.gs real).

   Y las cifras no pueden moverse, porque las funciones de dinero NO
   reciben la lista de clientes. `periodLedger` —«FUENTE ÚNICA del
   neto», de la que dependen Finanzas, el reporte y el Excel— solo
   recibe (appts, expenses, from, to). El nombre del cliente es
   presentación: sale de la propia cita y, si fuese vacío, el
   importe sigue contando igual.
   ══════════════════════════════════════════════════════════════ */
describe('las cifras no dependen de la lista de clientes', () => {
  const D = '2026-07-08'
  const CITA = {
    id: 'a1', date: D, time: '10:00', completed: 'true', clientName: 'Ana',
    serviceIds: 'sA', serviceNames: 'Extensiones de pestañas 30%',
    servicePrice: '90000', totalPrice: '90000',
  }
  const GASTO = { id: 'g1', date: D, category: 'Cera', description: 'Cera', amount: '30000' }

  it('el neto sale solo de citas y gastos: no existe parámetro de clientes', () => {
    const l = periodLedger([CITA], [GASTO], D, D)
    expect(l.totalIncome).toBe(90000)
    expect(l.totalExpenses).toBe(30000)
    expect(l.neto).toBe(60000)
    // No hay por dónde colarse: la firma es (appts, expenses, from, to).
    expect(periodLedger.length).toBe(4)
  })

  it('el nombre del cliente es presentación: sin él, el dinero sigue', () => {
    const l = periodLedger([{ ...CITA, clientName: '' }], [], D, D)
    expect(l.incomes[0].who).toBe('')     // la fila sale con «who» vacío
    expect(l.totalIncome).toBe(90000)     // …pero el importe NO cambia
    expect(l.neto).toBe(90000)
  })

  it('el ranking de servicios tampoco mira clientes', () => {
    const top = topServicesByDemand([{ ...CITA, clientName: '' }],
      [{ id: 'sA', name: 'Extensiones de pestañas 30%', price: '90000' }])
    expect(top).toEqual([{ name: 'Extensiones de pestañas 30%', count: 1, revenue: 90000 }])
  })
})

/* -- apptLife · clasificación por fecha + hora + duración + estado --- */
describe('apptLife', () => {
  const NOW = new Date(2026, 0, 15, 13, 0, 0)
  it('clasifica done / live / future / past / unknown', () => {
    expect(apptLife({ date: '2026-01-20', time: '10:00', duration: 30, completed: true }, NOW)).toBe('done')
    expect(apptLife({ date: '2026-01-20', time: '10:00', duration: 30, completed: 'noshow' }, NOW)).toBe('done')
    expect(apptLife({ date: '2026-01-15', time: '12:30', duration: 60, completed: false }, NOW)).toBe('live')
    expect(apptLife({ date: '2026-01-15', time: '15:00', duration: 30, completed: false }, NOW)).toBe('future')
    expect(apptLife({ date: '2026-01-10', time: '10:00', duration: 30, completed: false }, NOW)).toBe('past')
    expect(apptLife({ date: '2026-01-15', time: '12:00', duration: 30, completed: false }, NOW)).toBe('past')
    expect(apptLife({}, NOW)).toBe('unknown')
    expect(apptLife(null, NOW)).toBe('unknown')
  })

  it('la duración por defecto (60 min) define el fin cuando falta el dato', () => {
    // 12:30 sin duration → termina 13:30 → sigue en curso a las 13:00
    expect(apptLife({ date: '2026-01-15', time: '12:30', completed: false }, NOW)).toBe('live')
    // 12:00 sin duration → termina 13:00 → ya terminó
    expect(apptLife({ date: '2026-01-15', time: '12:00', completed: false }, NOW)).toBe('past')
  })
})

/* -- apptGroup · dónde cae la cita en la pestaña Citas ----------------
   Sostiene la navegación Panel → Citas: el grupo devuelto es el acordeón
   que hay que abrir para que la cita seleccionada sea visible. */
describe('apptGroup', () => {
  const NOW = new Date(2026, 0, 15, 13, 0, 0) // 2026-01-15 13:00 local
  it('clasifica hoy / mañana / próximas / pasadas / sin marcar / no asistió', () => {
    expect(apptGroup({ date: '2026-01-15', time: '15:00', completed: false }, NOW)).toBe('today')
    expect(apptGroup({ date: '2026-01-16', time: '10:00', completed: false }, NOW)).toBe('tomorrow')
    expect(apptGroup({ date: '2026-01-20', time: '10:00', completed: false }, NOW)).toBe('upcoming')
    expect(apptGroup({ date: '2026-01-10', time: '10:00', completed: true }, NOW)).toBe('past')
    expect(apptGroup({ date: '2026-01-10', time: '10:00', completed: false }, NOW)).toBe('unmarked')
    expect(apptGroup({ date: '2026-01-20', time: '10:00', completed: 'noshow' }, NOW)).toBe('noshow')
  })

  it('una cita de hoy cuya hora ya empezó cae en «Sin marcar» si nadie la marcó', () => {
    // 12:00 ya inició (NOW = 13:00) → pasada; sin decisión → unmarked
    expect(apptGroup({ date: '2026-01-15', time: '12:00', completed: false }, NOW)).toBe('unmarked')
    // la misma hora pero completada → «Pasadas»
    expect(apptGroup({ date: '2026-01-15', time: '12:00', completed: true }, NOW)).toBe('past')
    // 13:00 exacto: `start < now` es false → sigue en today
    expect(apptGroup({ date: '2026-01-15', time: '13:00', completed: false }, NOW)).toBe('today')
    // sin hora no se puede decidir → se muestra como hoy
    expect(apptGroup({ date: '2026-01-15', time: '', completed: false }, NOW)).toBe('today')
  })

  it('«No asistió» tiene prioridad sobre cualquier otra clasificación', () => {
    expect(apptGroup({ date: '2026-01-10', time: '10:00', completed: 'noshow' }, NOW)).toBe('noshow')
    expect(apptGroup({ date: '2026-01-15', time: '12:00', completed: 'noshow' }, NOW)).toBe('noshow')
    expect(apptGroup({ date: '2026-01-20', time: '10:00', completed: 'noshow' }, NOW)).toBe('noshow')
  })

  it('una cita sin fecha nunca se pierde: «Sin marcar» si está pendiente', () => {
    expect(apptGroup({ date: '', time: '10:00', completed: false }, NOW)).toBe('unmarked')
    expect(apptGroup({ date: '', time: '10:00', completed: true }, NOW)).toBe('past')
    expect(apptGroup({}, NOW)).toBe('unmarked')
  })

  it('no modifica la cita recibida (solo lectura)', () => {
    const a = { id: 'x', date: '2026-01-15', time: '15:00', completed: false }
    const snapshot = JSON.stringify(a)
    apptGroup(a, NOW)
    expect(JSON.stringify(a)).toBe(snapshot)
  })
})

/* -- canModifyAppt · restricción reutilizada por el detalle ----------- */
describe('canModifyAppt (restricción del detalle)', () => {
  it('solo permite editar/eliminar citas pendientes', () => {
    expect(canModifyAppt({ completed: false })).toBe(true)
    expect(canModifyAppt({ completed: true })).toBe(false)
    expect(canModifyAppt({ completed: 'noshow' })).toBe(false)
    expect(canModifyAppt({})).toBe(true)
  })
})

/* -- reportMetrics · el reporte conserva sus cifras ------------------- */
describe('reportMetrics', () => {
  // Período: enero 2026 completo
  const FROM = '2026-01-01', TO = '2026-01-31'
  const inPeriod = d => { const x = cleanDate(d); return !!x && x >= FROM && x <= TO }

  const appts = [
    // completada, con servicio
    { id: 'a1', date: '2026-01-10', time: '10:00', completed: true,  totalPrice: 100000, domicilio: false, createdAt: '2026-01-05' },
    // pendiente
    { id: 'a2', date: '2026-01-12', time: '11:00', completed: false, totalPrice:  50000, domicilio: false, createdAt: '2026-01-06' },
    // no asistió
    { id: 'a3', date: '2026-01-14', time: '12:00', completed: 'noshow', totalPrice: 30000, domicilio: false, createdAt: '2026-01-07' },
    // creada en enero pero agendada para FEBRERO: cuenta como creada, no como agendada
    { id: 'a4', date: '2026-02-20', time: '13:00', completed: false, totalPrice:  80000, domicilio: false, createdAt: '2026-01-08' },
    // completada Y a domicilio
    { id: 'a5', date: '2026-01-15', time: '14:00', completed: true,  totalPrice:  60000, domicilio: true, domicilioPrice: 10000, createdAt: '2026-01-09' },
  ]
  const expenses = [{ id: 'e1', date: '2026-01-20', amount: 40000, category: 'Insumos' }]
  const M = () => reportMetrics({ appts, expenses, inPeriod, from: FROM, to: TO })

  it('distingue «creadas» de «agendadas» sin doble conteo', () => {
    const m = M()
    // agendadas = 4 (a1,a2,a3,a5): la a4 es para febrero
    expect(m.scheduled).toBe(4)
    // creadas = 5: a4 se creó en enero aunque su cita sea para febrero
    expect(m.created).toBe(5)
    // las creadas NO se suman a las agendadas
    expect(m.created + m.scheduled).not.toBe(m.created * 2)
  })

  it('mantiene completadas, pendientes y porcentaje', () => {
    const m = M()
    expect(m.completed).toBe(2)   // a1, a5
    expect(m.pending).toBe(1)     // a2
    expect(m.noshow).toBe(1)      // a3
    expect(m.completionRate).toBe(50)   // 2 de 4
    expect(m.cancelledRate).toBe(25)    // 1 de 4
  })

  it('cuenta las «no asistió» del período sin mezclarlas con lo demás', () => {
    const ns = [
      { id: 'n1', date: '2026-01-03', time: '09:00', completed: 'noshow', totalPrice: 10000 },
      { id: 'n2', date: '2026-01-20', time: '15:00', completed: 'noshow', totalPrice: 20000 },
      { id: 'n4', date: '2026-02-01', time: '10:00', completed: 'noshow', totalPrice: 40000 }, // fuera del período
      { id: 'n5', date: '2026-01-10', time: '10:00', completed: true,     totalPrice: 50000 }, // completada
      { id: 'n6', date: '2026-01-11', time: '10:00', completed: false,    totalPrice: 60000 }, // pendiente
    ]
    const m = reportMetrics({ appts: ns, expenses: [], inPeriod, from: FROM, to: TO })
    expect(m.noshow).toBe(2)      // n1 y n2: ni la de febrero, ni completadas ni pendientes
    expect(m.scheduled).toBe(4)   // n1, n2, n5, n6
    expect(m.completed).toBe(1)
    expect(m.pending).toBe(1)
    expect(m.cancelledRate).toBe(50)  // 2 de 4
    // Sin citas «no asistió» el contador es 0, nunca undefined
    const none = reportMetrics({ appts: [], expenses: [], inPeriod, from: FROM, to: TO })
    expect(none.noshow).toBe(0)
  })

  it('el neto NO es «Proyectado − Gastos»', () => {
    const m = M()
    // proyectado incluye la pendiente a2 → 100000+50000+60000 = 210000
    expect(m.projected).toBe(210000)
    // ingresos = solo completadas → 160000
    expect(m.revenue).toBe(160000)
    expect(m.totalExpenses).toBe(40000)
    // neto real = ingresos − gastos = 120000, NO 210000 − 40000 = 170000
    expect(m.neto).toBe(120000)
    expect(m.neto).not.toBe(m.projected - m.totalExpenses)
  })

  it('cuenta los domicilios una vez y su valor va dentro del ingreso', () => {
    const m = M()
    expect(m.domicilios).toBe(1)          // solo a5
    expect(m.domRevenue).toBe(10000)
    // el valor del domicilio ya está sumado en `revenue`: no se suma dos veces
    expect(m.revenue).toBe(m.ledger.totalService + m.domRevenue)
    expect(m.ledger.totalService).toBe(150000)
  })

  it('al cambiar el período las cifras se recalculan', () => {
    // Mismo conjunto, pero solo el 12 de enero
    const day = d => cleanDate(d) === '2026-01-12'
    const m = reportMetrics({ appts, expenses, inPeriod: day, from: '2026-01-12', to: '2026-01-12' })
    expect(m.scheduled).toBe(1)
    expect(m.completed).toBe(0)
    expect(m.pending).toBe(1)
    expect(m.completionRate).toBe(0)
    expect(m.revenue).toBe(0)
    expect(m.neto).toBe(0)              // sin ingresos ni gastos ese día
    // la a4 se creó el 8, no el 12 → no cuenta como creada
    expect(m.created).toBe(0)
  })

  it('un período vacío devuelve ceros, no NaN ni undefined', () => {
    const none = () => { return false }
    const m = reportMetrics({ appts, expenses, inPeriod: none, from: '2027-05-01', to: '2027-05-31' })
    expect(m.scheduled).toBe(0)
    expect(m.created).toBe(0)
    expect(m.completed).toBe(0)
    expect(m.pending).toBe(0)
    expect(m.noshow).toBe(0)
    expect(m.domicilios).toBe(0)
    expect(m.revenue).toBe(0)
    expect(m.projected).toBe(0)
    expect(m.totalExpenses).toBe(0)
    expect(m.neto).toBe(0)
    expect(m.avgTicket).toBe(0)
    // las tasas no pueden dividir entre cero
    expect(m.completionRate).toBe(0)
    expect(m.cancelledRate).toBe(0)
    expect(Number.isNaN(m.completionRate)).toBe(false)
  })

  it('el ticket promedio sale de los ingresos de completadas', () => {
    // 160000 / 2 completadas = 80000
    expect(M().avgTicket).toBe(80000)
  })

  it('acepta entradas no-array sin romperse', () => {
    const m = reportMetrics({ appts: null, expenses: undefined, inPeriod, from: FROM, to: TO })
    expect(m.scheduled).toBe(0)
    expect(m.neto).toBe(0)
    expect(m.ledger.rows).toEqual([])
  })

  it('el libro del reporte sigue siendo el de periodLedger', () => {
    // El reporte no introduce un cálculo paralelo: reutiliza el libro único.
    const m = M()
    expect(m.ledger).toEqual(periodLedger(appts, expenses, FROM, TO))
    expect(m.revenue).toBe(m.ledger.totalIncome)
    expect(m.neto).toBe(m.ledger.neto)
  })
})

/* ══════════════════════════════════════════════════════════════
   REGLA ÚNICA DE EDITAR/ELIMINAR CITAS
   Objetivo: una sola regla de negocio coherente en Panel, Citas,
   Calendario y Detalle.

     · canModifyAppt decide SOLO por estado (pendiente vs completada
       vs no asistió). El paso del tiempo NO cambia el estado y NO
       bloquea la edición.
     · Pendiente futura  → editable
     · Pendiente pasada  → editable (misma regla)
     · Completada        → NO editable ni eliminable
     · No asistió        → NO editable ni eliminable

   Reloj congelado: 2026-01-15 13:00 → «pasada» = fecha < hoy, o
   hoy con hora de inicio < 13:00.
   ══════════════════════════════════════════════════════════════ */
describe('REGLA ÚNICA · editar/eliminar citas en todas las vistas', () => {
  // Fábrica de citas: mismo esqueleto, cambia solo lo relevante.
  const appt = (over = {}) => ({
    id: 'a1', clientName: 'BRYAN', date: '2026-01-15', time: '18:00',
    serviceNames: 'Diseño y depilación', servicePrice: 60000, totalPrice: 60000,
    domicilio: false, duration: 30, completed: false, ...over,
  })

  // Citas de referencia para los 8 escenarios del encargo.
  const pastPending   = appt({ date: '2026-01-10', time: '10:00' })            // pasada + pendiente
  const futurePending = appt({ date: '2026-01-20', time: '10:00' })            // futura + pendiente
  const completedAppt = appt({ date: '2026-01-10', time: '10:00', completed: true })
  const noshowAppt    = appt({ date: '2026-01-10', time: '10:00', completed: 'noshow' })

  /* 1 · Una cita pasada y pendiente SÍ se puede editar (Citas) ---------- */
  it('1 · una cita pasada y pendiente ES editable y eliminable', () => {
    expect(canModifyAppt(pastPending)).toBe(true)
  })

  /* 2 · Misma cita editable desde Calendario y Detalle ------------------
     Las tres vistas delegan en la MISMA canModifyAppt, así que la
     decisión es idéntica sin importar el punto de entrada. */
  it('2 · la decisión es idéntica para Citas, Calendario y Detalle', () => {
    // Una sola fuente: si cambia la regla, cambia para todas las vistas.
    expect(canModifyAppt(pastPending)).toBe(true)  // Citas
    expect(canModifyAppt(pastPending)).toBe(true)  // Calendario
    expect(canModifyAppt(pastPending)).toBe(true)  // Detalle
  })

  /* 3 · Una cita futura y pendiente sigue siendo editable -------------- */
  it('3 · una cita futura y pendiente sigue siendo editable', () => {
    expect(canModifyAppt(futurePending)).toBe(true)
  })

  /* 4 · Completada: no editable ni eliminable -------------------------- */
  it('4 · una cita completada NO se puede editar ni eliminar', () => {
    expect(canModifyAppt(completedAppt)).toBe(false)
  })

  /* 5 · No asistió: no editable ni eliminable -------------------------- */
  it('5 · una cita «No asistió» NO se puede editar ni eliminar', () => {
    expect(canModifyAppt(noshowAppt)).toBe(false)
  })

  /* 6 · La edición no cambia automáticamente el estado -----------------
     canModifyAppt es una decisión pura: no muta la cita, y el estado
     de una pasada pendiente sigue siendo «pending» (no «done»). */
  it('6 · decidir permisos NO muta la cita ni auto-completa una pasada', () => {
    const before = JSON.stringify(pastPending)
    expect(canModifyAppt(pastPending)).toBe(true)
    expect(JSON.stringify(pastPending)).toBe(before)
    // El paso del tiempo no cambia el estado: sigue pendiente.
    expect(apptStatus(pastPending)).toBe('pending')
  })

  /* 8 · Coherencia de permisos entre vistas -----------------------------
     Regresión: vuelve a romperse si alguien reintroduce una regla
     PARALELA por grupo en ApptCard/ApptDetail. */
  it('8 · el fuente usa la MISMA canModifyAppt en listado, detalle y calendario', () => {
    // jsdom no da import.meta.url como file://, así que se resuelve
    // contra la raíz del proyecto (cwd de vitest).
    const src = readFileSync(resolve(process.cwd(), 'src', 'App.jsx'), 'utf8')

    // (a) No debe existir ninguna regla paralela por grupo de «Pasadas».
    expect(src).not.toMatch(/groupAllowsEdit/)
    expect(src).not.toMatch(/canEdit\s*=\s*\{?\s*(true|false)/)

    // (b) ApptCard (listado de Citas) delega en canModifyAppt.
    const card = src.match(/function ApptCard\(\{[^}]*\}[\s\S]*?\n\}/)
    expect(card).toBeTruthy()
    expect(card[0]).toMatch(/canModifyAppt\(appt\)/)

    // (c) ApptDetail delega en canModifyAppt.
    const detail = src.match(/function ApptDetail\(\{[^}]*\}[\s\S]*?\n\}/)
    expect(detail).toBeTruthy()
    expect(detail[0]).toMatch(/canModifyAppt\(appt\)/)

    // (d) El Calendario también decide con canModifyAppt (sus botones).
    expect(src).toMatch(/canModifyAppt\(a\)/)
  })

  /* 7 · Edición segura: solapamiento bloquea el guardado ----------------
     EditAppt usa getSlots(..., appt.id) → excluye la propia cita. Un
     horario solapado queda con conflict=true, y eso deshabilita el
     botón «Guardar cambios» (ver EditAppt: timeBlocked). */
  it('7 · al reprogramar, un solapamiento queda marcado como conflicto', () => {
    const day = '2026-01-20'
    const other = { id: 'x', date: day, time: '10:00', duration: 60 }
    // La propia cita (id 'self') NO se bloquea a sí misma…
    const slots = getSlots(day, [], [other, pastPending], 'self', 60)
    const free  = slots.find(s => cleanTime(s.time) === '14:00')
    expect(free.disabled).toBe(false)
    expect(free.conflict).toBe(false)

    // …pero una hora que choca con otra cita SÍ queda bloqueada.
    const clash = slots.find(s => cleanTime(s.time) === '10:30')
    expect(clash.conflict).toBe(true)
  })

  it('7b · checkSlot rechaza la hora en conflicto con un mensaje legible', () => {
    const day = '2026-01-20'
    const appts = [
      { id: 'self', date: day, time: '09:00', duration: 60 },
      { id: 'x',    date: day, time: '11:00', duration: 60 },
    ]
    // La propia cita (excludeId) no se bloquea…
    expect(checkSlot(day, '09:00', appts, 60, 'self')).toBe(null)
    // …pero una hora ocupada por otra sí se rechaza.
    expect(checkSlot(day, '11:00', appts, 60, 'self')).toMatch(/no están disponibles/)
  })
})

/* -- isResetOutcome ----------------------------------------------
   El transporte del reset puede fallar DESPUÉS de que el servidor lo
   ejecutara: aquí se decide si el estado leído de la hoja es el
   resultado de un restablecimiento, para no decirle a la dueña que
   falló cuando en realidad sí se hizo.                              */
describe('isResetOutcome', () => {
  const DEF = [
    { id: 'def-1', name: 'Micropigmentación cejas', price: 350000, duration: 90 },
    { id: 'def-2', name: 'Lifting de pestañas',     price: 130000, duration: 60 },
  ]

  // Así responde el servidor DESPUÉS de un reset: colecciones vacías y
  // catálogo re-sembrado con los IDs y tipos regenerados en esa sesión.
  const vaciado = (extra = {}) => ({
    clients: [], appointments: [], expenses: [],
    services: [
      { id: 'nuevo-a', name: 'Micropigmentación cejas', price: '350000', duration: '90' },
      { id: 'nuevo-b', name: 'Lifting de pestañas',     price: '130000', duration: '60' },
    ],
    priceHistory: [],
    ...extra,
  })

  it('true: 3 colecciones vacías y catálogo = servicios por defecto', () => {
    expect(isResetOutcome(vaciado(), DEF)).toBe(true)
  })

  it('ignora los IDs: el reset los regenera en cada sesión', () => {
    const idsDistintos = { ...vaciado() }
    idsDistintos.services = idsDistintos.services.map((s, i) => ({ ...s, id: `otro-${i}`, duration: 45 }))
    expect(isResetOutcome(idsDistintos, DEF)).toBe(true)
  })

  it('false si queda algún cliente, cita o gasto', () => {
    expect(isResetOutcome(vaciado({ clients: [{ id: 'c1', name: 'Ana' }] }), DEF)).toBe(false)
    expect(isResetOutcome(vaciado({ appointments: [{ id: 'a1' }] }), DEF)).toBe(false)
    expect(isResetOutcome(vaciado({ expenses: [{ id: 'e1' }] }), DEF)).toBe(false)
  })

  it('false si el catálogo NO es el por defecto (servicios propios)', () => {
    const conPropios = vaciado({
      services: [{ id: 'p1', name: 'Servicio mío', price: '99000', duration: '30' }],
    })
    expect(isResetOutcome(conPropios, DEF)).toBe(false)

    // Mismo nombre pero otro precio → no es el catálogo por defecto.
    const precioDistinto = vaciado()
    precioDistinto.services[0].price = '999999'
    expect(isResetOutcome(precioDistinto, DEF)).toBe(false)
  })

  it('false si faltan colecciones, servicios o defaults', () => {
    expect(isResetOutcome({ clients: [], appointments: [], expenses: [] }, DEF)).toBe(false)
    expect(isResetOutcome(vaciado({ services: [] }), DEF)).toBe(false)
    expect(isResetOutcome(vaciado(), [])).toBe(false)
    expect(isResetOutcome(vaciado(), null)).toBe(false)
    expect(isResetOutcome(null, DEF)).toBe(false)
    expect(isResetOutcome(undefined, DEF)).toBe(false)
    expect(isResetOutcome('no-es-datos', DEF)).toBe(false)
  })
})

/* -- domBreakdown ------------------------------------------------
   El domicilio viene SUMADO dentro del total de la cita; aquí se
   separa para el mensaje de WhatsApp (Servicios / Domicilio / Total). */
describe('domBreakdown', () => {
  it('sin domicilio: el total entero es de servicios', () => {
    expect(domBreakdown(350000, false, 10000)).toEqual({ services: 350000, delivery: 0, total: 350000 })
    expect(domBreakdown(350000, null, 10000)).toEqual({ services: 350000, delivery: 0, total: 350000 })
  })

  it('con domicilio: separa el valor y la suma cuadra con el total', () => {
    const d = domBreakdown(360000, true, 10000)
    expect(d).toEqual({ services: 350000, delivery: 10000, total: 360000 })
    expect(d.services + d.delivery).toBe(d.total)
  })

  it('acepta strings, como vienen de la hoja ("360000", "true")', () => {
    expect(domBreakdown('360000', 'true', '10000')).toEqual({ services: 350000, delivery: 10000, total: 360000 })
    expect(domBreakdown('360000', 'false', '10000')).toEqual({ services: 360000, delivery: 0, total: 360000 })
  })

  it('acota el domicilio al total: nunca deja servicios en negativo', () => {
    expect(domBreakdown(5000, true, 10000)).toEqual({ services: 0, delivery: 5000, total: 5000 })
  })

  it('datos faltantes o inválidos dan ceros, no NaN', () => {
    expect(domBreakdown(undefined, true, 10000)).toEqual({ services: 0, delivery: 0, total: 0 })
    expect(domBreakdown(null, true, 10000)).toEqual({ services: 0, delivery: 0, total: 0 })
    expect(domBreakdown('', true, 10000)).toEqual({ services: 0, delivery: 0, total: 0 })
    expect(domBreakdown(-100, true, 50)).toEqual({ services: 0, delivery: 0, total: 0 })
    expect(domBreakdown('abc', true, 50)).toEqual({ services: 0, delivery: 0, total: 0 })
  })

  it('cita a domicilio sin recargo: solo el indicador, todo en servicios', () => {
    expect(domBreakdown(350000, true, 0)).toEqual({ services: 350000, delivery: 0, total: 350000 })
  })
})

/* -- canRemindAppt ------------------------------------------------
   Regla única de las tres vistas (Panel, Citas, Calendario): no se
   manda recordatorio de una cita que ya pasó.                    */
describe('canRemindAppt', () => {
  const base = { clientName: 'Ana', clientPhone: '3001234567', serviceNames: 'Cejas', totalPrice: 350000 }
  const hoy     = '2026-01-15'  // reloj congelado a las 13:00 (ver beforeAll)
  const manana  = '2026-01-16'
  const ayer    = '2026-01-14'

  it('sí se puede recordar una cita futura o de hoy por venir', () => {
    expect(canRemindAppt({ ...base, date: manana, time: '09:00' })).toBe(true)
    expect(canRemindAppt({ ...base, date: hoy,    time: '14:00' })).toBe(true)
    expect(canRemindAppt({ ...base, date: hoy,    time: '13:05' })).toBe(true)
  })

  it('gracia de 10 min tras empezar (la del aviso «⏰ Recordar ahora»)', () => {
    expect(canRemindAppt({ ...base, date: hoy, time: '12:59' })).toBe(true)  // hace 1 min
    expect(canRemindAppt({ ...base, date: hoy, time: '12:50' })).toBe(true)  // hace 10
    expect(canRemindAppt({ ...base, date: hoy, time: '12:49' })).toBe(false) // hace 11
  })

  it('NO se puede recordar una cita pasada', () => {
    expect(canRemindAppt({ ...base, date: hoy,    time: '09:00' })).toBe(false)
    expect(canRemindAppt({ ...base, date: ayer,   time: '09:00' })).toBe(false)
    expect(canRemindAppt({ ...base, date: ayer,   time: '23:00' })).toBe(false)
  })

  it('NO se puede recordar una cita completada ni «no asistió»', () => {
    expect(canRemindAppt({ ...base, date: manana, time: '09:00', completed: 'true' })).toBe(false)
    expect(canRemindAppt({ ...base, date: manana, time: '09:00', completed: 'noshow' })).toBe(false)
  })

  it('sin fecha o hora válidas no hay recordatorio posible', () => {
    expect(canRemindAppt({ ...base, date: '',      time: '09:00' })).toBe(false)
    expect(canRemindAppt({ ...base, date: manana,  time: '' })).toBe(false)
    expect(canRemindAppt({ ...base, date: 'basura', time: '09:00' })).toBe(false)
    expect(canRemindAppt({ ...base, date: manana,  time: 'basura' })).toBe(false)
    expect(canRemindAppt(null)).toBe(false)
    expect(canRemindAppt(undefined)).toBe(false)
  })

  it('la ventana de gracia es configurable', () => {
    expect(canRemindAppt({ ...base, date: hoy, time: '12:49' }, undefined, 30)).toBe(true)
    expect(canRemindAppt({ ...base, date: hoy, time: '12:59' }, undefined, 0)).toBe(false)
  })
})


/* ══════════════════════════════════════════════════════════════
   reportLines — el TEXTO del reporte de actividad.
   Es la fuente única del formato: la usa el botón «💬 WhatsApp
   admin» de Reportes, y el correo automático del trigger replica
   ese mismo orden (ver test de paridad en backend.test.js).
   ══════════════════════════════════════════════════════════════ */
describe('reportLines — reporte de actividad', () => {
  const D = '2026-08-04'

  // Una cita completada a domicilio (efectivo), otra pendiente
  // (transferencia), y dos gastos: Gasolina $10.000 e Insumos/Cera $20.000.
  const appts = [
    { id: 'a1', date: D, time: '09:00', completed: 'true', domicilio: 'true',
      servicePrice: '350000', domicilioPrice: '10000', totalPrice: '360000',
      paymentMethod: 'Efectivo', serviceNames: 'Diseño de cejas' },
    { id: 'a2', date: D, time: '11:00', completed: 'false', domicilio: 'false',
      servicePrice: '130000', totalPrice: '130000',
      paymentMethod: 'Transferencia', serviceNames: 'Lifting de pestañas' },
  ]
  const expenses = [
    { id: 'e1', date: D, category: 'Gasolina', description: '', amount: '10000' },
    { id: 'e2', date: D, category: 'Insumos',  description: 'Cera', amount: '20000' },
  ]

  const M = () => reportMetrics({ appts, expenses, inPeriod: d => d === D, from: D, to: D })
  const lines = (m = M()) => reportLines({ label: 'martes, 4 de agosto de 2026', m, topByDemand: [], stamp: 'PRUEBA' })
  const idx = (arr, sub) => arr.findIndex(l => l.includes(sub))
  // Tramo de la sección 💸 Gastos: desde su cabecera (detallada
  // «*Gastos*» o agrupada «*Gastos (por categoría)*») hasta el total.
  const gastoTramo = out => out.slice(idx(out, '💸 *Gastos'), idx(out, '• Total gastos:'))

  it('lista CADA gasto del período con su monto, y cierra con el total', () => {
    const out = lines()
    const iGastos = idx(out, '💸 *Gastos*')
    const iTotal  = idx(out, '• Total gastos:')
    expect(iGastos).toBeGreaterThan(-1)
    expect(iTotal).toBeGreaterThan(iGastos)
    // Cada gasto aparece con su renglón y su monto.
    expect(out).toContain('   - Gasolina: *$10.000*')
    expect(out).toContain('   - Insumos — Cera: *$20.000*')
    // El total suma los dos.
    expect(out[iTotal]).toBe('• Total gastos: *$30.000*')
  })

  it('el detalle de gastos va ANTES del total de gastos y del neto', () => {
    const out = lines()
    const iGas  = idx(out, '   - Gasolina')
    const iTot  = idx(out, '• Total gastos:')
    const iNeto = idx(out, '💳 *Neto*')
    expect(iGas).toBeGreaterThan(-1)
    expect(iGas).toBeLessThan(iTot)
    expect(iTot).toBeLessThan(iNeto)
  })

  it('sin gastos sale solo el total en cero (nunca el tramo vacío)', () => {
    const m = reportMetrics({ appts, expenses: [], inPeriod: d => d === D, from: D, to: D })
    const out = lines(m)
    expect(out).toContain('• Total gastos: *$0*')
    // En el tramo de 💸 Gastos no queda ningún renglón de detalle.
    expect(gastoTramo(out)).toEqual(['💸 *Gastos*'])
  })

  it('el total de gastos SIEMPRE cuadra con el libro, aunque se corte el detalle', () => {
    // 25 gastos de $1.000 en 25 categorías: se pasa al formato «por
    // categoría» y solo entran MAX_REPORT_EXPENSES renglones, pero el
    // total debe seguir sumando los 25 ($25.000).
    const muchos = Array.from({ length: 25 }, (_, i) => ({
      id: 'g' + i, date: D, category: 'Gasto ' + i, description: '', amount: '1000',
    }))
    const m = reportMetrics({ appts, expenses: muchos, inPeriod: d => d === D, from: D, to: D })
    const out = lines(m)
    const tramo = gastoTramo(out)
    expect(tramo[0]).toBe('💸 *Gastos (por categoría)*')
    expect(tramo.filter(l => l.startsWith('   - ')).length).toBe(MAX_REPORT_EXPENSES)
    expect(out).toContain('   … y 5 categoría(s) más')
    expect(out).toContain('• Total gastos: *$25.000*')
    expect(m.ledger.totalExpenses).toBe(25000)
  })

  it('las cifras salen del reportMetrics: ingresos por método y domicilio', () => {
    const out = lines()
    // Completada $360.000 (servicios $350.000 + domicilio $10.000) en efectivo.
    // La pendiente $130.000 en transferencia NO es ingreso: cuenta en el
    // proyectado, y el neto sale del libro único (solo lo completado).
    expect(out).toContain('• Servicio(s): *$350.000*')
    expect(out).toContain('• Domicilios: *$10.000*')
    expect(out).toContain('• Total recibido: *$360.000*')
    expect(out).toContain('   - Efectivo: *$360.000*')
    expect(out).toContain('   - Transferencias: *$0*')
    // Sin citas viejas en «Transferencia» no sale el renglón heredado.
    expect(out.some(l => l.startsWith('   - · Transferencia'))).toBe(false)
    expect(out).toContain('• Proyectado: *$490.000*')
    expect(out).toContain('💳 *Neto*: *$330.000*')   // 360.000 − 30.000
  })

  it('«Sin método registrado» solo aparece si hay ingresos sin método', () => {
    expect(lines().some(l => l.includes('Sin método registrado'))).toBe(false)
    const m = reportMetrics({
      appts: [...appts, { id: 'a3', date: D, time: '15:00', completed: 'true',
        domicilio: 'false', servicePrice: '50000', totalPrice: '50000',
        paymentMethod: '', serviceNames: 'Esmalte' }],
      expenses, inPeriod: d => d === D, from: D, to: D,
    })
    expect(lines(m)).toContain('   - Sin método registrado: *$50.000*')
  })

  it('los cuatro métodos salen siempre, con el total de Transferencias debajo', () => {
    const out = lines()
    // Los cuatro renglones actuales, en el orden de PAYMENT_METHODS (paridad
    // con el correo), y siempre el total de transferencias. En la base solo
    // hay $360.000 en efectivo; el resto sale en $0.
    expect(out).toContain('   - Efectivo: *$360.000*')
    PAYMENT_METHODS.slice(1).forEach(m => expect(out).toContain(`   - ${m}: *$0*`))
    expect(idx(out, '   - Efectivo:')).toBeLessThan(idx(out, '   - Nequi:'))
    expect(idx(out, '   - Nequi:')).toBeLessThan(idx(out, '   - Daviplata:'))
    expect(idx(out, '   - Daviplata:')).toBeLessThan(idx(out, '   - Bancolombia:'))
    expect(idx(out, '   - Bancolombia:')).toBeLessThan(idx(out, '   - Transferencias:'))
    expect(out).toContain('   - Transferencias: *$0*')
    // Una cita pagada con Nequi cae en SU renglón y en el total de
    // transferencias, no en «Sin método».
    const m = reportMetrics({
      appts: [...appts, { id: 'an', date: D, time: '15:00', completed: 'true',
        domicilio: 'false', servicePrice: '80000', totalPrice: '80000',
        paymentMethod: 'Nequi', serviceNames: 'Esmalte' }],
      expenses, inPeriod: d => d === D, from: D, to: D,
    })
    expect(lines(m)).toContain('   - Nequi: *$80.000*')
    expect(lines(m)).toContain('   - Transferencias: *$80.000*')
    expect(m.ledger.byMethod.Nequi).toBe(80000)
    expect(m.ledger.totalTransfer).toBe(80000)
    expect(m.ledger.totalNoMethod).toBe(0)
  })

  it('las citas viejas en «Transferencia» siguen contando (dato heredado)', () => {
    const m = reportMetrics({
      appts: [...appts, { id: 'at', date: D, time: '16:00', completed: 'true',
        domicilio: 'false', servicePrice: '90000', totalPrice: '90000',
        paymentMethod: 'Transferencia', serviceNames: 'Masaje' }],
      expenses, inPeriod: d => d === D, from: D, to: D,
    })
    const out = lines(m)
    // Aparece el renglón heredado y además suma en el total de transferencias.
    expect(out).toContain('   - · Transferencia (dato anterior): *$90.000*')
    expect(out).toContain('   - Transferencias: *$90.000*')
    expect(m.ledger.byMethod.Transferencia).toBe(90000)
    expect(m.ledger.totalTransfer).toBe(90000)
    // NO cae en «Sin método»: sigue siendo un cobro con método conocido.
    expect(m.ledger.totalNoMethod).toBe(0)
    expect(out.some(l => l.includes('Sin método registrado'))).toBe(false)
    // Y la UI la sigue mostrando (payMethodOf acepta el valor heredado).
    expect(payMethodOf({ paymentMethod: 'Transferencia' })).toBe('Transferencia')
    // …pero la lista de opciones ya no la ofrece.
    expect(PAYMENT_METHODS).not.toContain('Transferencia')
  })

  it('el detalle de gastos conserva el orden de la hoja Gastos', () => {
    const out = lines()
    expect(idx(out, '   - Gasolina')).toBeLessThan(idx(out, '   - Insumos'))
  })

  it('«No asistió» solo sale si hay alguna, y nunca la tasa de completado', () => {
    expect(lines().some(l => l.includes('No asistió'))).toBe(false)
    const m = reportMetrics({
      appts: [...appts, { id: 'a4', date: D, time: '17:00', completed: 'noshow',
        domicilio: 'false', servicePrice: '80000', totalPrice: '80000',
        paymentMethod: '', serviceNames: 'Masilla' }],
      expenses, inPeriod: d => d === D, from: D, to: D,
    })
    expect(lines(m)).toContain('• No asistió: *1*')
    // La tasa de completado se quitó del reporte (pantalla, correo y WA).
    expect(lines().some(l => l.toLowerCase().includes('tasa completado'))).toBe(false)
    expect(lines().some(l => l.toLowerCase().includes('porcentaje completado'))).toBe(false)
  })

  it('los servicios y domicilios solo agregan su sección cuando hay datos', () => {
    // Domicilios: solo la sección extra, la línea de ingresos ya la trae.
    expect(lines().some(l => l.includes('Top servicios'))).toBe(false)
    const out = reportLines({
      label: 'x', m: M(), stamp: 'X',
      topByDemand: [{ name: 'Diseño de cejas', count: 3, revenue: 150000 }],
    })
    expect(out).toContain('🛵 *Domicilios*: 1 citas · $10.000')
    expect(out).toContain('1. Diseño de cejas — 3x ($150.000)')

    // Sin citas a domicilio no aparece la sección.
    const sinDom = reportMetrics({
      appts: [appts[1]], expenses, inPeriod: d => d === D, from: D, to: D,
    })
    expect(lines(sinDom).some(l => l.includes('🛵'))).toBe(false)
  })

  it('el pie lleva el sello de generado que pase el llamador', () => {
    expect(lines().at(-2)).toBe('')
    expect(lines().at(-1)).toBe('_Generado PRUEBA_')
  })
})

describe('expenseLabel — nombre de un gasto en el reporte', () => {
  it('categoría sola cuando no hay descripción', () => {
    expect(expenseLabel({ who: 'Gasolina', detail: '' })).toBe('Gasolina')
  })
  it('categoría y descripción unidas con em dash', () => {
    expect(expenseLabel({ who: 'Insumos', detail: 'Cera' })).toBe('Insumos — Cera')
  })
  it('no repite si las dos dicen lo mismo', () => {
    expect(expenseLabel({ who: 'Cera', detail: 'Cera' })).toBe('Cera')
  })
  it('vacío total cae en «Gasto», nunca deja el renglón sin nombre', () => {
    expect(expenseLabel({ who: '', detail: '' })).toBe('Gasto')
  })
})

describe('groupExpensesByCategory — gastos agrupados por categoría', () => {
  const g = (who, amount, detail = '') => ({ who, amount, detail })

  it('agrupa por categoría, suma los montos y cuenta cuántas veces', () => {
    expect(groupExpensesByCategory([
      g('Gasolina', 30000), g('Gasolina', 50000), g('Cera', 20000),
    ])).toEqual([
      { cat: 'Gasolina', amount: 80000, count: 2 },
      { cat: 'Cera', amount: 20000, count: 1 },
    ])
  })

  it('ordena de mayor a menor monto', () => {
    const grupos = groupExpensesByCategory([
      g('Almuerzo', 22000), g('Arriendo', 1300000), g('Gasolina', 150000), g('Cera', 60000),
    ])
    expect(grupos.map(x => x.cat)).toEqual(['Arriendo', 'Gasolina', 'Cera', 'Almuerzo'])
  })

  it('los empates se resuelven por nombre con comparación simple', () => {
    // localeCompare ordenaría «Éter» por sonido (cerca de la E); la
    // comparación simple por código es la única que calza igual en el
    // navegador, en node y en Apps Script (paridad correo ↔ WhatsApp).
    const grupos = groupExpensesByCategory([g('Zeta', 1000), g('Alfa', 1000), g('Éter', 1000)])
    expect(grupos.map(x => x.cat)).toEqual(['Alfa', 'Zeta', 'Éter'])
  })

  it('los gastos sin categoría se juntan en «Sin categoría», nunca desaparecen', () => {
    expect(groupExpensesByCategory([g('', 5000), g('   ', 7000), g('Cera', 20000)])).toEqual([
      { cat: 'Cera', amount: 20000, count: 1 },
      { cat: 'Sin categoría', amount: 12000, count: 2 },
    ])
  })

  it('la suma de las categorías da exactamente el total del período', () => {
    const cats = ['Gasolina', 'Cera', '']
    const gastos = Array.from({ length: 30 }, (_, i) =>
      g(cats[i % 3], (i + 1) * 1000, i % 2 ? 'detalle' : ''))
    const grupos = groupExpensesByCategory(gastos)
    expect(grupos.reduce((s, x) => s + x.amount, 0))
      .toBe(gastos.reduce((s, x) => s + x.amount, 0))
    expect(grupos.reduce((s, x) => s + x.count, 0)).toBe(gastos.length)
  })
})

describe('reportLines — gastos detallados (pocos) vs. por categoría (muchos)', () => {
  const D = '2026-08-04'
  const gasto = (i, category, amount) => ({
    id: 'g' + i, date: D, category, description: '', amount: String(amount),
  })
  const render = gastos => {
    const m = reportMetrics({ appts: [], expenses: gastos, inPeriod: d => d === D, from: D, to: D })
    return reportLines({ label: 'período', m, topByDemand: [], stamp: 'X' })
  }
  const tramo = out => out.slice(
    out.findIndex(l => l.startsWith('💸 *Gastos')),
    out.findIndex(l => l.startsWith('• Total gastos:')))

  it('con 8 gastos o menos se lista el detalle, uno por uno', () => {
    const out = render(Array.from({ length: REPORT_EXPENSE_DETAIL_MAX }, (_, i) =>
      gasto(i, i % 2 ? 'Gasolina' : 'Cera', 10000)))
    expect(tramo(out)[0]).toBe('💸 *Gastos*')
    // Ningún renglón trae conteo: sigue siendo el detalle de siempre.
    expect(tramo(out).filter(l => l.startsWith('   - ') && /\(\d\)$/.test(l))).toEqual([])
    expect(tramo(out).filter(l => l.startsWith('   - ')).length).toBe(REPORT_EXPENSE_DETAIL_MAX)
  })

  it('con un gasto más se pasa a «por categoría» con su conteo', () => {
    // 9 gastos: 3 de Gasolina ($30.000) y 6 de Cera ($60.000).
    const out = render(Array.from({ length: REPORT_EXPENSE_DETAIL_MAX + 1 }, (_, i) =>
      gasto(i, i < 3 ? 'Gasolina' : 'Cera', 10000)))
    expect(tramo(out)[0]).toBe('💸 *Gastos (por categoría)*')
    expect(tramo(out)).toContain('   - Cera: *$60.000* (6)')
    expect(tramo(out)).toContain('   - Gasolina: *$30.000* (3)')
    expect(out).toContain('• Total gastos: *$90.000*')
    // Con 2 categorías no aparece ningún «… y más».
    expect(out.some(l => l.includes('… y '))).toBe(false)
  })

  it('la vista agrupada muestra el TOTAL de la categoría, no uno de ellos', () => {
    const out = render([
      gasto(0, 'Gasolina', 30000), gasto(1, 'Gasolina', 50000), gasto(2, 'Cera', 20000),
      gasto(3, 'Cera', 10000), gasto(4, 'Arriendo', 1300000), gasto(5, 'Almuerzo', 22000),
      gasto(6, '', 8000), gasto(7, '', 9000), gasto(8, 'Gasolina', 70000),
    ])
    expect(tramo(out)).toContain('   - Arriendo: *$1.300.000* (1)')
    expect(tramo(out)).toContain('   - Gasolina: *$150.000* (3)')
    expect(tramo(out)).toContain('   - Cera: *$30.000* (2)')
    expect(tramo(out)).toContain('   - Almuerzo: *$22.000* (1)')
    expect(tramo(out)).toContain('   - Sin categoría: *$17.000* (2)')
    // El total del reporte sigue sumando TODO.
    expect(out).toContain('• Total gastos: *$1.519.000*')
  })

  it('la descripción no se pierde del todo: queda en el Excel y en la app', () => {
    // El formato agrupado usa solo la categoría; el detalle de cada gasto
    // vive en el libro (periodLedger) y en el Excel exportado.
    const gastos = Array.from({ length: 9 }, (_, i) => ({
      id: 'g' + i, date: D, category: 'Gasolina', description: 'Cargar tanque',
      amount: '10000',
    }))
    const m = reportMetrics({ appts: [], expenses: gastos, inPeriod: d => d === D, from: D, to: D })
    expect(m.ledger.outs).toHaveLength(9)
    expect(m.ledger.outs[0]).toMatchObject({ who: 'Gasolina', detail: 'Cargar tanque' })
    expect(reportLines({ label: 'x', m, topByDemand: [], stamp: 'X' }))
      .toContain('   - Gasolina: *$90.000* (9)')
  })
})
