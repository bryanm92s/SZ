import { describe, it, expect, vi, afterEach } from 'vitest'

/* ── Errores de transporte (src/api.js) ───────────────────────────
   El objetivo no es el texto literal: es que un fallo opaco de Apps
   Script ("HTTP 404", "Load failed") se traduzca a algo accionable
   y que, en cambio, el mensaje QUE VIENE DEL SERVIDOR se transmita
   tal cual (ese es el que explica "Código inválido", "Demasiados
   intentos", etc., y no se debe tapar).                          */

const ENDPOINT = 'https://script.google.com/macros/s/ABC123/exec'

const ok = (data, url = ENDPOINT) => ({
  ok: true, status: 200, url, json: async () => ({ ok: true, data }),
})

async function loadApi() {
  vi.resetModules()
  vi.stubEnv('VITE_SCRIPT_URL', ENDPOINT)
  vi.stubEnv('VITE_TOKEN', 'token-de-prueba')
  return import('./api.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('api: traducción de errores de transporte', () => {
  it('404 con URL reescrita a /u/N/ → avisa de las cuentas múltiples de Google', async () => {
    const { saveData } = await loadApi()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      url: `${ENDPOINT.replace('/macros/', '/macros/u/1/')}`,
      json: async () => { throw new Error('no es JSON') },
    })))

    await expect(saveData({ action: 'verifyResetCode', code: 'ABCD' }))
      .rejects.toThrow(/\/u\/N\//)
    expect(await saveData({ action: 'x' }).catch(e => e.message))
      .toMatch(/cuentas de Google/)
    expect(await saveData({ action: 'x' }).catch(e => e.message))
      .toMatch(/incógnito/)
  })

  it('404 con URL limpia → apunta a la URL/versión publicada del Web App', async () => {
    const { saveData } = await loadApi()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, url: ENDPOINT, json: async () => ({}),
    })))

    const msg = await saveData({ action: 'verifyResetCode', code: 'ABCD' }).catch(e => e.message)
    expect(msg).toMatch(/no encontró el Web App/)
    expect(msg).not.toMatch(/incógnito/)
  })

  it('rechazo de red (Load failed) → explica que no hubo respuesta', async () => {
    const { saveData } = await loadApi()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed') }))

    const msg = await saveData({ action: 'verifyResetCode', code: 'ABCD' }).catch(e => e.message)
    expect(msg).toMatch(/Sin respuesta de Apps Script \(Load failed\)/)
    expect(msg).toMatch(/cuentas de Google/)
  })

  it('5xx → dice que el fallo es de Google y que se reintente', async () => {
    const { loadData } = await loadApi()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 503, url: ENDPOINT, json: async () => ({}),
    })))

    await expect(loadData()).rejects.toThrow(/Apps Script falló del lado de Google/)
  })

  it('respuesta 200 que no es JSON → pide publicar de nuevo el Web App', async () => {
    const { saveData } = await loadApi()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, url: ENDPOINT, json: async () => { throw new Error('bad token <html>') },
    })))

    await expect(saveData({ action: 'verifyResetCode', code: 'ABCD' }))
      .rejects.toThrow(/no es JSON/)
  })
})

describe('api: lo que decide el servidor se respeta sin traducir', () => {
  it('el error del backend llega intacto (seguridad del reset)', async () => {
    const { saveData } = await loadApi()
    // Mismo texto que emite Code.gs para un código malo:
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, url: ENDPOINT,
      json: async () => ({ ok: false, error: 'Demasiados intentos. Intenta de nuevo más tarde.' }),
    })))

    await expect(saveData({ action: 'verifyResetCode', code: 'XXXX' }))
      .rejects.toThrow('Demasiados intentos. Intenta de nuevo más tarde.')
  })

  it('el grant del backend se devuelve tal cual', async () => {
    const { verifyResetCode, requestResetCode } = await loadApi()
    const grant = { grantId: 'g1', grantSecret: 's1', expiresAt: 123 }
    vi.stubGlobal('fetch', vi.fn(async () => ok(grant)))

    await expect(verifyResetCode('ABCD1234')).resolves.toEqual(grant)
    await expect(requestResetCode()).resolves.toBeDefined()
  })
})

/* ── Tope de espera (src/api.js) ────────────────────────────────
    El spinner «Guardando y creando evento en Calendar…» no puede
    quedarse ahí para siempre: si Apps Script no responde (arranque en
    frío, límite de peticiones o una respuesta CORS sin cabeceras), la
    petición se aborta a los 25 s y el llamador recibe un error normal.
    El MENSAJE es simple y sin jerga para la operadora (el detalle
    técnico va a console.warn), y sync/loadData reintentan solos antes
    de que el error siquiera se muestre.                              */
describe('api: tope de espera de 25 s', () => {
  it('si Apps Script no responde, se cancela con un mensaje SIMPLE para la clienta (sin jerga técnica)', async () => {
    const { saveData } = await loadApi()
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn((_u, opts) => new Promise((_res, reject) => {
      // Un fetch "colgado": solo resuelve cuando lo aborten.
      opts.signal.addEventListener('abort', () => {
        const e = new Error('The operation was aborted')
        e.name = 'AbortError'
        reject(e)
      })
    })))

    const pending = saveData({ clients: [] }).catch(e => e.message)
    await vi.advanceTimersByTimeAsync(25000)
    const msg = await pending

    // Lenguaje simple: qué pasó, qué hacer y que nada se pierde.
    expect(msg).toMatch(/Google no respondió a tiempo/)
    expect(msg).toMatch(/revisa el internet/i)
    expect(msg).toMatch(/queda guardado en este dispositivo/)
    // Sin la jerga técnica que confundía a la clienta.
    expect(msg).not.toMatch(/Apps Script/)
    expect(msg).not.toMatch(/25 s/)
    expect(msg).not.toMatch(/arranque en frío/)
    // El detalle técnico se fue a la consola, para quien diagnostica.
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/tope de espera/)
    // No se confunde con el fallo de red: son mensajes (y soluciones) distintos.
    expect(msg).not.toMatch(/Sin respuesta de Apps Script/)
    vi.useRealTimers()
  })

  it('una respuesta normal limpia el temporizador (no queda aborto pendiente)', async () => {
    const { loadData } = await loadApi()
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ok({ clients: [] })))

    await expect(loadData()).resolves.toEqual({ clients: [] })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})

/* ── Reintento automático de cargas (callWithRetry, loadData) ────
   El arranque en frío de la mañana y los 404 puntuales al
   actualizarse el despliegue son TRANSITORIOS: loadData reintenta
   UNA vez (4 s después) antes de declarar el error, así el banner
   «Modo sin conexión» casi nunca aparece. Los guardados no se
   reintentan solos (para eso está la franja roja manual) y los
   errores del SERVIDOR (JSON ok:false, p. ej. token malo) tampoco. */
describe('api: reintento automático de cargas', () => {
  it('un 404 transitorio se reintenta y la carga llega sin aviso', async () => {
    const { loadData } = await loadApi()
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, url: ENDPOINT, json: async () => ({}) })
      .mockResolvedValueOnce(ok({ clients: [{ id: 'c1' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = loadData()
    await vi.advanceTimersByTimeAsync(4000)
    await expect(pending).resolves.toEqual({ clients: [{ id: 'c1' }] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('un fallo persistente reintenta UNA sola vez y entonces falla', async () => {
    const { loadData } = await loadApi()
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, url: ENDPOINT, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = loadData().catch(e => e.message)
    await vi.advanceTimersByTimeAsync(4000)
    const msg = await pending
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(msg).toMatch(/no encontró el Web App/)
    vi.useRealTimers()
  })

  it('el error del servidor (JSON ok:false) NO se reintenta', async () => {
    const { loadData } = await loadApi()
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, url: ENDPOINT,
      json: async () => ({ ok: false, error: 'Token de sincronización no configurado' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const msg = await loadData().catch(e => e.message)
    expect(msg).toBe('Token de sincronización no configurado')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
