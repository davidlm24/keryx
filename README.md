# KERYX

Church worship projection and service planning — song lyrics, Bible passages,
media and announcements driven onto one or more live screens, in the vein of
Holyrics and ProPresenter.

The UI is in **Brazilian Portuguese (pt-BR)**. Entity field descriptions are Portuguese too.

- **Stack:** Vite 6 · React 18 · React Router 6 · TanStack Query 5 · Tailwind 3 · shadcn/ui (Radix)
- **App:** Electron 44, data in a local SQLite file (`node:sqlite`), no login, works offline
- **One screen to run a service:** the operator console (`/Console`), on the
  design system in `docs/design-system/`; the outputs (projector, stage,
  video, lyrics, avisos, pastor) render one shared live state
- **Desktop only.** The web build on Supabase was retired (2026-10-08):
  projection apps are programs on the church computer, and tablets and TVs
  join through the computer itself (see Screens on the network). `supabase/`
  is kept, unused, for a future cloud sync or backup.

This started as a Base44 export and was migrated off it. The plan and its
phases are in [docs/desktop-architecture.md](docs/desktop-architecture.md);
how the old pages were folded into the console is in
[docs/migration-inventory.md](docs/migration-inventory.md).

---

## Running it

```bash
npm install
npm run desktop:dev       # the desktop app, hot reload
```

| Command | What it does |
| --- | --- |
| `npm run desktop:dev` | the app (Electron) on the Vite dev server, hot reload; F12 opens devtools |
| `npm run dev` | dev only: the console in a plain browser on sample data (the real store and live engine in a temp folder, `scripts/preview/`); output pages open as tabs from Saídas. Not the app: no monitors, audio meters or Bible downloads |
| `npm run desktop:start` | build, then open the app on the built files |
| `npm run build` | production build to `./dist` (what the app and the network screens load) |
| `npm run lint` / `npm run lint:fix` | ESLint, errors only; warnings are advisory |
| `npm test` | unit tests (`node --test`): store query semantics, schema drift, live state, outputs, network server, Bible install and search, console helpers (setlist, avisos, EBD, reports, keys) |
| `npm run desktop:smoke` (`KERYX_SMOKE_FULLSCREEN=1` also opens a real fullscreen output on your primary display for a moment) | build, open the app on a throwaway data folder, run the in-app checks (console, outputs, network screens), exit (0 = OK). `KERYX_SMOKE=1 npm run desktop:dev` runs the same checks plus the renderer adapter end to end |
| `npm run dist` | the Windows installer, `release/KERYX-Setup-<version>.exe` (unsigned; `dist:dir` builds just the unpacked app) |
| `npm run db:schema` | regenerate `electron/db/schema.json` after changing `base44/entities/*.jsonc` |
| `npm run db:import` | one-off import of the Base44 data into the local database (see below) |

If `npm install` did not download the Electron binary
(`node_modules/electron/dist` missing), run `node node_modules/electron/install.js`.

A plain browser on a production build shows only a note that KERYX is the
desktop app.

### Backups, moving data, updates

Configurações › "Dados e atualizações":

- **Backup automático:** a copy of the database on launch and on close, one per
  day, the last 14 kept, in `%APPDATA%\KERYX\backups` or a folder you choose
  (OneDrive, Google Drive and USB folders work, and give you a copy off this
  computer). Backups do not include media files.
- **Exportar tudo / Importar:** one zip with the database and all media, to move
  to another computer or keep as a full backup. Importing replaces the current
  data and restarts KERYX; what was replaced stays in a `before-import-…`
  folder inside the data folder until you delete it.
- **Salvar diagnóstico:** a zip with recent logs and system info for support.
- **Atualizações:** from 0.2.1 on, new versions come from the releases repository (see "Releasing" below).

### Releasing a new version

Installed copies update themselves from
[comunidadegerar/keryx-releases](https://github.com/comunidadegerar/keryx-releases),
a public repository that holds only the installers and `latest.yml` (the
code stays in the private repository). `build.publish` in `package.json`
points there. Configurações › Dados e atualizações finds the new version,
downloads it when asked and installs it on the next restart, never on its own
and never mid-service.

```bash
# 1. bump "version" in package.json (and commit)
# 2. build from a clean copy with its own install (npm ci): electron-builder
#    packs the main process's dependencies from ./node_modules, which a git
#    worktree sharing the main folder's node_modules does not have
npm ci
# 3. build and publish, with a token of the account that owns keryx-releases
#    (GH_TOKEN; never commit it). In Git Bash, from the GitHub CLI:
GH_TOKEN="$(gh auth token --user comunidadegerar)" npx vite build
GH_TOKEN="$(gh auth token --user comunidadegerar)" npx electron-builder --win --publish always
```

The release goes out as a normal release (not a draft), so installed copies
see it at once. To build an installer without publishing, `npm run dist`
(`release/KERYX-Setup-<version>.exe`).

The first install (or a copy older than 0.2.1, which has no update setting)
is by hand: copy the installer to the church computer and run it; data in
`%APPDATA%KERYX` is kept. Windows shows "O Windows protegeu o computador" for
the unsigned installer: Mais informações › Executar assim mesmo.

### Screens on the network (tablets, TVs, stage monitor)

Configurações › "Telas na rede": turn it on and open the address shown (or scan
the QR code) in the tablet's or TV's browser, on the same Wi-Fi. Windows asks
once whether KERYX may use the network: allow it on private networks. An
optional PIN keeps other devices on the Wi-Fi out. Screens can only view: the
console is never served to the network, and screens cannot write. Available:
Projeção principal, Letras, Palco, Vídeo, Avisos, Tela do pastor. The console
lists the screens connected right now in the Saídas popover.

### Bible text

Nothing ships with the app: NVI, ACF and AA are copyrighted editions. The
Bíblia environment (or Configurações › Bíblias instaladas) installs one
(≈4 MB each); after that, reading, word search and comparing run from the
local database with no internet. Other versions (ARA, ARC, NAA, NTLH, BKJ
1611) work online only. All Bible text goes through `src/lib/bibleText.js`.

### Where the app keeps its data

Everything is in `%APPDATA%\KERYX` (override with `KERYX_DATA_DIR`):
`keryx.db` (SQLite, all 31 entities plus the operator profile), `media/`
(uploaded files) and Chromium's own profile (`localStorage`). Backing up that
folder backs up KERYX. Smoke runs never touch it; they use a temp folder.

### Importing the old data

`npm run db:import` (`scripts/import-base44.mjs`) pulls every entity from
Base44 into the app's `keryx.db`, keeping ids and timestamps so
cross-references survive, plus the Base44 user's branding into the local
profile. It needs `npm i --no-save @base44/sdk` and a Base44 session token
(see the comment at the top of the script and `.env.example`). Close KERYX
first, run with `--dry-run` first. It then downloads the files rows point at
on Base44's CDN into the media folder and repoints the rows (`--no-media` to
skip); any that fail are listed and keep their online URL.

### supabase/ (kept, unused)

The migrations and Edge Functions of the retired web build. The Supabase
project (`keryx`, ref `rgldwchaozsjkrfycdtr`) still exists; nothing in the app
talks to it. A future cloud sync or backup would start from here, with its
sign-in in Configurações and used only for that.

---

## How the backend is wired

Pages import `keryx` from `src/api/keryxClient.js`, a re-export of
**`src/api/client.js`**. That facade keeps the surface Base44's SDK had
(`entities.<Name>.list / filter / get / create / update / delete / bulkCreate /
bulkUpdate / subscribe`, `auth.*`, `integrations.Core.*`) over:

- **Desktop** (`src/api/backends/desktop.js`, when `window.keryxDesktop`
  exists): calls go over IPC (`electron/preload.cjs` → `electron/data-ipc.cjs`)
  to the store in the main process (`electron/db/store.cjs`, SQLite via
  `node:sqlite`). Writes broadcast change events to every window, which is
  what `subscribe()` listens to. `auth.me()` is the single local operator
  profile; there is no login. `UploadFile` copies the file into `media/`; the
  database stores `keryx-media://<file>` and the adapter hands pages
  `http://127.0.0.1:7700/media/<file>`. `FileInfo` says which media files are
  on disk. AI features are not part of the app (they reject with 501).
- **Network screens** (`src/api/backends/network.js`, a browser that opened a
  screen page from the KERYX computer): the same store read over HTTP and
  the change events over Server-Sent Events (`electron/lan.cjs`), read-only.

Query semantics (filters, sort, paging) follow Base44; they are pinned by
`electron/db/store.test.cjs`.

What every output shows is the **live state** (`shared/live-state.mjs`, held
by `electron/live.cjs`): one document changed by operations
(`src/lib/projection.js`), sent whole to every window and every network
screen after each change.

---

## Layout

```
electron/
  main.cjs              app lifecycle, windows, data folder, loopback server
  preload.cjs           window.keryxDesktop (db, media, live, displays, bible, network, …)
  data-ipc.cjs          IPC between windows and the store; change broadcast
  live.cjs              the live state document
  outputs*.cjs          output windows: placement, tracking, Abrir ao iniciar
  lan.cjs               the network server for tablets and TVs
  server.cjs            serves dist/ and media/ on 127.0.0.1:7700 (with Range)
  smoke.cjs             in-app checks for npm run desktop:smoke
  db/                   store.cjs, schema.json (generated), tests
shared/live-state.mjs   the live state and its operations (main process and console)
base44/entities/*.jsonc 31 JSON Schemas the tables are generated from; readable field docs
docs/design-system/     tokens, kx- components and icons the console is built on
supabase/               the retired web build's migrations and functions (unused)
src/
  App.jsx               routes: /Console and the output pages
  api/                  the client facade and its backends
  pages/                Console and the output pages (Projection, LyricProjection,
                        StageView, VideoProjection, CommunicationProjection, PastorView)
  components/
    console/            the console: environments, views, popovers, settings/
    screen/             ScreenRenderer, what every output and monitor draws
    projection/         output-side pieces (video player, alerts, media)
    network/            the network screens' start page
    ui/                 shadcn/ui primitives — generated, not linted, avoid editing
  lib/                  console logic (lib/console/*, tested), Bible text and search,
                        projection operations, backgrounds
  hooks/                live state, church logo, aviso sequences, durations
  utils/                song sections, PDF export, YouTube
```

### Data model

Tables are the entities in snake_case; columns are the entity fields verbatim
(quoted, so camelCase like `"serviceId"` survives). Every table has `id`
(text — Base44's 24-hex ids were kept), `created_date`, `updated_date`,
`created_by`, `created_by_id`.

| Area | Tables |
| --- | --- |
| Songs | `song`, `song_history`, `playlist`, `worship_team` |
| Services | `service`, `service_item`, `service_template`, `volunteer_schedule` |
| Bible | `bible_verse`, `bible_passage`, `bible_note`, `bible_material`, `bible_school_class` |
| Projection | `projection_state`, `projection_theme` (and, written by nothing any more, `projection_device`, `projection_scene`, `banner_template`) |
| Live sync (old) | `live_session`, `lyric_sync`, `video_sync`, `video_control`, `bible_projection_sync` — kept as user data; the live state replaced them |
| Media | `media`, `communication_video` |
| Engagement | `chat_message`, `alert_message`, `poll`, `quiz`, `raffle` |
| Users | `profile` (the local operator: church name, city, logo) |

---

## Known gaps

1. **No type layer.** Everything is untyped `.jsx`.
2. **Advisory lint warnings**, mostly unused locals and
   `react-hooks/exhaustive-deps`.
3. **Tables without a writer** (listed above) are kept until a schema round
   decides; they hold the church's old data.
4. **The smoke needs a quiet computer:** its audio-meter check hears every
   sound of the PC and its focus check needs the KERYX window to be able to
   take focus (see CLAUDE.md).
