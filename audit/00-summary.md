# KERYX design audit: consolidated summary (00)

This is the final pass of the owner's "KERYX Design Audit — Prompt Pack"
(https://claude.ai/artifact/KeNQqskDkdZzkGnyYf95po).

- **Code:** branch `audit/design-0219` at 0866cb4, the 0.2.19 release candidate.
- **Inputs:** `audit/01-critique.md` to `audit/06-polish.md`; shared context in `audit/CONTEXT.md`; 20 screenshots in `audit/screens/`.
- **Audit only:** nothing was fixed. Fixes start only after the owner approves this summary, one batch per session.
- **Refreshed 16/10 (evening):** the owner answered C-09 (drop click-to-advance) and C-10 (Cancelar selected first), and confirmed on the desktop app the four Electron checks: three new Majors (C-90 to C-92, from CODE-18 to CODE-20) and C-55's spellcheck lines.
- **Blockers re-checked:** the five Blockers were checked again against the code during consolidation, and all five hold.
  - C-01: no `powerSaveBlocker` anywhere.
  - C-02: `outputs.cjs` falls back to a 1280×720 `frame:false` window.
  - C-03: `<select>` is missing from the click-blur list, and keys.js treats it as text.
  - C-04: `--popover` is redefined in `src/index.css:83/122`.
  - C-05: no `forced-colors` rule exists anywhere.

## Scorecard

| Pass | Blocker | Major | Minor | Total |
|------|---------|-------|-------|-------|
| 01 Design critique (CRIT) | 0 | 5 | 16 | 21 |
| 02 UI code guidelines (CODE) | 1 | 10 | 9 | 20 |
| 03 Accessibility (A11Y) | 1 | 15 | 5 | 21 |
| 04 Design system (SYS) | 1 | 6 | 11 | 18 |
| 05 Windows conventions (WIN) | 2 | 8 | 9 | 19 |
| 06 Polish & motion (POL) | 0 | 2 | 13 | 15 |
| **Raw total** | **5** | **46** | **63** | **114** |
| **After merging duplicates** | **5** | **35** | **52** | **92** |

Overall, the core is sound:
- **Live keys:** they work as specified.
- **Text contrast:** passes everywhere at rest.
- **Icon buttons:** all are named.
- **Exit fades and drag:** both honour reduced motion.
- **Startup:** no white flash, and a single instance.

What fails is concentrated in four places:
1. **The projector on a real Windows PC:** display sleep, and losing a monitor (C-01, C-02).
2. **One token collision** that breaks the Camadas drawer and the Desfazer toast (C-04).
3. **Focus and keyboard paths:** a select that swallows the live keys, menus and windows that never take focus (C-03, C-12, C-14).
4. **Windows contrast themes:** there is no forced-colours support at all (C-05).

## How conflicts were settled

- **Reduced motion on the outputs (CODE-05, POL-02).** The operator's Windows setting is not the audience's. The owner's rule wins: outputs keep their transitions, and reduced motion is scoped to the console. The Aviso rápido's entrance is a question for the owner (manual-check list).
- **The fields' quiet focus line (CODE-08, A11Y-14, SYS-02).** The quiet line is an owner decision; WCAG 2.4.7/1.4.11 want 3:1. Accessibility wins here: keep the quiet, non-gold look, but at 3:1 or more (1 px `fg-3`). Proposed for the owner's OK.
- **Background-only slide states (A11Y-01, A11Y-09).** The forced-colours cue (C-05) changes nothing in the normal look, so there is no conflict there. A non-colour cue in the normal look (C-24) is an owner question, since it touches the owner's "only the background" rule.
- **Single-letter live keys (WCAG 2.1.4).** They follow Holyrics by decision. They stay, and an option is proposed as an owner question.
- **Menus, dialogs and toasts with no enter/exit animation (POL).** The design system ("appear in place") is kept. The skill agrees for controls opened hundreds of times a service. At most a 100–150 ms fade-in, and only if the owner asks.
- **Dialog default and button order (CODE-10, WIN-03, WIN-14).** Windows conventions win. The safe button is the default for destructive questions, and every dialog uses one order (the action, then Cancelar on the right).
- **The fold duration, 180 ms in the docs vs 240 ms in the code (SYS-12, POL-01).** Settle it in C-37: the owner picks, then code and docs agree.

## Consolidated findings

Sorted by severity, then by impact on the core flows (2 = live, then 1 = prepare, then 3 = set up).

| ID | Severity | Location | Issue | Fix | Effort | Source IDs |
|----|----------|----------|-------|-----|--------|------------|
| C-01 | Blocker | `electron/main.cjs` (no `powerSaveBlocker` anywhere) | Nothing stops Windows from turning the displays off or sleeping the PC while a static slide is on air (Chromium holds a wake lock only during video). | Hold `powerSaveBlocker.start("prevent-display-sleep")` while any output is open; release it when the last one closes. | S | WIN-01 |
| C-02 | Blocker | `electron/outputs.cjs:17,67-70`; `outputs-manager.cjs:74-94,128-160` | When an output's monitor disappears, the output becomes a frameless, pointer-hiding 1280×720 box over the console's monitor, with no title bar or taskbar entry, likely on top, and it covers the "Reconectando…" banner. | On a missing monitor, hide the output (or keep it behind the console with the pointer visible) until the monitor returns; the banner is the signal. | M | WIN-02 |
| C-03 | Blocker | `src/pages/Console.jsx:882` (click-blur list); `src/lib/console/keys.js:11,45,57`; 24 `<select>`s (BibleEnv.jsx:376, Layers.jsx:363, SongEditor.jsx:383…) | A mouse-picked `<select>` keeps the focus, and keys.js treats it as a text field, so every live key dies (B/L/C, Enter, ←/→, the Bíblia's quick jump). Typing "a" switched the Bíblia edition. | Blur a select after `change`; classify `select` as a control in keys.js (it keeps only ↑/↓). Add a test in keys.test. | S | CODE-01 |
| C-04 | Blocker | `docs/design-system/tokens.css:36` vs `src/index.css:83,122`; consumers `console.css:199,407,502,504,600` | `--popover` is both a shadow (design system) and an HSL triplet (shadcn, loaded later). Every `box-shadow: var(--popover)` becomes `none`, so the Camadas drawer has no edge at 1366×768 and the Esc/Encerrar Desfazer toast loses its frame. | Rename the design-system token (`--shadow-popover`) and update its five consumers. | S | SYS-01 |
| C-05 | Blocker | No `forced-colors` rule in `src/` or `docs/design-system/`; `console.css:329-335`; `bundle.css:58,72,80,90-97,125-129`; `.sw2` `console.css:948-952`; outputs `screen.css`, `ScreenRenderer.jsx` | Under a Windows contrast theme, on-air / Prévia / next states (slides, verses, No ar, Setlist, Biblioteca) vanish (background-only). Switches, outline buttons, fields, Seg and the Programa frames lose their boundary. The outputs and the console's monitors are recoloured too (what the congregation sees). | `@media (forced-colors: active)` cues in system colours (is-air outline Highlight, is-prev dashed, switches and fields with ButtonText borders, Seg is-on outline); `forced-color-adjust: none` on output roots and `.kx-mon-screen`. | M | A11Y-01, A11Y-13, A11Y-16 |
| C-06 | Major | `SlidesPanel.jsx:87-91` | While the Slides column shows the Prévia's slides ("prévia 1/2"), the Anterior/Próximo buttons under it move the slide **on air**. | Label the pair as acting on air ("No ar ◀ ▶") or hide it while the column shows the Prévia. | S | CRIT-02 |
| C-07 | Major | `screen.css:80,135-137`; `activity.css:40-47` | `prefers-reduced-motion` (Windows "Efeitos de animação" off) removes the theme's slide transitions, the aviso entrance, activity reveals and the urgent pulse **on the outputs**, while the exit fades still play. | Scope those reduced-motion rules to the console's monitors (`.kx .ks-anim-*`). | S | CODE-05, POL-02 |
| C-08 | Major | `Rundown.jsx:77`; `Console.jsx:402` (`airItemId = c.cur?.session?.itemId`) | After Esc (and after a reload), the last item sent stays red (`is-air`) in the Setlist while the Programa says "Nada no ar". | `is-air` only while that item is on air; a quieter "último" state for the session's last item. | S | CRIT-04 |
| C-09 | Major | `src/pages/Projection.jsx:36-77` | A single click anywhere on the Projeção window moves the slide on air (left = back, right = forward). Its keys bypass keys.js (Space = next; no C, no ↑/↓). On a one-monitor PC, clicking the window to bring it forward changes what the audience sees. | Drop click-to-advance (owner, 16/10) and route the window's keys through `liveAction`. | S | CODE-04 |
| C-10 | Major | `ConfirmDialog.jsx:14-25` (all `useConfirm`: Excluir…, Descartar as mudanças?, Trocar o código) | Destructive questions focus the destructive button, so Enter (the operator's send reflex) deletes or discards. The native close guard already defaults to Cancelar. | Focus Cancelar when the action is destructive (owner, 16/10: Cancelar selected first); Esc keeps answering no. | S | CODE-10, WIN-03, A11Y-02 (part) |
| C-11 | Major | `MediaView.jsx:178`; `editor/ScreenEditor.jsx:255` | Backspace deletes, as on macOS: in the Mídia it opens "Excluir da Mídia?" (Excluir focused); in the Editor da tela it deletes the element at once, with no undo. | Delete only; drop Backspace from both handlers. | S | WIN-04 |
| C-12 | Major | `Console.jsx:1354-1371` (`.win-dialog` `aria-modal`); `ConfirmDialog.jsx:16`; `PromptDialog.jsx:12`; `Popovers.jsx:270` | THE window and its dialogs never take the focus: about 47 console Tab stops come first, the console isn't `inert`, Tab walks out of dialogs, and focus doesn't return to the opener on close. "Nova música" opens with no field focused. | Focus the first control on open, make `.main` and the top bar `inert`, keep Tab inside, return focus to a keyboard opener. | M | CODE-03, A11Y-02 |
| C-13 | Major | `useConsole.js:71-75,282`; `Console.jsx:1415-1420` | Desfazer after Esc/Encerrar exists only as a toast button, is never focused, has no key, lasts 8 s even while hovered, and a later toast replaces it. | Ctrl+Z while the toast shows (listed in Atalhos); pause the timer on hover/focus; queue plain toasts behind action toasts. | S | A11Y-07, POL-11 |
| C-14 | Major | `MenuBar.jsx:12-95`; `Popovers.jsx` (logo menu, Ver, Saídas, Notificações); `main.cjs:278` | Menus and top-bar popovers don't move the focus in, so ↓/→ do nothing (↓ even moves the console's green selection). There's no Alt/F10 and no access keys, and submenus open only on hover. Saídas (Travar telas) needs the mouse. | Focus the first item on open and return focus on Esc; Alt/F10 focuses the bar; → enters a submenu; give each menu an access key. | M | CODE-06, A11Y-05, WIN-05 |
| C-15 | Major | `ContextMenu.jsx`, `MenuBar.jsx`, `AddMenu.jsx:33`, `Popovers.jsx:25,222`, `BibleEnv.jsx:78`; `console.css:112,116,118` | Five menu implementations: arrow keys only in two, AddMenu drops `disabled`, three different shadows, and a right-click menu's focus is bg-3 on bg-2 (1.12:1). | One `Menu` component (roving focus, ↑/↓/Enter/Esc, disabled, separators, one shadow token, the gold focus ring). | M | SYS-03, A11Y-06, POL-14 |
| C-16 | Major | `Rundown.jsx`, `useSortable.js:167`; `ServicePlanner.jsx:94,293,304` | The Setlist and the planner can be reordered only by dragging; planner rows are `div onClick` (mouse only). | Subir/Descer in the row menus plus Alt+↑/↓ on a focused row (as Camadas); planner rows on `Row`. | M | CODE-02, A11Y-03 |
| C-17 | Major | `SlidesPanel.jsx:59-65`; `console.css:339`; `CenterPanel.jsx` (pill at 1280) | The "No ar · …" / "Prévia · …" tabs cut mid-word with no "…" and lose the "2/3" at 1366. The pill's title is cut at 1280, so two similar songs can't be told apart. | Put the title in an ellipsized span and keep "n/m" outside the clip. | S | CRIT-03 |
| C-18 | Major | `electron/outputs.cjs:8-14` vs `src/lib/network/views.js:45-60` | Each output has two names: Saídas says "Projeção principal", "Letras (tela de letras)", "Comunicação", "Tela do pastor"; the Editor de telas says "Projeção", "Letras", "Avisos", "Pastor". | One factory name per output on every surface (owner picks Avisos or Comunicação). | S | CRIT-05 |
| C-19 | Major | `SongEditor.jsx:396-404` | Chords can go in two places: inline `[G]` in the Letra (what the screens use) and the always-shown legacy "Cifra" box ("Acordes para o Palco"). | Show Cifra only when it has text, with one action "Colocar na letra". | S | CRIT-01 |
| C-20 | Major | `bundle.css:14` (`:where()` loses to Tailwind preflight); `console.css:222,455,464,473,490,1102,1499,1567…` | Every button, row and tab shows the hand cursor (57 of 71 measured). Windows keeps the arrow on controls. | `.kx :is(button,[role=button]) { cursor: default }` above preflight; drop the explicit `pointer`s; keep the hand for links. | S | CODE-07, WIN-09 |
| C-21 | Major | Fields: `bundle.css:78-83`; `console.css:795-797,966,981,1003,1009,1055,1058,1358`; `.kx-split-pct-in :466` | Six field classes at 22–40 px. Focus is a 1 px inset at 1.78:1 for some fields, a gold ring for others, and no change at all for `cfg-inline`. There is no hover, disabled or error state. | One `kx-input`/`kx-select` (28/24 px) with hover, a ≥3:1 focus (quiet `fg-3` line), disabled and `[aria-invalid]`; map the six onto it. | M | SYS-02, CODE-08, A11Y-14 |
| C-22 | Major | `bundle.css:54-57,15,65`; `BibleEnv.jsx:507`; `SchoolView.jsx:201`; Destravar (`Console.jsx:1340`, `bundle.css:175`) | The live fill buttons (Enviar ao ar, Destravar, Encerrar, Excluir) lack hover and pressed steps. A disabled Enviar ao ar still lights up on hover. Their focus ring is 1.8–1.95:1 on the fill. Enviar ao ar's hover is 3.16:1. Destravar is 22 px. | Hover and pressed steps, a disabled rule at the same specificity, the brand's ring treatment, a hover shade keeping ≥4.5:1, and Destravar at 24 px. | S | SYS-04, A11Y-20 |
| C-23 | Major | `kx.jsx:146-148` (Seg `small` inline 24/20 px); `Popovers.jsx:200` (Travar telas); `console.css:399,521,1047,1132` (`!important`) | All 72 segmented controls (Travar telas included) have 20 px segments set inline, below the 24 px target; four places override them with `!important`, and density can't reach them. | A `.kx-seg.is-small` CSS rule at 24 px; drop the inline sizes and the `!important`s. | S | SYS-05 |
| C-24 | Major (closed by the owner: colour only) | `console.css:305,329-335`; `OnAirPanel.jsx:41`; `BibleEnv.jsx:461` | On air (gold) vs Prévia (green) differ by hue only (1.06:1); only the number's colour changes. A red-green colour-blind operator can't tell what Enter sends from what is on air. | A non-colour cue in the number cell (▶ on air, ● Prévia), pending the owner's OK. | S | A11Y-09 |
| C-25 | Major | `Console.jsx:1415`, `Janela.jsx:257` (toast `role="status"` mounted with its text); `CenterPanel.jsx:97` | Toasts appear already filled (often skipped by NVDA/Narrator); what goes on air, "Travado" and refusals are never announced. | One always-mounted empty live region; write toasts and "No ar: … 1/3" into it. | S | A11Y-08 |
| C-26 | Major | `SlidesPanel.jsx:76`, `OnAirPanel.jsx:41`, `BibleEnv.jsx:459`, `Rundown.jsx:77`, `kx.jsx:120,169,271` | Live states exist only as classes. There is no `aria-current`/`aria-selected` on slides, verses, Setlist rows or Bíblia cells; `MenuItem checked` has no `menuitemcheckbox`; `IconBtn on` has no `aria-pressed`. | Map is-air → `aria-current` + "no ar", is-prev → `aria-selected`; `menuitemcheckbox`/`aria-checked`; `aria-pressed` on IconBtn. | M | A11Y-10 |
| C-27 | Major | `kx.jsx:169-178` (`Row` `role=button` wrapping actions); `ThemeStrip.jsx:137`; `TopBar.jsx:40-41`; `Layers.jsx:230-278` | Rows are buttons that contain buttons, so their names become run-on text and the inner buttons may drop out. Temas tiles are `<button role=listitem>`. The search is a `div role=button` that ignores Space. Camadas' "Ocultar"/"Travar" don't name the layer. | Rows as list items with sibling action buttons named by target; tiles in an `li`; the search a real `<button>`. | M | A11Y-11, CODE-16 |
| C-28 | Major | `kx.jsx:15-31` (Panel title is a span); `Console.jsx:1304`; `TopBar.jsx` | No headings or landmarks in the console. | Panel title `role=heading aria-level=2`, panel `role=region`, the dock in `<main>`. | S | A11Y-12 |
| C-29 | Major | `kx.jsx:160` (`Field` `aria-label={placeholder}`); `SongEditor.jsx:384-392`; `ServicePlanner.jsx:249-252`; `settings/parts.jsx:73-80` | Fields are named by their placeholder ("m:ss", "Culto de domingo"), not their visible label. Clicking a Configurações row name doesn't operate its control. | A `label` prop on `Field` / `<label htmlFor>`; FormRow renders a real label. | S | A11Y-04, CODE-17 |
| C-30 | Major | `main.cjs:278` (no menu, so no zoom roles); `main.cjs:219-220`; 9–11 px text | There is no way to enlarge text (no Ctrl+=/−/0, no setting), and Windows scaling above 125 % on 1366×768 goes below the 960×600 minimum. | Ctrl+= / Ctrl+− / Ctrl+0 via `setZoomFactor`, kept per computer (or a "Tamanho do texto" setting). | M | A11Y-15 |
| C-31 | Major | `console.css:166` ("Travado" 10 px), `:752` (9 px), `:597,1327` (listheads 10 px)…; 250 literal `font-size`s; no size tokens | No type tokens; 24 declarations fall below the 11 px floor, including the lock's "Travado" in the Programa pill; there is a second mono family with no token. | Size tokens (`--fs-*`) and `--font-mono`; raise everything below 11 px to meta; snap 11.5/12.5 to the scale. | M | SYS-06 |
| C-32 | Major | `docs/design-system/README.md`, `docs/design-system.md:372-435`, `tokens.json` | The design docs (read before every look change) describe the old console: slides and verses as "cards", gold "never live", 8 px gutters, the Programa header, "nothing slides or fades", Aparência, "Editar layout", Confortável as the default. | Align README, design-system.md and the tokens.json usage strings with CLAUDE.md; move history out of the normative text. | M | SYS-07 (+ CRIT and POL doc notes) |
| C-33 | Major | `editor/ScreenEditor.jsx:240-256`; `ThemeEditor.jsx:177`; `keys.js:69` | No Ctrl+Z/Ctrl+Y in the screen and theme editors; drag, nudge, Delete and Ctrl+D can't be undone. | An undo stack of `draft` in both editors (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z). | M | WIN-06 |
| C-34 | Major | `main.cjs:216-234` | The console's size, position and maximized state are never restored. Every launch is a centred 1440×900 window, larger than the target 1366×768 screen. | Save the bounds and `isMaximized` on close; restore them when they fit a connected display, else maximize. | S | WIN-07 |
| C-35 | Major | `main.cjs` (no `nativeTheme.themeSource`); `:132-146,176-186`; `outputs-manager.cjs:76` | Windows draws light chrome around the dark app: white title bars on detached pages and windowed outputs, and a white text menu. | `nativeTheme.themeSource = "dark"` at startup (dark only is the owner's decision). | S | WIN-08 |
| C-36 | Major | `build/icon.png` (opaque 512 px photo); `package.json › build.win.icon` | The app icon is a photo, muddy at 16–32 px in the taskbar, Alt+Tab and the installer. | A multi-size `build/icon.ico` with the emblem flat on transparency. | S | WIN-10 |
| C-37 | Major | `console.css:427-435`; `Dock.jsx:278-280`; `kx.jsx:285-297` (`Measure`) | Panel folds open with a snap; a neighbour that changes between flexible and fixed collapses to 0 px and regrows; the right column slides into place at every launch; the code runs 240 ms where the docs say 180. | Animate between measured px both ways (FLIP/WAAPI); no transition on a module's first measured height; settle 180 vs 240. | M | POL-01, POL-07, SYS-12 |
| C-90 | Major | `LyricProjection.jsx`, `VideoProjection.jsx`, `CommunicationProjection.jsx`, `StageView.jsx`, `PastorView.jsx` (no key handler) vs `Projection.jsx:64-77` | Only the Projeção answers B / L / Esc. With another output window in front, Tela preta's key goes nowhere until the console is clicked (confirmed by the owner on the desktop app). | The Projeção's screen keys (through keys.js) on every output page, or main hands the focus back to the console. | S | CODE-18 |
| C-91 | Major | `Console.jsx`, `Janela.jsx` (no Ctrl+wheel guard); `main.cjs:106` (no zoom limits) | Ctrl+mouse wheel zooms the whole console (confirmed by the owner on the desktop app); there is no way back. | Ignore Ctrl+wheel (or pin the zoom from main) until C-30 gives an intended, resettable zoom. | S | CODE-19 |
| C-92 | Major | `console.css:797,966,1003`; `BibleEnv.jsx:376` (inline); no `option` rule anywhere | The open dropdown lists are hard to read: selects set their colours, their options don't (confirmed by the owner on the desktop app). | `.kx option { background: var(--bg-2); color: var(--fg-1); }`, checked on Windows. | S | CODE-20 |
| C-38 | Minor | `SongEditor.jsx:492` | The lyrics syntax help line is cut off at 1366 and 1280. | Wrap it above the textarea or move it to a tooltip. | S | CRIT-06 |
| C-39 | Minor | `SongEditor.jsx:405-425` | The song's look uses "Estilo", "Tema padrão (estilo de fábrica)", "Próprio" and "visual próprio", where the app says Tema. | "Tema desta música": O mesmo das músicas / Tema … / Só desta música. | S | CRIT-07 |
| C-40 | Minor | Editor de música WinBar | "Excluir…" sits beside Cancelar and Salvar in the same row and weight. | Move it to the song's right-click menu, or set it apart at the left. | S | CRIT-08 |
| C-41 | Minor | `ServicePlanner.jsx:26,349` | The planner's add bar has no label, "Música" is pre-outlined (it reads as a filter), and "EBD" is the only abbreviation. | Prefix "Adicionar:", no pre-outline, "Escola bíblica". | S | CRIT-09 |
| C-42 | Minor | `ServicePlanner.jsx:259` | The Papel de parede value is truncated ("o de qualquer outr…"). | A short value ("Qualquer outro culto"), with the full phrase in the tooltip. | S | CRIT-10 |
| C-43 | Minor | `settings/TemasSection.jsx:128`; `library/BackgroundLibrary.jsx:216` | The Temas empty state points to Camadas (no text controls) and to "Configurações › Temas" (now Temas e fundos); the four Temas padrão boxes are blank. | Point to "Novo tema…"/Editor de temas, fix the section name, draw the factory look in the boxes. | S | CRIT-11 |
| C-44 | Minor | factory backgrounds (`resources/`) | The factory backgrounds are named "Fundo 1–16", and one is a close portrait of a man. | Descriptive names; drop the portrait from the factory set. | S | CRIT-12 |
| C-45 | Minor | `Layers.jsx:90,229-241` | An empty layer looks like a hidden one (eye-off, dimmed, "Mostrar"). | An "empty" look of its own; eye-off only for layers actually hidden. | S | CRIT-13 |
| C-46 | Minor | Slides / No ar / Setlist under Tela preta or Logo | The working columns don't show that the screens are covered (only the pill says so). | Dim the on-air state and add "coberto · Tela preta" to the column header. | S | CRIT-14 |
| C-47 | Minor | `BibleEnv.jsx` Livros and Texto headers | At 1366, "Livros" is cut to "LIVR…" and the Texto hint is cut mid-word instead of dropped. | Drop the hint first; move Abrev\|Nomes into the view menu at this width. | S | CRIT-15 |
| C-48 | Minor | `BibleEnv.jsx:488,496` | When a chapter can't load, the Selecionado header claims a selection while the body says "nenhum". | "Salmos 23 indisponível nesta versão" in Selecionado. | S | CRIT-16 |
| C-49 | Minor | `BibleEnv.jsx:485`; `console.css:209` | The Bíblia's No ar agora monitor always has a red frame, even with nothing on air. | Red only while something is on air. | S | CRIT-17 |
| C-50 | Minor | `layoutChoices.js:11` | The Painel de abas (Notas, Aviso rápido, Timers) isn't in Ver; on notebooks it starts in the tray; it has two names. | Add it to Ver's switches under one name. | S | CRIT-18 |
| C-51 | Minor | the Programa column (1366 and 1920) | Spare width or height beside the 16:9 monitor goes unused while the lists are cramped. | Give the spare to the Prévia row or the neighbours. | M | CRIT-19 |
| C-52 | Minor | `Popovers.jsx:52,85,191`; `menuBar.js:64`; `Library.jsx:170`; `MediaView.jsx:204` | Labels vary: "Atalhos" vs "Atalhos do teclado", "…" used unevenly, "Enviar" both uploads and sends to air, "Biblioteca" names three things, English "live"/"OBS". | One label per command, one rule for "…", "Enviar arquivos…", "Mídia", "biblioteca de fundos", "transmissão ao vivo". | S | CRIT-20, CRIT-21 |
| C-53 | Minor | `SongEditor.jsx:341`; `NoticeEditor.jsx:123`; `MaterialView.jsx:96,112` | A held Ctrl+S or a double click can create a new song, aviso or material twice. | Return early on `busy` or `e.repeat`; give MaterialView a busy state. | S | CODE-09 |
| C-54 | Minor | `kx.jsx:169-178` (`Row`) | Truncated row titles have no tooltip (0 of 9 rows). | `title` on `Row` when the title is a string. | S | CODE-11 |
| C-55 | Minor | `kx.jsx:155-161` (`Field`); `main.cjs:176-186` | Spellcheck squiggles in the search, reference and URL fields (confirmed by the owner on the desktop app), and the text menu has no Desfazer and no suggestions. | `spellCheck={false}` by default in `Field` (on for lyrics and notes); add undo/redo and suggestions to the text menu. | S | CODE-12, WIN-13 |
| C-56 | Minor | `Console.jsx:883`; `AddMenu.jsx:30-31`; `BibleEnv.jsx:75-76` | The click-blur skips `.addmenu`, so its triggers keep the focus: after Esc, Enter reopens the menu instead of sending. | Blur the trigger on close, or exclude only `.addmenu-pop`. | S | CODE-13 |
| C-57 | Minor | `console.css:948,1348,1388,1392,1440`; `ThemeStrip.jsx:137` | Temas tiles, library tiles, generator presets and switches have no hover. | One hover rule for tiles and one for switches. | S | CODE-14 |
| C-58 | Minor | `TopBar.jsx:31`; `ScreenRenderer.jsx:68,157,338,459`; `Library.jsx:89` | Images are draggable; dropped in a field they type a `127.0.0.1` media URL. | `.kx img { -webkit-user-drag: none }`. | S | CODE-15 |
| C-59 | Minor | `bundle.css:94` (`.is-done` opacity .55) | Done Setlist rows' meta and time are at 2.70:1 though still usable. | Dim the title only, or use 0.75. | S | A11Y-17 |
| C-60 | Minor | `keys.js:14,51`; `TopBar.jsx:33`; `TabsPanel.jsx:14`; `Dock.jsx:249`; `MenuBar.jsx:15`; `SlidesPanel.jsx:76` | Tablist and menubar roles promise arrow keys that do nothing. With a Tab-focused slide, ↑/↓ move the green selection but not the focus, so Enter acts on another slide. | Roving tabindex and arrows (or drop the roles); ↑/↓ move the focus with the selection. | M | A11Y-18 |
| C-61 | Minor | `bundle.css:72`; unnamed Seg in BibleEnv | Seg's chosen option is 1.12:1, and several groups have no name. | A 1 px `fg-3` inset on `is-on`; `label` on every Seg. | S | A11Y-19 |
| C-62 | Minor | `kx.jsx:213-245` (`Split`) | Splitters give their value in px without min/max, and their name is an instruction. | Name them by panel and add min/max (or %). | S | A11Y-21 |
| C-63 | Minor | `VerifyView.jsx:167`; `ConfirmDialog.jsx:24`; `Popovers.jsx:437`; `SyncView.jsx:189` | State fills are used with other meanings (a green "Fechar", a red "Excluir", a blue "Gravando"), and there's no danger variant. | Add `kx-btn-danger`; outline or brand for Fechar and Gravando. | S | SYS-08 |
| C-64 | Minor | `kx.jsx:66-71,120-127`; 42 raw `kx-btn` copies | Button size is set three ways (six heights), and there's no `forwardRef`, so 42 hand copies exist. | `forwardRef` and a `size` prop (24/28/32/40); replace the copies. | M | SYS-09 |
| C-65 | Minor | spacing and radii across `console.css`, `bundle.css` | Spacing is about 60 % tokenised (6/3/5/10/14 px off the scale), with 58 raw radii and five chip families. | `--space-1-5` (6 px) as the only half-step; radius tokens; one `kx-chip`. | M | SYS-10, SYS-11 |
| C-66 | Minor | `console.css` (52 literal z-index) | No layer scale; two layers share z-index 30. | z-index tokens (`--z-pop`, `--z-window`, `--z-confirm`…). | S | SYS-13 |
| C-67 | Minor | `Janela.jsx:239`; `console.css:272-281,454-456` | Density doesn't reach `/Janela` or the dense modules (Camadas, verses, menus). | Pass the density to `/Janela`; Compacta tightens layer, verse and menu-item rows. | S | SYS-14 |
| C-68 | Minor | `console.css:1049,1066`; `bundle.css:37` | Two panel headers may wrap, and the header height isn't a token. | `--panel-head` (32/28) token; drop-then-hide instead of wrapping. | S | SYS-15 |
| C-69 | Minor | `Popovers.jsx:418`; `MediaView.jsx:235`; `console.css:923` | No loading state (busy button, `aria-busy`) and no field error state. | `kx-btn.is-busy` and `[aria-invalid]` on the field class. | M | SYS-16 |
| C-70 | Minor | `console.css:126,129,816,847,1431`; `Popovers.jsx:58,74,145,454` | Floating surfaces use three grounds and literal widths. | One ground per surface kind; widths in CSS classes. | S | SYS-17 |
| C-71 | Minor | `bundle.css` (18 dead classes); `tokens.css:58-72` (bare `.meta`, `.content`…) | Dead classes, and bare global type classes waiting to collide (like C-04). | Prefix them (`kx-type-*`) or drop them; mark the canvas-only classes. | S | SYS-18 |
| C-72 | Minor | `MediaView.jsx:61-72,174-181`; `ServicePlanner.jsx:322`; `SchoolView.jsx` | No right-click in the Mídia, the planner or the Escola; the arrow keys don't move the Mídia selection; Delete and F2 work only in the Mídia. | The same context menus as their console counterparts; arrow selection in the Mídia. | M | WIN-11 |
| C-73 | Minor | `keys.js:69`; `SettingsView.jsx:77` | Ctrl+F does nothing ("/" is awkward on ABNT2). | Ctrl+F as an alias of "/", listed in Atalhos. | S | WIN-12 |
| C-74 | Minor | `ConfirmDialog.jsx:22-25`, `PromptDialog.jsx:27-30`, `Popovers.jsx:279-282`, `BackgroundLibrary.jsx:300`, `closeGuard.cjs` vs `system.cjs`, `Dock.jsx:183`, `TelasSection.jsx:267` | Dialog button order changes from dialog to dialog. | Windows order everywhere (the action, then Cancelar), default as in C-10. | S | WIN-14 |
| C-75 | Minor | `Console.jsx:1254`; `editorWindow.js:32`; `main.cjs:132-146` | Detached `/Janela` windows have two close buttons, no minimum size, open at 1280×820 (taller than 768) and forget their bounds. | Console-like chrome (hidden titlebar + overlay, WinBar as the drag strip), min 760×480, remembered bounds per page kind. | M | WIN-15 |
| C-76 | Minor | `outputs-manager.cjs:81-94,158-160` | Any display-metrics change re-presents every output (a full-screen flash on the projector). | Skip outputs already full screen on their display with the same bounds. | S | WIN-16 |
| C-77 | Minor | `outputs-manager.cjs:138-144` | Ctrl+W closes an output, but nothing tells the operator. | Name it in the Saídas tooltip and in Atalhos. | S | WIN-17 |
| C-78 | Minor | `console.css:9-10`; `Console.jsx:1305` | The 32 px caption strip holds only "KERYX"; the top chrome takes 84 px of a 720 px work area. | Put the top bar in the caption row (`env(titlebar-area-*)`, drag/no-drag). | M | WIN-18 |
| C-79 | Minor | `index.html:2`; `main.cjs` | `lang="en"`: Narrator reads pt-BR with English pronunciation, and Chromium's own strings may be English. | `<html lang="pt-BR">` and `--lang=pt-BR`. | S | WIN-19 |
| C-80 | Minor | `useConsoleData.js:18-23`; `Library.jsx:205`; `Rundown.jsx:59` | At launch the lists flash their empty states ("Nenhuma letra…") before the data arrives. | Show `Empty` only once loaded. | S | POL-03 |
| C-81 | Minor | `console.css:628` | The drag card tilts −0.6° (soft text, web-playful). | Keep scale 1.03 and the shadow; drop the rotate. | S | POL-04 |
| C-82 | Minor | `Library.jsx:38,62-73` (`usePeek`) | The hover peek restarts its 350 ms delay on every row (it blinks while scanning). | Hand over instantly between rows while a peek shows. | S | POL-05 |
| C-83 | Minor | `console.css:1096,1269-1271`; `MediaView.jsx:235` | Under reduced motion, indeterminate bars freeze at fake values (30 %, 60 %). | A full-width bar with an opacity pulse. | S | POL-06 |
| C-84 | Minor | `bundle.css:16` (`.kx-t`) on slides, No ar cards and verses | Keyboard state changes (↑/↓/←/→) cross-fade over 120 ms, so the highlight trails a held key. | Transition only on hover; state classes switch instantly. | S | POL-08 |
| C-85 | Minor | `console.css:317` vs `:329` | Hover (bg-2) is one step from the next-slide marker (bg-3), so a second "next" wanders down the list. | Suppress hover during key moves, or a distinct next-slide mark. | S | POL-09 |
| C-86 | Minor | `console.css:169-171,286-288`; rows, slides, verses, tiles | No pressed state on the pill's screen actions, the top-bar buttons, rows and tiles. | An `:active` step on those overrides and a pressed tint on rows. | S | POL-10 |
| C-87 | Minor | `src/index.css:235-238` | Scrollbars appearing shift every row by 10 px. | `scrollbar-gutter: stable` on the console's lists. | S | POL-12 |
| C-88 | Minor | `console.css:1331` vs `:1396,1424` | Range sliders are green (the Prévia's colour) in the background library and gold in the editors. | One accent (brand gold). | S | POL-13 |
| C-89 | Minor | `Icon.jsx:28-37` | 1.5-unit strokes at 12/10 px render at 0.6–0.75 px (faint). | Keep about 1 device px (`strokeWidth = 24/size` or non-scaling stroke). | S | POL-15 |

## Fix batches, in recommended order (Blockers first)

Each batch is one focused session that touches the files listed. Batches marked ✋ need an owner decision first.

| # | Batch | Findings | Files touched | Effort |
|---|-------|----------|---------------|--------|
| 1 | **Projector safety (main process)** | C-01, C-02, C-76, C-77, C-34, C-35, C-79 | `electron/main.cjs`, `outputs-manager.cjs`, `outputs.cjs`, `index.html` (+ the Saídas tooltip and Atalhos) | M |
| 2 | **CSS and token quick fixes** | C-04, C-07, C-20, C-92, C-58, C-81, C-87, C-88 | `docs/design-system/tokens.css/json`, `src/index.css`, `bundle.css`, `console.css`, `screen.css`, `activity.css` | S |
| 3 | **Live keys and focus** | C-03, C-56, C-09, C-90, C-10, C-11, C-12, C-13, C-73, C-53 | `Console.jsx`, `keys.js` (+test), `Projection.jsx`, `ConfirmDialog.jsx`, `PromptDialog.jsx`, `MediaView.jsx`, `ScreenEditor.jsx`, `useConsole.js`, `SongEditor/NoticeEditor/MaterialView.jsx` | M |
| 4 | **Windows contrast themes and screen readers** | C-05, C-25, C-26, C-27, C-28, C-29, C-59, C-61, C-62 | `console.css`, `bundle.css`, `screen.css`, `ScreenRenderer.jsx`, `kx.jsx`, `Console.jsx`, `Janela.jsx`, `Rundown/SlidesPanel/OnAirPanel/BibleEnv.jsx`, `settings/parts.jsx` | L |
| 5 | **Clarity while live** | C-06, C-08, C-17, C-46, C-45, C-49, C-48, C-84, C-85, C-86, C-80 | `SlidesPanel.jsx`, `Rundown.jsx`, `Console.jsx`, `CenterPanel.jsx`, `Layers.jsx`, `BibleEnv.jsx`, `useConsoleData.js`, `console.css`, `bundle.css` | M |
| 6 | **Menus and keyboard navigation** | C-14, C-15, C-16, C-60, C-72 | `MenuBar.jsx`, `Popovers.jsx`, `ContextMenu.jsx`, `AddMenu.jsx`, `kx.jsx` (MenuItem), `TopBar.jsx`, `TabsPanel.jsx`, `Rundown.jsx`, `ServicePlanner.jsx`, `useSortable.js`, `MediaView.jsx`, `main.cjs` (F10) | L |
| 7 | **Design-system controls** | C-21, C-22, C-23, C-63, C-64, C-69, C-57, C-67, C-83 | `bundle.css`, `console.css`, `kx.jsx`, `ConfirmDialog.jsx`, `VerifyView.jsx`, `SyncView.jsx`, `Janela.jsx`, `Popovers.jsx` | L |
| 8 | **Copy and names** | C-18, C-19, C-38, C-39, C-40, C-41, C-42, C-43, C-44, C-47, C-50, C-52, C-74 | `electron/outputs.cjs`, `network/views.js`, `SongEditor.jsx`, `ServicePlanner.jsx`, `TemasSection.jsx`, `BackgroundLibrary.jsx`, `BibleEnv.jsx`, `layoutChoices.js`, `Popovers.jsx`, `menuBar.js`, `Library.jsx`, `MediaView.jsx`, the dialogs, `resources/` names | M |
| 9 | **Editors and detached windows** | C-33, C-75, C-54 | `ScreenEditor.jsx`, `ThemeEditor.jsx`, `main.cjs` (window options), `Janela.jsx`, `editorWindow.js`, `kx.jsx` (Row title) | M |
| 10 | **Motion** | C-37, C-82 | `console.css`, `Dock.jsx`, `kx.jsx` (Measure), `Library.jsx` | M |
| 11 | **Type, tokens and docs** | C-31, C-32, C-65, C-66, C-68, C-70, C-71, C-89 | `tokens.css/json`, `bundle.css`, `console.css`, `Icon.jsx`, `docs/design-system*.md` | L |
| 12 | **More Windows integration** | C-30, C-91, C-36, C-55, C-78, C-51 | `main.cjs`, `build/icon.ico`, `kx.jsx` (Field), `console.css`, `Dock.jsx`/`dock.js` | M |

The order is batches 1–4 (Blockers) first, then 5 (the live flow), then 6–12. Batches 1, 2 and 3 are small enough to land before 0.2.19 if the owner wants: C-01, C-04 and C-03 are each a few lines.

## Top 5: biggest effect for the least effort

1. **C-04** (S): rename the `--popover` shadow token. One rename gives the Camadas drawer and the Desfazer toast their edge back on the target notebook.
2. **C-01** (S): `prevent-display-sleep` while outputs are open, so Windows never blanks the projector during a sermon.
3. **C-03** (S): blur selects after a pick and treat them as controls in keys.js, so the live keys (Tela preta included) never die after touching a select.
4. **C-06** (S): Anterior/Próximo under the Prévia's slides must not move the air. Today one click changes the projector by mistake.
5. **C-10** (S): Cancelar is the default in Excluir/Descartar questions, so a reflex Enter never deletes a song or discards an edit.

The next tier, just as small: C-07 (outputs keep their transitions), C-20 (no hand cursor) and C-08 (the Setlist stops saying the last song is on air).

## Needs manual check (combined)

### On the church PC (or a Windows 11 test PC), installed build
- **Sleep (C-01).**
  1. Set Energia › "Desligar a tela após 1 minuto".
  2. Put a verse on air, touch nothing for 2 minutes and watch the projector.
  3. Repeat with a 1-minute screen saver.
- **Unplugging (C-02).**
  1. With Projeção full screen on "auto" and a song on air, unplug the projector or press Win+P › "Somente na tela do PC".
  2. Note where the output lands, whether it covers the console, whether the pointer disappears, and whether "Reconectando…" is visible.
  3. Plug it back in. Repeat with the Palco.
- **Window chrome.**
  1. Hover maximize to see Snap Layouts.
  2. Check the button order −, □, × at about 46×32 px, × red on hover, and dimmed symbols when inactive.
  3. Double-click, drag and right-click the "KERYX" strip; try Alt+Space.
- **First launch (C-34).**
  1. On the 1366×768 notebook at 100 % and 125 %, see where the 1440×900 window lands.
  2. Check whether the bottom (No ar, the player) sits under the taskbar.
  3. Check that maximized still fits at 125 %.
- **Taskbar identity.**
  1. Pin KERYX from Start, close it, then open it from the pin: there should be one taskbar button.
  2. Check that detached pages group under it (AUMID).
- **DPI.**
  1. Use the notebook at 150 % with a projector at 100 %.
  2. Check that the outputs are sharp and full screen.
  3. Drag the console and a detached page between the monitors; they should redraw sharp.
- **Light-mode chrome (C-35).** With Windows in light mode, look at:
  - a detached page's title bar;
  - an output "Em janela";
  - a text field's menu;
  - the open/save dialogs;
  - the close question.
- **Scrollbars.** Thin warm thumbs, with no light arrow buttons, on Windows 10 and 11.
- **Windowed outputs.** "Em janela" is a tool window, so check that the Saídas name brings it forward.
- **Display numbers.** "Tela 1" in KERYX vs Windows' Identificar: is the difference intended?
- **Output focus:** confirmed by the owner, now C-90.
- **Electron zoom:** Ctrl+wheel zooms (owner), now C-91. A touchpad pinch is still to check.
- **Spellcheck (C-55):** confirmed by the owner.
- **Native select popups:** hard to read (owner), now C-92.
- **C-04 in the packaged app.** Check the Camadas drawer's edge and the Esc toast's frame.
- **Fonts at a cold start.** The first frame should have its text (`font-display: block`).
- **Frame cost.** With DevTools › Performance in `desktop:dev`, check that the No ar fold and THE window's resize stay at 60 fps on the church notebook.
- **Media and settings.**
  - Real images in the Mídia should get their stills (they show black in the preview).
  - The Bíblia without an edition should show "Instalar …".
  - The real Backup e atualizações section.
  - The bundled logo is a square photo: check it on the projector; a transparent PNG may be wanted.
- **Legibility.** The 9–10 px text and the slide-row state contrast (gold 24 % over bg-2 vs bg-3), at 125–150 % on the church notebook.

### Accessibility, with real assistive technology
- **NVDA 2024+ / Narrator (C-25).**
  1. Send a song (Enter) and press Esc; listen for "Projeção encerrada".
  2. Lock the screens and try to send; listen for the refusal.
  3. Note which toasts are spoken.
- **Nested rows (C-27).** In Narrator scan mode, arrow through Setlist, Biblioteca and Camadas rows. Check that Ir, Editar, ★, Ocultar and Travar are separate buttons, and what name each row gets.
- **Contrast theme (C-05).**
  1. Set Accessibility › Contrast themes › "Night sky".
  2. Send a song and walk it with →. Check that the Slides column, No ar, the Setlist and the verses show the air and the Prévia.
  3. Check Configurações (switches, segments, selects).
  4. Compare the Projeção on a second monitor: if its colours are forced, it is a Blocker on its own.
- **Text size and scaling (C-30).**
  1. Set Accessibility › Text size 150 % and restart; check for clipping.
  2. Set Display › Scale 125 % on 1366×768 and repeat.
- **Shift+F10 / the Menu key.** On a Tab-focused Setlist row, slide and verse, the menu should open at the row with the focus inside.
- **Detached pages.** The Tab order should start inside `/Janela`. Check Alt+Space and the caption buttons from the keyboard.
- **Focus ring at fractional DPI.** The 2 px inset gold ring should stay visible on the edge-to-edge Slides rows and on the pill.

### Questions for the owner (decisions in CLAUDE.md or open)
1. **C-09:** answered 16/10: drop click-to-advance.
2. **C-10 / C-74:** Cancelar as the default: answered 16/10, yes. The Windows button order (C-74) is still to confirm.
3. **C-24:** answered 16/10: colour only. No glyph; C-24 is closed by the owner's decision (C-05 still gives contrast themes their cue).
4. **C-21:** answered 16/10: the quiet grey line, raised to `fg-3` (≥3:1), non-gold.
5. **C-37:** answered 16/10: 180 ms (code changes to match the docs).
6. **C-18:** answered 16/10: "Avisos" everywhere.
7. **WCAG 2.1.4:** offer "Teclas de uma letra: ligadas / com Shift / desligadas" in Configurações › Console?
8. **The Aviso rápido's entrance:** follow the outputs' "ignore reduced motion" (C-07), or stay the E3 exception?
9. **No ar fold:** fold on every Tela preta, Logo, aviso or timer (motion triggered by keys), or keep the strip dimmed while the lyrics are only covered?
10. **The Programa monitor under reduced motion:** freeze the generated background like the still previews?
11. **Pill actions:** glyph-only Tela preta / Logo / Limpar / Encerrar; add a word at ≥1366?
12. **Two on-air colours** (gold in Slides/No ar, red elsewhere): do they still read as one state to volunteers?
13. **Temas:** nine empty slots for a church with no themes, or one line?
14. **Planned times:** per-item times and "termina às" are shown although the church plans order only (2026-10-12). Keep them?
15. **Send verbs:** "Ir", "Tocar", "Projetar" beside "Enviar ao ar". One verb?
16. **"Qualquer outro culto…"** in the Camadas › Fundo menu doesn't say it's about the papel de parede.
17. **The song's own look** (font, colour, background in the Editor de música) beside "the Editor de temas is the only theme editor": intended?
18. **Text selection:** Bible text and lyrics can't be selected (copying works from the menu). Wanted?
19. **Red fill for Excluir/Descartar** (C-63): a danger token of its own?
20. **Menus, dialogs, toasts:** keep them instant (recommended), or a 100–150 ms fade-in?
