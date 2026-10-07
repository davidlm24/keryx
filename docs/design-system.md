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

After Codex's review the console became three steps of the same service,
switched in the top bar. **The app departs from artboards 8–12 (user, 2026-10-07):**
Apresentar is the full modular console of artboards 1–7 (every module on
screen, resizable), not the slim Programa/strip layout below; the canvas
keeps that layout as a record. The top bar is a menu bar: the KERYX mark
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
- Fonts: Geist (Google Fonts) with Inter/system fallback; `tnum` everywhere.
- Projected screens are not styled by these tokens: they use the church's
  themes and backgrounds (user data) and only the `screen-*` styles.

## What the mockup does not cover yet

Features the current operator pages have and the console must keep, missing
from the canvas and to be designed on the same system before they are built:

- Lyrics editor (lines per slide, auto break) and online search/import.
- Layer reorder by drag (the grip is drawn; the drag is not wired).
- Timeline: resizing planned durations in Ensaio; Planejado/Real lanes exist.
- Escola bíblica, perfis de operador, backup — menu entries only.
