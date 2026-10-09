# KERYX design system

The operator console's design system was made in Claude Design and lives in
`docs/design-system/`:

- `README.md` — principles, content rules (pt-BR vocabulary), colour, type,
  spacing, states, iconography, motion. Read this first.
- `tokens.json` — the source of truth (colour, type styles, spacing, radius,
  shadow, timing, opacity), each token with its usage.
- `tokens.css` — the same tokens as CSS custom properties plus the type-style
  classes (`.meta`, `.section`, `.ui`, `.content`, `.clock`, `.screen-*`).
- `components/bundle.css` — the `kx-` component stylesheet: panel, button,
  segmented switch, field, row, tabs, monitor, status, banner, popover,
  splitter, slide, layer, timeline, transport, verse, book, empty state, mark.
- `components/bundle.js` — the icon set (`window.KERYX.icon(name)`,
  `KERYX.mount(root)`): bare 16 px glyphs, 1.5 stroke.

Canvas (mockup + system, editable there): https://claude.ai/artifact/TRDHTGjQ2VCHRUWDKjpae5
— artboards: Ao vivo 1920×1080 and 1366×768, Ensaio, Bíblia, Saídas, Paleta
de comandos, Layout, Saídas · roteamento e YouTube. All artboards import
`Main.dc.html` with a `scene` prop. The canvas also covers the quick alert
(`kx-alert`, the one control that bypasses Prévia), the tools Relógio /
Cronômetro / Timer / Texto livre (`kx-tool`, on screen `kx-screen-tool`),
YouTube by link and per-output routing (`kx-route`, one setting with the
transport's "Toca em").

## Views: Preparar · Verificar · Apresentar (canvas artboards 8–15, 2026-10-07)

After Codex's review the console briefly became three steps (Preparar ·
Verificar · Apresentar); **later the same day the user cut the steps**: the
app is one console, always live, Ensaio as the only sandbox, Verificar as an
overlay from the Saídas popover, and a double click (or a drag onto the
Programa) sends to air. Artboards 8–15 stay in the canvas as a record; the
app follows the full modular layout of artboards 1–7. "Roteiro" is called
**Setlist** in the app. The top bar is a menu bar, drawn straight on the window
(`bg-0`, no panel, 2026-10-09): the KERYX mark
(menu), the environment tabs **KERYX | Bíblia** (`kx-tabs`, underline in
brand), the step selector, the search, Ensaio | Ao vivo, a compact clock, the
outputs status and the emergency glyphs, on one line at every width. The
Bible quick jump (Holyrics-style "jo 3 16") is a `kx-pop` with Livro /
Capítulo / Versículo captions over the typed text and the candidate books.

- **Apresentar** (artboards 8–12, 15, as drawn; see above for the app): Programa (58 %) and Prévia (42 %)
  side by side; under the Programa a strip of slide thumbnails (red = on
  air, outline = next, green = prepared) and 36 px Anterior/Próximo; under
  the Prévia the 40 px send button with "Ctrl+Enter", a one-line
  "Ao enviar: …" note when sending is not obvious, and a short rundown (on
  air, prepared, next two) with "Roteiro completo". "Mais" opens a right
  drawer (Camadas, Letras, Mídia, Avisos, Ferramentas). Ensaio lives here
  only. An output failure is a full-width amber banner under the top bar,
  never over the monitor. Escola bíblica is a service template here: teacher
  notes under the Prévia ("só no retorno e no tablet"), question slide then
  "Revelar resposta" as the next slide, a discussion timer.
- **Preparar** (artboards 1–7, 13): the full console as before; the app
  shows a blue `kx-banner is-rh` "PREPARAR — nada vai às telas" with
  "Ir para Apresentar" instead of the canvas's quiet line, "Novo culto a partir
  de…" (Culto de domingo, Escola bíblica, Jovens, Santa ceia, Funeral,
  Conferência), "Duplicar o culto anterior", and Pré-culto / Culto /
  Pós-culto section headers in the Roteiro.
- **Verificar** (artboard 14): one list grouped as Saídas (with
  Identificar), Mídia do roteiro (Localizar…), Áudio (Testar), Fontes do
  tema, Bíblia (installed for offline use), Internet; a summary ("Tudo pronto"
  / "N itens precisam de atenção") and "Ir para Apresentar", which asks once
  when there are warnings.

**Player (app, 2026-10-07; not drawn in the canvas yet):** one 36 px row on
top of the Programa, `bg-2`, built from the transport pieces (`kx-seek`,
`kx-time`, `kx-meter`, bare icon buttons): title and kind, Anterior,
−10, Tocar/Pausar (32 px, `bg-3`), +10, Próximo, Parar, time, seek, mute,
a 2 px volume slider with a 10 px thumb (the seek bar's look), the L/R
meters (green, amber from −3 dBFS, dim when not live or not measurable) and
"Toca em". It narrows with container queries (drops "Toca em", the kind,
the ±10 and the percentage, then the time). It replaces the transport that
sat under the Prévia.

**More app departures (2026-10-07, round 3):** text fields show no gold
focus ring while typing (a quiet inner `--line-strong` line instead; the
gold ring stays for keyboard focus on buttons). Monitor frames are drawn
inside the box, so narrowing the window never cuts them. The Bible picker
uses bigger targets (books 44 px, chapters 36 px), and the Bible column has
no Prévia. The player's seek is a 6 px progress bar (red while live) with
the remaining time and the length beside it.

**Bíblia selector band (2026-10-09):** the picker left the side column. It
is a band on top of the reading (`.bband`): search and version, all 66
books at once (26 px, coloured by group), the chosen book with every
chapter (26 px), and a line with Recentes as chips and Favoritos/Anotações
as dropdowns. Nothing in it scrolls (Salmos 150 included); the reading
below takes the rest of the height. This replaces the 44/36 px targets of
round 3: the user preferred finding things without scrolling.

The canvas still has things the app does differently, on purpose: slides
send on double click there (never in the app), and Esc there asks before
ending (the app ends at once; the Encerrar button asks). Plain Enter sends
in the app once nothing is focused, and a mouse click never leaves focus on
a control (`src/lib/console/keys.js`).

## How the app uses it

- Tokens become the Tailwind theme (`tailwind.config.js` colours/spacing/radius
  from `tokens.json`) and `tokens.css` is loaded globally; components in
  `src/components/console/` follow `bundle.css` class by class (`kx-panel`,
  `kx-row`, `kx-mon`, …) so the mockup and the app read the same.
- Fonts: Geist, shipped with the app (variable woff2 in `src/assets/fonts/`,
  `@font-face` in `src/fonts.css`, SIL OFL 1.1 in `public/fonts/`), with
  Inter/system fallback; `tnum` everywhere. Nothing is fetched from the
  internet: the console, the output windows and the network screens load
  the same file, so projected lines break in the same places. It is also
  the "Sem serifa" of every theme (`FONT_MAP.sans`).
- Projected screens are not styled by these tokens: they use the church's
  themes and backgrounds (user data) and only the `screen-*` styles.

## What the mockup does not cover yet

Features the current operator pages have and the console must keep, missing
from the canvas and to be designed on the same system before they are built:

- Lyrics editor (lines per slide, auto break) and online search/import.
- Layer reorder by drag (the grip is drawn; the drag is not wired).
- Timeline: resizing planned durations in Ensaio; Planejado/Real lanes exist.
- Escola bíblica, perfis de operador, backup — menu entries only.
