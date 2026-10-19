# KERYX design system

The operator console's design system was made in Claude Design and lives in
`docs/design-system/`:

- `README.md` — principles, content rules (pt-BR vocabulary), colour, type,
  spacing, states, iconography, motion. Read this first.
- `tokens.json` — the reference for every token (colour, type styles,
  spacing, radius, shadow, timing, opacity), each with its usage.
- `tokens.css` — the same tokens as CSS custom properties plus the type-style
  classes (`.meta`, `.section`, `.ui`, `.content`, `.live-cap`, `.live-title`,
  `.next-title`, `.alert-title`, `.clock`, `.screen-*`).
- `components/bundle.css` — the `kx-` component stylesheet: panel, button,
  segmented switch, field, row, tabs, monitor, status, banner, popover,
  splitter (and `kx-gap`), slide, layer, timeline, transport, verse, book,
  empty state, mark.
- `components/bundle.js` — the design system's first, hand-drawn icon set
  (the app draws Lucide since Rodada HI: `src/lib/icons.js`, see the README's
  Iconography) (`window.KERYX.icon(name)`,
  `KERYX.mount(root)`): bare 16 px glyphs, 1.5 stroke.

`tokens.json`, `tokens.css` and `bundle.css` are edited by hand and kept in
step with each other; nothing generates one from another. A token change
touches all three (and `console.css` if the console overrides it). The
console overrides several of them on purpose (the 6 px gutter, slides and
verses as rows, list rows as inset cards): `console.css` is what ships.

**`CLAUDE.md` wins.** It records the owner's decisions as they are made; this
page and the README describe the look those decisions produce. Where they
disagree, `CLAUDE.md` and the running app are right and this page is stale:
fix it. The Claude Design canvas
(https://claude.ai/artifact/TRDHTGjQ2VCHRUWDKjpae5) is a record of the first
design, not the specification (see Histórico).

## Comportamento

The console is one screen, always live: no steps and no sandbox. To rehearse,
the operator **locks the screens** (*Travar telas*, in the Saídas popover):
the screens keep what they show, the console prepares and browses freely, and
sending is refused until *Destravar*. **Verificar** is an overlay opened from
the Saídas popover (and the logo's menu). The rundown is called **Setlist**.

**Prepare, then send.** A click on a song, slide, verse, aviso or Setlist
row only prepares it in the Prévia (green). It reaches the screens by one of:

| Act | Where |
| --- | --- |
| **Double click** on the item | Biblioteca, Setlist, slides, verses, search results, Escola bíblica materials, Mídia, the Prévia's screen |
| **Enter** | with nothing focused (or the monitors focused): sends the Prévia / the Bíblia's selection |
| **Ctrl+Enter** | from anywhere except a text field |
| **Enviar ao ar** | the button where there is one: the Bíblia, the Escola bíblica, the Mídia (and the Setlist's *Ir*). The culto's Prévia has none: Enter, a double click on its screen or its right-click menu send it. The keys live in one tooltip on every send button, never printed: "Enviar ao ar · Enter (Ctrl+Enter de qualquer lugar)" (`SEND_TIP` in `src/lib/console/copy.js`) |
| **Drag onto the Programa** | from the Biblioteca (onto the Prévia it prepares; onto the Setlist it adds) |

A click on one control never leaves focus on it, so the next key works on the
console. Typing never sends: in a text field every key is typing, and Esc first
leaves the field. A control focused with Tab keeps its own Enter and Space.

**Keys** (`src/lib/console/keys.js`, tested): ←/→ move the slide or verse on
air (and step an activity's reveal before changing slide); ↑/↓ move the
selection (green); PageUp/PageDown walk a presentation (a clicker); Space
plays or pauses; **B** Tela preta, **L** Mostrar logo, **C** Limpar texto;
**/** searches; **?** lists the keys. **Esc** closes the topmost thing open,
one per press (`escapeTarget`: a right-click menu, the background library, a
popover, then one level of THE window, then the Camadas drawer), and with
nothing open ends the projection at once, fading out as Configurações ›
Telas e saídas › Transições says, the player's music included (Rodada G3,
2026-10-17). Its toast (and *Encerrar*'s) offers **Desfazer**, which puts
back what the screens showed: the text on the same slide, media, avisos or a
tool, the video channel, Tela preta or Logo, and the music at the second it
stopped, paused if it was (refused while the screens are locked).
**Transições** (Configurações › Telas e saídas): five rows, in this order —
*Ao pausar o som* (Corte · 0,2 s · 0,4 s; Pausar e Tocar no player), *Ao
tirar do ar* (Corte | Suave, 0,3 · 0,6 · 1 s; Esc, Limpar e Parar: a imagem
e o som saem juntos), *Ao entrar ou trocar* (Corte | Suave, 0,3 · 0,5 · 1 s,
Suave 0,5 s by default; what enters the screens or replaces something else —
moving the slide stays the theme's — with *Por tipo de conteúdo* folded
under it, a chevron with `aria-expanded`: Músicas, Bíblia, Textos e Escola
bíblica, Apresentações (PDF), Imagens e GIFs, Vídeos e YouTube, Avisos and
Timer, relógio, cronômetro, each Padrão | Corte | Suave, the timer Corte by
default; Rodada G5, the kinds are `src/lib/contentKinds.js`), *Entre áudios
e vídeos* (Corte | Suave | Tocar junto, 0,5 · 1 · 2 s) and *Tela preta e
Logo* (a switch that follows Ao tirar do ar). The *Encerrar* button, unlike Esc, asks first.
In the Bíblia a letter or digit opens the quick jump. A splitter or the
player's seek bar focused with Tab keeps the arrows for itself, so resizing
or seeking never moves what is on air.

**Right click** (`ContextMenu.jsx`): songs, media, avisos, Setlist items,
slides, verses, themes, backgrounds, the Programa and Prévia monitors and the
Camadas layers have a menu at the pointer (a `kx-pop`, kept inside the
window, ↑/↓ and Enter work in it). It never prepares or sends by itself;
anything that changes what is on air (*Enviar ao ar*, *Ir para o item*,
*Encerrar…*) is last, after a separator (`orderItems`). Text fields keep the
system's Recortar / Copiar / Colar.

**Menus** (audit C-14/C-15): every menu is one component, `MenuList` in
`src/components/console/Menu.jsx` (the menu bar, the Menu button's popover, the logo's menu, Ver, the
(+) menus, right-click menus, the tabs lists, the Bíblia's lists;
`MenuButton` for a button with its menu). It takes the focus when it opens
(its first item), ↑/↓ walk it round the ends, Home/End jump, disabled items
are skipped, → opens a submenu and ← leaves it, Enter/Space choose, Esc and
Tab close; one frame (`.kx-pop`) and the gold focus ring. When it closes the
focus goes back to what opened it only if the keyboard opened and closed it
— after a mouse open, to nothing, so the live keys work (`useFocusReturn`,
`focusAfterClose` in `menuNav.js`). The menu bar answers **F10** or **Alt**
alone (the focus on the bar: ←/→ walk it, ↓ or Enter opens, Esc leaves it)
and **Alt + C/M/D/F/A** (Culto, Música, Mídia, Ferramentas, Ajuda; the letter
underlined only while Alt is held or the bar has the keyboard). Setlist and
planner rows move with **Alt+↑/↓** on a focused row and Subir/Descer in
their menu, as Camadas' do (`useRowStep`). A focused select is a control,
never text: it keeps ↑/↓, PageUp/PageDown, Space and its type-ahead letters,
and the live keys stay the console's.

**Questions.** Anything that deletes or discards asks through `useConfirm()`
(`ConfirmDialog.jsx`), its buttons in Windows order: the action, then
**Cancelar** on the right. **A question that cannot be taken back opens on
Cancelar** (owner 2026-10-16, audit C-10, `focusesCancel` in
`src/lib/console/confirm.js`): *Excluir* and *Descartar* by their verb, and
any other action marked `danger` (Trocar o código, Juntar, Substituir,
Voltar ao padrão, Tirar da turma), so Enter — the operator's send reflex —
answers no and the action takes Tab or a click. The others (*Tirar da
setlist*, *Remover saída*, *Sair…*) open on the action; *Encerrar* keeps its
action focused, since it has Desfazer. Esc answers no before anything else.

**The command palette** (`/`, the top bar's search) opens centred over the
console, on the dimmed scrim. Enter puts the result in the Prévia and
Shift+Enter adds it to the Setlist; it never sends. A Scripture reference
("Jo 3:16", or the quick jump's "jo 3 16") typed in the KERYX environment
goes to the Prévia right there: one verse is its whole chapter, as in the
Bíblia, in the version chosen there; *Abrir na Bíblia* is the row below it.
The Bíblia has no search field of its own: the palette opens references there
and searches words (the text panel's Buscar mode).

**What acts on the real screens at once.** Tela preta and Mostrar logo act on
the real screens at once, locked or not. The *Aviso rápido* goes to the
screens at once (`alert.show`). Camadas edits (logo, overlays, which layers
show, layer order) apply as made, and *Travar telas* holds them during a
rehearsal. Every other tool (Relógio, Cronômetro, Timer, Texto livre) is
prepared in the Prévia like any item.

**Travar telas** is the live state's `locked` flag, set from the Saídas
popover and enforced in the main process (`applyOp`), so outputs, network
screens and the controle remoto obey it too. The rule: *nothing new goes onto
the screens; anything can come off*. Tela preta, Logo, Limpar, Esc and what
continues on its own (a playlist, a "Tocar todos" sequence) keep working.
While locked the Programa's pill and frame are blue (`rh`, "Travado"), a
double click or Enter gives one toast, and a blue banner says
`TELAS TRAVADAS` with *Destravar*. A restart comes back unlocked.

**The service clock** in the top bar counts from the service's date and
start time, never a default hour, compact: `◷ 19:00 · 9h46` before it starts,
`Culto 0:42:10` while it runs; the whole sentence is its tooltip, and a
click opens *Planejar o culto*.

**Bible editions.** The edition the operator chooses is the one used, even
when another is installed: ARA with NVI installed is read from the internet,
and a chapter that cannot be fetched comes from the installed edition, said
so. On Livros' version select an amber dot marks an edition from the
internet, missing or the preview's samples (the words in its tooltip); sample
text is never shown in a Bible's place. Verificar says, per edition, what
happens without internet.

## Layout

**The top bar** (40 px, on `bg-0`, no panel), one line at every width. Left:
the logo (its menu is the app's: Configurações, Saídas, Sobre o KERYX,
Atualizar agora when due), then **KERYX | BÍBLIA** (bold caps, no icons, a
gold underline on the one on screen — places, not commands), a divider, then
the menu bar: Culto, Música, Mídia, Ferramentas and Ajuda (`MenuBar.jsx`,
model in `src/lib/console/menuBar.js`). Where the bar does not fit it is
replaced by a **☰ Menu** button (same container query) whose popover stacks
the menus, all open, submenus inline (`flattenMenus`). Right, compact: the
search (at most 320 px), the service clock, the clock, the Saídas status
("2 telas", the full label in its tooltip), **Ver** (the panels glyph, `panels`) and the bell.
There is no Telas menu and no screen-action chip in the top bar: the screen
actions live in the Programa's pill. A new top-level action goes in the menu
bar's model, not as another icon.

**Each environment is a dock** (`src/lib/console/dock.js`, tested; drawn by
`Dock.jsx`): a tree of splits and tab groups the operator arranges in
**Ver › Editar disposição** — drag a module by its name to a side of another
(splits) or its middle (tabs), a click on the name opens "Mover para…", ×
puts it in the tray. While editing, a neutral banner under the top bar
(Tamanhos: Livre | Por %, Salvar como…, Restaurar posições, Concluir; Esc
concludes), every splitter shows its side's size in % (a click lets one type
it), and the panels' content is veiled so a click never prepares or sends.
Arrangements can be saved by name (Ver › Disposição; Padrão is the console's
own). The tray, the folds and the arrangements are this computer's. Never
place a column by hand in `Console.jsx` or `BibleEnv.jsx`: a new module is an
entry in dock.js `MODULES` and in `modulePanels`.

**The culto's default dock**, by width tier measured on the console grid
(wide ≥ 1400 px, medium ≥ 1100 px, narrow below, down to the 960 × 600
window minimum; one arrangement kept per tier, `switchTier`):

- **Wide:** four columns. Biblioteca and Slides are whole columns; the
  centre is the **Programa** on top (the monitor or the Multiview, and the
  player under it, always visible) and one row under it ending at the
  centre's edge — the **Prévia** (44 % of the centre at first; its width is
  the operator's) and the **Painel** (Notas, Aviso rápido, Timers,
  Ferramentas, Esteve no ar). The right column is **Camadas, Temas and the
  Setlist**, full height. The **No ar** strip runs under the Biblioteca, the
  Slides and the centre, the Setlist's column reaching the bottom beside it
  (Editar disposição › No ar can put it under every column).
- **Medium:** no right column: Camadas is a drawer from the Programa's pill,
  the Setlist sits beside the Prévia, No ar starts in the tray.
- **Narrow:** also the Biblioteca over the Slides in one column.

The Programa, the Prévia and the Setlist never go to the tray. The Slides
column has a 300 px minimum and the Biblioteca 260 px; a tab row that does
not fit breaks into a second line.

**One gutter: 6 px.** `.console` sets `--gutter` to 6 px (the token says 8;
the console uses the narrowest everywhere, owner's call), and rows and stacks
use `gap: 0`: **the splitter is the gap**. Two cards stacked without a
splitter keep the gutter as a margin; never add a second gap beside a
splitter. A gap a locked module would own is a `.dock-gap` with no handle.
Pages of THE window follow the same rule (6 px between panels, `.win-body`).

**The Programa** has no card and no header (`Panel bare`): its screen's top
lines up with the panels beside it, and its caption and controls are **one
pill inside the screen, bottom-right** (`ProgramaPill`, `.prog-pill`): a dot
in the state's colour (red on air, blue locked with "Travado", amber when an
output failed, grey "Nada no ar"), the title in that colour — only when the
player does not already name the item (`airInPlayer`) — the slide "2/6",
"2 telas", then Voltar ao anterior, the Camadas drawer (only while Camadas is
in the tray), Multiview and the screen actions Tela preta, Logo, Limpar,
Encerrar as glyphs. As the screen narrows it folds once: at 560 px "2 telas"
goes, at 480 px the buttons go into a "…" (the Programa's menu); over the
Multiview it is always folded. There is no "Programa" word.

**The Prévia** has no card either: its caption is a badge in the screen's
top-left corner (`kx-mon-badge`: "Prévia · nome · 2/6", blue "Prévia ·
travado" while locked) and it has no send button.

**The player** sits under the Programa, always visible, dimmed while idle
(its icon only, no placeholder words), in two rows (64 px; the slot is
`PLAYER_SLOT` 72 px, so starting a video never moves the monitors). Row 1 is
what plays: the file icon, the title, "n/m" in a list, the elapsed time, the
progress bar (it drags, one seek on release; Tab focuses it and ←/→ step
5 s) and the remaining time. Row 2 is the controls: ⏮ −10 ⏯ +10 ⏭, the eye
("Tirar o vídeo · o som continua"; pressed and red while the video plays as
sound only), Parar, the layer switch, the letra automática chip, where the
sound goes, the volume and the L/R meters (green, amber from −3 dBFS). It
narrows with container queries; Tocar, the eye, Parar and the mute always
stay.

**Slides and No ar.** The Slides column is the item in hand: the Prévia's
slides whenever it holds an item, else what is on air. **No ar** is always
what is on air, one row of cards while it is low (at least 104 px, as tall as
its slide with the most lines) or a list in a column. It exists only while
lyrics are on air (a song, a passage, free text, an Escola material, a
presentation's pages, not covered by Tela preta, the Logo, a timer, an aviso,
a picture or a video); otherwise it folds away and the rest takes its room.
It is pinned to its band at the bottom. With No ar off screen and lyrics on
air while another item is in the Prévia, the Slides column has two tabs,
No ar · Prévia.

**Multiview** (the Programa's pill or right-click menu) splits the Programa's
16:9 into four 16:9 quadrants, 2 px `line` between them, in the same place
and size. Each quadrant is one output showing what is on air its own way; its
label sits on the image, bottom left, as on a broadcast multiviewer: a `bg-0`
chip at 82 %, the output's glyph and name (a click picks the output) and
where it is on screen (`fg-2`; `fg-3` with no screen open; `warn-fg` for a
problem). Under 200 px a quadrant keeps only the name.

**Camadas** edits no look: the layers come first (Texto principal, Fundo,
Logo, the overlays), each with an eye, a padlock, a pencil on hover; the
settings under the list stay folded until a pencil opens them. Its header's
**+** has two items only, Sobreposição de texto (up to 5) and Logo da igreja.
The Fundo's pencil opens a menu whose title names whose background is on
screen and offers "Trocar o papel de parede…". Text look is edited only in
the Editor de temas. **Temas** (right under Camadas) is its 9 slots of
themes as small screens, 3 a row; a click makes a theme the theme in use.
Both are as tall as what they hold (`Measure` → `locked`).

**The Bíblia** is the console's second environment, a dock of its own
(Livros, Capítulos, Versículos, Texto, No ar; the text and No ar never
leave), three columns at first:
- **Livros · Capítulos · Versículos**: Livros' header holds the version, Abrev
  | Nomes, the install + and a view menu (Tema da Bíblia…, cell size); then
  Livros (the 66, coloured by group), Capítulos (as tall as its cells, up to
  40 % of the column) and Versículos (cells: a click selects as clicking the
  text does — Ctrl adds, Shift ranges, a double click projects).
- **Texto**: a header with the chapter, Selecionar todos, Limpar seleção and
  Ler | Comparar; under it a 36 px band with the Recentes, Favoritos and
  Anotações dropdowns, their counts inside the lists; then the verses.
- **No ar**: no header — the screen on top with the Programa's pill, icons
  only (the state's dot, Tela preta, Logo, Limpar, Encerrar), then
  Selecionado. The Bíblia has no Prévia, and its No ar never folds away.

**THE window.** Configurações, the song editor, Sincronizar, the planner, the
media library, the aviso editor, the Escola bíblica, Relatórios and the
theme and screen editors are pages of **one floating window over the live
console** (`.win-dialog` on a `.win-scrim`; `WinBar`: the ← Voltar chip from
level 2, the title, the page's tools, ⧉ Destacar em janela, the (x)
"Fechar · Esc"). Opening from inside navigates in the same window; Esc, the
Voltar chip or the scrim pop one level, the (x) closes the stack. Two sizes
(Padrão, and `.is-editor`), resized by its edges and corners (min 760 × 480),
columns inside resized by splitters as in the console. ⧉ moves the page to a
window of its own (`/Janela`), the same frame filling it. While the window is
open the Programa monitor draws one still frame (the air never pauses).

## How the app uses it

- `tokens.css` is loaded by the console (`src/pages/Console.jsx`), and its
  components in `src/components/console/` follow `bundle.css` class by class
  (`kx-panel`, `kx-row`, `kx-mon`, …), with `console.css` over it. Tailwind
  carries the shadcn theme for the pages outside the console
  (`src/components/ui/`, the error and network pages); it is not built from
  `tokens.json`.
- Fonts: Geist, shipped with the app (variable woff2 in `src/assets/fonts/`,
  `@font-face` in `src/fonts.css`, SIL OFL 1.1 in `public/fonts/`), with
  Inter/system fallback; `tnum` everywhere. Nothing is fetched from the
  internet: the console, the output windows and the network screens load
  the same file, so projected lines break in the same places. It is also
  the "Sem serifa" of every theme (`FONT_MAP.sans`).
- Live information has its own type steps: `live-cap` 12/16 600 for a
  monitor's state word (the Prévia's badge, a captioned `Monitor`'s word),
  `live-title` 16/22 600 for what is on air where a monitor carries a
  caption, `next-title` 14/20 500 for what is prepared, `alert-title`
  13/18 600 for an output failure. `meta` (11 px) is telemetry only, never a
  live or prepared item's name.
- **Density** (Ver › Densidade, saved with the layout per computer):
  **Automática** is the default (`shownDensity`): Compacta when the console's
  grid is under 820 px tall (a notebook), else Confortável. **Confortável**:
  32 px list rows (`row-comfortable`), 14 px titles up to two lines — one
  line, ending in "…", on a row with hover buttons (Rodada G1: the buttons
  took the room and the title wrapped, growing the row) — and 32 px
  panel headers. **Compacta**: 28 px single lines and 28 px panel headers
  (`panelHead`, which the locked heights follow). A chosen density wins;
  controls do not change.
- **One padding rule for panels**: a panel's header is one line, 32 px
  (28 in Compacta), its text 12 px (`space-3`) from the panel's edge and its
  last button 12 px from the right one (the first row under a header starts
  4 px below it); its controls (buttons, selects, Seg) are 24 px tall and
  8 px apart, as in the windows' bar (`.win-bar`). Whatever has a box of its
  own — list cards, the Bíblia's cells, the Temas tiles, the search field,
  tabs, the No ar agora monitor — sits 4 px (`space-1`) in from the column,
  with its text at 12 px; listheads and sub-titles (Selecionado, a Temas
  heading inside Camadas) at 12 px; a band under a header (the Biblioteca's
  search row, the Bíblia's Recentes/Favoritos/Anotações) is 36 px, its
  controls 28 px, 4 px in and 4 px apart, with a 1 px `line` under it. A
  header never wraps into a taller block, and a panel carries no text it
  does not need: no hints in headers, counts inside the lists they count. No
  panel gets an inset of its own. A listhead never repeats the page title
  and its "· hint" is never in caps.
- **Folding a panel**: every panel but the Programa, the Prévia, the player
  and the Bíblia's panels has a chevron right of its header's + (`FoldBtn`;
  "Dobrar" / "Abrir"). Folded down a column, the panel is its header and its
  neighbours take the room; folded across a row, a 28 px strip on `bg-1`:
  the chevron at the header's height over the module's name standing up
  (`writing-mode: vertical-rl`, the `section` style), the whole strip a
  button that opens it (hover `bg-2`). A split always keeps one panel open:
  the last one's chevron stays, at `dim`, inert, with the tooltip "Um painel
  da coluna fica sempre aberto". Folds are this computer's and survive a
  restart; while editing the arrangement every panel is open. **A fold takes
  180 ms** (owner 2026-10-16), the same for No ar folding away; none with
  reduced motion.
- **Grupos** (Rodada H0, owner 2026-10-19; `CfgGroup`, `.cfg-group`): the
  areas of Configurações and the editors open and close. The header is an
  h3 28 px tall whose button holds a 12 px chevron (down open, turned −90°
  closed) and the 11 px `kx-section` title; while closed a one-line
  `kx-meta` summary says what is chosen ("Tirar Suave 0,6 s · Entrar Suave
  0,5 s · Áudios Corte"), gone when open; the group's actions sit at the
  right. The body folds to nothing in 180 ms (`--fold-ms`, the panels'
  ease), stays mounted and inert; none with reduced motion, none when a
  search jump opens it. Groups are 12 px apart with a hairline; a page's
  first area is the same heading without the chevron (static, the chevron's
  slot kept so titles line up), and only the areas after it, or the rare
  ones, fold. Hover `bg-3` on the header, the focus ring inside it. The
  title is the console's grey caption at weight 600 (never gold: gold is the
  brand and what is live). State is the closed summary, never a header hint;
  a page's groups run identity first, then what changes most, then the rare
  (Rodada H1, every Configurações section).
- **List rows are inset cards**: every `kx-row` and `kx-layer` in the
  console (Biblioteca, Setlist, the tabs panel, Camadas, Configurações' menu,
  the views) sits 4 px in from its column with `radius-control` and 2 px
  between rows, so the hover and the states fill a card, never the column
  edge to edge; the inset comes off the left padding, so the text keeps its
  place. One rule in `console.css`; don't override it per list. A list goes
  edge to edge only when the owner asks for it (the Slides column and No ar,
  to gain room).
- **Slides and verses are rows**, not cards: in a list (the Slides column,
  No ar in a column, the Bíblia's Ler and Buscar) each is a row with a 1 px
  separator, so a short screen shows more. The state is the row's background
  only, never a border or a side bar: **on air, the brand's gold**
  (`--live` = `brand`, `--live-bg` = 24 % of it over `bg-2`; the rest of the
  console keeps `air` red for "no ar"); Prévia or selection, 24 % `prev`
  over `bg-2`; the next slide, `bg-2`/`bg-3`; on air and in the Prévia at
  once, the Prévia's green with the number on a `brand` chip; a note, a mark
  in the corner. **On air and Prévia differ by colour only** here (gold and
  green, owner 2026-10-16): no glyph is added. A slide keeps the editor's
  lines, one line each, a line too long for the column ending in "…" (the
  whole text in the tooltip); verses wrap. The No ar strip, low across the
  window, keeps its cards (`.onair-card`). The classes stay
  `.kx-slide`/`.kx-verse` with `is-prev`/`is-air`/`has-note`.
- **Dragging in a list** (the Setlist, the planner, Camadas, the Editor's
  elements; `useSortable` + `dragGhost.js`): the pointer carries a card the
  size of the row, `bg-3`, its icon in `brand`, title and time, lifted
  (scale 1.03, a deep shadow). Where it will land a slot lights up: a
  card-shaped placeholder, `brand` at 16 % over `bg-1` with an inset line of
  `brand` at 60 % — the dragged row itself, moved there, or a placeholder of
  a row's height for a drop from elsewhere. The rows around it glide
  (180 ms, `ease-out`); on the drop the card settles into the slot (180 ms)
  before the list re-renders. A drop onto the Prévia or the Programa lets the
  card fade. Reduced motion: the same states, no animation.
- **Focus.** Buttons and other controls reached with the keyboard get the
  2 px `brand` ring. A text field (input, select, textarea, the search)
  never gets the gold ring while it holds the caret: its focus is a quiet
  inset 1 px line in `fg-3`, grey, at least 3:1 against the field (owner
  2026-10-16), so the operator sees where they type without a gold cue.
- **Fields** (audit C-21): one look for every text field and select,
  `kx-input` / `kx-select` (and `kx-field`, an input with a glyph — the
  `Field` component) in `bundle.css`: 28 px, **24 px with `is-small`**
  (Configurações' selects, inline renames, the planner's service pick),
  `bg-2`, a 1 px `line-strong` line on hover, and focus as the quiet 1 px
  `fg-3` line (5.5:1 on `bg-2`, 4.9:1 on `bg-3`, ≥ 3:1 as WCAG 1.4.11 asks).
  It is an outline, so a Windows contrast theme keeps it. Disabled dims
  (`--dim`); `[aria-invalid="true"]` (and the Sincronizar time's `is-bad`)
  draws the line in `warn`. Textareas are `kx-input` with their own height.
  The console's older field classes (`pl-input`, `ed-text`, `cfg-select`,
  `cfg-inline`, `pl-pick`, `fg-input`, `mv-rename`, `qt-min`, `sync-time`,
  the notes, the Camadas and Bíblia version selects) wear it from one
  `:where()` block in `console.css` and keep only their width or ground; a
  new field takes `kx-input` / `kx-select`, never a class of its own. Big
  search fields keep their size (the palette 40 px, the lyrics search
  36 px, the quick jump 40 px) and the same states.
- **Numbers** (Rodada HF2): a number with steps is `NumBox` (kx.jsx,
  `kx-num` in `bundle.css`): `− [4,8] + %`, 24 px tall, the field's `bg-2`
  and quiet focus, the steppers 24 × 24 (out of the Tab order: the field
  takes ↑/↓, Shift ×10), the unit after the + in `fg-3`, a comma as the
  decimal point. Typing commits on Enter or when the field loses focus,
  clamped and rounded to the step. Presets that are only shortcuts sit
  beside it as a `Seg` that writes the number and is pressed when it is
  equal (the Editor de temas' Tamanho: `NumBox` 1–12 % + PP…GGG). A
  slider stays for what is felt rather than read (opacity, the dim).
  The Editor de temas' form is `CfgGroup`s since the Rodada HF3 (ids
  `tema.<grupo>`; summaries `fontSummary`…`transitionSummary` in themes.js):
  Nome e padrão (plain heading: Nome, Tema padrão, Comentário, Título do
  item), Fonte and Fundo open, Cor e efeito, Caixa do texto, Posição and
  Transição closed with a summary ("Bebas Neue · 4,8 % · negrito"). The
  Fonte rows: Fonte (FontPicker and
  its note), Tamanho, Estilo (N and I toggles, 24 px, `aria-pressed`, and
  Maiúsculas), Entrelinhas (0,9–2, "1,22 = normal"), Espaçamento
  (−0,10–0,50 em); Contorno (0–8 px and its colour) sits under Efeito e
  cor, Comentário under the name.
- **Live fill buttons** (audit C-22): *Enviar ao ar* (`kx-btn-prev`),
  *Destravar* (`kx-btn-rh`) and *Encerrar* / *Excluir* (`kx-btn-air`) step
  **darker** on hover and when pressed (`--prev-fill-hover`/`-pressed`,
  `--rh-fill-…`, `--air-fill-…`: white stays 5.6–7.4:1; a lighter shade
  would drop under 4.5:1). Disabled goes neutral like the gold button
  (`bg-3`, `fg-3`) and never lights on hover; the focus ring is the gold
  button's (light `fg-1`, 2 px outside the fill). *Destravar* on the lock
  banner is 24 px, like every banner button.
- **Cursor.** Buttons keep the Windows arrow cursor (owner 2026-10-16), as
  in a desktop program; the pointer hand is for links only. Text fields
  show the text cursor, splitters and window edges their resize cursors.
- **Windows contrast themes** (audit C-05): under forced colours Chromium
  repaints backgrounds and borders in the system's colours and drops
  shadows, so the states (all of them backgrounds) and the controls drawn
  with fills or shadows would vanish. One `@media (forced-colors: active)`
  block at the end of `bundle.css` (and the console's at the end of
  `console.css`) gives them cues in system colours only: on air,
  `Highlight` fills the row with `HighlightText` (still the row's
  background); Prévia, a 2 px dashed `LinkText` ring; next, a 2 px dotted
  ring; chosen, pressed or open (`is-on`, `is-selected`, Seg, tabs), a 2 px
  `Highlight` ring; switches, fields and outline or filled buttons get
  `ButtonText` / `FieldText` borders, panels and popovers a 1 px edge. A
  ring never replaces the keyboard's focus ring, and the normal look does
  not change. The monitors (`.kx-mon-screen`, `.kx-pip`, `.cfg-prev`) and
  every output opt out (`forced-color-adjust: none`): what the congregation
  sees keeps its own colours. A new state or control drawn as a background
  gets its line there (`src/lib/forcedColors.test.mjs`).
- Output health (`src/lib/console/outputs.js`, tested) decides the Saídas
  status in the top bar, the popover's rows, the pill's "2 telas" and the
  banner, from what the main process reports and a memory of the session: a
  screen that was there and left stays *Desconectada* or *Fechada* until it
  returns or the operator says *Esquecer*.
- Projected screens are not styled by these tokens: they use the church's
  themes and backgrounds (user data) and only the `screen-*` styles.
- **Screen readers** (audit batch 4, 2026-10-16; kx.jsx). A state shown by a
  background (on air, Prévia) is also `aria-current` plus words in a
  `.kx-sr` span ("no ar", "na prévia": `stateWords`/`SrState`), never a
  glyph — the owner keeps on air vs Prévia colour only. A `Row` with actions
  is a `listitem` (its list `role="list"`) with sibling buttons named by
  their target ("Ir para João 3:16-17", "Ocultar o Fundo"); without actions
  it is one button. `Panel` is a region whose title is a level-2 heading; the
  dock is the page's `<main>`. Toasts and what goes on air are said by one
  always-mounted polite region (`useLiveRegion`), never by a `role="status"`
  that mounts with its text. A field or `Seg` beside a visible label is named
  by it (`label`, or `FormRow`'s `RowLabel`), never by its placeholder.
  `Seg`'s chosen option has a 1 px `fg-3` inset (≥3:1) besides its fill; a
  done Setlist row dims its glyph and title only, its meta and time stay
  `fg-3`.

## Outputs and screens on the network

The outputs are Projeção, Letras, Vídeo, **Avisos** (the output of the
avisos in sequence, page `/CommunicationProjection`; owner 2026-10-16, it was
called "Comunicação"), Palco, Tela do pastor and Transmissão. They render the
live state with `ScreenRenderer`; the Projeção has no click-to-advance (owner
2026-10-16): only the console, its keys, the outputs' own keys and the
controle remoto move a slide.

**Each screen owns its design** (`OutputPref.design`): the Editor de telas, a
page of THE window, edits one screen's design on a canvas drawn by the
renderer itself (what is on air, or an example), with the brand colour for
the selection, its eight handles and the magnet's guide lines, and that
screen's settings beside it. Clicking a screen is already editing it: with no
design of its own the canvas opens seeded with the page's ready drawing, and
nothing is saved without "Salvar a tela". Every screen is landscape (16:9),
the Pastor's included. Elements hidden right now (by their rule, or with
nothing to say) are drawn at 35 % with a dashed outline so they can still be
picked. In a public output the **Projeção** element is the output's own view
(Mostrar, theme, scale), and a design with a timer element takes the tool out
of it, so the timer sits in a corner over the words.

**Screens on the network** (`src/components/network/net.css`): `bg-0`
ground, Geist, tokens, sized in container units so a phone, an upright
tablet and a 4K TV get the same layout in proportion. Letras and Vídeo are
views of the live state; waiting, they show the live idle look, never a page
of their own. Palco: title, Tom / BPM / time chips, the slide large, the
cifra beside it (under it when upright), the next slide, slide dots (red = on
air). Tela do pastor: the projected image as the projector draws it, the
clock, how long the service has run, and the next items of the Setlist. The
start page groups the screens (Público, Palco, Transmissão) as cards and
offers the last one used (gold, the one ordinary action). Connection, said
once for every page but Transmissão (`NetStatus`): a full screen while it has
never connected (*Conectando ao KERYX…*), then an amber chip over the last
image while it reconnects (*Reconectando… tentativa N*).

**The Aviso rápido** is one bar on every screen, in each screen's look
(`AlertBar`): by default an amber band across the top (the Palco's at the
bottom); each output picks position, style, colours, size and entrance in
the Editor's Ajustes › Aviso rápido.

## What the canvas does not cover

Views the app has and the canvas never drew; they follow this system but were
designed in the app: THE window and its pages (the song editor, Sincronizar,
the service planner, the media library, the aviso editor, Escola bíblica,
Relatórios, Configurações, the Editor de temas and the Editor de telas), the
background library, the dock and Editar disposição, the Temas panel, the
player's two rows and the Bíblia's dock.

## Histórico

Kept so old commits and the canvas make sense; none of this is a rule.

- **2026-10-07 — the canvas.** Artboards: Ao vivo 1920×1080 and 1366×768,
  Ensaio, Bíblia, Saídas, Paleta de comandos, Layout, Saídas · roteamento e
  YouTube, and 8–15 for three steps (Preparar · Verificar · Apresentar) that
  the owner cut the same day: the console became one screen, always live,
  Verificar an overlay, a double click sends. The canvas's "Roteiro" is the
  Setlist; its printed "Ctrl+Enter", the Esc that asks and the thumbnail
  strip were never built. Text fields first lost the gold focus ring then (a
  `line-strong` inset line, replaced by the `fg-3` line on 2026-10-16).
- **2026-10-09/10.** The Ensaio | Ao vivo switch became *Travar telas* and
  the service clock. The Programa monitor lost its red frame while simply on
  air. Esc ends at once with Desfazer. Right-click menus. Confortável became
  the default density (Automática replaced it on 2026-10-14).
- **2026-10-10 to 10-14 — the screen actions** were one chip of glyphs in
  the top bar (before that a named Telas group); since Rodada E1
  (2026-10-16) they are in the Programa's pill. The Programa had a 32 px
  header that was its live caption (state word PROGRAMA, the title at 16 px,
  *em N telas*); the pill replaced it in Rodada E1.
- **2026-10-10 — Camadas' look controls** (Opacidade, Largura, Caixa,
  Escurecer, Desfoque…) and **2026-10-12 — Fundos gerados' sliders in
  Camadas** moved out on 2026-10-14: Camadas edits no look, a picture's dim,
  blur, fit and position are its own (the library), generators are edited in
  the library's Gerados.
- **2026-10-12 — Editar layout**: columns and stacked cards moved by grips
  (`layout.order`/`layout.stacks`, `arrange.js`, now only read to build a
  first dock). The free dock and Editar disposição replaced it on 2026-10-13.
  The live column of then (Programa, player slot, Prévia with *Enviar ao ar*,
  a Próximo line, a "Depois" list, 8 px gaps) is gone, and so is the 36 px
  one-row player.
- **2026-10-12 — Layouts das telas**: designs as a catalogue assigned to
  screens (*Usar em…*, Ajustes › Layout). Since 2026-10-13 each screen owns
  its design.
- **2026-10-13/14 — slides and verses as cards** with a 2 px side bar, then
  as cards without it; rows since the small-screen review of 2026-10-14.
- **Until 2026-10-14 — Configurações › Aparência** held the church's slide
  transition and the backgrounds; it is gone (Culto, Temas e fundos, Telas e
  saídas). The slide-to-slide transition is the theme's.
- **Until 2026-10-14 — the full-screen views** had a *Console* back button
  (`BackBtn`); THE window and its WinBar replaced them (Rodada C).
