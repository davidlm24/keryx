# Migration inventory: from the old brown panel to the console

Status: written 2026-10-07, before any page is removed. The old operator
pages (the brown "mc-" panel: Músicas, Cultos, Mídia, Comunicação, Bíblia,
Configurações, EBD and the rest) are to be retired. Every function they offer
moves into the console (`/Console`, design system in `docs/design-system/`)
or is retired on purpose. This file is the checklist: one line per function,
where it goes, and the bugs that must not come along.

Decisions already taken by the user (2026-10-07):

- **The old device system is retired**: Gestor de Projeções, Painel do
  operador, DeviceView pairing by code, scenes and
  `ProjectionDevice.current_output`. Screens on the network render the live
  state (`electron/lan.cjs`); outputs on this PC are placed by
  `electron/outputs*.cjs`.
- **The old appearance settings are removed**: primary/secondary colours, bar
  and submenu colours, app background, device mode and language (the app is
  pt-BR only). Only the **church logo** stays.
- **Esc takes the projection down at once** (as in Holyrics); the Encerrar
  button asks first; "Voltar ao anterior" undoes.
- **One console (2026-10-07):** the Preparar · Verificar · Apresentar steps
  were removed; Verificar is an overlay from the Saídas popover. A double
  click or a drag onto the Programa sends to air; the rundown is "Setlist"
  in the UI; the idle screen is logo or black (Tela ociosa).

Legend for the destination column:

- **Console · module**: a module of the console (Biblioteca, Slides,
  Programa/Prévia, Camadas, Roteiro, Linha do tempo, Bíblia).
- **Preparar**: the Preparar step (service planning, editors).
- **Configurações**: a new settings screen in the design system, opened from
  the KERYX menu.
- **Relatórios**: one new screen for statistics, history and CCLI.
- **Retire**: not migrated, with the reason.
- **Done**: the console already does it.

## 1. Músicas (`src/pages/Home.jsx`) — migrated (phase 3, see section 9)

| Function | Destination |
| --- | --- |
| Song list grouped by letter and artist, search by title/artist/lyrics, Favoritos chip, alphabet rail, paging | Console · Biblioteca › Letras (search done; add the Favoritos filter and an A–Z jump) |
| Projetar a song | Done (click prepares, Enter sends) |
| Nova Música / editar / excluir | Preparar · editor de música (new design) |
| SongForm fields: título, artista, categoria, duração, BPM, tom, CCLI, observações para músicos, letra with `[Refrão]` | Preparar · editor de música |
| Importar cifra (ChordPro, section markers, blank lines) | Preparar · editor de música |
| `chords` field (read by the stage view, no input today) | Preparar · editor de música, new input |
| Vídeo MP4 of the song and Sincronizar letra com vídeo (LyricSyncEditor) | Preparar · editor de música |
| Per-song style (fundo, fonte, tamanho, cores, efeito) and ThemePicker | Console · Camadas › Tema (themes exist as `ProjectionTheme`); per-song override in the editor |
| Gerar slides automaticamente | Preparar · editor de música |
| Imprimir letra | Preparar · editor de música, "Imprimir" (escape the title and artist) |
| Exportar / Importar músicas (JSON) | Importar: done (console "+ › Do computador", also txt/ChordPro/cifra). Exportar: Configurações › Dados |
| Busca de letras na internet | Done: "+ › Na internet…" (Vagalume API + letras.mus.br search; letras pages pasted) |
| Apagar todas | Retire (destructive, no real use; Exportar + a fresh database covers it) |
| Busca Global button | Done (top bar search, `/`) |
| Letra para Tablet (actually opens the main projector) | Retire (the label is wrong; outputs open from Saídas) |
| Tela de Vídeo, Palco windows | Done (Saídas popover opens any output) |
| YouTube panel | Console · Biblioteca › Mídia (YouTube stage exists: `stageFromYouTube`) |
| Parar Projeção | Done (Encerrar, Esc) |
| UnifiedSearch (songs + verses) | Done (palette searches songs and references) |
| Pré-visualização + Projetar | Done (Prévia + Enviar ao ar) |
| OverlayManager (logo, anúncio overlays, posição, opacidade) | Console · Camadas (overlays layer) |
| ProjectionTools: relógio, cronômetro, temporizador, texto livre, tela preta | Console · Biblioteca › Ferramentas through `projection.showTool` (no postMessage) |
| VideoPlayerPanel transport | Done (Programa transport) |
| LyricPlayerPanel (auto-play, first/last) | Console · Slides (add auto-advance by slide duration) |
| Song history write (`SongHistory.create`, `play_count`) on send | Console send path (move from Home/Services into `useConsole.send` for songs) |

Bugs not to carry over: the offline cache `oc_songs` never removes deleted
songs (wrong `onSettled` argument, and "Apagar todas" leaves it full); the
"✓ Sincronizado" badge tests `start !== null`; the artist and letter filters
can never apply; gradient swatches use the invalid `linear-gradient(to br …)`;
the ProjectionTools background upload has no `try`; the print popup does not
escape HTML; Space is handled by two panels at once.

## 2. Cultos (`src/pages/Services.jsx`) — migrated (phase 4, see section 9)

| Function | Destination |
| --- | --- |
| List of cultos, Novo / editar / excluir | Preparar · planejador de culto (new design); the console's KERYX menu picks the culto |
| Form: nome, data, horário, local, tipo culto/evento, descrição, escala da equipe, status, notas | Preparar · planejador de culto |
| Items: add by type, drag to reorder, ↑ ↓, ativar/desativar, configurar, duplicar, excluir | Console · Roteiro (reorder done) + Preparar for the item editor |
| Item config: título, notas do operador, duração | Preparar · item editor; notas show in the stage view |
| Item config: cena de projeção, avanço automático | Retire scenes (device system retired); avanço automático → Console · Slides auto-advance |
| Criar a partir de modelo | Preparar · modelos (must fill `contentId`, see bugs) |
| PDF do culto | Preparar · "Exportar PDF" |
| Modo Ensaio | Done (Ensaio in Apresentar, Preparar step) |
| Abrir Projeção, Tela de Vídeo | Done (Saídas) |
| OBS integration (URLs for lyrics, bible, stage) | Configurações › Telas na rede (the URLs come from `useLanBaseUrl()`) |
| QR Letra | Configurações › Telas na rede (QR per screen) |
| Parar Projeção | Done |
| Próximo item pill | Done (Próximo line under Prévia, Linha do tempo) |
| ServiceTimer (elapsed, alert after N minutes) | Done for elapsed (Ao vivo · hh:mm:ss); the alert threshold → Configurações › Culto |
| Chat da equipe (WorshipChat) | Retire for now (needs accounts; desktop has none). Revisit with cloud sync |
| Play an item | Done (`buildStage` in Console.jsx covers SONG, BIBLE, media, TIMER, text) |

Bugs not to carry over: items of any type other than SONG/BIBLE are fetched
with `Media.get`, so BANNER/POLL/QUIZ/ANNOUNCEMENT/TEXT/TIMER never play;
template items have `contentId: ""`; the form writes `startTime` but the list
and header read `time`; "N itens" counts the legacy `service.items`;
`preloadedNext` is written and never read; `autoAdvance` and `sceneId` are
saved and never read; Modo Ensaio ignores media; trash on an item has no
confirmation.

## 3. Mídia (`src/pages/Media.jsx`) — migrated (phase 5, see section 9)

| Function | Destination |
| --- | --- |
| List with type and category | Console · Biblioteca › Mídia (done; show category in pt-BR) |
| Projetar | Done |
| Upload of several files, título, descrição, categoria | Console · Biblioteca › Mídia, "Adicionar arquivos…" (desktop `media.importFile`) |
| Excluir | Console · Biblioteca › Mídia row action, with confirmation (moves the file aside, never deletes) |
| Reproduzir todos em loop | Console · Biblioteca › Mídia, "Tocar todos" (`projection.showPlaylist`), PowerPoint included or said so |
| Abrir tela de projeção | Done (Saídas) |
| Editar mídia | New: rename and recategorise in the row menu |
| Áudio (new, 2026-10-07) | Done: audio files upload in Mídia, play on the audio channel under the screens, "Tocar em sequência" in the library, the player on top of the Programa with L/R meters. Still to do: the song's own playback track (`content.audio`) plays without transport |

Bugs not to carry over: on mobile the live call sits inside the window-open
intercept and never runs; `mutate` instead of `mutateAsync` hides create
failures; the loop silently skips PowerPoint; `media/MediaCard.jsx` is dead.

## 4. Comunicação (`src/pages/Communication.jsx`) — migrated (phase 5, see section 9)

| Function | Destination |
| --- | --- |
| List of comunicações, Projetar | Console · Biblioteca › Avisos through `projection.showCommunication` (no postMessage) |
| Reproduzir todas em loop | Console · Biblioteca › Avisos, `projection.showCommunicationPlaylist` |
| Editor: título, tipo (contagem regressiva, cronômetro, chamar atenção, anúncio, imagem + texto), duração, textos, fonte, cores, efeito, posição, fundo imagem/vídeo/áudio, logo e posição, som de alerta, vários arquivos | Preparar · editor de aviso (new design) |
| Abrir projeção | Done |

Bugs not to carry over: a type outside the known ones crashes the form;
mutations have no `onError`; `logoUrl` is loaded and unused; gradients use
`to br`.

## 5. Bíblia (`src/pages/Bible.jsx`) — migrated (phase 6, see section 9)

| Function | Destination |
| --- | --- |
| Livro → capítulo → versículos, projetar | Done (Bíblia environment + quick jump "jo 3 16") |
| Versão, aviso quando não instalada | Done |
| Estilo da projeção (cor, tamanho, fonte, fundo) | Console · Camadas › Tema; the Bible keeps its own theme choice |
| Pesquisar por palavra | Bíblia environment, a "Buscar palavra" field (`searchVerses`; escape the regex) |
| Leitor (sem projetar) | Done (the reading view is the chapter column) |
| Favoritos | Done (local list); move to `BibleNote` so they survive a reinstall |
| Anotações | Bíblia environment, notes on a verse (`BibleNote`) |
| Destaques | Retire (nothing ever wrote them) |
| Adicionar ao culto | Done |
| Comparar traduções | Bíblia environment, a "Comparar" view |
| Bíblias instaladas (Baixar, Reinstalar, Do arquivo) | Configurações › Bíblias (VerifyView already installs) |
| Importar Bíblia (web) | Web build only; keep behind `!keryx.isDesktop` |
| Ferramentas de projeção | See Músicas |
| Overlays | Console · Camadas |

Bugs not to carry over: every Projetar creates another `BiblePassage` row
(the console creates one only on "Adicionar ao culto"); a background colour
is saved in `background_image`; overlays never reach the projector; the
search highlighter crashes on "("; passages added from favourites are always
tagged NVI; the background upload has no `try`.

## 6. Configurações (`src/pages/Settings.jsx`) — migrated (phase 2, see section 9)

| Section | Destination |
| --- | --- |
| Idioma | Retire (pt-BR only; `language` is read nowhere) |
| Fundo da aplicação | Retire |
| Logo da aplicação (URL or file) | Configurações › Igreja: logo only (`logo_url`, read by `useChurchLogo`) |
| Cores da aplicação, da barra, dos submenus | Retire (the design system has its own tokens) |
| Modo de dispositivo | Retire |
| Dispositivo de vídeo remoto (QR `/VideoProjection`) | Configurações › Telas na rede |
| Telas e saídas (`DisplaysSection`) | Configurações › Telas e saídas (also the Saídas popover) |
| Telas na rede, PIN (`NetworkSection`) | Configurações › Telas na rede |
| Dados, backup, exportar/importar, pasta de dados, diagnóstico, atualizações (`SystemSection`) | Configurações › Dados e atualizações |
| Editor de temas de projeção (`ThemeEditorSection`, `ThemeEditor`) | Console · Camadas › Tema, "Editar tema…" (canvas editor in the design system) |
| Salvar configurações (reload) | Retire: each setting saves on change |
| Zona de perigo (web, excluir conta) | Web build only |

Also: `useThemeColors` and the `--primary-color` / `--navbar-*` variables
are read nowhere and go with the shell; `gerar_projection_settings` in
localStorage goes too.

## 7. The rest

| Page | Destination |
| --- | --- |
| EBD (`BibleSchool`): turmas, alunos, materiais (slides, quiz, vídeo, imagem, texto), projetar via `BibleProjectionSync` | Preparar · a "Escola bíblica" service template; materials project through `projection.school.*` (the `school` layer exists). Turmas and alunos: a small EBD screen in Preparar |
| Estatísticas (`Analytics`) | Relatórios: top songs, by category, cultos por mês, CCLI with Copiar |
| Histórico (`SongHistoryPage`) | Relatórios: recent plays, counts |
| Busca global (`GlobalSearch`) | Done (palette); materials join the palette |
| Painel do operador (`OperatorPanel`) | Retire. Its useful pieces are already in the console: send song, versículo rápido (quick jump), logo/vazio (Mostrar logo, Encerrar), editar slide ao vivo (→ Console · Slides "Editar slide"), berçário alert (→ Console · Camadas › Alerta, `projection.alert`) |
| Gestor de Projeções, DeviceForm, DeviceCard, SceneForm | Retire (decision above) |
| DeviceView | Retire; network screens list only the live-state pages |
| Anúncios (`AnnouncementCarouselPage`, `BannerTemplate`) | Retire the page; announcements are comunicações in the Avisos library |
| BannerProjection, `components/banners/*` | Retire (nothing sends it messages) |
| Shell: `Layout`, `TopHeader`, `BottomTabBar`, `PagePanel`, `PageTransition` | Retire with the last page; the console is the app |

## 8. References to update when pages go

- `src/pages.config.js` (the nine Layout pages, `mainPage: "Home"` → the console).
- `src/App.jsx` routes, including `/Services/:id` and the explicit raw routes.
- `electron/lan.cjs` `NETWORK_SCREENS` (`/DeviceView`, `/AnnouncementCarousel`)
  and `SCREEN_WRITES` (`ProjectionDevice.update`), plus `electron/lan.test.cjs`.
- `src/components/ErrorBoundary.jsx` `SCREEN_PATHS`.
- Console links to the old pages: `Popovers.jsx` (Configurações, Telas e
  saídas…, links to `/Home`, `/Media`), `VerifyView.jsx` (Telas e saídas,
  `/Media`).
- `src/hooks/useLanBaseUrl.js` `LAN_OFF_HINT` (points at "Configurações").
- `src/pages/Projection.jsx` legacy postMessage handlers (tools,
  communication), `AlertOverlayRenderer` fallback to `AlertMessage`,
  `BibleMaterialProjection` listening to `BibleProjectionSync`.
- `src/hooks/useProjectionControl.js` (only Músicas and Cultos use it).
- `electron/smoke.cjs`: the Músicas operator flow (`checkOperatorFlow`) and
  the LAN check that loads `/Settings`; `CLAUDE.md` and `electron/main.cjs`
  mention `KERYX_START_PATH=Settings`.
- Orphans once their page goes: `projection/QuickVerseBar`, `QuickAccessDock`,
  `LiveSlideEditor`, `DeviceCard`, `DeviceForm`, `SceneForm`, `ThemeEditor`,
  `AnnouncementCarousel`; already dead today: `songs/SongForm.jsx`,
  `songs/SongCard.jsx`, `media/MediaCard.jsx`, `UrlLyricsImporter.jsx`,
  `projection/SongSearch.jsx`.
- Entities left without a writer: `ProjectionDevice`, `ProjectionScene`,
  `AlertMessage`, `BibleProjectionSync`, `BannerTemplate`, `ChatMessage`.
  Keep the tables (user data), drop them from the UI; a later schema round
  decides.

## 9. Phases

Each phase is approved on its own, and each ends with `npm test`, lint, the
smoke and a look at the page.

1. **Design**: Claude Design draws the screens the canvas lacks (prompt below).
2. **Configurações** in the design system. **Done 2026-10-07** (canvas
   artboard 20): inside the console (`src/components/console/settings/`),
   seven sections — Telas e saídas (diagram, per-output screen, Abrir ao
   iniciar, Tela ociosa), Telas na rede (on/off, QR, PIN, clients), Bíblias
   instaladas (install, default version), Igreja (name, city, logo — new
   profile fields church_name/church_city), Temas (rename, default,
   delete), Letras (Vagalume key, "Ao importar" lines), Dados e
   atualizações. On the desktop `/Settings` redirects to
   `/Console?config=telas`; the appearance options are gone there. The web
   build keeps the old page (account deletion) until a web settings pass.
3. **Músicas**. **Done 2026-10-07** (canvas artboard 16): the song editor
   inside the console (`SongEditor.jsx`): all SongForm fields, notes,
   cifra and "Importar cifra", the lyrics with [Verso]/[Refrão]/[Ponte] and
   a live split (Estrofe / 2 / 4 linhas) into 16:9 thumbnails, per-song style
   (tema, fonte, 6 tamanhos, cor, efeito, fundo), the song video or playback
   with "Marcar tempos" (Space), Imprimir (escaped), Excluir (asked twice),
   Ctrl+S. Opening keeps a song's saved slides; editing the lyrics redoes
   them. Biblioteca › Letras: Editar, favorite star and "só favoritas",
   "+ › Nova música / Exportar todas". A live send records SongHistory and
   play_count (as Músicas did). On the desktop `/Home` (and `/`) redirect
   to the console; the web build keeps the old page. Not carried over: the
   artist accordion and A–Z rail (search replaces them), "Apagar todas"
   (retired), text_color_2 (not in the Song schema; it was dropped on write).
4. **Cultos**. **Done 2026-10-08** (canvas artboard 17): the planner
   inside the console (`ServicePlanner.jsx`, arithmetic in
   `src/lib/console/setlist.js` with a test). Culto: nome, data, hora
   (`startTime`; the legacy `time` is still read), local, tipo
   culto/evento, status Rascunho/Planejado/Feito, notas, picker, Novo,
   Excluir (asked twice; its items go too). Equipe: "Nome · função", Enter
   adds, suggestions from WorshipTeam. Setlist: sections (new item type
   SECTION: a header with its count and length, never sent to air), every
   kind (Música, Bíblia by reference, Vídeo, Áudio, Imagem, Aviso, Texto,
   Timer), drag to reorder, per-item título/duração/notas, ativar,
   duplicar, tirar (asked twice), planned times, total and "termina às".
   Criar a partir de modelo (appends to this culto), Salvar como modelo
   (templates now keep `contentId`, so their items play), Duplicar o culto
   anterior, Exportar PDF (times, sections, team, notes). Avisos in a setlist
   now play (`communication.show`). Opened from the KERYX menu (Planejar o
   culto, Novo culto), the Setlist header and a row's "…"; on the desktop
   `/Services` and `/Services/:id` redirect to `/Console?planner=…`; the
   web build keeps the old page. Not carried over: scenes and autoAdvance
   (never read), the team chat (needs accounts), OBS/QR (Configurações ›
   Telas na rede), the ServiceTimer alert threshold.
5. **Mídia and Comunicação**. **Done 2026-10-08** (canvas artboards
   "Biblioteca de mídia" and "Editor de aviso"). Mídia: `MediaView.jsx`
   inside the console — grid/list, Todas/Vídeos/Imagens/Áudios
   (Apresentações when there are any), categories in pt-BR, search,
   "Enviar arquivos" (several, with progress, `mutateAsync`-style errors
   per file), YouTube link, rename, recategorise, "Tocar em sequência"
   (PowerPoint is said to be skipped, not silently), Delete asked twice
   (the row goes, the file stays), lost files flagged with "Localizar…"
   (`integrations.Core.FileInfo`), durations read from the files.
   Comunicação: `NoticeEditor.jsx` — the five kinds (new `attention`,
   "Chamar atenção"), título, texto, duração, logo corner, alert chime,
   size, font, colour/gradient, effect, alignment, position, background
   (bundled photos, image, colour, video, audio, a loop of files), live
   preview, Excluir (asked twice), Ctrl+S, unsaved changes asked once.
   Biblioteca › Avisos: Editar, "Tocar todos" (`communication.show` with a
   playlist; the projector and the avisos screen advance it). The screens
   now draw avisos in full (ScreenRenderer); `/CommunicationProjection`
   uses ScreenRenderer too. On the desktop `/Media` and `/Communication`
   redirect into the console; the web build keeps the old pages. Not
   carried over: the old "Aguardando comunicação" placeholder (the idle
   logo shows instead); the Tailwind gradients ("to br") are read as CSS.
6. **Bíblia, the rest**. **Done 2026-10-08** (no artboard; built in the
   Bíblia environment's own look). The centre panel has Ler / Buscar /
   Comparar. Buscar: `searchBible` (installed Bíblia), all words or a
   "quoted phrase", accents and case ignored, Toda / AT / NT / Este livro,
   canonical order, hits marked without a regex (the old highlighter's "("
   crash is gone), ↑/↓ through the results, Enter or 2 clicks project from
   that verse; the top field and the palette search words too. Comparar: up
   to four versions side by side, aligned by verse, each with Enviar and
   Usar, failures shown per column. Anotações: a note per verse
   (`BibleNote`, note_type "note"), marked in the reading view and listed on
   the left. Favoritos: `BibleNote` (note_type "favorite"); the old local
   list moves there once. Not carried over: Destaques (nothing wrote them);
   creating a `BiblePassage` on every Projetar. Also fixed on the way: search
   results follow the canon (row ids need not), and a number inside a verse
   ("930 anos") is no longer drawn as a verse mark. On the desktop `/Bible`
   redirects to the console's Bíblia; the web build keeps the old page.
7. **EBD and Relatórios**.
8. **Removal**: the shell, the old pages, the legacy paths, the references in
   section 8, `mainPage` → the console, the smoke rewritten on the console.

## 10. Prompt for Claude Design

> Add six screens to the KERYX design system canvas, in the same dark, dense
> operator style (Geist, the kx- components, pt-BR copy, Tela preta/Mostrar
> logo always visible in the top bar). Each screen opens from the console
> and returns to it; none of them changes what is on the projector.
>
> 1. **Editor de música** (Preparar): title, artist, category, duration, BPM,
>    key, CCLI, notes for musicians, chords; the lyrics editor with
>    [Refrão]/[Verso] markers and a live slide split beside it (16:9
>    thumbnails); "Importar cifra" (paste ChordPro); a song video with a
>    lyric-timing mode (press Space to mark each slide); per-song style
>    override (theme, font, size, colours, effect, background); Imprimir.
> 2. **Planejador de culto** (Preparar): the culto's header (name, date,
>    time, place, type, status), the team rota (member + role), and the
>    rundown with typed items (música, Bíblia, vídeo, imagem, aviso, texto,
>    timer), drag to reorder, per-item notes and duration, totals; "Criar a
>    partir de modelo", "Salvar como modelo", "Exportar PDF".
> 3. **Biblioteca de mídia**: grid and list views, categories, multi-file
>    upload with progress, rename, "Tocar todos", a missing-file state.
> 4. **Editor de aviso**: type (contagem regressiva, cronômetro, chamar
>    atenção, anúncio, imagem + texto), texts, duration, background
>    image/video/audio, logo corner, alert sound, a 16:9 live preview.
> 5. **Configurações**: left list of sections (Telas e saídas, Telas na rede,
>    Bíblias, Igreja, Temas, Dados e atualizações), each a dense form; the
>    displays section shows the monitors as a diagram with each output on one.
> 6. **Escola bíblica**: turmas with students, materials (slides, quiz with
>    reveal, vídeo, imagem, texto), and a "Projetar" flow that uses the same
>    Programa/Prévia pair as the console.
