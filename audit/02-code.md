# PASS 2 — UI code guidelines (CODE-)

Audit only, 16/10/2026, branch `audit/design-0219` (0866cb4). Ran the
**web-design-guidelines** skill: Vercel's Web Interface Guidelines
(`command.md`, fetched today), with this pass's desktop overrides. Skipped:
mobile/touch, viewport meta, breakpoints below 1024 px, SEO, prefetching,
page metadata, the main process and `src/components/ui/`. Added: the
Electron checks (cursor, user-select, scrollbars, browser behaviours) and the
KERYX rules (a click never leaves focus on a control; keys go through
`src/lib/console/keys.js`).

Method: read the renderer (`src/pages/*.jsx`, `src/components/console/**`,
`src/components/screen/**`, the CSS they load), plus scripted scans for form
fields, clickable non-buttons, hover rules and key listeners. Findings
marked **verified** were reproduced in the browser preview (`keryx-ui`,
1366×768, sample data).

What passed (no finding): `color-scheme: dark` on `:root`; scrollbars are
thin and themed everywhere (`* { scrollbar-width / scrollbar-color }`,
src/index.css); `user-select: none` on the console, with text left
selectable in fields, URLs, paths and the sync code (`user-select: all`),
plus copy buttons for the code, URLs and verses; no browser context menu
(electron/main.cjs:176 shows Recortar/Copiar/Colar only in text fields);
outputs hide the cursor (outputs-manager.cjs:15); tabular figures on the
console root (bundle.css:4) and every output root (screen.css:5,
layout.css:6, net.css:8); no `transition: all`; 102 of 104 form fields have
a label; icon buttons are named (`IconBtn`, the Programa pill);
ContextMenu.jsx moves focus in and hands keys back; splitters are focusable
`role="separator"`s with keyboard resize.

| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
| CODE-01 | Blocker | src/pages/Console.jsx:883; src/lib/console/keys.js:11, :45; src/components/console/BibleEnv.jsx:376; Layers.jsx:363; SongEditor.jsx:383 +21 more `<select>`s | A native `<select>` keeps the focus after a mouse pick (the click-blur list in Console.jsx skips `select`), and keys.js counts a select as a text field, so every live key returns null: B / L / C, Enter, ←/→ and the Bíblia's quick jump (keys.js:57's select case is unreachable). **Verified:** with Livros' Versão focused, typing "a" to start a reference switched NVI → ACF and opened no quick jump. | Breaks "a click never leaves focus on a control" during a service: Tela preta's key is dead, and the next passage can go out in another translation without the operator noticing. | Blur a select after its `change` and classify `select` as a control in keys.js (it keeps only its own ↑/↓). | S |
| CODE-02 | Major | src/components/console/ServicePlanner.jsx:293, :304; useSortable.js:167 | Planejar o culto's rows are `<div onClick>` with no role, tabIndex or key handler: an item's details (Título, Duração, Notas, Duplicar, Tirar da setlist…) open only with the mouse. The Setlist's and the planner's order changes only by dragging (Camadas has Subir/Descer in its menu, Layers.jsx:235). | Flow 1 cannot be done from the keyboard; a keyboard or screen-reader user cannot reorder the culto. | Build planner rows on `Row` (role, Enter/Space) and add Subir / Descer to the Setlist and planner row menus. | M |
| CODE-03 | Major | src/pages/Console.jsx:1354–1356; ConfirmDialog.jsx:16; PromptDialog.jsx:12; SongEditor.jsx (new song) | THE window is `aria-modal="true"`, but nothing moves the focus into it or keeps it there. **Verified:** opening Configurações leaves focus on `<body>`, and the first Tab lands on the console's "Menu" button behind the scrim (48 console controls stay in the tab order). ConfirmDialog and PromptDialog focus their button or field, but Tab walks out to the console. "Nova música" opens with no field focused. | Keyboard users start every page in the console behind it, and Enter on a console button behind the scrim acts there. | Make `.main` and the top bar `inert` while the window or a dialog is open; focus the page's first field on open. | M |
| CODE-04 | Major | src/pages/Projection.jsx:36–57, :64–77 | The Projeção window moves the slide on air on a single click anywhere (left half back, right half forward), and keeps its own key map outside keys.js: Space = next slide (the console's Space is Tocar/Pausar), no C, no ↑/↓. | On a one-monitor PC the Projeção is an ordinary window, so clicking it to bring it forward changes what the audience sees. This goes against "a single click never sends". | Drop click-to-advance (or confirm it with the owner) and send the window's keys through `liveAction`. | S |
| CODE-05 | Major | src/components/screen/screen.css:135–136; activity.css:44–47; screen.css:80 | Under `prefers-reduced-motion` (Windows › Efeitos de animação off, common on PCs set for best performance), every renderer drops the slide entrance transitions (`.ks-anim-fade/slide/zoom`), the activities' reveals and the urgent aviso pulse, the output windows included. The exit fades keep playing (ScreenRenderer.jsx:40, `!preview \|\|`). | The spec says outputs ignore reduced motion. Because of a console-PC setting, the theme's transition disappears from the projector while the exit fade stays, so the two no longer match. | Scope those reduced-motion rules to the console's previews (e.g. `.kx .ks-anim-…`). Keep `.ks-alert`'s (the owner's call). | S |
| CODE-06 | Major | src/components/console/MenuBar.jsx:79, :92; src/pages/Console.jsx:1382; Popovers.jsx (logo Menu, Ver, Saídas, Notificações) | The menu bar's ↑/↓/←/→ handler sits on the popup, but opening a menu by click or Enter leaves focus on the button (or `<body>`). The popup is rendered at the end of the console, so the arrows reach nothing. **Verified:** with Culto open, ↓ and → did nothing. There is no Alt/F10. The top-bar popovers (including Saídas with Travar telas) don't focus their first item either; only the palette and Encerrar do (Popovers.jsx:272, :302). | Desktop menus that can't be walked from the keyboard. Saídas and Travar telas need the mouse during a service. | Focus the first item when a menu or popover opens (as ContextMenu.jsx:38 does) and return focus on Esc; F10/Alt opens the bar. | M |
| CODE-07 | Major | docs/design-system/components/bundle.css:14; src/index.css:1 (Tailwind preflight); console.css:222, :455, :464, :473, :490 +11 more | The design system sets `cursor: default` on buttons through `:where()`, which has zero specificity, so Tailwind's preflight `button,[role=button]{cursor:pointer}` wins. **Verified:** 57 of 71 console controls show the hand, every Biblioteca and Setlist row included. console.css also sets `cursor: pointer` on 16 classes. | Windows programs show the arrow on buttons and list items; the hand cursor makes it look like a web page. | One rule `.kx :is(button,[role=button]) { cursor: default }` (above preflight's specificity), and drop the explicit `pointer`s; keep the hand only for real links. | S |
| CODE-08 | Major | src/components/console/console.css:795, :797, :256, :1009, :1056; :981 (`.cfg-inline`), :1117 (`.mv-rename`) | Fields and selects replace the design system's 2 px gold focus ring (bundle.css:80) with a 1 px `--line-strong` (#4a4840) inset on `--bg-2` (#20201d), about 1.8:1. `.cfg-inline` (Culto, background categories) and `.mv-rename` already wear that line at rest, so focus changes nothing; `.kx-split-pct-in` (:466) has no focus style at all. | Below the 3:1 contrast WCAG asks of a focus indicator. In a dark room a focused select looks the same as the others. | Use the design system's ring on `:focus-visible` for `.kx-field`, selects, `.pl-input`, `.ed-text`, `.cfg-inline` and `.mv-rename`. | S |
| CODE-09 | Minor | src/components/console/SongEditor.jsx:341; NoticeEditor.jsx:123; MaterialView.jsx:96, :112 | Ctrl+S calls `save()` without checking `busy` or `e.repeat`, and MaterialView has no busy state (its Salvar never disables). On a new song, aviso or material, a held Ctrl+S (key repeat) or a double click can run `create` twice before `replaceTop` swaps "new" for the id. | Duplicate rows in the Biblioteca. | Return early on `busy` or `e.repeat`; give MaterialView SongEditor's busy and "Salvando…" (SongEditor.jsx:373). | S |
| CODE-10 | Minor | src/components/console/ConfirmDialog.jsx:15, :24 (Excluir…; "Descartar as mudanças?" from SongEditor.jsx:328, NoticeEditor.jsx:89, MaterialView.jsx:85, editor/ScreenEditor.jsx:172 +1 more) | The dialog focuses the destructive button, so Enter answers Excluir or Descartar. | Enter is the operator's reflex for sending to air. Windows makes the safe button the default for an irreversible action. | Focus Cancelar by default (Esc already answers no). | S |
| CODE-11 | Minor | src/components/console/kx.jsx:169–178 (`Row`); bundle.css:96 | `.kx-row-title` and `.kx-row-meta` cut long text with "…", but `Row` sets no `title`. **Verified:** 0 of 9 rows carry one; a long song title is cut with no way to read the rest (the Slides column does have its tooltip). | In the Biblioteca, Setlist and Mídia, near-identical titles differ only in the hidden end ("…(ao vivo)"). | Give `Row` `title={typeof title === "string" ? title : undefined}`. | S |
| CODE-12 | Minor | src/components/console/kx.jsx:155–161 (`Field`); Popovers.jsx:338; Library.jsx:196, :275; BibleEnv.jsx:427 | `Field` leaves spellcheck on (Electron's default), so the palette, the Biblioteca's and the Bíblia's search fields and the YouTube link field get red squiggles under "jo 3 16" or a URL. The text-field menu (electron/main.cjs:176) offers no suggestions. Only 5 fields opt out. | Red underlines in search fields, with no way to act on them. | Default `spellCheck={false}` in `Field`; keep it on for lyrics and notes. | S |
| CODE-13 | Minor | src/pages/Console.jsx:883; AddMenu.jsx:30–31; BibleEnv.jsx:75–76 (also Library.jsx:198, BibleEnv.jsx:378) | The click-blur skips everything inside `.addmenu`, so the Biblioteca's +, the Bíblia's install + and Favoritos/Anotações keep the focus on their trigger. **Verified:** after "Adicionar letra" is closed with Esc, focus stays on it, so Enter reopens the menu instead of sending the Prévia, and Space presses it instead of Tocar. | Live keys silently go to a menu button. | Blur the trigger when its menu closes, or exclude only the popup (`.addmenu-pop`) from the click-blur. | S |
| CODE-14 | Minor | src/components/console/console.css:1348 (`.fg-tile`), :1388 (`.lyr-gen`), :1392 (`.lyr-preset`), :1440 (`.lib-swatch`), :948 (`.sw2`); ThemeStrip.jsx:137 | The Temas tiles (a click dresses the text on air), the background library's tiles and swatches, the generator tiles and presets and the switches have no hover state. Every other console button has one. | No feedback before a click that changes what is on air. | One hover rule for the tiles (a `--line-strong` ring on `.fg-img`) and one for the switch. | S |
| CODE-15 | Minor | src/components/console/TopBar.jsx:31; screen/ScreenRenderer.jsx:68, :157, :338, :459; Library.jsx:89 | Only SlidesPanel.jsx:106 sets `draggable={false}`, and no CSS sets `-webkit-user-drag: none`. **Verified:** the top-bar logo and the pictures in the Programa/Prévia monitors are draggable. A drag shows the browser's ghost image; dropped in a text field, it types an `http://127.0.0.1:7700/media/…` URL. | A visible browser behaviour in a desktop console. | Add `.kx img { -webkit-user-drag: none; }` to console.css. | S |
| CODE-16 | Minor | src/components/console/kx.jsx:171, :177; ThemeStrip.jsx:137; TopBar.jsx:40–41 | `Row` is `role="button"` yet holds its action buttons (nested controls, flattened by screen readers). The Temas tiles are `<button role="listitem">`, which removes the button role and leaves `aria-pressed` invalid. The top-bar search is a `div role="button"` around a read-only input; it opens on Enter but not on Space. | Wrong roles for assistive technology, and Space on a focused "button" does nothing. | Make rows listitems with the actions beside them, wrap the tiles in an `li`, and make the search a real `<button>`. | M |
| CODE-17 | Minor | src/components/console/settings/parts.jsx:73–80 (`FormRow`), e.g. ConsoleSection.jsx:63 "Iniciar com o Windows" | A row's name is a `<span>` linked by `aria-labelledby`, so clicking "Iniciar com o Windows" (and every other row name in Configurações) neither toggles the switch nor focuses the field. | On Windows, a click on a check box's or field's label works the control. | Render a `<label htmlFor>` when the row holds one control, or pass the click on to it. | S |

## Needs manual check

- **Zoom (Electron):** electron/main.cjs sets no zoom limits and has no
  `zoom-changed` handler. Electron should not zoom on Ctrl+wheel or a
  touchpad pinch by default; confirm in `desktop:dev` that both do nothing.
- **Spellcheck (CODE-12)** happens only in Electron; confirm the squiggles in
  `desktop:dev` on a pt-BR Windows.
- **Shift+F10 / the Menu key** on a row reached with Tab: ContextMenu places
  its menu from `clientX/clientY` (ContextMenu.jsx:22). Check that it opens
  beside the row, not at 0,0.
- **Owner question (CODE-04):** is click-to-advance on the Projeção wanted,
  for example with a wireless mouse used as a clicker? If so, it should at
  least respect "a single click never sends" on a one-monitor PC.
- **Owner question (CODE-10):** which button should be the default in
  "Excluir …?" and "Descartar as mudanças?"? CLAUDE.md fixes only that Esc
  answers no.
- **Output focus:** only the Projeção answers B / L / Esc
  (Projection.jsx:64–77). If a Letras, Vídeo or Comunicação window takes the
  focus on this PC, the screen keys go nowhere until the console is
  clicked. Check whether the main process hands the focus back.
- **Native select popups** under `color-scheme: dark` in Electron on
  Windows: check the colours and contrast of the open list.
- **Text selection:** the body is `user-select: none`, and the
  `.bible-content` / `[role=article]` opt-ins in src/index.css match nothing
  in the console, so Bible text and lyrics can't be selected (copying a verse
  works from its menu, BibleEnv.jsx:353). Owner to confirm that is wanted.

## Top 3 to fix first

- **CODE-01:** blur selects after a pick and treat them as controls in
  keys.js. Today a mouse-picked select kills every live key, Tela preta's
  included, and can switch the Bible translation.
- **CODE-05:** scope the reduced-motion rules to the console's previews, so
  the projector keeps the theme's transitions as the spec says.
- **CODE-04:** stop single clicks on the Projeção window from moving the slide
  on air, and route its keys through keys.js.
