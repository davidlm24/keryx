# Pass 3 — Functionality inventory and half-wired / dead things

Date: 2026-11-26. Read-only pass over the worktree at current master (`a662879d`). No project code was run; all evidence is from grep and small read-only node scripts in `audit/tmp/` (`unused.cjs`, `exports.cjs`, `fields*.cjs`). Skills used: none that applied (this was a static sweep).

## 1. Summary

- The app is unusually fully wired. Every menu-bar action in `menuBar.js` has a handler in `Console.jsx`; every one of the 32 phone actions in `shared/remoteProtocol.json` is sent by the phone; Configurações switches I traced (chime, YouTube title, Bíblia look, autoplay gap, Transições, Ajustes › Conteúdo) all have a reader. There are no "em breve" stubs, no `onClick={() => {}}` and no TODO/FIXME comments describing a user-visible gap (only 2 "future work" comments, both about folders the operator makes, intentional).
- The biggest real gap is dead weight, not missing behaviour: the whole shadcn folder `src/components/ui` (48 files, 3,999 lines) plus `src/lib/utils.js` is imported by nothing in the app, and about 35 npm runtime dependencies exist only for it (or for nothing), all of which electron-builder packs into the installer (FUNC-101).
- Second: output designs and settings (`OutputPref`) still do not travel between the church's computers, although the G10 content-rule work that the sync scope comment waits for has landed (FUNC-102).
- Third: a few small Setlist/Biblioteca asymmetries (the live Setlist cannot Duplicar or Desativar an item that Planejar can; songs, avisos and materials cannot be duplicated) and a cluster of write-only or reader-less fields (Song.copyright, play_count/last_played_at, SongHistory.operator_name, ServiceTemplate.isDefault, Service.templateId, BibleNote.highlight_color).
- Nothing found rises above P3 for the live service; no P0/P1.

## 2. Feature inventory

Status means: Complete = wired end to end as far as static reading shows; Partial = works but with a stated or found gap; Stub = UI with no behaviour; Dead = code or data nothing uses. "Only the owner can confirm" items (two-PC Drive, real phones, projector hardware) are noted, not downgraded, as CLAUDE.md and `docs/checklist-pc-igreja.md` record them as owed checks.

| # | Feature | Where the operator finds it | Main modules | Status | Note |
|---|---|---|---|---|---|
| 1 | Operator console (docked panels) | `/Console`, Ver menu | `pages/Console.jsx`, `components/console/Dock.jsx`, `lib/console/dock.js` | Complete | Free dock, tray, named arrangements, tier docks, fold, Travar fora da edição |
| 2 | Biblioteca (songs, media, folders) | Left column; header (+), eye | `Library.jsx`, `libraryFolders.js`, `libraryRows.js` | Complete | No Duplicar on a song row (FUNC-104) |
| 3 | Slides column / No ar strip | Columns 2 and bottom band | `SlidesPanel.jsx`, `OnAirPanel.jsx`, `SlideEditPop.jsx` | Complete | "Editar este slide…" songs only, by design |
| 4 | Programa / Prévia / Multiview | Centre | `CenterPanel.jsx`, `MultiView.jsx`, `PreviaPanel` | Complete | Only the Programa moves; stills elsewhere by decision |
| 5 | Setlist (shared) + Autoplay | Right column; Culto menu | `Rundown.jsx`, `consoleSetlist.js`, `useSetlistAutoplay.js` | Partial | No Duplicar / Desativar in the row menu (FUNC-103) |
| 6 | Camadas + Temas panel | Right column | `Layers.jsx`, `ThemeStrip.jsx`, `themeActions.js` | Complete | Fixed layer order, overlays born off air |
| 7 | Painel (Avisos, Timers, Pedidos, Chat, Notas, Ferramentas, Esteve no ar) | Beside the Prévia | `TabsPanel.jsx`, `AvisosTab.jsx`, `PedidosTab.jsx`, `ChatTab.jsx`, `QuickTools.jsx` | Complete | Tab chooser per computer |
| 8 | Player bar | Under the Programa | `PlayerBar.jsx`, `player.js`, `useFramePreview.js` | Complete | Seek, hover frame, follow chip |
| 9 | Menu bar (Culto, Música, Mídia, Ferramentas, Ajuda) + ☰ Menu | Top bar | `MenuBar.jsx`, `menuBar.js`, `menuLabels.js` | Complete | All 36 `call()` ids have handlers; label table tested |
| 10 | Palette (`/`) | Search field | `Popovers.jsx`, `paletteSearch.js` | Complete | Songs, Bíblia, Mídia, Avisos, Escola, Setlist, Comandos |
| 11 | Bíblia environment | CONSOLE / BÍBLIA pill | `BibleEnv.jsx`, `BibleCompareView.jsx`, `bibleFit.js`, `bibleVerses.js` | Complete | Own dock, 2ª versão, notes/favourites |
| 12 | Bible editions install / own edition | Configurações › Bíblias; first-run dialog | `electron/bible.cjs`, `bibleFormats.cjs`, `BibleSetupDialog.jsx` | Complete | bolls.life + eBible; online fallback |
| 13 | Configurações (11 sections) | Logo menu / KERYX menu | `settings/*Section.jsx`, `settings.js`, `settingsSearch.js` | Complete | Index drift is tested both ways |
| 14 | Song editor | Biblioteca ⋯ Editar / Nova música | `SongEditor.jsx`, `songImport.js`, `lyricFit.js` | Complete | Song.copyright has no field (FUNC-105) |
| 15 | Marcar os tempos | Editor › Vídeo e tempos; Música menu | `SyncView.jsx`, `SyncTimeline.jsx`, `lyricSync.js`, `SyncMarks.jsx` | Complete | LRCLIB marks, Fim, per-slide rows |
| 16 | Letra automática (follow) | Player chip; Música › Letra no tempo | `content.follow` in `live-state.mjs`, `useConsole.js` | Complete | marks / time / clock sources |
| 17 | Planejar o culto (tabs) | Setlist button; Culto menu | `ServicePlanner.jsx`, `plannerTabs.js`, `servicePdfExport.js` | Complete | Service.templateId written, never read (FUNC-106) |
| 18 | Culto templates (Modelos) | Configurações › Culto | `CultoSection.jsx`, `serviceLook.js` | Partial | "modelo do KERYX" branch has no writer (FUNC-106) |
| 19 | Mídia library page | Biblioteca ↗; Mídia menu | `MediaView.jsx`, `mediaCategories.js`, `mediaInfo.js` | Complete | Categories, Informações panel |
| 20 | Background library + Fundos gerados | Camadas › Fundo; Mídia › Fundos | `library/BackgroundLibrary.jsx`, `GeneratorPanel.jsx`, `generators.js` | Complete | 20 worship loops, audio-reactive |
| 21 | Aviso editor + Aviso rápido | Painel › Avisos; Ferramentas | `NoticeEditor.jsx`, `AvisosTab.jsx`, `notice.js` | Complete | |
| 22 | Escola bíblica | Ferramentas › Escola | `SchoolView.jsx`, `MaterialView.jsx`, `school.js`, `ActivityView.jsx` | Complete | Activities, quiz, Revelar |
| 23 | Relatórios (history, CCLI) | Ferramentas › Relatórios | `ReportsView.jsx`, `reports.js` (SongHistory) | Complete | SongHistory.operator_name never read (FUNC-106) |
| 24 | Theme editor | Temas double click; Configurações › Temas | `editor/ThemeEditor.jsx`, `TextBar.jsx`, `themes.js` | Complete | |
| 25 | Screen editor / Tela ociosa / Saídas settings | Configurações › Telas e saídas | `editor/ScreenEditor.jsx`, `IdleEditor.jsx`, `settings/ajustes/*`, `layouts.js` | Complete | Design and settings stay per computer (FUNC-102) |
| 26 | Outputs (Projeção, Letras, Vídeo, Avisos, Palco, Pastor, Transmissão) | Saídas popover; `App.jsx` routes | `pages/*Projection.jsx`, `StageView.jsx`, `PastorView.jsx`, `StreamView.jsx`, `electron/outputs*.cjs` | Complete | Auto-spread, waiting-hidden, keep-awake |
| 27 | Sound engine | Hidden window `/Som` | `SoundEngine.jsx`, `electron/soundEngine.cjs`, `soundPlan.js` | Complete | Only desktop:dev confirms audio |
| 28 | Detached pages (`/Janela`) | WinBar ⧉ | `pages/Janela.jsx`, `WinPages.jsx`, `janelaRelay.js` | Complete | 12 page kinds |
| 29 | Detached dock panels | Ver › Editar painéis ⧉ | `PanelPage.jsx`, `detach.js` | Complete | 6 modules detachable by decision |
| 30 | Network screens | Configurações › Telas na rede | `electron/lan.cjs`, `NetworkHome.jsx`, `ScreenStart.jsx`, `screenDevices.cjs` | Complete | Console chooses each screen's page |
| 31 | Phone: Controle | `/Remote` with the controle code | `RemoteView.jsx`, `network/remote/*`, `remoteRunner.js` | Complete | Real phones owed (owner) |
| 32 | Phone: Equipe (chat, pedidos) | `/Remote` with the equipe code | `remote/EquipeView.jsx`, `pedidos.js`, `usePedidos.js` | Complete | |
| 33 | QR pairing / invite link | Telas na rede › Conectar um aparelho | `PairDialog.jsx`, `phoneDevices.cjs` | Complete | |
| 34 | Sync between computers (Google Drive) | Cloud beside Ver; Configurações › Sincronização | `electron/sync.cjs`, `syncStore/`, `googleAuth.cjs`, `SyncSection.jsx` | Complete | Two-PC real-account test owed (owner) |
| 35 | GERAR link (pedidos, chat, library, files) | Configurações › Conexões | `gerarLink.cjs`, `gerarInbox.cjs`, `gerarOutbox.cjs`, `gerarFiles.cjs`, `gerarLibrary.cjs` | Complete | Needs the GERAR's side live |
| 36 | Backup / restore / export-import settings | Configurações › Backup | `electron/system.cjs`, `archive.cjs`, `outputsFile.js` | Complete | |
| 37 | Updates | Ajuda; Configurações › Backup | `electron/updater`, `useUpdates.js` | Complete | |
| 38 | Report a problem / diagnostics | Ajuda | `ReportDialog.jsx`, `reportQueue.cjs`, `supabase/functions/relato` | Complete | Edge Function on the owner's Supabase |
| 39 | .keryx package (export / open) | Biblioteca + Mídia menus | `keryxPackage.js`, `electron/keryxPackage.cjs`, `PackageDialogs.jsx` | Complete | |
| 40 | Song import (JSON, ChordPro, OpenLyrics, Holyrics) | Biblioteca (+) | `songFormats/*`, `ImportSongsDialog.jsx` | Complete | ProPresenter refused on purpose |
| 41 | Lyrics search (LRCLIB) | Biblioteca (+) › Procurar letra | `LyricsSearch.jsx`, `electron/lyrics.cjs` | Complete | |
| 42 | YouTube check + download to Mídia | Mídia › Link do YouTube… | `YouTubeDialog.jsx`, `electron/youtube.cjs`, `useYouTubeJobs.js` | Complete | Only desktop:dev confirms the download |
| 43 | Lyric-video export | Song editor / Biblioteca menu | `ExportVideoDialog.jsx`, `electron/lyricVideo.cjs`, `RenderPage.jsx` | Complete | Only desktop:dev confirms the encode |
| 44 | Verificar tudo / Identificar telas | Saídas popover; Ajuda | `VerifyView.jsx`, `outputs.cjs` identify | Complete | |
| 45 | Alerts (travadas, saída falhou) | Top right cards | `Alerts.jsx`, `alerts.js` | Complete | |
| 46 | Crash recovery / splash / watchdog | At launch | `runMarker.cjs`, `watchdog.cjs`, `splash.cjs` | Complete | |
| 47 | shadcn UI kit | none (nothing renders it) | `src/components/ui/*` (48 files), `src/lib/utils.js` | Dead | FUNC-101 |
| 48 | Retired Base44 entities and web leftovers | none | `base44/entities` (15 entities) | Dead | Already ARCH-009 |
| 49 | Retired device-pairing helpers | none | `lib/deviceStyles.js:82-110`, `lib/network/views.js:63,79` | Dead | FUNC-107 |

Count by status (49 rows): Complete 44, Partial 2 (Setlist, templates), Stub 0, Dead 3 (UI kit, retired entities, retired device helpers). Row 25 is Complete with a documented per-computer limitation (FUNC-102).

## 3. Findings

### FUNC-101 — The whole shadcn folder, `src/lib/utils.js` and about 35 runtime dependencies are unused by the app
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/components/ui/*` (48 files, 3,999 lines); `src/lib/utils.js:1-9`; `package.json:25-82`; `components.json:16`; `eslint.config.js:38,94`
- Evidence: `grep -rnE "from \"[./@]*(components/)?ui/" src electron` outside `src/components/ui` returns nothing; the only references to the folder outside it are a CSS comment (`src/index.css:258`), two tests that skip it (`menuLabels.test.mjs:17`, `icons.test.mjs:19`) and `components.json`. `src/lib/utils.js` (`cn`, `isIframe`) is imported only by those ui files (`grep` for `lib/utils` outside ui: 0 hits). Dependencies that appear in no non-ui source at all: `@hello-pangea/dnd`, `html2canvas`, `framer-motion`, `date-fns` (zero hits in src, electron, shared, scripts, configs). Dependencies used only by `src/components/ui`: every `@radix-ui/*` package (25 listed), `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `vaul`, `embla-carousel-react`, `cmdk`, `input-otp`, `next-themes`, `class-variance-authority`, `tailwind-merge`, `clsx`, and `lucide-react` (the app uses the `lucide` package through `src/lib/icons.js`; `lucide-react` appears outside ui only in a test comment). The project's own `src/lib/console/*` and `kx.jsx` implement every control the console uses.
- Live-service impact: None directly. Maintenance and install cost: electron-builder packs `dependencies` into the installer regardless of what Vite bundles (`package.json` `build.files` lists only app folders, but production node_modules are auto-included), so the church downloads and an audit (SEC-005) flags packages the app never loads. CLAUDE.md tells maintainers to keep the folder "generated shadcn"; it is generated and unused.
- Fix: Delete `src/components/ui/`, `src/lib/utils.js`, the `components.json` `ui` alias and the two eslint ignore entries; remove the listed packages from `dependencies` (or at least move them to devDependencies until deleted); keep `tailwindcss-animate` only if `src/index.css` or `tailwind.config` classes still need it (not checked). Update the CLAUDE.md ground rule. One PR, run `npm test` and `npm run build`.

### FUNC-102 — Output designs and settings (`OutputPref`) still stay on each computer although the G10 prerequisite has landed
- Severity: P3
- Effort: M
- Confidence: Medium
- Location: `electron/db/syncScope.cjs:40-46`; `docs/desktop-architecture.md:903`; `base44/entities/OutputPref.jsonc:55`
- Evidence: `ON_EACH_COMPUTER` includes `OutputPref` with the comment "The designs and looks move to SYNC_ENTITIES at the end of Rodada G10, which first replaces its content fields". `OutputPref.jsonc:55` and CLAUDE.md say the content rule (`content_rule`, "Rodada H2 / G10") replaced Conteúdo, Mostrar and `show_logo`. The entity is still in `ON_EACH_COMPUTER`, so Palco/Pastor designs, the Aviso rápido position, Recebe rules and the Tela's design (`OutputPref.design`) do not reach the church's second computer through the Google sync. Exportar/Importar ajustes das saídas is the only path.
- Live-service impact: A church that set up its Palco on the booth PC finds the other computer with default outputs; the operator on that PC may put a song on air with the wrong content rule or the factory Palco. Not a crash.
- Fix: If the owner agrees G10 is finished, move `OutputPref` to `SYNC_ENTITIES` with a per-computer field list (placement, `removed`, autostart) added to a `LOCAL_OUTPUTPREF_FIELDS`-style filter like `LOCAL_USER_FIELDS`, extend the "church in a box" test, and update the "O que vai e o que fica" copy (`syncView.js` `GOOGLE_GOES`/`GOOGLE_STAYS`). If not finished, update the comment to say what is still missing.

### FUNC-103 — The live Setlist cannot Duplicar or Desativar an item, Planejar o culto can
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/components/console/Rundown.jsx:289-302` (row menu); `src/components/console/ServicePlanner.jsx:567-570`
- Evidence: Planejar's item menu has "Ativar/Desativar" (`updateItem(it.id, { enabled })`) and "Duplicar" (`duplicate(it)`). `Rundown.jsx` only reads `enabled` (`:29`, `:38`, `:115`); `grep -n "Desativar\|Duplicar\|enabled" Rundown.jsx` finds no way to set it, and the row menu list has no such entry.
- Live-service impact: To skip a song for today without losing it, or repeat a chorus item, the operator must open Planejar o culto mid-service. A disabled item is skipped by Autoplay and Anterior/Próximo (`playableItems`, `neighbours`), so the live console depends on a flag it cannot set.
- Fix: Add "Desativar"/"Ativar" (and "Duplicar") to the Rundown row menu through `menuItem` entries in `menuLabels.js`, calling the same `useSetlistWrites` update path the Planejar page uses, so both hosts (console and detached Setlist) get it.

### FUNC-104 — Songs, avisos, media and Escola materials cannot be duplicated; themes, backgrounds, cultos and planner items can
- Severity: P3
- Effort: M
- Confidence: Medium
- Location: `src/components/console/Library.jsx:323-332` (song row menu); `src/components/console/MediaView.jsx`; `src/components/console/AvisosTab.jsx`; `src/components/console/SchoolView.jsx`; compare `ThemeStrip.jsx:93`, `BackgroundLibrary.jsx:323`
- Evidence: `MENU_LABELS.duplicar` is used by Temas, Configurações › Temas and the background library only (`grep -rn 'menuItem("duplicar"'`). The song row menu offers Pôr na prévia, Setlist, Editar, Exportar vídeo, Selecionar vários, Exportar, Excluir, Enviar ao ar; no Duplicar. Only "Duplicar estrofe" exists inside the editor.
- Live-service impact: Making a variant of a song (another key, shorter version for the service) means re-importing or retyping; low risk, mild friction.
- Fix: Add a "Duplicar" row action for songs first (copy row, title "(cópia)", like `themeCopy`), then avisos and materials if the owner wants. Open question below.

### FUNC-105 — `Song.copyright` is imported from three formats and then never shown, edited, printed or exported
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/lib/songImport.js:123`; `src/lib/songFormats/holyrics.js:77`; `src/lib/songFormats/openlyrics.js:123`; `base44/entities/Song.jsonc`
- Evidence: `grep -rnE "\bcopyright\b" src electron shared` outside tests: only the importers above set it. The song editor has a CCLI field (`SongEditor.jsx:543`) and `printSong.js:28` prints the CCLI number, but nothing reads `copyright` (no editor field, no print footer, no Relatórios column, no project of it). The same sweep shows `Song.play_count` and `Song.last_played_at` are written on every send (`src/pages/Console.jsx:634`) and read only by `keryxPackage.js:58` (copied into a package); Relatórios uses `SongHistory`, the Biblioteca shows no count or last-played sort. `SongHistory.operator_name` (`Console.jsx:633`, always "Operador") is never read.
- Live-service impact: None live. The church imports a Holyrics library, its copyright lines silently ride in the database where nobody can see or use them (for example on the CCLI report); two writes per send (Song update plus SongHistory create) produce no visible result for `play_count`.
- Fix: Either show `copyright` in the song editor Dados group and in the printed sheet footer, or stop storing it; and either show play count / last played (Biblioteca tooltip or sort) or drop the `Song.update` on every send. Keep `SongHistory.operator_name` only if a second operator is planned.

### FUNC-106 — Fields with no reader or no writer outside the intentional list
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/components/console/ServicePlanner.jsx:368` (Service.templateId); `src/components/console/settings/CultoSection.jsx:137,141,147` (ServiceTemplate.isDefault); `base44/entities/BibleNote.jsonc:39` (highlight_color); `base44/entities/Service.jsonc:42` (organizationId); `base44/entities/ServiceItem.jsonc:53` (sceneId); `base44/entities/User.jsonc:16,291,296` (background_url, submenu_*_color)
- Evidence: `Service.templateId` is written once (`ServicePlanner.jsx:368`) and appears in no other source file. `ServiceTemplate.isDefault` is read to show "modelo do KERYX" and hide Excluir, but `grep -rn isDefault` across src, electron, scripts and preview fixtures finds no writer (only the jsonc and schema.json), so the branch is unreachable for rows made in this app. `BibleNote.highlight_color`, `Service.organizationId` and `ServiceItem.sceneId` have zero hits in code (`docs/migration-inventory.md:100` already notes sceneId as "saved and never read"); `User.background_url` and `submenu_*` are annotated "Legado: nada lê este campo" in the jsonc, so they are intentional and listed only for completeness. `User.song_themes`, `part_themes`, `kind_themes`, `bible_book_names` and `weekday_backgrounds` are intentional per CLAUDE.md and not counted.
- Live-service impact: None. Schema noise and a dead UI branch.
- Fix: Delete `highlight_color`, `organizationId`, `sceneId` from the jsonc (data stays in old rows, `npm run db:schema`), or annotate them "Legado" like the User ones; remove the `isDefault` branches or seed a default template; drop `templateId` unless "Aplicar modelo" will use it.

### FUNC-107 — Small exports nothing calls (leftovers of retired features)
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/lib/deviceStyles.js:82-110` (DEVICE_TYPE_LABELS, DEVICE_ROLE_LABELS, CONTENT_TYPE_LABELS, generatePairingCode); `src/lib/network/views.js:63,79` (outputView, previewSession); `src/lib/utils.js:9` (isIframe); `src/utils/youtube.js:22` (getYouTubeEmbedUrl); `src/components/console/useConsoleData.js:80` (useServiceTemplates); `src/lib/bibleText.js:168` (versesToText); `src/lib/console/stage.js:202` (kindLabel); `src/lib/songImport.js:192,273` (songsFromFile, splitRepeated: tests only)
- Evidence: `audit/tmp/exports.cjs` lists exports with no importer in non-test code; for each of these the defining line is the only non-test hit. About 330 exports are not imported from other files, but most are used inside their own module or exported for tests; the ones listed are unused even inside their own file. The device-pairing labels and "Controlo Remoto" (pt-PT) are remnants of the retired Gestor de Projeções. CLAUDE.md names `songsFromFile` and `splitRepeated` as live entry points; the import dialog now uses `readSongFile`/`importPlan`.
- Live-service impact: None. About 100 lines of misleading code, including pt-PT copy that a maintainer could copy.
- Fix: Delete the unused exports and their tests; update CLAUDE.md where it names `songsFromFile`/`splitRepeated`.

### FUNC-108 — Verification gaps recorded as "owed" remain before the church can rely on the features
- Severity: P3
- Effort: M
- Confidence: Medium
- Location: `docs/checklist-pc-igreja.md:20,27,90`; CLAUDE.md sync section ("only the owner's real account confirms the rest"); memory notes
- Evidence: The checklist lists OBS transparency (#51) and ARA offline fallback (#58) as "ainda por confirmar"; the two-computer Drive sync, real-phone pairing (iOS home screen cookie), lyric-video export, YouTube download and audio meters are confirmable only on `desktop:dev` or hardware per CLAUDE.md. The README "Known gaps" list (items 0-5) is otherwise only audit noise, no type layer, lint warnings, tables without a writer (= ARCH-009), flaky focus checks and importer scope; all as intended.
- Live-service impact: If any of these fail on the church PC, the symptom is silent (a missing legenda background, a Bible silently using another edition would be visible, sync not converging). Already known to the owner.
- Fix: Run the checklist items on the church PC once per release and record the date next to each in the checklist.

## 4. What's done well

- Every menu-bar item resolves to a handler, with a tested label/icon/key table (`menuLabels.test.mjs`) and a tested search index drift check (`settingsSearch.test.mjs`), so Configurações and the palette cannot point at removed rows without `npm test` failing.
- The phone protocol is closed and checked: all 32 actions in `remoteProtocol.json` are sent by the phone code and run by `remoteRunner.js`.
- Retired features were actually removed from the UI (Aparência, Visual do culto, per-song themes, Telas menu, device pairing) while their data stayed; I found no control that still writes a field the renderers ignore, apart from the intentional "stored, unread" list.
- Unfinished behaviour is rarely hidden in comments: the code has essentially no TODO/FIXME and the gaps are recorded in CLAUDE.md with the owner's decision.

## 5. Open questions (for Davi)

1. Is the shadcn folder (`src/components/ui`) kept for a future screen, or can it and the ~35 packages go (FUNC-101)? CLAUDE.md says "generated, don't hand-edit" but nothing imports it.
2. Is Rodada G10 finished, so `OutputPref` can sync between the church's computers (FUNC-102), or is a part still missing?
3. Do you want Duplicar on songs (and avisos, materials) and Desativar/Duplicar in the live Setlist (FUNC-103, FUNC-104)?
4. Should `Song.copyright` be shown/printed, or dropped (FUNC-105)? Should `play_count` / `last_played_at` become visible in the Biblioteca?
5. Unconfirmed, no evidence either way: whether `tailwindcss-animate` is still needed once the ui kit goes (animation utility classes used by hand-written CSS were not checked); whether the Escola's class fields (assistant_name, meeting_time, curriculum) appear anywhere outside the SchoolView form (`SchoolView.jsx:222` writes and reads them; no print or PDF uses them).

## 6. Handoffs to other passes

- Pass 1/SEC-005: FUNC-101 gives the exact list of runtime dependencies that are unused or ui-only, and the fact that they ship in the installer.
- Pass 7 (testing): `src/lib/network/views.js:63,79` and `songImport.js:192,273` are exported only for tests; deleting them removes tests that guard nothing live.
- Pass 5 (UX): FUNC-103/104 are Setlist and Biblioteca row-menu asymmetries; FUNC-105's "Dados" group is a song editor layout question.
- Pass 6 (copy): `src/lib/deviceStyles.js:93` has pt-PT "Controlo Remoto" in dead code; delete rather than fix.
