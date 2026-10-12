/* ══════════════════════════════════════════════════════════════
   Catálogo inicial de servicios por tipo de negocio.

   ¿Para qué existe? Para que un despliegue nuevo (otro cliente)
   pueda cambiar el catálogo de ARRANQUE sin tocar el código. El
   catálogo real de cada negocio vive en Google Sheets / localStorage:
   esto solo puebla la lista la PRIMERA vez, cuando todavía no hay
   datos, y vuelve a usarse al restablecer el programa.

   ── Cómo elegir catálogo (Vercel → Environment Variables) ──

   1. `VITE_CATALOG=unas|peluqueria|cejas`
      Un preset de CATALOGS de abajo. Si falta o no existe la
      clave, se usa DEFAULT_CATALOG_KEY (comportamiento original).

   2. `VITE_DEFAULT_SERVICES=[{"name":"…","price":50000,"duration":60}]`
      Lista JSON con los servicios EXACTOS del cliente. Tiene
      prioridad sobre `VITE_CATALOG` y sirve para cualquier negocio
      que no encaje en un preset.

   Reglas de normalización (aplican a preset y a JSON):
     · `name`   → obligatorio; sin nombre se descarta la entrada.
     · `price`  → número entero ≥ 0 (acepta '50000' o 50000.7).
     · `duration` → minutos; si no es válido se usa 30.
   Los identificadores (`id`) los asigna App.jsx en cada arranque.
   ══════════════════════════════════════════════════════════════ */

export const CATALOGS = {
  /* Cejas y pestañas — el catálogo histórico de SZ (sin cambios). */
  cejas: [
    { name: 'Micropigmentación cejas',         price: 350000, duration: 90 },
    { name: 'Retoque micropigmentación cejas', price: 150000, duration: 60 },
    { name: 'Diseño y depilación',             price: 50000,  duration: 30 },
    { name: 'Diseño, depilación y sombreado',  price: 60000,  duration: 30 },
    { name: 'Extensiones de pestañas',         price: 160000, duration: 90 },
    { name: 'Retoque extensiones de pestañas', price: 70000,  duration: 60 },
    { name: 'Lifting de pestañas',             price: 130000, duration: 60 },
    { name: 'Remoción con láser',              price: 200000, duration: 60 },
    { name: 'Laminado de cejas',               price: 130000, duration: 60 },
  ],

  /* Spa de uñas / nail bar */
  unas: [
    { name: 'Esmaltado semipermanente (manos)', price: 45000,  duration: 60 },
    { name: 'Esmaltado semipermanente (pies)',  price: 50000,  duration: 60 },
    { name: 'Retiro de esmalte',                price: 15000,  duration: 30 },
    { name: 'Manicura express',                 price: 35000,  duration: 60 },
    { name: 'Pedicura express',                 price: 45000,  duration: 60 },
    { name: 'Uñas acrílicas (set completo)',    price: 120000, duration: 120 },
    { name: 'Retoque de acrílicas',             price: 70000,  duration: 90 },
    { name: 'Builder gel',                      price: 90000,  duration: 90 },
    { name: 'Relleno de gel',                   price: 60000,  duration: 90 },
    { name: 'Spa de pies',                      price: 60000,  duration: 60 },
    { name: 'Nail art (diseño)',                price: 15000,  duration: 30 },
  ],

  /* Peluquería (dama / caballero / color) */
  peluqueria: [
    { name: 'Corte dama',                price: 45000,  duration: 60 },
    { name: 'Corte caballero',           price: 30000,  duration: 30 },
    { name: 'Lavado y peinado',          price: 40000,  duration: 60 },
    { name: 'Brushing / plancha',        price: 45000,  duration: 60 },
    { name: 'Tinte',                     price: 90000,  duration: 120 },
    { name: 'Mechas / babylights',       price: 180000, duration: 180 },
    { name: 'Alisado / keratina',        price: 250000, duration: 180 },
    { name: 'Tratamiento capilar',       price: 60000,  duration: 60 },
    { name: 'Depilación de cejas',       price: 20000,  duration: 30 },
    { name: 'Peinado de novia / evento',  price: 150000, duration: 120 },
  ],
}

// Preset que se usa cuando VITE_CATALOG no está definida o no existe.
// Es SIEMPRE el catálogo original de SZ: así este refactor no cambia
// nada en el despliegue ya existente.
export const DEFAULT_CATALOG_KEY = 'cejas'

/* Normaliza UNA entrada. Devuelve null si no hay con qué trabajar. */
function normalize(entry) {
  if (!entry || typeof entry !== 'object') return null
  const name = String(entry.name === undefined || entry.name === null ? '' : entry.name).trim()
  if (!name) return null

  const price = Math.max(0, Math.round(Number(entry.price)))
  const rawDur = Math.round(Number(entry.duration))
  const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 30

  return { name, price: Number.isFinite(price) ? price : 0, duration }
}

function normalizeList(list) {
  if (!Array.isArray(list)) return null
  const out = list.map(normalize).filter(Boolean)
  return out.length ? out : null
}

/* ── Resuelve el catálogo de arranque ──
   `catalog`    → valor de VITE_CATALOG (preset).
   `services`   → valor de VITE_DEFAULT_SERVICES (JSON).
   Devuelve SIEMPRE una lista válida con al menos un servicio:
   si el JSON del cliente está roto cae al preset, y si el preset
   no existe cae a DEFAULT_CATALOG_KEY. Nunca lanza. */
export function resolveCatalog({ catalog, services } = {}) {
  // 1) Override explícito del cliente (gana sobre el preset).
  if (services !== undefined && services !== null && String(services).trim() !== '') {
    try {
      const fromJson = normalizeList(JSON.parse(String(services)))
      if (fromJson) return fromJson
    } catch (_) {
      /* JSON inválido → no rompas el arranque: sigue al preset. */
    }
  }

  // 2) Preset conocido.
  const key = String(catalog === undefined || catalog === null ? '' : catalog)
    .trim()
    .toLowerCase()
  const preset = Object.prototype.hasOwnProperty.call(CATALOGS, key)
    ? CATALOGS[key]
    : CATALOGS[DEFAULT_CATALOG_KEY]

  // 3) Red de seguridad: el preset por defecto está a mano.
  return normalizeList(preset) || normalizeList(CATALOGS.cejas) || []
}
