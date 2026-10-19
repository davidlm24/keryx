# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui, packaged as an
offline-first Electron desktop app with a local SQLite store. Desktop only:
the web build on Supabase was retired (2026-10-08, like Holyrics or
ProPresenter, the app is the program on the church computer); `supabase/` is
kept, unused, for a possible cloud backup (the sync between the church's
computers is a shared folder, no server: `electron/sync.cjs`). Plan:
`docs/desktop-architecture.md`. Read `README.md` first — it covers the
stack, how to run it, the backend wiring, the data model and the known gaps.

## Ground rules

- **UI language is Brazilian Portuguese (pt-BR).** All user-facing strings,
  labels and toasts are pt-BR (tela, salvar, arquivo, excluir, celular,
  cronômetro, usuário) — the church is Brazilian; do not use pt-PT forms
  (ecrã, guardar, ficheiro, eliminar, telemóvel). Do not introduce English UI
  copy. Code identifiers and comments are English.
- **Copy rules (owner 2026-10-13/14).** One word per concept, everywhere:
  **Papel de parede** (o que as telas mostram sem nada no ar, depois do Esc
  e entre os itens — do culto do dia, com o da igreja como "Qualquer outro
  culto"; replaced "Fundo do culto", "Fundo padrão" and "Fundo de hoje",
  Rodada B 2026-10-14) / Tema (tudo o que vai ao ar com o item: texto e
  fundo) / Tema do culto (o tema que o culto usa) — there is no "Visual do
  culto" any more; "Fundo" alone stays the LAYER's name (Camadas › Fundo);
  "Tema sem nome" only where a name is required (menus, tooltips, a select),
  never as a caption; "O mesmo das músicas" (herdar) e "Estilo de fábrica" (sem
  tema); Excluir = apaga (sempre via `useConfirm`/ConfirmDialog, a
  detached page's window included), Tirar =
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
- **List rows are inset rounded cards** (UI rule, owner 2026-10-14): every
  `kx-row`/`kx-layer` in the console (Biblioteca, Setlist, the tabs panel,
  Camadas, Configurações' menu, the views) sits `--space-1` in from its
  column with `--radius-control`, 2 px apart, like the verses — the hover
  and the states never run edge to edge. One rule in `console.css`; don't
  override it per list. Edge to edge only where the owner asks (the Slides
  column and No ar, to gain room). docs/design-system.md has it too.
- **Windows contrast themes** (forced colours; design audit C-05,
  2026-10-16): the states and controls that are backgrounds or shadows get
  system-colour cues in ONE `@media (forced-colors: active)` block at the
  end of `bundle.css` and of `console.css` — on air = `Highlight` filling
  the row (still its background), Prévia = a dashed `LinkText` ring, next =
  a dotted ring, chosen/pressed/open = a solid `Highlight` ring, switches,
  fields and buttons with `ButtonText`/`FieldText` borders — and nothing in
  the normal look changes. What the congregation sees never takes the
  theme: `forced-color-adjust: none` on every output document
  (`html.ks-output-doc`, set by App.jsx), the renderer roots (screen.css)
  and the console's monitors and stills (`.kx-mon-screen`, `.cfg-prev`). A
  new state or control drawn as a background gets its line there;
  `src/lib/forcedColors.test.mjs` checks the blocks (system colours only).
- **One padding rule for panels** (owner 2026-10-16, Rodada F4): a panel's
  header text sits 12 px (`--space-3`) from its edge and its last button
  12 px from the right one (symmetric, owner 2026-10-16 after the Bíblia
  review; the first row under a header — cells, a list — starts 4 px
  below it); a header's controls (buttons, selects, Seg) are 24 px tall
  and **8 px apart, as in the windows' bar** (`.win-bar`; owner
  2026-10-16, in both environments); a band under a header (the
  Biblioteca's search row, the Bíblia's Recentes/Favoritos/Anotações) is
  36 px, its controls 28, 4 px in and 4 px apart; anything with a box
  of its own — list cards, verse cards, the cells of Livros/Capítulos/
  Versículos, the Temas tiles, the search field, tabs, the No ar agora
  monitor — sits 4 px
  (`--space-1`) in from the column, with its text at 12 px; listheads and
  sub-titles ("Selecionado", a Temas heading inside Camadas) at 12 px;
  Capítulos is as tall as its cells, up to 40 % of the column (`Measure` →
  the Bíblia's `fitDock` `locked`, Console.jsx); every panel header is 32 px, 28 in
  Compacta (`panelHead`), one line — a header never wraps into a taller
  block. No text a panel does not need (owner 2026-10-16, the Bíblia
  review): no hints in headers, no "installed here" lines, counts inside
  the lists they count (the Bíblia's dropdowns), never on their button.
  Don't give one panel its own inset.
- **Every panel folds** (owner 2026-10-16, Rodada F4): a chevron right of
  the header's + (`FoldBtn` in kx.jsx; "Dobrar"/"Abrir"), on every module
  but the Programa, the Prévia, the player and the Bíblia's panels
  (owner 2026-10-16: they need none; `noFold` in dock.js `MODULES`, a
  fold saved before is ignored). The state is `layout.folded` (`{ [moduleId]: true }`, per
  computer, both environments; `normalizeFolded` migrates the old
  `onairMin`). `fitDock`'s `folded` (dock.js, tested) locks a folded module
  alone in a split: down a column to its header (`head`, the density's),
  across a row to a 28 px strip (`FOLD_STRIP`; `FoldStrip`, its name
  standing, a click opens it); the fold wins over Camadas'/Temas' measured
  heights. A split keeps one open child: the last open one's chevron is
  inert ("Um painel da coluna fica sempre aberto"), and when only measured
  heights stay open the last of them takes the rest. As a tab beside
  others, or while editing the arrangement, nothing folds. The body stays
  mounted, hidden. Don't confuse it with the dock frames' `collapsed`
  (joined as tabs) or No ar's `fold`/`gone` (no lyrics on air).
- **Fields are defined in `base44/entities/*.jsonc`.** Adding or changing a
  field: edit the jsonc, run `npm run db:schema` (regenerates
  `electron/db/schema.json`; the local store adds new columns on next launch).
  `npm test` fails if schema.json and the jsonc drift apart. A new entity
  also goes in `SYNC_ENTITIES` or `LOCAL_ENTITIES`
  (`electron/db/syncScope.cjs`, sync between the church's computers,
  desktop-architecture.md §8b), and a User field that belongs to one
  computer in `LOCAL_USER_FIELDS`; `npm test` checks the entity. Only
  writes through the store's operations reach the sync outbox (`_outbox`;
  `importRows` and `applyRemote` record nothing, so remote changes never
  echo back).
- **Sincronização entre computadores** (owner 2026-10-16; docs/desktop-architecture.md
  §8b): a folder Google Drive para computador (or OneDrive, Dropbox) keeps
  in step, no server, no sign-in, last edit wins per row. Only computers
  with the church's code count (`shared/syncCode.mjs`: 8 symbols,
  `K7QM-2HXP`; every line signed, `electron/syncPairing.cjs`). The engine
  is `electron/sync.cjs`, Configurações › Sincronização's main side
  `electron/syncControl.cjs` (`keryx:sync`; the key and code sealed with
  safeStorage), the section `settings/SyncSection.jsx` (pt-BR status in
  `src/lib/console/syncView.js`, one poll in `useSyncStatus`), the cloud
  beside Ver only on a computer that syncs. Joining merges
  (`store.snapshot`), never replaces; likely duplicate songs are
  `shared/syncDuplicates.mjs` (Juntar em uma / Manter as duas,
  `User.song_duplicates_kept`; "parece repetida" in the Biblioteca).
  "Tirar" pauses a computer (the code file's `removed` list); "Trocar o
  código" cuts it. Restoring or importing on a computer that syncs asks
  ("Voltar todos", by default, or "Só este computador", which leaves).
  The outbox records only while syncing; what a newer version sends is
  parked (`_parked`) and a remote row never erases a column its sender
  does not know. Tests use temp stores and a temp folder; only real Drive
  folders confirm the rest (docs/checklist-pc-igreja.md, item 8).
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
  postMessage type (both are gone). **One sound at a time, and the fades**
  (owner 2026-10-16, Rodada F2; Configurações › Telas e saídas ›
  Transições: User `media_transition`/`_ms`, `clear_transition`/`_ms`,
  `screen_transition`): an op that starts an item with sound (`video.show`,
  `audio.show`, `audio.playlist`, `media.show`, `media.playlist`; a video,
  audio or YouTube not at volume 0, `heard`) stops the other sound layers
  (`hush`), cut or fading out — the stopped item rides in `live.leaving`
  (`{ layer, item, at, until }`, dropped by the next change) — unless its
  `transition` says `mix` (Tocar junto; no transition = the same, for
  senders that say nothing). The console adds `transition` and the exit
  `fade` in `liveOp` (`withTransitions`, `src/lib/console/transitions.js`,
  tested; every output window's screen keys too, `useScreenKeys` → `screenKeyOp` in `src/lib/screenKeys.js`, tested: ← → PageUp/PageDown, B, L, C, Esc as on the console, no Space, no click-to-advance, desktop only); the live state never reads
  prefs. Never hush in `media.toAudio`/`audio.toMedia`, `content.show` or
  `clear` (the audio channel survives Esc); a list counts by the item it
  starts with, advances never hush, the Fundo's video is muted. Esc
  (`clear`), Limpar (`text.clear`: the timer, the aviso and the text in ONE
  change, so the ghost is what the audience saw — three clears in a row
  drew the song hidden under an aviso fading out) and the single-layer
  clears, and Tela preta/Logo (`screen.set`, while the switch is on) take a `fade`
  (ms) kept as `live.fade = { ms, at }` (`at` = that change's updatedAt),
  so every output, network screens included, draws the same fade: the
  renderer keeps the screen drawn before as a ghost going transparent over
  the one now (`useExitGhost`, `screenExitMs`/`videoExitMs` in
  `src/lib/exitFade.js`, tested; `.ks-ghost`), its video still playing as
  its volume comes down (`LiveVideo fadeOut`, the element handed over by
  the pool); the projector plays `leaving` audio out the same way. Outputs
  ignore reduced motion (the audience sees them), the Programa monitor
  honours it, still previews cut. The slide-to-slide transition stays the
  theme's. Every output renders the live state; outputs can be
  opened by the main process (`keryx:displays:open`, "Abrir ao iniciar").
  Avisos (CommunicationVideo) are the `communication` layer, drawn in full
  by `ScreenRenderer` (look, background, logo, chime; arithmetic in
  `src/lib/console/notice.js`); outputs move a "Tocar todos" sequence on
  with `useNoticeAdvance`. Escola bíblica materials go on air as ordinary
  stages (`stageFromMaterial`; teacher notes ride in `content.stage` —
  each question's in `stage.slide_notes` (`materialStage`) — never on the
  projector). **Activities** (owner 2026-10-16, Rodada E4): a slide may
  carry `activity` (`ACTIVITY_KINDS` in `shared/live-state.mjs`: choice —
  a quiz question, its 2–8 options as cards —, truefalse, blanks —
  Complete a frase, word positions —, memorize, discussion — a timer),
  built by `materialSlides` in school.js (types in `MATERIAL_TYPES`;
  quiz/truefalse keep `quiz_questions`, the verse types `slides`) and drawn
  by `ActivityView.jsx` (theme font/colour; the right card green with ✓);
  how far each slide was revealed is `content.revealed`, walked by
  `content.reveal` on the SAME slide (refused locked, like goTo) — and →/←
  (`content.next`/`.prev`, so keys, outputs and the controle remoto) step
  through it before changing slide; the word logic is `src/lib/activity.js`
  (tested), the Palco shows the answer (`stageLines`). The Escola has the
  Revelar button and the material's question list; there is no "Resposta"
  slide any more. Slides keep their pictures by text when edited
  (`slidesFromEdit`), never by position. What a song or
  passage puts on screen is `src/lib/console/content.js`; the default theme
  dresses one with no look of its own when it is sent (`stamp` in
  useConsole.js, `withThemeDefaults` in themes.js), never what is on air. A song can
  also follow one theme of its own (`Song.theme_id`: the whole look, no
  default theme) and each labelled part of its lyrics another
  (`Song.part_themes`, keyed by the part's name in lower case): resolved when
  the stage is built (`songTheme.js`, so `stageFromSong`/`songContent` take
  the themes); the part's look rides in `slide.style`, which the renderer
  lays over the content's, and an output with its own theme drops it.
  **The main Projeção has no theme of its own** (owner 2026-10-14, "Frente
  5 = A"): it always follows the console, so Telas e saídas has no Tema
  row for it and `normalizePref`/`prefState` never read `theme_id` of
  `/Projection` (`ownsTheme`, tested; an old value stays in the row,
  unread). Letras, Vídeo and Avisos keep an optional own theme ("O
  mesmo da Projeção" is their default).
  **The Fundo layer is the screen's background** (2026-10-12): an item's
  own background (the song's, its theme's, the default theme's) rides in
  `args.fundo` and goes to the Fundo layer when it is sent —
  `background.set` before `content.show`, `fundoOps` in
  `src/lib/console/backgroundSpec.js`, used by `send` and the Prévia — so
  it stays after Esc; only a part theme's picture stays in `slide.style`.
  A picture's dim, blur, fit and position are its own settings
  (BackgroundPref, edited in the library; `backgroundLook`): they fill the
  Fundo when it goes on air and the Fundo on air follows when they change
  (`useConsole`); Camadas › Fundo has no options at all (2026-10-14). The
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
  BackgroundPref); "Trazer da Mídia…" copies a Mídia row in. **Every
  background can leave the library** (owner 2026-10-16, the factory photos
  too): its right click goes by its origin (`backgroundActions`, `origin`
  keryx/own/media in `backgroundList`, tested) — a factory photo is
  excluded (`BackgroundPref.hidden`; its file is the app's, never deleted)
  and comes back from the **Excluídos** chip (Restaurar, menu or the side
  panel); a file sent or brought in is deleted (its Media row, and its
  BackgroundPref unless another copy is a background); a Mídia picture is
  "Tirar dos fundos" (its BackgroundPref goes, the Mídia keeps it). There
  is no "Oculto" any more: an old hidden row is in Excluídos. **The
  categories are the church's** (owner 2026-10-16), **edited inside the
  library** (its "Categorias…" chip, `library/FundoCategories.jsx`;
  Configurações › Temas e fundos › Categorias de fundos only opens the
  library there, `pick({ manage: true, view: "categories" })`); a
  background's category is picked from that list (a select in its panel,
  never a free name), and a file sent with a category chip on lands in it:
  `User.background_categories` names and
  orders them, even empty (null = `CATEGORY_SUGGESTIONS`); a background's
  own category is still `BackgroundPref.category`, so a rename or a delete
  rewrites those rows (a factory photo gets its first one) and a delete
  sends them to "Outros", which is never renamed or deleted (helpers in
  backgroundPrefs.js, tested). Both sync. **A default
  theme per kind** (`themeForKind`, `THEME_KINDS`): Música (the theme in
  use, else the theme marked padrão), Bíblia, Texto and Timer (`User.bible_theme_id`, `text_theme_id`,
  `timer_theme_id`; "" = Música's, "none" = factory), chosen in Temas ›
  Temas padrão; a timer takes its theme's font, colour and background
  (`withThemeDefaults` on `tool.show`, `fundoOps`), text items and Escola
  materials `inherit` like songs.
  Deleting from a right-click menu ("Excluir…": songs, media, avisos,
  themes) always asks first through `useConfirm()` (`ConfirmDialog.jsx`;
  Esc answers no, before anything else). **A question that cannot be
  taken back opens on Cancelar** (audit C-10, `focusesCancel` in
  `src/lib/console/confirm.js`, tested): Excluir and Descartar by their
  verb, any other action with `danger: true` (Trocar o código, Juntar,
  Substituir, Voltar ao padrão, Tirar da turma), so Enter — the
  operator's send reflex — answers no; the action is Tab or a click. The
  others (Tirar da setlist, Remover saída, Sair…) open on the action.
  Encerrar (`EndDialog`) keeps its action focused: it has Desfazer.
  **Buttons in Windows order** (audit C-74): the action, then Cancelar on
  the right — ConfirmDialog, PromptDialog, Encerrar, the background
  library and the native close guard (`closeGuard.cjs`, safe answer the
  default and Esc), as the import/restore questions already were. The Prévia's width is the
  operator's (`layout.prevPct`, the splitter beside it; the Programa gives
  way, `--prev` in console.css); the Próximo sits beside it.
  **Temas** (owner's reviews 2026-10-14, as Holyrics' theme column): a
  dock module of its own, `temas`, right under Camadas (`TEMAS_H`; a save
  from before it gets it there, `below` in dock.js `MODULES`), with up to 9
  pinned themes as small screens (`ThemeStrip.jsx`, `consoleThemes` in
  themes.js; `ProjectionTheme.pinned`, toggled by "Fixar no console" in the
  strip's menu, the library's Temas tab and Configurações › Temas; none
  pinned = the default + most recent). With the module in the tray the
  themes ride at the end of Camadas (card or drawer), never out of reach. **The Temas panel is its 9 slots** (owner 2026-10-14, `TEMAS_SLOTS`
  in ThemeStrip.jsx): 3 a row (2 with "Miniaturas grandes"), only the
  thumbnails — a name under one only when the theme has a name and
  "Mostrar nomes" is on (`layout.temasThumb`/`temasNames`, per computer);
  an empty slot is a dashed + that makes a new theme; the panel is as tall
  as its slots (`Measure` → `locked.temas`), like Camadas. Its header has
  the library (`grid` icon; the library's right click pins a theme here)
  and the **+ menu** (`menuRef`): Novo tema, Configurações › Temas…, Salvar/Tirar tema para a
  música, Usar neste culto, Seguir o culto, Tornar padrão, Visualização.
  Nothing else in the body: no "tema do culto" line, no buttons.
  **Camadas edits no look**: the layers come first, each with a pencil on
  hover; **the settings under the list stay folded until a pencil opens
  them** (owner 2026-10-14; a click on the row only selects it) — Logo
  (with "Logo da igreja…", Configurações › Igreja), Sobreposição (its text
  field), Texto principal (the item's Título and "Editar tema…", the theme
  in use in the Editor de temas); the Fundo's pencil (and the row's right
  click) opens a menu, never the library blind: its title names whose
  background the screen shows now — the culto's papel de parede, the
  igreja's or the item's own (`fundoNow` in defaultFundo.js, tested; it
  still reads the pre-rename titles) — and its items are "Trocar o papel
  de parede…" (`pickServiceFundo`: **the one live door**, Rodada B
  2026-10-14 — the Programa's header button is gone; in the medium/narrow
  tiers the Camadas drawer of the Programa's pill keeps the pencil reachable)
  and "Qualquer outro culto…" (Configurações › Culto); the Fundo layer
  still has no options (the row keeps its eye, padlock and place). The text look is edited only in the Editor de
  temas; when the text on air looks otherwise (a song's own look) Texto
  principal says so and offers Restaurar (`applyThemeOnAir`) and Salvar
  como novo (an unnamed theme). Camadas' header **+** is a menu with TWO items only
  (owner 2026-10-14, "Frente 2 = A"): Sobreposição de texto and Logo da
  igreja. Principle: *Camadas put or take elements over the projection
  that are not in the themes; the Editor de telas is the permanent design
  of one type of screen.* Relógio, Cronômetro, Timer, Texto livre and
  Aviso rápido are not layers' business: they stay in the tabs panel
  (Ferramentas, Timers, Aviso rápido) and the Setlist's + — don't put
  them back in Camadas' +. **Sobreposição de texto always makes a NEW
  overlay** (owner 2026-10-14, "adicionar camadas a mais"), up to 5
  (`OVERLAY_LIMIT` in `src/lib/console/overlays.js`, tested; the menu item
  disables at the limit). Each overlay is its own row named by its text
  ("Sobreposição", muted, while empty), with eye, local padlock, pencil
  (Texto, Posição) and Excluir… via `useConfirm`; with 2+ the rows join
  under a thin "Sobreposições · n" heading (`.kx-ovhead`) — the group's one
  handle in `live.layerOrder` (the "overlays" key stays one entry; never
  put single overlays in the order) — and dragging a row inside the group
  only changes who draws on top among them (the top row is the END of
  `live.overlays`: the renderer draws the list in order). Esc and Limpar
  leave overlays alone (their own controls, like the Logo). The tools
  of the tabs panel are prepared in the Prévia (`stageFromTool`), the aviso
  goes to the screens at once (`alert.show`); a text is asked with
  `askText` (PromptDialog.jsx; Esc closes it first). The Setlist's **+** is a menu
  too: Buscar… (the palette), Seção…, Texto…, Timer… (a ServiceItem under
  the item in the Prévia, else at the end) and Planejar o culto…; the
  Biblioteca's Letras + also takes "Uma pasta inteira…" (webkitdirectory). **Camadas is as tall as what it holds**
  (its list, plus the settings a pencil opened; `Measure` in kx.jsx) and
  the No ar strip as tall as the slide on air with the most lines (the
  song's editor decides them; `onAirHeight`): heights the console passes
  to `fitDock` as `locked` (dock.js, tested) — exact, only for a module
  alone down a column. They keep the console's 6 px gap: a gap a locked
  module would own is a `.dock-gap` without a handle (Dock.jsx), and a
  neighbour's splitter still resizes the neighbour, the locked one moving
  whole (owner 2026-10-14). **The No ar strip is pinned** (`MODULES.onair.pinned`):
  always its band at the bottom (either span counts) — never dragged, no Mover para…,
  nothing dropped in or beside it; × and Ver send it to the tray and it
  comes back there (`returnModule`); a save with it elsewhere gets it back
  across the bottom (`normalizeDock`). **The +** of a
  module is an icon at its header's right (Setlist, Temas, Camadas), never
  a button in its body.
  **A click makes it the theme in use**: it dresses the text on air
  (`applyThemeOnAir` in `themeActions.js`: text look + Fundo, padlock
  respected) AND everything sent afterwards (Música in `themeForKind`,
  via stamp; `c.themeId`, the "· em uso" of the Temas heading), until
  someone changes it. **It is kept on this computer** (localStorage
  `keryx.themeInUse`, `useConsole`): lost on a reopen, the next song went
  out over the Fundo do culto with the factory look (the bug of the review
  2026-10-14, pinned in themes.test.mjs). Choosing a culto with a theme of
  its own (`Service.theme_id`), or changing its theme, makes that one the
  theme in use; a culto with none leaves it (`themeInUseSeed`). When KERYX
  opens, the last click wins: the culto it opens on does not replace a
  theme in use on this computer. The menu's "Usar neste culto" ("Usar
  hoje" with no service, starting the day's draft) writes `Service.theme_id`;
  "Seguir o culto" goes back to it. With nothing on air a click puts an
  example in the Prévia instead
  (`themeSampleStage`, `stage.theme`: sending it only applies the theme's
  background, never the example text), a double click
  (or the menu's Editar, or Configurações › Temas) edits it in the Editor
  de temas e telas (a page of THE window, `openEditor({ theme })`;
  the one-off ThemeStudio overlay from 2026-10-13 was folded into it —
  don't bring a second theme editor back),
  and "Salvar tema para a música" writes `Song.theme_id` for the song on air
  or in the Prévia. A Bible passage takes **the Bíblia's own theme**
  (`User.bible_theme_id`: "" = whatever the songs get now — the theme in
  use, else the default; the same for Texto and Timer — "none" = factory;
  `themeForKind` in themes.js, used by `stamp`), chosen in the Bíblia's Tema
  button or Configurações › Bíblia e músicas. **The item's title over the
  slide is the theme's** (Rodada B 2026-10-14, `ProjectionTheme.show_item_title`,
  the Editor de temas' "Título do item"; prefs v3 copied the church's value
  into every theme): it is stamped as `style.title` at send
  (`withThemeDefaults`, and `withSongThemes` for a song's own theme), so
  Camadas › Texto principal › Título still chooses per item on air; with no
  stamp (factory look, a theme from an old backup) the renderer falls back
  to the legacy `User.show_item_title`, which has no UI any more.
  **Papel de parede** (owner's decisions 2026-10-12/14, "Papel de parede ×
  Tema"): with nothing on air the screen shows the culto's background
  (`Service.background`), else the church's (`User.default_background`; the
  old `standby_background` still counts; `User.weekday_backgrounds` is no
  longer read) — `defaultFundo` in `src/lib/console/defaultFundo.js`. It is
  configured in Configurações › Culto: the "Fora do ar" block holds the
  fallback row **"Qualquer outro culto"** (`User.default_background`, which
  warns while the culto on screen has a papel de parede of its own —
  `defaultFundoFrom`) and the Tela ociosa; each template's row in Modelos de
  culto keeps its own (`ServiceTemplate.background`), so choosing the day's
  culto switches it. Live, the ONE door is Camadas › Fundo's pencil
  (`pickServiceFundo`); Camadas' Fundo menu names what is on screen
  (`fundoNow`). **Aparência is gone** (Rodada B, F3 = A): `resolveSection`
  sends `?config=aparencia` to Culto and `fundos` to **Temas e fundos**,
  which holds the library button; "Esconder o título do YouTube" lives in
  Telas e saídas. **A service keeps a background and one
  theme** (owner's review 2026-10-14, as in Holyrics: the Visual do culto,
  its window `LookDialog` and the per-kind service themes are gone — don't
  bring them back; `src/lib/console/serviceLook.js`): `Service.background`
  (its papel de parede) and `Service.theme_id` (optional, from the library;
  `serviceTheme` reads the old `kind_themes.lyrics` when it is empty).
  `kind_themes` stays in the table (user data) and nothing writes or reads
  its other kinds. Planejar o culto edits both (`BgChip`,
  `library/ThemeChip.jsx`), and so does a template's row in Configurações ›
  Culto (`ServiceTemplate.background`/`theme_id`): "Salvar como modelo"
  saves them, applying one fills what the service has not chosen
  (`lookForService`). Themes may be unnamed (`ProjectionTheme.name` is
  optional, `themeName`): no made-up date, no caption under the thumb.
  **A theme is saved with a background from the library** (owner
  2026-10-14, `themeHasBackground`; a colour counts, Cor is a library
  tab): the Editor de temas keeps Salvar tema off until the Fundo is
  chosen (no "Sem fundo no tema"; Ctrl+S opens the library), an old theme
  opened there included; Camadas' "Salvar como novo" takes the Fundo on
  air, else the theme in use's (`newThemeBackground`), else asks the
  library and saves nothing when it is closed. Themes saved before
  without one still work as they did (the text only, the Fundo on air
  stays) and wear a mark (`NoBgMark`: a dot in Temas, "sem fundo" in the
  library and Configurações › Temas) with "Escolher fundo…" in their
  menus. Temas' + also has "Configurações › Temas…".
  `pickServiceFundo` (Console.jsx; Camadas › Fundo's pencil): the library
  picks today's papel de parede, saved as `Service.background` (the day's
  draft starts if need be), and the screens follow at once.
  The console keeps it
  in the live state (`background.default`, `defaultBackground`) and `clear`
  (Esc, from anyone) puts it on the Fundo unless the padlock holds it;
  Desfazer puts back the Fundo there was. It also goes on the Fundo when it
  changes with nothing on air (KERYX opens, a service is chosen), under
  Tela preta too — KERYX reopens with the screens black — but never past
  Travar telas or the padlock (`fundoGoesOnNow` in defaultFundo.js). The idle
  screen is only Logo or Preto. In the library, Gerados shows the
  background big. A right click on a Temas card offers Aplicar, Editar,
  Salvar para a música, Tornar padrão, Usar na Bíblia, Usar neste culto.

- **The app is the operator console, `/Console`** (`src/pages/Console.jsx`,
  `src/components/console/`); `/` and any unknown path go there. It is built
  on the design system in `docs/design-system/` (tokens and `kx-` classes,
  imported as `@ds/…`; read `docs/design-system.md` before touching its
  look). One screen, always live (no steps; Verificar is an overlay from the
  Saídas popover; Configurações, `settings/SettingsView`, is a window over
  whatever is on screen, its own `cfg` state, `?config=`; its sections are
  `src/lib/console/settings.js`, old ids resolve through `resolveSection`;
  its search indexes every row in `settingsSearch.js` — a new `FormRow k`
  goes in the index, or `npm test` fails). **Sobre** is the last section
  (owner 2026-10-14, `SobreSection.jsx`; also the KERYX menu's "Sobre o
  KERYX", `openSettings("sobre")`): version (the `info` call of Backup;
  "Prévia de desenvolvimento" without the desktop), Ver novidades (the
  console's popover, not a second one), the church's name, Electron and
  Chromium, the Geist license (read from `/fonts/Geist-OFL.txt`) and the
  notice that the Bibles are installed by each church. Updating stays in
  Backup e atualizações.
  **The top bar's left side** (owner 2026-10-15, Rodada D4 + "O topo", pick
  B): the logo, then **KERYX | BÍBLIA** (bold caps, no icons, gold
  underline — places, not commands), a divider, then **the menu bar**: Culto, Música,
  Mídia, Ferramentas (`MenuBar.jsx`; the model is
  `src/lib/console/menuBar.js`, tested). **There is no Telas menu** (owner
  2026-10-16, Rodada E0): Tela preta, Logo and Limpar are the top bar's
  chip, Saídas and Verificar the logo's menu, Travar telas and Telas e
  saídas the Saídas popover — don't put it back. Its open menu is the console's
  `open` (`"mb:<id>"`): Esc and the scrim close it, pointing at another
  menu switches, ← / → walk them. Every item is something the console
  already does (Música › Sincronizar a música… opens the song in the Prévia
  or on air with Sincronizar on top; Letra automática › Iniciar/Pausar/
  Retomar; Mídia › Enviar arquivos… / Link do YouTube… open the Mídia on
  that step). **Ver stays the eye beside the bell** and **Ajuda's items
  (Atalhos, Novidades, Sobre, Atualizar) live in the logo's menu** — neither
  goes back in the bar. Under 1240 px the bar folds away and the logo's
  menu (every page) has it all. A new top-level action goes in the bar's
  model, not as another icon in the top bar. **The right side is compact**
  (owner 2026-10-16, Rodada E1): the service clock "◷ 19:00 · 9h46"
  (`serviceClock` with `compact`, timeline.js, tested; the whole sentence
  is its tooltip and `label`; a running service keeps "Culto 0:42:10"),
  the clock, the Saídas status "2 telas" (`outputHealth`'s
  `status.compact`, outputs.js, tested; the full label in its tooltip),
  Ver and the bell; the search is at most 320 px. **The screen actions
  (Tela preta, Logo, Limpar, Encerrar) are not in the top bar any more**:
  they live in the Programa's pill (owner's pick B).
  Everything else
  is a page of **THE window** (Rodada C, owner's choice "uma janela, com
  Voltar", 2026-10-14; the `win` stack in Console.jsx fed by
  `src/lib/console/nav.js`, tested; `?song=`, `?planner=`, `?media=`,
  `?notice=`, `?school=`, `?reports=`, `?config=` open their page):
  Configurações, the song editor (`SongEditor.jsx`), the planner
  (`ServicePlanner.jsx`), the media library (`MediaView.jsx`), the aviso
  editor (`NoticeEditor.jsx`), the Escola bíblica (`SchoolView.jsx`; it
  projects through the console's Prévia/Programa and every live key works
  there), Relatórios (`ReportsView.jsx`) and the theme/screen editors.
  **One floating window over the live console**, the Configurações frame
  on every page (`WinBar` in kx.jsx: the ← Voltar chip from level 2, the
  title, the page's tools and actions, the (x) "Fechar · Esc"; there is
  no "← Console" BackBtn any more), `.win-dialog` + `.win-scrim` in
  console.css, two sizes (Padrão, and `.is-editor` for the editors; the
  frame animates between them). **The window stretches by its 4 edges and 4 corners** (owner
  2026-10-15, Rodada D3; `WinEdges` in `src/components/console/winLayout.jsx`,
  `dragRect`/`clampWin` in `src/lib/console/winLayout.js`, tested): min
  760 × 480, never past the console, one size per kind kept on this computer
  (localStorage `keryx.console.win`); a double click on the bar's empty area
  restores the default. **Inside a page, columns (and the song editor's
  Slides/Vídeo) are resized by splitters as in the console** (`useWinCol`,
  size per page per computer; double click restores), and the spacing is the
  Editor da tela's: 6 px between panels, side by side or stacked — `.win-body`
  has no flex gap, the splitter IS the gap; don't add a gap beside one. **Opening from inside navigates in the
  same window**: `nav.js` push ("← Temas", "← Telas e saídas", "← Editor
  da tela"; `openEditor`'s `from` carries the label), Esc / the Voltar
  chip / the scrim pop ONE level (the first closes), the (x) closes the
  whole stack, and every exit goes through the top page's `escRef`
  (modes "esc" | "back" | "all" | "detach"), so the one unsaved guard asks —
  **"Descartar as mudanças?" via `useConfirm`** (owner's pick, Rodada C;
  Esc answers "continuar"), never the old two-step toast. Pages under
  the top stay mounted and hidden (Voltar finds them as they were); a
  page's own keys (Ctrl+S, Mídia's Enter/Delete) sleep while covered
  (prop `active`) and defer to `.scrim:not(.win-scrim)`. Pickers that
  answer (the background library, ConfirmDialog, menus) stay ON TOP,
  never in the stack. **Focus** (design audit C-12): the console behind
  the window is `inert`, Tab stays in the window or dialog on top
  (`useDialogFocus`, rules in `src/lib/console/focusTrap.js`, tested), the
  page shown takes the focus (`useWinPageFocus`: from the keyboard its first
  control, with the mouse the bar's title, which holds no keys), and closing
  gives it back to the opener only after a keyboard open. While the window is open the Programa monitor and
  the Multiview draw one still frame (`still` on CenterPanel — the air
  itself never pauses). The pages are one switch, `winPage` in
  `WinPages.jsx`, for both hosts below; a new page goes there.
  **"Destacar em janela" on every page** (owner 2026-10-16, Rodada F5;
  for whoever works watching another monitor): the WinBar's ⧉ (the host
  gives `onDetach` through `WinCtx`) moves the page on top to a window of
  its own, **`/Janela?page=<page>&…`** (`src/pages/Janela.jsx`, window
  `keryx-janela-<page>`, one per kind of page; a tab in the preview;
  desktop only, NEVER in NETWORK_SCREENS; `/Editor` is its old name and
  lands there too). It first goes through the page's own guard (`escRef`
  mode "detach": "Descartar as mudanças?"; "Cancelar" keeps it), then the
  console pops that level and opens the window (`detachSpec` in nav.js,
  tested: the params `stackFromParams` reads back; Sincronizar takes the
  Editor de música below with it, `?song=<id>&sync=1`). The detached
  window is THE window's frame filling it (`.win-dialog.is-detached`):
  its own stack with Voltar, ConfirmDialog, PromptDialog, menus, the
  background library and a toast, Esc routed to the top page's `escRef`
  (the first level closes the window); a page with unsaved changes holds
  it (`useUnloadGuard` in kx.jsx → closeGuard on the desktop). It reads
  the store and the live state like any window and gets a **light `c`**
  (`useJanelaConsole`: `useStamp`, `useToast`, `useLiveOps` from
  useConsole.js) — **never mount `useConsole` there** (its letra
  automática ticker and the Fundo's follow-ups run once, in the console).
  **What goes to the Prévia or on air goes to the console**
  (`src/lib/janelaRelay.js`, tested: a closed list, `JANELA_MESSAGES`,
  checked on arrival by `checkMessage`; main relays `keryx:janela` page →
  console and console → pages, as `keryx:remote`; a BroadcastChannel in
  the preview): `prev.set`, `stage.send`, `prev.send`/`prev.step` (the
  detached Escola's Enter and ↑/↓), `song.saved` (→ `songSaved`),
  `setlist.material` (→ `addMaterial`), `console.open` (Novidades,
  Configurações › Console — the arrangement is the console's, so detached
  that section says "Abrir no console"); the console answers with
  `console.prev` (its Prévia, which the detached Escola shows). The
  console runs them through its own `setPrev`/`sendStage`, so the Prévia,
  the history and the log stay its own. Tela preta and Logo work in every
  detached page; in the Escola every live key does. The Bíblia is the
  console's second environment (`BibleEnv.jsx`: Ler, Comparar, the Buscar field,
  notes). Where the modules go is the operator's: **each environment is a
  dock** (owner 2026-10-13, the "Disposição do console" prototype, model
  Livre) — never place a column by hand in `Console.jsx` or `BibleEnv.jsx`.
  The Bíblia's dock (`layout.bibleDock`, `env: "biblia"`; modules Livros, Capítulos, Versículos, Texto, No ar — the text and
  No ar never leave; the old "Versão e busca" module is gone, 2026-10-14:
  the version, Abrev | Nomes, the install + and a view menu (Tema da
  Bíblia…, Células pequenas/médias/grandes — `layout.bibleGrid`, per
  computer) are Livros' header — the edition only as an amber dot on the
  select when it is from the internet, missing or the preview's samples
  (`bver-dot`, the words in its tooltip). The Bíblia has **no search field
  of its own** (owner 2026-10-16): the console's search (the palette, `/`)
  opens a reference there and searches a word (`request.search` → the
  text panel's Buscar mode; Ler goes back). The text panel's header is the
  chapter, two icons (Selecionar todos, Limpar seleção) and Ler | Comparar;
  under it Recentes, Favoritos and Anotações are dropdowns on the left,
  their counts inside the list. **No ar has no header** (owner
  2026-10-16): its screen on top and the Programa's pill with icons only
  (the state's dot, Tela preta, Logo, Limpar, Encerrar). It starts as its three columns
  (`fromBibleArrangement`); BibleEnv builds the modules, Console.jsx keeps
  the dock. `src/lib/console/arrange.js` now only reads the old
  `order`/`stacks` saves. The culto's: a tree of splits and tab groups,
  `src/lib/console/dock.js` (tested), drawn by `Dock.jsx`, saved as
  `layout.dock` (per computer; null = the one the old columns make,
  `fromArrangement`, so an old save keeps its look). Every module is built
  apart from where it goes (`modulePanels` in Console.jsx: Biblioteca,
  Slides, Programa, `PreviaPanel`, the Painel, Setlist, Camadas,
  No ar, `PlayerSlot`). Ver › Editar disposição: drag a module by its name to a
  side of another (splits) or its middle (tabs), a click on the name opens
  "Mover para…", × puts it in the tray (the edit banner). While editing,
  every splitter shows its side's size in % of the split and a click on
  that badge lets one type it (`Split` label/onPercent in kx.jsx, Dock.jsx). The banner's **Tamanhos: Livre | Por %** (owner 2026-10-15, Rodada D; per environment, per dock): Por % keeps `mode: "pct"` and `ref` (the box the sizes were made for) on the dock, `fitDock` scales the fixed sizes by the box on screen over `ref` so the proportions survive another window size (minimums and locked heights still win), and splitters snap to 5 % (`rebaseDock`, `setDockMode`, `snapPct` in dock.js, tested). The Programa, the
  Prévia and the Setlist never go to the tray; the player rides under the
  Programa until it is placed (× sends it home). The tray is this
  computer's (owner 2026-10-13): Ver's and Configurações › Console's module
  switches move a module in or out of it (`uiLayout`/`setUiLayout` in
  Console.jsx); the church's old `console_hidden_modules` only seeds a
  console whose arrangement was never changed (after a restore every
  module comes back, `trayFromChurch`), and nothing writes it any more.
  Until the operator changes it, the culto's dock follows the width as the
  old tiers did (`fromArrangement` with `tier`: wide, the four columns;
  medium, no right column — Camadas a drawer, the Setlist beside the
  Prévia; narrow, also the Biblioteca over the Slides), and Padrão does
  too. **One culto arrangement per width tier** (owner 2026-10-14, the
  small-screen review): `layout.dock`/`dockPreset` are the tier's on
  screen (`dockTier`); when the tier changes `switchTier` (layout.js,
  tested) keeps them in `tierDocks` and brings the new tier's back (none =
  that tier's own), so a dock arranged on the church's big monitor never
  squeezes a notebook. A save from before had one dock: it is the wide
  tier's. The Bíblia's dock stays one. Splits have one
  flexible child and fixed pixel sizes (`allocate`); what cannot fit side
  by side joins as tabs, a pair at a time, the Programa last (`fitDock`).
  The Programa alone in a split never takes more than its 16:9 and the
  player (`programaNatural`, design audit C-51): the rest goes to its
  neighbour (the Prévia's band), never a locked or folded one; the
  dock's sizes stay the operator's. The band starts as tall as the
  Prévia's screen (no +84 for the header and button it lost). In the
  medium and narrow tiers (No ar in the tray, so the Programa's height
  is steady) the Slides start wider by what the Programa's 16:9 cannot
  use at that height (`fromArrangement`; the Prévia keeps its width, the
  Setlist beside it gives the room); the wide tier keeps its columns, which
  would otherwise move each time the No ar strip comes and goes.
  A new module is an entry in
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
  player **always visible**, dimmed while idle — only its icon then, **no
  placeholder words** — **in two rows** (Rodada F1, owner 2026-10-16): the
  first is what plays (the file icon, the title — floor `min(110px, 34cqw)`,
  cap 46cqw — and "n/m" in a list; **no kind word**, the icon says it), the
  elapsed time, the progress bar and the remaining time; the second is the
  controls: ⏮ −10 ⏯ +10 ⏭, the eye, Parar, the layer switch (2+ layers), the
  letra automática, where the sound goes, then the volume and the meters;
  64 px, `.pslot` and dock.js `PLAYER_SLOT` 72; narrowing folds row 2 (the
  volume %, −10/+10, the where/chip labels down to icons, a narrower volume,
  then the meters and where; Tocar, the eye, Parar and the mute always
  stay). **The progress bar drags** (`Seek` in PlayerBar.jsx, pointer
  capture, a 16 px hit area, a time tip over the thumb): while the hand
  holds it only the console moves, and the screens get **one seek, on
  release** (`seekAt` in player.js, tested), so the letra automática never
  walks the slides in between; Tab gives it the focus and ←/→ step 5 s
  (`SEEK_KEY_SECONDS`; keys.js leaves a focused `[role=slider]` its arrows,
  tested) — a mouse press never focuses it; the live clock (no media) has
  no seek) and below it one row that
  **ends at the centre's edge**: the Prévia (44 % of the centre at first),
  then the **tabs panel**
  (`TabsPanel.jsx`); under the Biblioteca, the Slides and the centre the **No ar**
  strip, the Setlist's column running to the bottom beside it (owner
  2026-10-14, `layout.onairSpan` "columns", the default; "window" puts it
  under every column, edge to edge — Editar disposição › No ar, dock.js
  `withBand`/`moveBand`/`bandOf`; a structure with no Setlist column
  falls back to the window band); the strip is at least `ONAIR_H` (104 px)
  and as tall as its slides' lines (`onAirHeight`; the cards at 13 px,
  each line one line);
  medium and narrow start with it in the tray); the **right column** (`rightW`) is **Camadas, Temas and the
  Setlist, full height** (Camadas as tall as its list, Temas `TEMAS_H`: the
  Setlist gets the rest of the column). **The Notas tab** is the setlist item's notes
  (only when it has some) over the operator's free field, nothing else. **The Programa and the Prévia have no card** (owner 2026-10-14,
  `Panel bare`, `kx-panel-bare`). **The Programa has no header** (owner
  2026-10-16, Rodada E1): its screen's top lines up with the panels beside
  it, and its caption and controls are **one pill inside the screen,
  bottom-right** (`ProgramaPill` in CenterPanel.jsx, `.prog-pill`, Monitor
  children so it rides the Multiview too): a dot in the state's colour
  (red on air, blue locked with the "Travado" word, amber when an output
  failed, grey "Nada no ar"), the title (in that colour, **no "Programa"
  word**, owner 2026-10-14) **only when the player does not name the item**
  (owner's pick A, Rodada F1, `airInPlayer` in caption.js, tested: a video
  or audio playing in the player — the video channel, the projector's
  media, a sound with nothing on the screens — has no title in the pill;
  lyrics, Bíblia, text, a picture, a presentation, a tool, an aviso, Tela
  preta and Logo keep it), the slide "2/6", "2 telas"
  (`health.onAir.short`) — **no "no ar há"** (Rodada F1) — then Voltar ao
  anterior (its popover opens above the pill), the Camadas drawer (only
  while Camadas is in the tray), Multiview and the screen actions Tela
  preta, Logo, Limpar, Encerrar (owner's pick B). As the screen narrows
  (container queries on the screen, `prog-screen`) it **folds once**: at
  560 px only "2 telas" goes; at 480 every `.pp-full` button (Voltar,
  Camadas, the screen actions) goes into a "…" that opens the Programa's
  menu (the same as its right click, Camadas included) — the "…" never
  beside the buttons it holds; over the Multiview it is always folded.
  dock.js gives the Programa `minH` 172:
  the header it lost pays for the player's second row;
  the Prévia is its screen, its caption a badge inside the top-left corner
  (`kx-mon-badge`: "Prévia · nome · 2/6", blue "Prévia · travado" while
  locked), and **no Enviar ao ar button** — Enter, a double click on it
  or its right-click menu send (the Bíblia, the Escola bíblica and the
  Mídia keep theirs). Camadas in the tray is a drawer opened from the
  Programa's pill (or its "…"). The old `order`/`stacks`/widths are only read to build the first
  dock (culto order lib, slides, live, side; stack side = camadas, roteiro). **The tabs panel and the Biblioteca have
  their (+) in the panel's header**, at the level of the title like every
  module's + (Rodada E1, `TabsPlus` in TabsPanel.jsx, `data-tabs-plus`;
  the tabs panel got a thin header of its own, "Painel"; the tab rows
  carry only tabs) (the Biblioteca's also offers Áudios and
  Apresentações, off at first: shown, they take their files out of Vídeos
  and Imagens — `libMediaKinds` in panelTabs.js, tested) that lists every tab with a check mark
  (`TabsMenu` in Popovers.jsx, as Ver lists the modules): checked = shown,
  in the list's order, at least one always, "Restaurar abas padrão" at the
  bottom; saved per computer as `layout.tabs` (`src/lib/console/panelTabs.js`,
  tested; "Restaurar disposição" resets it). The panel's tabs reuse what
  exists, no projection logic of their own: **Notas** (the
  `ServiceItem.notes` of the item in the Prévia / on air, and the Escola
  bíblica teacher notes — these sit under the Prévia's screen when the
  Notas tab is not on screen — and the operator's own free notes,
  `Service.operator_notes`, saved a moment after typing stops and on
  leaving the field; never in the PDF, never on a screen; with no service
  the first one starts the day's draft), **Aviso rápido**, **Timers** (`QuickTools.jsx`; the
  defaults), **Ferramentas** and **Esteve no ar** (the "Voltar ao
  anterior" history). Where the panel shows the Aviso rápido or the
  Ferramentas, Biblioteca › Avisos leaves them out (`elsewhere`); the
  Biblioteca's search-row "+" stays "add content". **One gutter
  everywhere**: `.console` overrides `--gutter` to 6px and the rows and
  stacks use `gap: 0` — the splitter IS the gap, as in `.main` (two cards
  stacked without one keep the gutter as a margin); don't add a second gap
  beside a splitter. The old
  Próximo/Depois lines, the Setlist side card and the Biblioteca's compact
  Setlist tab are gone. **The Slides column is the item in hand, the No ar
  module is what is on air** (owner 2026-10-14, as Holyrics' slide column
  and bottom strip): Slides shows the Prévia's slides whenever it holds an
  item, even a single slide (`handIsPrev` in SlidesPanel.jsx; a theme's
  example is not an item), else what is on air; No ar (`OnAirPanel.jsx`,
  dock id `onair`, in Ver's module switches) always shows the item on air
  and never follows a click elsewhere — one row of cards while it is low
  (scrolling sideways, the card on air kept in view), a list in a column.
  **No ar exists only while lyrics are on air** (owner 2026-10-14):
  text slides on the projector (a song, a passage, free text, an Escola
  material, a presentation's pages; `lyricsOnAir` in dock.js, tested) not covered by Tela preta,
  the Logo, a timer, an aviso, a picture or a video. Otherwise — and
  after Esc — it folds away: `fitDock(…, { gone: goneModules(c.cur) })`
  gives a child made only of folding modules (`MODULES.onair.fold`) size
  0 and no gutter, and the rest takes its room; its place in the dock,
  the tray and the named arrangements are untouched, so it comes back
  where it was. It folds wherever it is placed alone (not as a tab beside
  another module), never while editing the arrangement, and eases in and
  out in 180 ms, like every fold and locked height (`useDockEase` in
  Dock.jsx: each changed cell eases from its drawn px to the new one,
  `dockMotion`/`easesBetween` in dock.js, tested; nothing eases the first
  second after the dock appears, while editing, or with reduced motion;
  never a CSS `flex-basis` transition, which collapsed a neighbour turning
  fixed to 0 px). The Bíblia's
  No ar is another module (`air`) and never folds away (its header's
  chevron still folds it, Rodada F4). In both a click prepares that slide, a double click
  sends it; ↑/↓ walk the Slides column, ←/→ move what is on air. **Lists
  follow what is on air** (0.2.19): the Slides column, No ar, the Setlist and
  the Bíblia's verses (list and grid) keep the card on air and its
  neighbours in view, so they move at the next-to-last card
  (`useKeepInView` + `src/lib/console/keepInView.js`, tested) — don't go back
  to `scrollIntoView` there. **Slides
  and verses are rows** (owner 2026-10-14, the small-screen review; they
  were cards): in a list (the Slides column, No ar in a column, Ler,
  Buscar) each is a row with a 1 px separator and no card, so a short
  screen shows more; the state is still the row's background, never a
  border or a side bar — on air the brand's gold (`--live`; the rest of the
  console keeps red for "no ar"), the Prévia green, the next slide
  `--bg-2`/`--bg-3`; on air and in the Prévia at once, green with the
  number on a gold chip; a note is a mark in the corner. The No ar strip
  (low, across the window) keeps its cards. The classes stay
  `.kx-slide`/`.kx-verse` with `is-prev`/`is-air`/`has-note` (the smoke
  reads them); No ar's are `.onair-card`, so `.kx-slide` is only the Slides
  column. **With the No ar module off screen** (the medium and narrow
  tiers, or the tray), while lyrics are on air and another item is in the
  Prévia, the Slides column has two tabs, No ar · Prévia (`airTabs` in
  SlidesPanel.jsx): the tab only changes what the column shows, the keys
  do as always. The strip's header chevron folds it to its header, like
  every panel (`layout.folded.onair`; its count adds the slide's part).
  **Densidade Automática** is the default (`shownDensity`, layout.js):
  Compacta when the console's grid is under `AUTO_COMPACT_H` (820 px; a
  notebook), with 28 px panel headers (`panelHead`, which the locked
  heights follow); a chosen density wins. Setlist sections are ServiceItems of type `SECTION`: headers that
  take no time and never go on air — use `playableItems`/`plan` from
  `src/lib/console/setlist.js`. A click prepares a *stage* in the Prévia;
  Enter, a **double click** or the Prévia's menu "Enviar ao ar" sends it
  (user decision 2026-10-07; dragging a library row onto the Prévia prepares, onto the
  Programa sends, onto the Setlist adds a ServiceItem). **Dragging in a
  list** (the Setlist, the planner, Camadas, the Editor's elements; Rodada
  E2, owner 2026-10-16) is `useSortable` + `dragGhost.js`: a card of the
  row's size (icon, title, time) follows the pointer — the browser gets a
  transparent drag image, the card lives on `<body>` — a gold slot lights
  where it lands (the dragged row itself, or `.kx-sort-slot` for a drop
  from elsewhere), the rows around glide 180 ms (`measureRows`/`slotAt`/
  `slotTop` in `dropOrder.js`, tested: rows differ in height), and the
  drop settles the card into the slot before the list takes its new order
  (the hook's `keys`; what the drag carried is read at the drop, `carry`).
  Reduced motion: the same states, no animation. Keep `data-sort-row`,
  `data-sort-tail` and `is-sorting`: the smoke drives them with synthetic
  DragEvents. There is no
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
  continua", as in Holyrics; while the video plays as sound only it is
  pressed and red, `is-sound`, Rodada F1) moves a video off the projector into the
  audio channel at the same second (`media.toAudio`; "Mostrar o vídeo" is
  `audio.toMedia`; `videoSwap` in `src/lib/console/player.js`, no
  YouTube) in the same `<video>`, without a gap: `LiveVideo` takes its
  element from the window's pool by url (`src/lib/mediaPool.js`, tested),
  so the player that unmounts hands it to the one that mounts in the same
  commit — don't give `LiveVideo` a `<video>` of its own again. Keys go through `src/lib/console/keys.js` (with
  a test); **B, L, C, / and ? follow the church's "Teclas de uma letra"**
  (`User.letter_keys`: ligadas / com Shift / desligadas, Configurações ›
  Console; `liveAction(e, letters)`, `shortcutsFor`, `keyHint` for every
  menu or tooltip that names one; Ctrl+F searches in every choice); tab
  lists use `onTabsKey` + `tabStop` (kx.jsx, ARIA tabs: roving tabindex,
  ←/→ Home End). **The console's zoom** (Ctrl+= / Ctrl+− / Ctrl+0,
  Configurações › Console › Zoom, 90–150 %, settings.json per computer:
  `electron/consoleZoom.cjs`) runs in the main window's `zoomMode:
  "isolated"`: Chromium's default zoom is per host and every output is on
  the same 127.0.0.1, so never zoom without it — the projector would zoom too; a mouse click must not leave focus on a control (a select
  gives it back on the `change` that ends a mouse pick, never on the
  click, which would close its list: `blurSelectsAfterPick` in
  `src/lib/console/selectPick.js`, tested, in the console and `/Janela`).
  **A focused select is a control, never text** (audit C-03: as text it
  took every live key, and typing a reference switched the Bíblia's
  edition): it keeps ↑/↓, PageUp/PageDown, Space and the letters the
  console does not use (its type-ahead); Enter, ←/→, B/L/C, Esc, / and
  the Bíblia's quick jump are the console's, which prevents the select's
  own default where it acts on one. Esc closes the
  topmost thing open (`escapeTarget`: a right-click menu, the background
  library, a popover, then THE window — one level of its stack, routed to
  the top page's close request — then the Camadas drawer) and with nothing
  open ends at once, fading out as Configurações › Telas e saídas ›
  Transições says (Rodada F2) (music on the audio channel keeps playing; the Fundo
  stays on screen, and the idle look shows only with no Fundo); its toast offers
  Desfazer, which puts back what was on air (`undoEndOps` in
  `src/lib/console/restore.js`); Ctrl+Z runs it too (keys.js "undo", out of
  text fields), and a plain toast waits behind it while its time stands
  still under the pointer or the focus (`toastQueue.js`, `Toast.jsx`; C-13). Camadas' eyes on Texto principal and Fundo
  hide the layer and keep it on air (`layers.hide`/`layers.show`,
  `hiddenLayers`, `layerHidden`; hiding works locked): the next send shows
  the text again, choosing a Fundo shows the Fundo again. The Fundo hidden
  takes a song's own picture with it, never an aviso's or a tool's own
  background (theirs, not the Fundo's; ScreenRenderer's Background). The rundown is called
  **"Setlist"** in the UI; its right click (and Planejar) has "Tirar da
  setlist…" / "Tirar a seção…" (`setlistActions.js`: asks with
  `useConfirm`, then renumbers from the store; 0.2.19). Output windows are never background (occlusion
  tracking off in `electron/main.cjs`): don't reintroduce per-element audio
  taps — the level meters read the system loopback in the console.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. Every write
  reaches every window with the whole row, deletes included.
- **No login.** `auth.me()` is one local operator profile (`entities.User`
  maps to it whatever id is passed). Don't add features that assume
  accounts: the sync between the church's computers (`electron/sync.cjs`)
  goes through a shared folder, with no sign-in. The profile and the church's preferences are read through
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
  console edits it in the library's Gerados (`GeneratorPanel.jsx`); a
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
  a direct write to the store or the live state from the network. **Its
  protocol is `shared/remoteProtocol.json`** (version 2, Rodada G6; the
  server, the console's runner and the phone all code against it, and
  `shared/remoteProtocol.test.mjs` checks it against `REMOTE_ACTIONS` and
  `WHILE_LOCKED`): `POST /api/remote { v: 2, action, args }` (no `v` = a
  version 1 page, which keeps working), at most 4 kB; each action's `args`
  schema (enum, int[min,max], bool, id, str[max] trimmed; unknown keys
  dropped), its `kind` — R reads (no log, no lock check), S puts on air
  (423 while locked; = `!WHILE_LOCKED.has(op)` for its `ops`), T takes
  off (works locked) —, its pt-BR `label`, its `cap` (state's `caps`
  gate the phone's sections) and its `result`; the refusal `codes`
  (locked, nothing, not_found, missing, syncing, blocked, busy, rate) and
  the pt-BR `messages`; timeouts 3 s (8 s for bible*; 504 = outcome
  unknown, never retried). The live state reaches the phone over SSE,
  what only the console knows through `state` (built per request; the v1
  names stay, the smoke reads `items` and `serviceId`) and `library`.
  Additive only: never rename or retype a field; a changed `app` reloads
  the page; an unknown action is 400 and the phone says "Atualize o
  KERYX no computador". A new action is an entry in the JSON first. Each screen says which
  page it shows when it connects (`/api/events?screen=`); the console lists
  the screens connected right now from that (`useOutputs`). Links and QR
  codes meant for other devices come from the network info's `urls`
  (Configurações › Telas na rede), never `window.location.origin` (that is
  127.0.0.1 on desktop). `keryx.isNetworkScreen` is true in such a browser.
- **Media URLs:** the store keeps `keryx-media://<file>`; pages get
  `http://127.0.0.1:7700/media/<file>` from the adapter. Never write the http
  form into the database by other means, and keep checks like
  `startsWith("http")` working. A video's still is `Media.thumbnail_url`
  (taken by the console, `usePosterBackfill` + `mediaPosterCapture.js`,
  sent through `UploadFile`); it rides in the live item as `poster` for the
  Prévia and shows on hover in the Biblioteca.
- **Apresentações are PDF only** (owner 2026-10-16, Rodada F3, "Só PDF"):
  when a PDF reaches the Mídia the console renders its pages with pdf.js
  (`pdfjs-dist`, a devDependency bundled by Vite; its worker and data files
  are served at `/pdfjs/` by `pdfjsAssets` in vite.config.js — never a CDN),
  ~1920 px wide, uploads each through `UploadFile` and saves
  `Media.pages` (`[{ url, w, h }]`, page 1 = `thumbnail_url`):
  `src/lib/pdfPagesCapture.js`, run by `usePagesBackfill` (old rows too; the
  rows say "Preparando páginas 7/12", `PagesMeta`). On air a PDF is a
  content of kind **"presentation"** (`stageFromMedia` →
  `presentationStage`, `src/lib/presentation.js`, tested): one slide per
  page (`{ image_url, label: "Página n" }`, `ref.mediaId`), so ←/→,
  PageUp/PageDown (a clicker), the Slides column, No ar (thumbnails),
  Desfazer, the controle remoto and the network screens walk it like a song.
  ScreenRenderer draws the page `contain` on black — no theme, title, Fundo
  or corner logo; the Palco shows the page and the next one; Letras and
  Transmissão leave it out; Mostrar has "Apresentações". PowerPoint is never
  converted: choosing one says `PPTX_HINT` (Salvar como › PDF), old rows stay
  listed as "Salve como PDF" and cannot go on air (`stage.blocked`). PDFs
  are out of "Tocar todos" (`playsInSequence`). The media layer no longer
  draws a PDF (no iframe, no "Baixar apresentação").

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

Outputs (projector, stage, ...) render the live state, so either the console (`window.open`) or the main process (`outputs.open`, `keryx:displays:open`, "Abrir ao iniciar") can open them; `electron/outputs*.cjs` places and tracks them. **An output full screen on a monitor other than the console's stays
always on top** (0.2.19, as Holyrics; `staysOnTop` in `electron/outputs.cjs`,
tested): nothing can cover the projector; never as a window or on the
console's own monitor. **An output whose monitor leaves waits hidden**
(audit WIN-02, 2026-10-16; a cable, the projector off, Win+P): never a
window on the console's monitor (made full screen it has no frame, no
taskbar button and no pointer, and it covered the console and its
banner). `resolvePlacement` gives `{ mode: "hidden", missing: true }` for
a chosen monitor that is off, and for "auto" when the window was on a
monitor (`waiting`: the manager knows what it did to the window); opened
with only the console's monitor, "auto" is still a window the operator
can see, and "Em janela" never hides. The window stays open (what is on
air keeps playing; `list()` says open + missing, so the banner says
"Reconectando…" and Abrir ao iniciar keeps working; Saídas does not bring
it forward), is made hidden when it opens that way (`windowOptions`
`show: false`), and returns full screen when the monitor does: moved
while hidden, shown, then full screen. A monitor change that leaves an
output full screen where it is (`inPlace`) does not re-present it (it
flashed the projector, WIN-16), and the pointer hides only while an
output is full screen (or waiting). **While any output is open the
displays stay awake** (WIN-01): one `powerSaveBlocker`
`prevent-display-sleep`, started with the first output and stopped
after the last (`keepAwake` in outputs-manager.cjs, injected in tests;
`keepsAwake()` for the smoke) — Chromium holds a wake lock only while a
video plays, so a verse through a sermon went black. **The Saídas popover is one switch per local row** (2026-10-13): ligado = the window exists, the name of an open output brings it forward, states are plain text (`rowStatus` in `src/lib/console/outputs.js`, tested) and the banner stays the active alert; network rows keep Esquecer. **Remover saída** (Telas e saídas; also "Adicionar saída" there and in the popover) hides an output from the popover, the tabs and Verificar and never opens it at launch: the flag is `removed` on the electron settings `"outputs"` entry (per computer, carried by Exportar/Importar ajustes), the OutputPref row stays, so re-adding restores everything; `/Projection` is not removable (the Prévia mirrors it and send auto-opens it), and a network screen showing a removed page keeps working and keeps its row. Each renderer output (Projeção, Letras, Vídeo, Avisos) has its own settings, one `OutputPref` row per page path shared by the window and network screens showing that page: pages draw through `OutputScreen` (`src/lib/outputPrefs.js`, tested); no row means the output exactly as before. **Telas e saídas is a thumbnail grid** (owner 2026-10-13, no more vertical tabs — old `telas/<tab>` links just resolve to the section): one card per output showing a real still of what that screen draws now (`OutputPreview` in OutputPrefCard.jsx — the card and the grid share it; connected network screens get the same still in Telas na rede); the card keeps only the placement (Automático/Tela N, Abrir ao iniciar, Abrir/Fechar; Remover no clique direito), and clicking the thumb opens the Editor on that screen — every visual setting lives there. **Mostrar** (`hidden_kinds`) leaves kinds out of one output (Letras, Bíblia, Texto, Imagens e vídeos, Apresentações, Relógio e timer, Avisos, Aviso rápido; `hideKinds`): the layer goes, the output shows what is under it or its idle look, and a song's playback track keeps playing (`track`); the console's Prévia says when the output it previews hides the prepared kind (`stageHidden`). A new kind of content gets its entry in `SHOW_KINDS`. **The Aviso rápido is one bar on every screen, in each screen's look** (Rodada E3, owner 2026-10-16): `alert.show` is drawn by `AlertBar` (`src/components/screen/AlertBar.jsx`, `.ks-alert` in screen.css) — inside ScreenRenderer, over a design (LayoutRenderer's `alert`, never inside its Projeção element), over the Vídeo's clip and beside the Palco's StageScreen (`AlertLayer`, a fixed box: `.net-stage` pulls its children into the flow); the old framer-motion pill (AlertOverlayRenderer) is gone, don't bring a second look back. Each output picks Posição (Alto/Baixo), Estilo (Faixa/Pílula), Cores, Tamanho (P/M/G) and Entrada (Deslizar/Aparecer/Nenhuma) in the Editor's Ajustes › Aviso rápido: flat `alert_*` keys of `OutputPref.options`, read by `alertOptions(pref, page)` (tested; no key = `ALERT_DEFAULTS`, the amber band across the top as the Projeção always drew it — except **the Palco, whose bar starts at the bottom** (owner 2026-10-16, `alertDefaults`: its header with title, Tom, BPM and clock is what the musicians read, and its old pill sat there; its Ajustes can still say Alto) — so every caller passes the page) and carried as `alert.look` by `prefState` (only when not the default, so no row = the same state) or `alertOf` (Palco, Vídeo's clip); the entrance respects reduced motion, and a type `"alert"` stays red. Every view keeps the alert (views.js: Vídeo and Avisos too, so their Mostrar offers Aviso rápido); the Palco shows it while a song is on air, the Pastor's page never (`showsAlert`). The Programa monitor draws the raw live state, so it shows the default bar. **Exportar / Importar ajustes das saídas** (Telas e saídas) is one JSON file with every output's placement and every page's `OutputPref` settings (`src/lib/outputsFile.js`, tested; the theme travels by name): the main process only saves and reads the file (`keryx:displays:export-file` / `import-file`, 1 MB at most); the console checks it, says what will not come out the same on this computer, and applies it through `displays.set` and `OutputPref` (rows updated or created, never deleted). A new setting on `OutputPref` goes in that file too (the Aviso rápido's `alert_*` options ride in `options`, checked both ways by `cleanAlertOptions`). **Cada tela é dona do seu desenho** (owner 2026-10-13; reverte a decisão
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
**Os editores são páginas DA janela** (Rodada C, owner 2026-10-14, "uma
janela, com Voltar"): todo `openEditor({ screen|theme, from })`
(`src/lib/editorWindow.js`) cai no host que a janela registra
(`setEditorHost`: a console, ou a `/Janela` de uma página destacada) — com `from` (o título de onde veio) ele empurra um
nível NA janela em cena ("← Temas", "← Telas e saídas"; de dentro do
Editor da tela, "Editar tema…" empurra o Editor de temas, nível 3), sem
`from` abre como janela própria; Esc volta um nível, o (x) fecha a
pilha, a janela cresce para o tamanho Editor (`.is-editor`) e a console
desenha a barra (WinBar: título, ⧉ Destacar, ×). Na console cada editor
é uma página (não há mais o alternador Temas | Telas nem o rodapé do
diálogo; o guarda de não salvo pergunta via `useConfirm`, e trocar de
tema/tela também). **"Destacar em janela"** (o ⧉ da barra, como em toda
página da janela — Rodada F5) passa primeiro pelo guarda de não salvo e
abre o editor numa `/Janela` própria (`?page=theme&theme=<id>` ou
`?page=screen&screen=<path>`; `openEditor({ …, detached: true })` vai para
lá também), a mesma página hospedada, com o guarda de fechar do Electron
(closeGuard). O antigo `/Editor` (`Editor.jsx`, `EditorHost`, o rodapé
com o alternador Temas | Telas e o guarda de dois toques) morreu: a rota
`/Editor` cai na `/Janela`. Os dois corpos:
  - uma TELA (`ScreenEditor.jsx`): menu vertical com as telas
    (`EDITOR_SCREENS`), o canvas edita o design DELA com os ajustes reais
    da própria tela vestindo a prévia (prefState + kp-out, ou só a Escala
    no Palco/Pastor), e os ajustes visuais moram na mesma janela
    (`OutputPrefCard inEditor`; a coluna é `.nv-scroll.cfg`, então o
    card tem o estilo das Configurações). **Clicar numa tela já é editar**
    (owner 2026-10-13): sem design, o canvas abre semeado com o desenho
    pronto da página (`seedFor` → `seedLayoutId` em layouts.js, testado:
    `factory:palco`/`pastor`/`projecao`; Letras, Vídeo e Avisos
    começam de `factory:tela`, a Projeção em tela cheia, como as páginas
    delas se desenham — Rodada E3),
    a semente é a base (`saved`), então só mudança real é "não salvo" e
    nada se grava sem "Salvar a tela"; "Voltar à página padrão" (cabeçalho,
    com design próprio ou mudanças) zera a linha e semeia de novo. Não há
    mais "Desenhar esta tela"/"Começar do zero". A Transmissão não tem
    canvas, só os ajustes. **Todas as telas são iguais no Editor** (Rodada
    E3, owner 2026-10-16): a de Avisos (avisos em sequência) tem desenho
    e ajustes como as outras; o canvas de uma tela que só mostra avisos
    ganha um aviso de exemplo quando não há aviso no ar (como o still de
    Telas e saídas), e Cifra/Nome da parte só aparecem onde a vista mostra
    letras (não em Vídeo nem Avisos).
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
query). **The Slides and the Biblioteca have a minimum width**
(`MODULES.slides.minW` 300 and `MODULES.lib.minW` 260 in `dock.js`, tested;
there is no `LIMITS` object any more): squeezed, a 2-line verse wrapped
into 3 and looked split wrong, and the Biblioteca's tabs read "Le…, Ima…";
the splitter clamps there and the narrow tier's Biblioteca-over-Slides
column takes `slidesW` too. 260 holds the default four tabs with room
(the (+) is in the header since Rodada E1); **a tab row that does not fit
breaks into a second line** (`.tabrow` flex-wrap, console.css: Áudios and
Apresentações on) for the Biblioteca and the panel beside the
Prévia alike (one `TabRow`; neither is a measured/`locked` module, so the
extra line only pushes the list down). A slide keeps the
editor's lines (owner 2026-10-14, replacing "never an ellipsis"): each line
stays one line and a line too long for the column ends in "…" (`SlideText`
in SlidesPanel.jsx, `.kx-ln`); the whole text is the card's tooltip and the
Prévia. Verses (prose) still wrap. **Lines per slide** (owner 2026-10-14):
the song editor's Estrofe / 2 / 4 / Outro (1–12, `LinesPicker`; also the
import preference) is `Song.lines_per_slide` (`linesLimit`), a setting —
it never rewrites the lyrics (the old `reflowLyrics` did, one way, and is
gone), so any choice in any order works. Saving rebuilds the Prévia and
`content.update`s the song on air (`songSaved` in Console.jsx). On every
screen one line of the lyrics is one line: ScreenRenderer shrinks a song
slide's font so its longest line fits (`useFitWidth`, a hidden probe,
`fitScale` in lyricFit.js, down to 45 %; only past that it wraps).
**Chords and part names are each screen's choice** (owner 2026-10-14):
`lyricsOptions(page, pref)` in outputPrefs.js (`OutputPref.options.chords`
/ `.labels`; on for the Palco, off for every other output and the Pastor)
rides to the renderer as `content.show` via `prefState`; the old "Refrão"
heading over chorus slides is now `show.labels` with the part's own name.
Saved slides keep their `chorded` twin (before, saving lost the Palco's
chords; `withChordedTwins` fills old saves from the lyrics). The editor
inserts chords at the cursor (Acorde, the Tom's chips from `keyChords`) and
transposes the whole song (Tom − / +). A new kind of element is an entry in
`ELEMENT_TYPES` (with its `group`) plus its case in `elementText` or the
renderer's `Body`. **Sincronizar e letra automática** (owner 2026-10-15, Rodada D4): a
song's marks are `Song.slides[].start` (seconds), made in **Sincronizar**,
a page of THE window (`SyncView.jsx`, nav page `sync`, Editor size) pushed
from the Editor de música's "Sincronizar…" ("← Editor de música"): the
media big with the slide playing over it, a time line with a draggable
marker per slide, the slides with typed times, − / +, Aqui, ×; recording
marks from the chosen slide on and never wipes the others; no media = a
clock (Ao vivo); Aplicar takes the marks to the editor's draft, its Salvar
keeps them (pure logic `src/lib/console/lyricSync.js`, tested). The same
marks follow three sources on air — `content.follow` in
`shared/live-state.mjs` (tested): the song's **video** (video channel),
its **playback** (now sent to the **audio channel**, `stage.playback` →
`audio.show`; `content.audio` is no longer sent) or the **live clock** the
operator starts with "Iniciar letra automática" in the player. The console
moves the slide (`useConsole`, `followIndex`, `content.goTo` with
`auto`); **the arrows never turn it off**: any other `content.goTo`
re-syncs `follow.offset` so it goes on from the new slide; the player's
chip (`FollowChip`, `followLabel` in player.js) pauses/resumes on
purpose. The Biblioteca says "sincronizada". **Timers prontos** (Avisos › Ferramentas › Timer): 5, 10, 15, 30 and 60 min always, plus the church's own (`TimerPreset` rows, `src/lib/console/timerPresets.js`); a click prepares the timer, a double click sends it, and a timer on air takes or gives time with `tool.adjust` (−1, +1, +5 min; refused while the screens are locked). **Multiview** (the Programa's pill, or its right-click menu) turns the Programa monitor into four outputs at once, each what is on air as that output shows it, with its own `OutputPref` (Palco and Pastor in their own layouts), and where it is on screen now from the output health rows; a quadrant's label picks its output (`src/lib/console/multiview.js`, tested; saved with the layout as `multiview`/`mvTiles`). Only the Projeção quadrant (else Vídeo) plays videos. The Prévia's output picker (the six buttons beside it) is gone (user decision 2026-10-12: the Multiview shows every output): the Prévia is the prepared stage as Projeção will show it, with Projeção's own settings.

The desktop app's real data is in `%APPDATA%\KERYX` — never point a test at
it; smoke runs use a temp `KERYX_DATA_DIR`.

Secrets (Base44 tokens for the one-off import) are the user's to set in their
shell. Don't ask for their values and don't write them into tracked files.

## Verifying a change

While working, the loop is `npm test`, `npm run lint`, `npm run build`
and the browser preview — none of them open windows. **The desktop smoke
(`npm run desktop:smoke`, or `KERYX_SMOKE=1 npm run desktop:dev` when
touching `src/api`) runs once per release, never per task** (user
decision 2026-10-13: several sessions each ending in a smoke ran it over
and over): it opens real projection windows on their monitors, takes focus
and plays a test tone for ~5 minutes. Changes are made in batches across
sessions; a feature session stops at test, lint, build and the preview,
says what only the smoke (or `desktop:dev`) can confirm, and does not run
it or offer to. When the user says in some session that the batch is
ready for the release, that session runs the smoke once, on master with
every merged PR, and tells the user right before it starts. The quick look is the browser preview (`npm run dev`, the
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
  "Plan KERYX phase 6"). It runs the batch's one smoke first, on master
  with every merged PR (see "Verifying a change"), and writes that
  version's note (`docs/release-notes/<version>.md`) before the build. Every other session
  ships features as normal PRs but never changes `version` in
  `package.json`, never opens a `release/<version>` branch or PR, and never
  runs `scripts/release-upload.cjs` (or `electron-builder --publish`). A session that sees a claim by another
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
- **The build never publishes** (`electron-builder --publish never`):
  `node scripts/release-upload.cjs <version>` checks `release/`, refuses if
  `v<version>` exists in any state, and uploads it as **one draft**, the
  installer first and `latest.yml` last. `--publish always` is out: its
  parallel uploads each created the release (two drafts in 0.2.15 and
  0.2.16).
- **An upload makes a draft, never a public release.**
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

## Merging PRs (one at a time)

- **One merge at a time.** Merge a PR only after the previous merge is on
  `master`. Never merge two PRs in a row without re-checking the second.
- **Check `master` right before each merge.** A green CI run only covers the
  `master` it ran against. If `master` moved (the PR shows "out-of-date with
  the base branch", or another PR merged since), update the branch with the
  base (`sync_with_base_branch` in a worktree, or merge `master` in), wait for
  CI to pass again, then merge.
- **Conflicts are resolved in the PR's own session**, then tested again
  (`npm test`, `npm run lint`, `npm run build`) before the merge.

## Watch out for

- **The console has no ticking clock** (`c` has no `now`: it re-rendered the
  whole console every second of the service). What shows the time calls
  `useLiveNow` itself (one shared timer per interval, `useLiveState.js`; the
  top bar's `Clocks`, the timers, the player); `ScreenRenderer` and
  `LayoutRenderer` without `now` keep their own, ticking only while they
  draw something that counts; a one-off read is `keryx.live.now()`.
- **Column names are the entity field names verbatim**, including camelCase
  (`"serviceId"`, `"startedAt"`). Quote them in SQL.
- **Ids are text, not uuid.** Imported Base44 rows keep 24-hex ids; new rows
  get a uuid string. Never cast `id` to uuid.
- **Unknown fields are dropped on write** (logged once per field in the main
  process), not rejected. Unknown fields in a filter or sort are errors.
- **Routes are in `src/App.jsx` only:** `/Console`, `/Janela` (a detached
  page of the console's window; `/Editor` lands there too; desktop only)
  and the output pages
  (`/Projection`, `/LyricProjection`, `/StageView`, `/VideoProjection`,
  `/CommunicationProjection`, `/PastorView`, `/StreamView`), the same output
  pages for network screens. A new output page goes there, in
  `electron/outputs.cjs`, its one factory name in `shared/outputNames.json`
  (main, the network list and the renderer all read it; the stored `name` of
  an output the operator renamed still wins) and, if screens on the network
  may open it, in
  `NETWORK_SCREENS`, and in a group of `GROUPS` (`src/lib/console/outputs.js`:
  Público, Palco, Transmissão). `/StreamView` (Transmissão) is network only:
  an OBS Browser Source, a transparent lower third, text only
  (`src/lib/streamCaption.js`); it is not an output window.
  **Every page is a lazy chunk** (Codex audit 2026-10-16): `lazy()` with
  its Suspense fallback (an output black, Transmissão transparent, the
  console's ground elsewhere — never a spinner), so an output loads the
  renderer and never the console's code. `scripts/bundle-budget.cjs` (a
  Vite plugin, tested) fails the build when an output's JS passes its
  budget or a stylesheet leaves the entry: every stylesheet is imported in
  App.jsx's list, in the old bundle's order (Tailwind last), so splitting
  changed no cascade. A new network page goes in its `OUTPUT_PAGES` too
  (`npm test` checks it against `NETWORK_SCREENS`); a heavy library the
  console needs only on demand is a dynamic `import()` (jspdf, pdf.js).
