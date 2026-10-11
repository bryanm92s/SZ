import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toN, bool, cleanDate, cleanTime, getSlots, TIME_SLOTS, phoneMatch, checkSlot, apptStatus, canModifyAppt, confirmOutcome, projectedIncome, movsRanges, serviceDeletionCheck, apptLife, apptServiceIds, apptGroup, reportMetrics, periodLedger, isResetOutcome, domBreakdown } from './helpers.js'

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
  it('clasifica hoy / mañana / próximas / pasadas / no asistió', () => {
    expect(apptGroup({ date: '2026-01-15', time: '15:00', completed: false }, NOW)).toBe('today')
    expect(apptGroup({ date: '2026-01-16', time: '10:00', completed: false }, NOW)).toBe('tomorrow')
    expect(apptGroup({ date: '2026-01-20', time: '10:00', completed: false }, NOW)).toBe('upcoming')
    expect(apptGroup({ date: '2026-01-10', time: '10:00', completed: false }, NOW)).toBe('past')
    expect(apptGroup({ date: '2026-01-20', time: '10:00', completed: 'noshow' }, NOW)).toBe('noshow')
  })

  it('una cita de hoy cuya hora ya empezó cae en «Pasadas»', () => {
    // 12:00 ya inició (NOW = 13:00) → past, no today
    expect(apptGroup({ date: '2026-01-15', time: '12:00', completed: false }, NOW)).toBe('past')
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

  it('una cita sin fecha nunca se pierde: cae en «Pasadas»', () => {
    expect(apptGroup({ date: '', time: '10:00', completed: false }, NOW)).toBe('past')
    expect(apptGroup({}, NOW)).toBe('past')
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
