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
- `components/bundle.js` — the icon set (`window.KERYX.icon(name)`,
  `KERYX.mount(root)`): bare 16 px glyphs, 1.5 stroke.

`tokens.json`, `tokens.css` and `bundle.css` are edited by hand and kept in
step with each other; nothing generates one from another. A token change
touches all three (and `console.css` if the console overrides it).

Canvas (mockup + system, editable there): https://claude.ai/artifact/TRDHTGjQ2VCHRUWDKjpae5
— artboards: Ao vivo 1920×1080 and 1366×768, Ensaio, Bíblia, Saídas, Paleta
de comandos, Layout, Saídas · roteamento e YouTube. All artboards import
`Main.dc.html` with a `scene` prop. The canvas also covers the quick alert
(`kx-alert`, the one control that bypasses Prévia), the tools Relógio /
Cronômetro / Timer / Texto livre (`kx-tool`, on screen `kx-screen-tool`),
YouTube by link and per-output routing (`kx-route`, one setting with the
transport's "Toca em"). **The canvas is a record, not the specification:** its
artboards 8–15 (the three steps, below under Histórico) and its wording
("Roteiro") are out of date. Where the canvas and this page disagree, this
page and the running app win.

## Comportamento

The console is one screen, always live: no steps and no sandbox. To rehearse,
the operator **locks the screens** (*Travar telas*, in Saídas): the screens
keep what they show, the console prepares and browses freely, and sending is
refused until *Destravar* (built 2026-10-10, below). **Verificar** is an overlay opened from the Saídas popover. The
rundown is called **Setlist**. These are user decisions (2026-10-07, also in
`CLAUDE.md`) recorded here so the design system, `CLAUDE.md` and the running
UI tell one story.

**Prepare, then send.** A click on a song, slide, verse, aviso or Setlist
row only prepares it in the Prévia (green). It reaches the screens by one of:

| Act | Where |
| --- | --- |
| **Double click** on the item | Biblioteca, Setlist, slides, verses, search results, Escola bíblica materials, Mídia, the Prévia's screen |
| **Enter** | with nothing focused (or the monitors focused): sends the Prévia / the Bíblia's selection |
| **Ctrl+Enter** | from anywhere except a text field |
| **Enviar ao ar** | the button where there is one: the Bíblia, the Escola bíblica, the Mídia (and the Setlist's *Ir*); the culto's Prévia has none since 2026-10-14 — Enter, a double click on its screen or its right-click menu send it. Its keys live in one tooltip on every send button, never printed: "Enviar ao ar · Enter (Ctrl+Enter de qualquer lugar)" (`SEND_TIP` in `src/lib/console/copy.js`) |
| **Drag onto the Programa** | from the Biblioteca (onto the Prévia it prepares; onto the Setlist it adds) |

A click on one control never leaves focus on it, so the next key works on the
console. Typing never sends: in a text field every key is typing, and Esc first
leaves the field. A control focused with Tab keeps its own Enter and Space.

**Keys** (`src/lib/console/keys.js`, tested): ←/→ move the slide or verse on
air; ↑/↓ move the selection (green); Space plays or pauses; **B** Tela preta,
**L** Mostrar logo, **C** Limpar texto; **Esc** closes the topmost thing open,
one per press (a right-click menu, a popover or dialog, then Configurações,
then the Camadas drawer; `escapeTarget`), and with nothing open ends the
projection at once. **Right click** (2026-10-10, `ContextMenu.jsx`): songs,
media, avisos, Setlist items, slides, verses, the Programa and Prévia
monitors and the Camadas layers have a menu at the pointer (a `kx-pop`,
kept inside the window, ↑/↓ and Enter work in it). It never prepares or
sends by itself; anything that changes what is on air (*Enviar ao ar*,
*Ir para o item*, *Encerrar…*) is last, after a separator (`orderItems`);
after an item the keys go back to the console. Text fields keep the
system's Recortar / Copiar / Colar
and its toast's *Desfazer* puts back what was on air, on the same slide;
*Voltar ao anterior* still brings one earlier item back through the Prévia; **/** searches; **?** lists the keys. The
*Encerrar* button, unlike Esc, asks first. In the Bíblia a letter or digit
opens the quick jump. A splitter focused with Tab keeps ←/→ and ↑/↓ for
itself, so resizing never moves what is on air.

**The command palette** (`/`) opens centred over the console, on the dimmed
scrim (owner decision 2026-10-11; it used to stop short of the Programa).
Enter puts the result in the Prévia and Shift+Enter
adds it to the Setlist; it never sends. An unexpected Scripture request
("Jo 3:16", or the quick jump's "jo 3 16") typed in the KERYX environment
goes to the Prévia right there, without leaving the console: one verse is
its whole chapter from there, as in the Bíblia, in the version chosen
there. *Abrir na Bíblia* is the row below it. A chapter alone, or the
palette opened in the Bíblia, opens the reference in the Bíblia (built
2026-10-10).

**What acts on the real screens at once.** Tela preta and Mostrar logo act on
the real screens at once, locked or not. The *Alerta rápido* (its
Enter in the field) is the one control that bypasses the Prévia. Camadas edits
(logo, overlays, background, theme, layer order) apply as made while live.

**Settled 2026-10-10.** Esc keeps ending the projection at once, and its
toast (and *Encerrar*'s) offers **Desfazer**, which puts back everything
the screens showed: the text on the same slide, media, avisos or a tool,
the video channel, Tela preta or Logo (media start again from the
beginning; refused while the screens are locked). **Camadas edits go live
as made**: Camadas is its own section, a deliberate place, and *Travar
telas* holds them during a rehearsal. The Próximo line's button says **Pôr
na prévia**, like every other place.

**Camadas, more control (2026-10-10):** Texto principal adds Opacidade,
Largura, Entrelinhas, Maiúsculas, a Caixa behind the text (Faixa across the
screen or Bloco around it, its colour and opacity) and an Ajuste fino
(nudge up or down); Fundo adds Ajuste (Cobrir / Conter), Posição, Escurecer
and Desfoque; Logo adds a free Largura, Opacidade and Margem. All are fields
of the live state (typed and clamped in `shared/live-state.mjs`), so every
output draws them; a theme saved with *Salvar como novo* keeps the text and
background ones, and applying a theme without them clears them.

**Fundos gerados (2026-10-12, as ProPresenter's generated backgrounds and
the Claude Design mockup's *Propriedades* tab):** Fundo gains a **Gerado**
row — five tiles (Fluido, Nuvens, Aurora, Luzes, Degradê vivo) drawn as
gradients of their first preset — and, for the one on air, its **Presets**
(chips with a colour dot), the sliders the generator uses (Velocidade,
Escala, Intensidade, Detalhe, Espaçamento, Persistência, Contraste, in the
mockup's order, with the value beside each), **Cores** (one to three colour
swatches, dark → mid → light) and **Áudio-reativo** (*Desligado · em breve*).
Sliders move the live state at most ten times a second. The screens compute
it on a WebGL canvas (`GeneratorBackground`), 30 fps, at most 960 px wide
and scaled up; the Programa monitor moves, the Prévia and the galleries are
still; a PC without WebGL shows a still gradient of the colours. Ajuste,
Posição and Desfoque do not apply to a generated background; Escurecer does
(0 by default). **Áudio-reativo** is a switch: on, the pattern pushes out
and brightens with the sound leaving the computer (what the meters show;
only the outputs on this computer follow, a screen on the network draws it
still-level). *Salvar como novo* keeps a generated Fundo in the theme
(`background_generator`), and applying the theme brings it back; the Temas
editor shows it and can take it out, not edit it.

**Bible editions (settled 2026-10-10).** The edition the operator chooses
is the one used, even when another is installed: ARA with NVI installed is
read from the internet (the badge says "pela internet", amber), and a
chapter that cannot be fetched comes from the installed edition, with a
toast and the warning line saying so. Verificar says, per edition, what
happens without internet.

**Open decisions** — none at the moment.

**Travar telas and the service clock (decided 2026-10-09, built
2026-10-10).** The owner dropped the Ensaio | Ao vivo toggle
(research of 2026-10-09):

- **Travar telas** replaces Ensaio. It is the live state's `locked` flag,
  set from the Saídas popover and enforced in the main process (`applyOp`),
  so the outputs and network screens obey it too. The rule: *nothing new goes
  onto the screens; anything can come off*. Tela preta, Logo, Limpar, Esc
  and what continues on its own (a playlist, a "Tocar todos" sequence) keep
  working. While locked the Programa's frame and caption are blue (`rh`,
  "Programa · travado"), *Enviar ao ar* is disabled, a double click or Enter
  gives one toast, and a blue banner says `TELAS TRAVADAS` with
  *Destravar*. A restart comes back unlocked.
- The **service clock** takes the toggle's slot in the top bar: `Sem culto`,
  `Culto sem horário`, `Culto em 12/10 às 19:00`, `Começa às 19:00 · em 12
  min`, `Culto 0:42:10 · termina ~20:12` (amber `+N min` when late) and
  `Culto 1:20:05 · passou 5 min` (amber). It counts from the service's date
  and start time, never a default hour; a click opens *Planejar o culto*; the
  part after the dot is the first thing a narrow bar drops.
- **Going live is a double click** (a single click never sends); Enter,
  Ctrl+Enter, *Enviar ao ar*, the explicit send buttons (*Ir*, *Tocar*,
  *Projetar*), the drag onto the Programa and the Alerta rápido stay.

## Layout

The tiers, the live column, the splitters, Ver and Camadas are
specified in the README (Spacing, radii, layout). In short: three width tiers
measured on the console grid (wide ≥ 1400, medium ≥ 1100, narrow below, down
to the 960 × 600 window minimum); one live column that never stacks below
anything; the Setlist a column when wide and the Biblioteca's first tab
otherwise; Camadas a section above the Setlist in that column when wide
(owner's request, 2026-10-10; a horizontal splitter between them) and a
drawer from the Programa's pill otherwise; **Ver** (beside the bell) in the
top bar, which fits on one line at every width. The screen actions (Tela
preta, Logo, Limpar, Encerrar: one chip of glyphs in the top bar from
2026-10-10) are glyphs in the Programa's pill since Rodada E1 (2026-10-16):
the Programa has no header, its caption and controls sit in one pill inside
the screen, bottom-right.

**Editar layout (2026-10-12):** Ver › *Editar layout* lets the operator move
the columns and the cards stacked in a column, in the console and in the
Bíblia. Columns: Biblioteca, Slides, Programa and Camadas+Setlist (narrow:
Biblioteca and Slides as one column); in the Bíblia, Livro · Capítulo ·
Versículo, Texto and No ar. Stacks: Camadas/Setlist, Biblioteca/Slides
(narrow) and Livros/Capítulos/Versículos. While editing, a neutral banner
under the top bar (*Restaurar posições*, *Concluir*; Esc concludes, before
it would end the projection), a 32 px bar on top of each column (grip, name,
◀ ▶) and a grip with ▲ ▼ in a stacked card's header; drags are pointer
moves on the grip (never HTML5 drag and drop) with a 2 px brand line where
it lands; the panels' content is veiled so a click never prepares or sends.
The order is saved with the layout per operator (`layout.order` and
`layout.stacks`, normalized by `src/lib/console/arrange.js`). **Splitters
follow the columns:** each column with a saved width has one splitter, on
the side facing the flexible column (the Programa, or the Bíblia's text);
Camadas' height splitter flips when the Setlist is above it. The Camadas
drawer opens on the side of the Programa with more room.

The live column's fixed height is the sum of its rows (the Programa's caption
26 px and the Prévia's 24 px, each with 4 px under it, three 8 px gaps, the
36 px player slot, the 28 px Próximo line: 146 px in all); the Programa is as
wide as the column and that height allow, with the player slot under it and
the Prévia (46 % of the block) and *Enviar ao ar* under the slot (historical: since 2026-10-14 the Programa and the Prévia have no card and the Prévia no button; its caption is a badge inside the screen, `kx-mon-badge`, and bare modules are `kx-panel-bare`). Spare height
goes below, into the "Depois" list. The player slot is always reserved so
starting a video never moves the monitors.

**Multiview (2026-10-12):** the Programa header's *Multiview* toggle (grid
glyph; also in the Programa's right-click menu) splits the Programa's 16:9
into four 16:9 quadrants, 2 px `line` between them, in the same place and
size, so nothing else moves. Each quadrant is one output showing what is on
air its own way; its label sits on the image, bottom left, as on a broadcast
multiviewer: a `bg-0` chip at 82 %, the output's glyph and name (a click picks
the output, from a menu) and where it is on screen (`fg-2`; `fg-3` with no
screen open; `warn-fg` for a problem). Under 200 px a quadrant keeps only
the name. The Programa's frame (locked, failed output) and its drop target
stay on the whole grid.

**Player (2026-10-07; position changed 2026-10-09 and 2026-10-12):** one 36 px
row in the slot between the Programa and the Prévia (owner's decision
2026-10-12: it drives what is on air, so it sits under the Programa; it was on
top of the Programa, then under the Prévia), `bg-2`, built from the
transport pieces (`kx-seek`, `kx-time`, `kx-meter`, bare icon buttons): title
and kind, Anterior, −10, Tocar/Pausar (32 px, `bg-3`), +10, Próximo, Parar,
time, seek, mute, a 2 px volume slider with a 10 px thumb, the L/R meters
(green, amber from −3 dBFS, dim when not live or not measurable) and "Toca
em". It narrows with container queries (drops "Toca em", the kind, the ±10 and
the percentage, then the time). It shows only while something plays.

**Bíblia (2026-10-12, replacing the 2026-10-11 single panel):** three
columns, each its own module, with real splitters (the side two resizable,
`bibleSelW` and `bibleAirW`):
- **Livro · Capítulo · Versículo** (300 px): a header with the version, the
  edition, the reference/word field and "+"; then three cards, each
  scrolling on its own — **Livros** (all 66, coloured by group; **Abrev |
  Nomes** in its header, remembered), **Capítulos** (every chapter of the
  book, as tall as its cells up to 40 % of the column) and **Versículos** (the chapter's verses as 26 px cells: a click
  selects as clicking the text does — Ctrl adds, Shift ranges, a double
  click projects — green selected, red on air; it takes the height left).
- **Texto** (flexible, min 360 px): a header with the chapter, two icons
  (Selecionar todos, Limpar seleção) and Ler | Comparar — no hint and no
  search field (owner 2026-10-16: the console's search, the palette, opens
  references and searches words in the Bíblia, its results in this panel);
  the Recentes, Favoritos and Anotações dropdowns on the left of a band
  under it, their counts inside the lists; then the verse list, scrolling
  on its own.
- **No ar** (400 px): no header (owner 2026-10-16) — the screen on top
  (at most 35 % of the column's height) with the Programa's pill, icons
  only (the state's dot, Tela preta, Logo, Limpar, Encerrar), then
  **Selecionado**; the Bible has no Prévia. None of the Bíblia's panels
  folds.
The order of the columns and of the three cards is the operator's (Editar
layout).
Without internet every *Instalar* says "sem internet" and does nothing. The
edition is named beside the version: *instalada neste computador*, *pela
internet* (amber) or *não disponível* (amber), and a missing edition offers
*Instalar* or *Usar* an installed one; sample text is never shown in a
Bible's place.

**Other app departures (2026-10-07):** text fields show no gold focus ring
while typing (a quiet inner `--line-strong` line instead; the gold ring stays
for keyboard focus on buttons). Monitor frames are drawn inside the box, so
narrowing the window never cuts them. The player's seek is a 6 px progress
bar (red while live) with the remaining time and the length beside it.

**Windows contrast themes (2026-10-16, design audit C-05):** under forced
colours Chromium repaints backgrounds and borders in the system's colours and
drops shadows, so the states (all of them backgrounds) and the controls drawn
with fills or shadows would vanish. One `@media (forced-colors: active)` block
at the end of `bundle.css` (and the console's at the end of `console.css`)
gives them cues in system colours only: on air, `Highlight` fills the row with
`HighlightText` (still the row's background); Prévia, a 2 px dashed
`LinkText` ring; next, a 2 px dotted ring; chosen, pressed or open (`is-on`,
`is-selected`, Seg, tabs), a 2 px `Highlight` ring; switches, fields and
outline or filled buttons get `ButtonText` / `FieldText` borders, panels and
popovers a 1 px edge. A ring never replaces the keyboard's focus ring, and
the normal look does not change. The monitors (`.kx-mon-screen`, `.kx-pip`)
and every output opt out (`forced-color-adjust: none`): the picture, its
frame included, keeps its own colours.

**Screens on the network (2026-10-10):** every page a tablet, TV or stage
monitor opens is on this system (`src/components/network/net.css`): `bg-0`
ground, Geist, tokens, sized in container units so a phone, an upright
tablet and a 4K TV get the same layout in proportion. Letras and Vídeo are
views of the live state drawn by `ScreenRenderer` (`src/lib/network/views.js`):
waiting, they show the live idle look, never a page of their own. Palco: title,
Tom / BPM / time chips, the slide large, the cifra beside it (under it when
upright), the next slide, slide dots (red = on air). Tela do pastor: the
projected image as the projector draws it, the clock, how long the service
has run, and the next items of the Setlist (the service of the item on air).
The start page groups the screens (Público, Palco, Transmissão) as cards and
offers the last one used (gold, the one ordinary action). Connection, said
once for every page but Transmissão (`NetStatus`): a full screen while it has
never connected (*Conectando ao KERYX…*), then an amber chip over the last
image while it reconnects (*Reconectando… tentativa N*); the PIN and "not
available" pages the server writes use the same colours.

**Layouts das telas (2026-10-12).** The owner asked for the Palco and the
Tela do pastor to be designed on a canvas, as Holyrics' panel themes and
ProPresenter's stage layouts, instead of a form of switches; and settled
that outputs stay the fixed physical roles (one Palco, one Pastor, any
number of network screens) while what is created, categorized and assigned
is the *layout* (`src/lib/layouts.js`, `LayoutRenderer`, `LayoutEditor`).
The editor is a view inside the console, built like the aviso editor: the
elements and the selected one's look in the left panel (400 px), the canvas
in the centre drawn by the renderer itself (what is on air, or a sample),
with the brand colour for the selection, its eight handles and the magnet's
guide lines; every screen is landscape (owner decision: the pastor's tablet
too). Elements hidden
right now (by their rule, or with nothing to say) are drawn at 35 % with a
dashed outline so they can still be picked. Each element keeps the network
screens' look (`net.css` chips, `kx` tokens, Geist, cqmin sizes), so a
layout and the factory Palco read as one family. *Usar em…* under the canvas
saves and assigns in one go. Layouts live in Telas e saídas (a list with
Editar, Duplicar, Excluir) and in each output's Ajustes › Layout; the factory
layouts are models that open as a copy. The public outputs (Projeção,
Letras, Vídeo, Comunicação) take layouts too: the **Projeção** element is
the output's own view (ScreenRenderer, with Mostrar, theme, scale), full
screen or in a part, and a layout with a *Relógio ou timer no ar* element
takes the tool out of the Projeção element, so the timer sits in a corner
over the words instead of filling the screen (the Holyrics panel the owner
showed); the model "Projeção com timer no canto" does exactly that.

## Histórico: Preparar · Verificar · Apresentar (canvas artboards 8–15, 2026-10-07)

> **Historical.** Kept as a record of the canvas, not as a specification. The
> console is not three steps; see Comportamento and Layout. The wording below
> is the canvas's: "Roteiro" is **Setlist** in the app, and the canvas's
> *Ctrl+Enter* under the send button, its Esc asking before it ends, and its
> thumbnail strip differ from the app.

After Codex's review the console briefly became three steps (Preparar ·
Verificar · Apresentar); **later the same day the user cut the steps**: the
app is one console, always live (Ensaio, its sandbox then, became *Travar
telas* on 2026-10-10), Verificar as an
overlay from the Saídas popover, and a double click (or a drag onto the
Programa) sends to air. Artboards 8–15 stay in the canvas as a record; the
app follows the full modular layout of artboards 1–7. The top bar is a menu
bar, drawn straight on the window (`bg-0`, no panel, 2026-10-09): the KERYX
mark (menu), the environment tabs **KERYX | Bíblia** (`kx-tabs`, underline in
brand), the search, the service clock, a compact clock, the outputs status,
Ver and the bell, on one line at every width (the screen actions moved into
the Programa's pill in Rodada E1, 2026-10-16).
The Bible quick jump (Holyrics-style "jo 3 16") is a `kx-pop` with Livro /
Capítulo / Versículo captions over the typed text and the candidate books.

- **Apresentar** (artboards 8–12, 15, as drawn): Programa (58 %) and Prévia
  (42 %) side by side; under the Programa a strip of slide thumbnails (red =
  on air, outline = next, green = prepared) and 36 px Anterior/Próximo; under
  the Prévia the 40 px send button with "Ctrl+Enter", a one-line
  "Ao enviar: …" note when sending is not obvious, and a short rundown (on
  air, prepared, next two) with "Roteiro completo". "Mais" opens a right
  drawer (Camadas, Letras, Mídia, Avisos, Ferramentas). Ensaio lives here
  only. An output failure is a full-width amber banner under the top bar,
  never over the monitor. Escola bíblica is a service template here: teacher
  notes under the Prévia ("só no retorno e no tablet"), question slide then
  "Revelar resposta" as the next slide, a discussion timer.
- **Preparar** (artboards 1–7, 13): the full console as before; "Novo culto a
  partir de…" (Culto de domingo, Escola bíblica, Jovens, Santa ceia, Funeral,
  Conferência), "Duplicar o culto anterior", and Pré-culto / Culto /
  Pós-culto section headers in the Roteiro (Setlist in the app, where the
  headers are `SECTION` items).
- **Verificar** (artboard 14): one list grouped as Saídas (with
  Identificar), Mídia do roteiro (*Mídia da setlist* in the app) (Localizar…),
  Áudio (Testar), Fontes do tema, Bíblia (installed for offline use), Internet; a
  summary ("Tudo pronto" / "N itens precisam de atenção"). In the app it is an
  overlay from Saídas › *Verificar tudo…*.

**To relabel in the canvas** (an external artifact; not edited from here):
artboards 8–15 as "Histórico · 2026-10-07"; "Roteiro" → "Setlist"; the
Apresentar send button's printed "Ctrl+Enter"; the Esc that asks.

## How the app uses it

- `tokens.css` is loaded by the console (`src/pages/Console.jsx`), and its
  components in `src/components/console/` follow `bundle.css` class by class
  (`kx-panel`, `kx-row`, `kx-mon`, …) so the mockup and the app read the same.
  Tailwind carries the shadcn theme for the pages outside the console
  (`src/components/ui/`, the error and network pages); it is not built from
  `tokens.json`.
- Fonts: Geist, shipped with the app (variable woff2 in `src/assets/fonts/`,
  `@font-face` in `src/fonts.css`, SIL OFL 1.1 in `public/fonts/`), with
  Inter/system fallback; `tnum` everywhere. Nothing is fetched from the
  internet: the console, the output windows and the network screens load
  the same file, so projected lines break in the same places. It is also
  the "Sem serifa" of every theme (`FONT_MAP.sans`).
- Live information has its own type steps (2026-10-09, addendum finding 2):
  `live-cap` 12/16 600 for the state word (PROGRAMA, PRÉVIA), `live-title`
  16/22 600 for what is on air (once per screen), `next-title` 14/20 500 for
  the Prévia and the Próximo line, `alert-title` 13/18 600 for an output
  failure. `meta` (11 px) is telemetry only, never a live or prepared
  item's name. The live column's monitors use `Monitor`'s `cap` prop
  (word, title, position).
- Density (Ver › Densidade, saved with the layout): **Confortável** is the
  default (user decision 2026-10-09): 32 px list rows (`row-comfortable`),
  14 px titles up to two lines, 14 px slide text. **Compacta** keeps 28 px
  single lines and 28 px panel headers (32 otherwise); controls and the
  live column do not change. **Automática** (the default since
  2026-10-14) is Compacta on a grid under 820 px tall.
- **One padding rule for panels** (owner 2026-10-16, Rodada F4: "some
  panels have inconsistent padding"): a panel's header is one line, 32 px
  (28 in Compacta), its text 12 px (`space-3`) from the panel's edge and
  its last button 12 px from the right one (symmetric; the first row under
  a header starts 4 px below it); its controls (buttons, selects, Seg)
  are 24 px tall and 8 px apart, as in the windows' bar (owner
  2026-10-16, both environments);
  whatever has a box of its own — list cards, verse cards, the Bíblia's
  book, chapter and verse cells, the Temas tiles, the search field, tabs,
  the No ar agora monitor — sits
  4 px (`space-1`) in from the column, with its text at 12 px; listheads
  and sub-titles (Selecionado, the Temas heading at the end of Camadas) at
  12 px; a band under a header (the Biblioteca's search row, the Bíblia's
  Recentes/Favoritos/Anotações) is 36 px, its controls 28 px, 4 px in and
  4 px apart, with a 1 px `line` under it. A header never wraps into a
  taller block, and a panel carries no text it does not need: no hints in
  headers, counts inside the lists they count. No panel gets an inset of
  its own.
- **Folding a panel** (owner 2026-10-16, Rodada F4, pick A): every panel
  but the Programa, the Prévia, the player and the Bíblia's panels has a chevron right of its
  header's +, pointing up while open ("Dobrar"), turned while folded
  ("Abrir"). Folded down a column, the panel is its header and its
  neighbours take the room; folded across a row (the Biblioteca, the
  Slides, the Painel de abas, the Bíblia's Texto and No ar agora), a 28 px
  strip on `bg-1`: the chevron at the header's height over the module's
  name standing up (`writing-mode: vertical-rl`, the `section` style), the
  whole strip a button that opens it (hover `bg-2`). A split always keeps
  one panel open: the last one's chevron stays, at `dim`, inert, with the
  tooltip "Um painel da coluna fica sempre aberto". Folds are this
  computer's and survive a restart; while editing the arrangement every
  panel is open. The size eases (180 ms, none with reduced motion).
- **List rows are inset cards** (UI rule, owner 2026-10-14): every
  `kx-row` and `kx-layer` in the console (Biblioteca, Setlist, the tabs
  panel, Camadas, Configurações' menu, the views) sits 4 px in from its
  column with `radius-control` and 2 px between rows, so the hover and the
  states fill a card, never the column edge to edge; the inset comes off
  the left padding, so the text keeps its place. One rule in
  `console.css`. A list goes edge to edge only when the owner asks for it
  (the Slides column and No ar, to gain room).
- **Dragging in a list** (owner 2026-10-16, Rodada E2: "bigger dragging
  cards… a slight card highlight where it will drop"): the pointer carries
  a card the size of the row, `bg-3`, its icon in `brand`, title and time,
  lifted (scale 1.03, a deep shadow). Where it will land a slot lights up:
  a card-shaped placeholder, `brand` at 16 % over `bg-1` with an inset
  line of `brand` at 60 % — the dragged row itself, moved there, or a
  placeholder of a row's height for a song from the Biblioteca. The rows
  around it glide (180 ms, `ease-out`); on the drop the card settles into
  the slot (180 ms) before the list re-renders. A drop onto the Prévia or
  the Programa lets the card fade. Reduced motion: the same states, no
  animation.
- Slides and verses are **cards** in the console (owner 2026-10-14;
  `console.css` over `bundle.css`'s `kx-slide` and `kx-verse` rows): a
  `bg-2` card with `radius-control`, 4 px apart, and the state is the
  card's background only, never a border or the 2 px side bar. On air:
  the brand's gold (`--live` = `brand`, `--live-bg` = 24 % of it over
  `bg-2`; the console's other "no ar" marks stay `air` red); Prévia or
  selection: 24 % `prev` over `bg-2`; the next slide: `bg-3`; both on air
  and in the Prévia: the Prévia's green with the number on a `brand` chip;
  a note: its mark in the card's top-right corner. A slide keeps the
  editor's lines, one line each, a line too long for the column ending in
  "…" (whole text in the tooltip); verses wrap. The same card fills the
  **No ar** module (a horizontal strip of 220 px cards while the module is
  220 px high or less, a list otherwise).
- Output health (`src/lib/console/outputs.js`, tested) decides the status in
  the top bar, the rows of Saídas, `em N telas` and the banner, from what the
  main process reports and a memory of the session: a screen that was there and
  left stays *Desconectada* or *Fechada* until it returns or the operator says
  *Esquecer*.
- Projected screens are not styled by these tokens: they use the church's
  themes and backgrounds (user data) and only the `screen-*` styles.

## What the canvas does not cover

Views the app has and the canvas never drew; they follow this system but were
designed in the app: the song editor, the service planner (*Planejar o culto*),
the media library, the aviso editor, Escola bíblica (it projects through the
console's Prévia and Programa, and every live key works there), Relatórios and
Configurações (telas e saídas, Bíblias instaladas, temas, dados e
atualizações, among others).

Still to design on this system before they are built:

- Lyrics editor refinements (lines per slide, auto break) and online import.
