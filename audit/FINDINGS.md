# Keryx — Findings Register

| ID | Pass | Sev | Effort | Title | Location | Status |
|----|------|-----|--------|-------|----------|--------|
| ARCH-001 | 1 | P0 | S | Crashed/hung windows never recover; "Abrir" re-focuses the dead projector | electron/main.cjs:273; outputs-manager.cjs:198 | Fixed (PR #245) |
| ARCH-002 | 1 | P1 | S | Projector signal drop throws all outputs onto the operator's screen | outputs-manager.cjs:150; outputs.cjs:62 | Open |
| ARCH-003 | 1 | P1 | M | Unopenable DB stops Keryx at launch though backups exist | electron/main.cjs:284 | Open |
| ARCH-004 | 1 | P2 | M | Slow sync work (DB, Bible search, backup) on the slide-relay thread | db/store.cjs:117; main.cjs:388 | Open |
| ARCH-005 | 1 | P2 | S | Page with a failed first live read stays empty until next change | src/api/liveClient.js:52 | Fixed (first read retried, 2026-10-20) |
| ARCH-006 | 1 | P3 | M | No type checking on preload/main/page contract | electron/preload.cjs; data-ipc.cjs | Open |
| ARCH-007 | 1 | P3 | M | Oversized files and leftovers (Console.jsx, CLAUDE.md 88 KB, supabase/) | src/pages/Console.jsx | Open |
| ARCH-008 | 1 | P3 | S | Backups only at open/close | electron/system.cjs:165 | Open |
| ARCH-009 | 1 | P3 | S | 15 unused Base44 entities + web-build leftovers (owner: delete) | base44/entities; syncScope.cjs | Open |
| TEST-001 | 7* | P2 | S | `npm test` unquoted globs skip ~490/732 tests outside cmd.exe | package.json "test" | Open |
| TEST-002 | 7* | P3 | S | Flaky LAN test: fixed 100 ms sleep | electron/lan.test.cjs:112 | Open |

*Found during the test run; full write-up in pass 7.
| SEC-001 | 2 | P2 | M | LAN screens expose whole DB (team phones/emails, students) with no PIN by default; no Host check | electron/lan.cjs:52, 284, 400 | Open |
| SEC-002 | 2 | P2 | M | YouTube script runs in privileged app origin; no CSP | src/utils/youtube.js:50 | Open |
| SEC-003 | 2 | P3 | M | Unsigned builds and updates | package.json build.win | Open |
| SEC-004 | 2 | P3 | S | Electron fuses not set | package.json build | Open |
| SEC-005 | 2 | P3 | S | Browser-side packages shipped as runtime deps; audit noise | package.json dependencies | Open |
| SEC-006 | 2 | P3 | S | Remote code guessable slowly across rotating IPs | electron/lan.cjs:85 | Open |

## Audit of 2026-11-26 (passes 3, 4, 5 and the synthesis)

Severities are the ones reviewed in `08-backlog.md`; a pass report may rate a finding higher.

| ID | Pass | Sev | Effort | Title | Location | Status |
|----|------|-----|--------|-------|----------|--------|
| FUNC-001 | 3 | P1 | S | An edit made on air that changes the slide count shows the wrong slide | shared/live-state.mjs:797; src/pages/Console.jsx:598 | Fixed (PR #484) |
| FUNC-002 | 3 | P1 | S | YouTube offline (or one failed script load) is black and silent until the window reloads | src/utils/youtube.js:42 | Fixed (PR #484) |
| FUNC-003 | 3 | P1 | M | Undecodable videos pass the import door; a video that fails on air has no error path | src/lib/mediaImport.js:128; src/components/projection/LiveVideo.jsx:215 | Open |
| FUNC-004 | 3 | P2 | M | Picture and sound play in two elements; lip sync never corrected on local windows (measure first) | shared/live-state.mjs:1368; LiveVideo.jsx:169 | Open |
| FUNC-005 | 3 | P2 | S | "This video ended" carries no identity: the first window to finish takes it off every screen | src/components/projection/LiveMediaView.jsx:38; SoundEngine.jsx:60 | Open |
| FUNC-006 | 3 | P3 | S | Esc during Tela preta/Logo lights the wallpaper; with nothing else on air there is no Desfazer | shared/live-state.mjs:1192; src/lib/console/restore.js:54 | Open |
| FUNC-007 | 3 | P2 | S | Bible references: cross-chapter ranges and comma lists silently cut; English names unsupported | src/lib/console/quickRef.js:54; src/lib/bibleBooks.js:180 | Open |
| FUNC-008 | 3 | P2 | S | Desfazer after Esc restarts videos from 0 (only the music keeps its position) | src/lib/console/restore.js:26 | Open |
| FUNC-009 | 3 | P2 | S | Importing a cifra/ChordPro file drops its chords and part names | src/lib/songImport.js:50, 117 | Open |
| FUNC-010 | 3 | P3 | S | Desfazer stays armed after something new goes on air | src/components/console/useConsole.js:449; Console.jsx:954 | Fixed (PR #484) |
| FUNC-011 | 3 | P3 | S | The sound engine gives up silently after 5 crashes a minute | electron/soundEngine.cjs:52 | Open |
| FUNC-101 | 3 | P3 | S | shadcn folder (48 files), src/lib/utils.js and about 35 runtime deps unused, packed in the installer | src/components/ui/*; package.json:25 | Open |
| FUNC-102 | 3 | P3 | M | OutputPref (designs, Recebe rules) still per computer though the content rule of G10 landed | electron/db/syncScope.cjs:40 | Open |
| FUNC-103 | 3 | P3 | S | Live Setlist row menu cannot Duplicar or Desativar an item; Planejar can | src/components/console/Rundown.jsx:289 | Open |
| FUNC-104 | 3 | P3 | M | Songs, avisos, media and Escola materials cannot be duplicated | src/components/console/Library.jsx:323 | Open |
| FUNC-105 | 3 | P3 | S | Song.copyright imported but invisible; play_count/last_played_at write-only | src/lib/songImport.js:123; Console.jsx:633 | Open |
| FUNC-106 | 3 | P3 | S | Fields with no reader or no writer (Service.templateId, ServiceTemplate.isDefault, BibleNote.highlight_color) | ServicePlanner.jsx:368; CultoSection.jsx:137 | Open |
| FUNC-107 | 3 | P3 | S | Unused exports from retired features (deviceStyles pairing helpers, network/views) | src/lib/deviceStyles.js:82 | Open |
| FUNC-108 | 3 | P3 | M | Verification still owed on real hardware (OBS transparency, ARA fallback, two-PC Drive, phones) | docs/checklist-pc-igreja.md:20 | Open |
| PERF-001 | 4 | P1 | M | Biblioteca rebuilds every song's slides and every row on each console render | src/components/console/Library.jsx:334; useConsole.js:223 | Open |
| PERF-002 | 4 | P2 | S | Biblioteca search strips and lowercases all lyrics per keystroke | src/components/console/Library.jsx:192 | Open |
| PERF-003 | 4 | P2 | M | A song sent on air refetches the whole Song table in every window | src/pages/Console.jsx:633; useConsoleData.js:26 | Open |
| PERF-004 | 4 | P2 | M | Whole live document (8 history items) to every window and phone per change | electron/live.cjs:55; data-ipc.cjs:328; lan.cjs:770 | Open |
| PERF-005 | 4 | P2 | S | Text fit measured 2–3× per slide change per renderer | src/components/screen/ScreenRenderer.jsx:391; useBoxFit.js:30 | Open |
| PERF-006 | 4 | P2 | M | Detached panels and pages share the console's renderer process | src/pages/Console.jsx:341; detach.js:64 | Open |
| PERF-007 | 4 | P2 | M | Every backup copies every installed Bible (VACUUM INTO, open and close) | electron/db/store.cjs:826; main.cjs:674 | Open |
| PERF-008 | 4 | P2 | S | Poster, codec and PDF backfills run during the service, no idle guard | src/hooks/usePosterBackfill.js:27; usePagesBackfill.js:64 | Open |
| PERF-009 | 4 | P3 | S | Output pages re-render every second unconditionally | src/pages/Projection.jsx:18 | Open |
| PERF-010 | 4 | P3 | S | Startup serial before the console window; eager supabase-js require | electron/main.cjs:966, 1029 | Open |
| PERF-011 | 4 | P3 | S | 1.1 MB console chunk includes every THE-window page | src/components/console/WinPages.jsx:2 | Open |
| PERF-012 | 4 | P3 | S | 395 kB stylesheet in every output and network screen; unused ui/ utilities | tailwind.config.js:4 | Open |
| PERF-013 | 4 | P3 | S | 36 px backdrop blur of the Programa pill over a moving monitor | docs/design-system/components/bundle.css:645 | Open |
| PERF-014 | 4 | P3 | S | Blurred video Fundo is a per-frame full-screen filter | src/components/screen/ScreenRenderer.jsx:258 | Open |
| PERF-015 | 4 | P3 | S | GROUP BY over all Bible verses on main about once a minute | electron/main.cjs:842 | Open |
| PERF-016 | 4 | P3 | S | Online Bible chapter cache grows in localStorage without a bound | src/lib/bibleText.js:87 | Open |
| PERF-017 | 4 | P3 | S | Song editor re-renders and re-fits every slide preview per keystroke | src/components/console/SongEditor.jsx:614 | Open |
| UX-001 | 5 | P2 | S | Stale "slide no ar" in the Prévia retargets the next song | stage.js:169; useConsole.js:383 | Fixed (PR #484) |
| UX-002 | 5 | P1 | S | Click in No ar / No ar tab wipes the prepared item | OnAirPanel.jsx:39; SlidesPanel.jsx:76 | Fixed (PR #484) |
| UX-003 | 5 | P2 | S | Tela preta/Logo dead while any popover/dialog is open | Console.jsx:931 | Fixed (PR #484) |
| UX-004 | 5 | P1 | S | Esc twice from a search field ends the air; fields keep focus | liveKeys.js:176; Library.jsx:301; QuickTools.jsx:53 | Fixed (PR #484) |
| UX-005 | 5 | P2 | S | Pedido/chat toast drops the Desfazer of Esc | toastQueue.js:35 | Fixed (PR #484) |
| UX-006 | 5 | P2 | M | Added items land at the end; reorder drag-only | useSetlistWrites.js:98,143 | Open |
| UX-007 | 5 | P1 | M | 1366×768: Painel in tray, Setlist ~4 rows | layout.js:25; dock.js:676,700 | Open |
| UX-008 | 5 | P2 | S | No one-step undo of a wrong send | useConsole.js:379; Popovers.jsx:362 | Open |
| UX-009 | 5 | P2 | S | Theme click changes the air; double-click applies first; no undo | themeActions.js:22; ThemeStrip.jsx:132 | Open |
| UX-010 | 5 | P2 | S | Atalhos/Primeiros passos call the selection green | keys.js:81; firstSteps.js:34 | Open |
| UX-011 | 5 | P2 | S | L/C type in the Bíblia; key list silent | keys.js:126 | Open |
| UX-012 | 5 | P2 | S | Arrows move the hidden song under a video | useConsole.js:194 | Open |
| UX-013 | 5 | P2 | S | "Jo 3" leaves the console, no key back | Popovers.jsx:484; Console.jsx:808 | Open |
| UX-014 | 5 | P2 | S | Culto activation: one click, all PCs, no undo | useActiveService.js:28 | Open |
| UX-015 | 5 | P2 | S | Biblioteca search has no keyboard path to send | Library.jsx:301; liveKeys.js:181 | Open |
| UX-016 | 5 | P2 | S | Update popup can auto-restart with an aviso/logo on screen | updates.js:26; live-state.mjs:102 | Open |
| UX-017 | 5 | P2 | S | Delete/Alt+↑↓/Ctrl+A hints dead after mouse click | Console.jsx:981; useRowStep.js:43 | Open |
| UX-018 | 5 | P2 | M | No key to jump to a slide/chorus | liveKeys.js:171 | Open |
| UX-019 | 5 | P3 | S | Papel de parede door is a hover-only pencil | console.css:579; Layers.jsx:253 | Open |
| UX-020 | 5 | P3 | S | Slides footer buttons change meaning after Esc | SlidesPanel.jsx:119 | Open |
| UX-021 | 5 | P3 | S | Aviso rápido preset × deletes without asking | QuickTools.jsx:47 | Open |
| UX-022 | 8 | P2 | S | Keys typed right after "/" reach the live keys (B, L, C) until the search mounts | src/pages/Console.jsx:931, 962, 972 | Fixed (PR #484) |
| UX-023 | 8 | P2 | S | A direct send (search Ctrl+Enter) wipes another item prepared in the Prévia | src/components/console/useConsole.js:383 | Fixed (PR #484) |
| UX-024 | 8 | P3 | S | Planejar o culto shows clock times and "termina às" though the church plans order only | src/components/console/ServicePlanner.jsx:522 | Open |
| UX-025 | 8 | P3 | S | Editor da tela, Palco, "No ar": the hidden video element's content shows behind the lyrics | src/components/console/editor/ScreenEditor.jsx | Open |
| UX-101 | 5 | P2 | M | Click-again confirm instead of useConfirm (Trocar o código, Remover PIN, Importar/Restaurar) | settings/PhonesBlock.jsx:136; RedeSection.jsx:79; DadosSection.jsx:52 | Open |
| UX-102 | 5 | P2 | M | Editor da tela: autosaving Ajustes and a draft Desenho under one Cancelar/Salvar bar | editor/ScreenEditor.jsx:77, 654 | Open |
| UX-103 | 5 | P2 | M | Save model undeclared and different per page | ServicePlanner.jsx:161; SongEditor.jsx:513; NoticeEditor.jsx:162 | Open |
| UX-104 | 5 | P2 | M | 13 raw input[type=color]; ColorPop only in the generators | editor/TextBar.jsx:86; ThemeEditor.jsx:371; NoticeEditor.jsx:201 | Open |
| UX-105 | 5 | P2 | M | Screen editor picks backgrounds through an inline gallery, not the library | editor/ScreenEditor.jsx:462, 609 | Open |
| UX-106 | 5 | P2 | S | "Conexões" is a menu group of 3 but a Configurações section of 1 (GERAR) | src/lib/console/settings.js:15; menuBar.js:161 | Open |
| UX-107 | 5 | P2 | S | Primeiros passos step 2 ignores the shared Setlist and "Ativar o culto" | src/lib/console/firstSteps.js:26 | Open |
| UX-108 | 5 | P3 | S | Atalhos list short; stale "menu do logo, Atalhos do teclado" | settings/ConsoleSection.jsx:102; keys.js:56 | Open |
| UX-109 | 5 | P3 | S | Labels that open pages end in "…" against the label rule | ThemeStrip.jsx:92; Layers.jsx:328; MediaView.jsx:497 | Open |
| UX-110 | 5 | P3 | S | Copy-rule slips: Remover, "Tema sem nome" as caption, guardar/gravar | RedeSection.jsx:119; ThemeEditor.jsx:312; BibleSetupDialog.jsx:68 | Open |
| UX-111 | 5 | P3 | S | Renomear inline vs dialog vs "Renomear…" | MediaView.jsx:302; SchoolView.jsx:105; PhonesBlock.jsx:149 | Open |
| UX-112 | 5 | P3 | S | Buscar / Pesquisar / Procurar for the same search | MediaView.jsx:340; Library.jsx:301; ReportsView.jsx:81 | Open |
| UX-113 | 5 | P3 | S | Relatórios: Copiar has the save glyph; "salvo" toast before the dialog; no loading or error state | ReportsView.jsx:45 | Open |
| UX-114 | 5 | P3 | S | Raw number inputs instead of NumBox | editor/ScreenEditor.jsx:565; QuickTools.jsx:122 | Open |
| UX-115 | 5 | P3 | S | "Equipe" names three different groups | ServicePlanner.jsx:509; CultoSection.jsx:153; PhonesBlock.jsx:37 | Open |
| UX-116 | 5 | P3 | S | Phone: stale "código da igreja" / "Tela de Início" | network/remote/MoreTab.jsx:61 | Open |
| UX-117 | 5 | P3 | S | Canned alert/timer presets deleted with no question | QuickTools.jsx:47 | Merged → UX-021 |
| UX-118 | 5 | P3 | S | Console section hint contradiction (church pref vs "deste computador") | settings/ConsoleSection.jsx:55; Console.jsx:446 | Open |
