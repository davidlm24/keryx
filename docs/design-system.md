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
