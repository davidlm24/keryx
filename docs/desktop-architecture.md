# KERYX as an offline-first desktop app

Status: decisions settled 2026-10-06. Phases 0–3 (shell, local data, outputs,
media and Bible) are done; the rest is not implemented.

## Why

KERYX is a live-service tool: when the lyrics freeze in front of the
congregation, nothing else about the app matters. Today every slide change
goes through a cloud database, every Bible verse is fetched from the internet,
and the projector window is a browser popup. A desktop app fixes all three:
the live engine runs on the booth PC, works with the cable unplugged, and
owns its displays.

This is what Holyrics, ProPresenter, EasyWorship and FreeShow do. Cloud comes
back later, optionally, for sync between PCs, backups and the Gerar Planner
integration (the parked `cloud-security-model` branch is the basis for that).

## Goals for version 1

- Fully usable with no internet and no account.
- Installed from a Windows installer on the church's booth PC.
- Outputs (projector, TV, stage monitor) open fullscreen on the right display
  automatically at launch.
- Songs, services, Bible, media and themes stored on the PC, backed up
  automatically.
- The existing React UI survives mostly intact; the redesign happens after,
  on top of the new foundation.

Out of scope for v1: cloud sync, multi-PC, accounts, the Gerar Planner link,
Mac/Linux builds (the layout allows them, the work doesn't include them).

## Shape of the system

```
┌──────────────────────── KERYX.exe (Electron) ────────────────────────┐
│                                                                      │
│  main process (Node)                                                 │
│   ├─ SQLite database        %APPDATA%/KERYX/keryx.db                 │
│   ├─ media library          %APPDATA%/KERYX/media/                   │
│   ├─ local HTTP + WebSocket server                                   │
│   │     127.0.0.1:7700  full app   (operator windows load from here) │
│   │     0.0.0.0:7701    screens    (tablets/TVs on the church Wi-Fi) │
│   ├─ display manager        which output goes on which monitor       │
│   ├─ live state             what is on screen right now, broadcast   │
│   ├─ backups, updater, settings, optional AI calls                   │
│                                                                      │
│  renderer windows (the React app, unchanged pages)                   │
│   ├─ operator window        /Home, /Services, /Bible, ...            │
│   ├─ output windows         /Projection, /LyricProjection, ...       │
│   │                         frameless, fullscreen, one per display   │
└──────────────────────────────────────────────────────────────────────┘
          │ Wi-Fi, same bundle, screen routes only, optional PIN
          ▼
   tablets / smart TVs / stage monitor PC  (any browser)
```

One React bundle runs in three places: the operator window, the output
windows, and browsers on the local network. What differs is the transport
behind `src/api/client.js`.

## 1. Data: SQLite behind the existing adapter

`src/api/client.js` already hides the backend from the 60-odd call sites:
`keryx.entities.<Name>.list/filter/get/create/update/delete/bulk*/subscribe`.
The swap happens behind that surface; **pages don't change**.

- **Engine:** `node:sqlite` (built into Electron 44's Node 24 and into the
  Node that runs the scripts), synchronous, one file. Chosen over
  `better-sqlite3` because it needs no native rebuild for Electron, so the
  same store module runs in the app, the import script and `node --test`.
- **Schema:** the same 31 tables, generated from `base44/entities/*.jsonc`
  like the Supabase one was. Text ids (imported rows keep theirs, new rows
  get UUIDs), `jsonb` columns become JSON text, `created_date`/`updated_date`
  kept. The `church_id` column from the cloud branch is not needed locally.
- **Transport:** the renderer calls `window.keryxDesktop.db.<op>` exposed by the
  preload script; the main process runs the query. Network screens use the
  same operations over HTTP/WebSocket. The adapter picks the transport at
  startup (`window.keryxDesktop` present → IPC, else → network).
- **Filters and sort:** the adapter's Mongo-shaped filter (`$in`, `$gte`,
  `$regex`, …) and `"-field"` sort compile to SQL `WHERE`/`ORDER BY`. Same
  semantics the pages rely on today, including the two read shapes
  (positional vs `{ sort, limit, skip }`).
- **`subscribe(cb)`:** the main process emits a change event after every
  write (`{ type, data, id, timestamp }`, the same shape as today) to every
  window and every network screen. This replaces Supabase realtime and is
  what keeps `LyricProjection`, `StageView`, `VideoProjection` working
  unmodified in phase 1.
- **`auth.*`:** there is no login. `auth.me()` returns a local operator
  profile from settings (name, church branding). `isAuthenticated()` is
  always true. `AuthContext` keeps its shape so pages don't change.
- **`integrations.Core.UploadFile`:** copies the file into the media library
  and returns a local URL (section 4).
- **`integrations.Core.InvokeLLM`:** optional, see section 6.

**Importing today's data:** a one-off script reads from Supabase (or Base44,
the existing `scripts/migrate-from-base44.mjs` already does the Base44 half)
and writes the SQLite file, downloading media that still points at Base44's
CDN into the library.

## 2. Live sync: one source of truth

Today "what is on screen" lives in five cloud tables (`lyric_sync`,
`video_sync`, `video_control`, `live_session`, `bible_projection_sync`) that
exist only as a message bus, plus a parallel `postMessage` channel for the
local projector window. `Home` and `Services` each carry a copy of the
control logic.

- **Phase 1 (no page changes):** those tables become SQLite tables like any
  other, and the change-event broadcast carries their updates to outputs and
  network screens. Everything works as now, minus the internet.
- **Later (the redesign):** replace the tables with a single **live state**
  document held in the main process (`{ lyrics, video, tools, overlays,
  alert, stage }`). Operator pages mutate it through one `projection`
  service; outputs render it. This is where the duplicated control code in
  `Home`/`Services` collapses into one module, and where `postMessage` goes
  away. It's listed here so phase 1 doesn't paint us into a corner, not as
  phase-1 work.

## 3. Outputs and displays

- **Display manager** (main process, Electron `screen` API): lists monitors,
  stores a mapping `display id → output kind` (projector → `/Projection`,
  TV → `/LyricProjection`, stage → `/StageView`, …) in settings, and opens
  each output as a frameless, fullscreen, always-on-top `BrowserWindow` on
  its display at launch and when a monitor is plugged in. Settings gets an
  "Ecrãs" section with a picture of the monitors to drag outputs onto.
- **`window.open` keeps working:** pages open the projector with
  `window.open(...)` (`src/lib/projectionWindow.js`, `Home`, `Services`,
  `BibleSchool`). The main process intercepts these by window name and
  places them on the configured display instead of a popup. `postMessage`
  between opener and output works in Electron, so phase 1 needs no page
  changes here either. The live-state redesign retires it.
- **As built (phase 2):** the main process places windows, it does not open
  them. Pages hold the `window.open` handle and `postMessage` through it
  (`/Projection` receives slides only that way), so a window the main
  process opened itself would be deaf. Opening outputs automatically at
  launch therefore waits for the live-state engine in phase 6. Settings has
  "Testar" and "Fechar" per output; Ctrl+W closes a fullscreen output; the
  numbers are primary display first. Unit tests cover the placement rules
  (`electron/outputs.test.cjs`), and the smoke run opens a real output
  (`KERYX_SMOKE_FULLSCREEN=1` also tests an explicit assignment).
- **Keyboard and safety:** outputs ignore input; Esc in the operator window
  blanks all outputs; outputs survive the operator window being closed and
  reopened.

## 4. Media on disk

- Files live in `%APPDATA%/KERYX/media/<uuid>.<ext>`, the database stores
  the relative path, and the local server serves them at `/media/…` to every
  window and network screen. Videos play from disk through the normal
  `<video>` tag.
- `MediaUpload` and `BackgroundGallery` stop writing base64 data URLs into
  rows (today a 200 MB video becomes a 270 MB database row).
- **As built (phase 3):** both upload through `UploadFile` into the media
  folder. Rows store `keryx-media://<file>`. Files shipped with the app
  (`resources/`: 19 backgrounds, the church logo) are served under
  `/media/bundled/…` and referenced the same way, so they pass the pages'
  `startsWith("http")` checks. Three Unsplash photos the old lists used no
  longer exist and were dropped. The import (`npm run db:import`) downloads
  files from Base44's CDN into the media folder and points known Unsplash
  URLs at the bundled copies (`scripts/localize-media.cjs`).
- Thumbnails: **not built.** Nothing displays `thumbnail_url` (the media list
  shows icons; `MediaCard`, which would, is unused). Revisit with the UI
  redesign.
- `powerpoint` as a media type can't be rendered offline by Electron; v1
  accepts PDF exports and says so in the UI.

## 5. Bible: installed once, then local

Before phase 3 nothing read the `bible_verse` table; every verse came from
`abibliadigital.com.br` with the AI as fallback.

- **Not bundled.** NVI (Biblica), ACF (Sociedade Bíblica Trinitariana do
  Brasil) and AA (Imprensa Bíblica Brasileira) are all copyrighted editions.
  An earlier draft of this plan called ACF/AA public domain; that was wrong.
  KERYX ships no Bible text. Each church downloads a version once (≈4 MB,
  from `thiagobodruk/biblia`, the source the web app already used) or
  installs it from that JSON file; it lands in `bible_verse` (31k verses,
  under a second) and works offline from then on.
  Bíblia › Mais › Bíblias instaladas, and a prompt above the verse search
  while none is installed (`BibleInstaller`, `electron/bible.cjs`).
- **One source of verse text:** `src/lib/bibleText.js` (`getChapter`,
  `getPassage`, `searchVerses`). Order: local database → abibliadigital
  online → AI (web build only). The reader, selector, compare view,
  `QuickVerseBar`, word search and the Home search all use it. The desktop
  build never asks the AI for scripture.
- **References and books:** `src/lib/bibleBooks.js` parses "Jo 3:16",
  "1Co 13:4-7", "salmo 23" (accents optional), and holds the version list.
  Its verse-count table was wrong in ~165 chapters (Levítico 23 listed 9
  verses instead of 44); it is now taken from the texts.
- Word search runs locally, ignoring case and accents ("coracao" finds
  "coração"), ~0.4 s over a whole version; an FTS index can make it instant
  if that matters.
- AA marks explanatory phrases with `{…}` (286 verses); the text is stored
  and shown exactly as published.

## 6. Internet-dependent features, kept optional

| Feature | v1 behaviour |
| --- | --- |
| Verse lookup and Bible search | **Local** once a version is installed (section 5); other versions online only. |
| Lyrics import from URL, song search (AI) | Out of v1 (decision 4). |
| YouTube projection | Needs internet by nature; unchanged. |
| Unsplash backgrounds (30 hard-coded URLs) | **Done:** bundled (`resources/backgrounds`, 7 MB). |
| Base44 CDN logo in `Layout.jsx` | **Done:** bundled default (`resources/branding`); the profile logo overrides it. |

## 7. Network screens (tablets, stage monitor, smart TVs)

- The main process serves the same bundle on `0.0.0.0:7701`, restricted to
  screen routes (`/LyricProjection`, `/StageView`, …). Operator routes are
  only served on `127.0.0.1`, so a phone on the Wi-Fi can't open the control
  panel. The Settings page shows the address and a QR code.
- Screens talk to the main process over WebSocket for change events and
  HTTP for reads. Optional 4-digit PIN, remembered per device.
- Screens reconnect automatically and show the last state while offline
  (the existing `useOfflineCache` and reconnect hooks already behave this
  way).

## 8. Backups, updates, packaging

- **Backups:** SQLite online backup to `<backup folder>/keryx-YYYY-MM-DD.db`
  on launch and on close, keeping the last 14; the folder is configurable
  (USB stick, network share, OneDrive folder). "Exportar tudo" produces a
  zip of database + media; "Importar" restores it.
- **Updates:** `electron-updater` against GitHub Releases. The app checks on
  launch and shows "Nova versão disponível", never installs on its own.
- **Packaging:** `electron-builder`, NSIS installer, unsigned (single-church
  use; the first run shows the SmartScreen "Run anyway" prompt). Code signing
  is a config change if KERYX is ever offered to other churches.
- **Logs:** `electron-log` to `%APPDATA%/KERYX/logs/`, with "Enviar
  diagnóstico" zipping the last log.

## 9. Project layout after the change

```
electron/
  main/        app lifecycle, windows, display manager, settings, updater
  db/          schema, migrations, query compiler for the adapter's filters
  server/      HTTP + WebSocket (loopback full app, LAN screens), /media
  media/       library import, thumbnails
  preload.cjs  exposes window.keryxDesktop (db, projection, settings, media)
src/           the React app, as today; src/api/client.js gets a
               transport layer (ipc | network) under the same surface
resources/     bundled Bibles, default backgrounds
supabase/      kept for the future cloud sync; not used by the desktop app
```

Build: the renderer keeps the plain Vite setup; the main and preload files are
unbundled CommonJS (`.cjs`), which needs no extra build tool until they grow
dependencies that must be bundled. `BrowserRouter` keeps working
because windows load from `http://127.0.0.1:7700/…`, not `file://`.

## 10. Phases

Each phase ends with the app runnable end to end. Effort is focused
development time, not calendar time.

| # | Phase | Result | Effort |
| --- | --- | --- | --- |
| 0 | Scaffold | **Done.** Electron shell opens the current UI from a loopback server; 13 dead dependencies removed (Stripe, Leaflet, three, Quill, lodash, moment, …) | 1–2 days |
| 1 | Local data | **Done.** SQLite store with Base44 query semantics (20 tests), adapter over IPC, change events, local operator profile, uploads to `media/`, import script from Base44. No Supabase requests in the desktop build. | 4–5 days |
| 2 | Outputs | **Done**, except opening outputs at launch (see section 3). Display placement of the windows pages open, hot-plug re-placement, "Telas e saídas" settings, identify, test/close | 2–3 days |
| 3 | Media + Bible | **Done** (thumbnails skipped, Bibles installed rather than bundled; sections 4–5). Media library on disk, offline verse lookup and search, bundled backgrounds and logo | 2–3 days |
| 4 | Ship it | Backups, export/import, updater, installer, logs, install on the booth PC and run a service with it | 2 days |
| 5 | Network screens | LAN server, screen routes, PIN, QR code in Settings | 2–3 days |
| 6 | Redesign | Live-state projection engine, one control module, then the UI/UX work | separate plan |

Phases 1 and 2 are the risk; after them, nothing depends on the internet.

## 11. Decisions

Settled on 2026-10-06:

1. **Windows only** for v1.
2. **Language and Bible:** Brazilian Portuguese throughout (UI copy was
   standardized to pt-BR the same day); Bible versions NVI/ACF/AA, installed
   by the church rather than bundled because all three are copyrighted
   (section 5).
3. **Outputs:** HDMI displays, tablets and Wi-Fi screens are all in v1, so the
   network-screens phase (section 7, phase 5) is **in** v1, not deferrable.
4. **AI features: out of v1.** Most AI calls fetch Bible text, which the
   bundled Bible replaces. What remains (topical Bible search, finding lyrics
   online) comes back later as one optional online-lyrics button using the
   church's own Anthropic key. Note `SongSearch` and `UrlLyricsImporter` are
   not reachable from any page today.
5. **Supabase project:** kept as is. It is the source for the phase 1 data
   import and the base for future sync (idle free-tier projects pause
   themselves; check the plan if it is a paid one).

## Risks

- **The adapter's filter semantics** must match exactly what pages expect;
  a mismatch shows up as "empty list" bugs. Mitigation: a test suite for the
  query compiler, the first tests in the project.
- **Electron and `postMessage` across windows** behave slightly differently
  from a browser (origin checks, timing of `PROJECTION_READY`). The
  `projectionWindow.js` fallbacks already tolerate this; phase 2 verifies
  with two displays.
- **Church PC capability:** older PCs and 4K projectors. Output windows
  render in Chromium; keep animations GPU-friendly and test on the actual
  booth machine in phase 4, not after.
- **Data loss on one PC** is the price of offline-first; backups in phase 4
  are not optional.
