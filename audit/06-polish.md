# PASS 6 — Polish & motion (POL-)

Audit only, on `audit/design-0219` (0866cb4, the 0.2.19 candidate). The
**emil-design-eng** skill was loaded and applied, calibrated for a Windows
desktop app: quick, restrained (Fluent-like) motion, no bounce, nothing
animated on actions the operator repeats by keyboard.

**Sources:** `docs/design-system/` (README › Motion, `tokens.css`,
`components/bundle.css`), `src/components/console/console.css`, `kx.jsx`,
`Dock.jsx`, `useSortable.js`, `dragGhost.js`, `Icon.jsx`, `Library.jsx`,
`useConsoleData.js`, `useConsole.js`, `CenterPanel.jsx`,
`src/components/screen/` (`screen.css`, `activity.css`, `ScreenRenderer.jsx`),
`src/index.css`, `src/fonts.css`, `src/hooks/useUser.js`. In the side-panel
preview (`keryx-ui`, 1366×768 and 1600×900) I checked: the console at launch,
a song sent and ended, Ver, a right-click menu, keyboard focus, Configurações
› Telas e saídas › Editor da tela, the Bíblia, and the panel folds.

**Limits:** the preview pane was hidden during the run, so the browser
throttled animation frames and no frame timing could be measured. Every
motion claim below comes from the CSS, or from what `getAnimations()`
reported (which properties transition, from what value to what value), not
from watching them play.

**Already right, so not listed:** one 120 ms ease-out colour transition for
hover; strong ease-out curves (`--ease-out: cubic-bezier(0.2,0,0,1)`, the
folds' `cubic-bezier(0.32,0.72,0,1)`); nothing over 250 ms in console UI
motion; no `transition: all`, no `ease-in`, no `scale(0)`, no spring overshoot.
Popovers, menus, dialogs and toasts appear in place, as the design system
says, which is the right call for things opened hundreds of times a night.
The drag card has its own reduced-motion branch in JS. The console's lists
scroll instantly when ←/→ move the slide on air (`useKeepInView` sets
`scrollTop`, no smooth scroll). The console honours reduced motion everywhere
through `bundle.css:17` (`.kx *`, the console root is `.kx`). The exit-fade
ghost is kept off the outputs' reduced-motion rule. Preferences update
optimistically (`updateUser`). Nothing blocks input while it animates: folded
bodies get `pointer-events: none` and every ghost or drag card is
`pointer-events: none`.

| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
| POL-01 | Major | `console.css:427-435` (the `flex-basis` transition lives only on `.dock-locked` / `.dock-fold`); `Dock.jsx:278-280` (a cell is `flex: 1 1 0` or `0 0 Npx`) | The panel folds (Rodada F4) are not smooth. (a) **Opening a folded panel snaps**: once a panel opens it loses `.dock-locked`, which carries the transition. In the preview, reopening the Biblioteca went 28 → 260 px with no transition, while folding it eased 260 → 28. (b) **When the split's flexible child changes, the cell that becomes fixed collapses to 0 px and regrows**: `flex-grow` jumps 1→0 and only `flex-basis` animates, from 0. Folding the Setlist (under Camadas and Temas) made its header drop to 0 and grow back to 32 px (`flex-basis: 0px -> 32px`, height 0). Reopening it made **Temas vanish and regrow** (`flex-basis: 0px -> 225px`, height 0) while the Setlist jumped to full height. The duration is also 240 ms against the 180 ms that CLAUDE.md and design-system.md state. | The fold chevron is on every panel. Each fold or unfold next to a measured panel (the right column of the default dock) flashes a panel to nothing and back, and opening never eases, only closing does. It reads as a layout glitch. | Animate between measured pixel sizes in both directions: start a cell that changes between flexible and fixed from its current px (FLIP, or a WAAPI animation on its size), keep the transition on fixed cells after they open, and align the duration to 180 ms (or the docs to 240). | M |
| POL-02 | Major | `src/components/screen/screen.css:135-137`, `activity.css:40-43`, `screen.css:80` | On the **outputs**, `prefers-reduced-motion: reduce` removes the theme's slide transition (Esmaecer, Deslizar, Zoom: `.ks-anim-*`), the Aviso rápido's entrance, the Escola's activity reveals and the urgent aviso's pulse. These rules are not scoped to the console. Chromium reports `reduce` when Windows' "Efeitos de animação" is off, which is common on church PCs set to "melhor desempenho". The exit fades (`.ks-ghost`, F2) still play, so the projector fades on Esc but cuts between lyric slides. | What the audience sees should keep its transitions (CONTEXT rule; CLAUDE.md: "Outputs ignore reduced motion"). Today a setting on the operator's PC changes the projector's look, inconsistently, and the church's chosen Esmaecer silently becomes a cut. | Scope these reduced-motion blocks to the console's monitors (`.kx .ks-anim-* > *`, …). `bundle.css`'s `.kx *` rule already covers the Programa. | S |
| POL-03 | Minor | `useConsoleData.js:18-23` (`data: q.data ?? []`); `Library.jsx:205`, `Rundown.jsx:59` | At launch the lists render their **empty states** before the first query answers. The Biblioteca says "Nenhuma letra · Use + para importar…" and the Setlist says "Setlist de hoje", then both flip to the real rows. The preview's first frame caught the empty-state glyphs in place of the songs and the Setlist. | A wrong "you have nothing" message, even for a moment, is a layout jump and a scare at the start of a service. Every launch shows it. | Show `Empty` only once the query has loaded (`!isPending`). Until then, show the panel bare (or rows' skeletons). | S |
| POL-04 | Minor | `console.css:628` (`.drag-card-in { transform: scale(1.03) rotate(-0.6deg) }`) | The drag card tilts −0.6°. design-system.md specifies "lifted (scale 1.03, a deep shadow)", with no tilt. | A tilted card is web-playful rather than Fluent, and rotated text loses ClearType on Windows, so the dragged song title looks soft while it is being placed in the Setlist. | Drop the `rotate`: keep scale 1.03 and the shadow. | S |
| POL-05 | Minor | `Library.jsx:38`, `:62-73` (`usePeek`) | The Imagens/Vídeos hover picture waits 350 ms on **every** row. Leaving a row hides it and the next row restarts the delay, so moving down the list makes the card blink off and come back 350 ms later. | The delay is there to avoid accidental peeks, but once a peek is showing, the next row should hand over at once (as tooltips do). Scanning backgrounds or videos before a service flickers. | While a peek is visible, show the next row's peek immediately; restart the delay only after the pointer leaves the list. | S |
| POL-06 | Minor | `console.css:1269-1271` (update bar), `:1096` + `MediaView.jsx:235` (upload `scaleX(0.6)`), `bundle.css:17` | With reduced motion on, the indeterminate bars turn into fake values. The update download's busy segment stops as a static 30 % bar at the left. A Mídia upload in progress shows a fixed 60 % fill (its opacity pulse is removed by `.kx *`). | Both read as stalled at a percentage that means nothing. A volunteer may cancel or restart an update that is still working. | Under reduced motion, show a full-width bar with a slow opacity pulse (opacity is fine to keep) and never a fixed partial fill for unknown progress. | S |
| POL-07 | Minor | `kx.jsx:285-297` (`Measure` reports in `useEffect`, after the first paint) + `console.css:435` | At launch the right column slides into place. Camadas starts at a default height and eases to its measured one, and Temas too. In the preview after a reload: Camadas `flex-basis 280px -> 144px`, Temas `220px -> 225px`, with the Setlist below growing 136 px over 240 ms. | Motion nobody asked for, on every launch. The column the operator looks at first moves under the pointer. | Apply the `.dock-locked` transition only after a module's first measured height has landed (no transition on the first value). | S |
| POL-08 | Minor | `bundle.css:16` (`.kx-t`) on `SlidesPanel.jsx:76`, `OnAirPanel.jsx:41`, `BibleEnv.jsx:461`, `BibleSearchPanel.jsx:68` | The state colours of slides, No ar cards and verses (green Prévia, gold on air, the next slide) cross-fade over 120 ms when ↑/↓/←/→ move them, because the one design-system transition covers "selection and state changes". With a key held, the colours trail the key. | These keys are pressed hundreds of times a service. The skill's rule is that keyboard-driven state never animates: the highlight should land with the keypress. | Keep the 120 ms only for hover (transition on `:hover`), and make `is-prev` / `is-air` / `is-next` changes instant. | S |
| POL-09 | Minor | `console.css:317` (`.kx-slide:hover, .onair-card:hover { background: var(--bg-2) }`) vs `:329` (`.is-next { background: var(--bg-3) }`) | A hovered slide (#20201d) is one grey step from the next-slide marker (#2a2925). With the pointer resting over the Slides column or No ar, → scrolls the list under it, so a second "next-looking" row wanders down the list. | The next slide is a live cue the operator reads at a glance. A hover tint that looks like it competes with it in the column the operator watches most. | Suppress hover while the keys move the list (until the pointer moves), or give the next slide a mark of its own (its number chip) rather than a background one step from hover. | S |
| POL-10 | Minor | `console.css:169-171` (`.console .prog-pill .kx-btn`), `:286-288` (`.console .topbar .kx-btn.kx-btn-icon`) override `bundle.css:51` (`.kx-btn:active`); rows/slides/verses/Temas tiles have no `:active` | The Programa pill's screen actions (Tela preta, Logo, Limpar, Encerrar, Voltar ao anterior, Multiview) and the top bar's round buttons have **no pressed state**: the console overrides outrank `.kx-btn:active`, so a press shows only the hover tint. List rows, slides, verses and Temas tiles have no pressed state either, and they prepare on mouse-up (`onClick`). | The pill's buttons act on the real screens. A Fluent-style pressed step confirms the press before the result shows. On rows, nothing reacts until release. | Add `:active` to those overrides (one step brighter than hover, e.g. `#ffffff2e` in the pill and `--bg-3` in the top bar) and a pressed tint on rows, slides, verses and tiles. | S |
| POL-11 | Minor | `useConsole.js:71-75`; `Console.jsx:1415-1420` | The Esc toast's **Desfazer** disappears after 8 s even while the pointer is on it or its button has focus, and any later toast replaces it. It also pops in and out without motion; that part is fine by the design system. | Desfazer is the safety net after an accidental Esc. Losing it as the operator reaches for it is the worst moment for a timer to fire. | Pause the timer while the toast is hovered or focused, and let a plain toast queue behind an action toast instead of replacing it. | S |
| POL-12 | Minor | `src/index.css:235-238` (`scrollbar-width: thin`, no `scrollbar-gutter`) | Scrollbars take layout space (measured 10 px on the overflowing `.kx-panel-b` lists). When a list starts to overflow (a longer song in the Slides column, one more Setlist item, a search filling the Biblioteca), every row narrows by 10 px, so right-aligned times jump and a slide's "…" cut point moves. | Content shifting under the eye during a service, each time the song changes length. | `scrollbar-gutter: stable` on the console's scrolling lists (Slides, No ar column, Setlist, Biblioteca, Bíblia lists). | S |
| POL-13 | Minor | `console.css:1331` (`.ap-range { accent-color: var(--prev) }`, used by `GeneratorPanel.jsx:61`, `FundosGallery.jsx:91`, `:96`) vs `:1396`, `:1424` (`accent-color: var(--brand)`) | Range sliders use two accents. The background library's Escurecer and Desfoque and the Gerados sliders are **green**, the Prévia's state colour. The song editor and Editor da tela sliders are gold, and the player's volume is neutral. | Green means "in the Prévia" everywhere else in the console. A green slider in the background library suggests a state it doesn't have, and the sliders look like they come from different apps. | One accent for every range input (brand gold, like the editors). | S |
| POL-14 | Minor | `bundle.css:15` vs `console.css:118`; also `bundle.css:65`, `console.css:726`, `:921`, `:1482`, `:1500` | Keyboard focus looks different from one control to the next. Ver/(+) menu items get the 2 px gold ring, but the same ↑/↓ in a right-click menu shows only a grey background. Brand buttons get a light ring offset 2 px, the seek and volume a gold ring outside, the sync code field a 2 px ring offset 1, and Temas' empty slot a gold border and tint. (Text fields' quiet inner line is the owner's decision and is not counted.) | A keyboard-first operator learns one focus look. Here the same action (walking a menu) looks different in two menus, and some rings sit inside, some outside. | Give both kinds of menu one focus look (the right-click menu's background plus the gold ring, or the reverse), and keep other controls to the inset gold ring unless the fill hides it. | S |
| POL-15 | Minor | `Icon.jsx:28-37` (`strokeWidth="1.5"` in a 24-unit viewBox at every `size`); 12 px icons ×18, 10 px ×1 | Icons drawn below 16 px get sub-pixel strokes: 0.75 px at 12 px, 0.63 px at 10 px. Examples are the default-theme star (Temas, the library, Configurações › Temas), the check/warn marks in the Bíblia's edition badge and Comparar, the Telas e saídas kind chips, and the "sem fundo" mark (10 px). | On the 1366×768 notebook at 100 % scaling, these marks render faint and fuzzy next to the 1 px glyphs of the 16 px set. The design system promises one 1.5-stroke family. | Keep the stroke at about 1 device px for any size (`strokeWidth = 24 / size`, or `vector-effect: non-scaling-stroke` with stroke 1). | S |

## Needs manual check

- **POL-02 and the Aviso rápido (a question for the owner).** CLAUDE.md's
  Rodada E3 note says the Aviso rápido's "entrance respects reduced motion",
  while the F2 note and this audit's rules say outputs ignore it. Should the
  Aviso rápido's slide-in follow the other output transitions (keep), or stay
  an exception? Then check on the church PC with "Efeitos de animação" off:
  slide transitions on Projeção, an aviso's entrance, an activity reveal.
- **The No ar strip folds on every Tela preta, Logo, aviso, timer, video and
  Esc** (owner decision, "No ar exists only while lyrics are on air"). Each
  fold eases the whole dock for 240 ms, resizing the Programa and Prévia
  monitors under the operator's pointer. It is triggered by keys (B, L, Esc,
  Enter) the skill says should never animate. A question for the owner: keep
  the fold, or keep the strip in place (dimmed) while the lyrics are only
  covered (B/L/aviso) and fold it only when they are gone?
- **Frame cost of the folds and THE window.** The No ar fold animates
  `flex-basis`, and THE window animates `width`/`height` for 200 ms when it
  moves between Padrão and Editor (`console.css:847`; 1240 → 1342 px wide on
  1366×768). Both re-lay out heavy subtrees every frame: the Programa/Prévia
  `ScreenRenderer`s (their `useFitWidth` ResizeObserver forces a layout per
  frame) and the editors' canvases. On the church notebook, in `desktop:dev`
  with DevTools › Performance, check that these stay at 60 fps. If they drop
  frames, animate a transform (FLIP) instead.
- **Enter/exit of menus, dialogs, toasts.** The pass checklist asks for
  menus, dialogs and toasts that animate in and out from their trigger. The
  design system says they "appear in place" (README › Motion), and for
  controls opened hundreds of times a service that matches the skill. My
  recommendation is to keep them instant. If the owner wants Windows 11's
  feel, the most it should get is a 100–150 ms opacity fade-in, no exit
  animation and no scale. Note that THE window's page already fades in
  (120 ms) while its frame and scrim appear at once.
- **Fonts at launch.** `src/fonts.css` uses `font-display: block` on purpose
  (no re-wrap on the projector). In the preview the first frame drew no text
  at all. Check that the installed app's first frame on a cold start of the
  notebook has its text. The file is local, so it should.
- **Docs out of step with the motion.** `docs/design-system/README.md` ›
  Motion still says "Nothing slides, scales or fades in on the console" and
  points to "Configurações › Aparência" (gone). The console now has the
  folds, the drag card and lift, and the window page fade. CLAUDE.md and
  design-system.md say the folds take 180 ms, but `--fold-ms` is 240 ms. A
  documentation fix for the owner to confirm, not a user-visible defect.
- **Native tooltips.** Tooltips are the `title` attribute, so Windows sets
  the delay and the instant hand-over between neighbours. That is native and
  right. Check on the church PC that they show over the frameless console
  window, and in a detached /Janela.

## Top 3 to fix first

1. **POL-02**: scope the outputs' reduced-motion rules to the console, so a
   Windows setting on the operator's PC never turns the projector's
   Esmaecer into a cut.
2. **POL-01**: make the panel folds ease both ways without collapsing a
   neighbour to 0 px (same root as POL-07's slide at launch).
3. **POL-08**: no 120 ms colour fade on keyboard moves of the slide/verse
   state: the highlight should land with the key.
