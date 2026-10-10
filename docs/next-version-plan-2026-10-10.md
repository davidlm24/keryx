# Next version — implementation plan (2026-10-10)

Owner decisions from 2026-10-10 (screenshots in the session "localhost-setup").
Everything here ships together in the next published version. Feature work
merges to `master` as ordinary PRs; **only the release session bumps
`package.json` and publishes** (CLAUDE.md › Releasing). This plan is the
shared map so parallel sessions don't collide.

## Resumo (pt-BR)

A próxima versão muda a cara e o alcance do console: barra superior só com
ícones (Ver ao lado do sino, grupo Telas sem rótulos), Configurações numa
janela sobreposta com fechar, coluna ao vivo sem título duplicado e sem a
moldura vermelha permanente, tela ociosa com **fundo escolhido pelo operador**
(por culto ou do dia), prévia com um trilho para ver cada saída (pastor,
palco, letra…), telas por Wi-Fi refeitas no design system novo (as páginas de
espera/conectando ainda são do Base44), personalização por tela nas
Configurações, mais controles nas Camadas, **clique direito em todo o
sistema**, editor de música com prévias maiores e divisão por linhas salva na
música, Bíblia com seleção de versículos na faixa e nomes completos dos
livros, e uma página de Aparência (transições + fundos configuráveis um a
um). No fim, um lote de consertos achados durante o trabalho.

## Ground rules for every PR in this batch

- Branch from `master`, one section (or sub-item) per PR; land independently.
- Each PR: `npm test`, `npm run lint`, `npm run build`, the browser-preview
  overflow/wrap scan at 1440/1366/1024 (plus 390/768 for network pages), and
  the desktop smoke **once at the end of the task, announced** (it takes the
  user's screen ~5 min). Update `electron/smoke.cjs` checks it breaks.
- Schema changes go through `base44/entities/*.jsonc` + `npm run db:schema`.
- New on-screen behaviour = live-state op in `shared/live-state.mjs` **with a
  test**; every output must render it (network screens included).
- Media URLs stored as `keryx-media://` / bundled paths, never `http`.
- pt-BR UI copy; design-system docs (`docs/design-system/*`) updated in the
  same PR that changes a rule.

---

## A. Top bar and navigation (items 1, 8)

**A1 — Ver beside the bell, Telas chip icon-only** (`TopBar.jsx`,
`console.css`, `bundle.css` docs, smoke `telasNamed`)

- Move the `tb-ver` button from `tb-l` into `tb-r`, immediately left of the
  bell, as an icon button in the same round `bg-1` chip style (icon: `eye`;
  tooltip "Ver · módulos, densidade e layout"; keep `aria-haspopup`). The Ver
  popover anchors under its new position (it already anchors to `.tb-ver`).
- Telas group: drop the `TELAS` caption (`tb-screens-k`) and the `.lbl` text
  on the four buttons → icon-only 26 px round buttons inside the chip. Keep
  `role="group"`, `aria-label`, per-button `aria-label` + tooltips with
  shortcuts. Delete the <1200 container query that hid the caption.
- Known trade-off: this reverts the "named Telas" discoverability change
  (presenter-ux addendum finding 3). Owner accepted on 2026-10-10; tooltips
  and the group label remain. Note it in `docs/design-system/README.md`
  (iconography: chips exception already there; remove the "carry a visible
  name" clause) and in `docs/design-system.md` top-bar paragraph.
- Smoke: replace `telasNamed` with `telasChip`: the four buttons exist, have
  aria-labels, and render no visible text.

**A8 — a prominent "Console" back button** (all full-screen views)

- New `kx-btn-back` style: 32 px, `kx-btn-outline` weight, `arrow-left` +
  "Console", always the **first** element of the view's left panel header, in
  SongEditor, ServicePlanner, MediaView, NoticeEditor, SchoolView,
  ReportsView (today it's a 22 px ghost that disappears into the header).
  Tooltip keeps "Voltar ao console · Esc". One shared component in `kx.jsx`
  (`BackBtn onClick`), so the look can't drift per view.

## B. Configurações as an overlay window (item 2)

(`Console.jsx`, `settings/SettingsView.jsx`, `console.css`, `keys.js` + test)

- Settings stops replacing the console's centre. It becomes a dialog over a
  dim scrim: `min(1100px, 100vw−48px)` × `min(720px, 100vh−64px)`,
  `radius-panel`, `--popover` shadow; 40 px header "Configurações" with an X
  (`IconBtn x`, tooltip "Fechar · Esc"); the section list stays as the left
  column inside. `?config=<section>` deep links open the dialog over whatever
  is behind; opening from Planner/editors no longer loses that view.
- **Esc stack** (this is live-safety, handle once, properly): `keys.js` gains
  an explicit overlay order — topmost of {context menu, popover/menu, quick
  jump, palette, Camadas drawer, Verificar, settings dialog, lyrics dialog}
  closes on Esc; only with nothing open does Esc end the projection. Add
  cases to `keys.test.mjs`. Update `docs/design-system.md` ("Esc ends at
  once" → "Esc closes the topmost overlay; with nothing open it ends at
  once") — the current behaviour already half-does this informally.
- Smoke: `cfgEsc` still passes (Esc closes the dialog back to the console);
  add `cfgDialog` (dialog visible over the console, X closes).

## C. Live column (items 3-part, 6)

**C3 — one PROGRAMA title, no permanent red frame** (`CenterPanel.jsx`,
`kx.jsx` Monitor, `console.css`, design-system docs)

- Merge the duplicate: the panel header becomes the live caption — section
  word `PROGRAMA` (red `air-fg` only while something is on air; `fg-3` when
  "nada"), then the 16 px `kx-live-title`, the count, and `em N telas` on the
  right. The monitor below loses its own caption line.
- Frames: the Programa monitor drops the always-on red border. State colour
  moves entirely to the caption word + the red bar/tint on the on-air slide
  and setlist row. Keep the **amber warn frame** (failures stay loud) and
  keep the Prévia's green frame for now (prepared has no adjacent word of its
  own on the monitor). Revisit the green one with screenshots inside the PR —
  flagged as the one open visual decision.
- Standby inside the monitor follows C6 (wallpaper), so the logo-card-on-
  gradient duplication in today's screenshot disappears.
- Docs: README "Monitors carry state in their 1px frame and caption" →
  caption-first wording; tokens.json usage lines for `air`.

**C6 — operator-chosen standby wallpaper** (live state + schema + UI)

**Built** (release session, 2026-10-10). One change from the outline below:
`idle` stays a string (`"logo" | "black" | "background"`) and the image is a
separate `idleUrl`, instead of turning `idle` into `{mode, url}`; the console,
the renderer and the smoke compare `idle` as a string, and old saves need no
conversion. The op is `idle.set {mode, url}` as planned. The global default's
field (`User.standby_background`) exists and is applied; its control belongs
to the Aparência page (section I).

- Live state: `idle` becomes `{ mode: "logo" | "black" | "background", url }`
  (strings still accepted and normalised; persistence in `electron/live.cjs`
  keeps old saves working). `idle.set` takes `{ mode, url }`. Test in
  `shared/live-state.mjs`'s test file.
- Rendering: `ScreenRenderer` `Idle` renders the image cover-fit (no logo on
  top — the operator chose a wallpaper instead of the logo); `ks-black`
  unchanged. Console monitors and every output page share it by construction.
- Data: `Service.standby_background` (string, media/bundled URL) — the
  per-culto default; `User.standby_background` — the global default.
  Precedence at console: explicit `idle.set` > current service's field >
  global default > logo. The console applies the service default when the
  service is picked (console-side, in `useConsole`), never magically in the
  store.
- UI: Saídas popover "Tela ociosa" seg gains **Fundo…** (opens a small
  picker: Fundos gallery + user media images); ServicePlanner form gains
  "Fundo de espera" (same picker, field on the Service); the global default
  lives in the new Aparência page (section I).
- Smoke: idle wallpaper check — set a bundled background via op, screenshot
  `/Projection`, assert the img src.

## D. Saídas and telas (item 3 bulk)

**D-rail — output preview switcher beside the Prévia** (`CenterPanel.jsx`)

**Phase 1 built** (release session, 2026-10-10): Projeção, Letras, Vídeo and
Avisos. Instead of a `rendersFor` param on `ScreenRenderer`, each output's
view of the live state is a pure function in `src/lib/network/views.js`
(`outputView`, `OUTPUT_VIEWS`; the pages already used `lyricView` and
`standbyView` from there), so the renderer is untouched. An output that
shows nothing of the stage (Avisos with a song) says so on the monitor.
Phase 2 (Palco, Pastor) still needs those pages to render from a given
state instead of reading the live state themselves.

- A slim vertical rail on the right edge of the Prévia monitor: icon buttons
  for Projeção, Letras, Vídeo, Avisos, Palco, Pastor (icons from the set:
  projector/tv/film/megaphone/monitor/tablet; tooltips with the output name).
  Selecting one makes the Prévia monitor render the **prepared stage as that
  output will show it**; `Enviar ao ar` is untouched. Projeção stays default;
  the choice is per-session (not persisted).
- Phase 1 (with this PR): outputs whose pages are ScreenRenderer-based —
  Projeção, Vídeo, Avisos, Letras — via a `rendersFor` filter param on
  `ScreenRenderer` (which layers that output draws). Phase 2 (after D-net):
  Palco and Pastor embed the shared components their rebuilt pages use.

**D-prefs — per-screen customization in Configurações › Telas e saídas**

- New entity `OutputPref` (jsonc): `{ screen_path, content, text_scale,
  margin_pct, show_logo, theme_id }` — `content` is the canvas's per-output
  routing (Letra, Letra+cifra, Playback, Cifra, Avisos; the `kx-route` design
  exists in the design system but was never built, so this is greenfield —
  no migration).
- Each output row in TelasSection expands to a config card: Conteúdo
  (select), Escala do texto (80–140 %), Margens (0–10 %), Mostrar logo
  (switch), Tema (herdar/escolher), Identificar.
- Output pages read their `OutputPref` from the DB (network screens already
  read DB + subscribe; realtime keeps them current) and pass scale/margins to
  `ScreenRenderer` as container-level vars. Desktop windows identical.

**D-net — network screens rebuilt on the design system**

Today `PastorView.jsx`, `StageView.jsx`, `LyricProjection.jsx`,
`VideoProjection.jsx` and the NetworkHome picker are still Base44-era
(Tailwind utility classes, lucide icons, gradients). Rebuild:

- Move `@ds/tokens.css` import from `Console.jsx` to `App.jsx` so every page
  has the tokens (projected content keeps using only `screen-*` styles —
  verify nothing leaks onto `/Projection` with a screenshot diff).
- `LyricProjection` and `VideoProjection` become thin `ScreenRenderer`
  wrappers with the proper layer filter (like `Projection.jsx`), deleting the
  old markup. This is also what the D-rail phase 1 reuses.
- `StageView` and `PastorView`: rebuilt with kx tokens + container units
  (cqw) so they scale like the monitors; Pastor gets a portrait layout
  (tablet held upright). Shared `NetShell` component for the chrome: church
  name/logo, clock, connection dot.
- Shared connection states, one component, used by all four + Projeção/Avisos
  when on the network: **Conectando…** (first SSE attempt), **Reconectando ·
  tentativa N** (amber, per design system), **Aguardando projeção** → renders
  the live idle (so the C6 wallpaper shows here too, not a bespoke screen).
- NetworkHome (the "/" picker a phone/TV opens): kx redesign — church
  name/logo, PIN entry state, the six screens as large cards (label + hint),
  responsive from 360 px portrait up, remembers the last choice
  (localStorage) with "abrir de novo".
- Rule kept: these pages work from the DB + live state alone
  (`electron/lan.cjs` contract); links/QR still come from the network info.
- Verification: preview iframe scan of all six routes at 390/768/1366; the
  existing smoke output checks keep covering /Projection.

## E. Camadas — more customization (item 4)

(`Layers.jsx`, `shared/live-state.mjs` ops + tests, `ScreenRenderer`,
`ProjectionTheme.jsonc` so "Salvar como novo" keeps the new fields)

- Texto principal: opacity, max-width %, line-height (seg: compacta/normal/
  solta), caixa alta (toggle), text box (nenhuma/faixa/bloco — colour +
  opacity), fine position (nudge beyond top/middle/bottom), shadow intensity;
  the per-layer transition seg already exists.
- Fundo: ajuste (cobrir/conter), escurecer % and desfoque px (these two are
  the same fields section I's Fundos page writes as per-background defaults;
  the layer value overrides per stage), focal point.
- Logo: opacity, free size slider, corner offsets.
- Sobreposição: drag to position on the Prévia monitor (pointer drag writes
  x/y) — stretch goal inside the PR; ships only if it lands cleanly.
- Each new field: op (or extension of `background.set` / `logo.set` /
  `layers.style`) + live-state test; renderer support; theme save/restore.

## F. Right-click across the system (item 5)

- New `ContextMenu` in `kx.jsx` + `useContextMenu`: renders a `kx-pop` at the
  cursor, clamped to the viewport, closes on Esc/click/scroll; it is first in
  the Esc stack (section B). After any action, focus returns to the console
  (the "a mouse click must not leave focus on a control" rule).
- Right-click **never** prepares or sends by itself; it selects the row under
  the cursor if unselected (OS convention), then shows actions. Menu items
  that send to air are worded exactly (Enviar ao ar) and sit below a
  separator from the safe ones.
- Electron (`electron/main.cjs`): handle `context-menu` — editable fields get
  the native cut/copy/paste menu; everywhere else `preventDefault` and let
  the renderer draw ours.
- Initial menus (one table in the PR, one component each):
  - Música (Biblioteca): Pôr na prévia · Adicionar à setlist · Editar ·
    Favoritar · | · Enviar ao ar · Excluir
  - Mídia (linha e célula): Pôr na prévia · Adicionar · Renomear ·
    Localizar… · | · Enviar ao ar · Excluir
  - Aviso: Pôr na prévia · Editar · Duplicar · | · Enviar ao ar · Excluir
  - Item da setlist / seção: Ir para o item · Preparar · Editar no
    planejador · Duplicar · Remover
  - Slide: Pôr na prévia · | · Enviar ao ar
  - Versículo: Pôr na prévia · Favoritar · Anotar · Copiar texto · | ·
    Enviar ao ar
  - Monitor Programa: Tela preta · Mostrar logo · Limpar texto · Voltar ao
    anterior · | · Encerrar…
  - Monitor Prévia: Limpar prévia · trilho de saídas · | · Enviar ao ar
  - Camada: Ocultar/Mostrar · Bloquear · Subir · Descer · Restaurar estilo
  - Saída (popover): Abrir · Fechar · Identificar · Configurar…
- Tests: clamp/position unit test; keys.test Esc-closes-menu; smoke: real
  right-button input on a song row → menu visible, Esc closes, air untouched,
  focus on console.

## G. Song editor (item 7)

**Built** (release session, 2026-10-10). Differences from the outline below:
there is no SLIDES split seg in the console to turn into a "da música"
override, so that part is moot; songs keep their saved slides, and
`content.js` uses `lines_per_slide` only for a song with lyrics but no saved
slides. The P/M/G size is remembered per computer (localStorage), not in the
console layout. The duplicate-stanza action duplicates the stanza under the
lyrics cursor (the slide right-click menu is section F's). The wrap hint
estimates characters per line from the screen's 84 % text width and the
font size (`src/lib/console/lyricFit.js`).

- **Bigger previews**: `ed-thumbs` `minmax(168px → 230px)` plus a P/M/G
  density seg in the SLIDES header (stored in the layout object).
- **Split control in the editor, persisted**: new Song field
  `lines_per_slide` (`0 | 2 | 4`, default 0 = por estrofe) — jsonc +
  `db:schema`. The seg (Estrofe/2 linhas/4 linhas) appears in the LETRA
  panel header; `stageFromSong`/`content.js` honours the stored value; the
  console SLIDES seg becomes a live override labelled "da música" at its
  default. Import flows (`songImport.js`) keep their own "Ao importar"
  setting but write the chosen value into the song.
- More editing options: marker buttons gain `[Instrumental]` and `[Final]`;
  "Dividir aqui" (blank line at the cursor); per-slide character/line counter
  with an amber hint when a line will wrap on screen (threshold from
  `screen-lyrics` metrics); duplicate-stanza action (also in the slide's
  right-click menu from F).

## H. Bíblia (item 9)

**Built** (release session, 2026-10-10, with J7). The Nomes grid folds at the
same 680 px as the short codes, not sooner: choosing Nomes must never hide the
books (at 1520×900 the column is 816 px, and Nomes leaves 409 px of reading).

- **Verse row in the band** (`BibleEnv.jsx`, `console.css`): under the
  chapters row, `.bverses` — the loaded chapter's verse numbers as 26 px
  cells (auto-fill 32 px). Click selects + scrolls the reading (same model as
  clicking the text; `sel` already exists); Ctrl toggles, Shift ranges;
  cells show `is-prev`/`is-air` states like verses in the text. Long
  chapters (Sl 119 = 176) wrap to multiple rows; on short windows the same
  container fold that hides `bgrid` hides `.bverses` first (the band's
  no-scroll rule holds).
- **Book name mode**: a small seg in the band header — `Abrev | Nomes` —
  persisted in the layout. Nomes switches `bgrid` to `minmax(110px, 1fr)`
  cells with full names (group colours kept); the fold thresholds adjust.
- Band hidden states ("Capítulo indisponível") keep working; the Instalar
  CTA gets an offline hint (J-list).

## I. Aparência — transitions and backgrounds (item 10)

**Transições and the default standby wallpaper built** (release session,
2026-10-10); the Fundos gallery (BackgroundPref) is the next PR. Found on
the way: slide transitions never animated — the `.ks-anim-*` class sat on a
`display: contents` wrapper, which has no box to animate — so every slide
change was a hard cut whatever Camadas said. The animation is now on the
wrapper's children (`screen.css`), with its length in `--ks-tr`
(`style.transition_ms`, 120–600). The default is stamped at send time in
`useConsole` (`src/lib/console/look.js`), not in `content.js`, so every kind
of stage gets it. The section's icon is `image` (Temas keeps `palette`).

New Configurações section **Aparência** (icon `palette`; Temas stays its own
section). Lives in the new settings dialog (B).

- **Transições (telas)**: default transition for projected text — Esmaecer /
  Deslizar / Corte — and duration (120–600 ms). Stored on `User`
  (`transition_type`, `transition_ms`); `content.js` stamps the default into
  each prepared stage's style, so outputs need no new plumbing and Camadas'
  per-item seg still overrides. Note: the design-system "a slide change is a
  hard cut" line is already stale (`ScreenRenderer` defaults to fade today) —
  fix the docs to "configurable, console UI motion unchanged" in this PR.
- **Fundos**: a gallery page of every background (bundled by category + user
  images from Mídia), each individually configurable — new entity
  `BackgroundPref` `{ source, name, category, dim_pct, blur_px, hidden,
  favorite }`. Galleries (SongEditor, NoticeEditor, SchoolView, the C6
  picker) read prefs: renamed, hidden ones gone, dim/blur applied as the
  stage's background defaults (the fields E adds to `background.set`).
  "Padrão de espera" button here sets `User.standby_background` (C6).

## J. Fixes found along the way (item 11)

Small batch PR (or folded into the section PRs where marked):

**Built** (2026-10-10, slice 13). Already on master before it: 1 (`useAnchor`
places the Saídas and bell popovers), 4 and 7 (earlier PRs), 5 (the clock
drops its "more" at 1400 px), 8 (no stray screenshot left), 9 (`autoPort` is
in `.claude/launch.json` and the README). Done here: 3 (Mídia, Avisos and the
Setlist are `kx-acts-list` containers with glyph actions under 300 px; the
smoke `rowActs` check already walks every Biblioteca tab, Setlist included
when it has rows) and 2 (a `.kx-count` beside a list header's title
ellipsizes like the title). 6 was checked: the top bar is transparent over
`bg-0`, so the `bg-0` ring is right. 10 stays with the release session.

1. `Popovers.jsx` Outputs/Notifications hardcoded `right: 130` — anchor to
   the trigger button and clamp to the window; misplaced on narrow windows.
2. Panel-header counts (`kx-count`) can clip without ellipsis (seen on the
   planner's SETLIST header at 1024) — `bundle.css` min-width/ellipsis.
3. The hover-actions-over-row-centre class of bug: apply the `kx-acts-list`
   container pattern (from PR #38) to the Avisos and Mídia lists and the
   Setlist rows; add a smoke assertion of ≥16 px clearance per list.
4. Smoke `splitterKeys` fails hard when someone uses the PC mid-check — join
   the `focusKept` inconclusive set (false FAIL observed 2026-10-10).
5. Service clock truncates mid-word at 1366 ("em 6h3…") — add a container
   step dropping `tb-svc-more` at ≤1500, and `min-width:0` audit on `tb-r`.
6. `tb-bell-dot` ring colour now `bg-0` (top bar is transparent) — verify
   after A1 chip changes; part of A1.
7. Bíblia "Instalar NVI" shown with no internet — disable with meta "sem
   internet" when offline (ships with H).
8. Delete the stray untracked `topbar-1920.png` in the repo root.
9. Dev-only: `.claude/launch.json` fixed port 5180 collides when two
   worktrees preview at once — document autoPort behaviour in README dev
   section.
10. `docs/release-notes/README.md` 1 200-char limit — add a one-line check to
    the release session's flow (release session owns it).

## Data model (one view)

| Entity | Field | Used by |
| --- | --- | --- |
| Song | `lines_per_slide` (0/2/4) | G |
| Service | `standby_background` (string URL) | C6 |
| User | `standby_background`, `transition_type`, `transition_ms` | C6, I |
| OutputPref (new) | `screen_path`, `content`, `text_scale`, `margin_pct`, `show_logo`, `theme_id` | D-prefs |
| BackgroundPref (new) | `source`, `name`, `category`, `dim_pct`, `blur_px`, `hidden`, `favorite` | I |
| ProjectionTheme | the new layer-style fields | E |

Each lands with its PR via jsonc + `npm run db:schema` (schema-drift test
guards it). Ids stay text; unknown filter fields are errors — keep queries on
known fields.

## Live-state ops (one view)

`idle.set {mode,url}` (C6) · `background.set {+dim,+blur,+fit,+focal}` (E/I)
· `logo.set {+opacity,+offset}` (E) · `layers.style {+opacity,+max_width,
+line_height,+all_caps,+box,+nudge}` (E). Every op: test in the live-state
test file; renderer support; works on every output.

## Suggested PR slices and order

| # | PR | Section | Size | Depends on |
| --- | --- | --- | --- | --- |
| 1 | topbar-icons + back-button | A | S | — |
| 2 | esc-stack + settings-dialog | B | M | — |
| 3 | live-column caption/frame | C3 | M | — |
| 4 | standby-wallpaper | C6 | M | 3 (visuals), schema |
| 5 | net-redesign + tokens-global | D-net | L | — |
| 6 | preview-rail (phase 1 / 2) | D-rail | M | 3; phase 2 after 5 |
| 7 | output-prefs | D-prefs | L | 5 |
| 8 | camadas-plus | E | L | — |
| 9 | context-menus | F | L | 2 (Esc stack) |
| 10 | song-editor | G | M | — |
| 11 | biblia-band | H | M | — |
| 12 | aparencia | I | M | 2, 8 (bg fields), 4 |
| 13 | fixes batch | J (1,2,3,4,5,8,9) | S | — |

1, 3, 5, 8, 10, 11, 13 can run in parallel sessions from day one; 2 unlocks
9 and 12; 4 after 3; 7 after 5. Design-system doc updates ride their PRs.
When all are on `master`, the release session writes
`docs/release-notes/<versão>.md` (pt-BR, operator-facing, ≤1 200 chars) and
publishes per CLAUDE.md.

## Open decisions (flagged, with defaults)

1. **Prévia's green frame** — keep (default) or remove with the red one; C3
   PR decides with side-by-side screenshots.
2. **Telas icon-only** — accepted regression of addendum finding 3; revisit
   only on operator feedback.
3. **Transition default** — stays what today ships de facto (Esmaecer ~300 ms
   via renderer default) unless the owner prefers Corte as default.
4. **Sobreposição drag** — stretch inside E; cut without ceremony if flaky.
