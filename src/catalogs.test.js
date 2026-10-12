import { describe, it, expect } from 'vitest'
import { CATALOGS, DEFAULT_CATALOG_KEY, resolveCatalog } from './catalogs.js'

/* ── Presets ─────────────────────────────────────────────────── */
describe('CATALOGS', () => {
  it('expone los presets documentados', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([
      'barberia', 'cejas', 'depilacion', 'estetica', 'maquillaje', 'masajes',
      'peluqueria', 'unas',
    ])
  })

  it('el preset por defecto es el catálogo histórico de SZ (sin cambios)', () => {
    expect(DEFAULT_CATALOG_KEY).toBe('cejas')
    expect(resolveCatalog()).toEqual(
      CATALOGS.cejas.map(s => ({ ...s, price: expect.any(Number), duration: expect.any(Number) }))
    )
    expect(resolveCatalog()).toHaveLength(9)
    expect(resolveCatalog()[0]).toEqual({
      name: 'Micropigmentación cejas', price: 350000, duration: 90,
    })
  })

  it('cada preset es usable tal cual: nombre, precio y duración válidos', () => {
    for (const [key, list] of Object.entries(CATALOGS)) {
      expect(Array.isArray(list), key).toBe(true)
      expect(list.length, key).toBeGreaterThan(0)
      for (const s of list) {
        expect(String(s.name).trim(), `${key} › ${s.name}`).not.toBe('')
        expect(Number.isFinite(s.price), `${key} › ${s.name}`).toBe(true)
        expect(s.price).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(s.duration), `${key} › ${s.name}`).toBe(true)
        expect(s.duration).toBeGreaterThan(0)
      }
      // Nombres únicos dentro de cada preset: dos servicios iguales
      // harían ambigua la regla de borrado con citas futuras.
      const names = list.map(s => s.name)
      expect(new Set(names).size, key).toBe(names.length)
    }
  })

  it('las duraciones caen en DURATION_OPTIONS (30…180)', () => {
    const allowed = [30, 60, 90, 120, 150, 180]
    for (const [key, list] of Object.entries(CATALOGS)) {
      for (const s of list) expect(allowed, `${key} › ${s.name}`).toContain(s.duration)
    }
  })
})

/* ── Selección por preset ────────────────────────────────────── */
describe('resolveCatalog — presets', () => {
  it('elige el preset que se le pida', () => {
    expect(resolveCatalog({ catalog: 'unas' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'Peluqueria' })).toEqual(CATALOGS.peluqueria)  // clave sin tilde: coincide
  })

  it('solo distingue mayúsculas/minúsculas y espacios', () => {
    expect(resolveCatalog({ catalog: '  UNAS ' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'PELUQUERIA' })).toEqual(CATALOGS.peluqueria)
  })

  it('una clave desconocida cae al catálogo por defecto, sin romper', () => {
    expect(resolveCatalog({ catalog: 'veterinaria' })).toEqual(CATALOGS.cejas)
    expect(resolveCatalog({ catalog: '' })).toEqual(CATALOGS.cejas)
    expect(resolveCatalog({ catalog: null })).toEqual(CATALOGS.cejas)
    expect(resolveCatalog({ catalog: undefined })).toEqual(CATALOGS.cejas)
  })

  it('devuelve copias: mutar el resultado no contamina el preset', () => {
    const a = resolveCatalog({ catalog: 'unas' })
    a[0].name = 'ROCADO'
    expect(CATALOGS.unas[0].name).not.toBe('ROCADO')
  })
})

/* ── Override por JSON (VITE_DEFAULT_SERVICES) ───────────────── */
describe('resolveCatalog — override JSON del cliente', () => {
  const JSON_OK = '[{"name":"Corte","price":45000,"duration":60},{"name":"Tinte","price":"90000","duration":120}]'

  it('el JSON del cliente tiene prioridad sobre el preset', () => {
    const out = resolveCatalog({ catalog: 'unas', services: JSON_OK })
    expect(out).toEqual([
      { name: 'Corte',  price: 45000,  duration: 60 },
      { name: 'Tinte',  price: 90000,  duration: 120 },   // precio en texto → número
    ])
  })

  it('normaliza precio y duración y descarta entradas sin nombre', () => {
    const out = resolveCatalog({
      services: JSON.stringify([
        { name: '  Manicura  ', price: '12.500,5' },
        { name: '' },
        { price: 1000, duration: 30 },
        null,
        'texto suelto',
        { name: 'Sin precio', duration: 0 },
      ]),
    })
    expect(out).toEqual([
      { name: 'Manicura',  price: 0, duration: 30 },   // '12.500,5' no es número → 0; duración ausente → 30
      { name: 'Sin precio', price: 0, duration: 30 },  // duration 0 inválido → 30
    ])
  })

  it('precio negativo se recorta a 0', () => {
    expect(resolveCatalog({ services: '[{"name":"X","price":-500,"duration":30}]' }))
      .toEqual([{ name: 'X', price: 0, duration: 30 }])
  })

  it('JSON roto cae al preset en vez de reventar el arranque', () => {
    expect(resolveCatalog({ catalog: 'unas', services: '{no es json' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: '"soy un string"' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: '[{}]' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: '[]' })).toEqual(CATALOGS.unas)
  })

  it('JSON vacío o ausente se ignora (usa el preset)', () => {
    expect(resolveCatalog({ catalog: 'unas', services: '' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: '   ' })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: null })).toEqual(CATALOGS.unas)
    expect(resolveCatalog({ catalog: 'unas', services: undefined })).toEqual(CATALOGS.unas)
  })

  it('el override también funciona sin preset (el JSON es todo)', () => {
    expect(resolveCatalog({ services: '[{"name":"Único","price":1,"duration":30}]' }))
      .toEqual([{ name: 'Único', price: 1, duration: 30 }])
  })
})
