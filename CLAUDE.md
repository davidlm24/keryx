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
- **Copy rules (owner 2026-10-13).** One word per concept, everywhere:
  Visual do culto (fundo+temas) / Fundo do culto (só o fundo) / Fundo padrão
  (o da igreja); "O mesmo das músicas" (herdar) e "Estilo de fábrica" (sem
  tema); Excluir = apaga (sempre via `useConfirm`/ConfirmDialog; the
  Editor window alone keeps the two-click, it has no provider), Tirar =
  sai do lugar, Remover só em "Remover saída"; Travar/Destravar; Tela =
  monitor físico e telas na rede, Saída = janela/página (aberta/fechada;
  rede = conectada/desconectada); Pôr na prévia / Enviar ao ar; Fixar no
  console; Exemplo (nunca "amostra"); posições Alto/Meio/Baixo e
  Esq./Centro/Dir.; "Do computador…"; Aviso rápido; Atalhos; "Instalar e
  reiniciar"; Ver › "Editar disposição" (o arranjo do console — "layout" é
  das telas). Heading hierarchy: the page title is the Panel's header; a
  listhead is a smaller sub-title (its "· hint" never in caps, console.css)
  that NEVER repeats the page title, only where a section has 2+ groups;
  hints must not restate the row's own options.
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
  **The Fundo layer is the screen's background** (2026-10-12): an item's
  own background (the song's, its theme's, the default theme's) rides in
  `args.fundo` and goes to the Fundo layer when it is sent —
  `background.set` before `content.show`, `fundoOps` in
  `src/lib/console/backgroundSpec.js`, used by `send` and the Prévia — so
  it stays after Esc; only a part theme's picture stays in `slide.style`.
  A picture's dim, blur, fit and position are its own settings
  (BackgroundPref, edited in the library; `backgroundLook`): they fill the
  Fundo when it goes on air and the Fundo on air follows when they change
  (`useConsole`); Camadas › Fundo has no sliders of its own (2026-10-13). The
  Prévia and other still previews draw the text without its transition
  (`Content still`) and are built with a time fixed per stage, never the
  ticking clock (it replayed the transition every second).
  Camadas' padlock on the Fundo is the live state's (`layers.lock`,
  `lockedLayers`; refuses `background.set`/`.clear` from anyone, and the
  renderer leaves a song's own picture out). A background is one spec
  everywhere, `{ kind: image|video|generator|color, value, gen?, dim?, blur?, fit? }`
  (`bgSpec` reads `Song.background`/`ProjectionTheme.background` and the
  old `background_image`/`background_generator`; `bgFields` writes both).
  **Every background or theme picker opens the library**
  (`library/BackgroundLibrary.jsx`: Temas · Imagens · Vídeos · Gerados ·
  Cor; awaited with `useLibraryPicker()`, the chip `library/BgChip.jsx`);
  don't add a gallery of thumbnails to a form.
  **The background library is separate from the Mídia** (2026-10-13): files
  sent there are Media rows of category "background" (`isBackgroundMedia`),
  left out of `useLibrary().media` (Biblioteca, media library, editors) and
  listed by `useBackgrounds()` (plus Mídia pictures that already have a
  BackgroundPref); "Trazer da Mídia…" copies a Mídia row in. **A default
  theme per kind** (`themeForKind`, `THEME_KINDS`): Música (the theme marked
  padrão), Bíblia, Texto and Timer (`User.bible_theme_id`, `text_theme_id`,
  `timer_theme_id`; "" = Música's, "none" = factory), chosen in Temas ›
  Temas padrão; a timer takes its theme's font, colour and background
  (`withThemeDefaults` on `tool.show`, `fundoOps`), text items and Escola
  materials `inherit` like songs.
  Deleting from a right-click menu ("Excluir…": songs, media, avisos,
  themes) always asks first through `useConfirm()` (`ConfirmDialog.jsx`;
  Esc answers no, before anything else). The Prévia's width is the
  operator's (`layout.prevPct`, the splitter beside it; the Programa gives
  way, `--prev` in console.css); the Próximo sits beside it.
  **Temas are presets of the Fundo layer** (owner's decision 2026-10-13, as
  Holyrics' theme column; the Temas console card is gone — don't bring it
  back): Camadas › Fundo shows up to 6 pinned themes as small screens
  (`ThemeStrip.jsx`, `consoleThemes` in themes.js; `ProjectionTheme.pinned`,
  toggled by "Fixar no console" in the strip's menu, the library's Temas tab
  and Configurações › Temas; none pinned = the default + most recent).
  **A click makes it the theme in use** (the hybrid, 2026-10-13): it
  dresses the text on air (`applyThemeOnAir` in `themeActions.js`: text
  look + Fundo, padlock respected) AND everything sent afterwards
  (`withThemeInUse` in stamp; `c.themeId` is what Camadas calls "Tema: …"),
  until someone changes it — without writing the service's preset. The
  Visual do culto only seeds it (choosing the culto, or its Música theme
  changing); the menu's "Salvar no visual do culto" records it, "Seguir o
  culto" goes back, and the Fundo section has no quick-picture strip (the
  library is one button away). With nothing on air a click puts an example
  in the Prévia instead
  (`themeSampleStage`, `stage.theme`: sending it only applies the theme's
  background, never the example text), a double click
  (or the menu's Editar, or Configurações › Temas) edits it in the Editor
  de temas e layouts (its own window, `openEditor({ theme })`; the one-off
  ThemeStudio overlay from 2026-10-13 was folded into it — don't bring a
  second theme editor back),
  and "Salvar tema para a música" writes `Song.theme_id` for the song on air
  or in the Prévia. A Bible passage takes **the Bíblia's own theme**
  (`User.bible_theme_id`: "" = the songs' default, "none" = factory;
  `themeForKind` in themes.js, used by `stamp`), chosen in the Bíblia's Tema
  button or Configurações › Bíblia e músicas. The item's title over the
  slide is `style.title` (show/hide, Camadas › Texto principal › Título);
  unset, Aparência's `show_item_title` decides.
  **Fundo padrão** (owner's decision 2026-10-12): with nothing on air the
  screen shows the service's background (`Service.background`), else the
  church's (`User.default_background`; the old `standby_background` still
  counts; `User.weekday_backgrounds` is no longer read) — `defaultFundo` in
  `src/lib/console/defaultFundo.js`. **The look is the service's**
  (2026-10-13, `src/lib/console/serviceLook.js`): its background and its
  own theme per kind (`Service.kind_themes` { lyrics, bible, text, tool }),
  which `themeForKind` puts before the church's Temas padrão; edited in
  "Visual do culto…" (`library/LookDialog.jsx`, `useLookEditor()`: the Fundo
  layer's strip in Camadas — the right side owns the projection's look,
  2026-10-13; it left the Setlist's header — plus Planejar o culto and a
  template's "Visual…" in Configurações › Culto). With no service it is "Visual de hoje…" and the first choice
  starts the day's draft (`ensureService`), as in Holyrics. A template
  (`ServiceTemplate.background`/`kind_themes`) keeps the look: "Salvar como
  modelo" saves it, applying one fills what the service has not chosen
  (`lookForService`).
  The Programa's header has **Fundo do culto** (Fundo de hoje with no
  service; `pickServiceFundo` in Console.jsx): the library picks the
  service's wallpaper, saved as the Visual do culto's background (the
  day's draft starts if need be), and the Fundo padrão follows at once.
  The console keeps it
  in the live state (`background.default`, `defaultBackground`) and `clear`
  (Esc, from anyone) puts it on the Fundo unless the padlock holds it;
  Desfazer puts back the Fundo there was. It also goes on the Fundo when it
  changes with nothing on air (KERYX opens, a service is chosen). The idle
  screen is only Logo or Preto. In the library, Gerados shows the
  background big; opened for the Fundo on air (`live: true`, Camadas'
  Biblioteca… and Editar fundo…) "Ao vivo" sends each choice at once and
  Cancelar/Esc put back the Fundo there was. A right click on a Temas card
  offers Aplicar, Editar, Salvar para a música, Tornar padrão, Usar na Bíblia.

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
  notes). Where the modules go is the operator's: **each environment is a
  dock** (owner 2026-10-13, the "Disposição do console" prototype, model
  Livre) — never place a column by hand in `Console.jsx` or `BibleEnv.jsx`.
  The Bíblia's dock (`layout.bibleDock`, `env: "biblia"`; modules Versão e
  busca, Livros, Capítulos, Versículos, Texto, No ar — the first, the text
  and No ar never leave) starts as its three columns
  (`fromBibleArrangement`); BibleEnv builds the modules, Console.jsx keeps
  the dock. `src/lib/console/arrange.js` now only reads the old
  `order`/`stacks` saves. The culto's: a tree of splits and tab groups,
  `src/lib/console/dock.js` (tested), drawn by `Dock.jsx`, saved as
  `layout.dock` (per computer; null = the one the old columns make,
  `fromArrangement`, so an old save keeps its look). Every module is built
  apart from where it goes (`modulePanels` in Console.jsx: Biblioteca,
  Slides, Programa, `PreviaPanel`, the Painel de abas, Setlist, Camadas,
  `PlayerSlot`). Ver › Editar disposição: drag a module by its name to a
  side of another (splits) or its middle (tabs), a click on the name opens
  "Mover para…", × puts it in the tray (the edit banner). The Programa, the
  Prévia and the Setlist never go to the tray; the player rides under the
  Programa until it is placed (× sends it home). The tray is this
  computer's (owner 2026-10-13): Ver's and Configurações › Console's module
  switches move a module in or out of it (`uiLayout`/`setUiLayout` in
  Console.jsx); the church's old `console_hidden_modules` only seeds a
  console whose arrangement was never changed, and nothing writes it any
  more. Splits have one
  flexible child and fixed pixel sizes (`allocate`); what cannot fit side
  by side joins as tabs, a pair at a time, the Programa last (`fitDock`) —
  that replaced the width tiers' arrangements. A new module is an entry in
  dock.js `MODULES` and in `modulePanels`. **Disposições com nome**
  (`src/lib/console/dockPresets.js`, tested): the edit banner saves the dock
  as it is ("Salvar como…", "Salvar" over the one in use, "Excluir…" via
  useConfirm), Ver › Disposição switches (Padrão = the console's own, never
  in the list; "· alterada" when the dock differs from it), each
  environment its own (names unique within one; `presetsFor`); kept with
  the layout per computer (`dockPresets`; in use: `dockPreset`,
  `bibleDockPreset`). Padrão and the banner's Restaurar posições restore
  only the environment on screen (`restoreEnv`); "Restaurar disposição"
  keeps the list. **Four columns** are the
  default dock (the console audit,
  owner 2026-10-13, which replaced the two-band centre of #136/#138):
  Biblioteca and Slides are whole columns; the **centre** (`live`) is the
  Programa on top (CenterPanel: the monitor or the Multiview, and the
  player **always visible**, dimmed while idle) and below it one row that
  **ends at the centre's edge**: the Prévia panel (caption in its header
  like the Programa's; 44 % of the centre at first) with **Enviar ao ar
  inside it, right under the monitor**, then the **tabs panel**
  (`TabsPanel.jsx`); the **right column** (`rightW`) is **Camadas over the
  Setlist, full height** (Camadas 360 px high: the Setlist gets most of the
  column). Camadas in the tray is a drawer opened from the Programa's
  header. The old `order`/`stacks`/widths are only read to build the first
  dock (culto order lib, slides, live, side; stack side = camadas, roteiro). **The tabs panel and the Biblioteca end
  their tab row in a (+)** that lists every tab with a check mark
  (`TabsMenu` in Popovers.jsx, as Ver lists the modules): checked = shown,
  in the list's order, at least one always, "Restaurar abas padrão" at the
  bottom; saved per computer as `layout.tabs` (`src/lib/console/panelTabs.js`,
  tested; "Restaurar disposição" resets it). The panel's tabs reuse what
  exists, no projection logic of their own: **Notas** (the
  `ServiceItem.notes` of the item in the Prévia / on air, and the Escola
  bíblica teacher notes — these sit under Enviar ao ar when the Notas tab
  is not on screen), **Aviso rápido**, **Timers** (`QuickTools.jsx`; the
  defaults), **Ferramentas** and **Esteve no ar** (the "Voltar ao
  anterior" history). Where the panel shows the Aviso rápido or the
  Ferramentas, Biblioteca › Avisos leaves them out (`elsewhere`); the
  Biblioteca's search-row "+" stays "add content". **One gutter
  everywhere**: `.console` overrides `--gutter` to 6px and the rows and
  stacks use `gap: 0` — the splitter IS the gap, as in `.main` (two cards
  stacked without one keep the gutter as a margin); don't add a second gap
  beside a splitter. The old
  Próximo/Depois lines, the Setlist side card and the Biblioteca's compact
  Setlist tab are gone. Setlist sections are ServiceItems of type `SECTION`: headers that
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
  videos muted (`motion`). The player's eye ("Tirar o vídeo · o som
  continua", as in Holyrics) moves a video off the projector into the
  audio channel at the same second (`media.toAudio`; "Mostrar o vídeo" is
  `audio.toMedia`; `videoSwap` in `src/lib/console/player.js`, no
  YouTube). Keys go through `src/lib/console/keys.js` (with
  a test); a mouse click must not leave focus on a control, Esc closes the
  topmost thing open (`escapeTarget`: a right-click menu, the background library, a popover, then
  Configurações, then the Camadas drawer; views defer while a `.scrim` is
  up) and with nothing
  open ends at once (music on the audio channel keeps playing; the Fundo
  stays on screen, and the idle look shows only with no Fundo); its toast offers
  Desfazer, which puts back what was on air (`undoEndOps` in
  `src/lib/console/restore.js`). Camadas' eyes on Texto principal and Fundo
  hide the layer and keep it on air (`layers.hide`/`layers.show`,
  `hiddenLayers`, `layerHidden`; hiding works locked): the next send shows
  the text again, choosing a Fundo shows the Fundo again. The rundown is called
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
- **Fundos gerados** (2026-10-12): a background the screens compute, never
  a file — `background: { kind: "generator", value: <id>, gen: {...} }` in
  the live state. What the numbers are is `shared/generators.mjs`
  (`normalizeGenerator`, checked by `background.set` in the main process);
  the shaders (WebGL 1) and the presets are `src/lib/generators.js`, drawn
  by `src/components/screen/GeneratorBackground.jsx` inside the
  renderer's background (moving on an output and on the Programa monitor,
  one still frame elsewhere). A new generator is an entry in `GENERATORS`
  (its GLSL body leaves `v`), its id in `GENERATOR_IDS`, and a preset. The
  console edits it in Camadas › Fundo › Gerado (`GeneratorPanel.jsx`); a
  theme keeps one in `background_generator` (`themeBackgroundArgs`).
  **Áudio-reativo** (`gen.audio`): the console measures the PC's output
  with its meters (`useAudioFeed`) and sends the level ~20×/s over its own
  IPC channel (`keryx:audio-level`, relayed to the other windows; never
  the live state, never the network) into `src/lib/audioLevel.js`, which
  the canvas reads each frame (`u_audio`). Screens on the network draw the
  generator still-level.
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
  work from the database and the live state alone. The one thing on the
  network that changes what is on air is the **controle remoto**
  (`/Remote`, a phone): off by default, behind its own code (never
  optional, separate from the screens' PIN), it posts commands from a
  closed list (`REMOTE_ACTIONS`, `remoteCommand`) that main relays to the
  console (`keryx:remote`), which runs them as its own keys would — never
  a direct write to the store or the live state from the network. Each screen says which
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

Outputs (projector, stage, ...) render the live state, so either the console (`window.open`) or the main process (`outputs.open`, `keryx:displays:open`, "Abrir ao iniciar") can open them; `electron/outputs*.cjs` places and tracks them. **The Saídas popover is one switch per local row** (2026-10-13): ligado = the window exists, the name of an open output brings it forward, states are plain text (`rowStatus` in `src/lib/console/outputs.js`, tested) and the banner stays the active alert; network rows keep Esquecer. **Remover saída** (Telas e saídas; also "Adicionar saída" there and in the popover) hides an output from the popover, the tabs and Verificar and never opens it at launch: the flag is `removed` on the electron settings `"outputs"` entry (per computer, carried by Exportar/Importar ajustes), the OutputPref row stays, so re-adding restores everything; `/Projection` is not removable (the Prévia mirrors it and send auto-opens it), and a network screen showing a removed page keeps working and keeps its row. Each renderer output (Projeção, Letras, Vídeo, Comunicação) has its own settings, one `OutputPref` row per page path shared by the window and network screens showing that page: pages draw through `OutputScreen` (`src/lib/outputPrefs.js`, tested); no row means the output exactly as before. **Telas e saídas is a thumbnail grid** (owner 2026-10-13, no more vertical tabs — old `telas/<tab>` links just resolve to the section): one card per output showing a real still of what that screen draws now (`OutputPreview` in OutputPrefCard.jsx — the card and the grid share it; connected network screens get the same still in Telas na rede); the card keeps only the placement (Automático/Tela N, Abrir ao iniciar, Abrir/Fechar; Remover no clique direito), and clicking the thumb opens the Editor on that screen — every visual setting lives there. **Mostrar** (`hidden_kinds`) leaves kinds out of one output (Letras, Bíblia, Texto, Imagens e vídeos, Relógio e timer, Avisos, Aviso rápido; `hideKinds`): the layer goes, the output shows what is under it or its idle look, and a song's playback track keeps playing (`track`); the console's Prévia says when the output it previews hides the prepared kind (`stageHidden`). A new kind of content gets its entry in `SHOW_KINDS`. **Exportar / Importar ajustes das saídas** (Telas e saídas) is one JSON file with every output's placement and every page's `OutputPref` settings (`src/lib/outputsFile.js`, tested; the theme travels by name): the main process only saves and reads the file (`keryx:displays:export-file` / `import-file`, 1 MB at most); the console checks it, says what will not come out the same on this computer, and applies it through `displays.set` and `OutputPref` (rows updated or created, never deleted). A new setting on `OutputPref` goes in that file too. **Cada tela é dona do seu desenho** (owner 2026-10-13; reverte a decisão
de 2026-10-12 dos layouts avulsos): o desenho mora em **`OutputPref.design`**
({ elements, background } no formato de `normalizeLayout`) — `designOf(pref,
layoutRows)` em `src/lib/outputPrefs.js` (testado) resolve: o design da
tela; senão o antigo `layout_id` (migração preguiçosa, nada é gravado — a
primeira salvada no Editor grava o design e zera o layout_id); senão null =
a página padrão (StageScreen / PastorScreen / renderer puro). O catálogo
"Layouts das telas", o select de Layout, "Usar em…", "Ver como", `?for=` e
o `?layout=` da rede **morreram**; as linhas ScreenLayout ficam no banco
(dado do usuário), nada escreve nelas. As páginas leem com `useDesign(pref)`
(`src/hooks/useLayout.js`); o arquivo de Exportar/Importar **embute o
design** por saída (arquivo antigo ainda casa o layout por nome). O módulo
puro continua `src/lib/layouts.js` (tipos, elementos, factory, snapping):
um elemento novo é um entry em `ELEMENT_TYPES` + seu caso em `elementText`
ou no `Body` do renderer; num renderer output o elemento **Projeção**
desenha a vista da saída (`prefState`) e um desenho com *timer* tira a
camada `tool` dela (`layoutHasTimer`).
**O Editor é a janela das telas e dos temas** (2026-10-13): `/Editor`
(`src/pages/Editor.jsx`; `openEditor({ screen|theme })` em
`src/lib/editorWindow.js`, janela nomeada `keryx-editor`; aba no preview;
nunca em NETWORK_SCREENS). O rodapé alterna **Temas | Telas**:
  - uma TELA (`ScreenEditor.jsx`): menu vertical com as telas
    (`EDITOR_SCREENS`), o canvas edita o design DELA com os ajustes reais
    da própria tela vestindo a prévia (prefState + kp-out, ou só a Escala
    no Palco/Pastor), e os ajustes visuais moram na mesma janela
    (`OutputPrefCard inEditor`; a coluna é `.nv-scroll.cfg`, então o
    card tem o estilo das Configurações). **Clicar numa tela já é editar**
    (owner 2026-10-13): sem design, o canvas abre semeado com o desenho
    pronto da página (`seedFor`: `factory:palco`/`pastor`/`projecao`),
    a semente é a base (`saved`), então só mudança real é "não salvo" e
    nada se grava sem "Salvar a tela"; "Voltar à página padrão" (cabeçalho,
    com design próprio ou mudanças) zera a linha e semeia de novo. Não há
    mais "Desenhar esta tela"/"Começar do zero". A Transmissão não tem
    canvas, só os ajustes.
  - um TEMA (`ThemeEditor.jsx`): o ÚNICO lugar em que um tema se edita —
    Configurações › Temas é só a lista; Camadas ajusta o ar e captura com
    "Salvar como novo". `text_align`/`text_position` em `EXTRA_KEYS`
    (o estilo explícito do item vence; aplicar um tema no ar os reseta), e
    a caixa do canvas mapeia por `src/lib/console/themeBox.js` (testado).
A ScreenRenderer `fill` is `position: fixed`: inside a canvas or preview
its wrapper needs `contain: layout paint` (`.le-screen`, `.cfg-prev`).
Every screen is landscape: every still of an output (Telas e saídas'
cards, the Editor's canvas) is 16:9, the Pastor's included; only the
real /PastorView page turns with a tablet held upright (its container
query). **The Slides column has a minimum width** (`LIMITS.slidesW`, 300
px, `layout.js`, tested): squeezed, a 2-line verse wrapped into 3 and
looked split wrong; the splitter clamps there and the narrow tier's
Biblioteca-over-Slides column takes `slidesW` too. Long lines still wrap,
never an ellipsis. A new kind of element is an entry in
`ELEMENT_TYPES` (with its `group`) plus its case in `elementText` or the
renderer's `Body`. Generated backgrounds are the next step. **Timers prontos** (Avisos › Ferramentas › Timer): 5, 10, 15, 30 and 60 min always, plus the church's own (`TimerPreset` rows, `src/lib/console/timerPresets.js`); a click prepares the timer, a double click sends it, and a timer on air takes or gives time with `tool.adjust` (−1, +1, +5 min; refused while the screens are locked). **Multiview** (the Programa header, or its right-click menu) turns the Programa monitor into four outputs at once, each what is on air as that output shows it, with its own `OutputPref` (Palco and Pastor in their own layouts), and where it is on screen now from the output health rows; a quadrant's label picks its output (`src/lib/console/multiview.js`, tested; saved with the layout as `multiview`/`mvTiles`). Only the Projeção quadrant (else Vídeo) plays videos. The Prévia's output picker (the six buttons beside it) is gone (user decision 2026-10-12: the Multiview shows every output): the Prévia is the prepared stage as Projeção will show it, with Projeção's own settings.

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
