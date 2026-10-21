# KERYX design system

The reference for the operator console's look: the tokens, every component
as it ships, the behaviour rules and the layout. The system's files are in
`docs/design-system/`:

- `README.md` — the principles, the content rules (pt-BR vocabulary), colour,
  type, spacing, states, iconography and motion, in prose. Read it first.
- `tokens.json` — **the one source** of every token (colour, the type styles
  and scale, spacing, radius, shadow, timing, opacity, layers), each with what
  it is for.
- `tokens.css` — **generated** from `tokens.json` by `npm run ds:tokens`
  (`scripts/ds-tokens.cjs`; `--format` also rewrites `tokens.json` in its
  one-token-per-line layout). Never edit it by hand: `npm test` fails when it
  is not what the script writes (`src/lib/designTokens.test.mjs`).
- `components/bundle.css` — the `kx-` components **as they ship**, written
  only with tokens. Each is a section below, in the file's order.
- `surfaces.md` — the three kinds of surface (the operator console, the touch
  Companion, the audience outputs): density, targets, type, permissions and
  critical actions of each.

`src/components/console/console.css` loads right after `bundle.css` and keeps
only the console's layout (where things sit: the dock, the columns, the top
bar's arrangement, the panels' placement) and its app-specific compositions
(a row in Configurações, the Bíblia's cells, the player). A look that more
than one place wears is a component here, not a rule there.

**`CLAUDE.md` wins.** It records the owner's decisions as they are made; this
page describes the look they produce. Where they disagree, `CLAUDE.md` and the
running app are right and this page is stale: fix it. The Claude Design canvas
(https://claude.ai/artifact/TRDHTGjQ2VCHRUWDKjpae5) is a record of the first
design, not the specification (see Histórico).

## Tokens

`console.css` and `bundle.css` write a colour, a font size, a layer and a
duration only as a token. `src/lib/tokens.test.mjs` fails on a hex or rgba
colour, a px font size or a raw z-index in either of them, and on a new
literal in any other component stylesheet (the audience renderer and the
network pages keep their own, pinned value by value, with the reason).

| Group | Tokens |
| --- | --- |
| Grounds and lines | `--bg-0` the console's ground · `--bg-1` modules, THE window · `--bg-2` fields, popovers, hover · `--bg-3` pressed, selected · `--bg-4` pressed inside THE window's panels · `--line` hairlines · `--line-strong` the splitter on hover · `--line-overlay` the ring of what floats · `--line-soft` lines inside what floats. |
| Text | `--fg-1` content · `--fg-2` UI labels, glyphs at rest · `--fg-3` metadata, headers, placeholders. |
| States | `air` red (on air), `prev` green (prepared), `rh` blue (locked), `warn` amber, each as the mark, `-fg` text, `-fill` (+ `-hover`, `-pressed`) and `-tint`; `--on-state`, `--on-warn`. In the slide lists: `--live` (the brand gold), `--live-fg`, `--live-bg` (36 % gold over bg-2), `--prev-bg` (16 % green over bg-2), `--live-bar`, `--next-bar`, `--verse-pressed`. |
| Brand | `--brand` gold (+ `-hover`, `-pressed`, `-tint`) · `--on-brand`. |
| Over a screen | `--screen-bg` · `--screen-fg` · `--chrome-on-screen` (a pill, a badge) · `--chrome-ring` · `--chrome-sep` · `--chrome-hover` · `--chrome-pressed` · `--screen-text` (the projected text's shadow). |
| Type scale | `--fs-meta` 11 · `--fs-ui` 12 · `--fs-content` 13 · `--fs-content-lg` 14 · `--fs-live` 16 · `--fs-clock` 20 · `--fs-count` 28 px. Kept in px: the logo's K, a font specimen, the sync code. Screens size in cqw, off this scale. |
| Heights | `--control-sm` 24 px (a header's controls, a row's hover buttons, the pills' buttons, chips) · `--row` 28 · `--row-comfortable` 32 · `--band` 36 (a band under a header) · `--topbar` 40. |
| Space and radius | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-6` 24 · `--gutter` 8 (6 in the console) · `--bar` 2 px · `--radius-control` 8 · `--radius-panel` 14 · `--radius-round`. |
| Shadows | `--shadow-popover` (small floaters) · `--dialog` (dialogs) · `--shadow-window` (THE window) and the others in `tokens.json` › shadow, each one floater's. |
| Layers, inside a box | `--z-screen` 1 · `--z-mark` 2 · `--z-handle` 3 · `--z-edge` 5 · `--z-guide` 6 · `--z-hatch` 7 · `--z-frame` 8 · `--z-badge` 10 · `--z-drop` 15 · `--z-pill` 20 · `--z-ring` 21. A monitor's screen, a thumbnail, THE window and a splitter are each their own stacking context. |
| Layers, the console | `--z-scrim` 27 · `--z-menubar` 28 · `--z-window-scrim` 29 · `--z-pop` 30 · `--z-window` 40 · `--z-window-over` 41 · `--z-drawer` 42 · `--z-verify` 43 · `--z-library-scrim` 44 · `--z-library` 45 · `--z-dialog` 50 · `--z-confirm-scrim` 51 · `--z-confirm` 52 · `--z-menu` 53 · `--z-menu-top` 54 · `--z-toast` 60 · `--z-drag` 70. A new layer is a name by its role, never a number. |
| Motion | `--duration-fast` 120 ms + `--ease-out` (hover, state) · `--dur-fold` 180 ms + `--ease-fold` (a fold, No ar, a group, a chevron; Dock.jsx reads them). |
| Opacity | `--dim` 0.55 (done, hidden, disabled) · `--hatch` 0.85. |
| Fonts | `--font-sans` / `--font-display`: Geist, then the system font. |

A new token is a line in `tokens.json` with its usage (what it is for, never
when it was decided: the test refuses a date or a round there), then
`npm run ds:tokens`.

## Components

Each section: anatomy, variants, sizes, states, the tokens it uses, do and
don't. The classes are `bundle.css`'s; where the app's elements still carry an
older name beside the kx- one (kept for the smoke and console.css's
compositions), it is given.

### Base and type

- **Anatomy.** `.kx` is the root (the console's `.kx.console`): Geist,
  `fs-ui`, `fg-2` on `bg-0`, tabular numbers. Its reset weighs nothing
  (`:where`), buttons keep the Windows arrow, a keyboard focus is the 2 px
  `brand` ring inset 1 px. `kx-t` adds the 120 ms transition; reduced motion
  removes every one. `kx-i` is a 16 px glyph, `kx-sr` text for a screen
  reader only.
- **Type classes.** `kx-meta` 11/16 `fg-3` (telemetry only) · `kx-section`
  11/16 500 uppercase 0.06em (headers) · `kx-content` 13/18 · `kx-content-lg`
  14/20 · the live steps `kx-live-cap` 12/16 600, `kx-live-title` 16/22 600,
  `kx-next-title` 14/20 500, `kx-alert-title` 13/18 600 · `kx-clock` 20/24,
  `kx-countdown` 28/32 · colour helpers `kx-air`, `kx-prev`, `kx-rh`,
  `kx-warn`, `kx-dim`.
- **Do** keep the console at 11–14 px except the live title and the clocks.
  **Don't** set a name that is on air or prepared in `kx-meta`; don't add a
  global, unprefixed class (`.meta`, `.content`…): there are none.

### Panel

- **Anatomy.** `kx-panel` (bg-1, `radius-panel`) › `kx-panel-h` (the header)
  › `kx-panel-b` (the body, scrolls). `kx-panel-bare` has no card (the
  Programa, the Prévia).
- **Sizes.** The header is `panel-head`, 36 px (`panel-head-compact`, 32, in
  Compacta), one line, its text 12 px from the edge, its last control 12 px
  from the right one, controls 24 px tall and 8 px apart.
- **States.** Folded (`FoldBtn`, see Comportamento › Folds).
- **Tokens.** `bg-1`, `radius-panel`, `panel-head`, `space-3`, `control-sm`.
- **Don't** give one panel an inset of its own, put hints in a header, or let
  a header wrap.

### Button

- **Variants.** Ghost `kx-btn` (28 px, `fg-2`, hover `bg-2`, pressed or
  `is-on` `bg-3`); `kx-btn-icon` (square); `kx-btn-outline` (a `line-strong`
  inset ring: the way back); the fills `kx-btn-prev` (*Enviar ao ar*),
  `kx-btn-rh` (*Destravar*), `kx-btn-air` (*Encerrar*, *Excluir*) and the gold
  `kx-btn-brand` (Salvar, Novo culto, Importar).
- **States.** A fill steps **darker** on hover and pressed so white stays
  above 4.5:1; disabled goes neutral (`bg-3`, `fg-3`) and never lights; on a
  fill the focus ring is `fg-1`, 2 px outside.
- **Sizes.** 28 px; 24 px in a row, a header, a banner or a pill (the WCAG
  2.2 target; the glyph stays 16 px).
- **Don't** use gold for anything live (*Enviar ao ar*, a lock, a warning),
  or print a shortcut on a button: it lives in the tooltip.

### Segmented switch

- **Anatomy.** `kx-seg` (a `bg-2` track, 2 px padding) of buttons; the chosen
  one `is-on`: `bg-3`, `fg-1`, 500 — no ring, as every pressed button (a
  Windows contrast theme keeps its `Highlight` ring).
- **Variants.** `is-small` (24 px segments; in a header or a menu heading the
  track goes and the segments fill the 24 px); `kx-seg-mode` (state fills).
- **Do** use it for 2–5 exclusive choices. **Don't** use it for on / off: that
  is a switch.

### Switch

- **Class.** `kx-switch` (old name `.sw2`), a real button with
  `role="switch"` and `aria-checked`: `SwitchRow`, the Saídas rows, *Avançar
  sozinho*, *Abrir ao iniciar*, the aviso's sound.
- **Sizes.** 32 × 20, a 14 px knob.
- **States.** Off: a `bg-3` track, `fg-2` knob. **On: an `fg-1` track with a
  `bg-0` knob** — never the Prévia's green, so *ligado* never reads as
  *preparado*. Hover lights the knob; on, the track dims to `fg-2`. Disabled
  `dim`. Contrast theme: `ButtonText` track and knob, `Highlight` when on.
- **Tokens.** `bg-3`, `fg-1`, `fg-2`, `bg-0`, `radius-round`, `duration-fast`,
  `dim`.

### Check

- **Class.** `kx-check` in a `kx-checks` row (old name `.cfg-kinds`): a 24 px
  chip with `role="checkbox"` and the check glyph (Ajustes › Conteúdo, "O que
  esta tela recebe").
- **States.** Off: `bg-2`, `fg-3`, no mark. On: `bg-3`, `fg-1`, the mark and
  a `line-strong` ring. Hover `bg-3`. Contrast theme: a `ButtonText` edge off,
  the chosen ring on.
- **Do** use it for a set of independent kinds shown as chips. A plain native
  checkbox stays only where a dialog asks one question (Relatar um problema).

### Field

- **Variants.** `kx-input` (text, number, date, textarea), `kx-select`,
  `kx-field` (an input with a glyph: the `Field` component) and `kx-num`
  (`NumBox`: `− [4,8] + %`).
- **Sizes.** 28 px; 24 px with `is-small` (Configurações' selects, inline
  renames). `kx-num` is 24 px with 24 × 24 steppers out of the Tab order (the
  field takes ↑/↓, Shift ×10), the unit in `fg-3`, a comma as the decimal.
- **States.** `bg-2`; a `line` ring on hover; focus is a **quiet 1 px `fg-3`
  outline**, never the gold ring while typing; disabled `dim`;
  `[aria-invalid="true"]` draws it in `warn`.
- **Do** give a new field `kx-input` / `kx-select`. The console's older field
  classes (`pl-input`, `ed-text`, `cfg-select`…) wear the same look from one
  `:where()` block in console.css. **Don't** name a field by its placeholder:
  a visible label names it. A slider stays only for what is felt (opacity).

### Row

- **Anatomy.** `kx-row` › `kx-glyph` · `kx-row-main` (`kx-row-title`, one
  `kx-row-meta` line) · `kx-row-time` · `kx-row-acts` (hover buttons).
  `kx-row-1` is a one-line row.
- **The card.** Every row (and `kx-layer`) is an **inset rounded card**: 4 px
  in from its column (`space-1`), `radius-control`, 2 px from the next, so a
  hover or a state fills a card, never the column edge to edge; the inset
  comes off the left padding, so the text keeps its place.
- **Sizes.** 28 px; 32 px in Confortável (`row-comfortable`), 14 px titles
  up to two lines — one line ending in "…" when the row has hover buttons.
- **States.** A 2 px bar on the left edge in the state's colour plus its 10 %
  tint (`is-air`, `is-prev`, `is-rh`, `is-warn`); the title takes the state's
  text colour; `is-selected` `bg-3`; hover `bg-2`; pressed `bg-3`; done
  (`is-done`) dims only the glyph and steps the title to `fg-3`.
- **Hover actions** never cover the middle of the row (a click there
  prepares): glyphs only, the word kept as screen-reader text (`kx-act-l`),
  24 px each.
- **Don't** override the inset per list; edge to edge is only the Slides
  column and No ar (the slide, below).

### Tabs

- **Anatomy.** `kx-tabs` (28 px, a `line` rule under it) of buttons; the
  chosen one `fg-1` with a 1 px `fg-1` underline.
- **Do** let a row that does not fit break into a second line (console.css
  `.tabrow`); keys are `onTabsKey` + `tabStop` (roving tabindex).

### Group

- **Class.** `kx-group` (old name `.cfg-group`; `CfgGroup` in
  `settings/parts.jsx`): an area of Configurações or an editor that opens and
  closes.
- **Anatomy.** `kx-group-h` (an h3, 28 px) › `kx-group-t` (the button: the
  12 px `kx-group-chev` and the title, 13 px, `fg-1`, 600, in sentence case) ·
  `kx-group-s`
  (the one-line summary of what is chosen, only while closed) ·
  `kx-group-acts` (actions, right); `kx-group-b` › `kx-group-in` (the body).
- **Variants.** Folding (the chevron down when open, −90° closed) or static
  (`fold={false}`, `.is-static`: a page's first area, no chevron, its title
  where the fields start). The rare ones start closed. A static group that is
  the first thing under a panel's title (Culto › Dados, Música › Dados, a
  section of Configurações) shows no title of its own: the panel's says it
  (console.css; screen readers and the settings search still have it).
- **States.** The body folds to `0fr` in the fold's time and stays mounted
  and inert; `.is-instant` (a search jump) and reduced motion do not ease.
  Hover `bg-3` on the header; the focus ring inside it.
- **Spacing.** 12 px between groups with a `line-soft` hairline.
- **Do** put what is chosen in the summary. **Don't** put it in a header
  hint, or colour a title gold.

### Monitor

- **Anatomy.** `kx-mon` › `kx-mon-cap` (an optional caption line) ·
  `kx-mon-screen` (16:9, `screen-bg`, `radius-control`, a 1 px frame; it is
  the output's picture and opts out of contrast themes). `kx-mon-badge` is a
  caption inside the screen, top-left (the Prévia's "Prévia · nome · 2/6").
- **States.** The frame in `air`, `prev`, `rh` or `warn`; the Programa has
  **no frame while simply on air** (only locked or failing). The hatch
  (`kx-screen-hatch`) is a file missing, coming or a PDF preparing;
  `kx-screen-empty` nothing at all.
- **Don't** let console tokens or styles into what the screen draws.

### Pill

- **Class.** `kx-pill` (old name `.prog-pill`): a monitor's caption and
  controls inside its screen, bottom-right, over the frame and the labels.
  The Programa, the Prévia (*Enviar ao ar*) and the Bíblia's No ar wear it.
- **Anatomy.** `kx-pill-dot` (the state: grey idle, `is-air` red with a
  halo, `is-prev` green, `is-rh` blue, `is-warn` amber) · the caption
  (`kx-prog-cap`: `kx-pill-title`, fg-1 600 ending in "…"; the position and
  "2 telas" in `kx-meta`) · `kx-pill-sep` · `kx-pill-btns` (round 24 px
  glyph buttons, `chrome-hover` / `chrome-pressed`) · `kx-pill-end`
  (*Encerrar*, apart after its separator, in `air-fg`).
- **Sizes.** 32 px tall, `radius-round`, `chrome-on-screen` with a
  `chrome-ring`.
- **Behaviour** (console.css). It folds once as the screen narrows: at
  560 px "2 telas" goes, at 480 px the buttons go into "…" (the Programa's
  menu); over the Multiview it is always folded.
- **Don't** add the word "Programa", or a title the player already shows.

### Status and outputs

- `kx-status`: the top bar's Saídas status (*2 telas*), a `prev` dot, amber
  (`is-warn`) or blue (`is-rh`); a green dot never sits beside zero.
- `kx-out`: one output in the Saídas popover (glyph, name and meta, its
  state in words: *Conectada*, *Reconectando…*, *Desconectada às 19:42*,
  *Fechada*), with a switch per local output (`has-sw`, console.css).

### Banner

- `kx-banner`: one 28 px line across the grid, tinted, a 2 px top rule in the
  state's colour: blue `TELAS TRAVADAS — nada novo vai às telas` with
  *Destravar*, amber for an output that failed (its title in
  `kx-alert-title`, the detail `kx-sub`, the ways out as 24 px buttons).
  Output banners never stack: one, "e mais N".

### Popover, menu, tooltip

- `kx-pop` (bg-2, `radius-panel`, `shadow-popover`: the `line-overlay` ring;
  menus a deeper shadow) › `kx-menu-item` (28 px; its glyph `fg-2`, the
  shortcut `kx-kbd` from `keyHint`, never typed), `kx-menu-sep`
  (`line-soft`), `kx-menu-h` (a 24 px heading). `kx-tip` is a tooltip.
- **Do** build every menu with `MenuList` (Menu.jsx) and the shared actions
  with `menuItem` (`menuLabels.js`). **Don't** put `line-strong` on anything
  that floats.

### Toast

- **Class.** `kx-toast` (old name `.toast`; `Toast.jsx`): one 28 px line over
  the bottom of the console, `bg-3`, `shadow-popover`.
- **Anatomy.** `kx-toast-t` (the text, ending in "…") · `kx-toast-act` (an
  action, a 24 px target: *Desfazer* after Esc, its key in the tooltip).
- **States.** Its time stands still under the pointer or the focus; a plain
  toast waits behind *Desfazer* (`toastQueue.js`). Said by the one polite
  live region, never by a `role="status"` that mounts with its text.

### Window

- **Class.** `kx-win` (old names `.win-dialog`, `.win-bar`, …): **THE
  window**, the one floating frame over the live console whose pages are
  Configurações, the editors and the views (`nav.js`).
- **Anatomy.** One surface of `bg-1`: `kx-win-bar` (40 px, the page's colour,
  parted from it only by a `line-soft` rule): *← Voltar* from the second level
  (`kx-btn-back`, outlined) when the page has no side menu, `kx-win-title`
  (gives way first; its context in `fg-3`, normal case), `kx-win-gap` (a
  double click restores the size), the window's actions — Desfazer/Refazer,
  Cancelar, Salvar —, ⧉ *Destacar em janela*, the (x) *Fechar · Esc*. Then
  `kx-win-page`, one per level (pages under the top stay mounted, hidden),
  its panels starting right under the rule and one grey step up (`bg-2`,
  fields `bg-3`, pressed `bg-4`; `.win-body` in console.css). A side menu
  (Configurações' sections, the Editor da tela's Telas) is fixed, no
  splitter, and starts with *← Voltar* (`WinBack`, `WinBar menuBack`); only
  the content beside it resizes. `kx-win-edge` × 8 resize the window.
- **Variants.** Padrão and `is-editor` (the frame eases between them);
  `is-sized` (stretched: it follows the pointer at once); `is-detached`
  (`/Janela`: it fills its own window, no shadow, no edges).
- **Sizes.** At most 1240 × 800 (Editor 1360 × 860), at least 760 × 480,
  never past the console.
- **Tokens.** `bg-1` (`bg-2`…`bg-4` for its panels), `radius-panel`,
  `shadow-window`, `line-soft`, `z-window`, `z-edge`, `ease-out`.
- **Don't** open a second floating window: a page pushes a level in this one.
  **Don't** put a control that acts on the content in the bar (a search, a
  filter, Excluir…, Imprimir, a select of what to edit): it goes in the page,
  in the header of the panel it acts on, at the top of the page or of its
  side menu (`tools` stays for what has no place there).

### Splitter

- `kx-split` (and `kx-split-h`): the 6 px gutter in the layout, answering the
  pointer over 12 px, a dotted grip on hover and keyboard focus (gold dots on
  focus); ←/→ resize in 16 px steps, a double click restores. `kx-gap` is a
  gutter that cannot be resized. **The splitter is the gap**: never a second
  gap beside it.

### Slide

- **Anatomy.** `kx-slide` › `kx-slide-n` (the number) · `kx-slide-body`
  (`kx-slide-lab`, the part's name; `kx-ln`, one line each). `.onair-card`
  is the same slide in the No ar module; a presentation's page is
  `kx-slide-body.is-page` with its 128 px picture (`kx-slide-page`).
- **The row.** Edge to edge, a 1 px `line` separator, no card; 14/20 in
  Confortável, tighter in Compacta. A line too long ends in "…" (the whole
  text is the tooltip and the Prévia).
- **States.** The background plus a bar on the left edge: **on air the gold**
  (`--live-bg` and the 3 px `--live-bar`; the rest of the console keeps
  `air` red for "no ar"); **the Prévia** the dark green wash (`--prev-bg`;
  1.56:1 in lightness against the gold, `stateColors.test.mjs` holds ≥ 1.4
  and ΔE ≥ 20 for protans and deutans); **the next slide** the 2 px `fg-3`
  `--next-bar` and an `fg-1` number; on air and in the Prévia at once, the
  Prévia's wash, the gold bar and the number on a `live` chip. Labels and
  numbers pass AA: `fg-2` on the Prévia's wash, `fg-1` on the gold one. A row
  with a background drops its separator. The keys land the highlight at once;
  only the pointer's hover eases.
- **Contrast theme.** The bars are box-shadows and vanish: on air fills with
  `Highlight`, the Prévia a dashed `LinkText` ring, next a dotted ring.
- **Don't** card a slide, or tell on air from the Prévia by hue alone.

### Layer

- `kx-layer` (Camadas): a 26 px card (the row's inset) of eye, padlock and
  name in a grid; `is-selected` `bg-3`, `is-hidden` the name in `fg-3`, its
  buttons 24 × 24, an off one `dim`. The pencil (console.css) shows on hover.

### Transport and meters

- `kx-transport` (seek, time) and `kx-meter` (3 px bars, `prev`, `warn` from
  −3 dBFS). The console's player is console.css's composition of these.

### Verse and book

- `kx-verse` (Ler, Buscar): a **card**, `bg-2`, `radius-control`, 4 px apart
  (prose reads better in a box), the number right-aligned in 24 px, the text
  wrapping. Its states are the slide's (the Prévia's wash; the gold wash and
  bar on air; the number on a gold chip when both); hover `bg-3`, pressed
  `--verse-pressed`; a note is a mark in its corner (`has-note`).
- `kx-book`: a Bíblia cell, 36 px, `bg-2`, a 2 px bar in its group's colour
  (`--group`), `is-selected` with a `line-strong` outline.

### Empty state, mark, alert, tools, route

- `kx-empty`: a glyph, a `fg-2` line and a `fg-3` line, centred.
- `kx-mark`: the 16 px gold KERYX mark (its K is a kept px size).
- `kx-alert`: the *Aviso rápido* while it shows — a warn bar, warn tint, its
  time and *Tirar*; `kx-screen-alert` its bar on a monitor.
- `kx-tools` / `kx-tool`: ghost buttons in a 2 × 2 grid (Relógio,
  Cronômetro, Timer, Texto livre); `kx-screen-tool` the figure on a screen.
- `kx-route`: a ghost button showing a value that opens a small menu.

### Contrast themes

One `@media (forced-colors: active)` block at the end of `bundle.css` (the
components) and one at the end of `console.css` (the console's own lists, at
its weight) give the states and the controls drawn as fills or shadows cues in
system colours only: on air `Highlight` filling the row with `HighlightText`;
the Prévia a 2 px dashed `LinkText` ring; next a dotted ring; chosen, pressed
or open a 2 px `Highlight` ring; switches, checks, fields and filled buttons
`ButtonText` / `FieldText` edges; what floats a 1 px `CanvasText` edge. A ring
never hides the keyboard's focus ring and the normal look never changes. What
the congregation sees opts out (`forced-color-adjust: none`: the monitors,
the stills, every output). A new state drawn as a background gets its line
there (`src/lib/forcedColors.test.mjs`).

## Comportamento

### Prepare, then send

The console is one screen, always live: no steps and no sandbox. **A click
prepares** a song, slide, verse, aviso or Setlist row in the Prévia (green).
It reaches the screens by one of:

| Act | Where |
| --- | --- |
| **Double click** on the item | Biblioteca, Setlist, slides, verses, search results, Escola bíblica materials, Mídia, the Prévia's screen |
| **Enter** | with nothing focused (or the monitors focused): sends the Prévia / the Bíblia's selection |
| **Ctrl+Enter** | from anywhere except a text field |
| **Enviar ao ar** | the Prévia's pill, the Bíblia, the Escola bíblica, the Mídia (and the Setlist's *Ir*). The keys live in one tooltip, never printed: "Enviar ao ar · Enter (Ctrl+Enter de qualquer lugar)" (`SEND_TIP`) |
| **Drag onto the Programa** | from the Biblioteca (onto the Prévia it prepares; onto the Setlist it adds) |

A click never leaves focus on the control it hit, so the next key works on
the console. Typing never sends: in a text field every key is typing, and Esc
first leaves the field. A control focused with Tab keeps its own Enter and
Space.

**What acts at once.** Tela preta and Mostrar logo, locked or not; the *Aviso
rápido* (`alert.show`); Camadas' edits. Every other tool (Relógio,
Cronômetro, Timer, Texto livre) is prepared in the Prévia like any item.

**Travar telas** is the live state's `locked` flag, set from the Saídas
popover and enforced in the main process (`applyOp`), so outputs, network
screens and the controle remoto obey it too: *nothing new goes onto the
screens; anything can come off*. While locked the Programa's pill and frame
are blue (`rh`, "Travado"), a send gives one toast, and the blue banner says
`TELAS TRAVADAS` with *Destravar*. A restart comes back unlocked. Rehearsing
is locking: there is no Ensaio.

### Keys

`src/lib/console/keys.js`, tested: ←/→ move the slide or verse on air (and
step an activity's reveal first); ↑/↓ move the selection; PageUp/PageDown walk
a presentation (a clicker); Space plays or pauses; **B** Tela preta, **L**
Mostrar logo, **C** Limpar texto, **/** searches, **?** lists the keys (as the
church's *Teclas de uma letra* say). **Esc** closes the topmost thing open,
one per press (`escapeTarget`: a right-click menu, the background library, a
popover, one level of THE window, the Camadas drawer) and with nothing open
ends at once, fading out as Transições says, the music included; its toast
offers **Desfazer** (also Ctrl+Z), which puts back what was on air and the
music at the second it stopped. *Encerrar* asks first. In the Bíblia a letter
or digit opens the quick jump. A splitter or the seek bar focused with Tab
keeps the arrows, so resizing or seeking never moves what is on air. A
focused select is a control, never text: it keeps ↑/↓, PageUp/PageDown, Space
and its type-ahead.

**Transições** (Configurações › Telas e saídas): *Ao pausar o som* (Corte ·
0,2 s · 0,4 s), *Ao tirar do ar* (Corte | Suave, 0,3 · 0,6 · 1 s), *Ao entrar
ou trocar* (Corte | Suave, 0,3 · 0,5 · 1 s, Suave 0,5 s by default, with *Por
tipo de conteúdo* folded under it: the kinds of `src/lib/contentKinds.js`),
*Entre áudios e vídeos* (Corte | Suave | Tocar junto) and *Tela preta e Logo*.

### Menus, right click and questions

- **Menus**: one component, `MenuList` (Menu.jsx): it takes the focus when it
  opens, ↑/↓ walk it round the ends, Home/End jump, → opens a submenu and ←
  leaves it, Enter/Space choose, Esc and Tab close. The focus goes back to
  the opener only after a keyboard open. The menu bar answers **F10** or
  **Alt** alone and **Alt + C/M/D/F/A**. One name, one icon, one key per
  action in every menu (`MENU_LABELS`).
- **Right click** (`ContextMenu.jsx`): songs, media, avisos, Setlist items,
  slides, verses, themes, backgrounds, the monitors and the layers have a
  menu at the pointer. It never prepares or sends by itself; anything that
  changes what is on air is last, after a separator (`orderItems`).
- **Questions**: anything that deletes or discards asks through
  `useConfirm()`, the action then **Cancelar** on the right (Windows order).
  A question that cannot be taken back (*Excluir*, *Descartar*, any `danger`
  action) **opens on Cancelar** (`focusesCancel`), so Enter answers no; the
  others open on the action; *Encerrar* keeps its action focused (it has
  Desfazer). Esc answers no first.
- **The command palette** (`/`): Enter prepares, Shift+Enter adds to the
  Setlist, never sends. A reference ("Jo 3:16", "jo 3 16") goes to the Prévia
  as its whole chapter.

### Focus, cursor, screen readers

- **Focus**: the 2 px `brand` ring for controls reached with the keyboard;
  `fg-1` over gold (a row on the gold wash, the gold button); a field holding
  the caret has only its quiet `fg-3` line. Behind THE window the console is
  `inert`; Tab stays in the window or dialog on top (`useDialogFocus`).
- **Cursor**: buttons keep the Windows arrow; the hand is for links; fields
  the text cursor; splitters and edges their resize cursors.
- **Screen readers**: a state drawn as a background is also `aria-current`
  plus words in a `kx-sr` span ("no ar", "na prévia"). A `Row` with actions
  is a `listitem` with sibling buttons named by their target. `Panel` is a
  region titled by a level-2 heading; the dock is the page's `<main>`. Toasts
  and what goes on air are said by one polite region (`useLiveRegion`).

### Density, folds and dragging

- **Density** (Ver › Densidade, per computer): **Automática** by default —
  Compacta when the grid is under 820 px tall, else Confortável.
  **Confortável**: 32 px rows, 14 px titles up to two lines, 36 px headers.
  **Compacta**: 28 px single lines, 32 px headers (`panelHead`). Controls do
  not change.
- **Folds**: every panel but the Programa, the Prévia, the player and the
  Bíblia's panels has a chevron right of its header's + (`FoldBtn`). Down a
  column a folded panel is its header; across a row a 28 px strip with its
  name standing (`writing-mode: vertical-rl`), a button that opens it. A
  split keeps one panel open (the last chevron is inert, "Um painel da coluna
  fica sempre aberto"). A fold takes `--dur-fold`; none with reduced motion.
- **Dragging in a list** (`useSortable` + `dragGhost.js`): the pointer
  carries a card the row's size (`bg-3`, its icon in `brand`, lifted); a gold
  slot lights where it lands (`brand` 16 % over `bg-1`, a 60 % inset line);
  the rows around glide 180 ms and the card settles into the slot. Reduced
  motion: the same states, no animation.
- **Everything that floats has one soft edge**: THE window, the dialogs, the
  palette, the background library, every menu and popover, tooltips, toasts
  and the dragged card are ringed in `line-overlay`; the lines inside them
  are `line-soft`. Rings that mean a state keep their colours.

### Live information

- The service clock counts from the service's date and time, never a default
  hour (`◷ 19:00 · 9h46`, `Culto 0:42:10`), the sentence in its tooltip.
- Output health (`outputs.js`) decides the Saídas status, the popover's rows,
  the pill's "2 telas" and the banner; a screen that left stays
  *Desconectada* or *Fechada* until it returns or the operator says
  *Esquecer*.
- **Bible editions**: the edition chosen is the one used; read from the
  internet when it is not installed, an installed one standing in, said so.
  An amber dot on Livros' select marks an edition from the internet, missing
  or the preview's samples.

## Layout

**The top bar** (40 px, on `bg-0`, no panel), one line at every width. Left:
the logo (its menu is the app's: Configurações, Saídas, Sobre o KERYX,
Atualizar agora when due), then **KERYX | BÍBLIA** (bold caps, a gold
underline on the one on screen — places, not commands), a divider, the menu
bar (Culto, Música, Mídia, Ferramentas, Ajuda; `menuBar.js`). Under 1240 px a
**☰ Menu** button replaces the bar, its popover the bar's menus stacked
(`flattenMenus`). Right, compact: the search (≤ 320 px), the service clock,
the clock, the Saídas status, **Ver** (the `panels` glyph) and the bell. The
screen actions live in the Programa's pill; a new top-level action goes in
the menu bar's model, never as another icon.

**Each environment is a dock** (`dock.js`, tested; `Dock.jsx`): splits and
tab groups the operator arranges in **Ver › Editar disposição** (drag a
module by its name to a side or the middle of another, "Mover para…", × to
the tray; every splitter shows its %, Tamanhos: Livre | Por %), with named
arrangements per environment. Never place a column by hand: a new module is
an entry in `MODULES` and in `modulePanels`.

**The culto's default dock** by width tier (one arrangement kept per tier):
- **Wide** (≥ 1400 px): Biblioteca | Slides | the centre — the Programa with
  the player under it, then the Prévia (44 %) and the Painel (Notas, Aviso
  rápido, Timers, Ferramentas, Esteve no ar) — | Camadas, Temas, Setlist;
  No ar along the bottom beside the Setlist's column.
- **Medium** (≥ 1100 px): no right column; Camadas a drawer from the pill,
  the Setlist beside the Prévia, No ar in the tray.
- **Narrow**: also the Biblioteca over the Slides.

The Programa, the Prévia and the Setlist never go to the tray. The Slides
column is at least 300 px, the Biblioteca 260. **One gutter: 6 px**
(`.console` sets `--gutter`): the splitter is the gap, here and in the pages
of THE window (`.win-body`).

**The Programa** has no card and no header: its pill (above) is its caption
and controls. **The Prévia** has no card either: its badge top-left, its pill
(*Enviar ao ar*, "Usar o tema" for a theme's example) bottom-right, the "não
vai mostrar" lines stacked above the pill.

**The player** sits under the Programa, always visible, dimmed while idle
(its icon only), in two rows (the slot is 72 px, so starting a video never
moves the monitors): what plays (icon, title up to `min(28cqw, 260px)`, n/m,
times, the seek bar that drags and previews the moment under the pointer)
and the controls (⏮ −10 ⏯ +10 ⏭, the eye, Parar, the layer switch, the letra
automática, the volume and the meters). Only "Projetor fechado" shows where
the sound goes, as an amber status chip.

**Slides and No ar.** The Slides column is the item in hand (the Prévia's
slides, else what is on air). **No ar** is always what is on air, one row of
cards while low or a list in a column, and exists only while lyrics are on
air; otherwise it folds away. With No ar off screen the Slides column has two
tabs, No ar · Prévia.

**Multiview** splits the Programa's 16:9 into four outputs, 2 px `line`
between them, each labelled bottom-left like a broadcast multiviewer.

**Camadas** edits no look: the layers first (eye, padlock, pencil), the
settings folded until a pencil opens them; its + has two items (Sobreposição
de texto, Logo da igreja). **Temas** is its 9 slots of themes as small
screens. Both are as tall as what they hold.

**The Bíblia** is the second environment, a dock of its own (Livros,
Capítulos, Versículos, Texto, No ar): Livros' header holds the version, Abrev
| Nomes, the install + and a view menu; Texto's header the chapter, two icons
and Ler | Comparar, a 36 px band of Recentes, Favoritos and Anotações under
it; No ar has no header, its screen and the pill's screen actions.

**THE window** (the Window component): its pages navigate in place; Esc, the
Voltar chip or the scrim pop one level, the (x) closes the stack; ⧉ moves a
page to `/Janela`. While it is open the Programa draws one still frame (the
air never pauses).

## Outputs and screens on the network

The outputs are Projeção, Letras, Vídeo, **Avisos**, Palco, Tela do pastor and
Transmissão (`surfaces.md` › Saída de audiência). They render the live state
with `ScreenRenderer`; no output advances on a click. **Each screen owns its
design** (`OutputPref.design`), edited in the Editor de telas on a canvas the
renderer draws, with that screen's settings beside it; every screen is
landscape (16:9).

**Screens on the network** (`src/components/network/net.css`): `bg-0`
ground, Geist, sized in container units so a phone, an upright tablet and a
4K TV get the same layout in proportion. Palco: title, Tom / BPM / time
chips, the slide large, the cifra, the next slide. Tela do pastor: the
projected image, the clock, the service's time and the next items. The start
page groups the screens (Público, Palco, Transmissão). Connection is said
once (`NetStatus`): a full screen while it has never connected, then an
amber chip over the last image while it reconnects.

**The Aviso rápido** is one bar on every screen, in each screen's look
(`AlertBar`): an amber band across the top by default (the Palco's at the
bottom); each output picks its position, style, colours, size and entrance.

## What the canvas does not cover

Views the app has and the canvas never drew; they follow this system but were
designed in the app: THE window and its pages, the background library, the
dock and Editar disposição, the Temas panel, the player's two rows, the
Bíblia's dock, the pills, the groups, the switch and the check.

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
  Camadas** moved out on 2026-10-14: Camadas edits no look.
- **2026-10-12 — Editar layout**: columns and stacked cards moved by grips
  (`layout.order`/`layout.stacks`, `arrange.js`, now only read to build a
  first dock). The free dock and Editar disposição replaced it on 2026-10-13.
- **2026-10-12 — Layouts das telas**: designs as a catalogue assigned to
  screens (*Usar em…*). Since 2026-10-13 each screen owns its design.
- **2026-10-13/14 — slides and verses as cards** with a 2 px side bar, then
  as cards without it; rows since the small-screen review of 2026-10-14
  (verses cards again the same day). **List rows became inset rounded cards**
  (owner 2026-10-14); the old square, edge-to-edge row and the red on-air
  slide went from `bundle.css` in Rodada DS3.
- **2026-10-14 — the floating dialogs' shadow** (`dialog`, owner); its ring
  softened in Rodada N4.
- **Until 2026-10-14 — Configurações › Aparência** held the church's slide
  transition and the backgrounds; it is gone. **The full-screen views** had a
  *Console* back button; THE window and its WinBar replaced them (Rodada C,
  2026-10-14: "uma janela, com Voltar"); edges and corners in Rodada D3,
  Destacar em janela in Rodada F5.
- **2026-10-16** (owner): buttons keep the Windows arrow; a field's focus is
  the quiet `fg-3` line; folds take 180 ms (Rodada F4); every panel folds;
  the contrast-theme blocks (audit C-05); questions that cannot be taken back
  open on Cancelar (audit C-10); the Programa lost its header for the pill
  (Rodada E1); dragging in a list carries a card (Rodada E2).
- **2026-10-19 — Rodada H0/H1/H2/H4**: the groups that open and close
  (`CfgGroup`; the title at 600, grey, never gold), every Configurações
  section regrouped, the Editor da tela's five blocks, the window's other
  pages. **Rodada G1**: hover buttons are glyphs only; a row with them is one
  line. **Rodada HI**: Lucide replaced the hand-drawn icon set (`bundle.js`,
  removed in Rodada DS3). **Rodada HF2/HF3**: `NumBox`; the Editor de temas in
  groups.
- **2026-10-20 — Rodada N4** ("Suave"): one soft ring on everything that
  floats (`line-overlay`, `line-soft`); `line-strong` had glowed on the dark
  ground. **Rodada N5**: the Prévia's pill with *Enviar ao ar*.
- **2026-10-20 — Rodada DS1** ("mix do A com D"): on air and Prévia in the
  lists had differed by hue alone (gold 24 % and green 24 %, 1.06:1 in
  lightness, one colour to a protanope); the gold went to 36 % with a 3 px
  bar, the green to 16 %, the next slide got its grey bar; the switch went
  neutral (it was the Prévia's green, so *ligado* read as *preparado*);
  Encerrar stands apart in the pill; the keyboard's ring over gold is light.
- **2026-10-20 — Rodada DS2** (`d6_escala` = "sete"): the type scale of seven
  sizes (the old 9, 10 and 10.5 px went to 11, 11.5 to 12, 12.5 to 13) and the
  named layers replaced 13 hand-typed sizes and 29 z-index numbers.
- **2026-10-20 — Rodada DS3** (`d7_fonte` = "sim", nothing changes on
  screen): `tokens.json` became the one source (`npm run ds:tokens`), the
  window, toast, switch, check, pill and group moved from `console.css` into
  `bundle.css` as kx- components, the shipped slides, verses and rows replaced
  the stale ones, the literal lint, this page as a reference and
  `surfaces.md`. Until then `tokens.json`, `tokens.css` and `bundle.css` were
  kept in step by hand and `console.css` was what shipped.
- **2026-10-21 — Rodada O** (the owner's review of the preview; marks O5 = A,
  O6 = A, O7 = A, O10 = C): panel headers went from 32 (28) to 36 (32) px,
  `panel-head`; the pressed segment lost its `fg-3` ring (it read as white);
  THE window became one `bg-1` surface with a deeper `shadow-window` (its bar
  had been a `bg-0` strip over the page), its content controls moved into the
  pages, its side menus stopped resizing and took Voltar at their top; group
  titles went from 11 px grey caps to 13 px `fg-1`, and the first static
  group under a panel's title stopped repeating it.
