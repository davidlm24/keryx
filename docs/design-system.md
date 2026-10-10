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

The console is one screen, always live: no steps. **Ensaio** is the only
sandbox (the console works on a local copy and the real screens keep what was
on air); **Verificar** is an overlay opened from the Saídas popover. The
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
| **Enviar ao ar** | the button (the Setlist's *Ir* and the Bíblia's own send button too) |
| **Drag onto the Programa** | from the Biblioteca (onto the Prévia it prepares; onto the Setlist it adds) |

A click on one control never leaves focus on it, so the next key works on the
console. Typing never sends: in a text field every key is typing, and Esc first
leaves the field. A control focused with Tab keeps its own Enter and Space.

**Keys** (`src/lib/console/keys.js`, tested): ←/→ move the slide or verse on
air; ↑/↓ move the selection (green); Space plays or pauses; **B** Tela preta,
**L** Mostrar logo, **C** Limpar texto; **Esc** ends the projection at once
(after closing whatever is open; in Configurações it goes back to the console)
and *Voltar ao anterior* undoes it; **/** searches; **?** lists the keys. The
*Encerrar* button, unlike Esc, asks first. In the Bíblia a letter or digit
opens the quick jump. A splitter focused with Tab keeps ←/→ and ↑/↓ for
itself, so resizing never moves what is on air.

**What acts on the real screens at once.** Tela preta and Mostrar logo act on
the real screens in every mode, Ensaio included. The *Alerta rápido* (its
Enter in the field) is the one control that bypasses the Prévia. Camadas edits
(logo, overlays, background, theme, layer order) apply as made while live.

**Open decisions** — behaviour the owner has not settled, so the docs state
what the app does, not what it should: Esc ending at once; Tela preta and
Mostrar logo in Ensaio; Camadas edits going live as made; the printed
`Ctrl+Enter` beside *Enviar ao ar* and the `Enter` on the Bíblia's send
button (the README says shortcuts live in tooltips); the Próximo line's
button reading *Preparar* where the vocabulary says *Pôr na prévia*; whether
an online-only Bible edition (ARA) may be used on a PC with NVI installed.

**Planned, decided, not built.** On 2026-10-09 the owner reconsidered the
Ensaio | Ao vivo toggle and the send step
(`docs/send-and-live-research-2026-10-09.md`). Answers so far: rehearsal
becomes a **lock** on the screens (they freeze; the console can still prepare
and browse), replacing the toggle; a **service clock** takes the toggle's slot
in the top bar and starts at the **service's scheduled time**; and **going
live is always a double click** (a single click never sends, not even on a
slide of the item already on air). What becomes of Enter, Ctrl+Enter and the
*Enviar ao ar* button in that redesign is not decided.

## Layout

The tiers, the live column, the splitters, Ver and the Camadas drawer are
specified in the README (Spacing, radii, layout). In short: three width tiers
measured on the console grid (wide ≥ 1400, medium ≥ 1100, narrow below, down
to the 960 × 600 window minimum); one live column that never stacks below
anything; the Setlist a column when wide and the Biblioteca's first tab
otherwise; Camadas a drawer from the Programa's header; **Ver** and the
**Telas** group (Tela preta, Logo, Limpar, Encerrar, named) in the top bar,
which fits on one line at every width.

The live column's fixed height is the sum of its rows (the Programa's caption
26 px and the Prévia's 24 px, each with 4 px under it, three 8 px gaps, the
36 px player slot, the 28 px Próximo line: 146 px in all); the Programa is as
wide as the column and that height allow, with the Prévia (46 % of the block) and *Enviar ao ar* docked directly
under it. Spare height goes below, into the "Depois" list. The player slot is
always reserved so starting a video never moves the monitors.

**Player (2026-10-07; position changed 2026-10-09):** one 36 px row in the
slot under the Prévia (it was on top of the Programa), `bg-2`, built from the
transport pieces (`kx-seek`, `kx-time`, `kx-meter`, bare icon buttons): title
and kind, Anterior, −10, Tocar/Pausar (32 px, `bg-3`), +10, Próximo, Parar,
time, seek, mute, a 2 px volume slider with a 10 px thumb, the L/R meters
(green, amber from −3 dBFS, dim when not live or not measurable) and "Toca
em". It narrows with container queries (drops "Toca em", the kind, the ±10 and
the percentage, then the time). It shows only while something plays.

**Bíblia (2026-10-09):** the picker is a band on top of the reading
(`.bband`): search and version, all 66 books at once (26 px, coloured by
group), the chosen book with every chapter (26 px), and a line with Recentes
as chips and Favoritos/Anotações as dropdowns. Nothing in it scrolls (Salmos
150 included). When the reading column is under 680 px tall the 66-book grid
folds and the book's name in the chapters row opens it again (the choice is
remembered). The "No ar agora" monitor takes at most 35 % of its column's
height. The edition is named beside the version: *instalada neste computador*,
*pela internet* (amber) or *não disponível* (amber), and a missing edition
offers *Instalar* or *Usar* an installed one; sample text is never shown in a
Bible's place. The Bible column has no Prévia.

**Other app departures (2026-10-07):** text fields show no gold focus ring
while typing (a quiet inner `--line-strong` line instead; the gold ring stays
for keyboard focus on buttons). Monitor frames are drawn inside the box, so
narrowing the window never cuts them. The player's seek is a 6 px progress
bar (red while live) with the remaining time and the length beside it.

## Histórico: Preparar · Verificar · Apresentar (canvas artboards 8–15, 2026-10-07)

> **Historical.** Kept as a record of the canvas, not as a specification. The
> console is not three steps; see Comportamento and Layout. The wording below
> is the canvas's: "Roteiro" is **Setlist** in the app, and the canvas's
> *Ctrl+Enter* under the send button, its Esc asking before it ends, and its
> thumbnail strip differ from the app.

After Codex's review the console briefly became three steps (Preparar ·
Verificar · Apresentar); **later the same day the user cut the steps**: the
app is one console, always live, Ensaio as the only sandbox, Verificar as an
overlay from the Saídas popover, and a double click (or a drag onto the
Programa) sends to air. Artboards 8–15 stay in the canvas as a record; the
app follows the full modular layout of artboards 1–7. The top bar is a menu
bar, drawn straight on the window (`bg-0`, no panel, 2026-10-09): the KERYX
mark (menu), the environment tabs **KERYX | Bíblia** (`kx-tabs`, underline in
brand), Ver, the search, Ensaio | Ao vivo, a compact clock, the outputs status
and the Telas group, on one line at every width.
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
- Timeline: resizing planned durations in Ensaio; Planejado/Real lanes exist.
- The send / Ao vivo redesign (Comportamento › Planned).
