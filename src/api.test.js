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
