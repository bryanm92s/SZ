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
