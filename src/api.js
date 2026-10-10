const URL   = import.meta.env.VITE_SCRIPT_URL
const TOKEN = import.meta.env.VITE_TOKEN

export async function loadData() {
  if (!URL) throw new Error('VITE_SCRIPT_URL no configurado')
  const res  = await fetch(`${URL}?token=${encodeURIComponent(TOKEN)}&t=${Date.now()}`, { cache:'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error||'Error cargando datos')
  return json.data
}

export async function saveData(payload) {
  if (!URL) throw new Error('VITE_SCRIPT_URL no configurado')
  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({ token: TOKEN, ...payload }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error||'Error guardando')
  return json.data
}

/* ── Restablecimiento protegido ────────────────────────────────
   El destinatario del correo, el código de recuperación y la
   autorización de reset los decide y valida EXCLUSIVAMENTE el
   backend. Aquí solo se piden y se entregan; nunca hay un secreto
   permanente en el frontend y ninguno de los tres se guarda en
   localStorage ni en React.                                              */
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
