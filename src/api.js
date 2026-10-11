const URL   = import.meta.env.VITE_SCRIPT_URL
const TOKEN = import.meta.env.VITE_TOKEN

/* ── Errores de transporte explicables ───────────────────────────
   Apps Script NO soporta varias cuentas de Google en el mismo
   navegador: Google reescribe la URL a /macros/u/N/s/…/exec y
   responde 404 con una página HTML. Enrutado por aquí, en vez de
   dejar "HTTP 404" o "Load failed" a secas, el aviso termina en
   una acción concreta. El texto del servidor (json.error) nunca se
   sustituye: solo se dora el error de red/HTTP de abajo.        */
const MULTI_ACCOUNT_HINT =
  'Hay varias cuentas de Google abiertas en este navegador y Apps Script no lo soporta. ' +
  'Entra en una ventana de incógnito (o cierra las demás cuentas) con solo la cuenta del propietario.'

function httpError(status, finalUrl) {
  if (status === 404) {
    return /\/macros\/u\/\d+\//.test(finalUrl || '')
      ? `HTTP 404: Google reescribió la dirección con /u/N/. ${MULTI_ACCOUNT_HINT}`
      : 'HTTP 404: Apps Script no encontró el Web App. Comprueba la URL y la versión publicada en Apps Script.'
  }
  if (status === 401 || status === 403) return `HTTP ${status}: Google no autorizó la conexión. ${MULTI_ACCOUNT_HINT}`
  if (status === 429) return 'HTTP 429: Google está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.'
  if (status >= 500)  return `HTTP ${status}: Apps Script falló del lado de Google. Reintenta en unos minutos.`
  return `HTTP ${status}`
}

// Toda llamada pasa por aquí: `fallback` es el mensaje si el servidor
// no trae uno propio.
async function call(url, opts, fallback) {
  let res
  try {
    res = await fetch(url, opts)
  } catch(e) {
    throw new Error(
      `Sin respuesta de Apps Script (${(e && e.message) || 'error de red'}). ` +
      `Revisa tu conexión a internet. ${MULTI_ACCOUNT_HINT}`
    )
  }
  if (!res.ok) throw new Error(httpError(res.status, res.url))
  let json
  try { json = await res.json() }
  catch(_) { throw new Error('Apps Script devolvió algo que no es JSON: publica de nuevo la última versión del Web App.') }
  if (!json.ok) throw new Error(json.error || fallback)
  return json.data
}

export async function loadData() {
  if (!URL) throw new Error('VITE_SCRIPT_URL no configurado')
  return call(`${URL}?token=${encodeURIComponent(TOKEN)}&t=${Date.now()}`, { cache:'no-store' }, 'Error cargando datos')
}

export async function saveData(payload) {
  if (!URL) throw new Error('VITE_SCRIPT_URL no configurado')
  return call(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({ token: TOKEN, ...payload }),
  }, 'Error guardando')
}

/* ── Restablecimiento protegido ────────────────────────────────
   El destinatario del correo, el código de recuperación y la
   autorización de reset los decide y valida EXCLUSIVAMENTE el
   backend. Aquí solo se piden y se entregan; nunca hay un secreto
   permanente en el frontend y ninguno de los tres se guarda en
   localStorage ni en React.                                      */
export async function requestResetCode() {
  return saveData({ action: 'requestResetCode' })
}

// Devuelve {grantId, grantSecret, expiresAt} o lanza con el error del servidor.
export async function verifyResetCode(code) {
  return saveData({ action: 'verifyResetCode', code })
}

export async function resetData(grant, services) {
  return saveData({
    action:      'resetData',
    grantId:     grant && grant.grantId,
    grantSecret: grant && grant.grantSecret,
    services,
  })
}
