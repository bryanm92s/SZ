import { useState, useEffect, useCallback, useRef } from 'react'
import { loadData, saveData } from './api.js'
// Helpers puros extraídos para poder testearlos sin React:
import {
  toN, localDateStr, todayStr, tomorrowStr, monthStr, localNowISO,
  bool, phoneMatch, cleanDate, fmtDate, cleanTime, fmtTime, getSlots, periodLedger, monthLedger,
  svcDuration, sumDuration, apptDuration, fmtDuration, endTime, CLOSING_TIME, openWhatsApp, PAYMENT_METHODS, payMethodOf,
} from './helpers.js'

/* ══════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS  (los helpers puros viv en src/helpers.js)
══════════════════════════════════════════════════════════════ */

/* ── Theme System ── Modern Flat + Neumorphism + Glassmorphism ── */
const PALETTES = [
  { 
    id:'rosa',    
    name:'Rosa',    
    emoji:'🌸', 
    primary:'#B5524A', 
    pd:'#8E3E38', 
    pl:'#FAEAE8', 
    bg:'#F7F0EC', 
    border:'#E8D0CC', 
    t:'#1E0E0C', 
    t2:'#7A5E5A',
    gradient:'linear-gradient(135deg, #B5524A 0%, #D47A6A 50%, #E8A898 100%)',
    gradientSoft:'linear-gradient(135deg, #FAEAE8 0%, #F7F0EC 50%, #E8D0CC 100%)',
    glass:'rgba(181, 82, 74, 0.12)',
    glassStrong:'rgba(181, 82, 74, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#E8D0CC',
    neoShadow:'rgba(181, 82, 74, 0.15)',
    neoShadowDark:'rgba(142, 62, 56, 0.2)'
  },
  { 
    id:'morado',  
    name:'Morado',  
    emoji:'💜', 
    primary:'#7C4DBD', 
    pd:'#5D3A8E', 
    pl:'#EDE6F8', 
    bg:'#F4F0FA', 
    border:'#D8CFF0', 
    t:'#1A1228', 
    t2:'#6A5A80',
    gradient:'linear-gradient(135deg, #7C4DBD 0%, #9B6FD8 50%, #B898F0 100%)',
    gradientSoft:'linear-gradient(135deg, #EDE6F8 0%, #F4F0FA 50%, #D8CFF0 100%)',
    glass:'rgba(124, 77, 189, 0.12)',
    glassStrong:'rgba(124, 77, 189, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#D8CFF0',
    neoShadow:'rgba(124, 77, 189, 0.15)',
    neoShadowDark:'rgba(93, 58, 142, 0.2)'
  },
  { 
    id:'azul',    
    name:'Azul',    
    emoji:'💙', 
    primary:'#3A6FBD', 
    pd:'#2A5290', 
    pl:'#E6EEF8', 
    bg:'#F0F4FA', 
    border:'#C8D8EE', 
    t:'#0E1A2C', 
    t2:'#5A6A80',
    gradient:'linear-gradient(135deg, #3A6FBD 0%, #5A8FD8 50%, #8AAEF0 100%)',
    gradientSoft:'linear-gradient(135deg, #E6EEF8 0%, #F0F4FA 50%, #C8D8EE 100%)',
    glass:'rgba(58, 111, 189, 0.12)',
    glassStrong:'rgba(58, 111, 189, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#C8D8EE',
    neoShadow:'rgba(58, 111, 189, 0.15)',
    neoShadowDark:'rgba(42, 82, 144, 0.2)'
  },
  { 
    id:'verde',   
    name:'Verde',   
    emoji:'💚', 
    primary:'#2E7D52', 
    pd:'#1F5C3C', 
    pl:'#E6F5EC', 
    bg:'#F0F8F4', 
    border:'#C0E0CC', 
    t:'#0A1E14', 
    t2:'#4A7060',
    gradient:'linear-gradient(135deg, #2E7D52 0%, #4A9D6E 50%, #7AC898 100%)',
    gradientSoft:'linear-gradient(135deg, #E6F5EC 0%, #F0F8F4 50%, #C0E0CC 100%)',
    glass:'rgba(46, 125, 82, 0.12)',
    glassStrong:'rgba(46, 125, 82, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#C0E0CC',
    neoShadow:'rgba(46, 125, 82, 0.15)',
    neoShadowDark:'rgba(31, 92, 60, 0.2)'
  },
  { 
    id:'dorado',  
    name:'Dorado',  
    emoji:'✨', 
    primary:'#A07820', 
    pd:'#785A14', 
    pl:'#FAF4E0', 
    bg:'#FAF6EE', 
    border:'#E8DEB8', 
    t:'#1E1A0C', 
    t2:'#7A7040',
    gradient:'linear-gradient(135deg, #A07820 0%, #C49A2A 50%, #E8C858 100%)',
    gradientSoft:'linear-gradient(135deg, #FAF4E0 0%, #FAF6EE 50%, #E8DEB8 100%)',
    glass:'rgba(160, 120, 32, 0.12)',
    glassStrong:'rgba(160, 120, 32, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#E8DEB8',
    neoShadow:'rgba(160, 120, 32, 0.15)',
    neoShadowDark:'rgba(120, 90, 20, 0.2)'
  },
  { 
    id:'fucsia',  
    name:'Fucsia',  
    emoji:'🌺', 
    primary:'#C04A82', 
    pd:'#903060', 
    pl:'#FCE6F2', 
    bg:'#FDF0F8', 
    border:'#ECC8DF', 
    t:'#1E0C18', 
    t2:'#7A5070',
    gradient:'linear-gradient(135deg, #C04A82 0%, #D86AA0 50%, #F098C8 100%)',
    gradientSoft:'linear-gradient(135deg, #FCE6F2 0%, #FDF0F8 50%, #ECC8DF 100%)',
    glass:'rgba(192, 74, 130, 0.12)',
    glassStrong:'rgba(192, 74, 130, 0.25)',
    neoLight:'#FFFFFF',
    neoDark:'#ECC8DF',
    neoShadow:'rgba(192, 74, 130, 0.15)',
    neoShadowDark:'rgba(144, 48, 96, 0.2)'
  },
]

const applyTheme = (pid) => {
  const p = PALETTES.find(x=>x.id===pid)||PALETTES[0]
  const r = document.documentElement.style
  
  r.setProperty('--primary',   p.primary)
  r.setProperty('--primary-d', p.pd)
  r.setProperty('--primary-l', p.pl)
  r.setProperty('--bg',        p.bg)
  r.setProperty('--card',      '#FFFFFF')
  r.setProperty('--surface',   '#FFFFFF')
  r.setProperty('--border',    p.border)
  r.setProperty('--t',         p.t)
  r.setProperty('--t2',        p.t2)
  r.setProperty('--green',     '#2E7D52')
  r.setProperty('--green-bg',  '#EDF7F0')
  r.setProperty('--gold',      '#C49A1A')
  r.setProperty('--gold-bg',   '#FFF8E6')
  r.setProperty('--red',       '#B03030')
  r.setProperty('--red-bg',    '#FFF0F0')
  r.setProperty('--warn-bg',   '#FFF4DC')
  r.setProperty('--warn-t',    '#7A5000')
  r.setProperty('--input-bg',  '#FFFFFF')
  
  /* ── Gradient & Glassmorphism ── */
  r.setProperty('--gradient',       p.gradient)
  r.setProperty('--gradient-soft',  p.gradientSoft)
  r.setProperty('--glass',          p.glass)
  r.setProperty('--glass-strong',   p.glassStrong)
  
  /* ── Neumorphism ── */
  r.setProperty('--neo-light',      p.neoLight)
  r.setProperty('--neo-dark',       p.neoDark)
  r.setProperty('--neo-shadow',     p.neoShadow)
  r.setProperty('--neo-shadow-dark',p.neoShadowDark)
  
  /* ── Flat shadows ── */
  r.setProperty('--shadow-sm',      '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)')
  r.setProperty('--shadow-md',      '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)')
  r.setProperty('--shadow-lg',      '0 12px 32px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05)')
  r.setProperty('--shadow-xl',      '0 20px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)')
  r.setProperty('--shadow-inner',   'inset 0 2px 4px rgba(0,0,0,0.04)')
  
  /* ── Glassmorphism blur ── */
  r.setProperty('--glass-blur',     'blur(20px)')
  r.setProperty('--glass-blur-sm',  'blur(12px)')
}
/* ── Business config — set these in Vercel environment variables ── */
const BIZ_NAME     = import.meta.env.VITE_BIZ_NAME     || 'Mi Negocio'
const BIZ_SUBTITLE = import.meta.env.VITE_BIZ_SUBTITLE || ''
const BIZ_EMOJI    = import.meta.env.VITE_BIZ_EMOJI    || '🌸'
const BIZ_LOGO     = import.meta.env.VITE_BIZ_LOGO     || ''

const DEF_CATS   = ['Insumos','Arriendo','Publicidad','Servicios','Transporte','Gasolina','Otros']
const CAT_COLORS = ['#C4827A','#7A9FC4','#82C494','#C4A87A','#A47AC4','#C4C47A','#7AC4C4','#C47AA4']

const uid        = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7)
const capWords   = s => String(s||'').trim().replace(/\b\w/g, c=>c.toUpperCase())
const capFirst   = s => { const t=String(s||'').trim(); return t ? t.charAt(0).toUpperCase()+t.slice(1) : t }
const fmtM       = n => `$${toN(n).toLocaleString('es-CO')}`

const isPastAppt = a => {
  const d=cleanDate(a.date), t=cleanTime(a.time), td=todayStr(), now=new Date()
  if (d<td) return true
  if (d===td) { const[h,m]=t.split(':').map(Number); const apt=new Date(); apt.setHours(h,m,0); return apt<now }
  return false
}

const DEFAULT_SERVICES = [
  {id:uid(),name:'Micropigmentación cejas',          price:350000, duration:90},
  {id:uid(),name:'Retoque micropigmentación cejas',  price:150000, duration:60},
  {id:uid(),name:'Diseño y depilación',              price:50000,  duration:30},
  {id:uid(),name:'Diseño, depilación y sombreado',   price:60000,  duration:30},
  {id:uid(),name:'Extensiones de pestañas',          price:160000, duration:90},
  {id:uid(),name:'Retoque extensiones de pestañas',  price:70000,  duration:60},
  {id:uid(),name:'Lifting de pestañas',              price:130000, duration:60},
  {id:uid(),name:'Remoción con láser',               price:200000, duration:60},
  {id:uid(),name:'Laminado de cejas',                price:130000, duration:60},
]
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180]

// WhatsApp with proper emoji encoding
const openWA = (phone, name, time, date, serviceNames, total, isDom) => {
  const p     = ('57' + phone.replace(/\D/g, '')).replace(/^5757/, '57')
  // ASCII-safe JS unicode escapes — works regardless of file encoding
  const NAIL  = '\uD83D\uDC85'  // 💅
  const BLOOM = '\uD83C\uDF38'  // 🌸
  const MOTO  = '\uD83D\uDEF5'  // 🛵
  const SPARK = '\u2728'         // ✨
  const CAL   = '\uD83D\uDCC5'  // 📅
  const CARD  = '\uD83D\uDCB3'  // 💳
  const end   = isDom ? 'Nos vemos pronto ' + NAIL : '\u00A1Te esperamos! ' + BLOOM
  const dom   = isDom ? '\n' + MOTO + ' *A domicilio*' : ''
  const lines = [
    'Hola ' + name + '! ' + SPARK + ' Te recordamos tu cita:',
    SPARK + ' *' + serviceNames + '*' + dom,
    CAL + ' *' + fmtDate(date) + '* a las *' + fmtTime(time) + '*',
    CARD + ' Total: *' + fmtM(total) + '*',
    '',
    end,
  ]
  const msg = lines.join('\n')
  openWhatsApp(p, msg)
}

/* ══════════════════════════════════════════════════════════════
   ROOT APP
══════════════════════════════════════════════════════════════ */
export default function App() {
  const [tab,   setTabRaw] = useState('dashboard')
  const [tabExtra, setTabExtra] = useState(null) // extra state for sub-navigation
  const [clients,      setC]   = useState([])
  const [services,     setS]   = useState([])
  const [appts,        setA]   = useState([])
  const [expenses,     setE]   = useState([])
  const [priceHistory, setPH]  = useState([])
  const [status,   setSt]  = useState('loading')
  const [errMsg,   setEM]  = useState('')
  const [lastSync, setLS]  = useState(null)
  const [modal,    setModal] = useState(null) // {msg, onOk} or {type:'info', msg}

  const setTab = (t, extra=null) => { setTabRaw(t); setTabExtra(extra) }

  // Sincroniza <title> y favicon con la config del negocio en runtime.
  // Evitamos placeholders %VITE_*% en index.html porque Vite hace decodeURI()
  // sobre los href durante `vite build` y revienta con "URI malformed".
  useEffect(() => {
    document.title = BIZ_SUBTITLE ? `${BIZ_NAME} · ${BIZ_SUBTITLE}` : BIZ_NAME
    if (BIZ_EMOJI) {
      const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E${encodeURIComponent(BIZ_EMOJI)}%3C/text%3E%3C/svg%3E`
      let link = document.querySelector("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link) }
      link.href = svg
    }
    if (BIZ_LOGO) {
      let apple = document.querySelector("link[rel='apple-touch-icon']")
      if (!apple) { apple = document.createElement('link'); apple.rel='apple-touch-icon'; document.head.appendChild(apple) }
      apple.href = BIZ_LOGO
    }
  }, [BIZ_NAME, BIZ_SUBTITLE, BIZ_EMOJI, BIZ_LOGO])

  // useRef persists across renders (unlike a plain `{current}` literal that
  // would be recreated every render, defeating the guard below).
  const savingRef = useRef(false)

  const refresh = useCallback((silent=false) => {
    if (savingRef.current) return  // ← skip if a save is in progress (prevents race condition)
    if (!import.meta.env.VITE_SCRIPT_URL) { setSt('noconfig'); return }
    if (!silent) setSt('loading')
    loadData().then(d => {
      setC(Array.isArray(d.clients)?d.clients:[])
      setS(Array.isArray(d.services)&&d.services.length?d.services:DEFAULT_SERVICES)
      setA(Array.isArray(d.appointments)?d.appointments:[])
      setE(Array.isArray(d.expenses)?d.expenses:[])
      setPH(Array.isArray(d.priceHistory)?d.priceHistory:[])
      setSt('ok'); setLS(new Date())
    }).catch(e => {
      setEM(e.message); setSt('error')
      try {
        setC(JSON.parse(localStorage.getItem('sb_c')||'[]'))
        setS(JSON.parse(localStorage.getItem('sb_s')||'null')||DEFAULT_SERVICES)
        setA(JSON.parse(localStorage.getItem('sb_a')||'[]'))
        setE(JSON.parse(localStorage.getItem('sb_e')||'[]'))
      } catch {}
    })
  }, [])

  const [themePalette,setThemePalette]= useState(()=>{ try{return localStorage.getItem('sz_palette')||'rosa'}catch{return 'rosa'} })

  useEffect(()=>{
    applyTheme(themePalette)
    try{ localStorage.setItem('sz_palette',themePalette) }catch{}
  },[themePalette])

  useEffect(()=>{
    // Título de la pestaña: emoji + nombre
    document.title = BIZ_NAME
    // Favicon dinámico con el emoji. Se codifica el SVG para que caracteres
    // especiales del emoji (o un BIZ_EMOJI mal configurado) no rompan el data-URI.
    const favicon = document.querySelector("link[rel='icon']") || document.createElement('link')
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${BIZ_EMOJI}</text></svg>`
    favicon.rel  = 'icon'
    favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    document.head.appendChild(favicon)
  },[])
  useEffect(() => { refresh() }, [])

  // Polling cada 30s. Se pausa cuando la pestaña no está visible para no
  // sobrescribir el estado local mientras la operadora edita, y refresca tan
  // pronto vuelve a primer plano. `savingRef` real (useRef) evita pisar una
  // escritura en curso.
  useEffect(() => {
    let i = null
    const tick = () => refresh(true)
    const start = () => { if (i == null) i = setInterval(tick, 30 * 1000) }
    const stop  = () => { if (i != null) { clearInterval(i); i = null } }
    const onVis = () => {
      if (document.visibilityState === 'visible') { tick(); start() }
      else stop()
    }
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  const sync = useCallback(async (payload, setter, value) => {
    if (setter) setter(value)
    const km={clients:'sb_c',services:'sb_s',appointments:'sb_a',expenses:'sb_e'}
    Object.entries(payload).forEach(([k,v])=>{if(km[k])try{localStorage.setItem(km[k],JSON.stringify(v))}catch{}})
    setSt('saving')
    savingRef.current = true
    try {
      const r = await saveData(payload)
      setSt('ok'); setLS(new Date())
      savingRef.current = false
      setTimeout(() => refresh(true), 1500) // wait 1.5s for Sheets to commit before re-reading
      return r
    }
    catch(e) {
      savingRef.current = false
      setEM(e.message); setSt('error'); setTimeout(()=>setSt('ok'),5000); return null
    }
  }, [refresh])

  const SC = useCallback((v,x={})=>sync({clients:v,...x},     setC,v),[sync])
  const SS = useCallback((v,x={})=>sync({services:v,...x},    setS,v),[sync])
  const SA = useCallback((v,x={})=>sync({appointments:v,...x},setA,v),[sync])
  const SE = useCallback((v,x={})=>sync({expenses:v,...x},    setE,v),[sync])

  const confirm  = (msg, onOk) => setModal({type:'confirm', msg, onOk})
  const infoModal= (msg)       => setModal({type:'info', msg})

  const resetAll = useCallback(async () => {
    // Delete all Google Calendar events before wiping data
    const calAppts = appts.filter(a => a.calendarEventId)
    calAppts.forEach(a => {
      saveData({action:'deleteCalendarEvent',eventId:a.calendarEventId}).catch(()=>{})
    })
    // resetPriceHistory:true tells the backend to wipe history and seed with new service prices
    const empty = { clients:[], appointments:[], expenses:[], services:DEFAULT_SERVICES, resetPriceHistory:true }
    setC([]); setA([]); setE([]); setS(DEFAULT_SERVICES); setPH([]); setPH([])
    try { ['sb_c','sb_a','sb_e','sb_s'].forEach(k=>localStorage.removeItem(k)) } catch {}
    setSt('saving')
    try { await saveData(empty); setSt('ok'); setLS(new Date()) }
    catch(e) { setEM(e.message); setSt('error'); setTimeout(()=>setSt('ok'),5000) }
  }, [appts])

  const deleteAppt = useCallback(async appt => {
    const next = appts.filter(x=>x.id!==appt.id)
    SA(next)
    if (appt.calendarEventId)
      saveData({action:'deleteCalendarEvent',eventId:appt.calendarEventId}).catch(()=>{})
  }, [appts, SA])

  const p = {clients,services,appts,expenses,SC,SS,SA,SE,sync,deleteAppt,setTab,confirm,infoModal,tabExtra,resetAll,themePalette,setThemePalette,priceHistory}

  if (status==='loading') return <Cent><div style={{fontSize:52,animation:'pulse 2s ease-in-out infinite'}}>{BIZ_EMOJI}</div></Cent>
  if (status==='noconfig') return <Cent><div style={{fontSize:36,marginBottom:8}}>⚙️</div><p style={{fontSize:16,fontWeight:600}}>Configura VITE_SCRIPT_URL y VITE_TOKEN en Vercel</p></Cent>

  return (
    <div className="app-root" style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:'var(--bg)',color:'var(--t)'}}>
      <GS/>
      {modal?.type==='confirm' && <Modal msg={modal.msg} onOk={()=>{modal.onOk();setModal(null)}} onCancel={()=>setModal(null)}/>}
      {modal?.type==='info'    && <Modal msg={modal.msg} onOk={()=>setModal(null)} okLabel="Entendido" cancelLabel={null}/>}

      <div style={{position:'sticky',top:0,zIndex:100}}>
      <header style={{background:'var(--gradient)',padding:'calc(14px + env(safe-area-inset-top, 0px)) max(18px, env(safe-area-inset-right, 0px)) 14px max(18px, env(safe-area-inset-left, 0px))',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'var(--shadow-md)',borderBottom:'1px solid rgba(255,255,255,0.2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:11}}>
          {BIZ_LOGO
            ? <img src={BIZ_LOGO} alt={BIZ_NAME} style={{height:40,width:'auto',objectFit:'contain',flexShrink:0,filter:'drop-shadow(0 2px 8px rgba(0,0,0,0.15))'}}/>
            : <div style={{fontSize:28,filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.15))'}}>{BIZ_EMOJI}</div>
          }
          <div>
            <div style={{fontFamily:'Georgia,serif',fontSize:16,color:'white',fontWeight:700,textShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>{BIZ_NAME}</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.85)',letterSpacing:'0.14em',textTransform:'uppercase',fontWeight:500}}>{BIZ_SUBTITLE||BIZ_NAME}</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>refresh(true)} style={{background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:20,padding:'6px 12px',color:'white',fontSize:14,cursor:'pointer',fontFamily:'inherit',fontWeight:600,backdropFilter:'var(--glass-blur-sm)',WebkitBackdropFilter:'var(--glass-blur-sm)',transition:'all .15s'}} onMouseOver={e=>e.target.style.background='rgba(255,255,255,0.3)'} onMouseOut={e=>e.target.style.background='rgba(255,255,255,0.2)'}>↻</button>
          <SyncBadge status={status} lastSync={lastSync}/>
        </div>
      </header>

      <nav style={{background:'rgba(255,255,255,0.8)',backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)',borderBottom:'1px solid rgba(0,0,0,0.04)',display:'flex',overflowX:'auto',padding:'0 2px',scrollbarWidth:'none',boxShadow:'var(--shadow-sm)'}}>
        {[
          ['dashboard',  'grid',   'Panel'],
          ['appointments','cal',   'Citas'],
          ['clients',    'people', 'Clientes'],
          ['services',   'stars',  'Servicios'],
          ['finances',   'chart',  'Finanzas'],
          ['calendar', 'calendar', 'Calendario'],
          ['settings',   'gear',   'Ajustes'],
        ].map(([id,ic,lb])=>(
          <button key={id} onClick={()=>setTab(id)} className={`nb${tab===id?' act':''}`}
            style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,paddingTop:9,paddingBottom:9,paddingLeft:12,paddingRight:12}}>
            <NavIcon type={ic} active={tab===id}/>
            <span style={{fontSize:10,letterSpacing:'.02em'}}>{lb}</span>
          </button>
        ))}
      </nav>
      </div>

      <main style={{padding:'16px max(14px, env(safe-area-inset-right, 0px)) 16px max(14px, env(safe-area-inset-left, 0px))',maxWidth:680,margin:'0 auto'}}>
        {status==='error' && <div className="warn-box">⚠️ Modo sin conexión — {errMsg}</div>}
        {tab==='dashboard'     && <Dashboard      {...p}/>}
        {tab==='appointments'  && <ApptsTab       {...p}/>}
        {tab==='clients'       && <ClientsTab     {...p}/>}
        {tab==='services'      && <ServicesTab    {...p}/>}
        {tab==='finances'      && <FinancesTab    {...p}/>}
        {tab === 'calendar' && <CalendarView {...p} />}
        {tab==='settings'      && <SettingsTab    {...p}/>}
        {tab==='income-detail' && <IncomeDetail   {...p}/>}
        {tab==='expense-detail'  && <ExpenseDetail  {...p}/>}
        {tab==='client-history'  && <ClientHistory   {...p}/>}
        {tab==='comparison'      && <MonthComparison {...p}/>}
        {tab==='top-services'    && <TopServices     {...p}/>}
        {tab==='report'          && <ReportTab       {...p}/>}
      </main>

      <footer style={{textAlign:'center',padding:'20px 14px calc(28px + env(safe-area-inset-bottom, 0px))',borderTop:'1px solid var(--border)',marginTop:8,background:'rgba(255,255,255,0.7)',backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)'}}>
        <span style={{fontSize:11,color:'var(--t2)',letterSpacing:'.03em',display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
          <span>{BIZ_EMOJI} {BIZ_NAME}</span>
          <span style={{color:'var(--border)'}}>|</span>
          <span>© {new Date().getFullYear()} Bryan Morales</span>
          <span style={{color:'var(--border)'}}>|</span>
          <svg width="20" height="14" viewBox="0 0 20 14" style={{verticalAlign:'middle',borderRadius:2,display:'inline-block',flexShrink:0}}>
            <rect width="20" height="14" fill="#FCD116"/>
            <rect y="7" width="20" height="7" fill="#003893"/>
            <rect y="9.33" width="20" height="4.67" fill="#CE1126"/>
          </svg>
        </span>
      </footer>
    </div>
  )
}

function Modal({msg, onOk, onCancel, okLabel='Eliminar', cancelLabel='Cancelar'}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'var(--glass-blur-sm)',WebkitBackdropFilter:'var(--glass-blur-sm)'}}>
      <div style={{background:'rgba(255,255,255,0.95)',backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)',borderRadius:24,padding:32,maxWidth:360,width:'100%',maxHeight:'calc(100dvh - 40px)',overflowY:'auto',textAlign:'center',boxShadow:'var(--shadow-xl)',border:'1px solid rgba(255,255,255,0.5)'}}>
        <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
        <div style={{fontSize:15,fontWeight:600,color:'var(--t)',marginBottom:22,lineHeight:1.5}}>{msg}</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          {cancelLabel && <button className="btn-o" style={{flex:1}} onClick={onCancel}>{cancelLabel}</button>}
          <button className="btn" style={{flex:1,background:okLabel==='Eliminar'?'linear-gradient(135deg, #B03030 0%, #D04040 100%)':'var(--gradient)'}} onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}

// Pregunta cómo se pagó el servicio al marcar una cita como completada.
function PayModal({appt, onPick, onCancel}) {
  const icons = {Efectivo:'💵', Transferencia:'🏦'}
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={onCancel}>
      <div style={{background:'rgba(255,255,255,0.97)',borderRadius:24,padding:28,maxWidth:360,width:'100%',maxHeight:'calc(100dvh - 40px)',overflowY:'auto',textAlign:'center',boxShadow:'0 10px 40px rgba(0,0,0,.2)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:36,marginBottom:10}}>💳</div>
        <div style={{fontSize:16,fontWeight:700,color:'var(--t)',marginBottom:4}}>¿Cómo se pagó el servicio?</div>
        <div style={{fontSize:12,color:'var(--t2)',marginBottom:18}}>{appt.clientName} · {fmtM(appt.totalPrice||appt.servicePrice)}</div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
          {PAYMENT_METHODS.map(m=>(
            <button key={m} className="btn" style={{width:'100%'}} onClick={()=>onPick(m)}>{icons[m]} {m}</button>
          ))}
        </div>
        <button className="btn-o" style={{width:'100%'}} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

const Cent = ({children}) => <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--bg)',gap:8,padding:24}} className="cent-root">{children}</div>

/* ── NavIcon — crisp SVG icons for navigation ── */
function NavIcon({type, active}) {
  const c = active ? 'var(--primary)' : 'var(--t2)'
  const s = {display:'block', lineHeight:0}
  const icons = {
    grid: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="2" fill={c} opacity={active?1:.7}/>
        <rect x="12" y="2" width="8" height="8" rx="2" fill={c} opacity={active?1:.5}/>
        <rect x="2" y="12" width="8" height="8" rx="2" fill={c} opacity={active?1:.5}/>
        <rect x="12" y="12" width="8" height="8" rx="2" fill={c} opacity={active?1:.7}/>
      </svg>
    ),
    cal: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="4" width="18" height="16" rx="3" stroke={c} strokeWidth="1.8" fill="none"/>
        <line x1="2" y1="9" x2="20" y2="9" stroke={c} strokeWidth="1.6"/>
        <line x1="7" y1="2" x2="7" y2="6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
        <line x1="15" y1="2" x2="15" y2="6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
        <circle cx="7" cy="14" r="1.5" fill={c}/>
        <circle cx="11" cy="14" r="1.5" fill={c}/>
        <circle cx="15" cy="14" r="1.5" fill={c}/>
      </svg>
    ),
    calendar: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="4" width="18" height="16" rx="3" stroke={c} strokeWidth="1.8" fill="none"/>
        <line x1="2" y1="8.5" x2="20" y2="8.5" stroke={c} strokeWidth="1.6"/>
        <line x1="7" y1="2" x2="7" y2="6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
        <line x1="15" y1="2" x2="15" y2="6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
        <rect x="5"    y="10.8" width="2.6" height="2.6" rx="0.6" fill={c} opacity={active?1:.5}/>
        <rect x="9.7"  y="10.8" width="2.6" height="2.6" rx="0.6" fill={c} opacity={active?1:.5}/>
        <rect x="14.4" y="10.8" width="2.6" height="2.6" rx="0.6" fill={c} opacity={active?1:.5}/>
        <rect x="5"    y="14.6" width="2.6" height="2.6" rx="0.6" fill={c} opacity={active?1:.5}/>
        <rect x="9.7"  y="14.6" width="2.6" height="2.6" rx="0.6" fill={active?c:'none'} stroke={c} strokeWidth="1.3"/>
        <rect x="14.4" y="14.6" width="2.6" height="2.6" rx="0.6" fill={c} opacity={active?1:.5}/>
      </svg>
    ),
    people: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="7" r="3.5" stroke={c} strokeWidth="1.8" fill="none"/>
        <path d="M2 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <circle cx="16" cy="8" r="2.5" stroke={c} strokeWidth="1.6" fill="none" opacity=".7"/>
        <path d="M14 19c0-2.2 1.3-4.1 3-5" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".7"/>
      </svg>
    ),
    stars: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 3l2 5h5l-4 3 1.5 5L11 13l-4.5 3L8 11 4 8h5z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill={active?c:'none'} fillOpacity={active?.25:0}/>
        <circle cx="17" cy="4" r="1.5" fill={c} opacity=".6"/>
        <circle cx="5" cy="17" r="1.2" fill={c} opacity=".5"/>
        <circle cx="19" cy="15" r="1" fill={c} opacity=".45"/>
      </svg>
    ),
    chart: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="14" width="4" height="6" rx="1.5" fill={c} opacity={active?1:.65}/>
        <rect x="9" y="9" width="4" height="11" rx="1.5" fill={c} opacity={active?1:.8}/>
        <rect x="16" y="5" width="4" height="15" rx="1.5" fill={c}/>
        <line x1="2" y1="20.5" x2="20" y2="20.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    gear: (
      <svg style={s} width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="3" stroke={c} strokeWidth="1.8" fill="none"/>
        <path d="M11 2v2M11 18v2M2 11h2M18 11h2M4.93 4.93l1.41 1.41M15.66 15.66l1.41 1.41M4.93 17.07l1.41-1.41M15.66 6.34l1.41-1.41" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  }
  return icons[type] || null
}

function SyncBadge({status,lastSync}) {
  const [ago,setAgo] = useState('')
  useEffect(()=>{
    if (!lastSync) return
    const t=()=>{const m=Math.floor((Date.now()-lastSync)/60000);setAgo(m===0?'ahora':m+'min')}
    t(); const i=setInterval(t,30000); return()=>clearInterval(i)
  },[lastSync])
  const c={ok:{bg:'rgba(255,255,255,0.18)',col:'white',l:ago?`✓ ${ago}`:'✓'},saving:{bg:'rgba(255,255,255,0.18)',col:'white',l:'⏳'},error:{bg:'rgba(220,80,80,0.4)',col:'white',l:'⚠️'}}[status]||{bg:'transparent',col:'transparent',l:''}
  return <div style={{background:c.bg,color:c.col,borderRadius:20,padding:'4px 10px',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{c.l}</div>
}

/* ── Global CSS ── Modern Flat + Neumorphism + Glassmorphism ── */
function GS() { return <style>{`
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  :root{
    --primary:#B5524A;--primary-d:#8E3E38;--primary-l:#FAEAE8;
    --bg:#F7F0EC;--card:#FFFFFF;--surface:#FFFFFF;--border:#E8D0CC;
    --t:#1E0E0C;--t2:#7A5E5A;--gold:#C49A1A;--gold-bg:#FFF8E6;
    --green:#2E7D52;--green-bg:#EDF7F0;--red:#B03030;--red-bg:#FFF0F0;
    --warn-bg:#FFF4DC;--warn-t:#7A5000;--input-bg:#FFFFFF;
    /* Gradient & Glassmorphism (updated by applyTheme) */
    --gradient:linear-gradient(135deg, #B5524A 0%, #D47A6A 50%, #E8A898 100%);
    --gradient-soft:linear-gradient(135deg, #FAEAE8 0%, #F7F0EC 50%, #E8D0CC 100%);
    --glass:rgba(181, 82, 74, 0.12);
    --glass-strong:rgba(181, 82, 74, 0.25);
    /* Neumorphism */
    --neo-light:#FFFFFF;
    --neo-dark:#E8D0CC;
    --neo-shadow:rgba(181, 82, 74, 0.15);
    --neo-shadow-dark:rgba(142, 62, 56, 0.2);
    /* Flat shadows */
    --shadow-sm:0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md:0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
    --shadow-lg:0 12px 32px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05);
    --shadow-xl:0 20px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06);
    --shadow-inner:inset 0 2px 4px rgba(0,0,0,0.04);
    /* Glassmorphism blur */
    --glass-blur:blur(20px);
    --glass-blur-sm:blur(12px);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{-webkit-tap-highlight-color:transparent;background:var(--bg);font-family:'DM Sans',system-ui,sans-serif}
  select,option{background:var(--input-bg)!important;color:var(--t)!important}
  
  /* ── Neumorphism base ── */
  .neo{
    background:var(--neo-light);
    border-radius:16px;
    box-shadow: 8px 8px 16px var(--neo-shadow), -8px -8px 16px var(--neo-light);
    border:1px solid rgba(0,0,0,0.02);
  }
  .neo-pressed{
    box-shadow: var(--shadow-inner), 4px 4px 8px var(--neo-shadow), -4px -4px 8px var(--neo-light);
  }
  .neo-inset{
    box-shadow: var(--shadow-inner);
    background:var(--neo-light);
  }
  
  /* ── Glassmorphism base ── */
  .glass{
    background:var(--glass);
    backdrop-filter:var(--glass-blur);
    -webkit-backdrop-filter:var(--glass-blur);
    border:1px solid rgba(255,255,255,0.3);
    border-radius:16px;
  }
  .glass-strong{
    background:var(--glass-strong);
    backdrop-filter:var(--glass-blur);
    -webkit-backdrop-filter:var(--glass-blur);
    border:1px solid rgba(255,255,255,0.4);
    border-radius:16px;
  }
  .glass-card{
    background:rgba(255,255,255,0.7);
    backdrop-filter:var(--glass-blur);
    -webkit-backdrop-filter:var(--glass-blur);
    border:1px solid rgba(255,255,255,0.5);
    border-radius:20px;
    box-shadow:var(--shadow-md);
  }
  
  /* ── Nav tabs ── */
  .nb{
    background:none;
    border:none;
    border-bottom:2.5px solid transparent;
    padding:11px 12px;
    font-size:13px;
    font-weight:500;
    cursor:pointer;
    color:var(--t2);
    white-space:nowrap;
    font-family:inherit;
    transition:all .15s;
    flex-shrink:0
  }
  .nb.act{
    color:var(--primary);
    border-bottom-color:var(--primary);
    font-weight:700
  }
  
  /* ── Cards ── */
  .card{
    background:var(--card);
    border-radius:20px;
    border:1px solid var(--border);
    padding:20px;
    margin-bottom:14px;
    box-shadow:var(--shadow-sm);
    transition:box-shadow .2s, transform .2s;
  }
  .card:hover{
    box-shadow:var(--shadow-md);
  }
  .card-neo{
    background:var(--neo-light);
    border-radius:20px;
    border:1px solid rgba(0,0,0,0.02);
    box-shadow: 10px 10px 20px var(--neo-shadow), -10px -10px 20px var(--neo-light);
    padding:20px;
    margin-bottom:14px;
  }
  .card-glass{
    background:rgba(255,255,255,0.75);
    backdrop-filter:var(--glass-blur);
    -webkit-backdrop-filter:var(--glass-blur);
    border:1px solid rgba(255,255,255,0.5);
    border-radius:20px;
    box-shadow:var(--shadow-md);
    padding:20px;
    margin-bottom:14px;
  }
  
  /* ── Inputs ── */
  .inp{
    width:100%;
    padding:12px 16px;
    border:1.5px solid var(--border);
    border-radius:12px;
    font-size:15px;
    color:var(--t);
    background:var(--input-bg);
    outline:none;
    font-family:inherit;
    transition:all .15s;
    -webkit-appearance:none;
    box-shadow:var(--shadow-inner);
  }
  .inp:focus{
    border-color:var(--primary);
    box-shadow:0 0 0 3px var(--glass), var(--shadow-inner);
  }
  .inp::placeholder{color:var(--t2);opacity:.6}
  
  /* ── Labels ── */
  .lbl{
    display:block;
    font-size:11px;
    font-weight:600;
    color:var(--t2);
    text-transform:uppercase;
    letter-spacing:.08em;
    margin-bottom:6px
  }
  
  /* ── Buttons ── */
  .btn{
    background:var(--gradient);
    color:white;
    border:none;
    border-radius:12px;
    padding:14px 24px;
    font-weight:600;
    font-size:15px;
    cursor:pointer;
    font-family:inherit;
    transition:all .2s;
    box-shadow:var(--shadow-sm);
    position:relative;
    overflow:hidden;
  }
  .btn::before{
    content:'';
    position:absolute;
    inset:0;
    background:linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%);
    opacity:0;
    transition:opacity .2s;
  }
  .btn:hover{box-shadow:var(--shadow-md);transform:translateY(-1px)}
  .btn:active{
    transform:translateY(0);
    box-shadow:var(--shadow-inner);
  }
  .btn:active::before{opacity:1}
  .btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:var(--shadow-sm)}
  
  .btn-neo{
    background:var(--neo-light);
    color:var(--primary);
    border:none;
    border-radius:12px;
    padding:14px 24px;
    font-weight:600;
    font-size:15px;
    cursor:pointer;
    font-family:inherit;
    box-shadow: 6px 6px 12px var(--neo-shadow), -6px -6px 12px var(--neo-light);
    transition:all .15s;
  }
  .btn-neo:hover{
    box-shadow: 8px 8px 16px var(--neo-shadow), -8px -8px 16px var(--neo-light);
    transform:translateY(-1px);
  }
  .btn-neo:active{
    box-shadow: var(--shadow-inner), 3px 3px 6px var(--neo-shadow), -3px -3px 6px var(--neo-light);
    transform:translateY(0);
  }
  
  .btn-o{
    background:var(--surface);
    color:var(--primary);
    border:1.5px solid var(--primary);
    border-radius:12px;
    padding:12px 20px;
    font-weight:600;
    font-size:14px;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    box-shadow:var(--shadow-sm);
  }
  .btn-o:hover{
    background:var(--primary-l);
    box-shadow:var(--shadow-md);
  }
  .btn-o:active{background:var(--primary);color:white}
  
  .btn-sm{
    background:var(--primary-l);
    color:var(--primary);
    border:none;
    border-radius:10px;
    padding:8px 14px;
    font-size:13px;
    font-weight:600;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    box-shadow:var(--shadow-sm);
  }
  .btn-sm:hover{background:var(--primary);color:white;box-shadow:var(--shadow-md)}
  .btn-sm:active{box-shadow:var(--shadow-inner)}
  
  .btn-del{
    background:var(--red-bg);
    color:var(--red);
    border:none;
    border-radius:10px;
    padding:8px 12px;
    font-size:12px;
    font-weight:600;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    box-shadow:var(--shadow-sm);
  }
  .btn-del:hover{background:var(--red);color:white;box-shadow:var(--shadow-md)}
  .btn-del:active{box-shadow:var(--shadow-inner)}
  
  .btn-wa{
    background:linear-gradient(135deg, #25D366 0%, #1DB954 100%);
    color:white;
    border:none;
    border-radius:10px;
    padding:8px 14px;
    font-size:13px;
    font-weight:600;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    box-shadow:var(--shadow-sm);
  }
  .btn-wa:hover{box-shadow:var(--shadow-md);transform:translateY(-1px)}
  .btn-wa:active{box-shadow:var(--shadow-inner);transform:translateY(0)}
  
  .btn-edit{
    background:var(--primary-l);
    color:var(--primary);
    border:none;
    border-radius:10px;
    padding:8px 12px;
    font-size:12px;
    font-weight:600;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    box-shadow:var(--shadow-sm);
  }
  .btn-edit:hover{background:var(--primary);color:white;box-shadow:var(--shadow-md)}
  .btn-edit:active{box-shadow:var(--shadow-inner)}
  
  .btn-check{
    background:var(--surface);
    border:1.5px solid var(--border);
    border-radius:10px;
    padding:8px 12px;
    font-size:12px;
    font-weight:600;
    cursor:pointer;
    font-family:inherit;
    transition:all .15s;
    color:var(--t);
    box-shadow:var(--shadow-sm);
  }
  .btn-check:hover{box-shadow:var(--shadow-md);border-color:var(--primary)}
  .btn-check.done{
    background:var(--green-bg);
    border-color:var(--green);
    color:var(--green);
    box-shadow:var(--shadow-sm);
  }
  
  /* ── Tags ── */
  .tag{
    display:inline-block;
    background:var(--primary-l);
    color:var(--primary);
    border-radius:999px;
    padding:4px 12px;
    font-size:12px;
    font-weight:600;
    box-shadow:var(--shadow-sm);
  }
  .tag-g{
    display:inline-block;
    background:var(--green-bg);
    color:var(--green);
    border-radius:999px;
    padding:4px 12px;
    font-size:12px;
    font-weight:600;
    box-shadow:var(--shadow-sm);
  }
  .tag-gold{
    display:inline-block;
    background:var(--gold-bg);
    color:var(--gold);
    border-radius:999px;
    padding:4px 12px;
    font-size:12px;
    font-weight:600;
    box-shadow:var(--shadow-sm);
  }
  .tag-past{
    display:inline-block;
    background:var(--border);
    color:var(--t2);
    border-radius:999px;
    padding:4px 12px;
    font-size:12px;
    font-weight:600;
    box-shadow:var(--shadow-sm);
  }
  
  /* ── Rows ── */
  .row{
    display:flex;
    align-items:center;
    gap:10px;
    padding:12px 0;
    border-bottom:1px solid var(--border);
  }
  .row:last-child{border-bottom:none}
  
  /* ── Stats ── */
  .stat{
    background:var(--card);
    border-radius:16px;
    border:1px solid var(--border);
    padding:18px 14px;
    text-align:center;
    cursor:pointer;
    transition:all .2s;
    box-shadow:var(--shadow-sm);
  }
  .stat:hover{
    transform:translateY(-2px);
    box-shadow:var(--shadow-lg);
  }
  .stat-neo{
    background:var(--neo-light);
    border-radius:16px;
    border:1px solid rgba(0,0,0,0.02);
    box-shadow: 8px 8px 16px var(--neo-shadow), -8px -8px 16px var(--neo-light);
    padding:18px 14px;
    text-align:center;
    cursor:pointer;
    transition:all .2s;
  }
  .stat-neo:hover{
    box-shadow: 12px 12px 24px var(--neo-shadow), -12px -12px 24px var(--neo-light);
    transform:translateY(-2px);
  }
  
  /* ── Time options ── */
  .to{
    background:var(--surface);
    border:1.5px solid var(--border);
    border-radius:10px;
    padding:10px 4px;
    font-size:11px;
    font-weight:600;
    cursor:pointer;
    text-align:center;
    font-family:inherit;
    transition:all .12s;
    color:var(--t);
    line-height:1.2;
    box-shadow:var(--shadow-inner);
  }
  .to:hover:not(:disabled){
    border-color:var(--primary);
    color:var(--primary);
    box-shadow:var(--shadow-sm);
  }
  .to.sel{
    background:var(--gradient);
    border-color:transparent;
    color:white;
    box-shadow:var(--shadow-md);
  }
  .to:disabled{
    background:var(--border);
    border-color:var(--border);
    color:var(--t2);
    opacity:.5;
    cursor:not-allowed;
  }
  
  /* ── Service options ── */
  .so{
    background:var(--surface);
    border:1.5px solid var(--border);
    border-radius:14px;
    padding:14px 16px;
    cursor:pointer;
    text-align:left;
    width:100%;
    font-family:inherit;
    transition:all .12s;
    margin-bottom:10px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    color:var(--t);
    box-shadow:var(--shadow-sm);
  }
  .so:hover{
    box-shadow:var(--shadow-md);
    border-color:var(--primary);
  }
  .so.sel{
    border-color:var(--primary);
    background:var(--primary-l);
    box-shadow:0 0 0 3px var(--glass);
  }
  
  /* ── Warning box ── */
  .warn-box{
    background:var(--warn-bg);
    border:1px solid var(--gold);
    border-radius:14px;
    padding:12px 16px;
    margin-bottom:14px;
    font-size:13px;
    color:var(--warn-t);
    box-shadow:var(--shadow-sm);
  }
  
  /* ── Suggestions ── */
  .sugg-item{
    padding:12px 16px;
    cursor:pointer;
    border-bottom:1px solid var(--border);
    font-size:14px;
    transition:all .12s;
    color:var(--t);
    background:var(--surface);
  }
  .sugg-item:last-child{border-bottom:none}
  .sugg-item:hover{
    background:var(--primary-l);
    box-shadow:var(--shadow-inner);
  }
  
  nav::-webkit-scrollbar{display:none}

  /* ── iOS / pantallas táctiles ── */
  @supports (-webkit-touch-callout:none){
    /* iOS hace zoom al enfocar campos con letra < 16px */
    input,select,textarea{font-size:16px!important}
    input[type="date"].inp,input[type="time"].inp{min-height:46px;display:block;text-align:left}
  }
  @media (hover:none){
    /* sin "hover pegado" al tocar en celular */
    .btn:hover,.btn-wa:hover,.stat:hover,.stat-neo:hover{transform:none}
  }
  @media (pointer:coarse){
    .btn-o,.btn-sm,.btn-del,.btn-edit,.btn-check,.btn-wa{min-height:40px}
    button,a,input,select,label{touch-action:manipulation}
  }
  
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:.7}50%{opacity:1}}
  @keyframes remindPing{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(181,82,74,.4)}50%{transform:scale(1.03);box-shadow:0 0 0 8px rgba(181,82,74,0)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  .slide-in{animation:slideDown .18s ease forwards}
  
  /* ── Gradient text utility ── */
  .gradient-text{
    background:var(--gradient);
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    background-clip:text;
  }
  
  /* ── Glass header ── */
  .glass-header{
    background:rgba(255,255,255,0.85);
    backdrop-filter:var(--glass-blur);
    -webkit-backdrop-filter:var(--glass-blur);
    border-bottom:1px solid rgba(0,0,0,0.04);
    box-shadow:var(--shadow-sm);
  }
  
  /* ── Gradient header ── */
  .gradient-header{
    background:var(--gradient);
    box-shadow:var(--shadow-md);
  }
`}</style> }

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════════ */
function Dashboard({clients,appts,expenses,setTab}) {
  const [selMonth, setSelMonth] = useState(monthStr)
  const [finTab,   setFinTab]   = useState('general')
  const td = todayStr()
  const ta = [...appts].filter(a=>cleanDate(a.date)===td).sort((a,b)=>cleanTime(a.time).localeCompare(cleanTime(b.time)))
  const safeA = Array.isArray(appts)?appts:[]
  const safeE = Array.isArray(expenses)?expenses:[]

  // Citas "por recordar": pendientes de HOY a ≤60 min de empezar
  // (o que empezaron hace <10 min). Botón rápido para enviar el WA.
  const remindNow = new Date()
  const toRemind = ta.filter(a => {
    if (bool(a.completed) || a.completed==='noshow') return false
    const [h, m] = cleanTime(a.time).split(':').map(Number)
    if (isNaN(h)) return false
    const start = new Date(); start.setHours(h, m, 0, 0)
    const mins = Math.round((start - remindNow) / 60000)
    return mins <= 60 && mins > -10
  })

  const allDone  = safeA.filter(a=>bool(a.completed))
  const allNoShow= safeA.filter(a=>a.completed==='noshow')
  const allPend  = safeA.filter(a=>!bool(a.completed)&&a.completed!=='noshow'&&!isPastAppt(a))
  const gRevDone = allDone.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const gRevPend = allPend.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const gRevAll  = safeA.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const gExp     = safeE.reduce((s,e)=>s+toN(e.amount||0),0)
  const gNeto    = gRevDone - gExp

  const months   = [...new Set([...safeA.map(a=>cleanDate(a.date).slice(0,7)),...safeE.map(e=>cleanDate(e.date).slice(0,7)),monthStr()].filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const mA       = safeA.filter(a=>cleanDate(a.date).slice(0,7)===selMonth)
  const mE       = safeE.filter(e=>cleanDate(e.date).slice(0,7)===selMonth)
  const mDone    = mA.filter(a=>bool(a.completed))
  const mPend    = mA.filter(a=>!bool(a.completed)&&a.completed!=='noshow'&&!isPastAppt(a))
  const mRevDone = mDone.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const mRevPend = mPend.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const mRevAll  = mA.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const mExp     = mE.reduce((s,e)=>s+toN(e.amount||0),0)
  const mNeto    = mRevDone - mExp

  const isMonth  = finTab==='month'
  const aRevDone = isMonth?mRevDone:gRevDone
  const aRevPend = isMonth?mRevPend:gRevPend
  const aRevAll  = isMonth?mRevAll:gRevAll
  const aExp     = isMonth?mExp:gExp
  const aNeto    = isMonth?mNeto:gNeto
  const aDone    = isMonth?mDone:allDone
  const aPend    = isMonth?mPend:allPend
  const aNoShow  = isMonth?mA.filter(a=>a.completed==='noshow'):allNoShow
  const aAll     = isMonth?mA:safeA
  const netoPos  = aNeto>=0

  return <>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
      <div style={{fontFamily:'Georgia,serif',fontSize:21,fontWeight:600,color:'var(--t)'}}>Bienvenida {'\u2728'}</div>
      <div style={{fontSize:11,color:'var(--t2)'}}>{new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'})}</div>
    </div>

    {/* Aviso: citas por recordar (≤1h antes) */}
    {toRemind.length>0 && (
      <div style={{background:'var(--primary-l)',border:'1.5px solid var(--primary)',borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:toRemind.length>0?10:0}}>
          <span style={{fontSize:18}}>⏰</span>
          <span style={{fontWeight:700,fontSize:14,color:'var(--primary)'}}>
            {toRemind.length===1 ? '1 cita por recordar' : `${toRemind.length} citas por recordar`}
          </span>
          <span style={{fontSize:11,color:'var(--t2)'}}>— pulsa para enviar el WhatsApp</span>
        </div>
        {toRemind.map(a => {
          const isDom = bool(a.domicilio)
          return (
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--surface)',borderRadius:10,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13}}>{a.clientName} · <span style={{color:'var(--t2)'}}>{fmtTime(a.time)}</span></div>
                <div style={{fontSize:11,color:'var(--t2)'}}>✨ {a.serviceNames}</div>
              </div>
              <button className="btn-wa" onClick={()=>openWA(a.clientPhone,a.clientName,a.time,a.date,a.serviceNames,a.totalPrice||a.servicePrice,isDom)}>
                💬 Recordar
              </button>
            </div>
          )
        })}
      </div>
    )}

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
      <div className="stat" onClick={()=>setTab('clients')}>
        <NavIcon type="people" active={false}/>
        <div style={{fontFamily:'Georgia,serif',fontSize:24,fontWeight:700,marginTop:6}}>{clients.length}</div>
        <div style={{fontSize:11,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600,marginTop:2}}>Clientes</div>
        <div style={{fontSize:10,color:'var(--primary)',marginTop:3,fontWeight:600}}>Ver todas {'\u2192'}</div>
      </div>
      <div className="stat" onClick={()=>setTab('appointments')}>
        <NavIcon type="cal" active={false}/>
        <div style={{fontFamily:'Georgia,serif',fontSize:24,fontWeight:700,marginTop:6}}>{ta.length}</div>
        <div style={{fontSize:11,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600,marginTop:2}}>Citas hoy</div>
        <div style={{fontSize:10,color:'var(--primary)',marginTop:3,fontWeight:600}}>Ver citas {'\u2192'}</div>
      </div>
    </div>

    <div className="card" style={{marginBottom:14,padding:0,overflow:'hidden'}}>
      <div style={{background:netoPos?'linear-gradient(135deg,var(--primary),var(--primary-d))':'linear-gradient(135deg,#B04040,#843030)',padding:'16px 18px',cursor:'pointer'}} onClick={()=>setTab('finances')}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.8)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.09em'}}>
            {isMonth?'Balance \u2014 '+new Date(selMonth+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'}):'Balance Neto'}
          </div>
          <span style={{fontSize:10,color:'rgba(255,255,255,0.6)'}}>Ver finanzas {'\u2192'}</span>
        </div>
        <div style={{fontFamily:'Georgia,serif',fontSize:30,fontWeight:700,color:'white'}}>{fmtM(aNeto)}</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,0.65)',marginTop:4}}>
          Recibido {fmtM(aRevDone)} {'\u2212'} Gastos {fmtM(aExp)}
        </div>
      </div>

      <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
        {[['general','General'],['month','Por mes']].map(([v,l])=>(
          <button key={v} onClick={()=>setFinTab(v)}
            style={{flex:1,background:'none',border:'none',borderBottom:`2.5px solid ${finTab===v?'var(--primary)':'transparent'}`,padding:'9px 0',fontSize:12,fontWeight:finTab===v?700:500,color:finTab===v?'var(--primary)':'var(--t2)',cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>
            {l}
          </button>
        ))}
      </div>

      {isMonth&&(
        <div style={{padding:'10px 16px 0',background:'var(--surface)'}}>
          <select value={selMonth} onChange={e=>setSelMonth(e.target.value)}
            style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'7px 12px',fontSize:13,fontFamily:'inherit',color:'var(--t)',background:'var(--surface)',outline:'none',cursor:'pointer'}}>
            {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>)}
          </select>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10,padding:'14px 16px'}}>
        <div style={{textAlign:'center',background:'var(--green-bg)',borderRadius:12,padding:'11px 6px',cursor:'pointer'}} onClick={()=>setTab('income-detail', isMonth?{month:selMonth,origin:'dashboard'}:{origin:'dashboard'})}>
          <div style={{fontSize:10,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Recibido</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--green)'}}>{fmtM(aRevDone)}</div>
          <div style={{fontSize:10,color:'var(--green)',marginTop:2}}>{aDone.length} citas</div>
        </div>
        <div style={{textAlign:'center',background:'var(--gold-bg)',borderRadius:12,padding:'11px 6px',cursor:'pointer'}} onClick={()=>setTab('income-detail', isMonth?{filter:'pending',month:selMonth,origin:'dashboard'}:{filter:'pending',origin:'dashboard'})}>
          <div style={{fontSize:10,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Pendiente</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--gold)'}}>{fmtM(aRevPend)}</div>
          <div style={{fontSize:10,color:'var(--gold)',marginTop:2}}>{aPend.length} {'\u2192'}</div>
        </div>
        <div style={{textAlign:'center',background:'var(--primary-l)',borderRadius:12,padding:'11px 6px'}}>
          <div style={{fontSize:10,color:'var(--primary)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Proyectado</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--primary)'}}>{fmtM(aRevAll)}</div>
          <div style={{fontSize:10,color:'var(--primary)',marginTop:2}}>{aAll.length} citas</div>
        </div>
      </div>

      {aRevAll>aRevDone&&(
        <div style={{padding:'0 16px 14px'}}>
          <div style={{fontSize:12,color:'var(--t2)',background:'var(--bg)',borderRadius:10,padding:'8px 12px',lineHeight:1.5}}>
            {'\uD83D\uDCA1'} Te faltan <strong style={{color:'var(--gold)'}}>{fmtM(aRevAll-aRevDone)}</strong> por cobrar {isMonth?'este mes':'en total'} {'\u00B7'} Marca como <strong>Completadas {'\u2713'}</strong>
          </div>
        </div>
      )}
    </div>

    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontWeight:700,fontSize:15}}>{'\uD83C\uDF38'} Citas de Hoy</span>
        <button className="btn" style={{fontSize:12,padding:'7px 14px'}} onClick={()=>setTab('appointments',{newAppt:true,origin:'dashboard'})}>+ Nueva cita</button>
      </div>
      {ta.length===0
        ?<div style={{textAlign:'center',padding:'16px 0',color:'var(--t2)',fontSize:14}}>No hay citas para hoy</div>
        :ta.map(a=><div key={a.id} className="row">
            <div style={{background:'var(--primary-l)',borderRadius:10,padding:'7px 10px',fontWeight:700,color:'var(--primary)',fontSize:12,minWidth:58,textAlign:'center',flexShrink:0}}>{fmtTime(a.time)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.clientName}</div>
              <div style={{fontSize:12,color:'var(--t2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.serviceNames}</div>
            </div>
            {bool(a.completed)&&<span className="tag-g" style={{flexShrink:0,fontSize:11}}>{'\u2713'}</span>}
            <div style={{fontWeight:700,color:'var(--primary)',fontSize:14,flexShrink:0,marginLeft:4}}>{fmtM(a.totalPrice||a.servicePrice)}</div>
          </div>)
      }
    </div>
  </>
}

/* ══════════════════════════════════════════════════════════════
   MONTHLY INCOME STATE (Dashboard widget)
══════════════════════════════════════════════════════════════ */
function MonthlyIncomeState({appts,selMonth,setSelMonth,setTab}) {
  const safe   = Array.isArray(appts)?appts:[]
  const months = [...new Set([
    ...safe.map(a=>cleanDate(a.date).slice(0,7)),
    monthStr(),
  ].filter(Boolean))].sort((a,b)=>b.localeCompare(a))

  const ma       = safe.filter(a=>cleanDate(a.date).slice(0,7)===selMonth)
  const done     = ma.filter(a=>bool(a.completed))
  const pend     = ma.filter(a=>!bool(a.completed)&&!isPastAppt(a))
  const revDone  = done.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revPend  = pend.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revTotal = ma.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const label    = new Date(selMonth+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})

  return (
    <div className="card" style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <span style={{fontWeight:700,fontSize:14}}>
          {'\uD83D\uDCCA'} Estado de ingresos por mes
        </span>
        <select value={selMonth} onChange={e=>setSelMonth(e.target.value)}
          style={{border:'1.5px solid var(--border)',borderRadius:8,padding:'4px 10px',fontSize:12,fontFamily:'inherit',color:'var(--t)',background:'var(--surface)',outline:'none',cursor:'pointer'}}>
          {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'short',year:'numeric'})}</option>)}
        </select>
      </div>
      <div style={{fontSize:11,color:'var(--t2)',marginBottom:10}}>
        {label}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginBottom:10}}>
        <div style={{textAlign:'center',background:'var(--green-bg)',borderRadius:12,padding:'12px 8px',cursor:'pointer'}} onClick={()=>setTab('income-detail',{month:selMonth})}>
          <div style={{fontSize:10,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Recibido</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:'var(--green)'}}>{fmtM(revDone)}</div>
          <div style={{fontSize:10,color:'var(--green)',marginTop:2}}>{done.length} citas {'\u2713'}</div>
        </div>
        <div style={{textAlign:'center',background:'var(--gold-bg)',borderRadius:12,padding:'12px 8px',cursor:'pointer'}} onClick={()=>setTab('income-detail',{filter:'pending',month:selMonth})}>
          <div style={{fontSize:10,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Pendiente</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:'var(--gold)'}}>{fmtM(revPend)}</div>
          <div style={{fontSize:10,color:'var(--gold)',marginTop:2}}>{pend.length} citas {'\u2192'}</div>
        </div>
        <div style={{textAlign:'center',background:'var(--primary-l)',borderRadius:12,padding:'12px 8px'}}>
          <div style={{fontSize:10,color:'var(--primary)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Proyectado</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:'var(--primary)'}}>{fmtM(revTotal)}</div>
          <div style={{fontSize:10,color:'var(--primary)',marginTop:2}}>{ma.length} citas</div>
        </div>
      </div>
      {revTotal>revDone && (
        <div style={{fontSize:12,color:'var(--t2)',background:'var(--bg)',borderRadius:10,padding:'8px 12px',lineHeight:1.5}}>
          {'\uD83D\uDCA1'} Has recibido <strong>{fmtM(revDone)}</strong> de <strong>{fmtM(revTotal)}</strong> proyectados. Te faltan <strong style={{color:'var(--gold)'}}>{fmtM(revTotal-revDone)}</strong>.
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MONTHLY BALANCE CARD (Dashboard widget)
══════════════════════════════════════════════════════════════ */
function MonthlyBalance({appts,expenses,selMonth,setSelMonth,setTab}) {
  const safeA = Array.isArray(appts)?appts:[]
  const safeE = Array.isArray(expenses)?expenses:[]

  // Build list of months that have data
  const months = [...new Set([
    ...safeA.map(a=>cleanDate(a.date).slice(0,7)),
    ...safeE.map(e=>cleanDate(e.date).slice(0,7)),
    monthStr(),
  ].filter(Boolean))].sort((a,b)=>b.localeCompare(a))

  const ma = safeA.filter(a=>cleanDate(a.date).slice(0,7)===selMonth)
  const me = safeE.filter(e=>cleanDate(e.date).slice(0,7)===selMonth)

  const revDone  = ma.filter(a=>bool(a.completed)).reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revPend  = ma.filter(a=>!bool(a.completed)&&!isPastAppt(a)).reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revTotal = ma.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const gastos   = me.reduce((s,e)=>s+toN(e.amount||0),0)
  const neto     = revDone - gastos
  const netoPos  = neto >= 0

  const monthLabel = months.includes(selMonth)
    ? new Date(selMonth+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})
    : selMonth

  return (
    <div className="card" style={{marginBottom:14,background:'linear-gradient(160deg,#FBF0EE,#FAF5F0)',border:'1.5px solid var(--border)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <span style={{fontWeight:700,fontSize:14,color:'var(--t)'}}>📅 Balance por mes</span>
        <select value={selMonth} onChange={e=>setSelMonth(e.target.value)}
          style={{border:'1.5px solid var(--border)',borderRadius:8,padding:'4px 10px',fontSize:12,fontFamily:'inherit',color:'var(--t)',background:'var(--surface)',outline:'none',cursor:'pointer'}}>
          {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'short',year:'numeric'})}</option>)}
        </select>
      </div>

      {/* Net headline */}
      <div style={{background:netoPos?'linear-gradient(135deg,var(--green),#3d7a55)':'linear-gradient(135deg,var(--red),#a04040)',borderRadius:12,padding:'12px 16px',marginBottom:12,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:10,opacity:.8,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600}}>Neto {monthLabel}</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:24,fontWeight:700,marginTop:2}}>{fmtM(neto)}</div>
        </div>
        <div style={{fontSize:28,opacity:.85}}>{netoPos?'💚':'📉'}</div>
      </div>

      {/* 3 pills */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
        <div style={{background:'var(--green-bg)',borderRadius:10,padding:'10px 8px',textAlign:'center',cursor:'pointer'}} onClick={()=>setTab('income-detail',{month:selMonth})}>
          <div style={{fontSize:10,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Recibido</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--green)'}}>{fmtM(revDone)}</div>
          <div style={{fontSize:10,color:'var(--green)',marginTop:1}}>{ma.filter(a=>bool(a.completed)).length} citas</div>
        </div>
        <div style={{background:'var(--gold-bg)',borderRadius:10,padding:'10px 8px',textAlign:'center',cursor:'pointer'}} onClick={()=>setTab('income-detail',{filter:'pending',month:selMonth})}>
          <div style={{fontSize:10,color:'var(--gold)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Pendiente</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--gold)'}}>{fmtM(revPend)}</div>
          <div style={{fontSize:10,color:'var(--gold)',marginTop:1}}>{ma.filter(a=>!bool(a.completed)&&!isPastAppt(a)).length} citas</div>
        </div>
        <div style={{background:'var(--primary-l)',borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
          <div style={{fontSize:10,color:'var(--primary)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>Proyectado</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:'var(--primary)'}}>{fmtM(revTotal)}</div>
          <div style={{fontSize:10,color:'var(--primary)',marginTop:1}}>{ma.length} citas</div>
        </div>
      </div>

      {gastos>0 && (
        <div style={{marginTop:10,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,color:'var(--t2)',paddingTop:10,borderTop:'1px solid var(--border)'}}>
          <span>Gastos del mes</span>
          <span style={{fontWeight:700,color:'var(--red)',cursor:'pointer'}} onClick={()=>setTab('expense-detail',{month:selMonth})}>{fmtM(gastos)} Ver →</span>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   APPOINTMENTS TAB — Fixed accordion (independent toggle)
══════════════════════════════════════════════════════════════ */
function ApptsTab({clients,services,appts,SA,SC,sync,deleteAppt,confirm,infoModal,priceHistory,tabExtra,setTab}) {
  // Si se llega desde otra pestaña con "+ Nueva cita" (Calendario, Panel),
  // el formulario se abre directo. tabExtra: {newAppt, date?, origin?}
  const [showNew,  setNew]  = useState(()=>!!(tabExtra && tabExtra.newAppt))
  const [editAppt, setEdit] = useState(null)
  const [payFor,  setPayFor] = useState(null) // {appt, change} → modal de método de pago
  // Only "today" open by default — each group toggles independently
  const [open, setOpen] = useState({today:true, tomorrow:false, upcoming:false, noshow:false, past:false})
  const td = todayStr(), tm = tomorrowStr()

  const toggle = k => setOpen(p => ({...p, [k]: !p[k]}))

  // Groups — past includes today-past
  const groups = {
    today:    appts.filter(a=>cleanDate(a.date)===td && !isPastAppt(a)),
    tomorrow: appts.filter(a=>cleanDate(a.date)===tm),
    upcoming: appts.filter(a=>{ const d=cleanDate(a.date); return d>tm }),
    past:     appts.filter(a=>isPastAppt(a)&&a.completed!=='noshow'),
    noshow:   appts.filter(a=>a.completed==='noshow')
  }

  const sortG = arr => [...arr].sort((a,b)=>`${cleanDate(a.date)}${cleanTime(a.time)}`.localeCompare(`${cleanDate(b.date)}${cleanTime(b.time)}`))

  const toggleCompleted = (a, newStatus) => {
    // cycle: pending -> done -> pending; noshow is a separate button
    const cur = a.completed==='noshow'?'noshow': bool(a.completed)?'done':'pending'
    // Completar una cita pendiente → primero preguntar cómo se pagó
    if (newStatus==='done' && cur!=='done') { setPayFor({appt:a, change:false}); return }
    let next_val
    if (newStatus==='done')   next_val = false            // desmarcar completada
    if (newStatus==='noshow') next_val = cur==='noshow' ? false : 'noshow'
    // Si deja de estar completada, se borra el método de pago
    const next = appts.map(x=>x.id===a.id?{...x,completed:next_val,paymentMethod:''}:x)
    SA(next)
  }

  // Confirma el método elegido en el modal (completar, o solo cambiar el método)
  const pickPayment = (method) => {
    const a = payFor.appt
    const next = appts.map(x=>x.id===a.id
      ? (payFor.change ? {...x,paymentMethod:method} : {...x,completed:true,paymentMethod:method})
      : x)
    setPayFor(null)
    SA(next)
  }

  if (showNew)  return <NewWizard  clients={clients} services={services} appts={appts} SA={SA} SC={SC} sync={sync} infoModal={infoModal}
    initialDate={tabExtra && tabExtra.date && tabExtra.date >= todayStr() ? tabExtra.date : undefined}
    onClose={()=>{ setNew(false); if (tabExtra && tabExtra.origin && setTab) setTab(tabExtra.origin) }}/>
  if (editAppt) return <EditAppt   appt={editAppt} services={services} appts={appts} SA={SA} sync={sync} priceHistory={priceHistory} onClose={()=>setEdit(null)}/>

  const AccGroup = ({label,color,gKey,items,canEdit=true}) => {
    if (items.length===0) return null
    const sum     = items.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
    const doneSum = items.filter(a=>bool(a.completed)&&a.completed!=='noshow').reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
    const isOpen  = open[gKey]
    return (
      <div style={{border:`1.5px solid ${color}28`,borderRadius:16,marginBottom:10,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',background:`${color}0E`,userSelect:'none'}} onClick={()=>toggle(gKey)}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}}/>
            <span style={{fontWeight:700,fontSize:14,color:'var(--t)'}}>{label}</span>
            <span style={{background:`${color}22`,color,borderRadius:20,padding:'2px 8px',fontSize:12,fontWeight:700}}>{items.length}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:13,fontWeight:700,color}}>{fmtM(doneSum>0?doneSum:sum)}</span>
            <span style={{color:'var(--t2)',fontSize:14,transition:'transform .2s',display:'inline-block',transform:isOpen?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
          </div>
        </div>
        {isOpen && (
          <div className="slide-in" style={{padding:'4px 12px 12px'}}>
            {sortG(items).map(a=>(
              <ApptCard key={a.id} appt={a} canEdit={canEdit}
                onToggle={(s)=>toggleCompleted(a,s)}
                onChangePay={()=>setPayFor({appt:a, change:true})}
                onEdit={()=>setEdit(a)}
                onDelete={()=>confirm(`¿Eliminar la cita de ${a.clientName}? También se borrará el evento de Google Calendar.`,()=>deleteAppt(a))}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return <>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <span style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:600,color:'var(--t)'}}>Citas</span>
      <button className="btn" onClick={()=>setNew(true)}>+ Nueva cita</button>
    </div>
    {payFor && <PayModal appt={payFor.appt} onPick={pickPayment} onCancel={()=>setPayFor(null)}/>}
    <AccGroup label="Hoy"         color="#B5524A" gKey="today"    items={groups.today}    canEdit={true}/>
    <AccGroup label="Mañana"      color="#B8742A" gKey="tomorrow" items={groups.tomorrow} canEdit={true}/>
    <AccGroup label="Próximas"    color="#2E6EA6" gKey="upcoming" items={groups.upcoming} canEdit={true}/>
    <AccGroup label="No asistió"  color="#B03030" gKey="noshow"   items={groups.noshow}   canEdit={false}/>
    <AccGroup label="Pasadas"     color="#888888" gKey="past"     items={groups.past}     canEdit={false}/>
    {appts.length===0 && (
      <div className="card" style={{textAlign:'center',padding:30,color:'var(--t2)'}}>
        No hay citas 🌸<br/><br/>
        <button className="btn" onClick={()=>setNew(true)}>+ Nueva cita</button>
      </div>
    )}
  </>
}

function ApptCard({appt,canEdit,onToggle,onEdit,onDelete,onChangePay}) {
  const calOk  = bool(appt.calendarCreated)
  const dom    = bool(appt.domicilio)
  const status = appt.completed==='noshow' ? 'noshow' : bool(appt.completed) ? 'done' : 'pending'
  const past   = isPastAppt(appt)
  // Es una cita futura si su fecha es posterior a HOY (aún no llega
  // el día). En ese caso no se puede marcar como Completada ni como
  // No asistió — no tiene sentido. Editar y Eliminar sí siguen activos.
  const today  = todayStr()
  const isFuture = cleanDate(appt.date) > today
  const allowToggle = !isFuture
  // ¿Hay que recordar YA? Solo para citas pendientes de HOY cuya hora
  // de inicio está a ≤60 min en el futuro o ya empezó hace <10 min.
  // (Las que empezaron hace más rato caen en "● Pasada".) El badge
  // te avisa visualmente: "pulsa 💬 Recordatorio ahora".
  const minsToAppt = (() => {
    if (cleanDate(appt.date) !== today) return null
    const [h, m] = cleanTime(appt.time).split(':').map(Number)
    if (isNaN(h)) return null
    const start = new Date(); start.setHours(h, m, 0, 0)
    return Math.round((start - new Date()) / 60000) // + = futuro, - = pasado
  })()
  const remindNow = status==='pending' && minsToAppt !== null && minsToAppt <= 60 && minsToAppt > -10
  const bgMap  = {done:'var(--green-bg)', noshow:'var(--red-bg)', pending: past?'var(--border)':'var(--surface)'}
  const brdMap = {done:'#B0DDC0', noshow:'#F5C0B0', pending: past?'#E0D8D5':'var(--border)'}
  return (
    <div style={{background:bgMap[status],borderRadius:12,border:`1.5px solid ${remindNow?'var(--primary)':brdMap[status]}`,padding:14,marginTop:8,boxShadow:remindNow?'0 0 0 3px var(--primary-l)':'none'}}>
      {remindNow && <div style={{background:'var(--primary)',color:'white',borderRadius:8,padding:'4px 10px',fontSize:11,fontWeight:700,marginBottom:8,display:'inline-block',animation:'remindPing 1.4s ease-in-out infinite'}}>
        ⏰ Recordar ahora · {fmtTime(appt.time)}
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,marginBottom:1}}>{appt.clientName}</div>
          <div style={{fontSize:12,color:'var(--t2)'}}>📱 {appt.clientPhone}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontWeight:700,color:status==='done'?'var(--green)':status==='noshow'?'var(--red)':'var(--primary)',fontSize:14}}>
            {status==='noshow' ? <span style={{textDecoration:'line-through',opacity:.6}}>{fmtM(appt.totalPrice||appt.servicePrice)}</span> : fmtM(appt.totalPrice||appt.servicePrice)}
          </div>
          {dom && <div style={{fontSize:11,color:'var(--gold)'}}>🛵 +{fmtM(appt.domicilioPrice)}</div>}
          <div style={{fontSize:10,color:calOk?'var(--green)':'#ccc',marginTop:1}}>{calOk?'📅 Cal':'📅 —'}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
        <span className="tag" style={{fontSize:11}}>✨ {appt.serviceNames}</span>
        <span className="tag" style={{fontSize:11}}>📅 {fmtDate(appt.date)}</span>
        <span className="tag" style={{fontSize:11}}>🕐 {fmtTime(appt.time)} – {fmtTime(endTime(appt.time,apptDuration(appt)))}</span>
        {dom && <span className="tag-gold" style={{fontSize:11}}>🛵 Domicilio</span>}
        {status==='done'   && <span className="tag-g"    style={{fontSize:11}}>✓ Completada</span>}
        {status==='done'   && (payMethodOf(appt)
          ? <span className="tag-g" style={{fontSize:11,cursor:onChangePay?'pointer':'default'}} title="Cambiar método de pago" onClick={onChangePay}>{payMethodOf(appt)==='Efectivo'?'💵':'🏦'} {payMethodOf(appt)}</span>
          : <span className="tag-gold" style={{fontSize:11,cursor:onChangePay?'pointer':'default'}} title="Registrar método de pago" onClick={onChangePay}>💳 Sin método de pago · registrar</span>)}
        {status==='noshow' && <span style={{display:'inline-block',background:'#FFF0EC',color:'var(--red)',borderRadius:20,padding:'2px 10px',fontSize:12,fontWeight:600}}>✗ No asistió</span>}
        {status==='pending'&& past && <span className="tag-past" style={{fontSize:11}}>● Pasada</span>}
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {status==='pending' && isFuture && <span style={{fontSize:11,color:'var(--t2)',background:'var(--gold-bg)',borderRadius:8,padding:'6px 10px',fontWeight:600}}>📅 Cita futura — no se puede completar aún</span>}
        <button className={`btn-check${status==='done'?' done':''}`} onClick={()=>onToggle('done')}
          style={status==='done'?{}:{opacity: status==='noshow'?.5:1}}
          disabled={isFuture}>
          {status==='done'?'✓ Completada':'✓ Completada'}
        </button>
        <button onClick={()=>onToggle('noshow')}
          disabled={isFuture}
          style={{background:status==='noshow'?'var(--red)':'#FFF4F0',color:status==='noshow'?'white':'var(--red)',border:`1.5px solid ${status==='noshow'?'var(--red)':'#F5C0B0'}`,borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:600,cursor:isFuture?'not-allowed':'pointer',fontFamily:'inherit',transition:'all .15s',opacity: status==='done'?.5:1}}>
          ✗ No asistió
        </button>
        {status==='pending' && <button className="btn-wa" onClick={()=>openWA(appt.clientPhone,appt.clientName,appt.time,appt.date,appt.serviceNames,appt.totalPrice||appt.servicePrice,dom)}>💬 Recordatorio</button>}
        {status==='pending' && <button className="btn-edit" onClick={onEdit}>✏️ Editar</button>}
        {status==='pending' && <button className="btn-del" onClick={onDelete}>🗑️ Eliminar</button>}
      </div>
    </div>
  )
}

/* ── Edit Appointment — date, time AND services ── */
function EditAppt({appt,services,appts,SA,sync,priceHistory,onClose}) {
  const safeSvcs = Array.isArray(services)?services:[]

  // Build originalIds + original price map from appt data
  const resolveInitialIds = () => {
    const ids = String(appt.serviceIds||'').split(',').map(s=>s.trim()).filter(Boolean)
    if (ids.length) {
      const validById = ids.filter(id=>safeSvcs.some(s=>s.id===id))
      if (validById.length) return validById
      const names = String(appt.serviceNames||'').split(',').map(s=>s.trim()).filter(Boolean)
      return safeSvcs.filter(s=>names.includes(s.name)).map(s=>s.id)
    }
    const names = String(appt.serviceNames||'').split(',').map(s=>s.trim()).filter(Boolean)
    return safeSvcs.filter(s=>names.includes(s.name)).map(s=>s.id)
  }

  // ── Hooks primero — regla de React ─────────────────────────────────────────
  const _initialIds = resolveInitialIds()
  const [date,    setDate]  = useState(cleanDate(appt.date)||todayStr())
  const [time,    setTime]  = useState(cleanTime(appt.time)||'')
  const [svcIds,  setSvcIds]= useState(_initialIds)
  const [dom,     setDom]   = useState(bool(appt.domicilio))
  const [domP,    setDomP]  = useState(toN(appt.domicilioPrice)||10000)
  const [addr,    setAddr]  = useState(appt.address||'')
  const [loading, setL]     = useState(false)
  const [result,  setR]     = useState(null)

  // ── Lógica de precios (después de hooks) ────────────────────────────────
  const originalIds   = _initialIds
  const safeHistory   = Array.isArray(priceHistory) ? priceHistory : []
  const apptCreatedAt = appt.createdAt || appt.date || ''

  const getPriceAtDate = (serviceId, beforeDate) => {
    if (!beforeDate) return null
    const records = safeHistory
      .filter(h => String(h.serviceId) === String(serviceId) && String(h.changedAt) <= String(beforeDate))
      .sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)))
    return records.length > 0 ? toN(records[0].price) : null
  }

  const savedPrices = (() => {
    let snap = {}
    try {
      const raw = appt.servicePrices
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        snap = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, toN(v)]))
      } else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        snap = Object.fromEntries(Object.entries(JSON.parse(raw)).map(([k,v]) => [k, toN(v)]))
      }
    } catch(_e) { snap = {} }
    const result = { ...snap }
    originalIds.forEach(id => {
      if (result[id] !== undefined) return
      const fromHistory = getPriceAtDate(id, apptCreatedAt)
      if (fromHistory !== null) { result[id] = fromHistory; return }
      const svc = safeSvcs.find(s => s.id === id)
      if (svc) result[id] = toN(svc.price)
    })
    return result
  })()

  const getPriceFor = id => {
    if (originalIds.includes(id) && savedPrices[id] !== undefined) return savedPrices[id]
    const svc = safeSvcs.find(s => s.id === id)
    return svc ? toN(svc.price) : 0
  }
  const pricesChanged = originalIds.some(id => {
    const svc = safeSvcs.find(s => s.id === id)
    if (!svc) return false
    return savedPrices[id] !== undefined && savedPrices[id] !== toN(svc.price)
  })

  const toggleSvc= id => setSvcIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])
  const selSvcs  = safeSvcs.filter(s=>svcIds.includes(s.id))
  // Duración: si los servicios no cambiaron se respeta la guardada en la cita
  // (aunque el catálogo haya cambiado); si cambiaron, se recalcula con la suma.
  const sameSvcs = svcIds.length===originalIds.length && originalIds.every(id=>svcIds.includes(id))
  const totalDur = (sameSvcs && toN(appt.duration)>0) ? apptDuration(appt) : sumDuration(selSvcs)
  const slots    = getSlots(date, [], appts, appt.id, totalDur)
  const curSlot  = time ? slots.find(s=>cleanTime(s.time)===cleanTime(time)) : null
  const timeBlocked = !!(curSlot && curSlot.conflict)   // choca con otra cita o pasa del cierre
  // Price: original price for pre-existing services, current price for newly added
  const svcTotal = svcIds.reduce((s,id)=>s+getPriceFor(id),0)
  const safeDomP = Math.max(0, toN(domP)) // nunca negativo
  const grand    = svcTotal+(dom?safeDomP:0)

  const save = async () => {
    setL(true)
    const svcNames = selSvcs.map(s=>s.name).join(', ')
    const updatedServicePrices = JSON.stringify(
      Object.fromEntries(selSvcs.map(s => [s.id, getPriceFor(s.id)]))
    )
    const updated  = {
      ...appt, date, time:cleanTime(time)||time,
      serviceIds:selSvcs.map(s=>s.id).join(','), serviceNames:svcNames,
      servicePrices:updatedServicePrices,
      servicePrice:svcTotal, domicilio:dom, domicilioPrice:dom?safeDomP:0,
      totalPrice:grand, address:dom?addr:'', duration:totalDur
    }
    const next = appts.map(a=>a.id===appt.id?updated:a)
    await sync({appointments:next},null,null)
    SA(next)
    if (appt.calendarEventId && bool(appt.calendarCreated)) {
      const r = await saveData({action:'updateCalendarEvent',eventId:appt.calendarEventId,calendarEvent:{date,time,duration:totalDur}}).catch(e=>({calResult:{ok:false,error:e.message}}))
      setR(r?.calResult||null)
    } else setR({ok:null})
    setL(false)
  }

  return <div>
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
      <button className="btn-sm" onClick={onClose}>← Volver</button>
      <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Editar Cita</span>
    </div>

    {/* Client summary */}
    <div style={{background:'var(--primary-l)',borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontWeight:700,fontSize:15}}>{appt.clientName}</div>
      <div style={{fontSize:13,color:'var(--t2)',marginTop:2}}>📱 {appt.clientPhone}</div>
    </div>

    <div className="card">
      {/* Services */}
      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>✨ Servicios</div>
      {safeSvcs.map(s=>(
        <button key={s.id} className={`so${svcIds.includes(s.id)?' sel':''}`} onClick={()=>toggleSvc(s.id)}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${svcIds.includes(s.id)?'var(--primary)':'#ccc'}`,background:svcIds.includes(s.id)?'var(--primary)':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {svcIds.includes(s.id)&&<span style={{color:'white',fontSize:11}}>✓</span>}
            </div>
            <div><div style={{fontWeight:600,fontSize:14}}>{s.name}</div><div style={{fontSize:11,color:'var(--t2)'}}>⏱ {fmtDuration(svcDuration(s))}</div></div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <span style={{fontWeight:700,color:'var(--primary)',fontSize:14}}>{fmtM(getPriceFor(s.id))}</span>
            {originalIds.includes(s.id) && savedPrices[s.id] !== undefined && toN(savedPrices[s.id]) !== toN(s.price) &&
              <div style={{marginTop:2,textAlign:'right'}}>
                <span style={{fontSize:10,color:'var(--t2)',textDecoration:'line-through'}}>{fmtM(toN(s.price))}</span>
                <span style={{fontSize:10,color:'var(--t2)',marginLeft:3}}>nuevo</span>
              </div>}
          </div>
        </button>
      ))}
      {/* Deleted services: show as disabled if they were in the original appointment */}
      {(() => {
        const deletedNames = String(appt.serviceNames||'').split(',').map(s=>s.trim()).filter(n=>n&&!safeSvcs.some(s=>s.name===n))
        return deletedNames.length>0 ? (
          <div style={{background:'#FBF0F3',borderRadius:10,padding:'10px 14px',marginBottom:8,fontSize:13,color:'var(--t2)'}}>
            <span style={{fontWeight:600}}>Servicios eliminados del catálogo:</span> {deletedNames.join(', ')} — solo aparecen en el historial, no se pueden re-seleccionar.
          </div>
        ) : null
      })()}

      {/* Domicilio */}
      <div style={{marginTop:4,background:'var(--gold-bg)',border:'1.5px solid var(--gold)',borderRadius:12,padding:12,marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontWeight:700,fontSize:14}}>🛵 Domicilio</div>
          <button onClick={()=>setDom(!dom)} style={{background:dom?'var(--primary)':'white',color:dom?'white':'var(--primary)',border:'1.5px solid var(--primary)',borderRadius:20,padding:'5px 14px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{dom?'Sí ✓':'No'}</button>
        </div>
        {dom && <div style={{marginTop:10}}>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            {[10000,20000].map(v=><button key={v} onClick={()=>setDomP(v)} style={{flex:1,background:domP===v?'var(--primary)':'white',color:domP===v?'white':'var(--primary)',border:'1.5px solid var(--primary)',borderRadius:10,padding:'8px 4px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>{fmtM(v)}</button>)}
            <input className="inp" type="number" min="0" placeholder="Otro" style={{flex:1,padding:'8px 10px',fontSize:13}} value={![10000,20000].includes(domP)?domP:''} onChange={e=>setDomP(Math.max(0, Number(e.target.value)||0))}/>
          </div>
          <input className="inp" placeholder="Dirección" value={addr} onChange={e=>setAddr(e.target.value)}/>
          {dom && !addr.trim() && <div style={{color:'var(--red)',fontSize:11,marginTop:4}}>La dirección es obligatoria cuando el servicio es a domicilio</div>}
        </div>}
      </div>

      {/* Total preview */}
      {svcIds.length>0 && <div style={{background:'var(--primary-l)',borderRadius:10,padding:10,fontSize:14,marginBottom:14}}>
        {svcIds.map(id=>{ const s=safeSvcs.find(x=>x.id===id); if(!s)return null; const p=getPriceFor(id); const isOrig=originalIds.includes(id)&&savedPrices[id]!==undefined&&toN(savedPrices[id])!==toN(s.price); return <div key={id} style={{display:'flex',justifyContent:'space-between',marginBottom:2}}><span style={{color:'var(--t2)'}}>{s.name}{isOrig?<span style={{fontSize:10,color:'var(--t2)',marginLeft:4}}>(precio guardado)</span>:''}</span><span style={{fontWeight:600}}>{fmtM(p)}</span></div> })}
        {dom&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}><span style={{color:'var(--t2)'}}>Domicilio</span><span style={{fontWeight:600}}>{fmtM(domP)}</span></div>}
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:5,marginTop:4}}><span style={{fontWeight:700}}>Total</span><span style={{fontWeight:700,color:'var(--primary)',fontSize:16}}>{fmtM(grand)}</span></div>
      </div>}

      {/* Date */}
      <label className="lbl">Fecha</label>
      <input type="date" className="inp" value={date} min={todayStr()} onChange={e=>{setDate(e.target.value);setTime('')}} style={{marginBottom:14}}/>

      {/* Time */}
      <label className="lbl">Hora</label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6,marginBottom:14}}>
        {slots.map(({time:t,disabled,reason})=>{
          const t2=cleanTime(t), isSel=cleanTime(time)===t2
          return <button key={t} className={`to${isSel?' sel':''}`} disabled={disabled} title={disabled?reason:''} onClick={()=>!disabled&&setTime(t)}>
            {fmtTime(t)}
          </button>
        })}
      </div>
      {time && !timeBlocked && <div style={{background:'var(--primary-l)',borderRadius:10,padding:10,fontSize:13,marginBottom:14}}>✅ <strong>{fmtTime(time)}</strong> – <strong>{fmtTime(endTime(time,totalDur))}</strong> · {fmtDuration(totalDur)} — {fmtDate(date)}</div>}
      {time && timeBlocked && <div style={{background:'var(--warn-bg)',color:'var(--warn-t)',borderRadius:10,padding:10,fontSize:13,marginBottom:14}}>⚠️ Con una duración de <strong>{fmtDuration(totalDur)}</strong>, las {fmtTime(time)} chocan con otra cita o pasan de las {fmtTime(CLOSING_TIME)}. Elige otra hora.</div>}

      {result!==null && <div style={{background:result.ok||result.ok===null?'#EDF7F0':'var(--warn-bg)',borderRadius:10,padding:10,fontSize:13,marginBottom:14,color:result.ok||result.ok===null?'var(--green)':'var(--warn-t)'}}>
        {result.ok===null?'✅ Cita actualizada':result.ok?'✅ Cita y Calendar actualizados':`✅ Cita guardada. Calendar: ${result.error}`}
      </div>}

      {result!==null
        ? <button className="btn" style={{width:'100%'}} onClick={onClose}>Listo</button>
        : <div style={{display:'flex',gap:8}}>
            <button className="btn-o" onClick={onClose}>Cancelar</button>
            <button className="btn" style={{flex:1}} onClick={save} disabled={!time||timeBlocked||svcIds.length===0||loading||(dom&&!addr.trim())}>{loading?'⏳ Guardando…':'Guardar cambios'}</button>
          </div>
      }
    </div>
  </div>
}

/* ══════════════════════════════════════════════════════════════
   NEW APPOINTMENT WIZARD
══════════════════════════════════════════════════════════════ */
function NewWizard({clients,services,appts,SA,SC,sync,infoModal,onClose,initialDate}) {
  const [step,    setStep]  = useState(1)
  const [query,   setQ]     = useState('')
  const [suggs,   setSuggs] = useState([])
  const [fc,      setFc]    = useState(null)
  const [createM, setCM]    = useState(false)
  const [newName, setNN]    = useState('')
  const [newPhone,setNP]    = useState('')
  const [svcIds,  setSvcIds]= useState([])
  const [dom,     setDom]   = useState(false)
  const [domP,    setDomP]  = useState(10000)
  const [addr,    setAddr]  = useState('')
  const [date,    setDate]  = useState(initialDate || todayStr())
  const [time,    setTime]  = useState('')
  const [loading, setL]     = useState(false)
  const [calR,    setCalR]  = useState(null)
  const [done,    setDone]  = useState(false)

  const isPhoneQ = q => /^\d+$/.test(q.replace(/[^0-9]/g,''))

  const search = () => {
    const q = query.trim(); if (!q) return
    let found = []
    if (isPhoneQ(q)) {
      const clean = q.replace(/\D/g,'')
      found = clients.filter(c=>phoneMatch(c.phone, clean))
    } else {
      found = clients.filter(c=>(c.name||'').toLowerCase().includes(q.toLowerCase()))
    }
    if (found.length===0) {
      setCM(true)
      if (isPhoneQ(q)) setNP(q.replace(/\D/g,'').slice(0,10))
      else setNN(q)
      setSuggs([]); setStep(2)
    } else if (found.length===1) {
      setFc(found[0]); setCM(false); setSuggs([]); setStep(3)
    } else {
      setSuggs(found); setCM(false); setStep(2)
    }
  }

  const phoneValid = p => p.replace(/\D/g,'').length>=10
  const nameValid  = n => n.trim().length>=3

  const confirmClient = () => {
    const clean = newPhone.replace(/\D/g,'')
    const dup   = clients.find(c=>(c.phone||'').replace(/\D/g,'')===clean)
    if (dup) {
      infoModal(`Ya existe la clienta "${dup.name}" con el número ${newPhone}. No se puede duplicar.`)
      return
    }
    if (createM && nameValid(newName) && phoneValid(newPhone)) {
      const nc = {id:uid(),name:newName.trim().toUpperCase(),phone:newPhone.trim(),createdAt:todayStr()}
      SC([...clients,nc]); setFc(nc)
    }
    setStep(3)
  }

  // Al cambiar servicios cambia la duración → la hora elegida antes puede dejar de caber.
  const toggleSvc = id => { setSvcIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]); setTime('') }
  const selSvcs   = (Array.isArray(services)?services:[]).filter(s=>svcIds.includes(s.id))
  const svcTotal  = selSvcs.reduce((s,x)=>s+toN(x.price),0)
  const safeDomP  = Math.max(0, toN(domP)) // nunca negativo
  const grand     = svcTotal+(dom?safeDomP:0)
  const totalDur  = sumDuration(selSvcs)
  const slots     = getSlots(date,[],appts,null,totalDur)

  const confirm = async () => {
    setL(true)
    const svcNames = selSvcs.map(s=>s.name).join(', ')
    const appt = {
      id:uid(), clientId:fc.id||'', clientName:fc.name, clientPhone:fc.phone,
      serviceIds:selSvcs.map(s=>s.id).join(','), serviceNames:svcNames,
      servicePrices:JSON.stringify(Object.fromEntries(selSvcs.map(s=>[s.id, toN(s.price)]))),
      servicePrice:svcTotal, domicilio:dom, domicilioPrice:dom?safeDomP:0,
      totalPrice:grand, address:dom?addr:'', duration:totalDur,
      date, time:cleanTime(time)||time,
      createdAt:localNowISO(), calendarCreated:false, calendarEventId:'', completed:false
    }
    const res = await sync({
      appointments:[...appts,appt],
      calendarEvent:{clientName:fc.name,clientPhone:fc.phone,serviceNames:svcNames,totalPrice:grand,domicilio:dom,domicilioPrice:dom?safeDomP:0,address:addr,date,time,duration:totalDur}
    },null,null)
    if (res?.calResult?.ok) { appt.calendarCreated=true; appt.calendarEventId=res.calResult.eventId||'' }
    SA([...appts,appt]); setCalR(res?.calResult||null); setL(false); setDone(true)
  }

  const Dots = () => <div style={{display:'flex',alignItems:'center',marginBottom:22,gap:4}}>
    {[1,2,3,4].map((s,i)=><div key={s} style={{display:'contents'}}>
      <div style={{width:27,height:27,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,transition:'background .2s',background:step>s?'var(--primary)':step===s?'var(--primary)':'var(--border)',color:step>=s?'white':'var(--t2)'}}>{step>s?'✓':s}</div>
      {i<3&&<div style={{flex:1,height:2,transition:'background .3s',background:step>s?'var(--primary)':'var(--border)'}}/>}
    </div>)}
  </div>

  return <div>
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
      <button className="btn-sm" onClick={onClose}>← Volver</button>
      <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Nueva Cita</span>
    </div>
    {!done&&!loading&&<Dots/>}

    {/* S1 — Buscar */}
    {step===1 && <div className="card">
      <div style={{fontFamily:'Georgia,serif',fontSize:18,marginBottom:14}}>Buscar cliente</div>
      <label className="lbl">Nombre o número de celular</label>
      <input className="inp" placeholder="Ej: Laura o 3001234567" value={query}
        onChange={e=>{setQ(e.target.value);setSuggs([])}}
        onKeyDown={e=>e.key==='Enter'&&query.trim()&&search()}
        style={{marginBottom:14}}/>
      <button className="btn" style={{width:'100%'}} onClick={search} disabled={!query.trim()}>Buscar cliente</button>
    </div>}

    {/* S2 — Multiple results */}
    {step===2 && suggs.length>0 && <div className="card">
      <div style={{fontFamily:'Georgia,serif',fontSize:18,marginBottom:14}}>Seleccionar cliente</div>
      <div style={{fontSize:13,color:'var(--t2)',marginBottom:12}}>Varios resultados para "<strong>{query}</strong>":</div>
      <div style={{borderRadius:12,border:'1px solid var(--border)',overflow:'hidden',marginBottom:14}}>
        {suggs.map(c=>{
          const n=appts.filter(a=>(a.clientPhone||'').replace(/\D/g,'')===(c.phone||'').replace(/\D/g,'')).length
          return <div key={c.id} className="sugg-item" onClick={()=>{setFc(c);setSuggs([]);setStep(3)}}>
            <div style={{fontWeight:600}}>{c.name}</div>
            <div style={{fontSize:12,color:'var(--t2)'}}>📱 {c.phone} · {n} cita{n!==1?'s':''}</div>
          </div>
        })}
      </div>
      <button className="btn-o" style={{width:'100%'}} onClick={()=>setStep(1)}>← Buscar de nuevo</button>
    </div>}

    {/* S2b — Create client */}
    {step===2 && createM && <div className="card">
      <div style={{fontFamily:'Georgia,serif',fontSize:18,marginBottom:6}}>Cliente no encontrada</div>
      <div style={{fontSize:13,color:'var(--t2)',marginBottom:14}}>Registra a esta clienta para continuar</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
        <div>
          <label className="lbl">Nombre (mín. 3 caracteres)</label>
          <input className="inp" placeholder="Nombre completo" value={newName} onChange={e=>setNN(e.target.value)}
            style={{borderColor:newName&&!nameValid(newName)?'var(--red)':'var(--border)'}}/>
          {newName&&!nameValid(newName)&&<div style={{fontSize:11,color:'var(--red)',marginTop:3}}>Mínimo 3 caracteres</div>}
        </div>
        <div>
          <label className="lbl">Celular (10 dígitos)</label>
          <input className="inp" type="tel" placeholder="3001234567" value={newPhone}
            onChange={e=>setNP(e.target.value.replace(/\D/g,'').slice(0,10))}
            style={{borderColor:newPhone&&!phoneValid(newPhone)?'var(--red)':'var(--border)'}}/>
          {newPhone&&!phoneValid(newPhone)&&<div style={{fontSize:11,color:'var(--red)',marginTop:3}}>Mínimo 10 dígitos</div>}
        </div>
      </div>
      <button className="btn" style={{width:'100%'}} onClick={confirmClient} disabled={!nameValid(newName)||!phoneValid(newPhone)}>Crear y continuar</button>
      <button className="btn-o" style={{width:'100%',marginTop:8}} onClick={()=>{setStep(1);setCM(false)}}>Volver a buscar</button>
    </div>}

    {/* S3 — Services (with client name visible) */}
    {step===3 && <div className="card">
      {/* Client banner */}
      <div style={{background:'var(--primary-l)',borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:34,height:34,borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:15,flexShrink:0}}>
          {String(fc?.name||'?').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:14}}>{fc?.name}</div>
          <div style={{fontSize:12,color:'var(--t2)'}}>📱 {fc?.phone}</div>
        </div>
      </div>

      <div style={{fontFamily:'Georgia,serif',fontSize:16,marginBottom:4}}>Seleccionar servicios</div>
      <div style={{fontSize:12,color:'var(--t2)',marginBottom:12}}>Puedes elegir uno o varios</div>
      {(Array.isArray(services)?services:[]).map(s=>(
        <button key={s.id} className={`so${svcIds.includes(s.id)?' sel':''}`} onClick={()=>toggleSvc(s.id)}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${svcIds.includes(s.id)?'var(--primary)':'#ccc'}`,background:svcIds.includes(s.id)?'var(--primary)':'white',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {svcIds.includes(s.id)&&<span style={{color:'white',fontSize:13}}>✓</span>}
            </div>
            <div><div style={{fontWeight:600,fontSize:14}}>{s.name}</div><div style={{fontSize:11,color:'var(--t2)'}}>⏱ {fmtDuration(svcDuration(s))}</div></div>
          </div>
          <span style={{fontWeight:700,color:'var(--primary)',fontSize:14,flexShrink:0}}>{fmtM(s.price)}</span>
        </button>
      ))}

      {/* Domicilio */}
      <div style={{marginTop:4,background:'var(--gold-bg)',border:'1.5px solid var(--gold)',borderRadius:12,padding:14}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div><div style={{fontWeight:700,fontSize:14}}>🛵 ¿A domicilio?</div><div style={{fontSize:12,color:'var(--t2)',marginTop:1}}>Se suma al total</div></div>
          <button onClick={()=>setDom(!dom)} style={{background:dom?'var(--primary)':'white',color:dom?'white':'var(--primary)',border:'1.5px solid var(--primary)',borderRadius:20,padding:'6px 16px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>{dom?'Sí ✓':'No'}</button>
        </div>
        {dom && <div style={{marginTop:12}}>
          <label className="lbl">Valor domicilio</label>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            {[10000,20000].map(v=><button key={v} onClick={()=>setDomP(v)} style={{flex:1,background:domP===v?'var(--primary)':'white',color:domP===v?'white':'var(--primary)',border:'1.5px solid var(--primary)',borderRadius:10,padding:'10px 4px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>{fmtM(v)}</button>)}
            <input className="inp" type="number" min="0" placeholder="Otro" style={{flex:1,padding:'10px 10px',fontSize:14}} value={![10000,20000].includes(domP)?domP:''} onChange={e=>setDomP(Math.max(0, Number(e.target.value)||0))}/>
          </div>
          <label className="lbl">Dirección</label>
          <input className="inp" placeholder="Ej: Cra 15 #45-20, Apto 302" value={addr} onChange={e=>setAddr(e.target.value)}/>
          {dom && !addr.trim() && <div style={{color:'var(--red)',fontSize:11,marginTop:4}}>La dirección es obligatoria cuando el servicio es a domicilio</div>}
        </div>}
      </div>

      {svcIds.length>0 && <div style={{marginTop:12,background:'var(--primary-l)',borderRadius:10,padding:12,fontSize:14}}>
        {selSvcs.map(s=><div key={s.id} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{color:'var(--t2)'}}>{s.name}</span><span style={{fontWeight:600}}>{fmtM(s.price)}</span></div>)}
        {dom&&<div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{color:'var(--t2)'}}>Domicilio</span><span style={{fontWeight:600}}>{fmtM(domP)}</span></div>}
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--border)',paddingTop:6,marginTop:4}}><span style={{fontWeight:700}}>Total</span><span style={{fontWeight:700,color:'var(--primary)',fontSize:16}}>{fmtM(grand)}</span></div>
      </div>}

      <button className="btn" style={{width:'100%',marginTop:14}} onClick={()=>setStep(4)} disabled={svcIds.length===0||(dom&&!addr.trim())}>
        Siguiente {svcIds.length>0&&`(${svcIds.length} servicio${svcIds.length>1?'s':''})`}
      </button>
    </div>}

    {/* S4 — Date & Time */}
    {step===4 && <div className="card">
      {/* Client banner */}
      <div style={{background:'var(--primary-l)',borderRadius:10,padding:'8px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:13,flexShrink:0}}>{String(fc?.name||'?').charAt(0).toUpperCase()}</div>
        <span style={{fontWeight:700,fontSize:14}}>{fc?.name}</span>
        <span style={{fontSize:12,color:'var(--t2)'}}>· {selSvcs.map(s=>s.name).join(', ')}</span>
      </div>

      <div style={{fontFamily:'Georgia,serif',fontSize:18,marginBottom:14}}>Fecha y hora</div>
      <label className="lbl">Fecha</label>
      <input type="date" className="inp" value={date} min={todayStr()} onChange={e=>{setDate(e.target.value);setTime('')}} style={{marginBottom:16}}/>
      <label className="lbl">Hora disponible</label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6,marginBottom:14}}>
        {slots.map(({time:t,disabled,reason})=>{
          const t2=cleanTime(t), isSel=cleanTime(time)===t2
          return <button key={t} className={`to${isSel?' sel':''}`} disabled={disabled} title={disabled?reason:''} onClick={()=>!disabled&&setTime(t)}>
            {fmtTime(t)}
          </button>
        })}
      </div>
      {time && <div style={{background:'var(--primary-l)',borderRadius:10,padding:10,fontSize:13,marginBottom:14}}>
        ✅ <strong>{fmtTime(time)}</strong> hasta <strong>{fmtTime(endTime(time,totalDur))}</strong> · {fmtDuration(totalDur)}
      </div>}
      <div style={{display:'flex',gap:8}}>
        <button className="btn-o" onClick={()=>setStep(3)}>Atrás</button>
        <button className="btn" style={{flex:1}} onClick={()=>setStep(4.5)} disabled={!time}>Ver resumen</button>
      </div>
    </div>}

    {/* S4.5 — Summary */}
    {step===4.5&&!loading&&!done && <div className="card">
      <div style={{fontFamily:'Georgia,serif',fontSize:18,marginBottom:16}}>Confirmar cita</div>
      {[['👤 Cliente',fc?.name],['📱 Teléfono',fc?.phone],['✨ Servicios',selSvcs.map(s=>s.name).join(', ')],['💳 Servicios',fmtM(svcTotal)],...(dom?[['🛵 Domicilio',fmtM(domP)],['📍 Dirección',addr||'—']]:[])]
        .map(([l,v])=><div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:14}}><span style={{color:'var(--t2)'}}>{l}</span><span style={{fontWeight:600,maxWidth:'60%',textAlign:'right'}}>{v}</span></div>)
      }
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontSize:16}}><span style={{fontWeight:700}}>💎 Total</span><span style={{fontWeight:700,color:'var(--primary)',fontSize:18}}>{fmtM(grand)}</span></div>
      {[['📅 Fecha',fmtDate(date)],['🕐 Hora',`${fmtTime(time)} – ${fmtTime(endTime(time,totalDur))}`],['⏱ Duración',fmtDuration(totalDur)]].map(([l,v])=>(
        <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:14}}><span style={{color:'var(--t2)'}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
      ))}
      <div style={{marginTop:12,background:'var(--green-bg)',borderRadius:10,padding:10,fontSize:13,color:'var(--green)',marginBottom:16}}>📅 Se creará automáticamente en Google Calendar</div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn-o" onClick={()=>setStep(4)}>Atrás</button>
        <button className="btn" style={{flex:1}} onClick={confirm}>Confirmar ✓</button>
      </div>
    </div>}

    {loading && <div className="card" style={{textAlign:'center',padding:40}}>
      <div style={{fontSize:38,display:'inline-block',animation:'spin 1s linear infinite'}}>{BIZ_EMOJI}</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:16,color:'var(--primary)',marginTop:14}}>Guardando y creando evento en Calendar…</div>
    </div>}

    {done&&!loading && <div className="card" style={{textAlign:'center'}}>
      <div style={{fontSize:42,marginBottom:12}}>🎉</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:700,marginBottom:10}}>¡Cita agendada!</div>
      <div style={{background:calR?.ok?'#EDF7F0':'var(--warn-bg)',borderRadius:10,padding:12,fontSize:13,color:calR?.ok?'var(--green)':'var(--warn-t)',marginBottom:14,textAlign:'left'}}>
        {calR?.ok?'📅 Evento creado en Google Calendar ✨':`⚠️ Cita guardada. Calendar: ${calR?.error||'error.'}`}
      </div>
      <div style={{background:'var(--primary-l)',borderRadius:12,padding:16,textAlign:'left',marginBottom:14,fontSize:14}}>
        <div style={{fontWeight:700,marginBottom:4}}>{fc?.name}</div>
        <div style={{color:'var(--t2)',marginBottom:2}}>{selSvcs.map(s=>s.name).join(' + ')}</div>
        {dom&&<div style={{color:'var(--gold)',marginBottom:2}}>🛵 {fmtM(domP)}{addr?` — ${addr}`:''}</div>}
        <div style={{color:'var(--primary)',fontWeight:700,marginBottom:2}}>💎 {fmtM(grand)}</div>
        <div style={{color:'var(--t2)'}}>{fmtDate(date)} · {fmtTime(time)} – {fmtTime(endTime(time,totalDur))}</div>
      </div>
      {/* WhatsApp note */}
      <div style={{background:'var(--green-bg)',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:12,color:'var(--green)',textAlign:'left'}}>
        <strong>💬 Sobre el recordatorio automático:</strong> WhatsApp no permite envíos automáticos desde web. Al dar clic en el botón se abre WhatsApp con el mensaje listo — solo tienes que presionar enviar.
      </div>
      <button className="btn-wa" style={{width:'100%',marginBottom:10}} onClick={()=>openWA(fc?.phone,fc?.name,time,date,selSvcs.map(s=>s.name).join(', '),grand,dom)}>
        💬 Abrir WhatsApp con mensaje listo
      </button>
      <button className="btn" style={{width:'100%'}} onClick={onClose}>Finalizar</button>
    </div>}
  </div>
}

/* ══════════════════════════════════════════════════════════════
   CLIENTS TAB — with duplicate phone check
══════════════════════════════════════════════════════════════ */
function ClientsTab({clients,appts,SC,confirm,infoModal,setTab}) {
  const [name,  setN]  = useState('')
  const [phone, setP]  = useState('')
  const [srch,  setSr] = useState('')
  const [editId,setEI] = useState(null)
  const [editData,setED]= useState({})
  const safe = Array.isArray(clients)?clients:[]

  const phoneValid = p => p.replace(/\D/g,'').length>=10
  const nameValid  = n => n.trim().length>=3

  const add = () => {
    const clean = phone.replace(/\D/g,'')
    const dup   = safe.find(c=>(c.phone||'').replace(/\D/g,'')===clean)
    if (dup) { infoModal(`Ya existe "${dup.name}" con ese número. No se puede duplicar.`); return }
    if (!nameValid(name)||!phoneValid(phone)) return
    SC([...safe,{id:uid(),name:name.trim().toUpperCase(),phone:phone.trim(),createdAt:todayStr()}])
    setN(''); setP('')
  }

  const saveEdit = c => {
    const clean = editData.phone?.replace(/\D/g,'')||''
    const dup   = safe.find(x=>x.id!==c.id&&(x.phone||'').replace(/\D/g,'')===clean)
    if (dup) { infoModal(`Ya existe "${dup.name}" con ese número.`); return }
    SC(safe.map(x=>x.id===c.id?{...c,...editData,name:(editData.name||c.name).trim().toUpperCase()}:x)); setEI(null)
  }

  const filt = safe.filter(c=>String(c.name||'').toLowerCase().includes(srch.toLowerCase())||phoneMatch(c.phone, srch))

  return <>
    <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:600,color:'var(--t)',marginBottom:16}}>Clientes</div>
    <div className="card">
      <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>✨ Agregar cliente</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <div>
          <label className="lbl">Nombre (mín. 3)</label>
          <input className="inp" placeholder="Nombre completo" value={name} onChange={e=>setN(e.target.value)}
            style={{borderColor:name&&!nameValid(name)?'var(--red)':'var(--border)'}}/>
          {name&&!nameValid(name)&&<div style={{fontSize:11,color:'var(--red)',marginTop:3}}>Mínimo 3 caracteres</div>}
        </div>
        <div>
          <label className="lbl">Celular (10 dígitos)</label>
          <input className="inp" type="tel" placeholder="3001234567" value={phone}
            onChange={e=>setP(e.target.value.replace(/\D/g,'').slice(0,10))}
            style={{borderColor:phone&&!phoneValid(phone)?'var(--red)':'var(--border)'}}/>
          {phone&&!phoneValid(phone)&&<div style={{fontSize:11,color:'var(--red)',marginTop:3}}>Mínimo 10 dígitos</div>}
        </div>
      </div>
      <button className="btn" style={{width:'100%'}} onClick={add} disabled={!nameValid(name)||!phoneValid(phone)}>Agregar cliente</button>
    </div>
    <input className="inp" placeholder="🔍 Buscar…" value={srch} onChange={e=>setSr(e.target.value)} style={{marginBottom:14}}/>
    <div className="card">
      <div style={{fontWeight:700,marginBottom:4,fontSize:15}}>Registradas ({filt.length})</div>
      {filt.length===0
        ?<div style={{textAlign:'center',padding:20,color:'var(--t2)',fontSize:14}}>No hay clientes</div>
        :filt.map(c=>{
          const n=(Array.isArray(appts)?appts:[]).filter(a=>(a.clientPhone||'').replace(/\D/g,'')===(c.phone||'').replace(/\D/g,'')).length
          const isEdit=editId===c.id
          return <div key={c.id||c.phone} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
            {isEdit
              ?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div><label className="lbl">Nombre</label><input className="inp" value={editData.name||''} onChange={x=>setED(p=>({...p,name:x.target.value}))}/></div>
                <div><label className="lbl">Celular</label><input className="inp" type="tel" value={editData.phone||''} onChange={x=>setED(p=>({...p,phone:x.target.value.replace(/\D/g,'').slice(0,10)}))}/></div>
                <div style={{gridColumn:'span 2',display:'flex',gap:8,marginTop:4}}>
                  <button className="btn" style={{flex:1}} onClick={()=>saveEdit(c)}>Guardar</button>
                  <button className="btn-del" onClick={()=>setEI(null)}>Cancelar</button>
                </div>
              </div>
              :<div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:38,height:38,borderRadius:'50%',background:'var(--primary-l)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:16,color:'var(--primary)',flexShrink:0}}>{String(c.name||'?').charAt(0).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:12,color:'var(--t2)'}}>📱 {c.phone} · {n} cita{n!==1?'s':''}</div>
                </div>
                <button className="btn-sm" style={{padding:'5px 8px',fontSize:11}} onClick={()=>setTab('client-history',{client:c})}>Historial</button>
                <button className="btn-edit" onClick={()=>{setEI(c.id);setED({name:c.name,phone:c.phone})}}>✏️</button>
                <button className="btn-del" onClick={()=>{
                  const pending=(Array.isArray(appts)?appts:[]).filter(a=>(a.clientPhone||'').replace(/\D/g,'')===(c.phone||'').replace(/\D/g,'')&&!bool(a.completed)&&!isPastAppt(a))
                  if(pending.length>0){infoModal(`No se puede eliminar a ${c.name}. Tiene ${pending.length} cita${pending.length>1?'s':''} pendiente${pending.length>1?'s':''}. Completa o elimina las citas primero.`);return}
                  confirm(`¿Eliminar a ${c.name}?`,()=>SC(safe.filter(x=>x.id!==c.id)))
                }}>🗑️</button>
              </div>
            }
          </div>
        })
      }
    </div>
  </>
}

/* ══════════════════════════════════════════════════════════════
   SERVICES TAB
══════════════════════════════════════════════════════════════ */
function ServicesTab({services,SS,confirm}) {
  const [name,setN]=useState(''), [price,setP]=useState(''), [editId,setEI]=useState(null), [eP,setEP]=useState('')
  const [dur,setDur]=useState(60), [eD,setED]=useState(60)   // duración (min) al crear / al editar
  const [priceErr,setPErr]=useState('')   // mensaje "no puede ser negativo"
  const safe=Array.isArray(services)?services:[]
  const add=()=>{if(!name.trim()||!price)return;SS([...safe,{id:uid(),name:name.trim(),price:Math.max(0,Number(price)||0),duration:dur}]);setN('');setP('');setDur(60);setPErr('')}
  return <>
    <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:600,color:'var(--t)',marginBottom:16}}>Servicios</div>
    <div className="card">
      <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>✨ Agregar servicio</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <div><label className="lbl">Nombre</label><input className="inp" placeholder="Ej: Diseño de cejas" value={name} onChange={e=>setN(e.target.value)}/></div>
        <div>
          <label className="lbl">Precio (COP)</label>
          <input className="inp" type="number" min="0" placeholder="35000" value={price} onChange={e=>{
            const v=e.target.value
            setP(v)
            setPErr(Number(v)<0 ? 'El precio del servicio no puede ser negativo' : '')
          }}/>
          {priceErr&&<div style={{color:'var(--red)',fontSize:11,marginTop:4}}>{priceErr}</div>}
        </div>
        <div style={{gridColumn:'1 / -1'}}>
          <label className="lbl">Duración</label>
          <select className="inp" value={dur} onChange={e=>setDur(Number(e.target.value))}>
            {DURATION_OPTIONS.map(m=><option key={m} value={m}>{fmtDuration(m)}</option>)}
          </select>
        </div>
      </div>
      <button className="btn" style={{width:'100%'}} onClick={add} disabled={!name.trim()||!price}>{'Agregar servicio'}</button>
    </div>
    <div className="card">
      <div style={{fontWeight:700,marginBottom:14,fontSize:15}}>Servicios ({safe.length})</div>
      {safe.length===0?<div style={{textAlign:'center',padding:20,color:'var(--t2)'}}>No hay servicios</div>
        :safe.map(s=><div key={s.id} className="row">
          <div style={{fontSize:20,flexShrink:0}}>✨</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14}}>{s.name}</div><div style={{fontSize:12,color:'var(--t2)'}}>⏱ {fmtDuration(svcDuration(s))}</div></div>
          {editId===s.id
            ?<div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <select className="inp" value={eD} onChange={e=>setED(Number(e.target.value))} style={{width:92,padding:'6px 6px',fontSize:12}}>
                  {(DURATION_OPTIONS.includes(eD)?DURATION_OPTIONS:[...DURATION_OPTIONS,eD].sort((p,q)=>p-q)).map(m=><option key={m} value={m}>{fmtDuration(m)}</option>)}
                </select>
                <input className="inp" type="number" min="0" value={eP} onChange={e=>setEP(e.target.value)} style={{width:100,padding:'6px 10px',fontSize:13}}/>
                <button className="btn" style={{padding:'6px 12px',fontSize:13}} disabled={Number(eP)<0} onClick={()=>{SS(safe.map(x=>x.id===s.id?{...x,price:Math.max(0,Number(eP)||0),duration:eD}:x));setEI(null)}}>✓</button>
                <button className="btn-del" onClick={()=>setEI(null)}>✕</button>
              </div>
              {Number(eP)<0&&<div style={{color:'var(--red)',fontSize:10,whiteSpace:'nowrap'}}>El precio del servicio no puede ser negativo</div>}
            </div>
            :<div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontWeight:700,color:'var(--primary)',fontSize:15}}>{fmtM(s.price)}</span>
              <button className="btn-edit" onClick={()=>{setEI(s.id);setEP(String(s.price));setED(svcDuration(s))}}>✏️</button>
              <button className="btn-del" onClick={()=>confirm(`¿Eliminar el servicio "${s.name}"?`,()=>SS(safe.filter(x=>x.id!==s.id)))}>✕</button>
            </div>
          }
        </div>)
      }
    </div>
  </>
}

/* ══════════════════════════════════════════════════════════════
   FINANCES TAB
══════════════════════════════════════════════════════════════ */
function FinancesTab({appts,expenses,SE,setTab,confirm}) {
  const [month,setM]=useState(monthStr)
  const [desc,setD]=useState(''), [amount,setA]=useState(''), [cat,setC]=useState('Insumos'), [expDate,setED]=useState(todayStr())
  const [editId,setEI]=useState(null), [editData,setEData]=useState({})
  const [customCat,setCC]=useState('')
  const [amountErr,setAErr]=useState('')   // mensaje "no puede ser negativo"
  const [hiddenCats,setHC]=useState(()=>{try{return JSON.parse(localStorage.getItem('sz_hcats')||'[]')}catch{return[]}})
  const [showCatMgr,setSCM]=useState(false)

  const safe=Array.isArray(expenses)?expenses:[]
  const safeA=Array.isArray(appts)?appts:[]
  const months=[...new Set([...safeA.map(a=>cleanDate(a.date).slice(0,7)),...safe.map(e=>cleanDate(e.date).slice(0,7)),monthStr()].filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const usedCats=safe.map(e=>e.category).filter(Boolean)
  // All categories: default (minus hidden ones that have NO expenses) + custom from expenses
  const allCats=[...new Set([...DEF_CATS.filter(c=>!hiddenCats.includes(c)||usedCats.includes(c)),...usedCats])]

  const hideCategory = cat => {
    const next=[...hiddenCats,cat]
    setHC(next)
    try{localStorage.setItem('sz_hcats',JSON.stringify(next))}catch{}
  }
  const showCategory = cat => {
    const next=hiddenCats.filter(c=>c!==cat)
    setHC(next)
    try{localStorage.setItem('sz_hcats',JSON.stringify(next))}catch{}
  }
  const ma=safeA.filter(a=>cleanDate(a.date).slice(0,7)===month)
  const me=safe.filter(e=>cleanDate(e.date).slice(0,7)===month)
  const ledger=monthLedger(safeA,safe,month)
  const revDone=ledger.totalIncome
  const revTotal=ma.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const tot=ledger.totalExpenses

  const add=()=>{
    if(!desc.trim()||!amount||Number(amount)<0)return
    SE([...safe,{id:uid(),description:capFirst(desc),amount:Math.max(0,Number(amount)||0),category:capFirst(customCat||cat),date:expDate}])
    setD('');setA('');setCC('');setAErr('')
  }
  const saveEdit=()=>{if(Number(editData.amount)<0)return;SE(safe.map(e=>e.id===editId?{...e,...editData,amount:Math.max(0,toN(editData.amount))}:e));setEI(null)}

  return <>
    <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:600,color:'var(--t)',marginBottom:16}}>Finanzas</div>
    <div style={{marginBottom:14}}>
      <label className="lbl">Ver mes</label>
      <select className="inp" value={month} onChange={e=>setM(e.target.value)}>
        {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>)}
      </select>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginBottom:14}}>
      <div style={{background:'var(--green-bg)',borderRadius:14,padding:'14px 10px',textAlign:'center',cursor:'pointer'}} onClick={()=>setTab('income-detail',{month})}>
        <div style={{fontSize:11,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Recibido</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:'var(--green)'}}>{fmtM(revDone)}</div>
        <div style={{fontSize:10,color:'var(--green)',marginTop:2}}>Ver →</div>
      </div>
      <div style={{background:'var(--red-bg)',borderRadius:14,padding:'14px 10px',textAlign:'center',cursor:'pointer'}} onClick={()=>setTab('expense-detail',{month})}>
        <div style={{fontSize:11,color:'var(--red)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Gastos</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:'var(--red)'}}>{fmtM(tot)}</div>
        <div style={{fontSize:10,color:'var(--red)',marginTop:2}}>Ver →</div>
      </div>
      <div style={{background:revDone-tot>=0?'var(--green-bg)':'var(--red-bg)',borderRadius:14,padding:'14px 10px',textAlign:'center',border:`1px solid ${revDone-tot>=0?'var(--green)':'var(--red)'}`}}>
        <div style={{fontSize:11,color:revDone-tot>=0?'var(--green)':'var(--red)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Neto</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.8vw,15px)',fontWeight:700,color:revDone-tot>=0?'var(--green)':'var(--red)'}}>{fmtM(revDone-tot)}</div>
      </div>
    </div>
    {revTotal>revDone&&<div style={{background:'var(--warn-bg)',borderRadius:12,padding:'10px 14px',marginBottom:14,fontSize:13,color:'var(--warn-t)',display:'flex',justifyContent:'space-between'}}>
      <span style={{cursor:'pointer'}} onClick={()=>setTab('income-detail',{month})}>💡 Proyectado este mes</span><span style={{fontWeight:700}}>{fmtM(revTotal)}</span>
    </div>}

    {/* Analytics shortcuts */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
      <div className="card" style={{marginBottom:0,cursor:'pointer',textAlign:'center',padding:'16px 12px'}} onClick={()=>setTab('comparison')}>
        <div style={{fontSize:26,marginBottom:6}}><svg width="28" height="22" viewBox="0 0 28 22" fill="none"><rect x="1" y="10" width="5" height="12" rx="1.5" fill="var(--primary)" opacity=".9"/><rect x="8" y="4" width="5" height="18" rx="1.5" fill="var(--primary)"/><rect x="15" y="7" width="5" height="15" rx="1.5" fill="var(--gold)" opacity=".9"/><rect x="22" y="1" width="5" height="21" rx="1.5" fill="var(--gold)"/></svg></div>
        <div style={{fontWeight:700,fontSize:13,color:'var(--t)'}}>Comparar meses</div>
        <div style={{fontSize:11,color:'var(--t2)',marginTop:3}}>Ver crecimiento →</div>
      </div>
      <div className="card" style={{marginBottom:0,cursor:'pointer',textAlign:'center',padding:'16px 12px'}} onClick={()=>setTab('top-services')}>
        <div style={{fontSize:26,marginBottom:6}}><svg width="28" height="22" viewBox="0 0 28 22" fill="none"><circle cx="14" cy="11" r="8" stroke="var(--primary)" strokeWidth="2" fill="none"/><path d="M14 7v4l3 2" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"/><circle cx="5" cy="4" r="3" fill="var(--gold)" opacity=".7"/><circle cx="23" cy="4" r="2" fill="var(--gold)" opacity=".5"/></svg></div>
        <div style={{fontWeight:700,fontSize:13,color:'var(--t)'}}>Servicios rentables</div>
        <div style={{fontSize:11,color:'var(--t2)',marginTop:3}}>Ver ranking →</div>
      </div>
      <div className="card" style={{marginBottom:0,cursor:'pointer',textAlign:'center',padding:'16px 12px'}} onClick={()=>setTab('report')}>
        <div style={{fontSize:26,marginBottom:6}}><svg width="26" height="22" viewBox="0 0 26 22" fill="none"><rect x="2" y="2" width="22" height="18" rx="2" stroke="var(--primary)" strokeWidth="2" fill="none"/><path d="M6 8h14M6 12h14M6 16h8" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"/></svg></div>
        <div style={{fontWeight:700,fontSize:13,color:'var(--t)'}}>Reporte y Excel</div>
        <div style={{fontSize:11,color:'var(--t2)',marginTop:3}}>Día, mes o rango · Excel →</div>
      </div>
    </div>

    <div className="card">
      <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>📤 Agregar gasto</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <div><label className="lbl">Descripción</label><input className="inp" placeholder="Ej: Cera" value={desc} onChange={e=>setD(e.target.value)}/></div>
        <div>
          <label className="lbl">Monto (COP)</label>
          <input className="inp" type="number" min="0" placeholder="20000" value={amount} onChange={e=>{
            const v=e.target.value
            setA(v)
            setAErr(Number(v)<0 ? 'El monto del gasto no puede ser negativo' : '')
          }}/>
          {amountErr&&<div style={{color:'var(--red)',fontSize:11,marginTop:4}}>{amountErr}</div>}
        </div>
        <div>
          <label className="lbl">Categoría</label>
          <select className="inp" value={customCat?'__c':cat} onChange={e=>{const v=e.target.value;if(v==='__c'){setCC('new')}else{setC(v);setCC('')}}}>
            {allCats.map(c=><option key={c}>{c}</option>)}
            <option value="__c">+ Nueva categoría</option>
          </select>
        </div>
        {customCat&&<div><label className="lbl">Nueva cat.</label><input className="inp" placeholder="Ej: Equipos" value={customCat==='new'?'':customCat} onChange={e=>{const v=e.target.value;setCC(v?v.charAt(0).toUpperCase()+v.slice(1).toLowerCase():'');}}/></div>}
        <div><label className="lbl">Fecha</label><input type="date" className="inp" value={expDate} onChange={e=>setED(e.target.value)}/></div>
      </div>
      <button className="btn" style={{width:'100%'}} onClick={add} disabled={!desc.trim()||!amount||Number(amount)<0}>Agregar gasto</button>

      {/* Category manager */}
      <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:12}}>
        <button onClick={()=>setSCM(p=>!p)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,color:'var(--t2)',fontWeight:600,padding:0,display:'flex',alignItems:'center',gap:5}}>
          <span style={{transition:'transform .2s',display:'inline-block',transform:showCatMgr?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
          Gestionar categorías
        </button>
        {showCatMgr&&<div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
          {[...new Set([...DEF_CATS,...usedCats])].map(cat=>{
            const inUse=usedCats.includes(cat)
            const isHidden=hiddenCats.includes(cat)
            return (
              <div key={cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',borderRadius:8,background:'var(--bg2)',opacity:isHidden?0.5:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:600}}>{cat}</span>
                  {inUse&&<span style={{fontSize:10,background:'var(--primary-l)',color:'var(--primary)',borderRadius:10,padding:'1px 7px',fontWeight:600}}>{safe.filter(e=>e.category===cat).length} gasto{safe.filter(e=>e.category===cat).length!==1?'s':''}</span>}
                </div>
                {!inUse
                  ? isHidden
                    ? <button onClick={()=>showCategory(cat)} style={{border:'1px solid var(--border)',background:'white',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer',color:'var(--t2)',fontFamily:'inherit'}}>Restaurar</button>
                    : <button onClick={()=>hideCategory(cat)} style={{border:'1px solid var(--red)',background:'var(--red-bg)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer',color:'var(--red)',fontFamily:'inherit'}}>Eliminar</button>
                  : <span style={{fontSize:11,color:'var(--t2)'}}>En uso</span>
                }
              </div>
            )
          })}
        </div>}
      </div>
    </div>

    {me.length>0&&<div className="card">
      <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>📋 Gastos del mes</div>
      {[...me].sort((a,b)=>cleanDate(a.date).localeCompare(cleanDate(b.date))).map(e=>{
        const isEdit=editId===e.id
        return <div key={e.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          {isEdit
            ?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div><label className="lbl">Descripción</label><input className="inp" value={editData.description||''} onChange={x=>setEData(p=>({...p,description:x.target.value}))}/></div>
              <div>
                <label className="lbl">Monto</label>
                <input className="inp" type="number" min="0" value={editData.amount||''} onChange={x=>setEData(p=>({...p,amount:x.target.value}))}/>
                {Number(editData.amount)<0&&<div style={{color:'var(--red)',fontSize:11,marginTop:4}}>El monto del gasto no puede ser negativo</div>}
              </div>
              <div><label className="lbl">Cat.</label><input className="inp" list="cats-f" value={editData.category||''} onChange={x=>setEData(p=>({...p,category:x.target.value}))}/><datalist id="cats-f">{allCats.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div><label className="lbl">Fecha</label><input type="date" className="inp" value={editData.date||''} onChange={x=>setEData(p=>({...p,date:x.target.value}))}/></div>
              <div style={{gridColumn:'span 2',display:'flex',gap:8}}><button className="btn" style={{flex:1}} onClick={saveEdit} disabled={Number(editData.amount)<0}>Guardar</button><button className="btn-del" onClick={()=>setEI(null)}>Cancelar</button></div>
            </div>
            :<div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{e.description}</div><div style={{fontSize:11,color:'var(--t2)'}}>{e.category} · {fmtDate(e.date)}</div></div>
              <span style={{fontWeight:700,color:'var(--red)',fontSize:13,flexShrink:0}}>{fmtM(e.amount)}</span>
              <button className="btn-edit" onClick={()=>{setEI(e.id);setEData({...e})}}>✏️</button>
              <button className="btn-del" onClick={()=>confirm(`¿Eliminar el gasto "${e.description}"?`,()=>SE(safe.filter(x=>x.id!==e.id)))}>✕</button>
            </div>
          }
        </div>
      })}
    </div>}
  </>
}

/* ══════════════════════════════════════════════════════════════
   CLIENT HISTORY
══════════════════════════════════════════════════════════════ */
function ClientHistory({appts,setTab,tabExtra}) {
  const client   = tabExtra?.client
  const safeAppts= Array.isArray(appts)?appts:[]
  if (!client) { return <div className="card" style={{textAlign:'center',padding:30,color:'var(--t2)'}}>Sin datos de cliente<br/><br/><button className="btn-sm" onClick={()=>setTab('clients')}>← Volver</button></div> }

  const phone = (client.phone||'').replace(/\D/g,'')
  const cAppts= [...safeAppts]
    .filter(a=>(a.clientPhone||'').replace(/\D/g,'')===phone)
    .sort((a,b)=>`${cleanDate(b.date)}${cleanTime(b.time)}`.localeCompare(`${cleanDate(a.date)}${cleanTime(a.time)}`))

  const done   = cAppts.filter(a=>bool(a.completed)&&a.completed!=='noshow')
  const noshow = cAppts.filter(a=>a.completed==='noshow')
  const pend   = cAppts.filter(a=>!bool(a.completed)&&a.completed!=='noshow'&&!isPastAppt(a))
  const totalSpent  = done.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const totalPend   = pend.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const lastVisit   = done.length ? done[0].date : null

  // Favourite services
  const svcCount = {}
  cAppts.forEach(a=>{
    String(a.serviceNames||'').split(',').forEach(s=>{
      const name = s.trim(); if (!name) return
      svcCount[name] = (svcCount[name]||0)+1
    })
  })
  const topSvcs = Object.entries(svcCount).sort(([,a],[,b])=>b-a).slice(0,3)

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <button className="btn-sm" onClick={()=>setTab('clients')}>{'←'} Volver</button>
        <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Historial de cliente</span>
      </div>

      {/* Client card */}
      <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-d))',borderRadius:16,padding:'18px 20px',marginBottom:14,color:'white',display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(255,255,255,0.22)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:24,fontWeight:700,flexShrink:0}}>
          {String(client.name||'?').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{fontFamily:'Georgia,serif',fontSize:19,fontWeight:700}}>{client.name}</div>
          <div style={{fontSize:13,opacity:.8,marginTop:2}}>{'\uD83D\uDCF1'} {client.phone}</div>
          {client.createdAt&&<div style={{fontSize:11,opacity:.65,marginTop:3}}>Clienta desde {fmtDate(client.createdAt)}</div>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginBottom:14}}>
        {[
          [cAppts.length,'Citas','var(--primary)','var(--primary-l)'],
          [done.length,'Completadas','var(--green)','#EDF7F0'],
          [noshow.length,'No asistió','var(--red)','#FFF4F0'],
          [pend.length,'Pendientes','var(--gold)','#FFF8E6'],
        ].map(([v,l,col,bg])=>(
          <div key={l} style={{background:bg,borderRadius:12,padding:'10px 6px',textAlign:'center'}}>
            <div style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:700,color:col}}>{v}</div>
            <div style={{fontSize:10,color:col,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Money summary */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{'\uD83D\uDCB3'} Resumen financiero</div>
        {[
          ['Total gastado',fmtM(totalSpent),'var(--green)'],
          ['Pendiente por cobrar',fmtM(totalPend),'var(--gold)'],
          ['Última visita',lastVisit?fmtDate(lastVisit):'—','var(--t2)'],
        ].map(([l,v,col])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:13,color:'var(--t2)'}}>{l}</span>
            <span style={{fontSize:14,fontWeight:700,color:col}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Favourite services */}
      {topSvcs.length>0&&(
        <div className="card" style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{'\u2728'} Servicios frecuentes</div>
          {topSvcs.map(([name,cnt],i)=>(
            <div key={name} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<topSvcs.length-1?'1px solid var(--border)':'none'}}>
              <div style={{width:26,height:26,borderRadius:'50%',background:'var(--primary-l)',color:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,fontSize:13,fontWeight:600}}>{name}</div>
              <span style={{fontSize:12,color:'var(--t2)'}}>{cnt===1?'1 vez':`${cnt} veces`}</span>
            </div>
          ))}
        </div>
      )}

      {/* All appointments */}
      <div className="card">
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Todas las citas ({cAppts.length})</div>
        {cAppts.length===0
          ?<div style={{textAlign:'center',padding:20,color:'var(--t2)',fontSize:14}}>Sin citas registradas</div>
          :cAppts.map(a=>{
            const st = a.completed==='noshow'?'noshow':bool(a.completed)?'done':'pending'
            const stCfg = {done:{bg:'#EDF7F0',col:'var(--green)',lbl:'✓ Completada'},noshow:{bg:'#FFF4F0',col:'var(--red)',lbl:'✗ No asistió'},pending:{bg:'var(--primary-l)',col:'var(--primary)',lbl:'Pendiente'}}[st]
            return (
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{textAlign:'center',flexShrink:0}}>
                  <div style={{fontWeight:700,fontSize:12,color:'var(--primary)'}}>{fmtTime(a.time)}</div>
                  <div style={{fontSize:10,color:'var(--t2)',marginTop:1}}>{fmtDate(a.date)}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.serviceNames}</div>
                  {bool(a.domicilio)&&<div style={{fontSize:11,color:'var(--gold)'}}>🛵 Domicilio</div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:stCfg.col,textDecoration:st==='noshow'?'line-through':''}}>{fmtM(a.totalPrice||a.servicePrice)}</div>
                  <div style={{background:stCfg.bg,color:stCfg.col,borderRadius:20,padding:'1px 8px',fontSize:10,fontWeight:700,marginTop:2}}>{stCfg.lbl}{st==='done'&&payMethodOf(a)?' · '+payMethodOf(a):''}</div>
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MONTH COMPARISON
══════════════════════════════════════════════════════════════ */
function MonthComparison({appts,expenses,setTab}) {
  const safeA = Array.isArray(appts)?appts:[]
  const safeE = Array.isArray(expenses)?expenses:[]

  const allMonths = [...new Set([
    ...safeA.map(a=>cleanDate(a.date).slice(0,7)),
    ...safeE.map(e=>cleanDate(e.date).slice(0,7)),
    monthStr(),
  ].filter(Boolean))].sort((a,b)=>b.localeCompare(a))

  const now  = monthStr()
  const prev = allMonths.find(m=>m<now) || allMonths[1] || now

  const [mA, setMA] = useState(now)
  const [mB, setMB] = useState(prev)

  const monthLabel = m => new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})

  const calcMonth = m => {
    const aptsM = safeA.filter(a=>cleanDate(a.date).slice(0,7)===m)
    const expM  = safeE.filter(e=>cleanDate(e.date).slice(0,7)===m)
    const recv  = aptsM.filter(a=>bool(a.completed)&&a.completed!=='noshow').reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
    const proj  = aptsM.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
    const exp   = expM.reduce((s,e)=>s+toN(e.amount||0),0)
    const neto  = recv - exp
    const citas = aptsM.length
    const noShow= aptsM.filter(a=>a.completed==='noshow').length
    return {recv,proj,exp,neto,citas,noShow}
  }

  const dA = calcMonth(mA)
  const dB = calcMonth(mB)

  const diff = (a,b) => { if (!b) return null; const pct=Math.round((a-b)/b*100); return {pct, up:pct>=0} }
  const Bar = ({valA,valB,colorA,colorB,label,fmt=fmtM}) => {
    const mx = Math.max(valA,valB,1)
    const wA = Math.round(valA/mx*100)
    const wB = Math.round(valB/mx*100)
    const d  = diff(valA,valB)
    return (
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:600,color:'var(--t)'}}>{label}</span>
          {d && <span style={{fontSize:11,fontWeight:700,color:d.up?'var(--green)':'var(--red)',background:d.up?'#EDF7F0':'#FFF0F0',borderRadius:20,padding:'2px 8px'}}>
            {d.up?'▲':'▼'} {Math.abs(d.pct)}%
          </span>}
        </div>
        <div style={{marginBottom:4}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
            <div style={{width:8,height:8,borderRadius:2,background:colorA,flexShrink:0}}/>
            <div style={{flex:1,background:'var(--border)',borderRadius:4,height:10,overflow:'hidden'}}>
              <div style={{width:`${wA}%`,height:'100%',background:colorA,borderRadius:4,transition:'width .5s ease'}}/>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:colorA,minWidth:70,textAlign:'right'}}>{fmt(valA)}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:8,height:8,borderRadius:2,background:colorB,opacity:.7,flexShrink:0}}/>
            <div style={{flex:1,background:'var(--border)',borderRadius:4,height:10,overflow:'hidden'}}>
              <div style={{width:`${wB}%`,height:'100%',background:colorB,borderRadius:4,opacity:.7,transition:'width .5s ease'}}/>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:colorB,opacity:.8,minWidth:70,textAlign:'right'}}>{fmt(valB)}</span>
          </div>
        </div>
      </div>
    )
  }

  const pxFmt = n => n.toString()

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <button className="btn-sm" onClick={()=>setTab('finances')}>{'←'} Volver</button>
        <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Comparar meses</span>
      </div>

      {/* Month selectors */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
        <div>
          <label className="lbl" style={{color:'var(--primary)'}}>Mes A</label>
          <select className="inp" value={mA} onChange={e=>setMA(e.target.value)} style={{borderColor:'var(--primary)'}}>
            {allMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" style={{color:'var(--gold)'}}>Mes B</label>
          <select className="inp" value={mB} onChange={e=>setMB(e.target.value)} style={{borderColor:'var(--gold)'}}>
            {allMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:16,marginBottom:16,padding:'8px 14px',background:'var(--bg)',borderRadius:10,fontSize:12}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:10,height:10,borderRadius:2,background:'var(--primary)'}}/><span style={{fontWeight:600,color:'var(--primary)'}}>{monthLabel(mA)}</span></div>
        <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:10,height:10,borderRadius:2,background:'var(--gold)',opacity:.8}}/><span style={{fontWeight:600,color:'var(--gold)'}}>{monthLabel(mB)}</span></div>
      </div>

      <div className="card">
        <Bar label="Ingresos recibidos" valA={dA.recv}  valB={dB.recv}  colorA="var(--primary)" colorB="var(--gold)"/>
        <Bar label="Gastos"             valA={dA.exp}   valB={dB.exp}   colorA="var(--red)"    colorB="#C49A1A"/>
        <Bar label="Balance neto"       valA={Math.max(dA.neto,0)} valB={Math.max(dB.neto,0)} colorA="var(--green)" colorB="#3A8A50"/>
        <Bar label="Citas totales" valA={dA.citas} valB={dB.citas} colorA="var(--primary)" colorB="var(--gold)" fmt={pxFmt}/>
        <Bar label="No asistió"    valA={dA.noShow} valB={dB.noShow} colorA="var(--red)" colorB="#C49A1A" fmt={pxFmt}/>
      </div>

      {/* Net summary cards — explicit, no .map() to avoid key collision */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          {key:'cardA',m:mA,d:dA,col:'var(--primary)'},
          {key:'cardB',m:mB,d:dB,col:'var(--gold)'},
        ].map(({key,m,d,col})=>(
          <div key={key} style={{background:'var(--surface)',borderRadius:14,border:`2px solid ${col}`,padding:'14px 12px'}}>
            <div style={{fontSize:10,color:col,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{monthLabel(m)}</div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid var(--border)'}}><span style={{color:'var(--t2)'}}>Recibido</span><span style={{fontWeight:700,color:'var(--green)'}}>{fmtM(d.recv)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid var(--border)'}}><span style={{color:'var(--t2)'}}>Gastos</span><span style={{fontWeight:700,color:'var(--red)'}}>{fmtM(d.exp)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'4px 0',borderBottom:'1px solid var(--border)'}}><span style={{color:'var(--t2)'}}>Citas</span><span style={{fontWeight:700,color:'var(--t)'}}>{d.citas}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'6px 0',marginTop:2}}>
              <span style={{fontWeight:700}}>Neto</span>
              <span style={{fontWeight:700,color:d.neto>=0?'var(--green)':'var(--red)'}}>{fmtM(d.neto)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TOP SERVICES
══════════════════════════════════════════════════════════════ */
function TopServices({appts,services,priceHistory,setTab}) {
  const safeA = Array.isArray(appts)?appts:[]
  const safeSvcs = Array.isArray(services)?services:[]
  const safeHist = Array.isArray(priceHistory)?priceHistory:[]
  const [period, setPeriod] = useState('all') // 'all' | '3m' | '6m' | 'year'

  const now = new Date()
  const cutoff = {
    all:  null,
    '3m': monthStr(new Date(now.getFullYear(), now.getMonth()-2, 1)),
    '6m': monthStr(new Date(now.getFullYear(), now.getMonth()-5, 1)),
    year: `${now.getFullYear()}-01`,
  }[period]

  const completedAppts = safeA.filter(a =>
    bool(a.completed) && a.completed!=='noshow' &&
    (!cutoff || cleanDate(a.date).slice(0,7) >= cutoff)
  )

  // Build service stats — usa el precio REAL de cada servicio en la cita
  // (guardado en appt.servicePrices), no el total repartido entre N.
  // Fallbacks: historial de precios a la fecha de la cita, precio actual
  // del catálogo, y como último recurso el total de la cita.
  const parsePrices = raw => {
    let o = {}
    try {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        o = Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,toN(v)]))
      } else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        o = Object.fromEntries(Object.entries(JSON.parse(raw)).map(([k,v])=>[k,toN(v)]))
      }
    } catch(_e) { o = {} }
    return o
  }
  const priceAt = (svcId, before) => {
    if (!before) return null
    const recs = safeHist
      .filter(h => String(h.serviceId) === String(svcId) && String(h.changedAt) <= String(before))
      .sort((a,b) => String(b.changedAt).localeCompare(String(a.changedAt)))
    return recs.length ? toN(recs[0].price) : null
  }
  const stats = {}
  completedAppts.forEach(a => {
    const names   = String(a.serviceNames||'').split(',').map(s=>s.trim()).filter(Boolean)
    const ids     = String(a.serviceIds||'').split(',').map(s=>s.trim()).filter(Boolean)
    const prices  = parsePrices(a.servicePrices)
    const created = a.createdAt || a.date || ''
    const apptTotal = toN(a.servicePrice)
    names.forEach((name,i) => {
      const id = ids[i] || ''
      let price = prices[id]
      if (price === undefined || !isFinite(price)) price = priceAt(id, created)
      if (price === null || price === undefined) {
        const svc = safeSvcs.find(s => s.id === id)
        if (svc) price = toN(svc.price)
      }
      if (price === null || price === undefined || !isFinite(price)) {
        // Último recurso: repartir el total de la cita entre los servicios
        // (comportamiento anterior). Mejor aproximación que nada.
        price = names.length ? apptTotal / names.length : apptTotal
      }
      if (!stats[name]) stats[name] = {name, revenue:0, count:0, id}
      stats[name].revenue += price
      stats[name].count   += 1
    })
  })

  const byRevenue = Object.values(stats).sort((a,b)=>b.revenue-a.revenue)
  const byCount   = Object.values(stats).sort((a,b)=>b.count-a.count)
  const totalRev  = byRevenue.reduce((s,x)=>s+x.revenue,0)
  const maxRev    = byRevenue[0]?.revenue || 1
  const maxCount  = byCount[0]?.count || 1

  const MEDALS     = ['🥇','🥈','🥉']
  const COLORS_REV = ['var(--primary)','var(--gold)','var(--green)','#7A9FC4','#A47AC4','#C47AA4']
  const COLORS_CNT = ['#E07A5F','#F2CC8F','#81B29A','#7A9FC4','#A47AC4','#C47AA4']

  const RankList = ({items, maxBar, colors, barKey}) => (
    items.length===0
      ?<div className="card" style={{textAlign:'center',padding:30,color:'var(--t2)'}}>Sin datos de citas completadas para este período</div>
      :<div className="card">
        {items.map((svc,i)=>{
          const barPct = Math.round((barKey==='revenue'?svc.revenue:svc.count)/maxBar*100)
          const color  = colors[i%colors.length]
          return (
            <div key={svc.name} style={{padding:'14px 0',borderBottom:i<items.length-1?'1px solid var(--border)':'none'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
                <div style={{fontSize:20,flexShrink:0,lineHeight:1}}>{i<3?MEDALS[i]:<span style={{fontSize:14,fontWeight:700,color:'var(--t2)',minWidth:20,display:'inline-block',textAlign:'center'}}>{i+1}</span>}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:14}}>{svc.name}</span>
                  </div>
                  <div style={{background:'var(--border)',borderRadius:4,height:8,overflow:'hidden',marginBottom:6}}>
                    <div style={{width:`${barPct}%`,height:'100%',background:color,borderRadius:4,transition:'width .6s ease'}}/>
                  </div>
                  <div style={{display:'flex',gap:14,fontSize:11,color:'var(--t2)'}}>
                    <span style={{fontWeight:600}}>{svc.count===1?'1 vez':`${svc.count} veces`}</span>
                    <span>Total: <strong style={{color:'var(--primary)'}}>{fmtM(Math.round(svc.revenue))}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
  )

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <button className="btn-sm" onClick={()=>setTab('finances')}>{'←'} Volver</button>
        <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Servicios rentables</span>
      </div>

      {/* Period filter */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[['all','Todo'],['3m','3 meses'],['6m','6 meses'],['year','Este año']].map(([v,l])=>(
          <button key={v} onClick={()=>setPeriod(v)}
            style={{background:period===v?'var(--primary)':'white',color:period===v?'white':'var(--t2)',border:'1.5px solid',borderColor:period===v?'var(--primary)':'var(--border)',borderRadius:20,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>
            {l}
          </button>
        ))}
      </div>

      {/* Total summary */}
      <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-d))',borderRadius:14,padding:'14px 18px',marginBottom:18,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:10,opacity:.8,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600,marginBottom:4}}>Total generado</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:24,fontWeight:700}}>{fmtM(totalRev)}</div>
          <div style={{fontSize:11,opacity:.7,marginTop:2}}>{completedAppts.length} citas completadas · {byRevenue.length} servicios</div>
        </div>
        <div style={{fontSize:32}}>✨</div>
      </div>

      {/* Ranking por ingresos */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>💰</span>
        <span style={{fontWeight:700,fontSize:15}}>Por ingresos</span>
        <span style={{fontSize:11,color:'var(--t2)',marginLeft:2}}>— los que más dinero dejan</span>
      </div>
      <RankList items={byRevenue} maxBar={maxRev}   colors={COLORS_REV} barKey="revenue"/>

      {/* Ranking por frecuencia */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,marginTop:22}}>
        <span style={{fontSize:18}}>🔥</span>
        <span style={{fontWeight:700,fontSize:15}}>Por demanda</span>
        <span style={{fontSize:11,color:'var(--t2)',marginLeft:2}}>— los que más te piden</span>
      </div>
      <RankList items={byCount} maxBar={maxCount} colors={COLORS_CNT} barKey="count"/>

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   REPORT TAB — reporte de actividad por día o rango de fechas,
   con exportación a Excel (.xlsx) y envío por WhatsApp al admin.
══════════════════════════════════════════════════════════════ */
const ADMIN_WA = '3223992340'

function ReportTab({appts,expenses,services,setTab}) {
  const safeA = Array.isArray(appts)?appts:[]
  const safeE = Array.isArray(expenses)?expenses:[]

  // Modo de filtro: 'day' (un día puntual), 'month' (mes en curso) o 'range'
  const [mode, setMode] = useState('day')
  const today = todayStr()
  const [day,   setDay]   = useState(today)
  const [month, setMonth] = useState(monthStr())
  const [from,  setFrom]  = useState(today)
  const [to,    setTo]    = useState(today)
  // Rango siempre válido: Hasta nunca puede ser menor que Desde, y ninguna
  // fecha puede ser futura. Se valida aquí (no solo con min/max) porque en
  // iOS/Safari el selector de fecha no siempre respeta min/max.
  const onFrom = v => {
    if (!v) return
    const f = v > today ? today : v
    setFrom(f)
    if (to < f) setTo(f)   // si Desde pasa a Hasta, Hasta se ajusta
  }
  const onTo = v => {
    if (!v) return
    let t = v > today ? today : v
    if (t < from) t = from // Hasta no puede ser anterior a Desde
    setTo(t)
  }
  const [mvFilter, setMvFilter] = useState('all') // 'all'|'in'|'out'

  // Predicado de pertenencia al período (réplica del backend _inPeriod)
  const inPeriod = d => {
    const x = cleanDate(d)
    if (!x) return false
    if (mode === 'day')   return x === day
    if (mode === 'month') return x.slice(0,7) === month
    return x >= from && x <= to
  }
  // Rango from..to para filtrar gastos (range Inclusivo, en otros modos del día/mes)
  const fromVal = () => mode==='day' ? day : mode==='month' ? month + '-01' : from
  const toVal   = () => {
    if (mode === 'day')   return day
    if (mode === 'month') {
      const [y, m] = month.split('-').map(Number)
      const d = new Date(y, m, 0)  // día 0 del mes siguiente = último día
      return `${y}-${String(m).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    return to
  }
  const inRange = (d, a, b) => { const x = cleanDate(d); return x && x >= a && x <= b }
  const monthLabel = ym => {
    const NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const [y, m] = String(ym).split('-')
    return NAMES[Number(m) - 1] + ' ' + y
  }
  const periodLabel = () =>
    mode==='day'   ? fmtDate(day)
  : mode==='month' ? monthLabel(month)
  : (from===to ? fmtDate(from) : `${fmtDate(from)} — ${fmtDate(to)}`)

  // Citas agendadas PARA el período (por fecha de la cita)
  const apptsInPeriod = safeA.filter(a => inPeriod(a.date))

  // Citas CREADAS en el período (por createdAt) — la cita puede tener
  // fecha para otro día (ej: hoy agendo una para mañana).
  const createdInPeriod = safeA.filter(a => {
    const c = cleanDate(String(a.createdAt||'').slice(0,10)) || cleanDate(a.date)
    return inPeriod(c)
  })
  const created = createdInPeriod.length

  // Métricas clave
  const scheduled = apptsInPeriod.length
  const completed  = apptsInPeriod.filter(a => bool(a.completed) && a.completed!=='noshow').length
  const pending    = apptsInPeriod.filter(a => !bool(a.completed) && a.completed!=='noshow').length
  const noshow     = apptsInPeriod.filter(a => a.completed==='noshow').length
  const cancelledRate  = scheduled>0 ? Math.round(noshow/scheduled*100) : 0
  const completionRate = scheduled>0 ? Math.round(completed/scheduled*100) : 0

  // LIBRO ÚNICO del período: ingresos (citas completadas) y gastos.
  // Pantalla, WhatsApp y Excel salen de aquí, así el neto siempre cuadra.
  const ledger = periodLedger(safeA, safeE, fromVal(), toVal())
  const revenue = ledger.totalIncome

  // Ingresos potenciales (incluye pendientes)
  const projected = apptsInPeriod
    .reduce((s,a) => a.completed==='noshow' ? s : s + toN(a.totalPrice||a.servicePrice||0), 0)

  // Gastos del período + neto (del libro único)
  const expensesInPeriod = ledger.outs
  const totalExpenses = ledger.totalExpenses
  const neto = ledger.neto

  const avgTicket = completed>0 ? Math.round(revenue/completed) : 0

  // Domicilios (cantidad de citas + ingresos por domicilio, estos últimos
  // ya van incluidos en `revenue` como parte de totalPrice)
  const domicilios = apptsInPeriod.filter(a => bool(a.domicilio)).length
  const domRevenue = ledger.totalDelivery

  // Top servicios del período (por demanda en completadas)
  const svcStats = {}
  apptsInPeriod.filter(a => bool(a.completed) && a.completed!=='noshow').forEach(a => {
    const names = String(a.serviceNames||'').split(',').map(s=>s.trim()).filter(Boolean)
    names.forEach(n => {
      if (!svcStats[n]) svcStats[n] = {name:n, count:0, revenue:0}
      svcStats[n].count += 1
      svcStats[n].revenue += names.length ? toN(a.servicePrice)/names.length : toN(a.servicePrice)
    })
  })
  const topByDemand = Object.values(svcStats).sort((a,b)=>b.count-a.count).slice(0,3)

  // ─── Exportar a Excel (.xlsx) ──────────────────────────────────
  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const peso = '"$"#,##0'

    // ── Hoja Movimientos: una fila por cita completada y por gasto ──
    // Columnas: A Fecha, B Hora, C Tipo, D Cliente/Categoría, E Detalle,
    //           F Servicios, G Domicilio, H Ingreso (=F+G), I Gasto, J Método de pago
    const movs = [['Fecha','Hora','Tipo','Cliente / Categoría','Detalle (servicios / gasto)','Servicios','Domicilio','Ingreso (total cita)','Gasto','Método de pago']]
    ledger.rows.forEach((r, i) => {
      const n = i + 2
      movs.push(r.kind==='in'
        ? [r.date, r.time, 'Ingreso', r.who, r.detail,
           {t:'n', v:r.service, z:peso}, {t:'n', v:r.delivery, z:peso},
           {t:'n', f:`F${n}+G${n}`, v:r.amount, z:peso}, '', r.payMethod || 'Sin registrar']
        : [r.date, r.time, 'Gasto', r.who, r.detail, '', '', '', {t:'n', v:r.amount, z:peso}, ''])
    })
    const first = 2, last = ledger.rows.length + 1
    const tRow = last + 2
    const sumCell = (col, v) => ({t:'n', f:`SUM(${col}${first}:${col}${last})`, v, z:peso})
    movs.push([])
    movs.push(['','','','','TOTAL',
      sumCell('F', ledger.totalService), sumCell('G', ledger.totalDelivery),
      sumCell('H', ledger.totalIncome),  sumCell('I', ledger.totalExpenses)])
    movs.push(['','','','','NETO (Ingreso − Gasto)','','',
      {t:'n', f:`H${tRow}-I${tRow}`, v:ledger.neto, z:peso}])
    const wsM = XLSX.utils.aoa_to_sheet(movs)
    wsM['!cols'] = [{wch:11},{wch:7},{wch:9},{wch:22},{wch:40},{wch:13},{wch:13},{wch:18},{wch:13},{wch:16}]

    // ── Hoja Resumen: todo apunta a los totales de Movimientos ──
    const link = (col, v) => ({t:'n', f:`Movimientos!${col}${tRow}`, v, z:peso})
    const resumen = [
      ['REPORTE DE ACTIVIDAD'],
      ['Período', periodLabel()],
      ['Generado', new Date().toLocaleString('es-CO')],
      [''],
      ['Métrica', 'Valor'],
      ['Citas creadas (registradas en el período)', created],
      ['Citas agendadas para el período', scheduled],
      ['Citas completadas', completed],
      ['Citas pendientes', pending],
      ['No asistió', noshow],
      ['Tasa de completado (%)', completionRate],
      [''],
      ['Ingresos por servicios', link('F', ledger.totalService)],
      ['Ingresos por domicilios', link('G', ledger.totalDelivery)],
      ['TOTAL INGRESOS', null],
      ['Gastos del período', link('I', totalExpenses)],
      ['NETO (ingresos − gastos)', null],
      [''],
      ['Domicilios (cantidad de citas)', domicilios],
      ['Ingresos proyectados (con pendientes, incl. domicilios)', {t:'n', v:projected, z:peso}],
      [''],
      ['Cobrado en efectivo', {t:'n', f:`SUMIF(Movimientos!J${first}:J${last},"Efectivo",Movimientos!H${first}:H${last})`, v:ledger.totalCash, z:peso}],
      ['Cobrado por transferencia', {t:'n', f:`SUMIF(Movimientos!J${first}:J${last},"Transferencia",Movimientos!H${first}:H${last})`, v:ledger.totalTransfer, z:peso}],
      ['Cobrado sin método registrado', {t:'n', f:`SUMIF(Movimientos!J${first}:J${last},"Sin registrar",Movimientos!H${first}:H${last})`, v:ledger.totalNoMethod, z:peso}],
    ]
    const iTot = resumen.findIndex(r => r[0]==='TOTAL INGRESOS')
    resumen[iTot][1] = {t:'n', f:`B${iTot-1}+B${iTot}`, v:revenue, z:peso}
    const iNeto = resumen.findIndex(r => r[0]==='NETO (ingresos − gastos)')
    resumen[iNeto][1] = {t:'n', f:`B${iTot+1}-B${iNeto}`, v:neto, z:peso}
    const wsR = XLSX.utils.aoa_to_sheet(resumen)
    wsR['!cols'] = [{wch:52},{wch:18}]

    // ── Hoja Citas: todas (también pendientes y no-show) para consulta ──
    const detailSet = new Map()
    apptsInPeriod.forEach(a => detailSet.set(a.id, a))
    createdInPeriod.forEach(a => { if (!detailSet.has(a.id)) detailSet.set(a.id, a) })
    const citasRows = [['Fecha','Hora','Cliente','Teléfono','Servicios','Valor servicios','Valor domicilio','Total','Domicilio','Dirección','Estado','Método de pago','Creada el']]
    Array.from(detailSet.values()).slice().sort((a,b)=>cleanDate(a.date).localeCompare(cleanDate(b.date))).forEach(a => {
      const status = a.completed==='noshow' ? 'No asistió'
                   : bool(a.completed)      ? 'Completada'
                   :                          'Pendiente'
      const tot = toN(a.totalPrice||a.servicePrice||0)
      const dv  = bool(a.domicilio) ? Math.min(toN(a.domicilioPrice||0), tot) : 0
      citasRows.push([
        cleanDate(a.date), cleanTime(a.time), a.clientName||'', a.clientPhone||'',
        a.serviceNames||'', tot-dv, dv, tot,
        bool(a.domicilio) ? 'Sí' : 'No', a.address||'', status,
        bool(a.completed) && a.completed!=='noshow' ? (payMethodOf(a) || 'Sin registrar') : '',
        (a.createdAt||'').slice(0,19).replace('T',' ')
      ])
    })
    const wsC = XLSX.utils.aoa_to_sheet(citasRows)
    wsC['!cols'] = [{wch:10},{wch:6},{wch:20},{wch:14},{wch:30},{wch:14},{wch:14},{wch:12},{wch:10},{wch:30},{wch:12},{wch:16},{wch:20}]

    XLSX.utils.book_append_sheet(wb, wsR, 'Resumen')
    XLSX.utils.book_append_sheet(wb, wsM, 'Movimientos')
    XLSX.utils.book_append_sheet(wb, wsC, 'Citas')
    const name = `reporte_${mode==='day'?day:mode==='month'?month:`${from}_${to}`}.xlsx`
    XLSX.writeFile(wb, name)
  }

  // ─── Enviar por WhatsApp al admin ─────────────────────────────
  const sendWA = () => {
    const p = ('57' + ADMIN_WA.replace(/\D/g, '')).replace(/^5757/, '57')
    const SPARK = '\u2728'        // ✨
    const MONEY = '\uD83D\uDCB0'  // 💰
    const CAL   = '\uD83D\uDCC5'  // 📅
    const CHART = '\uD83D\uDCCA'  // 📊
    const MOTO  = '\uD83D\uDEF5'  // 🛵
    const lines = [
      `${SPARK} *Reporte de actividad*`,
      `${CAL} ${periodLabel()}`,
      '',
      `${CHART} *Citas*`,
      `• Creadas (registradas): *${created}*`,
      `• Agendadas para el período: *${scheduled}*`,
      `• Completadas: *${completed}*${pending?` · Pendientes: ${pending}`:''}`,
      `• Tasa completado: *${completionRate}%*`,
      '',
      `${MONEY} *Ingresos*`,
      `• Servicios: *${fmtM(ledger.totalService)}*`,
      `• Domicilios: *${fmtM(ledger.totalDelivery)}*`,
      `• Total recibido: *${fmtM(revenue)}*`,
      `   - Efectivo: *${fmtM(ledger.totalCash)}*`,
      `   - Transferencia: *${fmtM(ledger.totalTransfer)}*`,
      ...(ledger.totalNoMethod>0 ? [`   - Sin método registrado: *${fmtM(ledger.totalNoMethod)}*`] : []),
      `• Proyectado: *${fmtM(projected)}*`,
      `• Gastos: *${fmtM(totalExpenses)}*`,
      `• Neto: *${fmtM(neto)}*`,
    ]
    if (domicilios>0) lines.push('', `${MOTO} *Domicilios*: ${domicilios} citas · ${fmtM(domRevenue)}`)
    if (topByDemand.length>0) {
      lines.push('', `${SPARK} *Top servicios*`)
      topByDemand.slice(0,3).forEach((s,i) => lines.push(`${['1.','2.','3.'][i]} ${s.name} — ${s.count}x (${fmtM(Math.round(s.revenue))})`))
    }
    lines.push('', `_Generado ${new Date().toLocaleString('es-CO')}_`)
    const msg = lines.join('\n')
    openWhatsApp(p, msg)
  }

  const Metric = ({label, value, color, big, sub}) => (
    <div style={{background:'var(--bg2)',borderRadius:12,padding:'12px 10px',textAlign:'center'}}>
      <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t2)',fontWeight:600,marginBottom:4}}>{label}</div>
      <div style={{fontSize:big?22:18,fontWeight:700,color:color||'var(--t)'}}>{value}</div>
      {sub && <div style={{fontSize:9,color:'var(--t2)',marginTop:2}}>{sub}</div>}
    </div>
  )

  // Estilos reutilizables para los chips de modo
  const chipStyle = active => ({
    flex:1,
    background: active ? 'var(--primary)' : 'white',
    color: active ? 'white' : 'var(--t2)',
    border: '1.5px solid',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    borderRadius:20, padding:'8px 14px',
    fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
  })

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <button className="btn-sm" onClick={()=>setTab('finances')}>← Volver</button>
        <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>📊 Reporte</span>
      </div>

      {/* Modo de filtrado — 3 chips: día / mes / rango */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button onClick={()=>setMode('day')}   style={chipStyle(mode==='day')}>📅 Por día</button>
        <button onClick={()=>setMode('month')} style={chipStyle(mode==='month')}>🗓️ Por mes</button>
        <button onClick={()=>setMode('range')} style={chipStyle(mode==='range')}>📆 Por rango</button>
      </div>

      {/* Selector de fecha(s) según el modo */}
      {mode==='day'
        ? <div style={{marginBottom:14}}><label className="lbl">Día</label><input type="date" className="inp" value={day} max={today} onChange={e=>setDay(e.target.value)}/></div>
        : mode==='month'
        ? <div style={{marginBottom:14}}><label className="lbl">Mes</label><input type="month" className="inp" value={month} max={monthStr()} onChange={e=>setMonth(e.target.value)}/></div>
        : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            <div><label className="lbl">Desde</label><input type="date" className="inp" value={from} max={to < today ? to : today} onChange={e=>onFrom(e.target.value)}/></div>
            <div><label className="lbl">Hasta</label><input type="date" className="inp" value={to} min={from} max={today} onChange={e=>onTo(e.target.value)}/></div>
          </div>
      }

      {/* Período activo */}
      <div style={{background:'var(--primary-l)',borderRadius:12,padding:'10px 14px',marginBottom:14,fontSize:13,color:'var(--primary)',fontWeight:600}}>
        🗓️ {periodLabel()}
      </div>

      {/* Métricas de citas */}
      <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>📈 Citas</div>
      <div style={{fontSize:11,color:'var(--t2)',marginBottom:10}}>
        <strong style={{color:'var(--t)'}}>Creadas</strong> = registradas en el período (aunque la cita sea para otro día) · <strong style={{color:'var(--t)'}}>Agendadas</strong> = citas para el período (aunque se hayan creado antes)
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginBottom:18}}>
        <Metric label="Creadas"     value={created}   big />
        <Metric label="Agendadas"   value={scheduled} />
        <Metric label="Completadas" value={completed} color="var(--green)" big />
        <Metric label="Pendientes"  value={pending}   color="var(--gold)" />
        <Metric label="% completado" value={`${completionRate}%`} />
      </div>

      {/* Métricas de dinero */}
      <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>💰 Dinero</div>
      <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-d))',borderRadius:14,padding:'14px 18px',marginBottom:8,color:'white'}}>
        <div style={{fontSize:11,opacity:.8,textTransform:'uppercase',letterSpacing:'.05em',fontWeight:600,marginBottom:4}}>Total ingresos (servicios + domicilios)</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:28,fontWeight:700}}>{fmtM(revenue)}</div>
        <div style={{fontSize:12,opacity:.9,marginTop:6}}>Servicios {fmtM(ledger.totalService)} + 🛵 Domicilios {fmtM(ledger.totalDelivery)}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginBottom:18}}>
        <Metric label="Proyectado" value={fmtM(projected)} color="var(--gold)" />
        <Metric label="Domicilios" value={`${domicilios} · ${fmtM(domRevenue)}`} sub="separados de servicios" />
        <Metric label="Gastos"      value={fmtM(totalExpenses)} color="var(--red)" />
        <Metric label="Neto"        value={fmtM(neto)} color={neto>=0?'var(--green)':'var(--red)'} />
      </div>

      {/* Top servicios del período */}
      {topByDemand.length>0 && (
        <div className="card" style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>✨ Top servicios del período</div>
          {topByDemand.map((s,i) => (
            <div key={s.name} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<topByDemand.length-1?'1px solid var(--border)':'none'}}>
              <span style={{fontWeight:600,fontSize:13}}>{['🥇','🥈','🥉','4.','5.'][i]} {s.name}</span>
              <span style={{color:'var(--t2)',fontSize:13}}>{s.count}x · <strong style={{color:'var(--primary)'}}>{fmtM(Math.round(s.revenue))}</strong></span>
            </div>
          ))}
        </div>
      )}

      {/* Movimientos del período: lo mismo que irá en la hoja 'Movimientos' del Excel */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🧾 Movimientos del período</div>
          <div style={{display:'flex',gap:6}}>
            {[['all','Todo'],['in','Ingresos'],['out','Gastos']].map(([v,l])=>(
              <button key={v} onClick={()=>setMvFilter(v)} style={{...chipStyle(mvFilter===v),flex:'none',padding:'4px 10px',fontSize:11}}>{l}</button>
            ))}
          </div>
        </div>
        {ledger.rows.filter(r=>mvFilter==='all'||r.kind===mvFilter).length===0
          ? <div style={{textAlign:'center',color:'var(--t2)',fontSize:13,padding:'14px 0'}}>Sin movimientos en este período</div>
          : ledger.rows.filter(r=>mvFilter==='all'||r.kind===mvFilter).map(r=>(
            <div key={r.kind+r.id} className="row" style={{fontSize:13}}>
              <div style={{flexShrink:0,width:46,fontSize:11,color:'var(--t2)',fontWeight:600}}>{r.date.slice(8)}/{r.date.slice(5,7)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.kind==='in'?r.who:r.detail}</div>
                <div style={{fontSize:11,color:'var(--t2)'}}>{r.kind==='in'?r.detail:r.who}{r.delivery>0?` · 🛵 ${fmtM(r.delivery)} dom. + ${fmtM(r.service)} serv.`:''}</div>
              </div>
              <div style={{flexShrink:0,fontWeight:700,color:r.kind==='in'?'var(--green)':'var(--red)'}}>{r.kind==='in'?'+':'−'}{fmtM(r.amount)}</div>
            </div>
          ))}
        <div style={{display:'flex',justifyContent:'space-between',marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',fontWeight:700,fontSize:13}}>
          <span>Neto del período</span>
          <span style={{color:neto>=0?'var(--green)':'var(--red)'}}>{fmtM(neto)}</span>
        </div>
      </div>

      {/* Botones de acción */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
        <button className="btn-o" onClick={exportExcel} disabled={created===0&&ledger.rows.length===0} style={{padding:'14px 12px'}}>
          📊 Exportar Excel
        </button>
        <button className="btn-wa" onClick={sendWA} disabled={created===0} style={{padding:'14px 12px'}}>
          💬 WhatsApp admin
        </button>
      </div>
      {created===0&&ledger.rows.length===0 && <div style={{textAlign:'center',fontSize:12,color:'var(--t2)',marginBottom:14}}>No hay movimientos en este período para exportar.</div>}

      {/* Pista de destinatario */}
      <div style={{textAlign:'center',fontSize:11,color:'var(--t2)',marginBottom:6}}>
        El reporte por WhatsApp se envía al admin: 📱 {ADMIN_WA}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   INCOME DETAIL — with pending filter via tabExtra
══════════════════════════════════════════════════════════════ */
function IncomeDetail({appts,setTab,tabExtra}) {
  const initFilter = tabExtra?.filter || 'all'
  const [month,setM] = useState(tabExtra?.month || monthStr())
  const [filter,setF]= useState(initFilter) // 'all'|'completed'|'pending'
  const safe   = Array.isArray(appts)?appts:[]
  const months = [...new Set([...safe.map(a=>cleanDate(a.date).slice(0,7)),monthStr()].filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const ma     = [...safe].filter(a=>cleanDate(a.date).slice(0,7)===month).sort((a,b)=>cleanDate(a.date).localeCompare(cleanDate(b.date)))
  const done   = ma.filter(a=>bool(a.completed)&&a.completed!=='noshow')
  const noshow = ma.filter(a=>a.completed==='noshow')
  const pend   = ma.filter(a=>!bool(a.completed)&&a.completed!=='noshow')
  const revDone= done.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revPend= pend.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
  const revTotal=ma.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)

  const display= filter==='completed'?done : filter==='pending'?pend : filter==='noshow'?noshow : ma

  const byDay={}
  display.forEach(a=>{const d=cleanDate(a.date);if(!byDay[d])byDay[d]=[];byDay[d].push(a)})

  return <>
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
      <button className="btn-sm" onClick={()=>setTab(tabExtra?.origin||'finances')}>← Volver</button>
      <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>💚 Detalle Ingresos</span>
    </div>
    <select className="inp" value={month} onChange={e=>setM(e.target.value)} style={{marginBottom:12}}>
      {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>)}
    </select>

    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:7,marginBottom:14}}>
      {[['all','Todo',fmtM(revTotal),ma.length,'var(--primary)','var(--primary-l)'],
        ['completed','Recibido',fmtM(revDone),done.length,'var(--green)','#EDF7F0'],
        ['pending','Pendiente',fmtM(revPend),pend.length,'var(--gold)','#FFF8E6'],
        ['noshow','No asistió',fmtM(noshow.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)),noshow.length,'var(--red)','#FFF4F0']
      ].map(([v,l,val,cnt,col,bg])=>(
        <div key={v} onClick={()=>setF(v)} style={{background:filter===v?col:bg,borderRadius:12,padding:'12px 8px',textAlign:'center',cursor:'pointer',border:`2px solid ${filter===v?col:'transparent'}`,transition:'all .15s'}}>
          <div style={{fontSize:11,color:filter===v?'white':col,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>{l}</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'clamp(12px,3.6vw,14px)',fontWeight:700,color:filter===v?'white':col}}>{val}</div>
          <div style={{fontSize:10,color:filter===v?'rgba(255,255,255,0.8)':col,marginTop:2}}>{cnt} citas</div>
        </div>
      ))}
    </div>

    {filter==='pending' && pend.length>0 && (
      <div style={{background:'var(--gold-bg)',borderRadius:12,padding:'10px 14px',marginBottom:12,fontSize:13,color:'var(--warn-t)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span>💡 Marca estas citas como <strong>Completadas</strong> para contarlas como recibidas</span>
        <button className="btn-sm" style={{marginLeft:8,whiteSpace:'nowrap'}} onClick={()=>setTab('appointments')}>Ir a citas</button>
      </div>
    )}

    {Object.keys(byDay).length===0
      ?<div className="card" style={{textAlign:'center',padding:30,color:'var(--t2)'}}>{filter==='pending'?'No hay citas pendientes 🎉':'Sin citas este mes'}</div>
      :Object.entries(byDay).sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>{
        const dayTot=items.reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
        const dayDone=items.filter(a=>bool(a.completed)).reduce((s,a)=>s+toN(a.totalPrice||a.servicePrice||0),0)
        return <div className="card" key={day} style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <span style={{fontWeight:700,fontSize:14}}>{fmtDate(day)}</span>
            <div style={{textAlign:'right'}}>
              {filter!=='pending'&&<div style={{fontWeight:700,color:'var(--green)',fontSize:13}}>{fmtM(dayDone)} recibido</div>}
              {dayTot>dayDone&&filter!=='completed'&&<div style={{fontSize:11,color:'var(--gold)'}}>({fmtM(dayTot-dayDone)} pendiente)</div>}
            </div>
          </div>
          {items.map(a=><div key={a.id} className="row" style={{fontSize:13}}>
            <div style={{background:'var(--primary-l)',borderRadius:8,padding:'5px 8px',fontWeight:700,color:'var(--primary)',fontSize:12,flexShrink:0}}>{fmtTime(a.time)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.clientName}</div>
              <div style={{fontSize:11,color:'var(--t2)'}}>{a.serviceNames}{bool(a.domicilio)?' 🛵':''}</div>
            </div>
            <div style={{flexShrink:0,textAlign:'right'}}>
              <div style={{fontWeight:700,color:bool(a.completed)?'var(--green)':'var(--gold)',fontSize:13}}>{fmtM(a.totalPrice||a.servicePrice)}</div>
              <div style={{fontSize:10,color:bool(a.completed)?'var(--green)':'var(--gold)'}}>{bool(a.completed)?('✓ Recibido'+(payMethodOf(a)?' · '+payMethodOf(a):'')):'Pendiente'}</div>
            </div>
          </div>)}
        </div>
      })
    }
  </>
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS TAB — Zona de peligro / Reset total
══════════════════════════════════════════════════════════════ */
function SettingsTab({clients, appts, expenses, resetAll, themePalette, setThemePalette}) {
  const [step, setStep] = useState(0)
  const [confirmWord, setConfirmWord] = useState('')

  const totalClients  = Array.isArray(clients) ? clients.length : 0
  const totalAppts    = Array.isArray(appts)   ? appts.length   : 0
  const totalExpenses = Array.isArray(expenses)? expenses.length: 0

  const handleReset = async () => { setStep(3); setConfirmWord(''); await resetAll() }

  if (step===1) return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
        <button className="btn-sm" onClick={()=>setStep(0)}>← Volver</button>
        <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Restablecer datos</span>
      </div>
      <div className="card-neo" style={{background:'var(--red-bg)',border:'2px solid #F5B0B0',borderRadius:20,padding:28,textAlign:'center'}}>
        <div style={{fontSize:52,marginBottom:16}}>⚠️</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:700,color:'var(--red)',marginBottom:12}}>
          ¿Estás segura?
        </div>
        <div style={{fontSize:14,color:'var(--t)',lineHeight:1.7,marginBottom:20}}>
          Esto eliminará <strong>permanentemente</strong>:<br/>
          <span style={{color:'var(--red)',fontWeight:700}}>
            {totalClients} cliente{totalClients!==1?'s':''} · {totalAppts} cita{totalAppts!==1?'s':''} · {totalExpenses} gasto{totalExpenses!==1?'s':''}
          </span><br/>
          <span style={{fontSize:12,color:'var(--t2)',marginTop:4,display:'block'}}>Esta acción no se puede deshacer.</span>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn-o" style={{flex:1}} onClick={()=>setStep(0)}>Cancelar</button>
          <button onClick={()=>setStep(2)}
            style={{flex:1,background:'linear-gradient(135deg, #B03030 0%, #D04040 100%)',color:'white',border:'none',borderRadius:10,padding:'12px 22px',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit',boxShadow:'var(--shadow-sm)'}}>
            Sí, continuar →
          </button>
        </div>
      </div>
    </div>
  )

  if (step===2) {
    const ok = confirmWord.trim() === 'CONFIRMAR'
    return (
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
          <button className="btn-sm" onClick={()=>{setStep(0);setConfirmWord('')}}>← Cancelar</button>
          <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>Confirmación final</span>
        </div>
        <div className="card-neo" style={{background:'var(--red-bg)',border:'2px solid var(--red)',borderRadius:20,padding:28,textAlign:'center'}}>
          <div style={{fontSize:52,marginBottom:12}}>🚨</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:19,fontWeight:700,color:'var(--red)',marginBottom:10}}>
            Última oportunidad
          </div>
          <div style={{fontSize:14,color:'var(--t)',lineHeight:1.7,marginBottom:8}}>
            Si confirmas, <strong>todos los datos se borrarán</strong> del servidor.<br/>
            No hay forma de recuperarlos.
          </div>
          <div className="card-glass" style={{padding:'12px 16px',marginBottom:20,fontSize:13,color:'var(--t2)'}}>
            🗑️ Se eliminarán <strong style={{color:'var(--red)'}}>{totalClients} clientes, {totalAppts} citas y {totalExpenses} gastos</strong>
          </div>
          <div style={{marginBottom:20,textAlign:'left'}}>
            <label style={{display:'block',fontSize:12,fontWeight:700,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>
              Escribe <span style={{color:'var(--red)',fontFamily:'monospace',fontSize:14}}>CONFIRMAR</span> para continuar
            </label>
            <input
              className="inp"
              value={confirmWord}
              onChange={e=>setConfirmWord(e.target.value)}
              placeholder="CONFIRMAR"
              autoComplete="off"
              style={{textAlign:'center',fontWeight:700,fontSize:16,letterSpacing:'.05em',
                borderColor: confirmWord.length>0 ? (ok?'var(--green)':'var(--red)') : 'var(--border)',
                color: ok ? 'var(--green)' : 'var(--t)'
              }}
            />
            {confirmWord.length>0 && !ok && (
              <div style={{fontSize:11,color:'var(--red)',marginTop:5,textAlign:'center'}}>
                Debe escribir exactamente: CONFIRMAR
              </div>
            )}
            {ok && (
              <div style={{fontSize:11,color:'var(--green)',marginTop:5,textAlign:'center',fontWeight:700}}>
                ✓ Confirmación válida
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn-o" style={{flex:1}} onClick={()=>{setStep(0);setConfirmWord('')}}>No, cancelar</button>
            <button onClick={()=>{if(ok)handleReset()}} disabled={!ok}
              style={{flex:1,background:ok?'linear-gradient(135deg, #B03030 0%, #D04040 100%)':'var(--border)',color:ok?'white':'var(--t2)',border:'none',borderRadius:10,padding:'12px 10px',fontWeight:700,fontSize:14,cursor:ok?'pointer':'not-allowed',fontFamily:'inherit',transition:'all .2s',boxShadow:ok?'var(--shadow-sm)':'none'}}>
              🗑️ Eliminar todo
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step===3) return (
    <div style={{textAlign:'center',padding:'60px 20px'}}>
      <div style={{fontSize:52,marginBottom:16}}>✅</div>
      <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:700,marginBottom:10}}>Datos eliminados</div>
      <div style={{fontSize:14,color:'var(--t2)',marginBottom:24}}>El programa ha sido restablecido.<br/>Puedes empezar desde cero.</div>
      <button className="btn" onClick={()=>setStep(0)} style={{width:'100%',maxWidth:280}}>Entendido</button>
    </div>
  )
  return (
    <div>
      <div style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:600,color:'var(--t)',marginBottom:20}}>⚙️ Ajustes</div>

      {/* ── Paleta ── */}
      <div className="card-glass" style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>🎨 Color principal</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10}}>
          {PALETTES.map(pal=>{
            const sel = themePalette===pal.id
            return (
              <button key={pal.id} onClick={()=>setThemePalette(pal.id)}
                style={{background:sel?pal.gradient:'var(--neo-light)',border:`2px solid ${sel?pal.primary:'var(--border)'}`,borderRadius:16,padding:'16px 8px',cursor:'pointer',fontFamily:'inherit',transition:'all .2s',display:'flex',flexDirection:'column',alignItems:'center',gap:6,boxShadow:sel?'var(--shadow-md)':'var(--shadow-sm)',color:sel?'white':'var(--t)'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:pal.gradient,boxShadow:sel?`0 0 0 3px var(--surface), 0 0 0 5px ${pal.primary}`:'0 4px 12px rgba(0,0,0,0.15)',transition:'all .2s'}}/>
                <span style={{fontSize:12,fontWeight:700,color:sel?'white':'var(--t)'}}>{pal.emoji} {pal.name}</span>
                {sel && <span style={{fontSize:9,color:sel?'rgba(255,255,255,0.85)':'var(--t2)',letterSpacing:'.05em'}}>ACTIVO</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Datos ── */}
      <div className="card-glass" style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>📊 Datos actuales</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10}}>
          {[
            ['👥','Clientes',totalClients,'var(--primary)','var(--primary-l)'],
            ['📅','Citas',totalAppts,'var(--green)','var(--green-bg)'],
            ['💸','Gastos',totalExpenses,'var(--red)','var(--red-bg)'],
          ].map(([ic,lb,val,col,bg])=>(
            <div key={lb} className="card-neo" style={{background:bg,borderRadius:14,padding:'16px 8px',textAlign:'center',boxShadow:'var(--shadow-sm)'}}>
              <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:24,fontWeight:700,color:col}}>{val}</div>
              <div style={{fontSize:11,color:col,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginTop:2}}>{lb}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Zona de peligro ── */}
      <div className="card-neo" style={{border:'2px solid var(--red)',borderRadius:18,overflow:'hidden'}}>
        <div style={{background:'var(--red-bg)',padding:'16px 20px',borderBottom:'1px solid var(--red)'}}>
          <div style={{fontWeight:700,fontSize:14,color:'var(--red)'}}>🚨 Zona de peligro</div>
          <div style={{fontSize:12,color:'var(--t2)',marginTop:3}}>Acciones irreversibles — procede con cuidado</div>
        </div>
        <div style={{background:'var(--card)',padding:'20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:'var(--t)',marginBottom:3}}>Restablecer todo el programa</div>
              <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.5}}>Elimina todos los clientes, citas y gastos. Los servicios vuelven al inicio.</div>
            </div>
            <button onClick={()=>setStep(1)}
              style={{background:'var(--red-bg)',color:'var(--red)',border:'2px solid var(--red)',borderRadius:12,padding:'12px 18px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0,boxShadow:'var(--shadow-sm), transition:all .15s'}}>
              🗑️ Resetear
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
/* ══════════════════════════════════════════════════════════════
   EXPENSE DETAIL
══════════════════════════════════════════════════════════════ */
function ExpenseDetail({expenses,SE,setTab,tabExtra,confirm}) {
  const [month,setM]=useState(tabExtra?.month || monthStr())
  const [editId,setEI]=useState(null), [editData,setED]=useState({})
  const safe=Array.isArray(expenses)?expenses:[]
  const months=[...new Set([...safe.map(e=>cleanDate(e.date).slice(0,7)),monthStr()].filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const me=[...safe].filter(e=>cleanDate(e.date).slice(0,7)===month).sort((a,b)=>cleanDate(a.date).localeCompare(cleanDate(b.date)))
  const tot=me.reduce((s,e)=>s+toN(e.amount||0),0)
  const allCats=[...new Set([...DEF_CATS,...safe.map(e=>e.category).filter(Boolean)])]
  const byCat={}
  me.forEach(e=>{if(!byCat[e.category])byCat[e.category]=0;byCat[e.category]+=toN(e.amount)})
  const byDay={}
  me.forEach(e=>{const d=cleanDate(e.date);if(!byDay[d])byDay[d]=[];byDay[d].push(e)})
  const saveEdit=()=>{SE(safe.map(e=>e.id===editId?{...e,...editData}:e));setEI(null)}

  return <>
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
      <button className="btn-sm" onClick={()=>setTab(tabExtra?.origin||'finances')}>← Volver</button>
      <span style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:600}}>📤 Detalle Gastos</span>
    </div>
    <select className="inp" value={month} onChange={e=>setM(e.target.value)} style={{marginBottom:14}}>
      {months.map(m=><option key={m} value={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>)}
    </select>
    <div style={{background:'linear-gradient(135deg,var(--primary),var(--primary-d))',borderRadius:14,padding:'16px 18px',marginBottom:14,color:'white',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontSize:11,opacity:.8,textTransform:'uppercase',letterSpacing:'.07em',fontWeight:600}}>Total del mes</div><div style={{fontFamily:'Georgia,serif',fontSize:26,fontWeight:700,marginTop:3}}>{fmtM(tot)}</div></div>
      <div style={{fontSize:32}}>📊</div>
    </div>

    {Object.keys(byCat).length>0&&<div className="card">
      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Por categoría</div>
      {Object.entries(byCat).sort(([,a],[,b])=>b-a).map(([cat,val],i)=>{
        const color=CAT_COLORS[i%CAT_COLORS.length]
        return <div key={cat} style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:13}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:10,height:10,borderRadius:2,background:color,flexShrink:0}}/>
              <span style={{fontWeight:600}}>{cat}</span>
            </div>
            <span style={{fontWeight:700,color}}>{fmtM(val)}</span>
          </div>
          <div style={{height:7,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
            <div style={{width:`${Math.round((val/tot)*100)}%`,height:'100%',background:color,borderRadius:4,transition:'width .4s ease'}}/>
          </div>
        </div>
      })}
    </div>}

    {Object.keys(byDay).length===0
      ?<div className="card" style={{textAlign:'center',padding:30,color:'var(--t2)'}}>Sin gastos este mes</div>
      :Object.entries(byDay).sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>{
        const dayTot=items.reduce((s,e)=>s+toN(e.amount||0),0)
        return <div className="card" key={day} style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <span style={{fontWeight:700,fontSize:14}}>{fmtDate(day)}</span>
            <span style={{fontWeight:700,color:'var(--red)',fontSize:13}}>{fmtM(dayTot)}</span>
          </div>
          {items.map(e=>{
            const isEdit=editId===e.id
            return <div key={e.id} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              {isEdit
                ?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div><label className="lbl">Descripción</label><input className="inp" value={editData.description||''} onChange={x=>setED(p=>({...p,description:x.target.value}))}/></div>
                  <div><label className="lbl">Monto</label><input className="inp" type="number" value={editData.amount||''} onChange={x=>setED(p=>({...p,amount:x.target.value}))}/></div>
                  <div><label className="lbl">Cat.</label><input className="inp" list="cats2-d" value={editData.category||''} onChange={x=>setED(p=>({...p,category:x.target.value}))}/><datalist id="cats2-d">{allCats.map(c=><option key={c} value={c}/>)}</datalist></div>
                  <div><label className="lbl">Fecha</label><input type="date" className="inp" value={editData.date||''} onChange={x=>setED(p=>({...p,date:x.target.value}))}/></div>
                  <div style={{gridColumn:'span 2',display:'flex',gap:8}}><button className="btn" style={{flex:1}} onClick={saveEdit}>Guardar</button><button className="btn-del" onClick={()=>setEI(null)}>Cancelar</button></div>
                </div>
                :<div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{e.description}</div><div style={{fontSize:11,color:'var(--t2)'}}>{e.category}</div></div>
                  <span style={{fontWeight:700,color:'var(--red)',fontSize:13,flexShrink:0}}>{fmtM(e.amount)}</span>
                  <button className="btn-edit" onClick={()=>{setEI(e.id);setED({...e})}}>✏️</button>
                  <button className="btn-del" onClick={()=>confirm(`¿Eliminar el gasto "${e.description}"?`,()=>SE(safe.filter(x=>x.id!==e.id)))}>✕</button>
                </div>
              }
            </div>
          })}
        </div>
      })
    }
  </>
}

/* ══════════════════════════════════════════════════════════════
   CALENDAR VIEW
══════════════════════════════════════════════════════════════ */
function CalendarView({ clients, appts, setTab, confirm, deleteAppt }) {
  const today = new Date()
  const [curYear,  setCurYear]  = useState(today.getFullYear())
  const [curMonth, setCurMonth] = useState(today.getMonth()) // 0-indexed
  const [selDay,   setSelDay]   = useState(null)             // 'YYYY-MM-DD' or null
  const [view,     setView]     = useState('month')          // 'month' | 'week'

  const safeA = Array.isArray(appts) ? appts : []

  /* ── Navigation ── */
  const goBack = () => {
    if (view === 'week') {
      // go back 7 days from selDay or today
      const base = selDay ? new Date(selDay + 'T12:00:00') : new Date()
      base.setDate(base.getDate() - 7)
      const s = localDateStr(base)
      setSelDay(s); setCurYear(base.getFullYear()); setCurMonth(base.getMonth())
      return
    }
    const d = new Date(curYear, curMonth - 1, 1)
    setCurYear(d.getFullYear()); setCurMonth(d.getMonth())
    setSelDay(null)
  }
  const goFwd = () => {
    if (view === 'week') {
      const base = selDay ? new Date(selDay + 'T12:00:00') : new Date()
      base.setDate(base.getDate() + 7)
      const s = localDateStr(base)
      setSelDay(s); setCurYear(base.getFullYear()); setCurMonth(base.getMonth())
      return
    }
    const d = new Date(curYear, curMonth + 1, 1)
    setCurYear(d.getFullYear()); setCurMonth(d.getMonth())
    setSelDay(null)
  }
  const goToday = () => {
    const now = new Date()
    setCurYear(now.getFullYear()); setCurMonth(now.getMonth())
    setSelDay(todayStr())
  }

  /* ── Build calendar grid (6 weeks × 7 days) ── */
  const firstOfMonth = new Date(curYear, curMonth, 1)
  const startDow     = firstOfMonth.getDay() // 0=Sun
  const daysInMonth  = new Date(curYear, curMonth + 1, 0).getDate()
  // Start grid on Sunday before the 1st
  const gridStart    = new Date(firstOfMonth)
  gridStart.setDate(1 - startDow)

  const weeks = []
  for (let w = 0; w < 6; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(gridStart)
      cell.setDate(gridStart.getDate() + w * 7 + d)
      days.push(localDateStr(cell))
    }
    weeks.push(days)
  }

  /* ── Build week grid ── */
  const weekBase = selDay ? new Date(selDay + 'T12:00:00') : new Date()
  const weekDow  = weekBase.getDay()
  const weekStart = new Date(weekBase)
  weekStart.setDate(weekBase.getDate() - weekDow)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return localDateStr(d)
  })

  /* ── Appointments indexed by date ── */
  const apptsByDate = {}
  safeA.forEach(a => {
    const d = cleanDate(a.date); if (!d) return
    if (!apptsByDate[d]) apptsByDate[d] = []
    apptsByDate[d].push(a)
  })
  const sortAppts = arr =>
    [...arr].sort((a, b) => cleanTime(a.time).localeCompare(cleanTime(b.time)))

  /* ── Selected day appointments ── */
  const selAppts = selDay ? sortAppts(apptsByDate[selDay] || []) : []

  /* ── Month label ── */
  const monthLabel = new Date(curYear, curMonth, 1)
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  const todStr = todayStr()

  /* ── Status dot colors ── */
  const dotColor = a => {
    if (bool(a.completed)) return 'var(--green)'
    if (a.completed === 'noshow') return 'var(--red)'
    if (isPastAppt(a)) return 'var(--t2)'
    return 'var(--primary)'
  }

  /* ── Dot chips for a day ── */
  const DayDots = ({ dateStr }) => {
    const arr = apptsByDate[dateStr]
    if (!arr?.length) return null
    const max = 4
    return (
      <div style={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 }}>
        {arr.slice(0, max).map((a, i) => (
          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor(a), flexShrink: 0 }} />
        ))}
        {arr.length > max && (
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t2)', flexShrink: 0 }} />
        )}
      </div>
    )
  }

  /* ── Appointment pill (week view) ── */
  const ApptPill = ({ a }) => {
    const done   = bool(a.completed)
    const noshow = a.completed === 'noshow'
    const past   = isPastAppt(a)
    const bg     = done ? 'var(--green-bg)' : noshow ? 'var(--red-bg)' : past ? 'var(--bg)' : 'var(--primary-l)'
    const col    = done ? 'var(--green)' : noshow ? 'var(--red)' : past ? 'var(--t2)' : 'var(--primary)'
    return (
      <div style={{
        background: bg, border: `1.5px solid ${col}`, borderRadius: 8,
        padding: '5px 8px', marginBottom: 4, cursor: 'pointer',
        transition: 'transform .12s', opacity: noshow ? 0.7 : 1,
      }}
        onClick={() => setSelDay(cleanDate(a.date))}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 11, color: col }}>{fmtTime(a.time)}</span>
          {done && <span style={{ fontSize: 9, fontWeight: 700, color: col }}>✓</span>}
          {noshow && <span style={{ fontSize: 9, fontWeight: 700, color: col }}>✗</span>}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.clientName}</div>
        <div style={{ fontSize: 10, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.serviceNames}</div>
      </div>
    )
  }

  /* ── Appointment detail card ── */
  const ApptCard = ({ a }) => {
    const done   = bool(a.completed)
    const noshow = a.completed === 'noshow'
    const past   = isPastAppt(a)
    const status = done ? { label: 'Completada', color: 'var(--green)', bg: 'var(--green-bg)' }
      : noshow ? { label: 'No asistió', color: 'var(--red)', bg: 'var(--red-bg)' }
      : past    ? { label: 'Pasada', color: 'var(--t2)', bg: 'var(--border)' }
      :           { label: 'Pendiente', color: 'var(--gold)', bg: 'var(--gold-bg)' }
    return (
      <div style={{
        background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14,
        padding: '14px', marginBottom: 10, transition: 'box-shadow .15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Time badge */}
          <div style={{
            background: 'var(--primary-l)', borderRadius: 10, padding: '8px 10px',
            textAlign: 'center', minWidth: 58, flexShrink: 0,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{fmtTime(a.time)}</div>
            {bool(a.domicilio) && <div style={{ fontSize: 9, color: 'var(--primary)', marginTop: 2, fontWeight: 600 }}>🛵 Dom</div>}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>{a.clientName}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 6, padding: '2px 7px' }}>{status.label}{done && payMethodOf(a) ? ' · ' + payMethodOf(a) : ''}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.serviceNames}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginTop: 5 }}>{fmtM(a.totalPrice || a.servicePrice)}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {!done && !noshow && (
            <button className="btn-sm" style={{ flex: 1 }}
              onClick={() => setTab('appointments')}>
              ✏️ Editar
            </button>
          )}
          {!done && !noshow && (
            <button className="btn-sm" style={{ flex: 1 }}
              onClick={() => {
                const phone = clients.find(c => c.id === a.clientId)?.phone || ''
                if (phone) openWA(phone, a.clientName, a.time, a.date, a.serviceNames, a.totalPrice || a.servicePrice, bool(a.domicilio))
              }}>
              💬 WhatsApp
            </button>
          )}
          <button className="btn-del"
            onClick={() => confirm(`¿Eliminar la cita de ${a.clientName}?`, () => deleteAppt(a))}>
            ✕
          </button>
        </div>
      </div>
    )
  }

  /* ── Summary stats strip ── */
  const stripMonth = safeA.filter(a => cleanDate(a.date).slice(0, 7) === `${curYear}-${String(curMonth + 1).padStart(2, '0')}`)
  const stripDone  = stripMonth.filter(a => bool(a.completed)).length
  const stripPend  = stripMonth.filter(a => !bool(a.completed) && a.completed !== 'noshow' && !isPastAppt(a)).length
  const stripNS    = stripMonth.filter(a => a.completed === 'noshow').length
  const stripRev   = stripMonth.filter(a => bool(a.completed)).reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0)

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */
  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 21, fontWeight: 600, color: 'var(--t)' }}>
          📅 Calendario
        </div>
        <button className="btn" style={{ fontSize: 12, padding: '7px 14px' }}
          onClick={() => setTab('appointments', { newAppt: true, origin: 'calendar' })}>
          + Nueva cita
        </button>
      </div>

      {/* ── View toggle + month nav ── */}
      <div className="card" style={{ marginBottom: 12, padding: '12px 14px' }}>
        {/* Toggle month/week */}
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', marginBottom: 14 }}>
          {[['month', '📆 Mes'], ['week', '🗓 Semana']].map(([v, l]) => (
            <button key={v}
              onClick={() => { setView(v); if (v === 'week' && !selDay) setSelDay(todStr) }}
              style={{
                flex: 1, border: 'none', padding: '8px 0', fontSize: 12, fontWeight: view === v ? 700 : 500,
                background: view === v ? 'var(--primary)' : 'transparent',
                color: view === v ? 'white' : 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              }}>
              {l}
            </button>
          ))}
        </div>

        {/* Nav row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={goBack} style={{ background: 'var(--primary-l)', border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 17, fontWeight: 700, color: 'var(--t)', textTransform: 'capitalize' }}>
              {view === 'week'
                ? (() => {
                    const ws = new Date(weekDays[0] + 'T12:00:00')
                    const we = new Date(weekDays[6] + 'T12:00:00')
                    return `${ws.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  })()
                : monthLabel
              }
            </div>
            <button onClick={goToday} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--primary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, marginTop: 1, padding: '2px 6px', borderRadius: 6 }}>
              Hoy
            </button>
          </div>

          <button onClick={goFwd} style={{ background: 'var(--primary-l)', border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Citas', val: stripMonth.length, color: 'var(--primary)', bg: 'var(--primary-l)' },
            { label: 'Listas ✓', val: stripDone,  color: 'var(--green)',   bg: 'var(--green-bg)' },
            { label: 'Pendientes', val: stripPend, color: 'var(--gold)',    bg: 'var(--gold-bg)' },
            { label: 'No asistió', val: stripNS,   color: 'var(--red)',     bg: 'var(--red-bg)' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: s.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════
          MONTH VIEW
      ═══════════════════════ */}
      {view === 'month' && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 8px' }}>
          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', marginBottom: 4 }}>
            {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 4 }}>{d}</div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: '3px 3px', marginBottom: 3 }}>
              {week.map(dateStr => {
                const isThisMonth = parseInt(dateStr.slice(5, 7), 10) - 1 === curMonth
                const isToday     = dateStr === todStr
                const isSel       = dateStr === selDay
                const hasAppts    = !!apptsByDate[dateStr]?.length
                const count       = apptsByDate[dateStr]?.length || 0
                return (
                  <div key={dateStr}
                    onClick={() => setSelDay(isSel ? null : dateStr)}
                    style={{
                      borderRadius: 10, padding: '5px 2px 4px', textAlign: 'center', cursor: 'pointer',
                      minHeight: 46,
                      background: isSel ? 'var(--primary)' : isToday ? 'var(--primary-l)' : 'transparent',
                      border: isToday && !isSel ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                      opacity: isThisMonth ? 1 : 0.35,
                      transition: 'background .12s, transform .1s',
                      transform: isSel ? 'scale(0.97)' : 'scale(1)',
                    }}>
                    <div style={{
                      fontSize: 12, fontWeight: isToday || isSel ? 700 : 500,
                      color: isSel ? 'white' : isToday ? 'var(--primary)' : 'var(--t)',
                      lineHeight: 1,
                    }}>
                      {parseInt(dateStr.slice(8), 10)}
                    </div>
                    {hasAppts && (
                      <div style={{ marginTop: 3 }}>
                        {count <= 3
                          ? <DayDots dateStr={dateStr} />
                          : (
                            <div style={{
                              fontSize: 9, fontWeight: 700,
                              color: isSel ? 'white' : 'var(--primary)',
                              background: isSel ? 'rgba(255,255,255,0.2)' : 'var(--primary-l)',
                              borderRadius: 8, padding: '1px 4px', display: 'inline-block', marginTop: 1,
                            }}>{count}</div>
                          )
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {[
              ['var(--green)', 'Completada'],
              ['var(--primary)', 'Pendiente'],
              ['var(--t2)', 'Pasada'],
              ['var(--red)', 'No asistió'],
            ].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t2)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════
          WEEK VIEW
      ═══════════════════════ */}
      {view === 'week' && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 8px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4, minWidth: 320 }}>
            {weekDays.map(dateStr => {
              const isToday  = dateStr === todStr
              const isSel    = dateStr === selDay
              const dayAppts = sortAppts(apptsByDate[dateStr] || [])
              const d        = new Date(dateStr + 'T12:00:00')
              return (
                <div key={dateStr} style={{ minWidth: 0 }}>
                  {/* Day header */}
                  <div
                    onClick={() => setSelDay(isSel ? null : dateStr)}
                    style={{
                      textAlign: 'center', borderRadius: 10, padding: '6px 4px', marginBottom: 6, cursor: 'pointer',
                      background: isSel ? 'var(--primary)' : isToday ? 'var(--primary-l)' : 'var(--bg)',
                      border: isToday && !isSel ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                      transition: 'background .12s',
                    }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: isSel ? 'rgba(255,255,255,0.8)' : 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isSel ? 'white' : isToday ? 'var(--primary)' : 'var(--t)', marginTop: 1 }}>
                      {d.getDate()}
                    </div>
                    {dayAppts.length > 0 && (
                      <div style={{ fontSize: 9, color: isSel ? 'rgba(255,255,255,0.9)' : 'var(--primary)', fontWeight: 700, marginTop: 2 }}>
                        {dayAppts.length} cita{dayAppts.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Pills */}
                  {dayAppts.map(a => <ApptPill key={a.id} a={a} />)}

                  {/* Empty day hint */}
                  {dayAppts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '6px 2px', fontSize: 10, color: 'var(--border)' }}>—</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════
          SELECTED DAY PANEL
      ═══════════════════════ */}
      {selDay && (
        <div style={{ animation: 'slideDown .18s ease forwards' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: 16, fontWeight: 700, color: 'var(--t)', textTransform: 'capitalize' }}>
                {new Date(selDay + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
                {selAppts.length === 0 ? 'Sin citas' : `${selAppts.length} cita${selAppts.length !== 1 ? 's' : ''}`}
                {selAppts.length > 0 && ` · ${fmtM(selAppts.reduce((s, a) => s + toN(a.totalPrice || a.servicePrice || 0), 0))} total`}
              </div>
            </div>
            <button
              onClick={() => setTab('appointments', { newAppt: true, date: selDay, origin: 'calendar' })}
              className="btn" style={{ fontSize: 11, padding: '6px 12px' }}>
              + Cita
            </button>
          </div>

          {selAppts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--t2)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sin citas este día</div>
              <div style={{ fontSize: 12 }}>Toca "+ Cita" para agendar una</div>
            </div>
          ) : (
            selAppts.map(a => <ApptCard key={a.id} a={a} />)
          )}
        </div>
      )}

      {/* ── Revenue strip if there's data this month ── */}
      {view === 'month' && stripRev > 0 && !selDay && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Recibido este mes</div>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>{fmtM(stripRev)}</div>
          </div>
          <button className="btn-sm" onClick={() => setTab('income-detail', { month: `${curYear}-${String(curMonth + 1).padStart(2, '0')}`, origin: 'calendar' })}>
            Ver detalle →
          </button>
        </div>
      )}
    </>
  )
}
