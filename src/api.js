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
      : 'HTTP 404: Apps Script no encontró el Web App. Comprueba que la URL termine en /exec y publica de nuevo la última versión (Implementar → Administrar implementaciones).'
  }
  if (status === 401 || status === 403) return `HTTP ${status}: Google no autorizó la conexión. ${MULTI_ACCOUNT_HINT}`
  if (status === 429) return 'HTTP 429: Google está limitando las peticiones. Espera unos minutos y vuelve a intentarlo.'
  if (status >= 500)  return `HTTP ${status}: Apps Script falló del lado de Google. Reintenta en unos minutos.`
  return `HTTP ${status}`
}

/* ── Tope de espera (25 s) ───────────────────────────────────────
    Apps Script a veces no responde: arranque en frío, límite de
    peticiones de Google o una respuesta sin cabeceras CORS. Sin tope,
    el spinner se queda ahí indefinidamente. A los 25 s se aborta la
    petición y el llamador recibe un error NORMAL — y lo reintenta por
    su cuenta (loadData, sync y el borrado del evento de Calendar ya
    reintentan solos los fallos transitorios).

    El MENSAJE que ve la operadora es simple y sin jerga; el detalle
    técnico (tope, arranque en frío) va a la CONSOLA del navegador,
    para quien diagnostica.                                          */
const TIMEOUT_MS = 25000

const TIMEOUT_MSG =
  'Google no respondió a tiempo. La app reintentó sola y no logró conectar: ' +
  'revisa el internet, espera unos segundos y vuelve a intentar. ' +
  'Mientras tanto, todo queda guardado en este dispositivo.'

// Toda llamada pasa por aquí: `fallback` es el mensaje si el servidor
// no trae uno propio.
async function call(url, opts, fallback) {
  let res
  // `finally` cancela el temporizador en cualquier salida: tras una
  // respuesta normal no queda ningún aborto pendiente.
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null
  try {
    res = await fetch(url, ctrl ? { ...(opts || {}), signal: ctrl.signal } : opts)
  } catch(e) {
    if (e && (e.name === 'AbortError' || e.code === 20)) {
      // El detalle técnico es para quien diagnostica; la operadora ve el
      // mensaje simple de arriba.
      console.warn('SZ: tope de espera de ' + Math.round(TIMEOUT_MS / 1000) +
        ' s — probablemente arranque en frío o límite de peticiones de Google.')
      throw new Error(TIMEOUT_MSG)
    }
    throw new Error(
      `Sin respuesta de Apps Script (${(e && e.message) || 'error de red'}). ` +
      `Revisa tu conexión a internet. ${MULTI_ACCOUNT_HINT}`
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!res.ok) throw new Error(httpError(res.status, res.url))
  let json
  try { json = await res.json() }
  catch(_) { throw new Error('Apps Script devolvió algo que no es JSON: publica de nuevo la última versión del Web App.') }
  if (!json.ok) throw new Error(json.error || fallback)
  return json.data
}

/* ── Reintento automático para cargas ────────────────────────────
    Los fallos de Apps Script suelen ser TRANSITORIOS: el arranque
    en frío de la mañana (el script lleva toda la noche sin correr)
    o un 404 mientras se actualiza el despliegue. Como la app
    refresca cada 30 s, cada fallo puntual se convertía en el banner
    «Modo sin conexión» aunque el segundo intento hubiera bastado.
    Ahora loadData reintenta UNA vez (4 s después) antes de declarar
    el error: si el reintento llega, el usuario nunca ve el aviso.
    Los guardados NO se reintentan solos: para eso está el banner
    rojo «Reintentar guardar», que además reenvía el mismo payload. */
const RETRY_DELAY_MS = 4000
const isTransient = msg => /no respondió en \d+ s|HTTP \d{3}/.test(msg || '')
// Exportado para que la app clasifique igual otros fallos de transporte
// (p. ej. el borrado del evento de Calendar) sin duplicar el patrón.
export const isTransientError = isTransient

async function callWithRetry(url, opts, fallback) {
  try {
    return await call(url, opts, fallback)
  } catch (e) {
    if (!isTransient(e.message)) throw e
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    return call(url, opts, fallback)
  }
}

export async function loadData() {
  if (!URL) throw new Error('VITE_SCRIPT_URL no configurado')
  const qs = `token=${encodeURIComponent(TOKEN)}&t=${Date.now()}`
  return callWithRetry(`${URL}?${qs}`, { cache:'no-store' }, 'Error cargando datos')
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

/* ── Recordatorio manual confirmado ────────────────────────────────
   Registra en la hoja «Recordatorios» del servidor la AFIRMACIÓN de
   la operadora de que ya envió el recordatorio desde su propio
   WhatsApp (abrir wa.me no prueba nada — la operadora responde «sí,
   ya lo envié» a una pregunta explícita de la app). Con el respaldo
   automático armado, esta confirmación bloquea el envío por Cloud
   API de ESA cita. Es una afirmación de la operadora, nunca una
   entrega verificada.                                            */
export async function confirmManualReminder(appointmentId) {
  return saveData({ action: 'confirmManualReminder', appointmentId })
}
