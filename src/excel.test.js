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
    expect(g.primary).toBe('#846317')            // oro antiguo (no amarillo)
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
    expect(g.gradient).toContain('#846317')
  })

  it('emojis: Barbería usa el símbolo de barbería; Carbón el punto negro', () => {
    const b = PALETTES.find(p => p.id === 'barberia')
    const c = PALETTES.find(p => p.id === 'carbon')
    expect(b.emoji).toBe('💈')
    expect(c.emoji).toBe('⚫')
  })

  it('burdeos: tema claro crema con VINO de primario y espresso en el texto (sin dorados)', () => {    const b = PALETTES.find(p => p.id === 'burdeos')
    expect(b.name).toBe('Burdeos')
    expect(b.emoji).toBe('🍷')
    // El vino es el primario (el oro se retiró por petición)
    expect(b.primary).toBe('#6B1E2E')
    expect(b.pd).toBe('#4A1520')                // burdeos profundo del gradiente
    expect(b.pl).toBe('#F5E2E5')                // tinte rosado: vino sobre él = 9.1:1
    // Tema CLARO: crema cálido y superficies blancas por defecto
    expect(b.bg).toBe('#FAF3F0')
    expect(b.t).toBe('#2A1A12')                 // espresso
    expect(b.t2).toBe('#756058')
    expect(b.card).toBeUndefined()
    expect(b.gradT).toBeUndefined()             // texto blanco por defecto sobre el vino
    // Gradiente de botones: vino→burdeos con texto blanco (8.5-14.8:1)
    expect(b.gradient).toContain('#4A1520')
    expect(b.gradient).toContain('#6B1E2E')
    expect(b.gradient).not.toContain('#C9A227') // ni rastro del oro
  })
})

describe('PALETTES — contraste AA por paleta (regresión de la auditoría UX/UI)', () => {
  const lum = h => {
    const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
  }
  const cr = (a, b) => {
    const x = lum(a), y = lum(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  const WHITE = '#FFFFFF'
  const stops = g => [...String(g).matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0])

  it('el primario lee como texto sobre blanco, su tinte (pl) y su fondo', () => {
    for (const p of PALETTES) {
      for (const ground of [WHITE, p.pl, p.bg]) {
        expect(cr(p.primary, ground), `${p.id}: primary sobre ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('t y t2 leen sobre el fondo del tema', () => {
    for (const p of PALETTES) {
      expect(cr(p.t, p.bg), `${p.id}: t sobre bg`).toBeGreaterThanOrEqual(4.5)
      expect(cr(p.t2, p.bg), `${p.id}: t2 sobre bg`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gradiente legible de punta a punta: paradas de texto (todas menos la última) >=4.5 con el texto, punta >=3.0 (WCAG 1.4.11 componentes)', () => {
    for (const p of PALETTES) {
      const s = stops(p.gradient)
      const gt = p.gradT || WHITE
      for (let i = 0; i < s.length - 1; i++) {
        expect(cr(gt, s[i]), `${p.id}: texto sobre ${s[i]}`).toBeGreaterThanOrEqual(4.5)
      }
      const tip = s[s.length - 1]
      expect(cr(gt, tip), `${p.id}: punta decorativa ${tip}`).toBeGreaterThanOrEqual(3.0)
    }
  })

  it('la tarjeta de balance (primary→pd) lee con el texto del gradiente', () => {
    for (const p of PALETTES) {
      const gt = p.gradT || WHITE
      expect(cr(gt, p.primary), `${p.id}: texto sobre primary`).toBeGreaterThanOrEqual(4.5)
      expect(cr(gt, p.pd), `${p.id}: texto sobre pd`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('los semánticos (gold/green/red/warn) leen sobre sus fondos', () => {
    for (const p of PALETTES) {
      expect(cr(p.gold ?? '#8A6700', p.goldBg ?? '#FFF8E6'), `${p.id}: gold`).toBeGreaterThanOrEqual(4.5)
      expect(cr(p.green ?? '#2E7D52', p.greenBg ?? '#F2FBF6'), `${p.id}: green`).toBeGreaterThanOrEqual(4.5)
      expect(cr(p.red ?? '#B03030', p.redBg ?? '#FFF0F0'), `${p.id}: red`).toBeGreaterThanOrEqual(4.5)
      expect(cr(p.warnT ?? '#7A5000', p.warnBg ?? '#FFF4DC'), `${p.id}: warn`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
