import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { toN, cleanDate, cleanTime, getSlots, TIME_SLOTS, phoneMatch } from './helpers.js'

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
    expect(slots.every((s) => s.disabled === false)).toBe(true)
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
    const slots = getSlots('2026-01-14', [], [])
    expect(slots.every((s) => s.disabled === false)).toBe(true)
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
