import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { toN, bool, cleanDate, cleanTime, getSlots, TIME_SLOTS, phoneMatch, checkSlot, apptStatus, canModifyAppt, confirmOutcome, projectedIncome, movsRanges, serviceDeletionCheck, apptLife, apptServiceIds } from './helpers.js'

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
