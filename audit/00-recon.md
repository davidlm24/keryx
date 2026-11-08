# Keryx audit, pass 0: Recon

Repo: github.com/davidlm24/keryx @ `d12d94d` (677 commits, v0.2.17). This is a static read: no project code was run.

## 0. Public-repo secrets check
I scanned the full git history (677 commits) for API keys, service-role keys, tokens, private keys and committed `.env` files. **Nothing secret was found.**
- `.env` is gitignored, and only `.env.example` was ever committed.
- The one identifier exposed is the old Supabase project URL. A project URL is public by design, so it is not a secret.
- If that Supabase project is still alive and unused, delete or pause it anyway.

## 1. Stack and versions
- **Runtime:** Electron ^44.5.1 with electron-builder ^26 (NSIS, Windows x64 only) and electron-updater ^6.8.
- **Renderer:** React 18.2, Vite 6, Tailwind 3 with shadcn/Radix, react-router 6, TanStack Query 5, framer-motion, sonner, @hello-pangea/dnd.
- **Language:** plain JS/JSX with no type-checking. `typescript` is installed but unused.
  - Main process: CommonJS (`.cjs`).
  - Shared logic: ESM (`.mjs`).
- **Storage:** `node:sqlite` (DatabaseSync), with no native module. WAL mode, `synchronous=NORMAL`, explicit transactions. The schema is generated from `base44/entities` into `electron/db/schema.json`.
- **Leftovers:** `base44/` (36 entity files) and `supabase/` (migrations and functions) remain from the retired web version and are kept "for future cloud sync".
- **Size:** about 15.8k lines in `electron/` + `shared/`, and about 36.6k lines in `src/`.

## 2. Run, build and package
- **Commands:**
  - `desktop:dev`: Vite dev server plus Electron.
  - `desktop:start`: build, then run.
  - `desktop:smoke`: a 3,277-line end-to-end smoke test that opens real windows.
  - `dist`: Windows installer.
- **Updates:** published as drafts on GitHub to `comunidadegerar/keryx-releases`. The app checks at launch, every 6 hours and on resume. It never installs on its own; the console installs only when nothing is on air.
- **Code signing:** none configured. There is no certificate, `signtool` setup or `publisherName`. → SEC

## 3. Process model
- **Main** (`electron/main.cjs`, 554 lines):
  - Single-instance lock.
  - Loopback static server on `127.0.0.1:7700`, which serves `dist/` and media. The app origin is that URL.
  - SQLite store, `live.json` live state, `settings.json`.
  - Updater, backups (taken at open and at close), LAN server on `:7701` (off by default), and sync through a shared folder.
- **Windows:** all of them share one `webPreferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`, `backgroundThrottling:false`, and autoplay allowed.
  - Console (`/Console`): the main window, with a frameless Windows title-bar overlay.
  - Outputs, opened by `window.open` or by main (`openOutputWindow`) and placed by `outputs-manager.cjs`: `/Projection`, `/LyricProjection`, `/VideoProjection`, `/CommunicationProjection`, `/StageView`, `/PastorView`, `/StreamView` (for OBS).
  - Detached pages: `/Janela` (old name `/Editor`).
- **Navigation guard:** `setWindowOpenHandler` and `will-navigate` keep navigation in-app, and send only `http(s)` links to `shell.openExternal`.
- **Chromium switches:** occlusion and background-media suspend are disabled, so a covered projector keeps playing.
- **Crash handling:** `render-process-gone` and `child-process-gone` are **logged only**. Nothing reloads an output window. → ARCH/FUNC (likely the most important item to verify)

## 4. IPC inventory
Every handler checks `isTrustedSender`, meaning the sender frame's origin equals the app origin. The generic `op` dispatchers use hasOwnProperty allow-lists.

| Channel | Type | Handler | Validation |
|---|---|---|---|
| keryx:db | invoke | data-ipc.cjs:30 → store.call(entity, op, args) | origin; entity/op checked inside store (verify in SEC) |
| keryx:media-import | invoke | data-ipc.cjs:43 → mediaImport.cjs | origin; size and path rules in mediaImport |
| keryx:media-info | invoke | data-ipc.cjs:56 | origin; basename-only, max 2000 names |
| keryx:displays:list/set/open/close/identify | invoke | data-ipc.cjs:81–85 | origin |
| keryx:displays:export-file / import-file | invoke | data-ipc.cjs:99/110 | origin + dialog |
| keryx:bible:status/online-chapter/install/install-file | invoke | data-ipc.cjs:131–134 | origin |
| keryx:system | invoke | data-ipc.cjs:144 → system.ops | origin + op allow-list |
| keryx:lyrics | invoke | data-ipc.cjs:157 | origin + {search, get} |
| keryx:network | invoke | data-ipc.cjs:169 → network.ops | origin + allow-list |
| keryx:sync | invoke | data-ipc.cjs:181 → sync.ops | origin + allow-list |
| keryx:sync:missing | invoke | main.cjs:531 | origin |
| keryx:live:get / live:call | invoke | data-ipc.cjs:194–195 → live.call(op) | origin; ops in shared/live-state.mjs |
| keryx:meter / audio-level | send | data-ipc.cjs:219/236 | origin + shape |
| keryx:config | sendSync | data-ipc.cjs:244 | none needed (static values) |
| keryx:remote:result | send | main.cjs:412 | sender must be the console |
| keryx:janela | send | main.cjs:436 | console or /Janela URL, 1 MB cap |
| Broadcasts (main → all windows) | event | db-change, live-change, remote, janela, update, notifications, sync:missing, meter, audio-level | n/a |

## 5. Preload surface
`window.keryxDesktop` (`electron/preload.cjs`, 205 lines) exposes these namespaces, all as narrow wrappers with no raw `ipcRenderer`:
`db.call`, `displays.*`, `bible.*`, `live.get/call`, `network.call`, `remote.reply`, `janela.send`, `lyrics.call`, `meters.*`, `system.call`, `media.import/info`, `sync.call/missing`, plus subscriptions.

## 6. Data and storage
Everything lives in `%APPDATA%/KERYX`:
- **`keryx.db`:** songs, services, themes, media rows, users, output preferences and more.
- **`media/`:** imported media files.
- **`live.json`:** what is on air. Saves are debounced and written atomically (tmp file + rename), and the file is restored on relaunch.
- **`settings.json`:** per-machine settings, also written atomically.
- **`logs/`:** kept for 7 days.
- **Chromium profile:** includes localStorage.

Backups run automatically at open and close, plus zip export/import. A pending import is swapped in before the database opens.

**Sync between computers** uses a shared folder: a pass every 30 s, plus one 3 s after any local change. The church code is sealed with `safeStorage`.

## 7. Feature inventory
| Feature | Status | Where |
|---|---|---|
| Song library and editor | Present | console/Library.jsx, SongEditor.jsx |
| Chords in lyrics (`[G]…`) | Present | lib/chords.js |
| Lyrics from the web | Present | electron/lyrics.cjs (letras.mus.br, lrclib) |
| Bible: installed versions | Present | electron/bible.cjs; JSON from GitHub or a file; online chapter from abibliadigital |
| Bible: search, quick jump, compare | Present | BibleEnv, BibleQuickJump, BibleSearchPanel, BibleCompareView, lib/bibleSearch.js |
| Bible reference parsing in PT + EN | Unverified | lib/bibleBooks.js, bibleSearch.js → FUNC |
| Media: image, video, audio, PDF pages | Present | MediaView, projection/LiveVideo, pdfPagesCapture |
| YouTube | Present (verify how) | 26 files reference it |
| Generated / audio-reactive backgrounds | Present | shared/generators.mjs |
| Service planner / setlist / rundown | Present | ServicePlanner, Rundown, setlistActions |
| Themes and screen editor | Present | ThemeEditor, ScreenEditor, layouts.js |
| Layers, Esc + Desfazer, Travar telas | Present | Layers.jsx, live-state engine |
| Multiple outputs and per-output preferences | Present | outputs-manager.cjs, outputPrefs.js |
| Stage display / Pastor view | Present | /StageView, /PastorView |
| Stream output (OBS browser source) | Present | /StreamView |
| NDI | Absent | owner decision: out of scope |
| Timers / countdown | Present (presets unverified) | → FUNC |
| Announcements / quick notice | Present | NoticeEditor, AlertBar |
| Network screens (tablets, TVs) | Present | lan.cjs :7701, read-only, PIN optional |
| Phone remote control | Present | /Remote; separate mandatory code; closed action list |
| Import: cifra / ChordPro / text / JSON | Present | console/importSongs.js |
| Import: Holyrics / ProPresenter / OpenLP | Not found | no parser found → FUNC gap |
| Multi-PC sync | Present | sync.cjs, syncControl.cjs, syncPairing.cjs |
| Crash recovery of on-air state | Present | live.json |
| Output-window crash auto-recovery | Absent | logged only → ARCH |
| Offline-first | Present | Bible and lyrics online lookups are optional |
| i18n | Absent | UI is Portuguese only; no i18n library → COPY |
| Reports / school / activity views | Present | ReportsView, SchoolView, ActivityView |

## 8. Tests and tooling
- **Tests:** 102 test files with about 730 `test()` cases, run by `node --test`. They cover the store, live state, outputs, LAN, sync, backup, updater and console helpers.
- **Smoke test:** a desktop smoke run exists but is local only.
- **CI** (`windows-latest`, Node 24): `npm test`, lint and build. No type-check and no E2E in CI.
- **Bundle:** a bundle-budget script exists (`scripts/bundle-budget.cjs`).
- **Docs:** heavily documented. `CLAUDE.md` alone is 88 KB / 1,157 lines, plus `docs/desktop-architecture.md` at 1,172 lines.

## 9. Red flags for later passes
- **[ARCH/FUNC]** Output renderer crash or GPU loss is only logged. Nothing reloads the projector window, so it could stay blank or frozen mid-service (main.cjs:273, outputs-manager.cjs).
- **[SEC]** No Content Security Policy anywhere (index.html, server.cjs). Combined with rendering imported lyrics, web lyrics and notices, any XSS sink matters, even with sandbox on.
- **[SEC]** LAN `/api/db` is readable with **no PIN by default** (the PIN is optional). Check exactly which entities a screen can read, such as user profile, people or school data.
- **[SEC]** Windows builds are unsigned. Expect SmartScreen warnings, and check how electron-updater verifies downloads without a signature.
- **[SEC]** Verify `store.call(entity, op)` restricts entities and ops, since it is the widest IPC surface.
- **[SEC/FUNC]** Bible and lyrics come from third-party endpoints (abibliadigital, letras.mus.br's solr API, lrclib). Check failure handling, response validation and terms of use.
- **[ARCH]** God files: `src/pages/Console.jsx` (1,434 lines), `shared/live-state.mjs` (1,080), `electron/sync.cjs` (910), `electron/db/store.cjs` (846), `src/lib/console/dock.js` (848).
- **[ARCH]** Dead weight: `base44/`, `supabase/`, `scripts/import-base44.mjs`, and `CLAUDE.md` at 88 KB, which costs context in every Claude Code session.
- **[ARCH]** Sync through a shared folder (OneDrive/Dropbox-style) while SQLite runs WAL locally. Check conflict handling and partial-file reads.
- **[PERF]** No list virtualization in Library; check behaviour with 5,000+ songs. Also review framer-motion, recharts, jspdf and html2canvas in the console bundle, and memory over a 3-hour service with video backgrounds.
- **[UX]** The console is dense, with dock layouts, many panels and popovers. Keyboard handling is centralized at Console.jsx:870; check for focus traps in text fields.
- **[A11Y/COPY]** PT-only strings are hardcoded, and `prefers-reduced-motion` appears in only 3 places.
- **[TEST]** No E2E in CI, and the smoke test needs a desktop session. No tests target output-window crash or display hot-plug.

## What's done well (protect during fixes)
- **Electron baseline:** isolation, sandbox, origin-checked IPC, op allow-lists, and a navigation guard.
- **Write safety:** atomic writes for live state and settings, SQLite WAL with transactions, and backups at open and close.
- **Live behaviour:** updates never install while something is on air, the close guard is aware of on-air state, and covered projectors don't freeze video.
- **Engineering hygiene:** a strong unit-test culture, Windows CI, and thorough written architecture decisions.
