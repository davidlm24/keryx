# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui, packaged as an
offline-first Electron desktop app with a local SQLite store. Desktop only:
the web build on Supabase was retired (2026-10-08, like Holyrics or
ProPresenter, the app is the program on the church computer); `supabase/` is
kept, unused, for a future cloud sync or backup. Plan:
`docs/desktop-architecture.md`. Read `README.md` first — it covers the
stack, how to run it, the backend wiring, the data model and the known gaps.

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
  `electron/db/schema.json`; the local store adds new columns on next launch).
  `npm test` fails if schema.json and the jsonc drift apart.
- **Data access goes through `keryx.entities.*` inside TanStack Query.**
  `src/api/client.js` is a facade with one surface over the desktop backend
  (`backends/desktop.js`: IPC to `electron/db/store.cjs`), also used by
  network screens over HTTP (`backends/network.js`). A plain browser gets an
  inert backend and `DesktopOnly` — except under `npm run dev`, where the
  preview bridge (`backends/preview.js`) stands in for the desktop one
  (`keryx.isPreview`). Pages never talk to SQLite or IPC
  directly. Query semantics follow Base44 and are pinned by
  `electron/db/store.test.cjs`; change them there first.
- **What is on screen is the live state** (`shared/live-state.mjs`, held by
  `electron/live.cjs`). The console changes it only through
  `src/lib/projection.js` (its stages, `src/lib/console/stage.js`); outputs
  read it with `useLiveState()`. A new kind of content is a new op in
  `shared/live-state.mjs` with a test there, not a new sync table or
  postMessage type (both are gone). Every output renders it; outputs can be
  opened by the main process (`keryx:displays:open`, "Abrir ao iniciar").
  Avisos (CommunicationVideo) are the `communication` layer, drawn in full
  by `ScreenRenderer` (look, background, logo, chime; arithmetic in
  `src/lib/console/notice.js`); outputs move a "Tocar todos" sequence on
  with `useNoticeAdvance`. Escola bíblica materials go on air as ordinary
  stages (`stageFromMaterial`; a quiz is question + answer slides; teacher
  notes ride in `content.stage`, never on the projector). What a song or
  passage puts on screen is `src/lib/console/content.js`; the default theme
  dresses one with no look of its own when it is sent (`stamp` in
  useConsole.js, `withThemeDefaults` in themes.js), never what is on air. A song can
  also follow one theme of its own (`Song.theme_id`: the whole look, no
  default theme) and each labelled part of its lyrics another
  (`Song.part_themes`, keyed by the part's name in lower case): resolved when
  the stage is built (`songTheme.js`, so `stageFromSong`/`songContent` take
  the themes); the part's look rides in `slide.style`, which the renderer
  lays over the content's, and an output with its own theme drops it.

- **The app is the operator console, `/Console`** (`src/pages/Console.jsx`,
  `src/components/console/`); `/` and any unknown path go there. It is built
  on the design system in `docs/design-system/` (tokens and `kx-` classes,
  imported as `@ds/…`; read `docs/design-system.md` before touching its
  look). One screen, always live (no steps; Verificar is an overlay from the
  Saídas popover; Configurações, `settings/SettingsView`, is a window over
  whatever is on screen, its own `cfg` state, `?config=`; its sections are
  `src/lib/console/settings.js`, old ids resolve through `resolveSection`;
  its search indexes every row in `settingsSearch.js` — a new `FormRow k`
  goes in the index, or `npm test` fails).
  Everything else
  is a view inside it, one at a time (the `view` state in Console.jsx,
  `?song=`, `?planner=`, `?media=`, `?notice=`, `?school=`, `?reports=`):
  the song editor (`SongEditor.jsx`), the
  planner (`ServicePlanner.jsx`), the media library (`MediaView.jsx`), the
  aviso editor (`NoticeEditor.jsx`), the Escola bíblica (`SchoolView.jsx`;
  it projects through the console's Prévia/Programa and every live key
  works there) and Relatórios (`ReportsView.jsx`). The Bíblia is the
  console's second environment (`BibleEnv.jsx`: Ler, Buscar, Comparar,
  notes; three columns). Where columns and stacked cards go is the
  operator's (Ver › Editar layout): `layout.order`/`layout.stacks`, turned
  into columns and splitters by `src/lib/console/arrange.js` (tested) —
  render from `cultoColumns`/`bibleColumns` + `withSplits`, never place a
  column by hand in `Console.jsx`. Setlist sections are ServiceItems of type `SECTION`: headers that
  take no time and never go on air — use `playableItems`/`plan` from
  `src/lib/console/setlist.js`. A click prepares a *stage* in the Prévia;
  Enter, a **double click** or "Enviar ao ar" sends it (user decision
  2026-10-07; dragging a library row onto the Prévia prepares, onto the
  Programa sends, onto the Setlist adds a ServiceItem). There is no
  Ensaio: rehearsing is **"Travar telas"** (Saídas), the live state's
  `locked` flag, enforced in `applyOp` (status 423) so every sender
  obeys: while locked nothing new goes on air, anything can come off (Tela
  preta, Logo, Limpar, Esc, the outputs' `*.advance`). The top bar's
  service clock counts from the service's scheduled time (`serviceClock`
  in `src/lib/console/timeline.js`; never a default hour). Keys follow Holyrics: ←/→ move what is on air, ↑/↓ move the
  selection (green), Enter or a double click projects it; one Bible verse
  goes out as its whole chapter so the arrows keep walking it. With no
  service chosen, the first item added creates "Setlist de dd/mm" (a draft
  Service). Screens and the console's monitors render with
  `src/components/screen/ScreenRenderer.jsx` — one component, sized in
  container units — so a preview is the output; the Programa monitor plays
  videos muted (`motion`). Keys go through `src/lib/console/keys.js` (with
  a test); a mouse click must not leave focus on a control, Esc closes the
  topmost thing open (`escapeTarget`: a right-click menu, a popover, then
  Configurações, then the Camadas drawer; views defer while a `.scrim` is
  up) and with nothing
  open ends at once (music on the audio channel keeps playing); its toast offers
  Desfazer, which puts back what was on air (`undoEndOps` in
  `src/lib/console/restore.js`). The rundown is called
  **"Setlist"** in the UI. Output windows are never background (occlusion
  tracking off in `electron/main.cjs`): don't reintroduce per-element audio
  taps — the level meters read the system loopback in the console.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. Every write
  reaches every window with the whole row, deletes included.
- **No login.** `auth.me()` is one local operator profile (`entities.User`
  maps to it whatever id is passed). Don't add features that assume
  accounts; if cloud sync comes, its sign-in lives in Configurações and is
  only for that. The profile and the church's preferences are read through
  `src/hooks/useUser.js` (`useUser`, `usePrefs`, `getPrefs`, `updateUser`;
  null = default, `src/lib/prefs/schema.js`): a preference that should ride
  a backup is a User field, never localStorage (that is for this computer:
  window sizes, the arrangement).
- **Bible text goes through `src/lib/bibleText.js`** (`getChapter`,
  `getPassage`, `searchVerses`, `searchBible` — the console's word search,
  query rules in `src/lib/bibleSearch.js`): local database, then
  abibliadigital. The edition the operator chose is read with `readChapter`
  (`editionPlan` in `bibleBooks.js`): installed, else online (ARA with NVI
  installed included), and a chapter that cannot be fetched comes from an
  installed edition, said so. Never ask an AI for scripture, and don't fetch verses
  anywhere else. References parse with `parseReference` in
  `src/lib/bibleBooks.js`. Verse marks inside a slide's text are read with
  `src/lib/verseMarks.js` (numbers in sequence only). Favourites and notes
  are `BibleNote` rows (`useBibleNotes`). Never bundle Bible text: the
  editions are copyrighted; churches install them (`electron/bible.cjs`).
- **Files shipped with the app** (backgrounds, default logo) are in
  `resources/` and served as `/media/bundled/…`; reference them through
  `src/lib/backgrounds.js`, not by hard-coded URL.
- **Fonts ship with the app, never from the internet.** Geist (the
  console's family and every theme's "Sem serifa", `FONT_MAP.sans`) is a
  woff2 in `src/assets/fonts/` with its `@font-face` in `src/fonts.css`, so
  the console, output windows and network screens break lines alike. Don't
  add a web-font `@import`; a new font needs its file and license (OFL in
  `public/fonts/`). `src/lib/fonts.test.mjs` checks this.
- **`window.keryxDesktop.*` returns a fresh object on every access**
  (contextBridge). In a component, read it once into a ref; using it as an
  effect or callback dependency directly re-runs the effect on every render.
- **Never replace or delete the live database file from the running app**
  (Windows locks it). Importing stages a zip and swaps it in at the next
  launch, before the store opens (`archive.cjs`); backups use `VACUUM INTO`.
  Anything that deletes user data moves it aside instead. Tables nothing
  writes any more (ProjectionDevice, ProjectionScene, AlertMessage,
  BibleProjectionSync, BannerTemplate, ChatMessage) are kept: user data.
- **Network screens** (`electron/lan.cjs`) see only the pages in
  `NETWORK_SCREENS` and only read the database. A page added there must
  work from the database and the live state alone. Each screen says which
  page it shows when it connects (`/api/events?screen=`); the console lists
  the screens connected right now from that (`useOutputs`). Links and QR
  codes meant for other devices come from the network info's `urls`
  (Configurações › Telas na rede), never `window.location.origin` (that is
  127.0.0.1 on desktop). `keryx.isNetworkScreen` is true in such a browser.
- **Media URLs:** the store keeps `keryx-media://<file>`; pages get
  `http://127.0.0.1:7700/media/<file>` from the adapter. Never write the http
  form into the database by other means, and keep checks like
  `startsWith("http")` working.

## Commands

```bash
npm run desktop:dev    # the desktop app on the Vite dev server (hot reload, F12 devtools)
npm test               # store query semantics, live state, console helpers, schema drift
npm run lint           # gates on errors only; the warnings are advisory
npm run build
npm run desktop:smoke  # build + run the app on a temp data dir + in-app checks
KERYX_SMOKE=1 npm run desktop:dev   # same checks + the renderer adapter end to end
npm run dist           # Windows installer in release/ (unsigned)
npm run db:schema      # after editing base44/entities/*.jsonc
npm run db:import      # one-off Base44 -> local import; needs the user's token
npm run dev            # dev only: the console in a plain browser on sample data (the side-panel preview)
```

Smoke runs use a free port and a temp data folder, so they never collide with a KERYX that is open. In Git Bash set `KERYX_START_PATH=Console?config=telas` (no leading slash; `/Console` is rewritten to a Windows path), and `KERYX_SCREENSHOT=file.png` with `KERYX_SCREENSHOT_TEXT="some heading"` to capture a page; `KERYX_CONSOLE_SHOT=file.png` saves the console check's screenshots.

The smoke's audio-meter check (`metersFollowVolume`) hears every sound of the computer, and the focus checks (`focusKept`, `autoFocusKept`, `outputKeys.focus`, and `splitterKeys` when its arrow never arrived) need KERYX to be the program in front. When someone uses the PC during a run they do not fail: another program in front (no KERYX window focused) or another program playing (meters up, no KERYX window audible) marks them inconclusive, listed in `console.inconclusive`, and the run can still pass. An output holding the focus, or a KERYX window still audible after the mute, fails. The console page itself is told it has focus (CDP focus emulation), so fields that save on blur work regardless.

Outputs (projector, stage, ...) render the live state, so either the console (`window.open`) or the main process (`outputs.open`, `keryx:displays:open`, "Abrir ao iniciar") can open them; `electron/outputs*.cjs` places and tracks them. Each renderer output (Projeção, Letras, Vídeo, Comunicação) has its own settings, one `OutputPref` row per page path shared by the window and network screens showing that page (Configurações › Telas e saídas › Ajustes): pages draw through `OutputScreen` (`src/lib/outputPrefs.js`, tested); no row means the output exactly as before. **Mostrar** (`hidden_kinds`) leaves kinds out of one output (Letras, Bíblia, Texto, Imagens e vídeos, Relógio e timer, Avisos, Aviso rápido; `hideKinds`): the layer goes, the output shows what is under it or its idle look, and a song's playback track keeps playing (`track`); the console's Prévia says when the output it previews hides the prepared kind (`stageHidden`). A new kind of content gets its entry in `SHOW_KINDS`. **Exportar / Importar ajustes das saídas** (Telas e saídas) is one JSON file with every output's placement and every page's `OutputPref` settings (`src/lib/outputsFile.js`, tested; the theme travels by name): the main process only saves and reads the file (`keryx:displays:export-file` / `import-file`, 1 MB at most); the console checks it, says what will not come out the same on this computer, and applies it through `displays.set` and `OutputPref` (rows updated or created, never deleted). A new setting on `OutputPref` goes in that file too. **Timers prontos** (Avisos › Ferramentas › Timer): 5, 10, 15, 30 and 60 min always, plus the church's own (`TimerPreset` rows, `src/lib/console/timerPresets.js`); a click prepares the timer, a double click sends it, and a timer on air takes or gives time with `tool.adjust` (−1, +1, +5 min; refused while the screens are locked). **Multiview** (the Programa header, or its right-click menu) turns the Programa monitor into four outputs at once, each what is on air as that output shows it, with its own `OutputPref` (Palco and Pastor in their own layouts), and where it is on screen now from the output health rows; a quadrant's label picks its output (`src/lib/console/multiview.js`, tested; saved with the layout as `multiview`/`mvTiles`). Only the Projeção quadrant (else Vídeo) plays videos.

The desktop app's real data is in `%APPDATA%\KERYX` — never point a test at
it; smoke runs use a temp `KERYX_DATA_DIR`.

Secrets (Base44 tokens for the one-off import) are the user's to set in their
shell. Don't ask for their values and don't write them into tracked files.

## Verifying a change

While working, the loop is `npm test`, `npm run lint`, `npm run build`
and the browser preview — none of them open windows. **The desktop smoke
(`npm run desktop:smoke`, or `KERYX_SMOKE=1 npm run desktop:dev` when
touching `src/api`) runs once, at the end of a task or before a release,
and the user is told right before it starts:** it opens real projection
windows on their monitors, takes focus and plays a test tone for ~5 minutes
(user decision 2026-10-08). The quick look is the browser preview (`npm run dev`, the
side-panel "keryx-ui"): the real store and live engine on sample data in a
temp folder (`scripts/preview/`, `src/api/backends/preview.js`,
docs/desktop-architecture.md 8a); outputs open as tabs from Saídas. The
smoke and `desktop:dev` remain the truth for outputs, audio and displays. `KERYX_SCREENSHOT=<file.png>` makes a smoke run save a screenshot.
Pure logic lives in tested modules (`src/lib/**`, `shared/`); the UI is
covered by the smoke's in-app checks.

Projection features need two windows to verify: the console drives the
outputs through the live state, on this computer (output windows) and on the
network (screens fed by `/api/events`). A change that looks right in one
window may not be in the other.

## Releasing (one session at a time)

Installed copies read whatever is "Latest" in
`comunidadegerar/keryx-releases`. Two sessions publishing the same version
(or one publish that dies half-way) leaves a release the updater cannot use,
so a release follows these rules. The steps and commands are in README ›
"Releasing a new version".

- **Only the release session releases.** That is the session the user asks
  in chat to publish a given version ("publica a 0.2.15"): the user picks it,
  release by release (user decision, 2026-10-12; before, one fixed session,
  "Plan KERYX phase 6"). It also writes that version's note
  (`docs/release-notes/<version>.md`) before the build. Every other session
  ships features as normal PRs but never changes `version` in
  `package.json`, never opens a `release/<version>` branch or PR, and never
  runs `electron-builder --publish`. A session that sees a claim by another
  one (below) does not release: it tells the user. The rules below are the
  release session's.
- **Claim the version first.** The next patch after the latest published
  release is taken only when `release/<version>` is on origin with the
  version bump. Before pushing it, look for a claim: a `release/*` branch on
  origin or in any worktree, an open release PR, or a release already
  published. If one exists, do not release: tell the user, who picks the
  session.
- **Publish only when the user asks, once, from the release branch.** A publish
  that fails or is interrupted is never re-run blindly: look at the release
  first.
- **A publish makes a draft, never a public release** (`releaseType: draft`).
  `node scripts/release-check.cjs <version> --publish` checks it (the
  installer, its `.blockmap` and `latest.yml` are there, `latest.yml` names
  this version, the installer has the sha512 and size it names) and only then
  makes it public as Latest. Never make a draft public by any other route.
- **Repair in this order:** installer, blockmap, `latest.yml` last. Rebuilding
  changes the installer's hash, so after any rebuild `latest.yml` is written
  from the installer actually uploaded; an older `latest.yml` is never
  uploaded. A published version is never reused or deleted: fix forward with
  the next patch.
- The `comunidadegerar` token is for the release the user asked for, and
  nothing else.

## Watch out for

- **Column names are the entity field names verbatim**, including camelCase
  (`"serviceId"`, `"startedAt"`). Quote them in SQL.
- **Ids are text, not uuid.** Imported Base44 rows keep 24-hex ids; new rows
  get a uuid string. Never cast `id` to uuid.
- **Unknown fields are dropped on write** (logged once per field in the main
  process), not rejected. Unknown fields in a filter or sort are errors.
- **Routes are in `src/App.jsx` only:** `/Console` and the output pages
  (`/Projection`, `/LyricProjection`, `/StageView`, `/VideoProjection`,
  `/CommunicationProjection`, `/PastorView`, `/StreamView`), the same output
  pages for network screens. A new output page goes there, in
  `electron/outputs.cjs` and, if screens on the network may open it, in
  `NETWORK_SCREENS`, and in a group of `GROUPS` (`src/lib/console/outputs.js`:
  Público, Palco, Transmissão). `/StreamView` (Transmissão) is network only:
  an OBS Browser Source, a transparent lower third, text only
  (`src/lib/streamCaption.js`); it is not an output window.
