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
| **Double click** on the item | Biblioteca, Setlist, slides, verses, search results, Escola bíblica materials, Mídia |
| **Enter** | with nothing focused (or the monitors focused): sends the Prévia / the Bíblia's selection |
| **Ctrl+Enter** | from anywhere except a text field |
| **Enviar ao ar** | the button (the Setlist's *Ir* and the Bíblia's own send button too). Its keys live in one tooltip on every send button, never printed: "Enviar ao ar · Enter (Ctrl+Enter de qualquer lugar)" (`SEND_TIP` in `src/lib/console/copy.js`) |
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
(`docs/send-and-live-research-2026-10-09.md`):

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
drawer from the Programa's header otherwise; **Ver** (beside the bell) and the
screen actions (Tela preta, Logo, Limpar, Encerrar: one chip of glyphs since
2026-10-10) in the top bar, which fits on one line at every width.

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
the Prévia (46 % of the block) and *Enviar ao ar* under the slot. Spare height
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
  book) and **Versículos** (the chapter's verses as 26 px cells: a click
  selects as clicking the text does — Ctrl adds, Shift ranges, a double
  click projects — green selected, red on air; it takes the height left).
- **Texto** (flexible, min 360 px): Recentes chips and the
  Favoritos/Anotações dropdowns on top, then Ler/Buscar/Comparar and the
  verse list, scrolling on its own.
- **No ar** (400 px): **No ar agora** (at most 35 % of the column's height)
  and **Selecionado**; the Bible has no Prévia.
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
Ver and the bell, and the screen actions as one chip of glyphs, on one line at
every width.
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
  single lines. Headers, controls and the live column do not change.
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
- Timeline: resizing planned durations; Planejado/Real lanes exist.
