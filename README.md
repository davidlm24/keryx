# KERYX

Church worship projection and service planning — song lyrics, Bible passages,
media and announcements driven onto one or more live screens, in the vein of
Holyrics and sPresenter.

The UI is in **Brazilian Portuguese (pt-BR)**. Entity field descriptions are Portuguese too.

- **Stack:** Vite 6 · React 18 · React Router 6 · TanStack Query 5 · Tailwind 3 · shadcn/ui (Radix) · Framer Motion
- **Desktop app:** Electron 44, data in a local SQLite file (`node:sqlite`), no login, works offline
- **Web build:** the same UI in a browser talks to [Supabase](https://supabase.com) instead (kept for the import source and future sync)
- **Size:** ~25k LOC across 26 pages, 31 tables

This started as a Base44 export and was migrated off it; see [How the backend
is wired](#how-the-backend-is-wired) for what that left behind.

**Direction:** KERYX is an offline-first desktop app for one church. The plan
and its phases are in [docs/desktop-architecture.md](docs/desktop-architecture.md);
phases 0 (shell) and 1 (local data) are done. The cloud access-control work is
parked on the `cloud-security-model` branch for a future sync feature.

---

## Running it

```bash
npm install
npm run desktop:dev       # the desktop app, hot reload
```

| Command | What it does |
| --- | --- |
| `npm run dev` | the web build in a browser, against the Supabase project in `.env` (copy `.env.example`) |
| `npm run build` / `npm run preview` | production build to `./dist` and a local server for it |
| `npm run lint` / `npm run lint:fix` | ESLint, errors only; warnings are advisory |
| `npm test` | unit tests (`node --test`): store query semantics, schema drift, output placement, Bible install and references, media import |
| `npm run db:import` | one-off import of the Base44 data into the local database (see below) |
| `npm run db:schema` | regenerate `electron/db/schema.json` after changing `base44/entities/*.jsonc` |
| `npm run db:migrate:supabase` | the older Base44 → Supabase import, for the web build |
| `npm run desktop:dev` | the desktop shell (Electron) on the Vite dev server, hot reload; F12 opens devtools |
| `npm run desktop:start` | build, then open the desktop shell on the built app |
| `npm run dist` | build the Windows installer, `release/KERYX-Setup-<version>.exe` (unsigned; `dist:dir` builds just the unpacked app) |
| `npm run desktop:smoke` (`KERYX_SMOKE_FULLSCREEN=1` also opens a real fullscreen output on your primary display for a moment) | build, open the shell on a throwaway data folder, check it rendered and that data flows, exit (0 = OK). `KERYX_SMOKE=1 npm run desktop:dev` runs the same checks plus the renderer adapter end to end |

If `npm install` did not download the Electron binary
(`node_modules/electron/dist` missing), run `node node_modules/electron/install.js`.

### Backups, moving data, updates

Settings > "Dados, backup e atualizações" (desktop):

- **Backup automático:** a copy of the database on launch and on close, one per
  day, the last 14 kept, in `%APPDATA%\KERYX\backups` or a folder you choose
  (OneDrive, Google Drive and USB folders work, and give you a copy off this
  computer). Backups do not include media files.
- **Exportar tudo / Importar:** one zip with the database and all media, to move
  to another computer or keep as a full backup. Importing replaces the current
  data and restarts KERYX; what was replaced stays in a `before-import-…`
  folder inside the data folder until you delete it.
- **Salvar diagnóstico:** a zip with recent logs and system info for support.
- **Atualizações:** see "Releasing" below; off until a release repository is set.

### Releasing a new version

```bash
# bump "version" in package.json, then
npm run dist          # release/KERYX-Setup-<version>.exe
```

Copy the installer to the church computer and run it; data in `%APPDATA%\KERYX`
is kept. Windows shows "Windows protected your PC" for the unsigned installer:
More info > Run anyway.

For in-app updates, create a GitHub repository for the releases, add
`"publish": { "provider": "github", "owner": "<owner>", "repo": "<repo>" }` to the
`build` section of `package.json`, and release with
`GH_TOKEN=<token> npx electron-builder --win --publish always`. Installed copies
then offer the new version in Settings; installing is always a click.

### Screens on the network (tablets, TVs, stage monitor)

Settings > "Telas na rede": turn it on and open the address shown (or scan the
QR code) in the tablet's or TV's browser, on the same Wi-Fi. Windows asks once
whether KERYX may use the network: allow it on private networks. An optional
PIN keeps other devices on the Wi-Fi out. Screens can only view: the control
pages are never served to the network. Available: Projeção principal, Letras,
Palco, Vídeo, Material bíblico, Anúncios, Comunicação, Tela do pastor, Saída
configurada.

### Bible text

Nothing ships with the app: NVI, ACF and AA are copyrighted editions. On
first use the Bible page offers to download one (≈4 MB each); after that,
lookups, the reader and word search run from the local database with no
internet. Other versions (ARA, ARC, NAA, NTLH, BKJ 1611) still work online
only. All Bible text goes through `src/lib/bibleText.js`.

### Where the desktop app keeps its data

Everything is in `%APPDATA%\KERYX` (override with `KERYX_DATA_DIR`):
`keryx.db` (SQLite, all 31 entities plus the operator profile), `media/`
(uploaded files) and Chromium's own profile (`localStorage`). Backing up that
folder backs up KERYX. Smoke runs never touch it; they use a temp folder.

### Supabase project (web build and future sync)

- **Project:** `keryx` (ref `rgldwchaozsjkrfycdtr`, eu-west-3 Paris) in org "davidlm24's Org"
- **URL:** `https://rgldwchaozsjkrfycdtr.supabase.co`
- **Schema:** `supabase/migrations/` — already applied to the project. Apply
  new migrations with the Supabase CLI (`supabase db push`) or the dashboard
  SQL editor, and commit the file.
- **Edge Functions:** `supabase/functions/` — already deployed. Redeploy with
  `supabase functions deploy <name>`.

### One-time setup still needed in the Supabase dashboard

These can't be done from code:

1. **Anthropic API key** — Edge Functions > Secrets: `ANTHROPIC_API_KEY`.
   Without it the verse lookup, lyrics import and song search return an error.
   Optional `ANTHROPIC_MODEL` (defaults to `claude-opus-5-5`).
2. **Email OTP on sign-up** — Authentication > Email Templates > *Confirm
   signup*: the body must include `{{ .Token }}`. The Register page asks for
   a 6-digit code, and the default template sends a link instead.
3. **Google / Facebook login** — Authentication > Providers: enable each,
   and add the app's origin(s) under Authentication > URL Configuration >
   Redirect URLs. The buttons are already wired.
4. **Site URL** — Authentication > URL Configuration: set it to where the
   app is served, so password-recovery links land on `/reset-password`.

### Importing the old data

`npm run db:import` (`scripts/import-base44.mjs`) pulls every entity from
Base44 into the desktop app's `keryx.db`, keeping ids and timestamps so
cross-references survive, plus the Base44 user's branding into the local
profile. It needs `npm i --no-save @base44/sdk` and a Base44 session token
(see the comment at the top of the script). Close KERYX first, run with
`--dry-run` first. It then downloads the files rows point at on Base44's CDN
into the media folder and repoints the rows (`--no-media` to skip); any that
fail are listed and keep their online URL.

---

## How the backend is wired

The pages were generated against Base44's SDK and import `keryx` from
`src/api/keryxClient.js`, a re-export of **`src/api/client.js`**. That facade
picks one of two backends with the same surface, so pages never know which
one they run on:

- **Desktop** (`src/api/backends/desktop.js`, when `window.keryxDesktop` exists):
  calls go over IPC (`electron/preload.cjs` → `electron/data-ipc.cjs`) to the
  store in the main process (`electron/db/store.cjs`, SQLite via `node:sqlite`).
  Writes broadcast change events to every window, which is what `subscribe()`
  listens to. `auth.me()` is the single local operator profile; there is no
  login. `UploadFile` copies the file into `media/`; the database stores
  `keryx-media://<file>` and the adapter hands pages
  `http://127.0.0.1:7700/media/<file>`. AI features reject with 501 (out of v1).
- **Web** (`src/api/backends/supabase.js`, in a plain browser): the table below.

Query semantics (filters, sort, paging) follow Base44 in both; the desktop
ones are pinned by `electron/db/store.test.cjs`.

| Surface (web build) | Backed by |
| --- | --- |
| `entities.<Name>.list / filter / get / create / update / delete / bulkCreate / bulkUpdate` | PostgREST on `public.<snake_case_name>` |
| `entities.<Name>.subscribe(cb)` | Realtime `postgres_changes`, mapped to `{ type: 'create'\|'update'\|'delete', data, id }` |
| `entities.User.*` | `public.profile` (one row per `auth.users` row, created by trigger) |
| `auth.*` (login, register + OTP, OAuth, reset, `me()`) | Supabase Auth; `me()` merges the auth user with its profile row |
| `integrations.Core.UploadFile` | Storage bucket `media` (public read) |
| `integrations.Core.InvokeLLM` | Edge Function `invoke-llm` → Anthropic API with web search/fetch |
| `integrations.Core.SendEmail / SendSMS / GenerateImage / ExtractDataFromUploadedFile` | not implemented; reject with a message (no page uses them) |

Projection windows on the **same machine** do not go through the backend —
`src/lib/projectionWindow.js` holds a single named `window.open` target and
`postMessage`s slides to it. Remote screens (TVs, tablets) go through the
realtime tables.

### Security posture (web build)

The desktop app has no network surface beyond its loopback server. For the
Supabase project: the original app was effectively public: projection screens run on TVs with
no login. The RLS policies in `supabase/migrations/20261006000002_profile_rls.sql`
reproduce that:

- **Signed-in users** (`authenticated`): full read/write on every content table.
  There is no admin role yet; `profile.role` exists but nothing checks it.
- **Anonymous** (`anon`): read on every content table, plus the four writes
  the unattended screens perform — `projection_device` update (heartbeat),
  `video_sync` update, `live_session` update, `chat_message` insert.
- **Profiles:** a user can read and update only their own row.
- **Edge Functions** require a valid session JWT.

This is the loosest part of the system. Before exposing the project widely,
replace the anonymous writes with per-device tokens and decide whether the
song/service library should really be world-readable.

---

## Layout

```
electron/
  main.cjs              app lifecycle, windows, data folder, loopback server
  preload.cjs           window.keryxDesktop (db, media, config)
  data-ipc.cjs          IPC between windows and the store; change broadcast
  server.cjs            serves dist/ and media/ on 127.0.0.1:7700 (with Range)
  smoke.cjs             in-app checks for npm run desktop:smoke
  db/                   store.cjs, schema.json (generated), tests
supabase/
  migrations/           schema, RLS, realtime publication, storage bucket (applied)
  functions/
    invoke-llm/         InvokeLLM on the Anthropic API
    delete-account/     self-service account deletion (needs the service role)
base44/entities/*.jsonc 31 JSON Schemas the tables were generated from; readable field docs
scripts/
  migrate-from-base44.mjs
src/
  api/client.js         facade choosing the desktop or Supabase backend (api/backends/)
  api/keryxClient.js    re-export of the above as `keryx`
  pages/                26 route components
  pages.config.js       the 9 layout-wrapped pages; the rest are routed in App.jsx
  components/
    ui/                 shadcn/ui primitives — generated, not linted, avoid editing
    projection/         operator-side panels: song/lyric/video/theme/device control
    bible/ bible-school/ service/ songs/ media/ communication/ banners/ worship/ layout/
  hooks/                device heartbeat, live-session channel, offline cache, online status
  lib/                  auth context, projection window bridge, query client
  utils/                chord transpose, Bible reflow, song sections, PDF export, YouTube
```

### Routing

Two tiers, both in `src/App.jsx`:

- **Public** (outside the auth gate): `/login`, `/register`, `/forgot-password`,
  `/reset-password`.
- **Everything else** goes through `AuthenticatedApp`, which wraps pages in
  `Layout`. Projection-target pages (`/Projection`, `/BannerProjection`,
  `/StageView`, `/DeviceView`, `/LyricProjection`, `/VideoProjection`,
  `/BibleMaterialProjection`, `/AnnouncementCarousel`) are routed bare,
  without `Layout` — they are meant to fill a second screen. So is
  `/Console`, the operator console (phase 6): it has its own top bar and is
  built on the design system in `docs/design-system/`.

`createPageUrl(name)` (`src/utils/index.ts`) is just `'/' + name`, so page keys
and URL paths are the same string. Note that **`/Home` is the songs library**
("Músicas"); `/Services` ("Cultos") is the service planner.

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
| Projection | `projection_state`, `projection_device`, `projection_scene`, `projection_theme`, `banner_template` |
| Live sync | `live_session`, `lyric_sync`, `video_sync`, `video_control`, `bible_projection_sync` |
| Media | `media`, `communication_video` |
| Engagement | `chat_message`, `alert_message`, `poll`, `quiz`, `raffle` |
| Users | `profile` (theme colors, logo, background, device mode, role) |

---

## Known gaps

1. **Dashboard setup above is not done yet** — the LLM features and OAuth
   buttons fail until it is.
2. **Security posture is permissive** (see above).
3. **`ProtectedRoute` is unused.** `src/components/ProtectedRoute.jsx` exists
   but nothing imports it; the gate lives inline in `AuthenticatedApp`.
4. **No tests.** The verification loop is `npm run lint`, `npm run build`,
   then look at the page.
5. **No type layer.** Everything is untyped `.jsx`. `supabase gen types` is
   the way in.
6. **Auth pages are in English** while the rest of the app is Portuguese —
   they came from the Base44 template.
7. **Hardcoded logo URL** at `src/Layout.jsx:8` points at one church's asset
   on Base44's CDN.
8. **~90 advisory lint warnings**, mostly unused locals and
   `react-hooks/exhaustive-deps`.
9. **Four large pages** (`Home`, `Projection`, `Settings`, `Services`, each
   ~750 lines) mix data access, projection control and presentation.
