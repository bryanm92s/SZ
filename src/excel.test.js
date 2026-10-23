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

describe('PALETTES — 12 paletas completas para el selector de Ajustes', () => {
  const REQUIRED = ['id', 'name', 'emoji', 'primary', 'pd', 'pl', 'bg', 'border',
    't', 't2', 'gradient', 'gradientSoft', 'glass', 'glassStrong',
    'neoLight', 'neoDark', 'neoShadow', 'neoShadowDark']

  it('las 12 existen, con id único y los 18 campos que applyTheme vuelca', () => {
    expect(PALETTES).toHaveLength(12)
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(12)
    PALETTES.forEach(p => REQUIRED.forEach(k => expect(p[k], `${p.id}.${k}`).toBeTruthy()))
    expect(PALETTES.map(p => p.id)).toContain('rosa')
    expect(PALETTES.map(p => p.id)).toContain('salvia')
    expect(PALETTES.map(p => p.id)).toContain('carbon')
    expect(PALETTES.map(p => p.id)).toContain('marino')
  })

  it('rosa es el palo de rosa fusionado (ex rosa + coral), legible sobre su tinte', () => {
    const r = PALETTES.find(p => p.id === 'rosa')
    expect(r.name).toBe('Palo de Rosa')
    expect(r.primary).toBe('#A84B60')
    expect(r.pl).toBe('#FAE9ED')
  })

  it('coral y crema se retiraron (fusión coral+rosa y limpieza de temas)', () => {
    expect(PALETTES.map(p => p.id)).not.toContain('coral')
    expect(PALETTES.map(p => p.id)).not.toContain('crema')
  })

  it('barberia: los 4 colores del logo — blanco, negro, azul y rojo', () => {
    const b = PALETTES.find(p => p.id === 'barberia')
    // Fondo claro (no reescribe superficies: usa los blancos por defecto)
    expect(b.card).toBeUndefined()
    expect(b.chromeBgr).toBeUndefined()
    expect(b.bg).toBe('#FCFCFD')                 // blanco
    expect(b.pd).toBe('#10192B')                 // negro en el gradiente
    expect(b.primary).toBe('#1D4FD7')             // azul de los botones
    expect(b.red).toBe('#C8102E')                // acento rojo barbería (override)
    expect(b.gradient).toContain('#10192B')      // gradiente negro→azul→rojo
    expect(b.gradient).toContain('#1D4FD7')
    expect(b.gradient).toContain('#C8102E')
  })

  it('gala: crema champán + oro antiguo (claro elegante, nada de amarillo ni negro)', () => {
    const g = PALETTES.find(p => p.id === 'gala')
    expect(g.name).toBe('Gala')
    expect(g.emoji).toBe('🎩')
    // Oro ANTIGUO profundo y crema champán del encargo
    expect(g.primary).toBe('#8A6A1C')            // oro antiguo (no amarillo)
    expect(g.pd).toBe('#5C4712')                 // bronce del gradiente
    expect(g.pl).toBe('#F9F3E6')                 // tinte champán (4.6:1 con el oro)
    expect(g.bg).toBe('#F8F2E5')                 // fondo crema champán (no negro)
    expect(g.t).toBe('#1A1B1F')                  // carbón del encargo
    expect(g.t2).toBe('#6B6355')                 // gris taupe
    expect(g.gradientSoft).toContain('#F5E6C8') // el champán exacto del encargo
    // Tema CLARO: sin overrides de superficies ni de texto (blanco sobre oro pasa 5-8.9:1)
    expect(g.card).toBeUndefined()
    expect(g.gradT).toBeUndefined()
    expect(g.gradient).toContain('#5C4712')
    expect(g.gradient).toContain('#8A6A1C')
  })

  it('emojis: Barbería usa el símbolo de barbería; Carbón el punto negro', () => {
    const b = PALETTES.find(p => p.id === 'barberia')
    const c = PALETTES.find(p => p.id === 'carbon')
    expect(b.emoji).toBe('💈')
    expect(c.emoji).toBe('⚫')
  })

  it('burdeos: negro azabache, espresso, terciopelo burdeos y oro (oscuro elegante)', () => {
    const b = PALETTES.find(p => p.id === 'burdeos')
    expect(b.name).toBe('Burdeos')
    expect(b.emoji).toBe('🍷')
    // Los 5 colores del encargo
    expect(b.bg).toBe('#111114')                 // negro azabache
    expect(b.surface).toBe('#2A1A12')            // espresso
    expect(b.gold).toBe('#C9A227')               // oro
    expect(b.t).toBe('#F7DFA3')                  // champán
    expect(b.gradientSoft).toContain('#6B1E2E') // terciopelo burdeos en el gradiente suave
    // El ORO es el primario (el vino no lee como texto sobre oscuro); texto negro sobre los rellenos dorados
    expect(b.primary).toBe('#C9A227')
    expect(b.pl).toBe('#2B151D')                  // tinte burdeos de chips/KPI: oro sobre él = 7.1:1
    expect(b.gradT).toBe('#111114')
    expect(b.gradT2).toBe('rgba(17, 17, 20, 0.75)')
    expect(b.card).toBe('#1C1611')
    expect(b.inputBg).toBe('#17110D')
    // Gradiente del botón: bronce→oro con texto negro (4.8-11:1 por parada)
    expect(b.gradient).toContain('#9C7D1F')
    expect(b.gradient).toContain('#C9A227')
  })
})
