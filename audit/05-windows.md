# PASS 5 — Windows desktop conventions (WIN-)

Audit only, on `audit/design-0219` (0866cb4, the 0.2.19 candidate). This pass
has no skill, so the checklist was applied by hand. Sources read:
`electron/main.cjs`, `outputs.cjs`, `outputs-manager.cjs`, `closeGuard.cjs`,
`preload.cjs`, `system.cjs`, `data-ipc.cjs`, `package.json` › `build`,
`index.html`, `src/index.css`, `docs/design-system/components/bundle.css`,
`console.css`, `keys.js`, `MenuBar.jsx`, `ContextMenu.jsx`,
`ConfirmDialog.jsx`, `PromptDialog.jsx`, `MediaView.jsx`, `ScreenEditor.jsx`
and `Console.jsx` (keys, root markup, detach). The cursor claim (WIN-09) was
checked in the browser preview (`getComputedStyle`). Window chrome, DPI,
monitors and Narrator need a real Windows run: see "Needs manual check".

The KERYX rules win over the generic checklist: live keys follow Holyrics
(not reported), the app is dark only (no "follow the Windows theme" finding:
WIN-08 is about Windows drawing *light* chrome around a dark app), and the
wording follows CLAUDE.md's copy rules.

**Already right, so not listed:** a single-instance lock that restores and
focuses the first window (`main.cjs:97-104`); no white flash (`show: false`,
`ready-to-show`, `backgroundColor` = `--bg-0`, outputs black;
`main.cjs:216-234`); a sensible minimum size of 960×600; the caption strip is
a drag region with nothing clickable in it, and the top bar starts below it, so
no control sits under the caption buttons (`console.css:9-10`); the floating
page window (`.win-dialog`) and the popovers start at `--pop-top`, below the
strip; a pt-BR native
Recortar/Copiar/Colar menu in text fields; native, pt-BR file dialogs with
filters (`data-ipc.cjs:99-140`, `system.cjs`); the console's X asks first,
detached pages with unsaved changes hold their window (`closeGuard.cjs`), and
the outputs and detached pages close with the console; outputs are kept out of
the taskbar and Alt+Tab, are always on top on their own monitor, hide the
pointer and give the keyboard back to the console; SVG icons (crisp at any
scale); themed thin scrollbars (`src/index.css:235-238`); the console's own
right-click menus take ↑/↓/Enter/Esc and focus their first item; tooltips on
icon buttons (`IconBtn` always sets `title`) that name the keys (Tela preta ·
B, Limpar texto · C, Salvar · Ctrl+S, Renomear · F2).

| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
| WIN-01 | Blocker | `electron/main.cjs` (whole file: no `powerSaveBlocker`; nothing in `src/` either) | Nothing keeps Windows from turning the displays off or sleeping the PC while KERYX projects. Chromium holds a wake lock only while a video plays, so a static slide (a verse during the sermon, lyrics, the papel de parede) gets no protection. | Windows' defaults turn every display off after a few idle minutes (a notebook on battery sooner) and sleep later. During a 30-minute sermon with no keyboard or mouse input, the projector loses its signal in front of the church: the "nothing broken reaches the projector" goal fails. | Hold `powerSaveBlocker.start("prevent-display-sleep")` while any output window is open (or while anything is on air), and release it when the last one closes. | S |
| WIN-02 | Blocker | `electron/outputs.cjs:67-70`, `outputs-manager.cjs:74-94`, `:128-137`, `:158-160` | When an output's monitor disappears (cable bumped, projector off, Win+P › Duplicar), `present()` takes it out of full screen and centres it at 1280×720 on the primary monitor, which is the console's. The window was created `frame: false` with type `toolbar`, so it is a frameless black box with no title bar, no taskbar or Alt+Tab entry, and the hide-pointer CSS still applies (the pointer vanishes over it). `setAlwaysOnTop(false)` most likely leaves it above the console. On the 1366×768 notebook it covers all but about 43 px on each side. The "Reconectando…" banner is drawn under it. | This happens live, on the default setup (Projeção on "auto"). The operator loses sight of the console and the pointer at the moment something already went wrong, and has no visible way to move or close the box. | On a missing monitor, hide the output (or keep it behind the console with the pointer back) until the monitor returns, and let the console's banner be the signal. | M |
| WIN-03 | Major | `src/components/console/ConfirmDialog.jsx:14-25` (every `useConfirm`: Excluir…, "Descartar as mudanças?", Trocar o código) | The question focuses its action button when it opens: Enter answers Excluir, Descartar, Trocar o código. The native close guard does the opposite and defaults to the safe "Cancelar" (`closeGuard.cjs:23-24`, `:43-44`). | Windows' rule for destructive confirmations is that the safe choice is the default. KERYX operators press Enter all the time (Enter = Enviar ao ar), so a reflex Enter permanently deletes a song or theme, or throws away an editor's unsaved work. | Focus "Cancelar" (the safe answer) when `ok` is destructive (Excluir, Descartar, Trocar o código), so the action needs Tab or a click. | S |
| WIN-04 | Major | `src/components/console/MediaView.jsx:178`; `src/components/editor/ScreenEditor.jsx:255` | Backspace deletes, as on macOS. In the Mídia, Backspace opens "Excluir da Mídia?" with Excluir focused (see WIN-03). In the Editor da tela, Backspace removes the selected element at once, with no question and no undo (WIN-05). | On Windows, Backspace means "back" or "erase a character", never "delete this item". A press outside a field (the field just lost focus, or the operator expected Voltar) deletes things; in the Mídia, Backspace then Enter removes the files from the library. | Keep Delete only (Windows' key) and drop Backspace from both handlers. | S |
| WIN-05 | Major | `src/components/console/MenuBar.jsx:12-25`, `:62-90`; `electron/main.cjs:278` (`Menu.setApplicationMenu(null)`) | The menu bar (Culto, Música, Mídia, Ferramentas) cannot be reached from the keyboard the Windows way. Alt and F10 do nothing, there are no access keys (Alt+C, Alt+M…), and opening a menu does not focus its first item. ↑/↓ only work once focus is already inside the menu, so after a click or after Enter on the button they do nothing (the console swallows them while a popover is open, `Console.jsx:837`), and Tab walks the rest of the top bar first. | The operator is keyboard-first, but Planejar o culto, Sincronizar, Aviso rápido and the timers are only a few clicks away. Every Windows program, Holyrics included, opens its menus with Alt or F10 and the arrow keys. | Alt or F10 focuses the first menu button; opening a menu focuses its first item; give each menu an access key (underlined letter). | M |
| WIN-06 | Major | `src/components/editor/ScreenEditor.jsx:240-256`; `ThemeEditor.jsx:177`; `src/lib/console/keys.js:69` | Outside text fields, Ctrl+Z and Ctrl+Y do nothing. In the Editor da tela, dragging, nudging (arrows), Delete and Ctrl+D (duplicate) cannot be undone, so the only way back is "Descartar as mudanças" (all of the session's work). The Esc's Desfazer exists only as the toast's button. | Ctrl+Z is the most expected shortcut in any Windows design editor. Without it one wrong Delete or drag costs every change since the last save. | Keep an undo stack of `draft` in the screen and theme editors (Ctrl+Z / Ctrl+Y, also Ctrl+Shift+Z). | M |
| WIN-07 | Major | `electron/main.cjs:216-234` | The console's size, position and maximized state are never saved. Every launch opens a 1440×900 window, centred and not maximized, on the primary monitor. On the 1366×768 target that is larger than the screen (Windows shrinks it to fit, still not maximized); on a 1920×1080 monitor it is a floating window that has to be maximized by hand before every culto. The dock's width tier (`dockTier`) is then chosen from that size. | Windows programs reopen where they were left. A volunteer who maximized KERYX, or moved it to the operator's monitor, has to do it again at every service, and the arrangement may come up in the wrong tier until they do. | Save the normal bounds and `isMaximized()` in `settings.json` on close; restore them on launch when they still fit a connected display (else maximize on the primary). | S |
| WIN-08 | Major | `electron/main.cjs` (no `nativeTheme.themeSource`), `:132-146` (detached pages and outputs from `window.open`), `:176-186` (the text menu); `outputs-manager.cjs:76` (windowed outputs) | KERYX never tells Windows it is dark, so Windows draws its own chrome in the system theme, which is light on a default Windows 11. That means a white title bar on every detached page (/Janela: song editor, Mídia, Escola…) and on an output set to "Em janela", and a white Recortar/Copiar/Colar menu in text fields. | In a dark room a white strip or menu flashes at the operator next to a dark console. It also looks as if two different programs were running. | Set `nativeTheme.themeSource = "dark"` at startup (dark only is the owner's decision); dialogs drawn by Windows (TaskDialog) stay light regardless. | S |
| WIN-09 | Major | `docs/design-system/components/bundle.css:14` vs Tailwind 3 preflight (`button, [role=button] { cursor: pointer }`); `console.css:473`, `:490`, `:1102`, `:1499`, `:1567` | Every button and list row shows the hand cursor. The design system means `cursor: default` (`:where(.kx) :where(button)`), but its zero specificity loses to the preflight's `button`. Checked in the preview: 32 of 32 console buttons, `.kx-row`, tabs and menu buttons computed `pointer`. console.css also sets `pointer` outright on the dock's tabs and ×, the Multiview thumbnails, the Telas e saídas cards and the Sincronizar rows. | On Windows, the hand belongs to links; buttons, rows and tabs keep the arrow. A hand on every control is the clearest "this is a website" tell in a native program. | Give the design-system rule specificity (`.kx button, .kx [role=button] { cursor: default }`) and drop the `cursor: pointer` lines from console.css. | S |
| WIN-10 | Major | `build/icon.png` (512×512, RGB, no alpha); `package.json` › `build.win.icon` | The only icon source is one opaque square photograph: a thin-line emblem over a sunset with a fence. electron-builder downsizes it into the .ico, so at 16, 24 and 32 px (title bar, taskbar, Alt+Tab, Start, the installer) it is a muddy square, with no transparent edge and no small sizes drawn for legibility. | The taskbar and Alt+Tab are where a volunteer finds KERYX among Holyrics, OBS and the browser. At those sizes this icon reads as a blurred photo, not as the app. | Ship a multi-size `build/icon.ico` (16, 20, 24, 32, 48, 256) with the emblem flat on transparency (the same mark, no photograph), and point `win.icon` at it. | S |
| WIN-11 | Minor | `src/components/console/MediaView.jsx:61-72`, `:174-181`; `ServicePlanner.jsx:322`; `SchoolView.jsx` | The Mídia page behaves like an Explorer grid (Ctrl/Shift-click, Ctrl+A, F2, Delete) but has no right-click menu, and the arrow keys do not move the selection. The planner's items and the Escola's lists also have no right-click menu, while the console's Setlist and Biblioteca do. Delete and F2 work only in the Mídia, not in the Biblioteca (songs), the Setlist or Temas. | Windows users right-click a file or a row to rename, delete or send it. The same item answers in one view and ignores the click in the next. | Give the Mídia grid and the planner rows the same `useContextMenu` items as their console counterparts, plus arrow-key selection in the Mídia. | M |
| WIN-12 | Minor | `src/lib/console/keys.js:69`; `SettingsView.jsx:77` | Ctrl+F does nothing anywhere: Electron has no find bar, and nothing handles it. Only "/" opens the search (and Configurações' search). | Ctrl+F is the Windows search key. On many Brazilian (ABNT2) notebooks "/" sits on an unfamiliar key or needs AltGr+Q, so the operator presses Ctrl+F and nothing happens. | Make Ctrl+F an alias of "/" (open the palette; in Configurações, focus its search) and list it in Atalhos. | S |
| WIN-13 | Minor | `electron/main.cjs:176-186` | The text-field right-click menu has Recortar, Copiar, Colar and Selecionar tudo, but no Desfazer/Refazer, and it ignores the spell checker. Electron's spellcheck is on by default, and only the lyrics, the reference and a few fields turn it off (`spellCheck={false}`), so avisos, notes and titles get red underlines that right-click cannot fix. | Windows' standard edit menu starts with Desfazer. An underlined word with no suggestion on right-click looks broken. | Add `undo`/`redo` items, and show `params.dictionarySuggestions` and "Adicionar ao dicionário" when `params.misspelledWord` is set (or turn spellcheck off app-wide). | S |
| WIN-14 | Minor | `ConfirmDialog.jsx:22-25`, `PromptDialog.jsx:27-30`, `Popovers.jsx:279-282`, `library/BackgroundLibrary.jsx:300-301`, `closeGuard.cjs:22`, `:42`; against `system.cjs:61`, `:69`, `:253`, `:299`, `Dock.jsx:183-184`, `settings/TelasSection.jsx:267` | Button order changes from dialog to dialog. Most in-app questions and the native close guard put "Cancelar" first and the action last (the macOS order). The native import/restore questions, Salvar como… (disposição) and the import of the outputs file put the action first and "Cancelar" last (the Windows order). | Muscle memory: the same position is "Cancelar" in one question and the action in the next, so a quick click takes the wrong answer. | Use one order everywhere, Windows' (the action, then "Cancelar" on the right), with the default chosen as in WIN-03. | S |
| WIN-15 | Minor | `src/pages/Console.jsx:1254`, `src/lib/editorWindow.js:32`, `electron/main.cjs:132-146` | Detached pages (/Janela) get a native title bar and, under it, the page's own WinBar with its own × (two close buttons stacked in the corner). They have no minimum size (they can shrink until the page breaks), open at 1280×820 (taller than a 768-px screen) and never remember their size or position. | A detached page is meant to stay on a second monitor. It comes back at the wrong size and place every time, and two different X buttons sit in one corner. | Give /Janela the console's chrome (`titleBarStyle: "hidden"` + `titleBarOverlay`, with the WinBar as the drag strip and no in-page ×), a minimum of 760×480 (THE window's) and remembered bounds per page kind. | M |
| WIN-16 | Minor | `electron/outputs-manager.cjs:81-94`, `:158-160` | Every `display-metrics-changed` (any monitor's resolution, scale or work area changing, such as the taskbar moving or the scale changed in Settings) runs `present()` on every output, which leaves full screen and enters it again even when nothing about that output changed. | The audience may see the projector flash its desktop or taskbar for a moment during a service, caused by something on a different monitor. | In `reapplyAll`, skip an output that is already full screen on the display it resolves to, with the same bounds. | S |
| WIN-17 | Minor | `electron/outputs-manager.cjs:138-144` | An output window closes with Ctrl+W, but no tooltip, the Atalhos list (`SHORTCUTS`) or the Saídas popover says so. | A frameless output has no visible way to close it. The one key that does is undiscoverable (and, unknown, can surprise someone who pressed it with the projector focused). | Name it in the Saídas popover's tooltip ("Fechar · Ctrl+W na própria saída") and in Atalhos. | S |
| WIN-18 | Minor | `src/components/console/console.css:9-10`; `Console.jsx:1305`; `tokens.css:49` | The 32 px caption strip holds only the word "KERYX"; the 40 px top bar with the menus sits under it. Chrome above the modules is 32 + 6 + 40 + 6 = 84 px, 12 % of a maximized 1366×768 window (about 720 px of work area). | Windows 11 programs (Explorer, Edge, Office) put their menus or tabs in the caption row. On the target notebook those 38 px are more than one more row of slides or setlist. | Let the top bar sit in the caption row: its left part in `env(titlebar-area-x/width)`, its empty space `drag`, its controls `no-drag`. | M |
| WIN-19 | Minor | `index.html:2` (`<html lang="en">`); `electron/main.cjs` (no `--lang`) | The app tells Windows its pages are in English. Nothing sets pt-BR: not the document, not Chromium's locale (that follows the Windows display language). | Narrator picks its voice from `lang`, so it reads the pt-BR console with English pronunciation. On a PC with English Windows, Chromium's own strings (the file input, validation bubbles) come out in English. | `<html lang="pt-BR">`, and `app.commandLine.appendSwitch("lang", "pt-BR")` before `ready`. | S |

## Needs manual check

On the church PC or a Windows 11 test PC, installed build (not `desktop:dev`):

- **Snap Layouts and the caption buttons.** Hover the maximize button: the
  Snap Layouts flyout should appear. Check the three buttons sit top-right in
  the order −, □, ×, at about 46×32 px, that × turns red on hover, and that the
  symbols dim when KERYX is not the active window. Double-click the "KERYX"
  strip (it should maximize and restore), drag it, right-click it (the system
  menu), Alt+Space.
- **WIN-02, unplugging.** With Projeção full screen on the projector
  ("auto") and a song on air, unplug the projector's cable or press Win+P ›
  "Somente na tela do PC". Look at where the output lands, whether it covers
  the console, whether the pointer disappears over it, and whether the
  "Reconectando…" banner is visible. Plug it back: it should return full
  screen. Repeat with the Palco on a second external monitor.
- **WIN-01, sleep.** Set Windows › Energia › "Desligar a tela após 1 minuto",
  put a verse on air, touch nothing for 2 minutes and watch the projector. Also
  check a screen saver with a 1-minute wait.
- **WIN-07, first launch.** On the 1366×768 notebook (100 % and 125 %), see
  where the 1440×900 window lands and whether its bottom (the No ar strip,
  the player) is under the taskbar. At 1366×768 and 125 % the work area is
  about 576 DIP, less than the 600 minimum height: check that maximized still
  fits.
- **Taskbar identity (AUMID).** `app.setAppUserModelId` is never called;
  the installer's shortcut carries `br.keryx.app`. Pin KERYX from the Start
  menu, close it, open it from the pin: there should be one taskbar button, not
  a second one beside the pin. Also check that a detached page groups under
  that button.
- **DPI.** Notebook at 150 % plus a projector at 100 %: check that the outputs
  open sharp and full screen on the projector (no window scaled twice), that
  dragging the console and a detached page between the two monitors redraws
  them sharp, and that the Programa monitor's text is not blurred.
- **WIN-08.** With Windows in light mode: a detached page's title bar, an
  output set to "Em janela", the right-click menu of a text field, an
  open/save dialog, and the native close question ("Fechar o KERYX?", a
  TaskDialog, light whatever the setting, with the "?" icon that Windows'
  guidelines discourage).
- **Scrollbars.** Electron 44 on Windows 10 vs 11: check that
  `scrollbar-width: thin` plus `scrollbar-color` draws thin warm thumbs (no
  light arrow buttons) in the Biblioteca, the Setlist and Configurações.
- **Display numbers.** "Tela 1" in KERYX is always the console's monitor
  (`outputs-manager.cjs:31-45`). Windows' Configurações › Vídeo › Identificar
  may number the same monitors differently. A question for the owner: is the
  difference intended, given KERYX has its own Identificar telas?
- **Windowed outputs.** An output set to "Em janela" is a tool window: no
  minimize or maximize, not in the taskbar or Alt+Tab. That matches the
  "as in Holyrics" decision. Confirm that the Saídas popover's name brings it
  forward once it is behind the console.

## Top 3 to fix first

1. **WIN-01**: hold a `prevent-display-sleep` blocker while outputs are open,
   or Windows blanks the projector in the middle of a sermon.
2. **WIN-02**: do not drop a frameless, pointer-less output on top of the
   console when its monitor disconnects.
3. **WIN-03 + WIN-04**: the safe default in Excluir/Descartar questions, and
   no Backspace-deletes. A reflex Enter or Backspace should never delete
   anything.
