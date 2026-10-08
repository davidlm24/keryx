# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui, packaged as an
offline-first Electron desktop app with a local SQLite store; the same UI in a
plain browser runs on Supabase instead. Plan: `docs/desktop-architecture.md`.
Read `README.md` first — it covers the stack, how to run it, the backend
wiring, the data model and the known gaps.

## Ground rules

- **UI language is Brazilian Portuguese (pt-BR).** All user-facing strings,
  labels and toasts are pt-BR (tela, salvar, arquivo, excluir, celular,
  cronômetro, usuário) — the church is Brazilian; do not use pt-PT forms
  (ecrã, guardar, ficheiro, eliminar, telemóvel). Do not introduce English UI
  copy. Code identifiers and comments are English.
- **`src/components/ui/` is generated shadcn/ui.** It is excluded from lint and
  from editor type checking. Don't hand-edit it; add components with the
  shadcn CLI (`components.json` is configured) or wrap them instead.
- **Fields are defined in `base44/entities/*.jsonc`.** Adding or changing a
  field: edit the jsonc, run `npm run db:schema` (regenerates
  `electron/db/schema.json`; the local store adds new columns on next launch),
  and for the web build add a migration in `supabase/migrations/`. `npm test`
  fails if schema.json and the jsonc drift apart.
- **Data access goes through `keryx.entities.*` inside TanStack Query.**
  `src/api/client.js` is a facade over two backends with the same surface:
  `backends/desktop.js` (IPC to `electron/db/store.cjs`) and
  `backends/supabase.js` (web build). A new method goes into both; pages never
  talk to SQLite, IPC or Supabase directly. Query semantics follow Base44 and
  are pinned by `electron/db/store.test.cjs`; change them there first.
- **What is on screen is the live state** (`shared/live-state.mjs`, held by
  `electron/live.cjs`). Operator pages change it only through
  `src/lib/projection.js`; outputs read it with `useLiveState()`. A new kind
  of content is a new op in `shared/live-state.mjs` with a test there, not a
  new sync table or postMessage type. Every output renders it; outputs can be
  opened by the main process (`keryx:displays:open`, "Abrir ao iniciar").
  Avisos (CommunicationVideo) are the `communication` layer, drawn in full
  by `ScreenRenderer` (look, background, logo, chime; arithmetic in
  `src/lib/console/notice.js`); outputs move a "Tocar todos" sequence on
  with `useNoticeAdvance`. Today's Ferramentas, Painel do operador alerts,
  BibleSchool and the web build's Comunicação page still use their old paths (postMessage, `AlertMessage`,
  `BibleProjectionSync`) as fallbacks until the redesign replaces them; don't
  extend those. Going live from Músicas/Cultos goes through
  `useProjectionControl()`.
- **The operator console is `/Console`** (`src/pages/Console.jsx`,
  `src/components/console/`), built on the design system in
  `docs/design-system/` (tokens and `kx-` classes, imported as `@ds/…`; read
  `docs/design-system.md` before touching its look). One screen, always
  live (no steps; Verificar is an overlay from the Saídas popover;
  Configurações is a view inside the console, `src/components/console/settings/`,
  and `/Settings` redirects there on desktop; so is the song editor,
  `SongEditor.jsx`, and `/Home` redirects to the console on desktop; so is
  the service planner, `ServicePlanner.jsx`, and `/Services` redirects to
  `/Console?planner=…`; so are the media library, `MediaView.jsx`
  (`/Media` → `?media=1`), and the aviso editor, `NoticeEditor.jsx`
  (`/Communication` → Biblioteca › Avisos). One view at a time: the
  `view` state in Console.jsx). Setlist sections are ServiceItems of type
  `SECTION`: headers that take no time and never go on air — use
  `playableItems`/`plan` from `src/lib/console/setlist.js`. A click
  prepares a *stage* in the Prévia (`src/lib/console/stage.js`); Enter, a
  **double click** or "Enviar ao ar" sends it (user decision 2026-10-07;
  dragging a library row onto the Prévia prepares, onto the Programa sends,
  onto the Setlist adds a ServiceItem). Ensaio applies operations to a
  local copy with `applyOp` (`useConsole`), never to the main process.
  Keys follow Holyrics: ←/→ move what is on air, ↑/↓ move the selection
  (green), Enter or a double click projects it; one Bible verse goes out as
  its whole chapter so the arrows keep walking it. With no service chosen,
  the first item added creates "Setlist de dd/mm" (a draft Service).
  Screens and the console's monitors render with
  `src/components/screen/ScreenRenderer.jsx` — one component, sized in
  container units — so a preview is the output; the Programa monitor plays
  videos muted (`motion`). Keys go through `src/lib/console/keys.js` (with
  a test); a mouse click must not leave focus on a control, Esc ends at
  once (music on the audio channel keeps playing). The rundown is called
  **"Setlist"** in the UI. Output windows are never background (occlusion
  tracking off in `electron/main.cjs`): don't reintroduce per-element audio
  taps — the level meters read the system loopback in the console. The old
  pages are being folded into the console: `docs/migration-inventory.md`
  says where each function goes; don't add features to the old pages.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. On desktop every
  write reaches every window with the whole row, deletes included.
- **No login on desktop.** `auth.me()` is one local operator profile
  (`entities.User` maps to it whatever id is passed). Don't add features that
  assume accounts; cloud sync is a later phase.
- **Bible text goes through `src/lib/bibleText.js`** (`getChapter`,
  `getPassage`, `searchVerses`, `searchBible` — the console's word search,
  query rules in `src/lib/bibleSearch.js`): local database, then abibliadigital, then
  the AI on the web build only. Don't fetch verses or call the AI for
  scripture anywhere else. References parse with `parseReference` in
  `src/lib/bibleBooks.js`. Verse marks inside a slide's text are read with
  `src/lib/verseMarks.js` (numbers in sequence only). Favourites and notes
  are `BibleNote` rows (`useBibleNotes`). Never bundle Bible text: the editions are
  copyrighted; churches install them (`electron/bible.cjs`).
- **Files shipped with the app** (backgrounds, default logo) are in
  `resources/` and served as `/media/bundled/…`; reference them through
  `src/lib/backgrounds.js`, not by hard-coded URL.
- **`window.keryxDesktop.*` returns a fresh object on every access**
  (contextBridge). In a component, read it once into a ref; using it as an
  effect or callback dependency directly re-runs the effect on every render.
- **Never replace or delete the live database file from the running app**
  (Windows locks it). Importing stages a zip and swaps it in at the next
  launch, before the store opens (`archive.cjs`); backups use `VACUUM INTO`.
  Anything that deletes user data moves it aside instead.
- **Network screens** (`electron/lan.cjs`) see only the pages in
  `NETWORK_SCREENS` and may write only what `SCREEN_WRITES` lists. A page added
  there must work from the database alone (no `window.opener`). Links and QR
  codes meant for other devices come from `useLanBaseUrl()`, never
  `window.location.origin` (that is 127.0.0.1 on desktop).
  `keryx.isNetworkScreen` is true in such a browser.
- **Media URLs:** the store keeps `keryx-media://<file>`; pages get
  `http://127.0.0.1:7700/media/<file>` from the adapter. Never write the http
  form into the database by other means, and keep checks like
  `startsWith("http")` working.

## Commands

```bash
npm run desktop:dev    # the desktop app on the Vite dev server (hot reload, F12 devtools)
npm test               # store query semantics + schema drift (node --test)
npm run lint           # gates on errors only; ~90 warnings are advisory
npm run build
npm run desktop:smoke  # build + run the app on a temp data dir + in-app checks
KERYX_SMOKE=1 npm run desktop:dev   # same checks + the renderer adapter end to end
npm run dist           # Windows installer in release/ (unsigned)
npm run db:schema      # after editing base44/entities/*.jsonc
npm run db:import      # one-off Base44 -> local import; needs the user's token
npm run dev            # web build in a browser, against Supabase
```

Smoke runs use a free port and a temp data folder, so they never collide with a KERYX that is open. In Git Bash set `KERYX_START_PATH=Settings` (no leading slash; `/Settings` is rewritten to a Windows path), and `KERYX_SCREENSHOT=file.png` with `KERYX_SCREENSHOT_TEXT="some heading"` to capture a page.

Outputs (projector, stage, ...) render the live state, so either a page (`window.open`) or the main process (`outputs.open`, `keryx:displays:open`, "Abrir ao iniciar") can open them; `electron/outputs*.cjs` places and tracks them. Only the old Ferramentas page (and the web build's Comunicação page) still need a projector they opened themselves (postMessage).

The desktop app's real data is in `%APPDATA%\KERYX` — never point a test at
it; smoke runs use a temp `KERYX_DATA_DIR`.

Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Base44 tokens) are
the user's to set — in the Supabase dashboard or their shell. Don't ask for
their values and don't write them into tracked files.

## Verifying a change

The loop is: `npm test`, `npm run lint`, `npm run desktop:smoke` (or
`KERYX_SMOKE=1 npm run desktop:dev` when touching `src/api`), then look at
the page. `KERYX_SCREENSHOT=<file.png>` makes a smoke run save a screenshot.
The page tests cover only the store; UI has no automated tests.

Projection features need two windows to verify: the operator page drives a
second window opened via `src/lib/projectionWindow.js` (same machine,
`postMessage`) or a remote screen via the live-sync tables (network, through
realtime). A change that looks right in one window may not be in the other.

## Watch out for

- **`/Home` is the songs library ("Músicas"), not a dashboard.** `/Services`
  ("Cultos") is the service planner. The songs page groups by artist, so a
  freshly added song shows as an artist entry, not a title.
- **Routes are declared in two places.** `src/pages.config.js` holds the nine
  pages that get the app `Layout`; the rest — including every bare projection
  target — are routed explicitly in `src/App.jsx`. Adding a page means touching
  one or the other deliberately, not both.
- **Public auth routes must stay outside `AuthenticatedApp`.** That component
  redirects to `/login` on auth failure, so a login route nested inside it
  loops.
- `createPageUrl(name)` is just `'/' + name` — page keys and paths are the same
  string, and they are capitalized (`/Bible`, not `/bible`), unlike the
  lowercase public auth routes.
- **Column names are the entity field names verbatim**, including camelCase
  (`"serviceId"`, `"startedAt"`). Quote them in SQL.
- **Ids are text, not uuid.** Imported Base44 rows keep 24-hex ids; new rows
  get a uuid string. Never cast `id` to uuid.
- **Unknown fields are dropped on write** (logged once per field in the main
  process), not rejected. Unknown fields in a filter or sort are errors.
