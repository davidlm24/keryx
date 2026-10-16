# PASS 4 — Design system consistency (SYS)

Skill: `design:design-system` in audit mode (its audit template, adapted to
the pass's six checks). Read-only: no code changed. Evidence is file:line on
`audit/design-0219` (0866cb4); runtime checks in the side-panel preview
(`npm run dev`, 1366×768); counts come from a scan of every `.css` and `.jsx`
under `src/` (skipping `src/components/ui/`) plus
`docs/design-system/components/bundle.css`. Screenshot: `audit/screens/4-camadas-drawer-no-edge.jpg`.

## Summary

**Components reviewed:** 14 (Panel, Btn/IconBtn and the `kx-btn-*` kinds,
Seg, Field and the five other field classes, the selects, MenuItem and the
five menus, Row/`kx-row`, `kx-layer`, `kx-slide`/`kx-verse`, tabs, Monitor,
Split, dialogs, chips) · **Findings:** 18 (1 Blocker, 6 Major, 11 Minor) ·
**Score:** 62/100. Colour discipline is strong. The weak spots are the
token layer (one collision, tokens living outside the token files), type
and spacing written by hand, and controls that grew one family per page.

### 1. Hardcoded values (raw literals instead of tokens)

| Category | Raw declarations | For comparison | Most common raw values |
|---|---|---|---|
| Colours | 66 (62 CSS, 4 JSX) | console.css: 499 token uses vs 23 raw (96 % tokenised) | `#000` ×14 (= `--screen-bg`), `#0d0d0ccc`/`d9`/`99` ×10 (bg-0 scrims, no scrim token), `#fff` ×5 |
| Spacing (padding/margin/gap) | 302 with raw px (296 CSS, 6 JSX) | console.css: 323 token-only, 199 raw-only, 20 mixed (≈60 % tokenised) | 6px ×71, 3px ×19, 5px ×19, 10px ×15, 14px ×14 |
| Radii | 73 | console.css: 105 token vs 58 raw | `999px` ×19 (= `--radius-round`), 4px ×12, 1px ×9, 3px ×7, 2px ×5 |
| Font sizes | 252 | there are no size tokens at all (type exists only as classes) | 11px ×82, 12px ×68, 13px ×31, 10px ×17, 14px ×17 |
| Shadows | 130 | 90 are 1 px rings built from colour tokens (fine); 17 are elevation shadows with literal colours | `0 12px 32px #000000a6`, `0 14px 30px #000000a0`, `0 6px 16px #00000059` |
| z-index | 71 | 38 distinct values, no scale | 1 ×10, 2 ×6, 40 ×5, 45 ×4, then 25–1000 |
| Durations | 33 | `--duration-fast` exists; 120 ms is still written out 8 times | `.35s` ×8 (outputs), 180ms ×6, 120ms/.12s ×8, 1.2s ×4 |

Worst 5 files (raw declarations, all categories): `src/components/console/console.css` 625 ·
`src/components/network/net.css` 118 · `docs/design-system/components/bundle.css` 102 ·
`src/components/screen/screen.css` 36 · `src/components/screen/activity.css` 15.
The JSX is nearly clean (the most is `StreamBand.jsx` with 4). Its 200 `style={{…}}`
blocks are mostly `flex: 1` spacers, plus the size variants in `kx.jsx` (SYS-05, SYS-09).
`screen.css`, `activity.css` and `net.css` style outputs and network screens, which
by design do not use console tokens. They count here, but they are not the debt.

### 2. Token coverage
- Every one of the 55 tokens in `tokens.css` is defined and used. No `var(--x)` anywhere
  in `src/` lacks a definition. `tokens.json` and `tokens.css` match value for value.
- **One collision:** `--popover` (a shadow in `tokens.css:36`) is redefined by the
  shadcn theme (`src/index.css:83`, `:122`, an HSL triplet), and that one wins (SYS-01).
  `--font-display` is defined in both too (harmless: the second drops the Inter fallback).
- Defined but unused: none of the design-system tokens. The 32 shadcn/Tailwind
  variables in `index.css` serve only `src/components/ui/` and two fallback pages
  (`DesktopOnly.jsx`, `ErrorBoundary.jsx`).
- Tokens that live outside the token files: `--live`, `--live-fg`, `--live-bg`,
  `--prev-bg` (`console.css:305`), `--fold-ms`, `--ease-fold` (`:427`), and the
  `--gutter: 6px` override (`:2`) (SYS-12).

### 3. Scale discipline
Spacing: off the 4/8/12/16/24 scale (1–2 px hairlines aside), 6px ×71, 3px ×19,
5px ×19, 10px ×15, 14px ×14, 22px ×3 (SYS-10).
Type: off the 11/12/13/14/16/20/28 scale, 10px ×17, 15px ×10 (net.css), 9px ×6,
17px ×3, 11.5/12.5px ×4, plus 18/22/24/26px (SYS-06).

---

| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
| SYS-01 | Blocker | `docs/design-system/tokens.css:36` vs `src/index.css:83`, `:122` (loaded after it: `main.jsx:3-5`, `App.jsx:1-16`); consumers `console.css:199` (drop hint), `:407` (Camadas drawer), `:502` (dock ghost), `:504` (media peek), `:600` (toast) | `--popover` is two tokens with one name. The shadcn theme loads later and sets it to `20 8% 13%`, so every `box-shadow: var(--popover)` is invalid and computes to `none` (preview: `getComputedStyle(root)` gives `20 8% 13%`; the drawer, toast, ghost, peek and drop hint all give `none`). The Camadas drawer, a `bg-1` panel, then sits on the `bg-1` Biblioteca/Slides with no edge, cutting "Nenhum item em mãos" mid-word (screenshot 4-camadas-drawer-no-edge). The Esc/Encerrar toast with Desfazer also loses its frame. | At 1366×768 (the medium tier, the target notebook) the drawer is the only way to Camadas, and it looks broken during a service. The "Desfazer" toast is the safety net after Esc. | Rename the design-system token (e.g. `--shadow-popover`, as `--dialog` should be) or scope the shadcn theme, then check the five consumers. | S |
| SYS-02 | Major | Fields: `bundle.css:78-83` (`kx-field`, 28 px); `console.css:966` (`cfg-select` 24 px), `:1003` (song editor's `cfg-select` 26 px), `:981` (`cfg-inline` 22 px), `:1055` (`pl-input` 26 px), `:1058` (`pl-pick` 22 px), `:1358` (`fg-input` 24 px); `kx-field` resized to 26 px at `:998`, `:1054`, `:1130`, `:1189`, `:1229`, 32 at `:34`, 36 at `:819`, 40 at `:130` | The system has no Input or Select. For its 29 `<select>`, 73 `<input>` and 15 `<textarea>`, the app grew six field classes, at 22/24/26/28/32/36/40 px with 4, 6 or 8 px padding. Their focus looks differ. `kx-field` gets an inset `line-strong` line (`console.css:795`). `pl-input` and `fg-input` get the gold ring while typing, because `.kx :is(button, input, [tabindex]):focus-visible` (0,3,0, `bundle.css:15`) beats `.console .pl-input { outline: none }` (0,2,0). `textarea.ed-text` gets only the inset line (`:1009`), since textareas are not in the ring's list. Selects get only the inset line (`:797`). `cfg-inline` has the line all the time, so focus changes nothing. No field but `kx-field` has a hover state. None has a disabled style, though `Layers.jsx:363` disables a select. Only the sync code field has an error style (`:923`). | Planejar o culto, the song editor, the aviso editor and Configurações (flows 1 and 3) put fields of different heights side by side. A keyboard user cannot tell from one field to the next which one has focus. | One `kx-input` / `kx-select` pair in `bundle.css` (28 px, 24 in Compacta) with hover, focus, disabled and `[aria-invalid]`; map the six classes onto it. | M |
| SYS-03 | Major | `ContextMenu.jsx` (`ctx-menu`), `MenuBar.jsx` (`mb-pop`), `AddMenu.jsx:33` (`addmenu-pop`: the Biblioteca's + and the Bíblia's install +), `Popovers.jsx:25` and `:222` (`Menu`, `TabsMenu`), `BibleEnv.jsx:78` (`blist-pop`); shadows `console.css:112`, `:116`, `bundle.css:178` | Five menu implementations on one `kx-pop` + `MenuItem`. ↑/↓ work in ContextMenu and MenuBar only (in Popovers only the Palette has them, `:330`). AddMenu and `blist-pop` are `role="menu"` with no arrow keys, and AddMenu drops `disabled` from its items. A disabled item looks disabled only inside `.mb-pop` / `.ctx-menu` (`console.css:89-90`, `:119-120`). Floating menus use three different shadows: the `kx-pop` literal, the `ctx-menu` literal, and the bundle's (broken) token. | The console is keyboard-first. The same "+" glyph opens menus that answer the keys differently, and a future "disabled at the limit" item (CLAUDE.md, Camadas' +) would silently work again if it moved to AddMenu. (POL-14 covers the focus look.) | One `Menu` component (roving focus, ↑/↓/Enter/Esc, `disabled`, separators, one shadow token) used by all five. | M |
| SYS-04 | Major | `bundle.css:54-57` (`kx-btn-prev`, `-rh`, `-air`), `:15`, `:65`; `BibleEnv.jsx:507`, `SchoolView.jsx:201`; `Console.jsx:1340` + `bundle.css:175` (Destravar) | The state-fill buttons, which are the live ones (Enviar ao ar in the Bíblia, Escola and Mídia, Destravar, Encerrar, Excluir), have the thinnest state coverage. `-rh` and `-air` have no hover and no pressed state; `-prev` has hover but no pressed state. `.kx-btn.kx-btn-prev:hover` (0,3,0) beats `.kx-btn:disabled` (0,2,0), so a disabled Enviar ao ar (screens locked) still brightens on hover. The gold focus ring is drawn on the fill at 1.95:1 (prev-fill), 1.89:1 (air-fill) and 1.78:1 (rh-fill); only the brand button got the fix (`fg-1` ring, 2 px offset). Destravar is 22 px tall, under the system's own 24 px minimum. | The button that sends to air, and the one that unlocks the screens, are the two whose feedback matters most during a live service. A hover on a disabled send reads as "this will work". | Give the three fills hover and pressed steps, a `:disabled` rule at the same specificity, and the brand's ring treatment; make the banner button 24 px. | S |
| SYS-05 | Major | `kx.jsx:146-148` (Seg `small`: inline `height: 24`, buttons `height: 20`, `padding: 0 8px`, `fontSize: 11`); `Popovers.jsx:200` (Travar telas), `:205`; `PlayerBar.jsx:260`; `BibleEnv.jsx:377`, `:426`; `!important` overrides at `console.css:399`, `:521`, `:1047`, `:1132` | The `small` segmented control is the only one in use: all 72 `<Seg>`, including the Saídas popover's Travar telas switch, the idle look, the player's layer picker, Bíblia Abrev/Nomes and Ler/Comparar, and every Configurações choice. Its segments are 20 px tall, below the 24 px target the README sets ("Not yet raised"). Because the size is an inline style, every place that fixes it (Camadas raised it to 24 px) needs `!important`, and density can never reach it. | Travar telas is the rehearsal switch, used live. A 20 px target on a notebook trackpad slows the operator and invites a miss. Inline sizes also block SYS-14. | Move the sizes into a `.kx-seg.is-small` rule at 24 px segments and drop the inline styles and the four `!important`. | S |
| SYS-06 | Major | `console.css:166` ("Travado" in the Programa's pill, 10 px), `:752` (meter L/R, 9 px), `:597`, `:1327` (listhead `kx-section`, 10 px), `:464` (splitter %), `:727` (seek tip), `:1112`, `:1033` (9 px), `bundle.css:244` (`kx-book small`, 9 px); `:83` (top-bar menus, 12.5 px); `:915-940` (Sincronização: 10/11.5/12.5 px); `:918`, `:925`, `:1010` (ui-monospace) | Type has no tokens: 250 hand-written `font-size` declarations re-type 11/12/13 px. The type classes in `tokens.css` (`.meta`, `.ui`, `.content`…) are never used. 24 declarations in console.css fall off the scale, mostly below the system's 11 px floor ("meta 11 px is the smallest"). One of them is the lock's state word in the Programa's pill, at 10 px. A second family, `ui-monospace, "Cascadia Mono", Consolas`, appears in three places with no token. | The README promises that live information gets its own type steps, readable at a glance in a dark room. A 10 px "Travado" and 9 px labels break that, and with no size tokens nothing stops the next 10 px. | Add size tokens (`--fs-meta`… `--fs-countdown`) and `--font-mono`, raise everything under 11 px to `meta`, and snap 11.5/12.5 to the scale. | M |
| SYS-07 | Major | `docs/design-system/README.md` (Colour, Spacing, Motion, States), `docs/design-system.md:372-377`, `:423-435`, `tokens.json` (`gutter`, `row`, `popover` and timing usage strings) | The documents CLAUDE.md says to read before touching the look describe a console that no longer exists. Slides and verses are "cards… 4 px apart" (design-system.md) but are rows since 2026-10-14. "Gold… never a live state" contradicts `--live: var(--brand)` for the slide on air. Gutters are "8px", but the console uses 6 px. `row` is "the module header" at 28 px, though headers are 32/28. "The Programa… its panel's header is the live caption", but it has no header since Rodada E1. The docs also say "Nothing slides, scales or fades in on the console" (the drag card scales, panels fold), point to "Configurações › Aparência" (gone) and "Ver › Editar layout" (now Editar disposição), and call "Confortável the default" (now Automática). | Every future session follows these docs. Two specs that disagree cause regressions like SYS-01 (the `popover` usage note still names the drawer, toast and ghosts). | Bring the README, design-system.md and tokens.json usage strings in line with CLAUDE.md, and move "Histórico" items out of the normative text. | M |
| SYS-08 | Minor | `VerifyView.jsx:167` (`kind="prev"` "Fechar"); `ConfirmDialog.jsx:24` (`kx-btn-air` "Excluir", also for "Descartar…"); `Popovers.jsx:437` ("Instalar mesmo assim"); `SyncView.jsx:189` (`kind="rh"` "Gravando") | The state fills carry other meanings. Green, defined as "the only green fill: Enviar ao ar", closes Verificar. Red, the on-air fill, whose only documented uses (the Ao vivo segment, the PiP label) are both gone, is the delete button. Blue, defined as "locked", means "recording". The system has no destructive variant. | "Colour is state" is the system's first rule. A green filled "Fechar" in a live overlay reads as a send. | Add `kx-btn-danger` for confirmations; use outline/brand for Fechar and Gravando. | S |
| SYS-09 | Minor | `kx.jsx:66-71`, `:120-127` (no `forwardRef`; `small` = inline style); `bundle.css:110`, `:175`, `:262`, `:277`; `console.css:72`, `:284-285`, `:875`; 42 raw `<button className="kx-btn …">` (Layers.jsx 9, Console.jsx 8, Dock.jsx 5, PlayerBar.jsx 4, Popovers.jsx 3…) | Button size is set three ways. There is a `small` prop (inline 24 px, `padding: 0 6px`; 151 `Btn` + 46 `IconBtn`), there are size classes posing as kinds (`kx-btn-live` 32 px, `kx-btn-send` 40 px), and there are context overrides (22 px in banners, alerts and routes; 24 in rows; 26 for Voltar). That makes six heights. `Btn` and `IconBtn` don't forward refs, so ConfirmDialog, EndDialog and 40 others hand-copy the class string and skip `aria-pressed`. | A change to the button (a state, the ring) has to be repeated in 42 copies, and density cannot reach inline sizes. | `forwardRef` on Btn/IconBtn, a `size` prop mapped to classes (sm 24 / md 28 / lg 32 / xl 40), then replace the raw copies. | M |
| SYS-10 | Minor | `console.css:156` (`.prog-pill` `0 4px 0 10px`), `:362` (`.kx-warnbar` left 10 px), `:560`, `:567`, `:576` (Bíblia cells `gap: 3px`), `:1228-1234` (22 px indents), `:1259` (`5px 6px`); `bundle.css:48`, `:70`, `:78` (`gap: 6px`) | Spacing is about 60 % tokenised (above). Off-scale values cluster as 6 px (71 in the CSS, led by the bundle's own `kx-btn`/`kx-seg`/`kx-field` gaps, plus the inline `Btn small` padding), 3/5 px (38) and 10/14 px (29). The Bíblia's cells sit 3 px apart, while list rows sit 2 px apart and slides 4 px. | Small mismatches like these keep the Rodada F4 padding rule from staying true. | Add `--space-1-5` (6 px) as the one sanctioned half-step (the console gutter is already 6) and snap 3/5/10/14 to the scale. | M |
| SYS-11 | Minor | `console.css` (58 raw radii); chips `.bc-chip` 22 px/999px, `.bchip` 24/8, `.dock-chip` 24/8, `.fg-chip` 24/999, `.nv-chip` 26/8 | Radii outside 8/14/999: 4px ×12, 3px ×7, 2px ×5, 6/9/10/12px. `999px` is written out 19 times instead of `--radius-round`. Chips come in five families with three heights and two corner styles (pill vs control). | The same element (a chip) looks different in the Bíblia, the aviso editor, the backgrounds and the dock. | Use `--radius-round` / `--radius-control` only, plus one `--radius-inner` (4 px); one `kx-chip` class. | S |
| SYS-12 | Minor | `console.css:2`, `:305`, `:427`, `:112`, `:116`, `:628`, `:634`; CLAUDE.md ("eases in and out in 180 ms"), `design-system.md:403` | System values live in console.css, not in tokens. These are the gold on-air family (`--live*`, `--prev-bg`), a second easing (`--ease-fold`) and a fold duration of **240 ms** (the spec says 180 ms), plus 180/200/220 ms written as literals and four elevation shadows written out. tokens.json still says "one easing, one duration". | Tokens that are not in tokens.json are invisible to the next designer, and the fold timing already disagrees with the spec. | Move `--live*`, `--prev-bg`, `--duration-move` (180), `--ease-fold` and the menu/drag shadows into tokens.json/css; settle 180 vs 240 ms. | S |
| SYS-13 | Minor | `console.css` (52 literal z-index, 1…1000), `:103` and `:847` (`.pop` and `.win-dialog` both 30), `screen.css:120` (9999), `index.css:194` (10000) | No layer scale: 38 distinct z-index values. Two layers share 30. The ordering that CLAUDE.md requires (pickers and ConfirmDialog over THE window) holds only by numbers picked one at a time (36/37, 43/44, 45/46). | The next overlay is a guess. A wrong one hides the ConfirmDialog of "Descartar as mudanças?" or a menu behind the window. | A z-index token scale (`--z-pop`, `--z-window`, `--z-picker`, `--z-confirm`, `--z-menu`, `--z-toast`, `--z-drag`). | S |
| SYS-14 | Minor | `Janela.jsx:239` (`kx console janela`, no `is-${density}`); Compacta rules only at `console.css:280-281`, `:454`, `:456`; Confortável at `:272-276` | Density holds for the console's panel headers, list rows and slides only. A detached page (Destacar em janela) never gets the density class, so it draws 32 px headers while the console beside it is Compacta. Camadas rows, Bíblia verses and cells, menus, tabs and Configurações rows have one size in every density. | On the 1366×768 notebook Automática picks Compacta. A detached editor on the same screen then breaks the 28 px header rule, and the densest modules gain nothing. The base sizes (28 px rows, 24 px small controls) suit a Windows desktop app. | Pass the console's density to `/Janela` and let Compacta tighten `kx-layer`, `kx-verse` and `kx-menu-item` by a step. | S |
| SYS-15 | Minor | `console.css:1049` (`.ed-video > .kx-panel-h`), `:1066` (`.pl-setlist > .kx-panel-h`): `height: auto; flex-wrap: wrap`; `bundle.css:37` (32 px literal, right padding 6 px) | Two panel headers are allowed to wrap into a taller block, against "a header never wraps into a taller block". At 1366 they stay on one line (screens 05, 06); narrower they would not. The header height is a literal 32 px, not a token, and the bundle's right padding (6 px) is fixed only by a console override (`:241`). | The one padding rule (Rodada F4) has two quiet exceptions, and its numbers are not in the token file. | Add `--panel-head` (32/28) to the tokens and give those two headers the Bíblia's drop-then-hide behaviour instead of wrapping. | S |
| SYS-16 | Minor | `Popovers.jsx:418`, `MediaView.jsx:235` (`is-busy`); `console.css:923` (the one error style); `aria-invalid` used once | The system has no loading state (no busy button, no `aria-busy`; two progress bars are ad hoc) and no error state for fields. | Saving, installing a Bible or uploading shows progress three different ways or not at all. A wrong value in a field has no look. | A `kx-btn.is-busy` (label kept, glyph spinner, reduced-motion safe) and `[aria-invalid]` on the field class (SYS-02). | M |
| SYS-17 | Minor | `console.css:126` (`.dialog` bg-2, 460 px), `:129` (palette bg-2, 620), `:816` (lyr bg-2, 960), `:1431` (`.lib-dialog` bg-1, 1040), `:847` (`.win-dialog` bg-0, 1240); `Popovers.jsx:58`, `:74`, `:145`, `:454` (inline widths 300/230/440/360) | Floating surfaces use three grounds (bg-0/1/2) and literal widths in CSS and inline styles, with no surface or width tokens. | Dialogs and popovers look like different products side by side (the library over THE window). | Fix one ground per surface kind (dialog bg-2, window bg-0) and move widths to CSS classes. | S |
| SYS-18 | Minor | `bundle.css` (unused: `kx-transport`, `kx-route`, `kx-pip`, `kx-pip-cap`, `kx-tip`, `kx-clock`, `kx-content-lg`, `kx-dim`, ten `kx-screen-*`; `kx-seg-mode` `:73-74`); `tokens.css:58-72` (global `.meta`, `.section`, `.ui`, `.content`, `.clock`…) | 18 component classes and the Ensaio segment variant are dead (the canvas still uses them). The unprefixed type classes in `tokens.css` are unused but load in every window as bare global names. A future `className="section"` or `"content"` would get 11 px caps or 13 px text. | Dead classes make the bundle look like a spec it is not, and the bare names are a latent collision, of the same kind as SYS-01. | Prefix the tokens.css type classes (`kx-type-*`) or drop them from the app's import; mark the canvas-only classes. | S |

## Component × state matrix

✅ defined · ⚠️ partial or inconsistent (note) · ❌ missing · — not applicable.
Sources: `bundle.css` and `console.css`, by selector.

| Component | Hover | Active (pressed) | Focus-visible | Disabled | Loading | Error |
|---|---|---|---|---|---|---|
| Button `kx-btn` (ghost) | ✅ `bundle:50` | ✅ `:51` | ✅ gold inset `:15` | ✅ `:52` | ❌ | — |
| Button `kx-btn-outline` | ✅ `:66` | ✅ (inherits `:51`) | ✅ | ✅ | ❌ | — |
| Button `kx-btn-brand` | ✅ `:62` | ✅ `:63` | ✅ `fg-1`, offset 2 `:65` | ✅ `:64` | ❌ | — |
| Button `kx-btn-prev` (Enviar ao ar) | ✅ `:55` | ❌ | ⚠️ gold on green 1.95:1 | ⚠️ hover still fires (SYS-04) | ❌ | — |
| Button `kx-btn-air` (Excluir, Encerrar) | ❌ | ❌ | ⚠️ 1.89:1 | ✅ (generic dim) | ❌ | — |
| Button `kx-btn-rh` (Destravar) | ❌ | ❌ | ⚠️ 1.78:1 | ✅ | ❌ | — |
| IconBtn | ✅ | ✅ (`is-on` = pressed look) | ✅ | ✅ | ❌ | — |
| Seg (segmented) | ⚠️ text only `:71` | ❌ | ✅ | ❌ (options accept `disabled`, no style) | — | — |
| Input `kx-field` | ✅ `:79` | — | ⚠️ inset `line-strong` 1.78:1 on bg-2 (owner's choice) | ❌ | — | ❌ |
| Input `pl-input` / `fg-input` / `cfg-inline` | ❌ | — | ⚠️ gold ring + inset / gold ring / no change (SYS-02) | ❌ | — | ⚠️ only `cfg-sync-codein.is-err` |
| Textarea `ed-text` | ❌ | — | ⚠️ inset only (`:1009`) | ❌ | — | ❌ |
| Select `cfg-select` / `pl-pick` / native | ❌ | — | ⚠️ inset only (`:797`) | ❌ (used, `Layers.jsx:363`) | — | ❌ |
| Dialog (`.dialog`: ConfirmDialog, PromptDialog) | — | — | ⚠️ starts on the destructive button (WIN-03) | ✅ PromptDialog's OK until text | ❌ | ❌ no inline error slot |
| Menu item `kx-menu-item` | ✅ `bundle:180` | ❌ | ⚠️ gold ring in `kx-pop`, bg-3 only in `ctx-menu` (POL-14) | ⚠️ styled in `mb-pop`, `ctx-menu` only; AddMenu drops it | — | — |
| List item `kx-row` | ✅ `:88` | ❌ | ✅ (via `[tabindex]`) | — (`is-done` dim ✅) | — | ⚠️ `is-warn` bar only, no tint |
| Layer `kx-layer` | ✅ `:217` | ❌ | ✅ (`role="button"`, `tabIndex=0`) | ⚠️ `is-off` dims the eye | — | — |
| Tabs `kx-tabs` / `TabRow` | ✅ `:117` | ❌ | ✅ | ⚠️ only the environment tabs (`console:70`) | — | — |

Gaps: 30 ❌ and 16 ⚠️ across the 17 rows. Loading is missing everywhere. Disabled
and error are the weakest for fields. The pressed state is missing on every live
fill and on rows, menu items and tabs.

## Needs manual check
- SYS-01 was confirmed in the browser preview only. The packaged app should show
  the same, since `App.jsx:1-16` keeps Tailwind's `index.css` last "as the single
  bundle had". Look at the Camadas drawer and the Esc toast in `npm run desktop:dev`
  at the next release smoke.
- Fold timing: CLAUDE.md and design-system.md say 180 ms; `console.css:427` runs
  240 ms with its own easing. Which does the owner want?
- Text fields' quiet focus line (an inset `line-strong`, 1.78:1 on `bg-2`) is the
  owner's decision ("Other app departures"). Is it still wanted, given that `pl-input`
  and `fg-input` already show the gold ring (SYS-02)?
- Red fill for "Excluir…" / "Descartar…" (SYS-08): the owner may prefer red for
  destructive. If so, it wants its own token and variant, not `air-fill`.
- Legibility of the 9–10 px text (SYS-06) at Windows 125–150 % scaling on the
  church notebook; the preview cannot show ClearType rendering.
- CLAUDE.md says the Prévia's width is "`--prev` in console.css", but no such variable
  exists (the dock sizes it). If one were added, it would also clash with the `--prev`
  colour token.

## Top 3 to fix first
1. **SYS-01**: rename the `--popover` shadow token. One line brings back the edge of
   the Camadas drawer and the Desfazer toast on the target notebook.
2. **SYS-04**: hover, pressed, disabled and focus for the live fills (Enviar ao ar,
   Destravar, Encerrar), plus Destravar at 24 px.
3. **SYS-05**: the segmented control at 24 px in CSS, not inline; this fixes the
   Travar telas switch and the 71 other segmented controls at once and lets density reach them.
