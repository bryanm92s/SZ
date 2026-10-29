# AGENTS.md — SZ (OcupadAPP)

> Compact instructions for OpenCode agents working in this repo. Only includes non-obvious, repo-specific facts.

---

## 📦 Project Overview

**SZ** is a mobile-first React 18 + Vite SPA for managing eyelash/eyebrow studios in Colombia. Backend = Google Apps Script (Code.gs) + Google Sheets (6 sheets) + Google Calendar + GmailApp. Deployed on Vercel.

- **Frontend**: `src/` (single-file `App.jsx` ~5.5k lines, logic in `helpers.js` ~900 lines)
- **Backend**: `apps-script/` — **NOT committed to GitHub** (contains tokens). Must be copied locally before tests run.
- **Docs**: `docs/` (MANUAL_TECNICO.md for setup, ONBOARDING_CLIENTE.md for new clients)

---

## 🔧 Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # Production build → dist/
npm run preview      # Serve dist/ locally
npm run lint         # ESLint on src/**/*.js, *.jsx
npm run format       # Prettier on src/**/*.{js,jsx,json}
npm run test         # Vitest (377 tests, ~15s)
npm run test:watch   # Vitest watch mode
```

**Order for verification**: `lint → build → test` (no typecheck — project is JS, not TS)

---

## 🧪 Testing — Critical Details

| Suite | Tests | Notes |
|-------|-------|-------|
| `helpers.test.js` | 171 | Pure logic: dates, slots, phone, durations, finance, reports |
| `backend.test.js` | 166 | **Runs actual `Code.gs` in Node vm sandbox** — requires `apps-script/` folder present |
| `catalogs.test.js` | 14 | Initial catalog presets (VITE_CATALOG) |
| `api.test.js` | 12 | Transport: 25s timeout, auto-retry on load, error messages |
| `excel.test.js` | 14 | Excel export, 12 palettes, AA contrast regression |

**Key quirk**: `backend.test.js` reads `apps-script/Code.gs` at runtime. In a fresh clone, you **must copy the `apps-script/` folder from the template** before `npm test` works. It is in `.gitignore`.

**Test config**: `vitest.config.ts` uses `jsdom`, `globals: true`, no `setupFiles` (a missing `src/test/setup.ts` used to break tests).

---

## 🔐 Environment Variables (all `VITE_*` = public in bundle)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SCRIPT_URL` | ✅ | Apps Script Web App URL (`.../exec`) |
| `VITE_TOKEN` | ✅ | Must match **Script Property** `SB_SYNC_TOKEN` in Apps Script |
| `VITE_BIZ_NAME` | ⚠️ | **Required for new client** (default "SZ" is original deployment) |
| `VITE_BIZ_SUBTITLE` | | Optional subtitle |
| `VITE_BIZ_EMOJI` | | Default `🌸` — used for favicon, splash, header, footer, WhatsApp suffix |
| `VITE_BIZ_LOGO` | | Absolute URL for apple-touch-icon |
| `VITE_CATALOG` | | Preset: `cejas` (default) \| `unas` \| `peluqueria` \| `barberia` \| `depilacion` \| `masajes` \| `estetica` \| `maquillaje` |
| `VITE_DEFAULT_SERVICES` | | JSON array — **overrides** `VITE_CATALOG` if valid |
| `VITE_ADMIN_WHATSAPP` | | Admin WhatsApp for report button (button disabled if missing) |

**Never put emojis/% in `index.html` attributes** — Vite's `decodeURI()` breaks on invalid `%`. Title/favicon set dynamically in `App.jsx`.

---

## 🟢 Backend (Apps Script) — Must-Knows

- **File**: `apps-script/Code.gs` (~2.3k lines) + `appsscript.json` (manifest with `webapp` + `ANYONE_ANONYMOUS`)
- **Script Properties** (set in Apps Script UI, NOT in code):
  - `SB_SYNC_TOKEN` — sync token (matches `VITE_TOKEN`)
  - `SB_AUTHORIZED_EMAIL` — **required** for reset codes, auto-reports, weekly backup
  - `SB_REPORT_EMAIL` — optional; auto-reports go here, fallback to `SB_AUTHORIZED_EMAIL`
  - `SB_BACKUP_EMAIL` — optional; weekly Drive backup goes here, fallback to `SB_AUTHORIZED_EMAIL`
  - `SB_CALENDAR_ID` — optional; secondary calendar ID for events (shareable read-only)
  - `SB_BIZ_NAME` — optional; business name in emailed reset codes (default "SZ")

- **Deploy**: Always **Manage deployments → New version** (never new deployment from scratch — changes the URL)
- **Triggers** (6 total): 4 report triggers (daily/weekly/monthly/yearly), 1 daily backup (23:00), 1 weekly email backup (Sat 9:00)
- **Sheets**: 6 tabs — `Clientes`, `Servicios`, `Citas`, `Gastos`, `HistorialPrecios`, `Config` (+ `Recordatorios` created at runtime)
- **LockService** used for write concurrency; amounts sanitized ≥ 0
- **Timezone**: `America/Bogota` (UTC-5) — backend and frontend aligned

---

## 🏗️ Architecture Notes

- **Data flow**: `App.jsx` → `loadData()` (fetches all 4 entities) → `saveData(entity)` sends **full array** of modified entity to backend
- **Offline**: `localStorage` fallback; loads retry once at 4s, saves retry 2× (4s, 12s). Transient failures rarely surface to UI.
- **Polling**: 30s auto-sync, pauses when tab hidden
- **Styles**: CSS-in-JS (inline + single injected `<style>`), no UI library
- **No TypeScript** — plain JS + JSDoc not used
- **Payment methods**: `['Efectivo', 'Nequi', 'Daviplata', 'Bancolombia']` — must match frontend `helpers.js` exactly (parity test fails if drift)

---

## 📁 Key Files to Know

| File | Purpose |
|------|---------|
| `src/App.jsx` | Entire UI (~5.5k lines), all components + state |
| `src/helpers.js` | Pure logic (~900 lines) — dates, slots, phone, finance, reports, Excel |
| `src/api.js` | Transport layer: `loadData`, `saveData`, 25s timeout, retry, error messages |
| `src/catalogs.js` | 8 service catalog presets keyed by `VITE_CATALOG` |
| `apps-script/Code.gs` | Backend API, Sheets/Calendar/Gmail, LockService, triggers |
| `docs/MANUAL_TECNICO.md` | Full install/config from scratch |
| `docs/ONBOARDING_CLIENTE.md` | How to deploy for a new client (what to change, what NOT to touch) |

---

## ⚠️ Gotchas & Constraints

1. **`apps-script/` not in git** — copy from template before testing
2. **No real multi-user concurrency** — slot validation is client-side; LockService only prevents sheet corruption
3. **Sheets + Calendar not transactional** — Calendar delete can fail after Sheets delete; app shows event ID for manual cleanup
4. **`writeSheet` rewrites entire sheet** — manual edits outside expected columns are lost
5. **Reset destroys everything** (incl. Calendar events) — backup Excel offered first
6. **Email recipients ONLY in Script Properties** — none hardcoded
7. **Vite config is minimal** — just React plugin; no aliases, no path resolution tricks
8. **ESLint ignores**: `dist`, `node_modules`, `*.config.js`, `apps-script/**`
9. **Prettier**: semi=false, singleQuote=true, trailingComma=es5, printWidth=120, tabWidth=2

---

## 📚 Reference Docs (in `docs/`)

- `MANUAL_TECNICO.md` — install from zero, all env vars, Apps Script, Vercel, security
- `ONBOARDING_CLIENTE.md` — duplicate deployment for new business (catalog, branding, what's immutable)
- `MANUAL_USUARIO.md` — end-user manual (Spanish)
- `ARQUITECTURA_Y_FUNCIONALIDADES.md` — technical-functional spec
- `PRUEBAS_Y_MANTENIMIENTO.md` — testing gaps, manual verification, diagnostics, backup/restore
- `INDEX.md` — doc index + pending observations