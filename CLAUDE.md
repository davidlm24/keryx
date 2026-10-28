# KERYX — working notes

Church worship projection app (lyrics, Bible, media, multi-screen live
projection). Vite + React 18 + Tailwind + shadcn/ui, packaged as an
offline-first Electron desktop app with a local SQLite store. Desktop only:
the web build on Supabase was retired (2026-10-08, like Holyrics or
ProPresenter, the app is the program on the church computer); `supabase/` is
kept, unused, for a possible cloud backup (the sync between the church's
computers is the church's Google account, no server of ours:
`electron/sync.cjs`). Plan:
`docs/desktop-architecture.md`. Read `README.md` first — it covers the
stack, how to run it, the backend wiring, the data model and the known gaps.

## Ground rules

- **UI language is Brazilian Portuguese (pt-BR).** All user-facing strings,
  labels and toasts are pt-BR (tela, salvar, arquivo, excluir, celular,
  cronômetro, usuário) — the church is Brazilian; do not use pt-PT forms
  (ecrã, guardar, ficheiro, eliminar, telemóvel). Do not introduce English UI
  copy. Code identifiers and comments are English. **The one exception is
  "Autoplay"** (owner 2026-10-21, Rodada O3): the label of the Setlist's
  switch is that English word, by the owner's explicit choice; its tooltip,
  toasts and every other mention stay pt-BR ("Avançar sozinho"; the
  aria-label is "Autoplay: avançar sozinho", the visible word first). Don't
  add another English word on the strength of it.
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
  Esq./Centro/Dir.; "Do computador…" (never "Enviar arquivos"); "Link do
  YouTube…"; Aviso rápido; Atalhos (one place: Ajuda); "Autoplay" (the
  Setlist's switch, the one English word, Rodada O3: see above); "Temas e
  fundos" (the section's one name, "Fundos" the library alone); "Instalar e
  reiniciar"; Ver › "Editar disposição" (o arranjo do console — "layout" é
  das telas). Heading hierarchy: the page title is the Panel's header; a
  listhead is a smaller sub-title (its "· hint" never in caps, console.css)
  that NEVER repeats the page title, only where a section has 2+ groups;
  hints must not restate the row's own options.
  **One name, one icon, one key per action in every menu** (owner
  2026-10-20, Rodada M1, "todas as trocas"): the actions that appear in 2+
  menus are `MENU_LABELS` in `src/lib/console/menuLabels.js` (label, icon,
  the key's name) and each menu builds them with `menuItem(id, extras)` —
  the bar (menuBar.js, so the Menu button too), the (+) menus, the row menus
  of Biblioteca, Setlist, Slides, No ar, Bíblia, Mídia and Escola, the
  Prévia's and the Programa's; only a one-off label is written by hand.
  `menuLabels.test.mjs` fails on a shared action spelled its own way and on
  a table entry no menu builds. The rules it holds: "…" ends a label only
  when the command asks for more before it acts (a file, a link, a
  confirmation); one that opens a page has none (Nova música, Novo aviso,
  Planejar o culto). Every "Excluir…" is the `trash`, every "Tirar…" the `x`
  (Camadas' overlays included), "Remover saída" the trash too; the ⋯ glyph
  only opens a menu ("Editar no planejador" is the `edit` pencil); "Pôr na
  prévia" everywhere (never "Selecionar"). A menu shows a key only where it
  works and always from `keyHint` (keys.js: send = Enter, end = Esc, delete =
  Delete and rename = F2 where a list handles them — the Mídia and the Escola
  today —, the letter keys by the church's choice), never typed by hand
  (`kbd: "F2"` fails the test). "Enviar ao ar" shows Enter in every row menu;
  "Encerrar…" shows Esc (which ends at once, the menu item asks first).
  "Planejar o culto" lives in the bar's Culto, the Setlist's button and the
  service clock — not in the Setlist's (+); "Atalhos" only in Ajuda (not Ver).
- **`src/components/ui/` is generated shadcn/ui.** It is excluded from lint and
  from editor type checking. Don't hand-edit it; add components with the
  shadcn CLI (`components.json` is configured) or wrap them instead.
- **List rows are inset rounded cards** (UI rule, owner 2026-10-14): every
  `kx-row`/`kx-layer` in the console (Biblioteca, Setlist, the tabs panel,
  Camadas, Configurações' menu, the views) sits `--space-1` in from its
  column with `--radius-control`, 2 px apart, like the verses — the hover
  and the states never run edge to edge. One rule, the Row component in
  `docs/design-system/components/bundle.css`; don't override it per list. Edge to edge only where the owner asks (the Slides
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
  (`--control-sm`) and **8 px apart, as in the windows' bar** (`.win-bar`;
  owner 2026-10-16, in both environments); a band under a header (the
  Biblioteca's search row, the Bíblia's Recentes/Favoritos/Anotações) is
  36 px (`--band`), its controls 28, 4 px in and 4 px apart (font sizes,
  layers, heights, the fold's motion and the chrome over a screen are
  tokens since Rodada DS2: docs/design-system.md › Tokens, guarded by
  `src/lib/tokens.test.mjs`); anything with a box
  of its own — list cards, verse cards, the cells of Livros/Capítulos/
  Versículos, the Temas tiles, the search field, tabs, the No ar agora
  monitor — sits 4 px
  (`--space-1`) in from the column, with its text at 12 px; listheads and
  sub-titles ("Selecionado", a Temas heading inside Camadas) at 12 px;
  Capítulos, Livros and Versículos are as tall as their cells (Rodada P,
  P4-3), each up to 40 % of the column (`Measure` → the Bíblia's `fitDock`
  `locked`, Console.jsx), and scroll past that; with all three locked down a
  column the last takes the rest; every panel header is 36 px, 32 in
  Compacta (owner 2026-10-21, Rodada O5: the tokens `panel-head` and
  `panel-head-compact`; `panelHead` in layout.js and dock.js `PANEL_HEAD`
  keep the locked heights in step), one line — a header never wraps into a
  taller block. No text a panel does not need (owner 2026-10-16, the Bíblia
  review): no hints in headers, no "installed here" lines, counts inside
  the lists they count (the Bíblia's dropdowns), never on their button.
  Don't give one panel its own inset. **Configurações' groups** (Rodada H1,
  owner 2026-10-19; every section but Igreja and Sobre is regrouped with
  `CfgGroup`): the order inside a page is identity first, then what changes
  most, then the rare; a page's first area is a plain heading
  (`fold={false}`: Telas, Conexão, Temas padrão, Passagens, Planejamento,
  Disposição, Andamento, Backup) and only the areas after it fold, the rare
  ones starting closed (Transições, Som e YouTube, Arquivo de ajustes, Livros
  e importação, Equipe de louvor, Atalhos, O que vai e o que fica, Código da
  igreja, Dados); what is chosen goes in the group's `summary` — a plain
  one-line string the section computes from its own values (`outputsSummary`,
  `syncSummary`, `src/lib/console/cfgSummaries.js`; tested), shown only while
  closed — never in a header hint; a title never repeats the page's (Backup,
  Dados and Atualizações are accepted), is 13 px `fg-1` at 600 in sentence
  case, not gold, and a static group has no chevron slot (Rodada O10 = C,
  owner 2026-10-21); **the first static group right under a panel's title
  shows no title of its own** (Planejar o culto's Dados under Culto, the song
  editor's, the Editor de temas' Nome e padrão, the first area of a
  Configurações section): one rule in console.css by structure, the title
  kept for screen readers and the search; every new `CfgGroup k` goes in
  settingsSearch.js.
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
  **Grupos que abrem e fecham** (owner 2026-10-19, Rodada H0; the owner's
  "Nem tudo precisa colapsar"): the areas of Configurações and the editors
  are `CfgGroup` (settings/parts.jsx: `{ id, k, title, summary, actions,
  defaultOpen, fold }`), an h3 header whose button carries the chevron and
  the title, a one-line `summary` of what is chosen while closed (pure,
  tested, like `transitionsSummary` in transitions.js), the `actions` on
  the right; a page's first area is `fold={false}` (the same heading, no
  chevron, never folds), the rare ones start closed (`defaultOpen={false}`;
  Transições is the pilot). The body stays mounted and inert when closed,
  so the search still finds its rows: a jump into a closed group opens it
  at once (`CfgFlash` carries `{ flash, pending }`; SettingsView's find
  loop skips rows inside `.cfg-group:not(.is-open)`). What the operator
  opened or closed is this computer's — localStorage `keryx.cfg.groups`,
  only the deviations from each default (`src/lib/console/cfgGroups.js`,
  tested; `useCfgGroup`, one store per window, a detached /Janela follows
  through `storage`) — never `layout` (the editors have none, Restaurar
  disposição must not reset it). H1, H2 and HF3 build on it: its API is the
  contract. **The other pages of THE window** (Rodada H4) use `CfgGroup`
  too (Editor de música, Planejar o culto, Aviso, Escola bíblica; ids
  `song.*`, `planner.*`, `notice.*`, `school.turma`; summaries in
  `src/lib/console/pageGroups.js`): its CSS is the Group component of
  bundle.css (`kx-group`, beside the old `cfg-group` names), scoped `.kx`,
  not `.cfg`, so any column can hold one.
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
- **Sincronização entre computadores** (owner 2026-10-16; "Google Drive
  direto" 2026-10-26/27, PRs 1–4; docs/desktop-architecture.md §8b): the
  church's Google account, entered inside KERYX on every computer, as in
  Holyrics; no server of ours, last edit wins per row. **There is no shared
  folder and no church code any more** (PR 4, 2026-10-27): don't bring
  either back. The engine is `electron/sync.cjs`; **what it shares goes
  through the store seam `electron/syncStore/`** (`index.cjs` is the
  interface — list, read, putNew, putWhole, putIfAbsent, remove,
  upload/download —, built for Drive's rules: objects never appended or
  renamed, names not unique, a listing that lags). Adapters: `drive` (the
  account's hidden `appDataFolder`) and `fakeDrive` (in memory, the
  tests' Drive; never `fs` in a sync test). A burst of edits (20 s,
  `writeWaitMs`; `pass({ flush: true })` for Sincronizar agora) becomes ONE
  new object, `changes/<pc>/<seq>.jsonl`, ending in
  `{"keryx":"end","lines":n}` (the count is checked); a number is pruned
  from the outbox only once confirmed whole (`out.whole`), and one never
  confirmed is removed and sent again; listings never stat what was read
  (`list(…, { quick })`, `stat(id)`); readers keep the `<seq>`s read to their end
  as ranges (`sync.state.seen`), copies of one name by id, and only an
  object without its end line by bytes (`part`: cut short). `state/<pc>.json`
  and `computers/<pc>.json` are replaced whole. **The sign-in**
  `electron/googleAuth.cjs` (code + PKCE S256, a one-request listener on
  127.0.0.1, the system's browser, never a KERYX window; scopes
  `drive.appdata openid email`; the refresh token sealed in settings.json
  `"google"`, the access token in memory; `invalid_grant` = `{ email,
  refused }`, the engine's state "auth" and the bell, no retry loop; Sair
  revokes), the client in `electron/googleConfig.cjs` (Google requires the
  client secret even for a desktop client; it is **never in git**: the
  builder's shell has `KERYX_GOOGLE_CLIENT_SECRET`, electron-builder's
  beforePack writes the gitignored `electron/googleSecret.json` and afterPack
  removes it, `scripts/google-secret.cjs`; no variable = the build stops,
  `KERYX_BUILD_WITHOUT_GOOGLE=1` for a test build); the adapter
  `electron/syncStore/drive.cjs` (REST over fetch, `appDataFolder` only, one
  full listing then `changes.list`, multipart create, resumable media in
  8 MB chunks, Range downloads, backoff with Retry-After; tested against
  `electron/fixtures/fakeDriveServer.cjs`). **Compaction** (`compact` in
  sync.cjs, in `collect`): every 14 days a computer's own confirmed objects
  older than 14 days that every computer that counts has read (v2 state)
  become `changes/<pc>/<lo>-<hi>.jsonl` (last line per row, every User line,
  the end line with `range`; read back before the originals go); readers
  take a range as read when all its numbers are (`parseChanges` → `{ seq,
  hi, range }`: use `hi` where the highest number matters). Sessions never
  sign in to Google (`docs/google-drive-setup.md`, the owner's steps).
  **The account is the key** (owner 2026-10-27, item 4; §8b item 9): 32
  random bytes in the account's `keryx-sync.json` (v 2: `key` beside
  `id`/`check`/`removed`/`mac`), made by the first computer that enters
  (`joinDrive` in syncPairing.cjs, `putIfAbsent`, first made wins) and read
  by the rest; every line is signed with it (damage, not a password).
  `googleSignIn` does it all: Drive, join or make the key (`joined: {
  created, sent }`, status `accountNew`), off the Desconectar list,
  `store.snapshot`; `googleCancel`/`googleReopen` for the waiting browser
  (the IPC error carries `code` "canceled"). Kept as `sync.drive = { email,
  id, key, joinedAt, accountNew }`, sealed with safeStorage. A computer
  with the key writes a missing or damaged file back with the same key; a
  key that changed there, or one that will not open here, is joined again
  by itself on a pass; only a sign-in readmits a desconectado one (G3 = A),
  and only from a Desconectar made before it (a readmit Drive failed is
  retried by the passes; one made after the sign-in stays).
  The threat note (Desconectar is not a revocation: remove KERYX's access in
  the Google account) is in §8b. Configurações › Sincronização's main side
  `electron/syncControl.cjs` (`keryx:sync`: status, now, setPaused,
  remove/restore, google*, leave), the section `settings/SyncSection.jsx`
  (pt-BR status in `src/lib/console/syncView.js`, one poll in
  `useSyncStatus`). **The page** (PR 3, owner's mockup "Sincronização ·
  conta Google", 2026-10-26, G1–G5 = A): `googlePage` picks one of Entrar
  com Google (no account), "Termine a entrada no navegador" (Cancelar,
  Abrir de novo; Google's 5 minutes), the account (Conta, Andamento with
  Sincronizar agora, **Espaço da conta always on screen**, G2, from
  `googleStatus().quota` with `mine` = the hidden folder's bytes;
  **Dispositivos conectados** with Desconectar… — G3: that computer stops
  until someone enters on it again, the `removed` list —, a computer not
  seen for `HOLD_DAYS` marked "segura a limpeza de arquivos antigos", O que
  vai e o que fica, Músicas repetidas, Sair da conta…), board 4's problems
  on top (`pageProblems`: Entre de novo, desconectado, an account with no
  KERYX data yet — Trocar de conta / É esta mesmo, kept per e-mail in
  localStorage `keryx.sync.accountOk` —, the space above 90 %), and **a
  computer that synced by the folder on 0.2.21** (settings `sync.folder`):
  it does not sync (`store: null`, its outbox records nothing) and shows
  only the banner (G4: its path, 3 steps, "Até entrar, este computador não
  sincroniza com os outros"), the cloud red, the bell once (`googleNoticed`);
  entering merges what it has and forgets `folder` and its old
  `pairing`; nothing in the folder is read, written or deleted. Entering is
  `signInWithGoogle` (`src/hooks/useGoogleSync.js`), the same from the page
  and the cloud; G1: a computer with songs merges at once and one toast
  (`joinNote`) says how many came and went. **The cloud beside Ver is always
  there** (G5, `SyncCloud` in TopBar.jsx): its dot green em dia, amber
  esperando or sem internet, red precisa de você, grey without an account
  (`cloudView`); a click drops `SyncPop.jsx` (open "sync"; the state and
  its age, Conta, Internet, Esperando = `status().waiting`, the outbox,
  Chegando = `status().arriving` with a bar, Computadores; Sincronizar
  agora, or Tentar agora / Entrar com Google, and Ver tudo). The browser
  preview fakes every state (`src/api/backends/previewSync.js`,
  localStorage `keryx.preview.sync`); never a real sign-in. Joining merges
  (`store.snapshot`), never replaces; likely duplicate songs are
  `shared/syncDuplicates.mjs` (Juntar em uma / Manter as duas,
  `User.song_duplicates_kept`; "parece repetida" in the Biblioteca).
  Restoring or importing on a computer that syncs asks ("Voltar todos", by
  default, or "Só este computador", which leaves). The outbox records only
  while syncing; what a newer version sends is parked (`_parked`) and a
  remote row never erases a column its sender does not know. Tests use temp
  stores and the fake Drive (the fake Drive server for the Drive adapter's
  and syncControl's); only the owner's real account confirms the rest
  (docs/checklist-pc-igreja.md, item 8).
  **What travels** (Rodada G7): every `SYNC_ENTITIES` row and every
  `keryx-media://` file any of its fields names. The whole-church test in
  `electron/sync.test.cjs` (`churchInABox`: a row of every synced entity,
  every file field filled, three stores) and its drift check hold the jsonc
  to it: a new field that may hold a file is filled there or listed in
  `NOT_A_FILE`, and a file field of a computer's own entity in `STAYS_HERE`.
  **`OutputPref` stays on each computer** (`ON_EACH_COMPUTER` in
  syncScope.cjs) until the end of Rodada G10, which replaces its content
  fields first; whatever it keeps per computer (placement) stays local.
  **Bible text never travels**: each computer's `computer.json` lists its
  installed editions (`bibles`, names only), and Bíblia e músicas says
  "Falta a NVI aqui" with Instalar aqui (`biblesMissingHere`); an edition
  of the church's own asks for its file instead (`own`). The section's
  "O que vai e o que fica" is `GOOGLE_GOES`/`GOOGLE_STAYS` in syncView.js:
  change it with the scope.
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
  `screen_transition`, `pause_fade_ms`, `enter_transition*`): an op that starts an item with sound (`video.show`,
  `audio.show`, `audio.playlist`, `media.show`, `media.playlist`; a video,
  audio or YouTube not at volume 0, `heard`) stops the other sound layers
  (`hush`), cut or fading out — the stopped item rides in `live.leaving`
  (`{ layer, item, at, until }`, dropped by the next change) — unless its
  `transition` says `mix` (Tocar junto; no transition = the same, for
  senders that say nothing). The console adds `transition` and the exit
  `fade` in `liveOp` (`withTransitions`, `src/lib/console/transitions.js`,
  tested; every output window's screen keys too, `useScreenKeys` → `screenKeyOp` in `src/lib/screenKeys.js`, tested: ← → PageUp/PageDown, B, L, C, Esc as on the console, no Space, no click-to-advance, desktop only); the live state never reads
  prefs. Never hush in `media.toAudio`/`audio.toMedia` or `content.show`;
  a list counts by the item it starts with, advances never hush (Anterior /
  Próximo, `playlist.goTo`, take `transition` and fade only the track they
  stop), the Fundo's video is muted. **Esc stops the player's music**
  (owner 2026-10-17, Rodada G3 — reverses 2026-10-07, when the audio
  channel survived Esc; no switch keeps it): `clear` and Parar
  (`audio.clear`, `media.clear`, `video.clear`, all in `EXIT_OPS`) take
  the music off, paused or not, and what can be heard leaves on the same
  `fade` as the screens (`leave`, `live.leaving`; Ao tirar do ar). The
  safety net is Desfazer (8 s toast, Ctrl+Z): `undoEndOps(before, endedAt)`
  puts the music back at the second Esc stopped it (`endedAt` = Esc's
  updatedAt), paused if it was, `mix`, fading in (`audio.show`
  `position`/`paused`/`fadeIn`; a same-url `leaving` entry is dropped so
  the pool hands the element back). **Pausing fades** (Ao pausar o som:
  Corte · 0,2 s · 0,4 s, default 0,2): `transport` pause/play take `fade`
  and keep `playback.ramp = { at, ms, from, to }` (its own anchor: seek
  rewrites `at`); `playbackGain` is the curve every window computes on
  the live clock, `playbackPlan` multiplies it into the volume and holds a
  pause until its ramp to 0 ends; a ramp starts from the level the sound
  is at (a quick Pausar-Tocar never clicks); volume and a playing seek keep
  it, a restart, a new item and the eye drop it. `LiveVideo` steps the
  volume through `fadeOut` and the ramp and syncs at the end. Esc
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
  honours it, still previews cut. **What enters or replaces fades too**
  (owner 2026-10-17, Rodada G5; Ao entrar ou trocar: User
  `enter_transition` cut|fade, `enter_transition_ms` 300/500/1000 —
  Suave 0,5 s by default — and `enter_transition_kinds` { kind: cut|fade },
  Por tipo de conteúdo, folded): `content.show`, `media.show`/`.playlist`,
  `video.show`, `tool.show`, `communication.show` and the outputs'
  `media.advance` (LiveMediaView) and `communication.advance`
  (useNoticeAdvance) keep their `fade` as `live.fade`; `screenExitMs`
  ghosts when the main layer OR its item changes (`content.startedAt`,
  `media.shownAt`, `tool`/`communication.startedAt`), the longer of the
  change's fade and a hushed sound's `leaving`, and `videoExitMs` the
  same for the video channel. `withTransitions` maps the op to a kind of
  `src/lib/contentKinds.js` (THE list of content kinds, tested; Mostrar's
  `SHOW_KINDS` is built from it and G10's per-output rule will be):
  `content.show` by `kind`, `media.*` image/gif → image and video/youtube →
  video, a list by its first item, `video.show`/`audio.toMedia` (Mostrar o
  vídeo) → video, `tool.show` → tool (Corte unless chosen: the count does
  not wait), `communication.*` → notice; the sender's `fade` wins, the
  Prévia never gets one. Soft is wrong, so never: moving the slide
  (`content.goTo/next/prev/reveal/update`: the theme's transition, PDF
  pages included), a YouTube player leaving (cold in the ghost: it cuts),
  a picture of a list longer than a quarter of its time (`enterFade`),
  Tela preta/Logo (their own switch). Changes that reach a window within
  150 ms are one for its ghost (`ghostTrack`, `GHOST_BURST_MS`): the Fundo
  then the text of one send fade together from the screen before. The
  Avisos screen's `noticeView` carries `rev`/`updatedAt`/`fade`. The
  slide-to-slide transition stays the theme's. Every output renders the
  live state; outputs can be
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
  renderer leaves a song's own picture out). **The layer order is the
  program's, fixed** (owner 2026-10-28, Camadas K1 = A, as in ProPresenter
  and Holyrics; on 27/10 a Fundo dragged above Texto principal hid a video
  that played on, sound only): `LAYER_ORDER` in shared/live-state.mjs —
  Logo no canto, Sobreposições, Texto principal, Fundo — stacks every
  screen; there is no `layers.order` op or `live.layerOrder` any more (an
  old saved order is dropped by `restoreState`), and Camadas has no grips,
  no drag and no Subir/Descer. **Only the Fundo has a padlock** (K2 = A):
  the others only greyed a form on one computer. Don't bring reordering or
  per-computer padlocks back.
  A background is one spec
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
  excluded **for good** (`BackgroundPref.hidden`; its file is the app's,
  never deleted; owner 2026-10-23: there is no Excluídos chip and no
  Restaurar — the picture comes back only as a file brought from the
  computer, so "Excluir…" asks with `danger`); a file sent or brought in is
  deleted (its Media row, and its BackgroundPref unless another copy is a
  background); a Mídia picture is "Tirar dos fundos" (its BackgroundPref
  goes, the Mídia keeps it). A hidden row (an old Oculto too) is never
  listed and offers nothing (`backgroundActions` → []). **The
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
  the library (`palette` icon, as Temas everywhere; the library's right click pins a theme here)
  and the **+ menu** (`menuRef`): Novo tema, Configurações › Temas…, Salvar/Tirar tema para a
  música, Usar neste culto, Seguir o culto, Tornar padrão, Visualização.
  Nothing else in the body: no "tema do culto" line, no buttons.
  **Camadas edits no look**: the layers come first, each with a pencil on
  hover; **the settings under the list stay folded until a pencil opens
  them** (owner 2026-10-14; a click on the row only selects it) — **Logo
  no canto** (K4 = A, 2026-10-28; named so beside the full-screen Logo, the
  L key): only its Canto and "Logo da igreja…" — its size, free width,
  opacity and margin live in Configurações › Igreja alone (`User.logo_size`,
  `logo_width`, `logo_opacity`, `logo_margin`; `seedOps` in
  electron/liveSeed.cjs) —, Sobreposição (its text field), Texto principal (the item's Título and "Editar tema…", the theme
  in use in the Editor de temas); the Fundo's pencil (and the row's right
  click) opens a menu, never the library blind: its title names whose
  background the screen shows now — the culto's papel de parede, the
  igreja's or the item's own (`fundoNow` in defaultFundo.js, tested; it
  still reads the pre-rename titles) — and its items are "Trocar o papel
  de parede…" (`pickServiceFundo`: **the one live door**, Rodada B
  2026-10-14 — the Programa's header button is gone; in the medium/narrow
  tiers the Camadas drawer of the Programa's pill keeps the pencil reachable)
  and "Qualquer outro culto…" (Configurações › Culto); the Fundo layer
  still has no options (the row keeps its eye and padlock). The text look is edited only in the Editor de
  temas; when the text on air looks otherwise (a song's own look) Texto
  principal says so and offers Restaurar (`applyThemeOnAir`) and Salvar
  como novo (an unnamed theme). Camadas' header **+** is a menu with TWO items only
  (owner 2026-10-14, "Frente 2 = A"): Sobreposição de texto and Logo no
  canto. Principle: *Camadas put or take elements over the projection
  that are not in the themes; the Editor de telas is the permanent design
  of one type of screen.* Relógio, Cronômetro, Timer, Texto livre and
  Aviso rápido are not layers' business: they stay in the tabs panel
  (Ferramentas, Timers, Aviso rápido) and the Setlist's + — don't put
  them back in Camadas' +. **Sobreposição de texto always makes a NEW
  overlay** (owner 2026-10-14, "adicionar camadas a mais"), up to 5
  (`OVERLAY_LIMIT` in `src/lib/console/overlays.js`, tested; the menu item
  disables at the limit). **Prepared, then put on air** (owner 2026-10-28,
  K3 = A, as ProPresenter's Props): a new one is born OFF the air with no
  text (`newOverlay`: `enabled: false`, `content: ""`), its field is a
  draft the screens never see being typed — Enter puts it on air (or
  updates it), leaving the field saves it; one with no text never goes on
  air. Each overlay is its own row named by its text ("Sobreposição ·
  sem texto", muted, while empty), with eye, pencil (Texto; Altura Alto |
  Baixo and Lado Esq. | Centro | Dir., six places, `overlayPlace`/`placeAt`)
  and Excluir… via `useConfirm`; with 2+ the rows join under a thin
  "Sobreposições · n" heading (`.kx-ovhead`), the newest on top (the top
  row is the END of `live.overlays`: the renderer draws the list in
  order); nothing drags. Esc and Limpar
  leave overlays alone (their own controls, like the Logo). The tools
  of the tabs panel are prepared in the Prévia (`stageFromTool`), the aviso
  goes to the screens at once (`alert.show`); a text is asked with
  `askText` (PromptDialog.jsx; Esc closes it first). The Setlist's **+** is a menu
  too: Buscar… (the palette), Seção…, Texto… and Timer… (a ServiceItem under
  the item in the Prévia, else at the end; Planejar o culto is the button
  beside it, not an item: Rodada M1); the
  Biblioteca's Letras + also takes "Uma pasta inteira…" (webkitdirectory);
  **song files are read by content, never extension** (`songsFromFile` in
  songImport.js: JSON, ChordPro, cifra, text and OpenLyrics/OpenLP —
  `src/lib/songFormats/openlyrics.js`, parts as [Estrofe 1]/[Refrão]/[Ponte]
  in `verseOrder`, chords inline; Holyrics' JSON export —
  `songFormats/holyrics.js`, one paragraph one slide, the "Título:/Artista:"
  header paragraph out, "[Refrão] (2 Vezes)" a label; a binary `.pro` is ProPresenter 7 and is
  refused with the reason), a song already in the library (`songKey`) is
  left out and the toast says so (`splitRepeated`, `importSummary`); the
  files picked open **Importar músicas** (`ImportSongsDialog.jsx`, owner's
  marks 2026-10-20: each song ✓ / ⚠ parece repetida with "Importar mesmo
  assim" / ✗ with the reason, "Pular as repetidas" on, Importar n músicas
  writes 100 per `bulkCreate` and closes on the toast; `importPlan` in
  songImport.js, tested; `useImportSongs()` is the console's door), and the
  owner's rule (2026-10-20): KERYX ships no lyrics, and no parser of another
  program ships without a real export file in `songFormats/fixtures/`
  (2026-10-21: only Holyrics; EasyWorship and ProPresenter are not planned);
  the search row is Buscar · ☆; **the Biblioteca's header
  holds the doors** (owner's pick, Rodada H, H1): its title, "Abrir a
  Biblioteca de mídia" (the Mídia page, every tab), the (+) that adds
  (owner 2026-10-28, I2 = A: Library.jsx draws its menu into the header's
  slot, a portal), the chooser of what shows (the eye) and the fold
  chevron, 24 px, 8 px apart. **Every panel header keeps one order and one
  meaning per glyph** (owner 2026-10-28, mockup "Ícones dos painéis", I1–I4
  = A): its own actions, then the (+) — only ever "add" —, the eye — only
  ever "show or hide", the tab chooser, a layer, the player's video; never
  "Pôr na prévia" — and the fold; no (+) holds the lines-per-slide
  chips any more ("Ao importar letras" lives in Configurações › Bíblia e
  músicas; Rodada G1). **Hover buttons are glyphs only** (owner, Rodada
  G1): the word stays inside the button as screen-reader text (`.kx-act-l`,
  which the smoke clicks by), the tooltip says it. **One glyph per kind of
  thing** (owner 2026-10-19): `media` = the Mídia (the library page),
  `film` = a video, `youtube` = a YouTube link, `presentation` = a
  PDF/presentation, `volume` = an audio file (`music` = a song only),
  `synced` = a song synced to its media, `clock` = a timer or the live
  clock, `palette` = Temas, `grid` = the Multiview only, `prev` = the
  Prévia (Lucide's scan, a viewfinder; owner 2026-10-28, P1/P2 = A: every
  "Pôr na prévia", the Prévia's badge — the glyph alone on a narrow one —,
  its dock tab and the Slides column's tab, the Pedidos' button), `planner`
  = Planejar o culto (clipboard-list, I4 = A; the two packed into one path
  each in icons.js, for the outputs' budget); a Media row's
  glyph is `mediaIcon` (libraryRows.js, tested) wherever it is listed.
  **Icons are Lucide** (Rodada HI, owner 2026-10-19): nodes of the
  `lucide` package mapped to our names in `src/lib/icons.js` (stroke
  `STROKE` 1.5 there; black, logo and synced are our own nodes); a new
  icon is one import and one map entry, never an inline SVG, and
  `icons.test.mjs` fails on a name the code uses that is not mapped. **A row with hover buttons is one line** (Rodada G1, owner
  2026-10-19): in Confortável too, its title ends in "…" (the whole title
  is its tooltip) — the Biblioteca, the Setlist, the palette, the Mídia and
  the planner, its item rows too (one rule, `.kx-row:has(> .kx-row-acts)`
  and `.pl-item` in console.css).
  A song's row has no glyph (media and avisos keep theirs); under its
  title the artist, the key and the length as the Biblioteca header chooser's
  "Nas letras" checks say (Mostrar o artista / o tom / a duração:
  `layout.libShowArtist` off, `libShowKey`/`libShowLength` on, per
  computer); the artist is always in the tooltip; sincronizada, parece repetida
  and baixando are small badges at the row's end that the hover buttons
  replace (`songRow` in `src/lib/console/libraryRows.js`, tested). **Menus
  from a button stay inside the window** (the (+) menus, the tabs' (+), the
  Bíblia's lists): `placeBox` (contextMenu.js, tested) + `usePlaced`
  (Menu.jsx) put them under the button, turned to its other edge or above
  it where the window ends, scrolled with a max-height when nothing fits;
  `.addmenu-pop` is `position: fixed`, so no panel clips it. **Camadas is as tall as what it holds**
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
  `defaultFundoFrom`) and a "Sem papel de parede" row that only points to
  the Tela ociosa; each template's row in Modelos de
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
  Travar telas or the padlock (`fundoGoesOnNow` in defaultFundo.js).
  **The Tela ociosa is the whole app's** (owner 2026-10-19, mockup approved):
  what every screen shows with nothing on air and no papel de parede. It is
  edited as a screen of the Editor de telas, first in its list above the
  Saídas (`IDLE_SCREEN` "tela-ociosa" in `editor/ScreensMenu.jsx`,
  `IdleEditor.jsx`), and has a card in Temas e fundos (a group of its own since Rodada H1; Culto ›
  Fora do ar only points to it). The settings: Logo da
  igreja or Preto (`idle_mode`, also in the Saídas popover); with the logo,
  Fundo Cor, Degradê (two colours, Do centro / De cima para baixo /
  Diagonal; it starts as the old blue, so nothing changes until edited) or
  **Da biblioteca** (Rodada Q6, owner 2026-10-23, S3 = B; reverses the
  19/10 "no image"): a picture or a clip picked in the background library
  (`useLibraryPicker`, image and video only), `media = { kind, value, name }`
  with `dim` 0–0.7 (Escurecer, so the logo stands out), the logo and the
  phrase over it; the clip loops muted as the Fundo's video does (an output,
  the Programa monitor and the editor's canvas; `VideoStill` in the other
  stills; a plain element, never the media pool); the editor says when the
  file is still syncing or its codec may freeze; the file is kept while
  another fundo is chosen (`idleMedia` draws it only with "media"; an old
  look reads `media: null`, `dim: 0`, and draws as before). Logo Sem/P/M/G and Frase
  Nenhuma / Nome da igreja / Outra. They save at once on
  `User.idle_look` (synced); the console puts them on the screens as the
  live state's `idleLook` (op `idle.look`, works locked; null = the old
  look exactly), writing the church's name in (`liveIdleLook`), so a
  detached editor, a rename or another computer reach every output. The
  rules and the CSS are `shared/idleLook.mjs` (tested); `Idle` in
  ScreenRenderer draws it. In the library, Gerados shows the
  background big. A right click on a Temas card offers Aplicar, Editar,
  Salvar para a música, Tornar padrão, Usar na Bíblia, Usar neste culto.

- **The app is the operator console, `/Console`** (`src/pages/Console.jsx`,
  `src/components/console/`); `/` and any unknown path go there. It is built
  on the design system in `docs/design-system/` (tokens and `kx-` classes,
  imported as `@ds/…`; read `docs/design-system.md` before touching its
  look: `tokens.json` is the one source of the tokens, `bundle.css` the
  components as they ship, `console.css` only the console's layout and its
  app-specific compositions, and no stylesheet types a colour, a px font
  size or a z-index by hand — `src/lib/tokens.test.mjs`; the three kinds of
  surface are `docs/design-system/surfaces.md`). One screen, always live (no steps; Verificar is an overlay from the
  Saídas popover; Configurações, `settings/SettingsView`, is a window over
  whatever is on screen, its own `cfg` state, `?config=`; its sections are
  `src/lib/console/settings.js`, old ids resolve through `resolveSection`;
  its search indexes every row in `settingsSearch.js` — a new `FormRow k`,
  `CfgKey k` or `CfgGroup k` goes in the index, or `npm test` fails). **Sobre** is the last section
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
  Mídia, Ferramentas, Ajuda (`MenuBar.jsx`; the model is
  `src/lib/console/menuBar.js`, tested). **There is no Telas menu** (owner
  2026-10-16, Rodada E0): Tela preta, Logo and Limpar are the Programa's
  pill, Saídas the logo's menu, Verificar tudo Ajuda's, Travar telas and Telas e
  saídas the Saídas popover — don't put it back. Its open menu is the console's
  `open` (`"mb:<id>"`): Esc and the scrim close it, pointing at another
  menu switches, ← / → walk them. Every item is something the console
  already does (Música › Sincronizar a música… opens the song in the Prévia
  or on air with Sincronizar on top; Letra automática › Iniciar/Pausar/
  Retomar; Mídia › Do computador… / Link do YouTube… open the Mídia on
  that step; Mídia › Fundos opens the backgrounds library at once). **Ver stays beside the bell, with the panels glyph**
  (`panels`, Lucide layout-panel-left; the eye is only for showing or
  hiding: the choosers of what to show, a layer, the player's video). **Ajuda is the bar's last menu** (owner 2026-10-20,
  Rodada M0; Alt+A): Primeiros passos (a dialog, `firstSteps.js`, tested:
  seven steps, each with the button that opens what it names, keys per Teclas
  de uma letra), Atalhos, Novidades · Verificar tudo, Salvar diagnóstico…,
  Relatar um problema…, Abrir a pasta de dados (the `system` bridge's `diagnostics`/`openDataDir`,
  as in Backup e atualizações; off in the browser preview) · Atualizar agora
  while an update is due, else Verificar atualização, and Sobre o KERYX.
  **Relatar um problema…** (Rodada N3; also Configurações › Dados ›
  Suporte): `ReportDialog.jsx` asks what happened, what they were doing
  and how to reach them (optional); **it goes over the internet, no e-mail**
  (owner 2026-10-20, "Relatos sem e-mail"): main (`system` op `report`)
  writes the report and its diagnostic zip (`relato.txt` inside) to the
  queue `<data>/relatos` (`electron/reportQueue.cjs`, tested; never the
  store or the sync) and posts it, multipart, to the Supabase Edge Function
  `supabase/functions/relato` (`REPORT_URL`, deployed with verify_jwt off:
  no key ships; it writes `problem_reports` and the private bucket
  `relatos`, no policies — the owner reads them in the dashboard, and with
  the secrets `RESEND_API_KEY`/`REPORT_NOTIFY_TO` it e-mails the owner each
  new one). The answer is `reportOutcome` (support.mjs, tested): sent
  (Relato enviado + its code `R-XXXX`, `reportCode`, the same in the
  function), queued (offline or a 5xx: Guardado para enviar depois; the
  queue tries at launch, every 10 min and on resume, by the report's own
  id so the function never makes two, and drops it after 30 days, logged)
  or refused (400/413/429: kept, never retried). **The e-mail is the
  reserve** (`reportMail`: the zip to Downloads, the mailto to
  `SUPPORT_EMAIL`, the report out of the queue; the page never opens a
  mailto), from the dialog or Configurações › Dados › "Relatos na fila"
  (only while one waits); without an e-mail program the dialog shows the
  address and the text with Copiar. The browser preview fakes the answer
  ("#fila" in the text = queued, "#recusa" = refused). The windows' own errors (onerror, unhandledrejection,
  console.error) reach the daily log as `[renderer:<page>]` over `keryx:log`
  (`src/lib/rendererLog.js` → `electron/rendererLog.cjs`, 20 a minute per
  window, 2 kB each; never from a network screen).
  **The logo's menu is the app's** (owner 2026-10-19, Rodada M0 "app"):
  Configurações, Saídas, Sobre o KERYX and Atualizar agora when due; never a
  page of the content (those are the bar's). **Under 1240 px the
  bar folds away and a ☰ Menu button takes its place** (`.tb-menubtn`, same
  container query in console.css: one source for the width): `open === "menus"`,
  ONE popover (`MenusPop`) with the bar's menus stacked and all open, a
  submenu inline under its parent, the culto's services capped at 5 + "Todos
  os cultos…"; it is `flattenMenus(buildMenus(ctx))` (menuBar.js, tested: no
  item of the bar can be lost), so a new top-level action goes in the bar's
  model and reaches both the bar and the Menu button by construction, not as
  another icon in the top bar; with the bar folded Alt/F10/Alt+letter open
  that popover. **The right side is compact**
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
  **Planejar o culto is in tabs, as in a browser** (owner 2026-10-21,
  Rodada O, O9 = A): one culto per tab in the window's bar, the (+) a new
  tab that chooses (Novo culto, Duplicar the last culto, Abrir um culto),
  the open tabs kept on this computer (localStorage
  `keryx.console.planner.tabs` = `{ ids, active }`, `src/lib/console/plannerTabs.js`,
  tested; a deleted culto's tab closes). **The tabs never change the
  console's culto**: its tab has a green dot, and a tab's right click
  "Usar no console" is the one door (a detached planner sends it over the
  relay, `service.use`; the console answers `console.service`).
  `openPlanner(id)` opens or brings forward that culto's tab; the tab in
  front rides in the entry's props, so Destacar opens on it. Culto › Novo
  culto opens the new culto in a tab and leaves the console's culto as it
  was (owner 2026-10-22: "its ok"). The console's planner and a detached
  one share the list: each saves only its own changes and takes the
  other's (`adoptTabs`: its cultos, this window's tab in front). Closing a
  tab never deletes the culto. Modelos and Exportar PDF are the Culto panel's
  header.
  **One floating window over the live console**, the Configurações frame
  on every page (`WinBar` in kx.jsx: the ← Voltar chip from level 2 at the
  bar's left, before the title — no border, the arrow and the words, a
  tint on hover (owner 2026-10-22, "Bibliotecas" B1 = C) —, the title, the window's actions, the (x) "Fechar · Esc"; there is
  no "← Console" BackBtn any more). **The window is one surface**
  (owner 2026-10-21, Rodada O7 = A): `bg-1` under the bar and the page, the
  bar parted only by its `line-soft` rule, a faint ring and a deep
  `shadow-window`; the page's panels sit 6 px under the rule, as from the
  sides (owner 2026-10-22: flush they looked cramped), one grey step up
  (`.win-body .kx-panel`: `bg-2`, fields `bg-3`, pressed `bg-4`). A
  segment never breaks a label (`.kx-seg > button` nowrap): in a narrow
  panel header it drops whole under the title (`is-head-wrap`).
  **Lean bars**: the bar holds the title and what acts on the whole window
  (Desfazer/Refazer, Cancelar, Salvar, Destacar, ×); what acts on the
  content goes in the page — Configurações' search at the top of its nav,
  the Editor da tela's Mostrar com in the canvas header, the Editor de
  temas' theme select and Excluir… in the form's header, the Mídia's search
  and list buttons in its chips row, the song editor's ☆, Dados/Letra,
  Excluir… and Imprimir in the Música panel, Relatórios' Período and search
  at the top of the page, Sincronizar's Velocidade in the media's header
  (Planejar o culto's bar is the tabs' own). **The library windows**
  (owner 2026-10-22, "Bibliotecas" B3; the background library and the
  Mídia, the same variant): flat on the window (no card), the galleries as
  tabs in the bar beside the title (`WinTabs`, kx.jsx; `WinBar tabs`), what
  adds on the bar's right (Do computador…, Link do YouTube…, Trazer da
  Mídia…), a chips row of the church's categories (`FilterChips`,
  library/FilterChips.jsx: the chips, "Categorias…", then the page's search
  and list buttons), the grid or the list, and the side panel always on
  screen behind a `line-soft` rule (the Mídia's `MediaDetail`: the file
  chosen, its category and actions; several marked = how many and the group
  actions; none = "Escolha um arquivo para ver aqui"). **The Mídia's
  categories are the church's** (B4 = A, `src/lib/console/mediaCategories.js`,
  tested): `User.media_categories` names and orders them (null = Pregação,
  Louvor, Avisos, Testemunho, Outros), `Media.category` holds the name — an
  old row's key (sermon, worship, announcement, testimony, other) reads as
  its name (`mediaCategoryOf`) and is rewritten only when the file moves;
  "background" and "font" (and the old keys) are never a category's name;
  edited in "Categorias…" (`CategoriesEditor` in library/FundoCategories.jsx,
  one editor for both libraries); a rename moves the files, a delete sends
  them to "Outros", never renamed or deleted; files sent with a chip on land
  in it. **A window's side menu is
  always `WinNav`** (kx.jsx; owner 2026-10-22, "Bibliotecas" B2 = A,
  "standard for all windows"): docked on the window's surface, never a
  card or a Panel, a `line-soft` rule on its right, 240 px down to 180 as
  the window narrows (`kx-win-nav` in bundle.css), fixed (no splitter),
  its `head` slot for a search (Configurações'); in a `.win-body` it
  reaches the window's edges and keeps one gutter before the content (no
  `kx-gap` beside it). Configurações' sections and the Editor da tela's /
  Tela ociosa's Telas use it; a list that edits (the Escola's Turmas) is
  not a menu. Voltar is never in a side menu. The Window component of bundle.css
  (`kx-win`, beside the old `.win-dialog`; the `.win-scrim` and the
  `.win-body` layout stay in console.css), two sizes (Padrão, and `.is-editor` for the editors; the
  frame animates between them). **The window stretches by its 4 edges and 4 corners** (owner
  2026-10-15, Rodada D3; `WinEdges` in `src/components/console/winLayout.jsx`,
  `dragRect`/`clampWin` in `src/lib/console/winLayout.js`, tested): min
  760 × 480, never past the console, one size per kind kept on this computer
  (localStorage `keryx.console.win`); a double click on the bar's empty area
  restores the default. **Inside a page, content columns (and the song editor's
  Slides/Vídeo) are resized by splitters as in the console** (never a side
  menu; a `kx-gap` stands beside one) (`useWinCol`,
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
  Abrev | Nomes, the install + and a view menu (Tema da Bíblia…, Células
  pequenas/médias/grandes — `layout.bibleGrid`, per computer) are Livros'
  header. **The (+) lists only what is missing here** (Rodada P, P3;
  `installableEditions`), then "Instalar uma edição própria…" (the
  `OwnBibleDialog` of Configurações, the BKJ 1611's door) and "Bíblias
  instaladas…". **One line ABOVE the No ar screen, always on screen** (Rodada Q, Q5 = owner 2026-10-23, S2 = A; reverses P2-1's bar under it; `.bbar`): Tema as an icon button (`palette`, "Tema da Bíblia…"), Ref. (`bible_show_reference`), versículos por slide 1/2/3/Auto, the version, "+ 2ª" / "2ª: X" and, only with a 2ª versão, Lado a lado | Empilhadas as two icon segments (`cols`, `rows`) — church preferences stamped at send (`withLookDefaults`). The line NEVER wraps: container queries on the column (`bbar-c`) shrink it in steps (under 460 px Auto→A and the 2ª shows only its sigla; under 330 px the selects narrow and the gaps tighten), every control reachable at the column's 300 px minimum. No size there (owner 2026-10-22:
  the screens' size is the Bíblia theme's; `bible_text_size` is gone).
  **The bar's changes reach what is on air at once** (owner 2026-10-22, as
  in Holyrics: the Bíblia has no Prévia, the screen under the line is No
  ar), when a passage is on air and the screens are not locked: Tema
  through `applyThemeOnAir(c, theme, { inUse: false })` (text look + Fundo,
  padlock respected, never the songs' theme in use); Ref. and Lado a lado |
  Empilhadas on its style (`airStyle`); 1/2/3/Auto, the version and the 2ª
  versão read its chapter again and rebuild it (`stageRebuiltOnAir` in
  stage.js; `airPassage`, `slideWithVerse`, `verseNear` in
  bibleVerses.js, tested), re-stamped by `c.stamp`, in ONE
  `content.update` (which takes `ref` now) that keeps the verse on air on
  screen. A whole chapter, or a range the Bíblia sent (its ref keeps
  `nums`), is rebuilt; a passage of the Setlist keeps its slides. Locked,
  it says so, and the next send carries the change: `chapterOnAir` also
  compares `ref.how`, `style.ref_line` and `style.pair` (its `look`,
  `lookDefaults(…).bible`), so it sends again instead of a `content.goTo`.
  **1/2/3/Auto group the chapter too** (`chapterOf(…, how)`): the verse
  chosen starts its slide, the verses before it grouped on their own, and
  that slide is the one shown; the Selecionado list shows the slides that
  go out. **The version list** (P3 = A): each
  option the sigla and the full name in `<optgroup>`s — Instaladas, Ler
  pela internet, Da igreja (`versionGroups` in bibleEditions.js, tested;
  later one group per language) — while the closed box shows only the
  sigla (`.bver-v` over a select whose text is transparent: it stays the
  control); the edition only as an amber dot on the select when it is
  from the internet, missing or the preview's samples (`bver-dot`, the
  words in its tooltip). **A second edition on screen** (P2-2 = C,
  `User.bible_version_2`, `bible_pair` side | stack): BibleEnv reads the
  same chapter in it (`readChapter`; one that cannot be read is left out,
  amber dot, never the first edition twice) and each slide carries it as
  `slide.pair = { text, version }` (`groupVerses`/`chapterOf` in
  bibleVerses.js join it by verse number, "auto" filling half as much;
  `ref.version2` makes `chapterOnAir` send again rather than move);
  `style.pair` is the live state's choice, and ScreenRenderer draws two
  blocks (`.ks-pair`), each with its sigla, the reference line without
  the version. The Bíblia, the palette and the controle remoto send it
  (`referenceVerses` in Console.jsx reads the 2ª versão too). **"O mesmo das
  músicas"** is the theme in use (`themeForKind(…, c.themeId)`), as stamp
  sends it (note 11). **The reading text's size** (P5 = A) is A− / A / A+
  in the text panel's header and Ctrl + the wheel over the text, five
  steps P M G GG GGG (`layout.bibleRead`, per computer;
  `src/lib/console/bibleRead.js`, tested); it never changes the screens.
  The Bíblia has **no search field
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
  that badge lets one type it (`Split` label/onPercent in kx.jsx, Dock.jsx). The banner's **Tamanhos: Livre | Por %** (owner 2026-10-15, Rodada D; per environment, per dock): Por % keeps `mode: "pct"` and `ref` (the box the sizes were made for) on the dock, `fitDock` scales the fixed sizes by the box on screen over `ref` so the proportions survive another window size (minimums and locked heights still win), and splitters snap to 5 % (`rebaseDock`, `setDockMode`, `snapPct` in dock.js, tested). **Exato** (owner 2026-10-22, Rodada P4-2 = A) keeps `mode: "exact"` and `ref` and every split's `weights` (one per child, summing 100): the open children share the room by them, so 33 · 33 · 34 is exactly that at any window size (no 5 % snap, no flexible child; the last open one only takes the rounding); minimums, locked heights, folds and the Programa's 16:9 still win (`allocateWeights` in `fitNode`), and the `sizes` follow the weights as drawn in `ref` (`syncExact` in `normalizeDock`), so a structural edit or leaving Exato keeps what is on screen (`setDockMode` takes the frame on screen). A splitter there trades weight between the open children on its two sides only, in whole % (`resizeExact`; typed on its badge: as typed; double click: the two share evenly, `evenExact`); the banner's one-click 50 · 50, 33 · 33 · 34 and 25 · 50 · 25 (`presetsForSplit`) and "Digitar…" (`parseWeights`) act on the split whose splitter was touched last while editing, else the outer one (`setSplitWeights`; `Split onPick`). **Travar fora da edição** (owner 2026-10-22, Rodada P4-1 = A): one switch per environment, in the banner (`DockLockSwitch`) and in Ver; on, outside the edit, every gap is a plain `dock-gap` (no drag, arrows or double click). It is `lock: true` on the dock beside `mode`/`ref` (`dockLocked`, `setDockLock`), so it rides `normalizeDock`; a named arrangement or another tier's dock coming in takes the switch as it is (`withLockOf`; `switchTier`'s `fresh` gives a tier never arranged the console's own, locked), Padrão and Restaurar posições keep it, and it never makes an arrangement "· alterada". The Programa, the
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
  first is what plays (the file icon, the title — a small floor, **cap
  `min(28cqw, 260px)`** (Rodada N1, owner 2026-10-20: the bar keeps at least
  half the row), the whole title its tooltip — and "n/m" in a list; **no
  kind word**, the icon says it), the
  elapsed time, the progress bar and the remaining time; the second is the
  controls: ⏮ −10 ⏯ +10 ⏭, the eye, Parar, the layer switch (2+ layers), the
  letra automática, then the volume and the meters. **Where the sound goes
  is not on the row** (Rodada N1, owner's pick A): it is the mute's tooltip
  ("Mudo · o som sai: Projetor"); only the projector window closed shows,
  as an amber status chip "Projetor fechado" (`.pl-closed`, `role=status`,
  not a button) plus an amber dot on the speaker;
  64 px, `.pslot` and dock.js `PLAYER_SLOT` 72; narrowing folds row 2 (the
  volume %, −10/+10, the chip labels down to icons, a narrower volume,
  then the meters; Tocar, the eye, Parar and the mute always
  stay). **Hovering the progress bar shows the moment** (Rodada N1, as on
  YouTube): a light band up to the pointer and a tip with the time, the
  slide of the letra automática there (`slideNameAt`, from `followTicks`)
  and, for a video of the computer, a 160 × 90 frame of the file
  (`useFramePreview`: one detached muted `<video>` per file, made on the
  first hover, one seek in flight, an LRU of 40 bitmaps — **never the
  pool's element**, which plays on air; helpers `src/lib/console/seekPreview.js`,
  tested); a YouTube link shows its cover, fixed (`media.poster`, else
  YouTube's hqdefault: `tipPicture`; owner's mark n2_youtube = capa), an
  audio file the time and the slide only. Nothing
  seeks until a press. **The progress bar drags** (`Seek` in PlayerBar.jsx, pointer
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
  falls back to the window band); the strip is at least `ONAIR_H` (108 px)
  and as tall as its slides' lines (`onAirHeight`; the cards at 13 px,
  each line one line);
  medium and narrow start with it in the tray); the **right column** (`rightW`) is **Camadas, Temas and the
  Setlist, full height** (Camadas as tall as its list, Temas `TEMAS_H`: the
  Setlist gets the rest of the column). **The Notas tab** is the setlist item's notes
  (only when it has some) over the operator's free field, nothing else. **The Programa and the Prévia have no card** (owner 2026-10-14,
  `Panel bare`, `kx-panel-bare`). **The Programa has no header** (owner
  2026-10-16, Rodada E1): its screen's top lines up with the panels beside
  it, and its caption and controls are **one pill inside the screen,
  bottom-right** (`ProgramaPill` in CenterPanel.jsx, the Pill component
  `kx-pill` of bundle.css beside the old `.prog-pill`, Monitor
  children so it rides the Multiview too): a dot in the state's colour
  (green on air, blue locked with the "Travado" word, amber when an output
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
  preta, Logo, Limpar (owner's pick B), then a separator and **Encerrar
  apart, in `--danger-fg`** (`pp-end`, icon only; Rodada DS1 — "Travado"
  is 12 px; the Programa's menu ends with it after a separator). As the screen narrows
  (container queries on the screen, `prog-screen`) it **folds once**: at
  560 px only "2 telas" goes; at 480 every `.pp-full` button (Voltar,
  Camadas, the screen actions) goes into a "…" that opens the Programa's
  menu (the same as its right click, Camadas included) — the "…" never
  beside the buttons it holds; over the Multiview it is always folded.
  dock.js gives the Programa `minH` 172:
  the header it lost pays for the player's second row;
  the Prévia is its screen, its caption a badge inside the top-left corner
  (`kx-mon-badge`: "Prévia · nome · 2/6", blue "Prévia · travado" while
  locked), and **an Enviar ao ar pill inside the screen, bottom-right, in
  the Programa pill's style** (owner 2026-10-20, Rodada N5; `PreviaPill`,
  `.prog-pill.prev-pill`: a gold dot (selecionado) and the button, "Usar o tema" for a
  theme's example, aria-disabled with the reason in its tooltip while
  `sendBlock` refuses — locked, a PDF preparing, a file coming or missing;
  only its glyph on a narrow Prévia, `prev-screen`; the "não vai mostrar"
  lines stack above it in `.prev-foot`), plus Enter, a double click or its
  right-click menu (the Bíblia, the Escola bíblica and the Mídia keep
  their own buttons). The smoke reads the Programa's pill as
  `.prog-pill:not(.prev-pill)`. Camadas in the tray is a drawer opened from the
  Programa's pill (or its "…"). The old `order`/`stacks`/widths are only read to build the first
  dock (culto order lib, slides, live, side; stack side = camadas, roteiro). **The tabs panel and the Biblioteca have
  their chooser in the panel's header**, at the level of the title like every
  module's + (Rodada E1, `TabsPlus` in TabsPanel.jsx, `data-tabs-plus`;
  its glyph is the eye, the sign of Ver — "Mostrar na Biblioteca…" /
  "Mostrar neste painel…", owner's pick, Rodada H: a + adds content;
  the tabs panel got a thin header of its own, "Painel"; the tab rows
  carry only tabs) (the Biblioteca's also offers Áudios and
  Apresentações, off at first: shown, they take their files out of Vídeos
  and Imagens — `libMediaKinds` in panelTabs.js, tested) that lists every tab with a check mark
  (`TabsMenu` in Popovers.jsx, as Ver lists the modules): checked = shown,
  in the list's order, at least one always, "Restaurar abas padrão" at the
  bottom (the Biblioteca's has "Nas letras" — Mostrar o artista, o tom, a
  duração — above it); saved per computer as `layout.tabs` (`src/lib/console/panelTabs.js`,
  tested; "Restaurar disposição" resets it). **A new tab checked by default
  appears once on a computer whose list was saved before it existed** (owner
  2026-10-24: after the update the Chat stayed hidden): `layout.tabs.seen`
  keeps, per row, every tab that computer has met (`normalizeTabs`; a save
  without it counts the tabs from before Pedidos and Chat), so a tab the
  operator hides afterwards stays hidden. The panel's tabs reuse what
  exists, no projection logic of their own: **Notas** (the
  `ServiceItem.notes` of the item in the Prévia / on air, and the Escola
  bíblica teacher notes — these sit under the Prévia's screen when the
  Notas tab is not on screen — and the operator's own free notes,
  `Service.operator_notes`, saved a moment after typing stops and on
  leaving the field; never in the PDF, never on a screen; with no service
  the first one starts the day's draft), **Aviso rápido**, **Timers** (`QuickTools.jsx`; the
  defaults), **Pedidos** and **Chat** (Rodada Q, PR2 and S12 = B: the
  Equipe's song requests and the chat with it, below), **Ferramentas** and **Esteve no ar** (the "Voltar ao
  anterior" history). Where the panel shows the Aviso rápido or the
  Ferramentas, Biblioteca › Avisos leaves them out (`elsewhere`); the
  Biblioteca's header "+" stays "add content". **One gutter
  everywhere**: `.console` overrides `--gutter` to 6px and the rows and
  stacks use `gap: 0` — the splitter IS the gap, as in `.main` (two cards
  stacked without one keep the gutter as a margin); don't add a second gap
  beside a splitter. The old
  Próximo/Depois lines, the Setlist side card and the Biblioteca's compact
  Setlist tab are gone. **The Slides column is the item in hand, the No ar
  module is what is on air** (owner 2026-10-14, as Holyrics' slide column
  and bottom strip): Slides shows the Prévia's slides whenever it holds an
  item, even a single slide (`handIsPrev` in SlidesPanel.jsx; a theme's
  example is not an item), else what is on air, else **the item Esc took
  off** (owner 2026-10-23, Rodada Q7, S4 = A: Esc takes it off the screens,
  not out of the operator's hands): `c.last` (useConsole, from the state
  just before Esc — `lastFromEnd`, `lastStays`, `columnSource` in
  `src/lib/console/lastOnAir.js`, tested; sessionStorage like the Prévia),
  only when slides were on air (a video or a picture alone does not count),
  Limpar texto (C) the same when it took slides off; no band (owner
  2026-10-27: the "Saiu do ar" band is gone), no green row, the slide it
  stopped on in the grey `--next-ring` with "parou aqui" (`is-stopped`); a
  click prepares a slide (the Prévia stays empty until then), a double
  click sends it, the footer's arrows move the "parou aqui"; it goes when
  anything new is on air (`airKey`: Desfazer included) or the Prévia
  holds an item; No ar (`OnAirPanel.jsx`,
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
  screen shows more. **One colour per state, everywhere** (Rodada P, owner
  2026-10-22, P1 = B; replaces DS1's gold-on-air and red elsewhere):
  **green = ao vivo** (`air`/`live` tokens: rows, cells, slides, the
  Programa's dot and frames), **gold = selecionado** (the Prévia: `prev`
  tokens, the brand's gold as a state), **grey = próximo** (`--next-ring`),
  **red only alerts and Encerrar** (`danger`, `air-fill` for the red
  buttons), green "OK/connected/done" is `ok` (never the on-air tokens);
  marked (several) and Travado stay blue. **No left bars anywhere**: the
  state is a light wash plus a 1px ring of its colour (`--live-ring`,
  `--prev-ring`) — the green wash 16 %, the gold one 34 % so they differ
  in lightness too (`stateColors.test.mjs` holds ≥ 1.4:1 and the
  protan/deutan ΔE); on air and selected at once: the gold wash, the green
  ring and the number on a green chip; labels and numbers on a wash pass AA
  (`fg-2` on the green one, `fg-1` on the gold one); a done row dims only
  its glyph; a note is a mark in the corner. The rings are inset
  box-shadows (a contrast theme drops them; its block draws the states),
  and the keyboard's ring over a gold wash is `fg-1`, gold elsewhere. **Switches** (`kx-switch` in bundle.css, beside the old
  `.sw2`; role=switch, every one: SwitchRow, the
  Saídas rows, the Setlist's Autoplay, Abrir ao iniciar) are 32 × 20 —
  `kx-switch-sm`, 24 × 14, in a panel header (the Autoplay) —, on = an
  `fg-1` track with a `bg-0` knob (never the Prévia's green). The No ar strip
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
  list** (the Setlist, the planner, the Editor's elements; Rodada
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
  DragEvents. **Marked rows drag together** (Rodada O2, owner 2026-10-21):
  in the Setlist and Planejar o culto a marked row grabbed with others marked
  takes them all (`useSortable`'s `group`; `moveManyTo`, `groupRoom` in
  dropOrder.js, tested): they stay in place dimmed (`data-sort-held`), the
  slot is as tall as the group, the card counts them (`.drag-card-n`), one
  renumber; a section is never marked, so never in a group. From the
  Biblioteca the drag carries every marked stage (`setDragStage` takes a
  list, `getDragStages`): the Setlist adds them in order at the drop
  (`addStageToSetlist`, one renumber, one toast, `addedSay`), the Prévia
  and the Programa take only the first, into the Prévia, saying "Só o
  primeiro vai para a prévia". There is no
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
  commit — don't give `LiveVideo` a `<video>` of its own again. **The
  picture fades** (owner 2026-10-17, Rodada G4, "o mesmo de Ao tirar do
  ar": no setting of its own): `media.toAudio`/`audio.toMedia` are in
  `EXIT_OPS` and carry `fade` as `live.fade`, so the video dissolves to
  what is under it while the sound goes on, and "Mostrar o vídeo" dissolves
  it back; a single video that ends by itself is cleared with the same fade
  (`LiveMediaView`; YouTube cuts). On the desktop projector the hidden
  audio player mounts first and takes the element, so the ghost's
  `LiveVideo` (`fadeOut`) finds the file held (`mediaPool.held`) and fades
  a canvas still of the frame (the poster if it cannot draw) — never a
  second element (a reload and an echo); a window without an audio player
  (a TV, the Programa monitor) takes the element and fades it as any
  ghost. Keys go through `src/lib/console/keys.js` (with
  a test; `liveAction` and its focus rules live in `liveKeys.js`, which the
  outputs load through screenKeys.js without the console's shortcut lists —
  keys.js re-exports it); **B, L, C, / and ? follow the church's "Teclas de uma letra"**

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
  Transições says (Rodada F2) (the player's music too, since Rodada G3,
  2026-10-17; the Fundo stays on screen, and the idle look shows only with
  no Fundo); its toast offers Desfazer, which puts back what was on air and
  the music at the second it stopped (`undoEndOps` in
  `src/lib/console/restore.js`); Ctrl+Z runs it too (keys.js "undo", out of
  text fields), and a plain toast waits behind it while its time stands
  still under the pointer or the focus (`toastQueue.js`, `Toast.jsx`; C-13).
  **The toast sits just below the top bar, centred over the panels** (owner
  2026-10-23, Rodada Q, T1 = A; `--pop-top`, at its own top in a detached
  page), drops in and leaves fading (T2); an **important** one — a new
  pedido or chat message (`usePedidos`), `say(text, action, { important })`
  — shows 6 s at least, a plain toast never swallows it, and two gold rings
  leave its border 3 times, then one thin ring stays (T3/T4; reduced motion
  and forced colours keep only the ring). Only the pedido and the chat message are
  important for now (owner's S11); a disconnected screen has no toast (the
  banner and the Saídas popover say it). Camadas' eyes on Texto principal and Fundo
  hide the layer and keep it on air (`layers.hide`/`layers.show`,
  `hiddenLayers`, `layerHidden`; hiding works locked): the next send shows
  the text again, choosing a Fundo shows the Fundo again. The Fundo hidden
  takes a song's own picture with it, never an aviso's or a tool's own
  background (theirs, not the Fundo's; ScreenRenderer's Background). The rundown is called
  **"Setlist"** in the UI; its right click (and Planejar) has "Tirar da
  setlist…" / "Tirar a seção…" (`setlistActions.js`: asks with
  `useConfirm`, then renumbers from the store; 0.2.19). **Setlist automática**
  (owner 2026-10-20, Rodada N2): "Autoplay" (Rodada O3; "Avançar sozinho"
  in its tooltip) in the Setlist's FOOTER (Rodada Q, Q1, owner's pick S1 = A:
  the header keeps only "Setlist · n itens · tempo" and its icons; the footer
  `SetlistFooter` in Rundown.jsx holds the switch and two icon-only buttons,
  Item anterior / Próximo item, the words in the tooltip with the item's name
  and as screen-reader text; they send the neighbours of the item on air in
  SETLIST order — `neighbours` in setlist.js, tested, nothing on air = the
  first playable item — as the autoplay sends, `keepPrev`, the Prévia
  untouched, a locked screen refusing with the usual message; the body is a
  column: `.rund-scroll` scrolls, the footer stays) is the culto's switch (`Service.autoplay`,
  synced); with it on, the item on air that ends does what its "Ao terminar" says (`ServiceItem.end_action`:
  next — the default, "" and the old `autoAdvance` too — loop or stop; the
  row's menu and Planejar o culto): the next playable item (sections and
  disabled ones skipped) goes on air after the pause (`Service.autoplay_gap`,
  else Configurações › Culto's `User.autoplay_gap`, 5 s), counted down on its
  row and in a toast with Cancelar. "Ended" is `itemEnded`
  (`src/lib/console/autoplay.js`, tested): a file's end as an output reports
  it (`live.ended`: `media.clear`/`video.clear` with `ended`, a list past its
  last item, `audio.ended` for a single file — never Esc, Limpar or Parar),
  or played to its length; anything else its `duration` while on air (none:
  never, "Sem duração" in the menu). `useSetlistAutoplay` (console only,
  never /Janela) watches every 250 ms and sends as the console's own send
  (`keepPrev`); Esc cancels the countdown first (`escapeTarget` "countdown"),
  and so does any send meanwhile; locked it refuses and says so, and with
  the projector window closed and something to hear it stops (amber).
  Output windows are never background (occlusion
  tracking off in `electron/main.cjs`): don't reintroduce per-element audio
  taps — the level meters read the system loopback in the console.
- **After a crash the screens come back lit** (owner 2026-10-20; a normal
  start still reopens on Tela preta): `running.json` (`electron/runMarker.cjs`,
  tested) lives in the data folder while KERYX runs, rewritten every 15 s
  with the outputs open, and goes on `will-quit` and `session-end`. Found at
  start with a sign of life under 20 min old, `createLive({ afterCrash })` →
  `restoreState(…, { afterCrash: true })` keeps `screen` and `locked`
  (playback stays paused), `openAtLaunch(crash.outputs)` reopens what was
  open, the bell says so. The installed app also runs a watchdog
  (`electron/watchdog.cjs`, tested; never in desktop:dev or the smoke) that
  starts KERYX again when main dies, at most 3 times in 5 minutes. An
  import/restore restart (`importOutcome`) is not a crash. The console's
  reload keeps the Prévia (sessionStorage) and opens on the culto on air
  (`chooseService`, serviceChoice.js); outputs retry their first live read.
- **Selecting several** (owner 2026-10-21, mockup "Seleção múltipla", marks
  M1–M7): one model for every list, `src/lib/console/multiSelect.js` (tested)
  through `useMultiSelect` (mode "gallery": a click picks one; "air": a plain
  click clears and the list prepares as always, M1 = A), with `SelectManyBtn`
  ("Selecionar vários", never "Selecionar" alone), `RowMark` and `SelBar` from
  kx.jsx and the `is-marked` state ("Selecionar vários" stays in the
  header of the windows — the Mídia, the background library, Planejar o
  culto, the Escola, Temas —; **in the console's Biblioteca and Setlist it
  shows only while on** (owner 2026-10-28, I3 = A, reversing M2 = A
  there): a Ctrl/Shift + click or Ctrl+A turns it on (`useMultiSelect`'s
  `autoPick`), as does the row menu's "Selecionar vários" (`pickFrom`,
  that row marked), and it goes when the selection is cleared; once something is marked the SelBar shows "Selecionar todos" —
  the Bíblia's two check marks, `checks`, Ctrl+A too — beside "Limpar a
  seleção": `onAll`/`total`, Rodada P6; the Mídia's side panel has it too;
  `--sel-bg`/`--sel-ring`, the blue of
  Travado). Ctrl/Shift + click and the mode never prepare or send; Esc clears a
  console list's selection before the air (`selections`,
  selectionStore.js; keys.js ESC_ORDER "selection"), a page of THE window
  through its escRef. The Mídia page is the reference; the Biblioteca, Setlist,
  Planejar o culto, Temas, the background library (opened to manage or to choose: one library, only its footer differs — Fechar, or Usar · Cancelar; the marks are for Excluir…, Usar takes the one chosen and names it while marks are on, owner 2026-10-23, S10 = A) and the Escola
  follow (Temas and the Escola in "air" mode: a plain click still edits or
  prepares; the library's marks get ONE question, "Excluir…" with the trash when
  a file sent there goes for good, else "Tirar dos fundos…" (`backgroundRemoval`,
  `backgroundAction` and `backgroundQuestion` in bulkDelete.js, out of the
  outputs' bundle), its Esc through the host's `escRef`); the Temas panel and the
  short settings lists stay single.
  **The KERYX package, `.keryx`** (M6 = A; Rodada O, O1-1 = A, O1-2 = C): one
  file for every kind — songs, themes, avisos, media, Escola materials — with
  what each uses (its themes, the Media rows and files it names, their
  BackgroundPref, the church's fonts by family). The rules are
  `src/lib/keryxPackage.js` (tested: `packageFor`, `openPlan`, `importSteps`,
  `rewriteRow`); the zip is `electron/keryxPackage.cjs` (manifest.json,
  items.json, media/, fonts/; `.partial` then rename; a file over 1 GB stays
  out, named in the manifest's `left`; IPC `keryx:package` export | open |
  fits | take | close; the preview server uses the same module). A package
  comes from another church, so it is untrusted: open checks an entry
  allowlist and caps (count, 1 GB a file, 16 GB in all, by the declared sizes,
  which yauzl holds the bytes to) and reads only the manifest and the rows;
  only the files the operator's choice needs are unpacked, one at a time,
  after `fits` says they fit. **Videos go through the codec rule as
  `uploadFile` does** (O11 = B): a Media row of the package whose
  `video_codec` fields say it may freeze is ✕ in the list and never taken;
  any other video is read before the copy (`read`, a byte range, and
  `readVideoCodec`) and refused there, refusalSummary's words in the toast;
  what used it comes without it. "Exportar…" (the selection bars, the multi-row and
  row menus of the Biblioteca and the Mídia; `exportItems` of `usePackages`,
  `PackageDialogs.jsx`) asks "Com os arquivos" or, for songs, "Só as letras"
  (the JSON of always); Biblioteca › + › "Abrir pacote do KERYX…" or a .keryx
  picked in Importar músicas opens the list grouped by kind: ✓ novo, ! parece
  repetido (songs by `songKey`, themes by name, a file by type + title + size,
  a font face by family + weight + style) with "Trazer mesmo assim" / "Trazer
  como cópia", ✕ não abre. "Pular os repetidos" (on) governs only songs,
  avisos and materials (`SKIPPABLE`): a repeated one stays out. A repeated
  theme or file is reused by what comes in, whatever Pular says, and comes as
  a copy only from its own box (O1-2 = C). What only a skipped row used stays
  out too. Ids are always new and nothing
  is overwritten; files go into the media folder through `importMedia` (a new
  name) and every row through the store, so the sync records them. A new
  field that holds a reference to another row goes in `rewriteRow`.
- **Realtime is `keryx.entities.<Name>.subscribe(cb)`.** Returns an
  unsubscribe function — always call it in the effect cleanup. Every write
  reaches every window with the whole row, deletes included.
- **No login.** `auth.me()` is one local operator profile (`entities.User`
  maps to it whatever id is passed). Don't add features that assume
  accounts: the one sign-in is the church's Google account for the sync
  between its computers (`electron/sync.cjs`), never a person's. The profile and the church's preferences are read through
  `src/hooks/useUser.js` (`useUser`, `usePrefs`, `getPrefs`, `updateUser`;
  null = default, `src/lib/prefs/schema.js`): a preference that should ride
  a backup is a User field, never localStorage (that is for this computer:
  window sizes, the arrangement).
- **Bible text goes through `src/lib/bibleText.js`** (`getChapter`,
  `getPassage`, `searchVerses`, `searchBible` — the console's word search,
  query rules in `src/lib/bibleSearch.js`): local database, then
  **bolls.life** (owner 2026-10-20; abibliadigital, the old source, has
  answered 503 since October 2026). Every edition installs
  (`BIBLE_VERSIONS`, `install: true`; `electron/bible.cjs` `SOURCES`:
  NVI, ACF and AA from github.com/thiagobodruk/biblia, ARA, ARC, NAA, NTLH
  and KJA as bolls.life zips, and the **open editions of eBible.org**
  (owner 2026-10-20, the "Bíblias" mockup: BLIVRE porbr2018 CC BY 4.0 BR,
  NBV poronbv CC BY-SA, BPM porbrbsl domínio público, BLT porblt CC BY-SA
  — `nt: true`, só o Novo Testamento, "A BLT tem só o Novo Testamento" on
  an OT book, `missingTestament`) as their `_vpl.zip`, install only
  (eBible has no chapter endpoint); `group` publisher | open, `holder`,
  `chip`, `license` on each) and is read online while it is not, one
  chapter at a time through the main process (`online`: the bolls.life
  code, ACF as ACF11; NVI, AA and the open ones have none — bolls.life
  refuses NVI). An install is whole or nothing (`MIN_VERSES`, the BLT
  `MIN_NT_VERSES`) and replaces the edition (`store.dropRows` first).
  **Every file is read by `electron/bibleFormats.cjs`** (tested with
  fixtures in `electron/fixtures/bibles/`): USFM (zipped or not, notes and
  cross references out), VPL ("GEN 1:1 …", any code or name), OSIS
  (containers and milestones), Zefania, MySword `.bbl.mybible` (node:sqlite
  on a temp copy), the thiagobodruk and bolls.life JSON; book codes of
  every scheme map to the 66 (`CODES`, deuterocanonicals out); e-Sword
  `.bblx` (enciphered), PDF and Word are refused with what to do
  (`REFUSE`). `cleanVerse` (there now, re-exported by bible.cjs) strips
  the source's markup (NAA's `<sup>` footnote marks go with their
  content). **An edition of the church's own** (Instalar uma edição
  própria…, `settings/OwnBibleDialog.jsx`; `createOwnInstaller` in
  bible.cjs, IPC `keryx:bible:own` read | install | remove): the file is
  read first (format, books, verses, language, Gênesis 1:1 and João 3:16),
  then installed with a name and a sigla the church gives (`siglaProblem`,
  the same in src/lib/bibleEditions.js and bible.cjs: 2–8 letters or digits, none of
  the list's, not `BKJ1611`) only once the church ticks that it may use it
  (`rights`, required); its verses are BibleVerse rows under its sigla and
  its metadata a `BibleEdition` row, both `ON_EACH_COMPUTER`; rows have
  Trocar o arquivo… (the sigla stays) and Excluir… (useConfirm). The list
  of every edition is `editionList(BibleEdition rows)` (bibleEditions.js, kept
  out of bibleBooks.js, which the outputs load; `useBibleEditions`);
  `editionPlan` treats an own edition as installed-only, and
  `biblesMissingHere` says "A BKJ é uma edição da igreja: instale-a com o
  mesmo arquivo" with no Instalar aqui. Configurações › Bíblias instaladas
  is three groups (`bibleGroups` in `src/lib/console/bibleRows.js`: Da
  igreja, Abertas · eBible.org, Com direitos da editora), each row its
  licence chip. **The open editions' credit** (b3 = sobre) is
  `editionCredit` ("Nova Bíblia Viva 2007 · Biblica, Inc. · CC BY-SA 4.0
  · eBible.org"): Configurações › Sobre lists every one installed, and the
  Bíblia's version select says it in its tooltip; the projected reference
  is unchanged. BKJ 1611 left the list: a saved `BKJ1611` reads as KJA
  (`renamedVersion`). The edition the operator chose is read with
  `readChapter` (`editionPlan` in `bibleBooks.js`): installed, else
  online, and a chapter that cannot be fetched comes from an installed
  edition, said so; with none installed the message says why the internet
  failed. The browser preview reads and installs the same way
  (`scripts/preview/server.cjs` bible-online / bible-install / bible-file /
  bible-own-read / bible-own; the browser's file chooser stands in for the
  desktop's dialog). Never ask an AI for scripture, and don't fetch verses
  anywhere else. References parse with `parseReference` in
  `src/lib/bibleBooks.js`. Verse marks inside a slide's text are read with
  `src/lib/verseMarks.js` (numbers in sequence only). Favourites and notes
  are `BibleNote` rows (`useBibleNotes`). Never bundle Bible text: the
  editions are copyrighted; churches install them (`electron/bible.cjs`).
  **Bíblias neste computador** (owner 2026-10-27, "as mais usadas,
  instaladas sozinhas", pick C of three): the first time the console opens
  on a computer never asked with no edition installed it asks which to
  download (`BibleSetupDialog.jsx`; `setupAsks`, `setupRows` in
  `src/lib/console/bibleSetup.js`, tested), the most used ones ticked —
  `DEFAULT_BIBLES` NVI, ARA, ARC, NTLH in `shared/bibleSetup.mjs` (the
  rules, tested) —, the church's own files never listed; "Baixar n
  Bíblias" records the answer and the main process downloads them in the
  background, one at a time, each whole or nothing as Baixar does
  (`electron/bibleSetup.cjs`, tested: settings.json `bibleSetup`, retried
  at launch, every 10 min while any waits, on resume and when the console
  sees the internet back; no internet ends a pass, the source answering
  wrong gives up after `MAX_TRIES` or at once for a file that is not a
  whole Bible; the end rings the bell, the console toasts
  `finishedWords`). KERYX still never takes a publisher's edition by
  itself: the click is the church's, the licence line is on the dialog.
  "Agora não" records the answer; Esc only closes it this time. Reopened
  from Bíblias instaladas › "Escolher as Bíblias…" (installed rows held
  ticked, a `setupLine` says what waits or failed, Tentar de novo); the
  version in use follows the answer when it was left out
  (`defaultAfterSetup`). The browser preview runs the same rules in the
  page (`src/api/backends/preview.js`); a smoke run never asks (main.cjs
  writes the answer first).
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
  **The church's fonts** (owner 2026-10-19, Rodada HF1, mockup H3
  `pc_arquivo`): a theme's `font_family` is a KERYX key (`FONT_MAP`: sans =
  Geist, the other seven the device's fonts, "· do aparelho") or the
  **family name of a font the church brought in** — from the PC's installed
  fonts (the "Fontes do computador" dialog, `editor/LocalFontsDialog.jsx`)
  or from a font file (.ttf/.otf/.woff2/.woff). **KERYX lists the PC's
  fonts itself, as Holyrics does** (owner 2026-10-20): the main process
  reads `%WINDIR%Fonts` and the per-user
  `%LOCALAPPDATA%MicrosoftWindowsFonts` (`electron/systemFonts.cjs`,
  tested; IPC `keryx:fonts` list/read, `integrations.Core.SystemFonts` /
  `SystemFontFile`; the preview server serves the same module), only the
  table directory, `name` and OS/2 of each file: a family is the Windows
  family (nameID 1, so "Segoe UI Semibold" is its own entry), a face its
  style (nameID 2), a `.ttc` collection's face is cut out into a font of
  its own when read, a face whose licence forbids embedding (fsType
  restricted) is listed but never copied, and a face is read only by an id
  from the last scan. No page uses Local Font Access: the `local-fonts`
  permission is refused everywhere (main.cjs). Either way the file is **copied into the media library**
  (`UploadFile`, as bytes) as **Media rows of category `font`, one per
  face** (Regular, Bold, Italic, Bold Italic at most; `Media.font = {
  family, weight, style, face, origin }`, `title` = the family), so it syncs
  between the church's computers like any media and `electron/server.cjs`
  serves it to every output window and network screen; every window
  declares them with one `@font-face` each (`<FontFaces/>` in App.jsx,
  `src/hooks/useFonts.js`, `fontFaceCss`), and `fontStack(family)`
  (`src/lib/fonts.js`, tested — the helpers, the magic-byte `fontKind`, the
  faces' weights) is what every renderer and still draws (a copy not here
  yet draws Geist). KERYX never downloads a font; the dialog's licence line
  says the Windows and bought fonts have their own licence. Font rows are
  out of every media list (`useLibrary().media`, the Mídia, the editors'
  pickers; `isFontMedia`) and listed by `useChurchFonts()` — the picker's
  "Da igreja" group (`editor/FontPicker.jsx`: KERYX / Da igreja / Trazer,
  also `FontSelect` in the aviso and song editors) and Configurações ›
  Temas e fundos › **Fontes da igreja** (Excluir… via useConfirm, refused
  while a theme names the family). A font dropped in the Mídia is refused
  (`mediaTypeOf` "font", `FONTS_IN_EDITOR_HINT`); a `.ttc` file picked
  with "Arquivo de fonte…" is refused by the copy (`COLLECTION_HINT`), 20 MB
  is the cap. Verificar
  says per church font whether it is copied, still coming (Baixando…) or
  gone. `useFitWidth` re-measures on `document.fonts` `loadingdone`, so a
  font that arrives late re-fits the line.
  **A theme's size is a number** (owner 2026-10-19, Rodada HF2, mockup H3
  `numero_atalhos`: "tamanho da fonte customizável, não predefinidos"):
  `ProjectionTheme.font_size` is cqw, % of the screen's width, 1 to 12, one
  decimal, stored as a string ("4.8": the column stays text, no migration);
  the old names (xsmall…xxlarge = PP…GGG = 2.4/3/3.8/4.8/5.8/7) read as their
  number forever and are what songs and avisos still choose. One module,
  `src/lib/textSize.js` (tested): `sizeCqw` (number, "4,8", a name, "" →
  4.8), `sizeValue`, `sizePreset`, `sizeLabel` ("G", else "4,5 %"),
  `sameSize` (`isFactoryLook`/`sameLook` compare with it: "4.8" is the
  factory "large"), `lineHeightOf`. The renderer sets `--ks-size:
  <n>cqw` on `.ks-content` and `.ks-text` reads it (no `ks-<size>` class
  any more); `lineLimit` (lyricFit.js) takes a size and `{ em, spacing }`,
  `emPerChar(family, weight)` (`src/lib/console/fontMetrics.js`, a cached
  canvas measure, 0.55 while the font has not loaded) feeding the song
  editor's "fonte menor" badges from the look the song is sent with; the
  screens' hidden probe stays the truth. **The theme's typography** (all ""
  = as before, EXTRA_KEYS so it rides like the box): `font_weight`
  normal|bold (400/700; "" = the CSS 600, 500 in a passage), `font_style`
  italic, `line_height` a number 0.9–2 or the old tight|normal|loose (the
  live state takes either), `letter_spacing` em −0.1…0.5, `text_outline_px`
  0–8 (px of a 1920 screen, drawn behind the letters with `paint-order`,
  so the stroke is twice that wide) + `text_outline_color` (#rrggbb, black
  by default) — independent of `text_effect`, whose hollow `outline` is
  "Vazado" now — and `note`, the Comentário (≤ 500, never on air: the
  theme's tooltip in Temas, `themeNote`). `typography(style)` in
  deviceStyles.js (tested) turns them into the text's inline style. The
  Editor de temas edits them with `NumBox` (kx.jsx: `− [n] + unit`, 24 px,
  ↑/↓ step, Shift ×10, typing commits on Enter or blur, clamped).
  **The text bar** (Rodada P, P8-1 = A, owner 2026-10-22; `editor/TextBar.jsx`):
  one Word-like row fixed over the Editor de temas' form (its groups stay
  below) and over an element's settings in the Editor de telas — the font,
  the size (`NumBox`), N I S, "Aa ▾" (Normal / MAIÚSCULAS / Primeira
  Maiúscula), Esq./Centro/Dir./Justificado, Cor ▾, Contorno ▾ (and
  Espaçamento ▾ for an element); it speaks the theme's keys. Three keys
  came with it, EXTRA_KEYS and `STYLE_CHOICES` like the others:
  `text_decoration` underline, `text_justify` justify (the text justified,
  the box still where `text_align` puts it, so dragging the box never
  loses it; lines that end in a line break, a song's, stay as in Word) and
  `text_case` capitalize; `typography()` draws them (text_case moved there
  from the renderer). **A song's size is relative to its theme** (P8-2 = B,
  `src/lib/console/songSize.js`, tested): the song editor's Tamanho is
  −2 −1 Do tema +1 +2, kept in `Song.font_size` read as steps from G
  (`songStep`: P −2, M −1, G or "" 0, GG +1, GGG +2, PP −2 — old songs read
  lazily, nothing rewritten, and an older KERYX still draws them the same
  over a G theme; `stepValue` writes the preset). The size never makes a
  song "own" any more (`followsTheme` ignores it), and the song keeps the
  whole theme: `withThemeDefaults` fills the theme's extras (box, position,
  spacing, weight…) also under a look of its own (`inherit.extras`; false
  only for a song following a theme of its own, a complete look) and moves
  the theme's size by `inherit.step` (`steppedSize`, along the presets'
  ladder; 0 keeps the theme's value as it is); `withSongThemes` moves its
  own theme's and its parts' sizes the same way. **Outputs load every
  module they import whole**: `defaultTheme` and `themeBackgroundArgs`
  live in `themeCore.js` (themes.js re-exports them) so themes.js and
  songSize.js stay out of the outputs' path (bundle-budget.cjs); keep it so.
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
  work from the database and the live state alone. They load their pages
  from the built `dist/`, never from Vite, even under `desktop:dev`: a
  phone showing an old /Remote means a stale `dist/` (the 23/10 Equipe
  test), not a bug. `desktop:dev` now rebuilds it when a file under `src/`
  or `shared/` is newer than `dist/index.html` (`scripts/dist-stale.cjs`,
  tested; `KERYX_SKIP_BUILD=1` only warns); a hand-run `vite` or a
  Vite-only preview does not, so `npm run build` first.
  The one thing on the
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
  KERYX no computador". A new action is an entry in the JSON first.
  **The Equipe** (Rodada Q, PR1; S6 = A, S8 = A): a third code beside the
  screens' PIN and the controle remoto's (`network.team` in the electron
  settings, the same shape as `network.remote`, off by default, never equal
  to the remote's). Both codes sign in on the same page and the code decides
  the role (its own cookie `keryx_team`; signing in with one clears the
  other's). **KERYX no celular** (owner 2026-10-27, marks: that name, "A ·
  uma tela", main switch + one per code): Configurações › Telas na rede has
  ONE group for both (`PhonesBlock.jsx`, `rede.celular`; `phonesSummary`):
  the switch "Celulares" (`network.phones.enabled`, `setPhones`; never set =
  on, so the doors decide as before; shown on only while a door is open; on
  with none open opens both; off signs every phone out and keeps each
  door's code, key and switch; opening a door turns it on), one address and
  QR, then the Controle's and the Equipe's cards side by side, each with its
  switch, code (Mostrar / Trocar) and Conectados. A door is open only under
  the main switch (`doorOn` in lan.cjs). The phone's sign-in
  (`codePage`, no script) shows Controle | Equipe — only the open doors,
  nothing chosen at first unless `?role=` or the `keryx_side` cookie (the
  side entered by last: a preference, never a permission) — then "Código do
  controle" / "Código da equipe"; the form posts `role` and the server
  checks the code against THAT side alone (the other's code there is a
  wrong code and counts toward the same lockout); no `role` = either code,
  as before. `team` runs only the actions marked `team: true` (with
  `teamArgs`, the only values it may give, and `teamNeeds`, the args it
  must also give: `library` only as the songs or, Rodada Q S15, the Mídia's
  videos and audios — `tab: media` with `kind` video | audio, never without
  a kind, never images, PDFs, avisos or the Escola) — `state` (the reduced `teamState`),
  `library`, `bibleFind`, `songText`, `requests`, `chat.send`,
  `request.send` — checked by `remoteCommand(body, role)` in lan.cjs (403
  `forbidden`) and again by the runner (`remoteRoleAllows`); the Controle
  never runs the `requests` cap and gets `plan` (`setlist.add`: a song,
  media or material through `addStageToSetlist(…, { silent })`, a passage
  only with its verses through `addPassage`). The chat and song requests
  are `ServiceMessage` rows of the culto (synced; `sender`, not `from`;
  never the legacy ChatMessage; `side` team | operator — "" = team, rows of
  before —, S12/S14), made quietly (the console's toast comes from the rows), a link only YouTube's rebuilt from its id
  (`youtubeLink`), the same message within 30 s returning the row made, 3
  in a row then one every 2 s per address (`gate.message`); an Equipe
  phone's event stream hears ServiceMessage changes too. In the preview a
  cookie `keryx_role=team` makes the /Remote tab the Equipe's.
  **The console's Pedidos and Chat tabs** (PR2; the owner's mockups, S6 = A,
  S8 = A, S12 = B, S14 = A; `PedidosTab.jsx`, `ChatTab.jsx`, pure rules in
  `src/lib/console/pedidos.js`, tested): the culto's rows
  (`useServiceMessages`) oldest first, the newest at the bottom, each tab
  its own kind (`pedidosOf`, `chatOf`). **The Chat** is a conversation
  both ways: the operator's bubbles on the right in gold (`--brand`), the
  Equipe's on the left, "who · hh:mm" over each (`chatHead`), the composer
  fixed at the bottom (Enter sends). **What the operator writes goes through
  the store, never a network action**: Console.jsx's `writeMessage`
  (`ensureService`, then `ServiceMessage.create`) with the fields of
  `operatorChat` / `operatorPedido` (`side: "operator"`, sender
  "Operador"); the phones read it with their next `requests`. A pedido is a
  card "<singer> canta <song>" with its note, every text drawn as plain
  text (it came from a phone). **Novo pedido** (S14 = A) on top of the
  Pedidos tab notes one with the phone's fields (Quem canta, O louvor typed
  or picked from the library; Observação), "Anotar pedido" · Cancelar.
  **O louvor is a song, a video or an audio** (owner 2026-10-24, S15 = A,
  "um campo só, com abas Letras · Vídeos · Áudios"): under the field, while
  it has the focus, a picker with those three tabs and Buscar (empty, what
  O louvor says; `pickRows`, `PICK_TABS`), closed by a pick, Esc or a click
  outside; images, PDFs, fonts and backgrounds never show
  (`pedidoMediaKind`); typing by hand is still free text with no id. The
  row keeps `ServiceMessage.mediaId` beside `songId` (never both; the
  runner and `operatorPedido` drop one the Mídia does not have as a video
  or an audio, keeping the typed name). Its card wears the file's glyph
  (`mediaIcon`; a song the `music` one), a "vídeo" / "áudio" tag
  (`pedidoMediaTag`) and "arquivo não encontrado" / "baixando…"
  (`pedidoMediaWarn`); Pôr na prévia is `stageFromMedia` and Setlist the
  Biblioteca's own add (`addStageToSetlist(…, { extra })`, who sings
  kept). Its card says "Anotado por você"
  with an "operador" badge and a gold ring (`pedidoBy`), the same actions,
  and the Equipe sees it as "Anotado pelo operador". **A card is two lines**
  (owner 2026-10-28, C1 = A): the glyph, "X canta Y", its badges and the
  hour; then who noted it and the note, cut with "…" (whole in the
  tooltip), beside the actions as glyphs (`prev`, +, ✓, the trash; the
  names in their tooltips). A card's actions are
  always on screen: Pôr na prévia and Setlist when the song is the console's
  (`mediaOfPedido` first, then `songOfPedido`: its songId, else the title folded) — **the Setlist item
  keeps who sings** (S13 = A, `pedidoItem`: `ServiceItem.requested_by`
  and the note as its `notes`; the Setlist and the planner rows wear a
  gold tag with the `user` glyph, `SingerTag` in kx.jsx, **always whole**
  (owner 2026-10-28: it never compacts; the title gives way with its "…"); Planejar o culto edits it as "Pedido de";
  the culto's PDF prints "· pedido de <nome>" after the title; the Equipe's
  Setlist shows it, `teamState` items' `singer`) —, else "não está na
  biblioteca" and
  Procurar a letra… (LyricsSearch opens with the song, `initial`);
  Atendido (`status` done, the card dims, the toast has Desfazer);
  Excluir… via useConfirm. A YouTube link shows its cover with Pôr na
  prévia and Adicionar à Mídia (`mediaFromYouTube`): nothing enters the
  Mídia by itself. The toast is `usePedidos` (Console.jsx only, never
  /Janela): a row sent within 2 min (`FRESH_MS`) whose id this window has
  not said (sessionStorage, so a reload never repeats one) says "Pedido de
  <nome>: <louvor>" / "Mensagem de <nome>" with Ver (to that row's tab),
  never for what the operator wrote nor while that tab is open on screen;
  it also puts Pedidos or Chat back in the panel's tabs when the
  operator's `layout.tabs` leaves it out (`showTab`). **The dock never moves by itself** (owner's S9 = B):
  with the Painel not on screen (the tray, as in the medium and narrow
  tiers) the toast has no Ver and ends "· veja em Ver › Painel", and a gold
  dot marks the top bar's Ver and the Painel's row in its menu while there
  are rows not seen (`verDot`, Menu's `newIn`). Each tab's dot (`dot` on a TabRow tab, `.kx-tc-dot`
  after the name, the brand's gold) is a row of the Equipe newer than the
  last one seen with that tab open (localStorage
  `keryx.console.pedidos.seen` / `keryx.console.chat.seen`).
  `remoteCommand` (lan.cjs) checks every command against it; a phone
  signed in only with the remote's code (the screens have a PIN it does
  not have) reads only `/api/live`, `/media`, `User` `get` and its own
  event stream (User, live and `hb` frames; `/api/screens` is 401); taps
  past a burst of 10 / 8 a second, or 4 waiting per phone (8 in all), get
  429/503 (`createRemoteGate`); `setlist.autoplay { on }` (T) is the Setlist's
  "Avançar sozinho" and `state.autoplay` its value (Rodada N2); every stream gets an `hb` every 10 s
  (`connection.lastEventAt()` in network.js) and is dropped past 256 kB
  unread; reads are never logged. Under `npm run dev` the `/Remote` tab
  works too: `scripts/preview/server.cjs` checks its commands the same
  way and hands them to the console tab that listened last
  (`remote.onCommand` in preview.js). **The console's side** (Rodada G6
  PR2b) is `createRemoteRunner` in `src/lib/console/remoteRunner.js`
  (pure, tested; one handler per action, `remoteProtocol.test` checks the
  list), mounted by `useRemote` (`src/components/console/useRemote.js`,
  one line in Console.jsx): it reads the console's lists through a ref and
  what is on air from `keryx.live.current()`, refuses in the order 423 →
  404 → 409 with the contract's codes, runs writes one at a time (Tela
  preta, Logo, Limpar, Tirar, Encerrar, Tirar o aviso and Travar never
  wait: `EMERGENCY`) and says on the console what the phone did ("Celular:
  …"; not the reads, a volume step, a seek or a slide picked). Its pure
  parts are `src/lib/console/remote.js` (`remoteState` v2, `libraryPage`,
  `refFromArgs`, the kinds) and a reference typed by hand reads through
  `referenceFrom` (quickRef.js: "jo 3 16" and "Jo 3:16" alike, a chapter
  alone too — the palette uses it as well). A remote send is
  `send(stage, { keepPrev: true, why })` (useConsole): the operator's
  Prévia stays unless it is that item, and the refusal comes back with
  its code (`sendBlock`, src/lib/console/sendBlock.js). **The phone's
  page** (Rodada G6 PR3, the owner's picks of 17/10) is `src/pages/RemoteView.jsx` +
  `src/components/network/remote/` (styles `remote.css`; what it shows is
  `src/lib/network/remoteView.js`, tested): tabs at the bottom (a left
  rail at 600 px and up), a section only when `state.caps` has its cap
  (a v1 console: `isV1`), only the control pressed busy, S actions off
  while locked or stale (25 s without a frame), T always on; new items are
  picked, then sent from the sticky "Enviar ao ar · título"; Encerrar and
  Destravar are held. **The Controle's five tabs** (Rodada Q PR3, owner's
  mockup and mark S5 = A): Ao vivo, Setlist, Mídia, Bíblia, Mais — never a
  chat tab (that is the Equipe's). Ao vivo is the slides, Enviar o
  próximo, the compact Tela preta/Logo/Limpar row, the player and the held
  "Segure para encerrar tudo" (the smoke reads it there); Slides, Aviso and
  Timer are Mais › Enviar. Every other tab has **the No ar bar** under it
  while something is on air (`NowBar.jsx`, `nowBarInfo`, tested): ⏮ · the
  slide on air with "3/9" and the next · ⏭; its middle opens Ao vivo's
  controls in a sheet (the shared pieces are `remote/liveParts.jsx`). The
  Mídia keeps its chips and search still and scrolls only the list
  (`rm-main is-split`: `rm-fix`, `rm-scroll` — the paging sentinel's
  `root` —, `rm-foot`). **+ Setlist** beside Enviar ao ar in the Mídia
  (`addToSetlistArgs`: never an aviso) and the Bíblia (`biblePlanArgs`:
  only with verses) runs `setlist.add`, shown only with the `plan` cap;
  it is T, so a row can be picked for it while locked. Only Ao vivo is in
  the page's first load: the other tabs are lazy chunks (the outputs'
  budget). **The Equipe's page** (Rodada Q PR4, the owner's mockup, S8 = A)
  is the same `/Remote` signed in with the Equipe's code: `state.role`
  "team" draws `remote/EquipeView.jsx` (a lazy chunk) instead (`roleOf`;
  the role last seen kept in localStorage `keryx.remote.role`, so a reload
  draws the right page at once; a phone that never had an answer waits
  1.5 s for one, then draws the Controle). Four tabs (`TEAM_TABS`,
  `tabsFor`): Pedidos, Músicas, Bíblia, Setlist; on top a strip with no
  buttons, "No ar · título · 3/9 · só leitura" (`teamStrip`), never the
  NowBar. Pedidos is a **Pedidos | Chat** switch (S12; `.rm-seg`, each side
  with its gold dot, the Pedidos tab's dot for both, `hasUnseen` against
  `keryx.remote.seen`), each the culto's `requests` page of its kind
  (asked at once, every 15 s, the chat every 5 s while it is open —
  `requestsEvery` — and after a send; `messageRows`: this phone's own on
  the right as "Você", the operator's on the left in gold as "Operador", a
  pedido's "Pedido de X" / "Você pediu" / "Anotado pelo operador" and its
  "✓ Atendido"): the pedidos with "Pedir um louvor" at the foot, the chat
  with its composer (`chatArgs`: a YouTube link alone goes as "Vídeo do
  YouTube"); the "Pedido de louvor" sheet (Quem canta, O louvor typed or "Escolher da
  biblioteca" — Letras · Vídeos · Áudios, S15 = A, `PICK_CHIPS`, a video or
  an audio sent as `mediaId` —, the link, Observação; `pedidoArgs`, the
  contract's limits; each pedido wears its glyph, `pedidoGlyph` from the
  `requests` row's `media`);
  the sender's name is asked once and kept (`keryx.remote.name`, ≤ 40).
  Músicas lists the library's songs; a song opens its `songText`
  (`lyricParts`: Cifra when it has chords, A+) with "Pedir este louvor".
  The Bíblia is `BibleTab readOnly` (no Enviar, no + Setlist). The Setlist
  is read only (`teamSetlistRows`: no ar, próximo, who sings a pedido's
  item); a song item opens its
  lyrics through `songId`, which `teamState` items carry. Every text from a
  phone is drawn as plain text; no S or T projection action is wired for
  the team role (lan.cjs answers 403 anyway, and its message is the toast).
  `remoteCall` sends `v: 2` once and never again (504
  or a lost link = "Não sei se foi"). "Manter a tela ligada" loops
  `public/nosleep.mp4` (made by `scripts/nosleep-mp4.mjs`). Each screen says which
  page it shows when it connects (`/api/events?screen=`); the console lists
  the screens connected right now from that (`useOutputs`). Links and QR
  codes meant for other devices come from the network info's `urls`
  (Configurações › Telas na rede), never `window.location.origin` (that is
  127.0.0.1 on desktop). `keryx.isNetworkScreen` is true in such a browser.
- **YouTube links** (owner 2026-10-27, mockup "YouTube · checar o link e
  baixar para a Mídia", Y1–Y5): "Este vídeo não está disponível" on the
  projector is the VIDEO refusing embeds (its owner, or gone), never the
  Referer: an IFrame API page on http://127.0.0.1 plays. **Link do YouTube…**
  is `YouTubeDialog.jsx` (asked through PromptDialog, `ask.kind`
  "youtube"/"youtube-terms"): it checks the link with YouTube's oEmbed (main,
  `electron/youtube.cjs` `check`: 200 ok, 401/403 blocked, 400/404 missing;
  `Media.youtube_state`) and offers Adicionar o link and/or **Baixar para a
  Mídia**. A refusal on air (the player's `onError`, `LiveVideo onRefused`;
  the iframe stays hidden until it plays, so YouTube's error page never
  reaches a screen) takes the item off with `media.clear`/`video.clear`/
  `media.advance` `{ refused: code, url }` → `live.refused` (Y4 = A); the
  console says why with Baixar para a Mídia (`useYouTubeRefused`, a plain
  toast), the pill turns amber (`refusedNow`), the row and its Setlist items
  say "não toca pelo YouTube". **The download** is yt-dlp + ffmpeg **shipped in
  the installer** (Y2 = B: `scripts/youtube-tools.cjs` pins both by SHA-256
  into the gitignored `vendor/youtube`, `npm run youtube:tools`; the
  build's `scripts/before-pack.cjs` fetches them or stops, unless
  `KERYX_BUILD_WITHOUT_YOUTUBE=1`; packed as `resources/youtube`), H.264 +
  AAC up to 1080p (Y3 = A), run from a copy in `<data>/youtube` that updates
  itself (`-U`) weekly and on Configurações › Telas e saídas › Som e YouTube ›
  Atualizar agora, with KERYX itself in Node mode (`ELECTRON_RUN_AS_NODE`) as
  the JavaScript runtime yt-dlp needs. Main copies the file in (`importMedia`)
  and makes THE SAME Media row the file (Y1 = A; `source_url` keeps the link),
  so the Setlist plays the file. Progress reaches every window
  (`keryx:youtube`, `useYouTubeJobs`). Downloading goes against YouTube's
  Terms of Service unless the owner allows it: the church ticks once that it
  only downloads what it may use (Y5 = A, `User.youtube_download_ok`).
  ffmpeg is GPL v3, shipped as its own program with its licence (SOURCE.txt).
- **Media URLs:** the store keeps `keryx-media://<file>`; pages get
  `http://127.0.0.1:7700/media/<file>` from the adapter. Never write the http
  form into the database by other means, and keep checks like
  `startsWith("http")` working. **A picture's small copy is
  `Media.thumbnail_url` too** (owner 2026-10-23: the galleries decoded
  each photo whole for a 160 px tile): a WebP of at most 480 px made by the
  same backfill (`needsPoster` in mediaPoster.js: this computer's pictures,
  not a GIF or an SVG), drawn by every gallery tile through `tileUrl` (the
  Mídia, the background library, the Biblioteca's peek); the factory
  photos ship theirs in `resources/backgrounds/thumbs/` (`backgroundThumbUrl`,
  `backgrounds.test.mjs` checks each); on air and in the Prévia a picture is
  always its file. A video's still is `Media.thumbnail_url`
  (taken by the console, `usePosterBackfill` + `mediaPosterCapture.js`,
  sent through `UploadFile`); it rides in the live item as `poster` for the
  Prévia and shows on hover in the Biblioteca. **A video Fundo plays only on
  the outputs and the Programa monitor** (Rodada O, item 11; like a generator,
  `!preview || motion`): the Prévia and the Temas thumbnails draw
  `VideoStill`; **the background library plays** (Rodada Q, Q3): the side sample
  plays the chosen clip (muted, loop) and a clip's tile plays under the pointer
  or focus after 200 ms — one tile at a time (`useHoverPlay`), never a tile
  still syncing, never with reduced motion, never the media pool — the rest
  draw `VideoStill`; the Imagens/Vídeos chips and marks bar stay on screen and
  only the grid scrolls (`.lib-main.is-fixed`, `.lib-scroll`, as the Mídia's) (the row's still by file, `src/lib/videoFiles.js`, filled by
  the console and /Janela; else the paused first frame) — one file decoded
  15 times kept the loops still. A video's codec is read from its bytes
  (`src/lib/videoCodec.js`, tested: the MP4/MOV `stsd`, bit depth and chroma
  from hvcC/avcC/av1C/vpcC) on import and by `useCodecBackfill` (HTTP Range)
  into `Media.video_codec`/`video_bit_depth`/`video_chroma`. **A video that
  may freeze is refused, never converted** (owner's O11 = B, 2026-10-21:
  `codecProblem` = HEVC, H.264 above 8 bits or not 4:2:0; a codec the reader
  does not name passes) by `uploadFile` (mediaImport.js), **the one door
  for a file the operator picks** — the Mídia, the backgrounds, the song and
  aviso editors, an Escola material, a screen's design, Localizar…, the logo;
  `uploadFile.test.mjs` fails on any other `Core.UploadFile` call but the
  stills KERYX draws and a font — with `codecRefusal`'s words (HandBrake,
  "Fast 1080p30"; several at once are one sentence, `refusalSummary`, first
  in the toast); Localizar… clears the old file's codec; a row already in the
  library keeps its file and wears `CodecMark` ("HEVC · pode não tocar",
  amber, `.codec-mark`) in the Fundos' tiles, the Mídia and the Biblioteca,
  and the background library will not pick it for anything new. All the
  words are videoCodec.js's.
- **Apresentações are PDF only** (owner 2026-10-16, Rodada F3, "Só PDF"):
  when a PDF reaches the Mídia the console renders its pages with pdf.js
  (`pdfjs-dist`, a devDependency bundled by Vite; its worker and data files
  are served at `/pdfjs/` by `pdfjsAssets` in vite.config.js — never a CDN),
  ~1920 px wide, uploads each through `UploadFile` and saves
  `Media.pages` (`[{ url, w, h }]`, page 1 = `thumbnail_url`):
  `src/lib/pdfPagesCapture.js`, run by `usePagesBackfill` (old rows too; the
  rows say "Preparando páginas 7/12", `PagesMeta`, with a thin bar along
  the row's whole bottom edge, `PagesBar`). While a file is still being
  copied its row is already listed, "Copiando o arquivo…" (`copyingNow` in
  mediaImport.js, `copyingRows` in libraryRows.js, tested), and the real
  row takes its place (Rodada H, HB). Only the console makes the pages: a
  detached Mídia gets their progress from it (`pages.progress`, and
  Tentar de novo goes back as `pages.retry`, janelaRelay.js) and the
  phone in its rows' `progress` (remote.js `pagesField`). Putting a PDF
  that cannot go yet in the Prévia makes no toast: the Prévia says it. On air a PDF is a
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
npm run ds:tokens      # after editing docs/design-system/tokens.json (writes tokens.css; --format tidies the json)
npm run youtube:tools  # yt-dlp + ffmpeg (pinned) into vendor/youtube, for Baixar para a Mídia under desktop:dev and the preview
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
video plays, so a verse through a sermon went black. **The Saídas popover is one switch per local row** (2026-10-13): ligado = the window exists, the name of an open output brings it forward, states are plain text (`rowStatus` in `src/lib/console/outputs.js`, tested), and each row of the four renderer outputs says what it receives, "Recebe: Tudo ▾" (owner 2026-10-27, S1 = A; Palco, Pastor and Transmissão have none) and the banner stays the active alert; network rows keep Esquecer. **Remover saída** (Telas e saídas; also "Adicionar saída" there and in the popover) hides an output from the popover, the tabs and Verificar and never opens it at launch: the flag is `removed` on the electron settings `"outputs"` entry (per computer, carried by Exportar/Importar ajustes), the OutputPref row stays, so re-adding restores everything; `/Projection` is not removable (the Prévia mirrors it and send auto-opens it), and a network screen showing a removed page keeps working and keeps its row. Each renderer output (Projeção, Letras, Vídeo, Avisos) has its own settings, one `OutputPref` row per page path shared by the window and network screens showing that page: pages draw through `OutputScreen` (`src/lib/outputPrefs.js`, tested); no row means the output exactly as before. **Telas e saídas is a thumbnail grid** (owner 2026-10-13, no more vertical tabs — old `telas/<tab>` links just resolve to the section): one card per output showing a real still of what that screen draws now (`OutputPreview`, settings/OutputPreview.jsx — the card, the Editor and Telas na rede share it; connected network screens get the same still there); **the card is lean** (Rodada H2, owner 2026-10-19): the thumbnail, then icon · name · state dot · Abrir/Fechar on one line, then the status ("Tela cheia na Tela 2 · abre ao iniciar · com ajustes"; Remover no clique direito), and clicking the thumb opens the Editor on that screen — where the screen opens (the monitor select) and Abrir ao iniciar live in the Editor's **Destino** block (`useDisplays`, settings/useDisplays.js, one hook for the card and the block), every other setting in the other four. **The page is groups** (Rodada H1, owner 2026-10-19): Telas (the monitors and Identificar telas, static at the top — telas 1, 2 and whatever else is connected never fold), Saídas (the cards in a `repeat(auto-fill, minmax(200px, 1fr))` grid, 3–4 across; the footnote is the group's last line), Transições, Som e YouTube and Arquivo de ajustes (the last three closed, each with its summary); the Tela ociosa is no longer here — it is a group of Temas e fundos. **O que esta tela recebe** (Rodada H2 / G10, owner 2026-10-19; replaced Conteúdo and Mostrar) is ONE content rule per output, the same list on every output, `OutputPref.content_rule` = `{ kinds, top: { alert, logo }, empty: wall | black | logo }`: the kinds are `RULE_KINDS` of `src/lib/contentKinds.js` (Letras, Bíblia, Texto livre · Imagens, Vídeos do computador, YouTube, Apresentações (PDF) · Relógio e timer, Avisos — the same layers as Transições, finer where an operator thinks in files), "Por cima de tudo" is the Aviso rápido and the Logo no canto (the Camadas layer; it replaces `show_logo`), "Sem item da lista" (Comportamento) is what the screen shows with nothing from its list on air (the papel de parede as always, the Tela preta or the Logo). `ruleOf(pref, page)` reads the saved rule, else migrates lazily — nothing is written — the page's own rule (`PAGE_RULES`: what `lyricView`/`videoView`/`noticeView` drew; views.js now only documents them) with the old `content`, `hidden_kinds` and `show_logo` applied, so no row or an old row draws the same screens as before (a table of tests in outputPrefs.test.mjs; the old fields stay in the table, user data, read only there). `applyRule` filters the live state through it (`prefState`, the outputs, the Prévia, the Multiview): a layer whose kind is not in the list goes, the output shows what is under it or the idle look, a song's playback track keeps playing only where text kinds are received (`track`), overlays follow the text kinds, the console's Tela preta reaches every output but a screen of avisos only and the Logo every one but the screens of videos and avisos (as the old views did). The Vídeo screen plays its clip full screen while its kind (`ruleKindOf`: a video of the computer or YouTube) is in the list, and now also draws a video of the projector's media layer through the renderer. **The Palco and the Pastor** list the parts of their design instead (Cifra, Nome da parte, Relógio e tempo, Notas para músicos, Próximo slide / Próximos itens: today's `stageOptions`/`pastorOptions`; the select that swapped the whole design is gone — an old `content` on their row still works and Ajustes says so, with the way back) and keep only the Aviso rápido of the rule (`top.alert`). The Prévia warns, for every output that normally shows the prepared kind and by its rule will not (`leavesOut`: the one test behind every warning, so a Vídeo screen without lyrics by design never warns), with an amber band "X não vai mostrar Y · fica o papel de parede" and its fix "Mostrar Y também" (owner 2026-10-27, P1 = A; `outputsNotShowing`, `stageRuleKind`, `ruleWithKind`); the Multiview's quadrant label carries the rule's short name (`ruleLabel`), the whole line in its tooltip, as a button to the same menu as Saídas' "Recebe" (S2 = A; still no destination controls), and a quadrant whose rule leaves out what is on air says so on its image, "Não recebe Letras · papel de parede" (P3 = A, `leftOutNow`); the Programa's pill counts only the screens that show the item, "em 1 de 2 telas" in amber, its tooltip saying which output leaves what out (P2 = A, `outputsLeavingAir` → `outputHealth`'s `leaving`). **What an output receives changes from the console too** (owner 2026-10-27, mockup "Telas e saídas, mais simples", T1–P3 all A): `useOutputRules` (src/components/console/useOutputRules.js) is the one door for Saídas' "Recebe", the Multiview's chip and the Prévia's fix — the four shortcuts (`ruleWithShortcut`: Por cima de tudo and Sem item da lista stay) and "Personalizar no Editor", saved at once, the toast saying what it took off the air now (`ruleDrops`) with Desfazer and Ctrl+Z (S3 = A). A new kind of content gets its entry in `RULE_KINDS` (and a row in Transições if it has one). **The Aviso rápido is one bar on every screen, in each screen's look** (Rodada E3, owner 2026-10-16): `alert.show` is drawn by `AlertBar` (`src/components/screen/AlertBar.jsx`, `.ks-alert` in screen.css) — inside ScreenRenderer, over a design (LayoutRenderer's `alert`, never inside its Projeção element), over the Vídeo's clip and beside the Palco's StageScreen (`AlertLayer`, a fixed box: `.net-stage` pulls its children into the flow); the old framer-motion pill (AlertOverlayRenderer) is gone, don't bring a second look back. Each output picks Posição (Alto/Baixo), Estilo (Faixa/Pílula), Cores, Tamanho (P/M/G) and Entrada (Deslizar/Aparecer/Nenhuma) in the Editor's Ajustes › Aviso rápido: flat `alert_*` keys of `OutputPref.options`, read by `alertOptions(pref, page)` (tested; no key = `ALERT_DEFAULTS`, the amber band across the top as the Projeção always drew it — except **the Palco, whose bar starts at the bottom** (owner 2026-10-16, `alertDefaults`: its header with title, Tom, BPM and clock is what the musicians read, and its old pill sat there; its Ajustes can still say Alto) — so every caller passes the page) and carried as `alert.look` by `prefState` (only when not the default, so no row = the same state) or `alertOf` (Palco, Vídeo's clip); the entrance respects reduced motion, and a type `"alert"` stays red. Every output keeps the alert (its rule's "Por cima de tudo" can leave it out); the Palco shows it while a song is on air, the Pastor's page never (`showsAlert`). The Programa monitor draws the raw live state, so it shows the default bar. **Exportar / Importar ajustes das saídas** (Telas e saídas) is one JSON file with every output's placement and every page's `OutputPref` settings (`src/lib/outputsFile.js`, tested; the theme travels by name): the main process only saves and reads the file (`keryx:displays:export-file` / `import-file`, 1 MB at most); the console checks it, says what will not come out the same on this computer, and applies it through `displays.set` and `OutputPref` (rows updated or created, never deleted). A new setting on `OutputPref` goes in that file too (the Aviso rápido's `alert_*` options ride in `options`, checked both ways by `cleanAlertOptions`; the rule rides as `content_rule`, checked by `normalizeRule`, and a file from before it migrates from its old Conteúdo / Mostrar fields the same way a row does). **Cada tela é dona do seu desenho** (owner 2026-10-13; reverte a decisão
de 2026-10-12 dos layouts avulsos): o desenho mora em **`OutputPref.design`**
({ elements, background } no formato de `normalizeLayout`) — `designOf(pref,
layoutRows)` em `src/lib/outputPrefs.js` (testado) resolve: o design da
tela; senão o antigo `layout_id` (migração preguiçosa, nada é gravado — a
primeira salvada no Editor grava o design e zera o layout_id); senão null =
a página padrão (StageScreen / PastorScreen / renderer puro). O catálogo
"Layouts das telas", o select de Layout, "Usar em…", "Ver como", `?for=` e
o `?layout=` da rede **morreram**; as linhas ScreenLayout são agora **os
modelos da igreja** (owner 2026-10-22, Rodada P, P8-3): "Salvar como
modelo…" no Editor de telas grava uma (nome único, nunca sobrescreve) e
"Começar de um modelo…" as lista em "Da igreja", abaixo das "De fábrica",
com Excluir… — as linhas antigas do catálogo aparecem ali; nenhuma tela
aponta para um modelo (começar de um copia o desenho). As páginas leem com `useDesign(pref)`
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
    (`settings/ajustes/OutputAjustes.jsx`; a coluna é `.nv-scroll.cfg`, então
    os blocos têm o estilo das Configurações). **Os Ajustes são cinco
    blocos `CfgGroup`** (Rodada H2, owner 2026-10-19; ids `editor.<bloco>`,
    um arquivo cada em `settings/ajustes/`, o resumo de uma linha de cada
    um em `src/lib/console/ajustesSummaries.js`, testado): **Destino**
    (o primeiro, sempre aberto: Tela — o select Automático / Sempre numa
    janela / Tela N —, Abrir ao iniciar e Na rede, o endereço com Copiar;
    Nome e Ícone dobrados no fim, "Nome e ícone"), **Conteúdo** ("O que
    esta tela recebe": atalhos Tudo / Letra e Bíblia / Vídeos / Avisos, a
    lista e "Por cima de tudo" dobrados em "Escolher por tipo" — aberto
    quando a regra é Personalizado —, "Sem item da lista", Cifra e Nome da
    parte da letra; no Palco e no Pastor, as partes do desenho),
    **Aparência** (Escala, Margens, Tema, o Aviso rápido dobrado com seu
    resumo, a faixa da Transmissão), **Comportamento** (fechado: as três
    linhas "já faz sozinho") e **Diagnóstico** (fechado, só leitura: Estado,
    Na rede, Ajustes, Mostrando agora; Identificar e Testar ficam para a
    frente G9). A Transmissão não tem Conteúdo nem Comportamento. O primeiro
    `input.fg-input` do `.cfg-outprefs` é o Nome (Destino vem primeiro: o
    smoke lê assim; o corpo de uma dobra fica montado, só escondido). O
    raro dentro de um bloco é `CfgDisc` (settings/parts.jsx: uma linha com
    o resumo, `cfg-fold`; owner 2026-10-27, T2–T4 = A). O Editor da tela
    abre nos Ajustes (T1 = A); um clique no canvas vai ao Desenho. Cada
    mudança salva na hora (`useOutputPrefSave`:
    criar-ou-atualizar, as opções num objeto só). **Clicar numa tela já é editar**
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
    letras (não em Vídeo nem Avisos). **Mostrar com** (Rodada G2, owner
    2026-10-19) desenha a tela em quatro estados: Exemplo (letra), Sem nada
    no ar (estado vazio), Timer (um `tool.show` de exemplo, `sampleTimer`,
    recomeça a cada escolha) e No ar (o estado real, senão o exemplo) —
    assim a Hora grande e o "Aguardando projeção" do Palco (`when: "idle"`)
    se veem sólidos; os `when` de fábrica não mudam (saves antigos citam
    `factory:*`). Um elemento fora do desenho tem a causa em
    `elementState` (layouts.js, testado: "off" o olho, "rule" a regra
    Aparece, "empty" nada a mostrar, "shown"), que o `LayoutRenderer`
    põe como classe (`is-off` pontilhado e mais fraco, `is-rule`/`is-empty`
    tracejado); a lista mostra a regra como chip (`whenLabel`, as palavras
    do select Aparece; nenhum para Sempre), esmaece a linha e traceja o
    olho, e o tooltip do canvas e a linha sob ele dizem o porquê e a saída
    (`ghostReason`). **Rodada P, P8-3 = A** (owner 2026-10-22;
    `src/lib/layoutEditor.js`, testado, fora do caminho das saídas, com as
    dicas do Adicionar, `ELEMENT_HINTS`): a barra de texto fixa no topo da
    coluna enquanto um elemento de texto está marcado (o tamanho num
    `NumBox`, itálico, sublinhado, Aa, justificado, entrelinhas, espaço,
    contorno, além de fonte/negrito/cor/alinhamento; o elemento guarda
    esses campos com os nomes do tema e o `LayoutRenderer` os desenha com
    `typography()`, o sublinhado só no corpo, `is-u`); **marcar vários**
    (Ctrl/Shift + clique na lista ou no canvas, `multiSelect.js`): a barra
    veste todos, Alinhar (pela caixa em volta deles; um só, pela tela) e
    Distribuir (3+), arrastar um move todos, setas e Delete também; a
    **Grade** opcional (2,5/5/10 %, localStorage `keryx.editor.grid`, deste
    computador) toma o lugar do ímã; os modelos da igreja, acima.
  - um TEMA (`ThemeEditor.jsx`): o ÚNICO lugar em que um tema se edita —
    Configurações › Temas é só a lista; Camadas ajusta o ar e captura com
    "Salvar como novo". `text_align`/`text_position` em `EXTRA_KEYS`
    (o estilo explícito do item vence; aplicar um tema no ar os reseta), e
    a caixa do canvas mapeia por `src/lib/console/themeBox.js` (testado).
    **O formulário é em grupos** (Rodada HF3, owner 2026-10-20: `CfgGroup`, ids
    `tema.*`, fold per computer; Nome e padrão fixo, Fundo aberto, Caixa do
    texto, Posição e Transição fechados com resumo de `boxSummary`…`transitionSummary`
    em themes.js), com a barra de texto fixa acima deles. **Tudo do texto mora
    na barra** (Rodada P, P8-1, e o dono em 2026-10-22: "um ambiente só", sem
    grupo repetindo): a fonte (a origem no tooltip), o tamanho e os atalhos
    PP…GGG (`presets`), N I S, Aa, o alinhamento (o único lugar: Posição só
    tem Alto/Meio/Baixo, largura e ajuste fino), Cor ▾ com degradê e
    opacidade (`colorMore`), Contorno ▾, Efeito ▾ (`effects`) e Espaçamento ▾
    (`spacing`); os grupos Fonte e Cor e efeito não existem mais. O smoke lê
    o 1º `.nv-frm input.pl-input` (Nome) e a fonte em `.tb-bar select`.
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
chip (`FollowChip`; its words `followLabel`/`followAction` in
`src/lib/console/followWords.js`, kept apart because player.js rides in
every output's chunk and the phone has an output's budget) pauses/resumes
on purpose. The Biblioteca says "sincronizada". **Avançar sozinha** (owner
2026-10-22, Rodada P7 = A/A): the Editor de música's "Avançar sozinha: Não
| Pelas marcas | Por tempo" is `Song.follow_mode` (off | marks | time; ""
= by the marks when there are any, as before; `followModeOf`). **Por
tempo** is the band's mode, no media: `Song.slide_seconds` a slide ("Cada
slide", a NumBox, 8 s by default) and a slide's own `duration` its
exception (the slide chosen in the previews gets its NumBox; "Igual aos
outros" clears it) — saved only Por tempo: in the other modes `duration`
is the gap between marks (`withTimings`), never read as an exception. On
air it is the `time` source of `content.follow` (`each` seconds; a follow
with no url runs on the live clock, `clockFollow` in player.js): it waits
for the player's "Iniciar letra por tempo" (P7-2 = A), the arrows go on
from the slide chosen, the clock's length is the song's (`timedLength`),
so the Setlist's Autoplay sees it end. **The console fills every slide's
start before it sends** (`withFollowStarts`/`followStarts` in
lyricSync.js, from `songContent`): Por tempo one after the other, and by
the marks a slide with none takes its share of the gap it sits in (from 0
before the first mark, up to the song's length after the last, else at the
marks' pace) — before P7 the follow skipped unmarked slides and Iniciar on
one went back to slide 1. The live state stays tiny (it is in every
output's chunk): it only learned `time` and `each`. **Procurar letra na
internet** (`LyricsSearch.jsx`, `electron/lyrics.cjs`; the browser preview
asks through the preview server too): "título – artista" (en/em dash, or a
hyphen between spaces: `splitQuery`) searches LRCLIB by `track_name` +
`artist_name`, anything else is free text; an LRCLIB upload with timed
lines (`syncedLyrics`, LRC) is preferred among duplicates and says **"com
tempo"**, and Importar brings its times in as the slides' marks
(`parseLrc`/`lrcMarks` in songImport.js, tested: in order, a chorus the
recording repeats never pulls the slides ahead, a slide not found stays
unmarked) plus the recording's length; the dialog says they are that
recording's times (its playback or video), not a band's. No other lyric
source (owner 2026-10-22: Letras has no public API, Vagalume's terms are
unclear; the letras.mus.br suggestions stay search-only). **Buscar marcas…**
(owner 2026-10-22, the mockup "Sincronizar · marcas do LRCLIB", S1 = C,
S2 = B, S3 = C, S4 = A): Sincronizar's header (and its empty stage) asks
LRCLIB for the song's recordings (`lyrics` op `recordings`: every take with
its length and LRC, a busy 503/429 tried again after 1 s and 2 s) and
`rankRecordings` (`src/lib/console/lrcPick.js`, tested) measures each
against the playback: same length (±3 s) and how many slides `lrcMarks`
finds. A take of the playback's length with 80 % of the slides found is
used at once (`autoPick`), else `SyncMarks.jsx` lists them (fewer than half
found = another song with that name, "Usar mesmo assim"). The marks come in
dashed (`sug`, Aplicar off) in that recording's times; Espaço while it
plays sets the first one where the singing starts and every mark moves by
the same amount (`anchorMarks`, "andaram +5,1 s" with Desfazer); Pular keeps
them; any other edit makes them ordinary marks and moves only that slide.
Measured on two lyric videos of the church's playbacks (22/10): the LRC
times hit within a second at the median. The Biblioteca's "Na internet…"
still imports a take's marks (S1 = C). **Timers prontos** (Avisos › Ferramentas › Timer): 5, 10, 15, 30 and 60 min always, plus the church's own (`TimerPreset` rows, `src/lib/console/timerPresets.js`); a click prepares the timer, a double click sends it, and a timer on air takes or gives time with `tool.adjust` (−1, +1, +5 min; refused while the screens are locked). **Multiview** (the Programa's pill, or its right-click menu) turns the Programa monitor into four outputs at once, each what is on air as that output shows it, with its own `OutputPref` (Palco and Pastor in their own layouts), and where it is on screen now from the output health rows; a quadrant's label picks its output (`src/lib/console/multiview.js`, tested; saved with the layout as `multiview`/`mvTiles`). Only the Projeção quadrant (else Vídeo) plays videos. The Prévia's output picker (the six buttons beside it) is gone (user decision 2026-10-12: the Multiview shows every output): the Prévia is the prepared stage as Projeção will show it, with Projeção's own settings.

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
**The soak** (`KERYX_SOAK=<minutes>` on a smoke run or the installed app
with `KERYX_SMOKE=1`; `electron/soak.cjs`, plan and verdict in
`soakPlan.cjs`, numbers in `perfMetrics.cjs`, all tested) plays a service
on a loop over the outputs and writes a CSV every 30 s plus a JSON verdict
to the data folder; the diagnostic zip carries `desempenho.json` from the
same module. Only the owner runs it (docs/requisitos.md has the command);
the minimum PC there stays "provisório" until its CSVs come back.
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
