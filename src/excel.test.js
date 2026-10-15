/* ══════════════════════════════════════════════════════════════
   Verificación de los componentes de App.jsx que NO son React:
   el libro Excel compartido (reportes + respaldo del reset) y el
   catálogo de paletas. Se importa App.jsx en entorno node: su
   código de módulo es puro (constantes e import.meta.env).
══════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { buildReportWorkbook, PALETTES } from './App.jsx'
import { reportMetrics } from './helpers.js'

const APPT = {
  id: 'a1', clientName: 'Ana', clientPhone: '3001112222',
  serviceIds: 's1', serviceNames: 'Diseño de cejas',
  servicePrice: '50000', servicePrices: '{"s1":50000}',
  totalPrice: '50000', domicilio: 'false', domicilioPrice: '0',
  address: '', date: '2026-03-10', time: '10:00',
  createdAt: '2026-03-01T08:00:00', completed: 'true', paymentMethod: '',
}
const EXP = { id: 'e1', description: 'Tinte', amount: '20000', category: 'Insumos', date: '2026-03-12' }

const metrics = (appts, expenses) => reportMetrics({
  appts, expenses, inPeriod: () => true, from: '', to: '9999-12-31',
})

describe('buildReportWorkbook — fuente única del Excel (reportes y respaldo)', () => {
  it('arma Resumen · Movimientos · Citas con las fórmulas clásicas', async () => {
    const M = metrics([APPT], [EXP])
    const { XLSX, wb } = await buildReportWorkbook({
      M, label: 'Histórico completo (todo el tiempo)', detailAppts: [APPT],
    })
    expect(typeof XLSX.utils.book_append_sheet).toBe('function')
    expect(wb.SheetNames).toEqual(['Resumen', 'Movimientos', 'Citas'])

    // Resumen: etiqueta de período en B2 y totales enlazados a Movimientos.
    const R = wb.Sheets.Resumen
    expect(R.B2.v).toBe('Histórico completo (todo el tiempo)')
    const formulas = Object.values(R).filter(c => c && typeof c.f === 'string').map(c => c.f)
    expect(formulas).toContainEqual(expect.stringContaining('SUMIF(Movimientos!J2:J3'))
    expect(formulas).toContainEqual(expect.stringContaining('Movimientos!F5'))
    expect(formulas).toContainEqual(expect.stringContaining('Movimientos!I5'))
    // TOTAL INGRESOS = servicios + domicilios (referencias internas del Resumen).
    expect(formulas.some(f => /^B\d+\+B\d+$/.test(f))).toBe(true)

    // Movimientos: 2 filas (ingreso + gasto) → datos 2:3, fila en blanco 4,
    // TOTAL en 5 (tRow = n+3) y NETO en 6.
    const V = wb.Sheets.Movimientos
    expect(V.H2.f).toBe('F2+G2')                 // ingreso de la cita
    expect(V.H2.v).toBe(50000)
    expect(V.H5.f).toBe('SUM(H2:H3)'); expect(V.H5.v).toBe(50000)
    expect(V.I5.f).toBe('SUM(I2:I3)'); expect(V.I5.v).toBe(20000)
    expect(V.H6.f).toBe('H5-I5');      expect(V.H6.v).toBe(30000)

    // Citas: la cita completa con su estado y su total.
    const C = wb.Sheets.Citas
    expect(C.A2.v).toBe('2026-03-10')
    expect(C.K2.v).toBe('Completada')
    expect(C.H2.v).toBe(50000)
  })

  it('histórico vacío: SIN fórmulas SUM/SUMIF (evita rangos invertidos)', async () => {
    const M = metrics([], [])
    const { wb } = await buildReportWorkbook({
      M, label: 'Histórico completo (todo el tiempo)', detailAppts: [],
    })
    expect(wb.SheetNames).toEqual(['Resumen', 'Movimientos', 'Citas'])
    const all = Object.values(wb.Sheets).flatMap(ws =>
      Object.values(ws).filter(c => c && typeof c.f === 'string').map(c => c.f))
    expect(all.filter(f => f.includes('SUM(') || f.includes('SUMIF('))).toEqual([])
    // Sin filas no existe la banda de totales en Movimientos.
    expect(wb.Sheets.Movimientos.H5).toBeUndefined()
    expect(wb.Sheets.Citas.A2).toBeUndefined()
  })
})

describe('PALETTES — 9 paletas completas para el selector de Ajustes', () => {
  const REQUIRED = ['id', 'name', 'emoji', 'primary', 'pd', 'pl', 'bg', 'border',
    't', 't2', 'gradient', 'gradientSoft', 'glass', 'glassStrong',
    'neoLight', 'neoDark', 'neoShadow', 'neoShadowDark']

  it('las 9 existen, con id único y los 18 campos que applyTheme vuelca', () => {
    expect(PALETTES).toHaveLength(9)
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(9)
    PALETTES.forEach(p => REQUIRED.forEach(k => expect(p[k], `${p.id}.${k}`).toBeTruthy()))
    expect(PALETTES.map(p => p.id)).toContain('coral')
    expect(PALETTES.map(p => p.id)).toContain('salvia')
    expect(PALETTES.map(p => p.id)).toContain('carbon')
  })
})
