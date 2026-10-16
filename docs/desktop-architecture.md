# KERYX as an offline-first desktop app

Status: decisions settled 2026-10-06. Phases 0–5 (shell, local data, outputs,
media and Bible, shipping, network screens) are built, and so is the
redesign: the operator console is the whole app (migration phases 2–8,
`docs/migration-inventory.md`). Installing on the booth PC and running a
real service is the church's to do.

**Current state (2026-10-08, after migration phase 8).** KERYX is desktop
only: the web build on Supabase, its login pages and backend were retired
(desktop projection apps don't run in a browser; tablets and TVs join
through the computer's network server). The app is `/Console` plus the
output pages (`/Projection`, `/LyricProjection`, `/StageView`,
`/VideoProjection`, `/CommunicationProjection`, `/PastorView`); every old
page, the brown "mc-" shell, the postMessage path to a projector window, the
`AlertMessage` and `BibleProjectionSync` fallbacks, the live state's
`school` layer with `/BibleMaterialProjection`, `DeviceView` and its
heartbeat (the one write network screens had) are gone. Network screens
only read, and say which page they show when they connect; the console lists
them from that. The sections below keep the plan as it was written, phase by
phase; where they describe a page or path listed here, that is history.

## Why

KERYX is a live-service tool: when the lyrics freeze in front of the
congregation, nothing else about the app matters. Today every slide change
goes through a cloud database, every Bible verse is fetched from the internet,
and the projector window is a browser popup. A desktop app fixes all three:
the live engine runs on the booth PC, works with the cable unplugged, and
owns its displays.

This is what Holyrics, ProPresenter, EasyWorship and FreeShow do. Cloud comes
back later, optionally, for sync between PCs, backups and the Gerar Planner
integration (the parked `cloud-security-model` branch is the basis for that).

## Goals for version 1

- Fully usable with no internet and no account.
- Installed from a Windows installer on the church's booth PC.
- Outputs (projector, TV, stage monitor) open fullscreen on the right display
  automatically at launch.
- Songs, services, Bible, media and themes stored on the PC, backed up
  automatically.
- The existing React UI survives mostly intact; the redesign happens after,
  on top of the new foundation.

Out of scope for v1: cloud sync, multi-PC, accounts, the Gerar Planner link,
Mac/Linux builds (the layout allows them, the work doesn't include them).

## Shape of the system

```
┌──────────────────────── KERYX.exe (Electron) ────────────────────────┐
│                                                                      │
│  main process (Node)                                                 │
│   ├─ SQLite database        %APPDATA%/KERYX/keryx.db                 │
│   ├─ media library          %APPDATA%/KERYX/media/                   │
│   ├─ local HTTP + WebSocket server                                   │
│   │     127.0.0.1:7700  full app   (operator windows load from here) │
│   │     0.0.0.0:7701    screens    (tablets/TVs on the church Wi-Fi) │
│   ├─ display manager        which output goes on which monitor       │
│   ├─ live state             what is on screen right now, broadcast   │
│   ├─ backups, updater, settings, optional AI calls                   │
│                                                                      │
│  renderer windows (the React app, unchanged pages)                   │
│   ├─ operator window        /Home, /Services, /Bible, ...            │
│   ├─ output windows         /Projection, /LyricProjection, ...       │
│   │                         frameless, fullscreen, one per display   │
└──────────────────────────────────────────────────────────────────────┘
          │ Wi-Fi, same bundle, screen routes only, optional PIN
          ▼
   tablets / smart TVs / stage monitor PC  (any browser)
```

One React bundle runs in three places: the operator window, the output
windows, and browsers on the local network. What differs is the transport
behind `src/api/client.js`.

## 1. Data: SQLite behind the existing adapter

`src/api/client.js` already hides the backend from the 60-odd call sites:
`keryx.entities.<Name>.list/filter/get/create/update/delete/bulk*/subscribe`.
The swap happens behind that surface; **pages don't change**.

- **Engine:** `node:sqlite` (built into Electron 44's Node 24 and into the
  Node that runs the scripts), synchronous, one file. Chosen over
  `better-sqlite3` because it needs no native rebuild for Electron, so the
  same store module runs in the app, the import script and `node --test`.
- **Schema:** the same 31 tables, generated from `base44/entities/*.jsonc`
  like the Supabase one was. Text ids (imported rows keep theirs, new rows
  get UUIDs), `jsonb` columns become JSON text, `created_date`/`updated_date`
  kept. The `church_id` column from the cloud branch is not needed locally.
- **Transport:** the renderer calls `window.keryxDesktop.db.<op>` exposed by the
  preload script; the main process runs the query. Network screens use the
  same operations over HTTP/WebSocket. The adapter picks the transport at
  startup (`window.keryxDesktop` present → IPC, else → network).
- **Filters and sort:** the adapter's Mongo-shaped filter (`$in`, `$gte`,
  `$regex`, …) and `"-field"` sort compile to SQL `WHERE`/`ORDER BY`. Same
  semantics the pages rely on today, including the two read shapes
  (positional vs `{ sort, limit, skip }`).
- **`subscribe(cb)`:** the main process emits a change event after every
  write (`{ type, data, id, timestamp }`, the same shape as today) to every
  window and every network screen. This replaces Supabase realtime and is
  what keeps `LyricProjection`, `StageView`, `VideoProjection` working
  unmodified in phase 1.
- **`auth.*`:** there is no login. `auth.me()` returns a local operator
  profile from settings (name, church branding). `isAuthenticated()` is
  always true. `AuthContext` keeps its shape so pages don't change.
- **`integrations.Core.UploadFile`:** copies the file into the media library
  and returns a local URL (section 4).
- **`integrations.Core.InvokeLLM`:** optional, see section 6.

**Importing today's data:** a one-off script reads from Supabase (or Base44,
the existing `scripts/migrate-from-base44.mjs` already does the Base44 half)
and writes the SQLite file, downloading media that still points at Base44's
CDN into the library.

## 2. Live sync: one source of truth

Today "what is on screen" lives in five cloud tables (`lyric_sync`,
`video_sync`, `video_control`, `live_session`, `bible_projection_sync`) that
exist only as a message bus, plus a parallel `postMessage` channel for the
local projector window. `Home` and `Services` each carry a copy of the
control logic.

- **Phase 1 (no page changes):** those tables become SQLite tables like any
  other, and the change-event broadcast carries their updates to outputs and
  network screens. Everything works as now, minus the internet.
- **Phase 6 (the redesign):** replace the tables with a single **live state**
  document held in the main process. Operator pages mutate it through one
  `projection` service; outputs render it. This is where the duplicated
  control code in `Home`/`Services` collapses into one module, and where
  `postMessage` goes away.

### The live-state engine (phase 6, part 1)

Decided 2026-10-06. Built in steps; the app runs end to end after each.

**The document** (`shared/live-state.mjs`, one module for the main process,
the pages and node:test):

```
{ version, rev, updatedAt,            // rev: a newer snapshot always wins
  screen: "show" | "black" | "logo",  // overrides everything; Esc = black
  session: { id, serviceId, startedAt },
  background: { kind: image|video|color, value },     // under everything
  content: { kind: lyrics|bible|text, ref, title, artist,
             slides: [{ text, duration, is_chorus }], index,
             style: { font_size, font_family, text_effect, text_color, text_color_2, background_image },
             stage: { song_key, bpm, chords, musician_notes } },
  media: { kind, url, title, playlist, playlistIndex,  // main projector
           playback: { paused, position, at, volume } },
  video: { kind, url, title, playback },               // video screens / tablets
  tool: { mode: clock|stopwatch|timer|freetext, text, style, startedAt, endsAt },
  communication: { item, playlist, playlistIndex, startedAt },
  school: { content_type, slides, index, quiz_questions, quiz_index, quiz_reveal, media_url, style },
  overlays: [...], alert: { message, type, since } }
```

- **Main projector priority** (`mainLayer`): screen black/logo › tool ›
  communication › media › content; background under, overlays and alert
  over. Showing content takes down tool/communication/media, so "nothing
  appears after black or a clock" can't happen. Other outputs pick their
  layers: lyrics screen = content; stage = content + next slide + `stage`;
  video screens = `video`; Escola bíblica = `school`.
- **Shared clock:** timers store `endsAt`/`startedAt`, video stores the
  position at time `at`; every snapshot carries `serverNow` so a tablet with
  a wrong clock still counts the same seconds (`keryx.live.now()`).
- **Restart:** `live.json` in the data folder (debounced); restored with the
  same content and `screen: "black"`, playback paused. One click resumes.
- **Media** in the document is `keryx-media://` like the database; each
  window and network screen maps it to a URL it can load.

**Plumbing (step 1, built):** `electron/live.cjs` holds it and broadcasts the
whole snapshot after each change (a few KB; no diffs to get out of order).
IPC `keryx:live:get` / `keryx:live:call` / `keryx:live-change`; network
screens read `GET /api/live` and `event: live` on `/api/events`, never write.
In the pages: `keryx.live` (`src/api/liveClient.js`), `useLiveState()` /
`useLiveNow()` (`src/hooks/useLiveState.js`), and the operator API
`src/lib/projection.js` (`showLyrics`, `goTo`, `next`, `showMedia`,
`transport.*`, `showTool`, `alert`, `setScreen`, `clear`, …). The web build
runs the same rules in the browser (`backends/localLive.js`, localStorage +
`storage` events: the operator tab and its own windows; no remote screens).

**Migration steps:**

1. Engine only (above). No page uses it yet. **Done.**
2. Lyrics and Bible. **Done.** Home and Services share
   `src/hooks/useProjectionControl.js` (go live with a song or passage,
   Parar, Esc, the close warning; `songContent`/`passageContent` turn rows
   into content); Bible uses the same content helpers. `LyricPlayerPanel`
   moves the live slide. `/Projection`,
   `LyricProjection`, `StageView` and `PastorView` render `content`;
   video and Escola bíblica screens clear when the session ends
   (`useLiveSessionEnded`). Nothing writes `LyricSync`, `LiveSession` or
   `ProjectionState` any more; `LatencyIndicator`, `useLiveSessionChannel`
   and `sessionCleanup` are gone. Behaviour changes:
   - the projector no longer advances slides on its own timer (it used to,
     every 10 s, until the operator touched a key); the panel's Auto button
     (Space) advances every screen together;
   - the stage gets chords, key, BPM and notes on network screens too, and
     clears on Parar (it used to miss the stop message); its song time counts
     from when the operator put the song up;
   - Bible passages from Cultos get the Bible layout (they lost it before);
   - arrows/clicks on the projector window move the live slide everywhere;
   - the QR code / OBS links no longer carry a `?ch=` no screen read.
   The smoke run clicks through Músicas (Projetar, arrow key, Parar
   Projeção) and checks the projector; `KERYX_SMOKE_SHOTS=<folder>` saves
   screenshots of projector, stage and operator page.
3. Video, media, YouTube. **Done.** One player, `LiveVideo`, follows the
   shared playback (`playbackPlan` in the rules: late joiners seek, small
   drift is left alone, a finished video rests on its last frame). Video
   screens, the tablet overlay, the projector media layer (`LiveMediaView`,
   playlists advanced by the desktop projector) and the operator panels'
   muted previews all use it. Nothing writes `VideoSync`/`VideoControl`;
   network screens no longer write anything but the DeviceView heartbeat.
   **Audio channel (2026-10-07):** `live.audio` holds music or a playback
   track (`audio.show`, `audio.playlist`, `audio.advance`, `audio.clear`;
   `playlist.goTo` jumps within a media or audio list; `transport` takes
   `layer: "audio"`). It is not a main layer: it plays under whatever the
   screens show, and Encerrar/Esc leave it playing (the player's Parar stops
   it). Only the desktop's own `/Projection` window plays it, so a TV on
   the network showing that page stays silent. Media rows may be `audio`.
   **Tirar o vídeo · o som continua (2026-10-13, as in Holyrics):** the
   player's eye button moves a video file on the projector into the audio
   channel (`media.toAudio`: same second, volume and pause; a list goes
   along, only what can be heard; allowed while locked) and "Mostrar o
   vídeo" moves it back (`audio.toMedia`). YouTube cannot play hidden, so
   it is refused. There is no cut at the switch (2026-10-14): a window's
   `<video>` elements come from one pool by url (`src/lib/mediaPool.js`,
   used by `LiveVideo`), so the media layer's player lets the element go
   and the hidden audio player takes the same one in the same React
   commit, still playing; detached and attached again inside one task, it
   never pauses or reloads. One let go and not taken back is paused at
   once (Tela preta, an aviso over it: silent, as before) and thrown away
   after a few seconds.
   **Level meters:** the console reads the computer's own output (system
   loopback, `meterStore.js`); nothing taps an element. Where sound plays
   (`LiveVideo` with a `meter` layer: the projector's media and audio, the
   video screens) the output only reports the item's duration over
   `keryx:meter` (`useDurationReport`), relayed by the main process to the
   console's player. Nothing is stored. YouTube reports its duration only.
4. The rest of the engine and outputs. **Done** (decided 2026-10-06: engine
   and outputs only; today's operator pages are not rewired, because the
   redesign replaces them).
   - `/Projection` renders every layer: tools on the shared clock,
     communication (`CommunicationProjectionView` live mode: counted from
     `startedAt`, sequences advanced by the desktop projector), media,
     content over the background layer (image, colour or video loop),
     overlays (the renderer's `Overlays`) and the alert on top, black/logo over all.
   - `CommunicationProjection` is a view of the communication layer;
     `BibleMaterialProjection` of the school layer (no `?channel=` needed);
     the alert renderer and the video screen show the live alert.
   - Outputs can be opened by the main process (`keryx:displays:open`,
     `outputs.open`), and each has "Abrir ao iniciar" in Telas e saídas
     (`openAtLaunch` in the assignment). Comunicação is an output too.
   - Network screens: `/Projection`, `/PastorView` and
     `/CommunicationProjection` join the list.
   - **Transmissão** (2026-10-10, the UX research's P2 presets):
     `/StreamView` is a network screen for OBS (Fonte de navegador, 1920 ×
     1080). A transparent page with the slide as a lower third: lyrics,
     Bible text without its verse numbers plus the reference, text slides.
     Media, videos, avisos and tools never reach it, and Tela preta, Logo,
     Limpar and Encerrar clear it (`src/lib/streamCaption.js`, tested). The
     outputs are grouped by what they are for (`GROUPS` in
     `src/lib/console/outputs.js`): Público, Palco, Transmissão, in Saídas,
     Telas na rede (each screen with its own address to copy) and the
     network's screen picker.
   - Still on the old paths at the time, until the redesign replaced their
     pages: the Ferramentas and Comunicação pages (postMessage), the Painel
     do operador's alerts (`AlertMessage`) and BibleSchool
     (`BibleProjectionSync`). All retired in migration phase 8 (2026-10-08);
     the tables stay as user data.

Not in part 1: devices and scenes (`ProjectionDevice.current_output`,
`DeviceView`, `OperatorPanel`) and `BannerProjection` wait for the UI
redesign.

### The console (phase 6, part 2)

Decided 2026-10-07 after the mockup in Claude Design (`docs/design-system.md`
has the link and the tokens). One screen, `/Console`, replaces the operator
pages: the library (Letras, Mídia, Avisos), the slides in hand, Programa and
Prévia, Camadas, Setlist, Bíblia as its own environment, the
command palette (`/`) and Saídas (with *Travar telas*). (The Linha do tempo
strip it also had was removed on 2026-10-12: the church plans the order, not
the times; the top bar's service clock stays.)

- **Verses on screen** follow one set of rules wherever they come from
  (`src/lib/console/bibleVerses.js`, tested; `stageFromVerses` in
  `stage.js`): one verse is its whole chapter, one verse per slide,
  starting there (only a move when that chapter is on air); a range is
  that passage, grouped per slide. The Bíblia environment and the palette
  (a reference prepared in the KERYX environment, Shift+Enter a
  `BiblePassage` + `ServiceItem`) both use it.

- **Programa / Prévia.** A click anywhere prepares a *stage*
  (`src/lib/console/stage.js`: the live-state operation that would put the
  item on air, plus title, slides and a start index). Only "Enviar ao ar"
  (Enter) sends it. The Prévia monitor is the stage applied with `applyOp` to
  a copy of the current look; both monitors are `ScreenRenderer`, the
  projector's own component, scaled by container units.
- **Travar telas** (2026-10-10; it replaced Ensaio, a local copy of the
  document). The live state's `locked` flag (`screens.lock`), checked in
  `applyOp`: while locked every op that would put something new on the
  screens throws a 423; removals, `screen.set`, `idle.set`,
  `session.end` and the outputs' `*.advance` pass (`WHILE_LOCKED`).
  Being in the shared rules, it holds for the console, the outputs and the
  preview server alike; `restoreState` comes back unlocked.
- **Engine additions for it:** `history` (what the main layer showed before
  each change, for "Voltar ao anterior" — back through the Prévia, never
  straight to air), `session.item` (the ServiceItem on air), the `logo`
  layer, and the style keys `text_align`, `text_position`, `transition`.
- **Camadas** edit the live state directly: Logo = `logo.set`, Sobreposição
  = `overlays.set`, Texto principal = `content.update { style }`, Fundo =
  `background.set/clear`. A theme is a `ProjectionTheme` row; the panel
  shows "Modificado" when the style on air differs from it.
- The **Setlist** is `ServiceItem` rows of the service in hand (today's by
  default); drag reorders by writing `order`. The timeline's real lane is
  the console's own log of when each item went on air (localStorage per
  service); the planned lane is `Service.startTime` plus durations.
- **Saídas** = the main process's output windows (`keryx:displays:list`,
  polled) plus network `ProjectionDevice` heartbeats. The quick alert is the
  one control that bypasses the Prévia (`alert.show`).
- The layout (module sizes, collapsed, hidden) is saved per profile in
  localStorage (`src/lib/console/layout.js`); "Restaurar layout" resets it.
- **One console, always live (2026-10-07).** The top bar is a menu bar: the
  KERYX mark opens the menu, the tabs **KERYX | Bíblia** switch environment,
  then the search, the **service clock** (from the service's scheduled time;
  `serviceClock` in `src/lib/console/timeline.js`), the clock, the outputs
  status and the Telas group. There are no steps: preparing while live is
  safe because nothing reaches the screens without sending, and *Travar
  telas* freezes them for a rehearsal. **Verificar** (`VerifyView`) is an
  overlay opened from the Saídas popover or the KERYX menu: output windows
  and network screens, every media file of the setlist (a HEAD request to
  the local media server, which answers 404 when a file is gone), fonts, the
  Bible versions installed for offline use and what needs the internet. The
  bar never wraps: container queries drop the clock, then shorten the
  outputs label and the search as the window narrows. The projector output
  opens with the app on first run, and a live send reopens it if closed;
  the idle screen is the church logo, plain black, or a **wallpaper** the
  operator chose (`idle.set {mode, url}`: `idle` stays the mode string,
  `"logo" | "black" | "background"`, and the image is `idleUrl`, so old
  saves and every `idle === "black"` check keep working; in the live state
  so every screen renders the same emptiness). Logo or Preto keep the last
  wallpaper, so Fundo brings it back. Picking a service applies its
  `standby_background` (Planejar o culto › Fundo de espera), else the
  church's `User.standby_background` (set from the Aparência page, still to
  come); an operator's choice in Saídas wins until the next service is
  picked. The url goes through the live client like every media URL
  (`keryx-media://` in the document), so network screens load it too.
- **Tela preta and Mostrar logo always act on the real screens**, in every
  view and mode: they are the emergency actions. A failing output is a banner
  under the top bar in every view, never over a monitor.
- **Selection vs. on air (Holyrics, 2026-10-07):** the slide or verse on
  air is red, the selection is green. ←/→ move the air; ↑/↓ move the
  selection (`selUp`/`selDown` in `keys.js`) without touching the screens;
  Enter or a double click projects it. In the Bible a single verse goes out
  as the **whole chapter**, one verse per slide, starting there (each slide
  carries its own reference, `slide.ref` in the live state), so ←/→ keep
  walking the chapter; a range picked on purpose goes out as that passage.
  The Bible column shows "No ar agora" only (no Prévia).
- **Layer order:** `live.layerOrder` (top first: logo, overlays, content,
  background; op `layers.order`) stacks the look layers on every screen;
  Camadas reorders them by dragging. Alert, video-channel cover and
  black/logo stay above all.
- **Editor de música** is a view inside the console (`SongEditor.jsx`,
  canvas artboard 16), opened from Biblioteca › Letras (Editar, "+ › Nova
  música") and after a web import. Lyrics split live into slides
  (`slidesFromLyrics`, `withTimings` in `src/lib/songImport.js`, tested);
  a song keeps its saved slides until its lyrics change. On the desktop
  `/Home` redirects to the console. A live send of a song records
  SongHistory and play_count.
- **Bíblia environment, the rest** (phase 6): the centre panel reads
  (Ler), searches (Buscar) or compares (Comparar). Buscar is `searchBible`
  over the installed Bíblia: every word and "quoted phrase", accents and
  case ignored (`src/lib/bibleSearch.js`, tested; the store's `$regex` is a
  folded substring match, so no pattern reaches it), whole Bíblia / AT / NT /
  this book, canonical order, the hits marked; ↑/↓ walk the results, Enter
  or a double click projects from that verse (its chapter, as in Ler); the
  top field and the palette ("Buscar … na Bíblia") start a search when the
  text is not a reference. Comparar sets up to four versions side by side
  (text through `getChapter`; a version that cannot load says why in its
  column), each with Enviar and Usar. Notes on one verse and favourites are
  `BibleNote` rows (`useBibleNotes`; the old local favourites move there
  once); a verse with a note is marked in Ler; notes never reach the
  screens. Bible slides mark only verse numbers in sequence
  (`src/lib/verseMarks.js`): "930 anos" stays text on the screen. On the
  desktop `/Bible` redirects to `/Console?env=biblia`.
- **Escola bíblica** is a view inside the console (`SchoolView.jsx`, canvas
  artboard "Escola bíblica"): turmas (`BibleSchoolClass`) with their data
  and students — a click marks today's presence (`attendance` dates) —,
  the lesson materials (`BibleMaterial`, grouped by lesson, edited in place:
  slides, quiz, text, video, image, teacher's notes, colours) and, on the
  right, the console's own Programa and Prévia. Materials go on air like
  any stage (`stageFromMaterial`, `src/lib/console/school.js`, tested):
  slides and text as `content` slides (a slide's image is drawn above its
  text), the activities (quiz, Verdadeiro ou falso, Complete a frase,
  Memorizar, Discussão; Rodada E4) as slides carrying `activity`, revealed
  on the same slide (`content.reveal`, → / ←; `content.revealed`), video
  and image through the media layer. The teacher's notes travel in
  `content.stage` (the stage screen's notes banner) and show in the
  console's Prévia column; the projector never draws them. Materials join
  the Setlist (ServiceItem type `MATERIAL`; planner "EBD"; "Setlist" in the
  view) and the palette. (The live state's old `school` layer and
  `/BibleMaterialProjection` were removed in phase 8.)
- **Relatórios** is a view inside the console (`ReportsView.jsx`;
  arithmetic in `src/lib/console/reports.js`, tested): by period (30 dias,
  3 meses, 12 meses, tudo), the songs most sent live (SongHistory, written by
  the console's send), plays by song category, cultos per month, the CCLI
  report (songs with a CCLI number played in the period; Copiar as
  tab-separated text, Salvar CSV) and the history with a filter. On the
  desktop `/Analytics` and `/SongHistoryPage` redirect to
  `/Console?reports=1`.
- **Planejador de culto** is a view inside the console
  (`ServicePlanner.jsx`, canvas artboard 17): the culto and its team on the
  left, the Setlist on the right with sections (ServiceItem type `SECTION`),
  planned times, total and end (`plan()` in `src/lib/console/setlist.js`,
  tested), templates that keep `contentId`, duplicating the previous culto
  and the PDF. It writes only the database; nothing there touches the
  screens. Sections never reach `buildStage`, the Próximo line, the
  timeline or the palette (`playableItems`). ANNOUNCEMENT items play as
  `communication.show`. On the desktop `/Services` and `/Services/:id`
  redirect to `/Console?planner=…`.
- **Configurações** is a view inside the console (`settings/SettingsView`,
  canvas artboard 20): Telas e saídas, Telas na rede, Bíblias instaladas,
  Igreja (name, city, logo on the profile), Temas, Letras, Dados e
  atualizações, over the same desktop bridges the old page used. Esc goes
  back to the console and never ends the projection from there. On the
  desktop `/Settings` redirects to `/Console?config=telas`.
- **Setlist without a service:** the first item added (drop, "Adicionar",
  the Bible's "Adicionar à setlist") creates a draft Service "Setlist de
  dd/mm" for today. Today's service is matched by the local date.
- **"+" beside every search** (`AddMenu`): Letras — "Do computador…" (txt,
  ChordPro, cifra, the JSON export; parsers in `src/lib/songImport.js`) and
  "Na internet…" (`LyricsSearch`, main process `electron/lyrics.cjs`:
  LRCLIB first (lrclib.net, open API, no key, full lyrics; duplicates folded
  by title and artist), plus the letras.mus.br search index (Vagalume was
  dropped 2026-10-10: its API is down); letras.mus.br lyric pages refuse automated
  reading, so those open in the browser and are pasted — KERYX does not get
  around that block). Mídia — files via `src/lib/mediaImport.js` and
  "Biblioteca de mídia…". Avisos — "Novo aviso…" opens the aviso editor.
  Bíblia — install a version.
- **Biblioteca de mídia** is a view inside the console (`MediaView.jsx`,
  canvas artboard "Biblioteca de mídia"): grid or list, kind tabs and
  categories (pt-BR labels over the stored sermon/worship/… values),
  "Enviar arquivos" (several, with progress), YouTube links, rename (F2),
  recategorise, "Tocar em sequência" (`media.playlist` for pictures and
  videos, the audio channel for audio; PowerPoint is said to be skipped),
  Delete asks twice and only takes the row out (the file stays in the media
  folder). A Media row whose file is gone is flagged `missing` by
  `useLibrary` from `integrations.Core.FileInfo` (desktop:
  `keryx:media-info`, a stat in the media folder; network screens report
  nothing) and offers "Localizar…"; the console refuses to send it. A
  file's duration is read from the file the first time its thumbnail loads.
- **Avisos** (CommunicationVideo) go on air as `communication.show` (one, or
  a playlist with "Tocar todos"). `ScreenRenderer` draws them in full on
  every output: the five kinds (Contagem regressiva, Cronômetro, Chamar
  atenção — new type `attention` —, Anúncio, Imagem + texto), size, font,
  colour or gradient, effect, alignment and position, a background image,
  colour, video or a loop of files (`fileAt` in
  `src/lib/console/notice.js`, the same file at the same second on every
  screen), the church logo in a corner, and — only on outputs of this
  computer (`audio`) — background audio and a Web Audio chime. The last
  ten seconds of a countdown pulse red. `useNoticeAdvance` (projector and
  `/CommunicationProjection`, which now renders with ScreenRenderer too)
  moves a sequence on at the end of each piece. The **Editor de aviso**
  (`NoticeEditor.jsx`) edits all of it with a live 16:9 preview; saving
  touches the library only, "Pôr na prévia do console" prepares it.
- **The player** (`PlayerBar`, logic in `src/lib/console/player.js`) sits
  between the Programa and the Prévia, in a slot that is always reserved
  (hidden when nothing plays, so the monitors never move): what plays with sound (video screens, a video or YouTube on
  the projector, the audio channel; a switch when several play), Anterior
  (previous in a list, else back to the start), −10 s, Tocar/Pausar (Space),
  +10 s, Próximo, Parar, position and seek, mute and a volume slider, the
  L/R meters (live only) and where the sound comes out, with a warning when
  the projector window is closed. In the library, an audio file prepares on
  the audio channel and "Tocar em sequência" queues every audio of the list.
- Keys (`src/lib/console/keys.js`): a mouse click never leaves focus on a
  control (the console blurs it), so after clicking a song Enter sends it and
  the arrows move the slide or verse on air, as in Holyrics. A control
  focused with Tab keeps its own Enter/Space; Ctrl+Enter sends from anywhere
  but a text field. **A double click sends to air** (user decision
  2026-10-07, replacing the earlier no-double-click rule): library rows,
  setlist rows, slides and Bible verses; one click still only prepares, and
  Esc plus "Voltar ao anterior" are the net. Dragging does the same spatially:
  a row dropped on the Prévia prepares, on the Programa sends, on the Setlist
  becomes a ServiceItem (`src/lib/console/dragStage.js`). **Esc takes the
  projection down at once** (closing an open popover first; in a text field
  it only leaves the field); the audio channel keeps playing. AltGr
  (Ctrl+Alt) is typing. In the Bible environment a letter or digit opens the
  quick jump (`BibleQuickJump`, `src/lib/console/quickRef.js`): "jo 3 16-18"
  fills Livro, Capítulo, Versículo — Space or Tab completes the book; Enter
  selects the verses, Enter again sends. B stays Tela preta there. Output
  windows give the keyboard back to the window that opened them, never
  throttle and never pause covered video (occlusion tracking off), and the
  projector itself handles Esc, B and L if clicked.

Everything the old pages did is in the console (Músicas, Cultos, Mídia,
Comunicação, Configurações, the Bíblia, the Escola bíblica, Relatórios); the
old pages, their shell and their projection paths were removed in phase 8.
`docs/migration-inventory.md` lists every function of the old pages and
where it went (or why it was retired), the bugs not carried over, and the
phases of the migration.

## 3. Outputs and displays

**As it is now (2026-10-08):** only the console is in the Windows taskbar,
as in Holyrics. Every output window (projector, lyrics, video, stage,
pastor, avisos) is created with `skipTaskbar` (`windowOptions`, both paths:
a page's `window.open` and `outputs.open`/"Abrir ao iniciar"), and
`track`/`present` set it again before any change to full screen (on Windows,
changing it on a window already full screen can bring the button back). An
open output has **Trazer para a frente** in the Saídas popover and in
Configurações › Telas e saídas (`showInactive` + `moveTop`, the console
keeps the keyboard). **Closing the console closes KERYX** and every output
(the console's `close` event calls `app.quit()`; the import restart uses
`app.exit()`, which skips it, and the updater's `quitAndInstall` is already
quitting), so the app never keeps running unseen with the network server up.
The smoke checks that every output is off the taskbar and that closing the
console quits with an output open. Measured on Windows 11 during a smoke
(UI Automation on the taskbar, window styles): the app had one taskbar
button while 2–3 of its windows were open — the outputs are off the
taskbar. **Alt+Tab (2026-10-08):** `skipTaskbar` alone does not take a
window out of Alt+Tab, so output windows are also created with
`type: "toolbar"` (WS_EX_TOOLWINDOW; creation-time only, in `windowOptions`).
Measured during a smoke (window styles of the app's windows every 3 s): the
console was the only KERYX window Alt+Tab would list; the outputs had
`tool=True`. The smoke clicks into the projector (real focus) and types
→, B, L, Esc and Ctrl+W there (`outputKeys`); it passed with the projector
full screen on an external monitor (2026-10-09). `focusable: false` is not an option: outputs handle
those keys.

- **Display manager** (main process, Electron `screen` API): lists monitors,
  stores a mapping `display id → output kind` (projector → `/Projection`,
  TV → `/LyricProjection`, stage → `/StageView`, …) in settings, and opens
  each output as a frameless, fullscreen, always-on-top `BrowserWindow` on
  its display at launch and when a monitor is plugged in. Settings gets an
  "Ecrãs" section with a picture of the monitors to drag outputs onto.
- **`window.open` keeps working:** pages open the projector with
  `window.open(...)` (`src/lib/projectionWindow.js`, `Home`, `Services`,
  `BibleSchool`). The main process intercepts these by window name and
  places them on the configured display instead of a popup. `postMessage`
  between opener and output works in Electron, so phase 1 needs no page
  changes here either. The live-state redesign retires it.
- **As built (phase 2):** the main process places windows, it does not open
  them. Pages hold the `window.open` handle and `postMessage` through it
  (`/Projection` receives slides only that way), so a window the main
  process opened itself would be deaf. **Phase 6:** outputs render the live
  state, so the main process opens them too: "Abrir ao iniciar" per output,
  and `keryx:displays:open` (Testar uses it). Settings has
  "Testar" and "Fechar" per output; Ctrl+W closes a fullscreen output; the
  numbers are primary display first. Unit tests cover the placement rules
  (`electron/outputs.test.cjs`), and the smoke run opens a real output
  (`KERYX_SMOKE_FULLSCREEN=1` also tests an explicit assignment).
- **Keyboard and safety:** outputs ignore input; Esc in the operator window
  blanks all outputs; outputs survive the operator window being closed and
  reopened.
- **Per-output settings and layouts (2026-10-12).** Each output page has one
  `OutputPref` row (name, icon, Conteúdo, Mostrar, scale, margins, logo,
  theme, page options) shared by its window and the network screens on that
  path. The Palco and Pastor pages can also draw a **layout**: a
  `ScreenLayout` row (or a factory one, `factory:palco` / `factory:pastor`)
  describing a 16:9 canvas of elements in % of the screen — the pure model is
  `src/lib/layouts.js`, drawn by `src/components/screen/LayoutRenderer.jsx`
  on the output, the network screen (`?layout=<id>` overrides the pref), the
  console's Prévia rail and the editor (`LayoutEditor.jsx`, a console view).
  Outputs stay the fixed list: what the operator creates and categorizes is
  the layout. `""` keeps the page's own screen.

- **Generated backgrounds (2026-10-12).** The live `background` layer can be
  `{ kind: "generator", value: <id>, gen: { speed, scale, intensity, detail,
  spacing, persistence, contrast, colors } }`: `shared/generators.mjs` says
  what the numbers are (the main process checks them in `background.set`),
  `src/lib/generators.js` holds the WebGL 1 shaders and the presets, and
  `GeneratorBackground.jsx` draws one on a canvas inside the renderer. A
  theme keeps one in `ProjectionTheme.background_generator`.

## 4. Media on disk

- Files live in `%APPDATA%/KERYX/media/<uuid>.<ext>`, the database stores
  the relative path, and the local server serves them at `/media/…` to every
  window and network screen. Videos play from disk through the normal
  `<video>` tag.
- `MediaUpload` and `BackgroundGallery` stop writing base64 data URLs into
  rows (today a 200 MB video becomes a 270 MB database row).
- **As built (phase 3):** both upload through `UploadFile` into the media
  folder. Rows store `keryx-media://<file>`. Files shipped with the app
  (`resources/`: 19 backgrounds, the church logo) are served under
  `/media/bundled/…` and referenced the same way, so they pass the pages'
  `startsWith("http")` checks. Three Unsplash photos the old lists used no
  longer exist and were dropped. The import (`npm run db:import`) downloads
  files from Base44's CDN into the media folder and points known Unsplash
  URLs at the bundled copies (`scripts/localize-media.cjs`).
- Thumbnails (2026-10-14): a video's still is `Media.thumbnail_url`, a JPEG
  in the media folder like any file (`keryx-media://`). The console takes
  it (`usePosterBackfill` in Console.jsx: one video at a time, those just
  sent and the ones from before; `src/lib/mediaPosterCapture.js` draws a
  frame of a never-shown `<video>` to a canvas and sends it through
  `UploadFile`), filling the duration when the row has none. "Localizar…"
  clears it so a new one is taken. It rides in the live item as `poster`
  (`stageFromMedia`), so the Prévia shows the frame instead of a black box;
  the Biblioteca's Imagens and Vídeos show the picture on hover, and the
  media library's grid uses it instead of opening each file.
- `powerpoint` as a media type can't be rendered offline by Electron; v1
  accepts PDF exports and says so in the UI.

## 5. Bible: installed once, then local

Before phase 3 nothing read the `bible_verse` table; every verse came from
`abibliadigital.com.br` with the AI as fallback.

- **Not bundled.** NVI (Biblica), ACF (Sociedade Bíblica Trinitariana do
  Brasil) and AA (Imprensa Bíblica Brasileira) are all copyrighted editions.
  An earlier draft of this plan called ACF/AA public domain; that was wrong.
  KERYX ships no Bible text. Each church downloads a version once (≈4 MB,
  from `thiagobodruk/biblia`, the source the web app already used) or
  installs it from that JSON file; it lands in `bible_verse` (31k verses,
  under a second) and works offline from then on.
  Bíblia › Mais › Bíblias instaladas, and a prompt above the verse search
  while none is installed (`BibleInstaller`, `electron/bible.cjs`).
- **One source of verse text:** `src/lib/bibleText.js` (`getChapter`,
  `getPassage`, `searchVerses`, `searchBible`, `readChapter`). Order: local
  database → abibliadigital online. The console's Bíblia (read, search,
  compare), the planner and the palette all use it. KERYX never asks an AI
  for scripture.
- **Which edition (2026-10-10, owner's decision):** the one the operator
  chose, even when another is installed: installed, it is read here; not
  installed but published online (ARA, ARC, NAA, NTLH, King James, or NVI /
  ACF before installing), from the internet, marked "pela internet"; and a
  chapter that cannot be fetched comes from the first installed edition, a
  toast and the Bíblia's warning line saying so ("ARA sem internet · João 3
  na NVI"). AA exists only as an install, so an installed edition stands in
  for it. `editionPlan` / `readByPlan` in `bibleBooks.js` (tested),
  `readChapter` in `bibleText.js`. Comparar shows each edition as itself
  (no fallback). Verificar says, per edition in use, what happens without
  internet.
- **References and books:** `src/lib/bibleBooks.js` parses "Jo 3:16",
  "1Co 13:4-7", "salmo 23" (accents optional), and holds the version list.
  Its verse-count table was wrong in ~165 chapters (Levítico 23 listed 9
  verses instead of 44); it is now taken from the texts.
- Word search runs locally, ignoring case and accents ("coracao" finds
  "coração"), ~0.4 s over a whole version; an FTS index can make it instant
  if that matters.
- AA marks explanatory phrases with `{…}` (286 verses); the text is stored
  and shown exactly as published.

## 6. Internet-dependent features, kept optional

| Feature | v1 behaviour |
| --- | --- |
| Verse lookup and Bible search | **Local** once a version is installed (section 5); other versions online only. |
| Lyrics import from URL, song search (AI) | Out of v1 (decision 4). |
| YouTube projection | Needs internet by nature; unchanged. |
| Unsplash backgrounds (30 hard-coded URLs) | **Done:** bundled (`resources/backgrounds`, 7 MB). |
| Base44 CDN logo in `Layout.jsx` | **Done:** bundled default (`resources/branding`); the profile logo overrides it. |

## 7. Network screens (tablets, stage monitor, smart TVs)

**As built (phase 5):**

- `electron/lan.cjs` listens on `0.0.0.0:7701` **only when "Telas na rede" is
  on** in Settings (`electron/network.cjs`; Windows asks for firewall
  permission the first time). It is a separate server from the loopback one.
- It serves `index.html` only for `/` and the network screens
  (`NETWORK_SCREENS`: Letras, Palco, Vídeo, Material bíblico, Anúncios, Saída
  configurada), injecting `window.keryxLan = true`. Operator pages get a 404.
  Assets and media are served; nothing outside `dist/` and `media/`.
- `/api/db` is read-only except `ProjectionDevice.update` and
  `VideoSync.update` (the writes screens make), needs an `X-Keryx` header
  (blocks cross-site form posts), and caps the body. `/api/events` is
  Server-Sent Events carrying every store change; `EventSource` reconnects
  by itself and the page refetches on reconnect (it fires `online`).
- Optional 4–8 digit PIN: a form at `/lan/pin`, an HMAC cookie for a year,
  five wrong tries lock that address out for a minute, changing the PIN signs
  every screen out.
- In the browser, `src/api/backends/network.js` gives the desktop adapter the
  same bridge shape over HTTP/SSE, so pages are unchanged; `App.jsx` routes a
  network screen to the screen pages and a picker (`NetworkHome`).
- `StageView` now follows the live `LyricSync` when it has no operator
  window; `PastorView` (fed by `ProjectionState`, which nothing writes),
  `Projection`, `CommunicationProjection` and `BannerProjection` (fed only by
  `postMessage`) are not offered on the network until the live-state engine.
- QR codes and copied screen links use the network address
  (`useLanBaseUrl`); with network screens off they say how to turn them on.
- The smoke run opens plain browser windows against the LAN server and checks
  that projected lyrics reach them, the stage follows slides, operator pages
  are refused and the PIN form appears; 10 node:test cases cover the server.

Original plan, for reference:

- The main process serves the same bundle on `0.0.0.0:7701`, restricted to
  screen routes (`/LyricProjection`, `/StageView`, …). Operator routes are
  only served on `127.0.0.1`, so a phone on the Wi-Fi can't open the control
  panel. The Settings page shows the address and a QR code.
- Screens talk to the main process over WebSocket for change events and
  HTTP for reads. Optional 4-digit PIN, remembered per device.
- Screens reconnect automatically and show the last state while offline
  (the existing `useOfflineCache` and reconnect hooks already behave this
  way).

## 8. Backups, updates, packaging

**As built (phase 4):**

- **Backups** (`electron/backup.cjs`): `VACUUM INTO` a consistent copy of
  `keryx.db` on launch and on close, one file per day
  (`keryx-YYYY-MM-DD.db`), the newest 14 kept, written under a temporary name
  so a full disk never replaces a good backup. The folder is configurable in
  Settings; an unplugged USB falls back to `%APPDATA%\KERYX\backups` rather
  than skipping. **Media** (2026-10-09): in a folder the church chose (not the
  default one, which is on the same disk) the media folder is mirrored into
  `<folder>/media` (`mirrorMedia`): in the background on launch, with
  "Fazer backup agora" and when the folder changes, never on close (it cannot
  wait). Only new or changed files are copied (size and mtime; copies keep the
  source's times), each under a temporary name first; files deleted in KERYX
  stay in the mirror. Settings shows the files, size and last copy.
- **Restaurar um backup** (2026-10-09, `archive.stageRestore`): Settings
  lists the folder's daily backups; one is staged like an import (copied to
  `pending-import/`, `quick_check`ed), with a media folder made of today's
  files (hard links, a copy where linking fails) plus what only the backup's
  mirror still has; a native dialog asks once more, the app restarts, and
  `applyPendingImport` swaps it in, moving today's data to
  `before-import-<time>/`.
- **Exportar tudo / Importar** (`electron/archive.cjs`): a zip with a
  manifest, the database and `media/`. Import validates the zip (only
  expected names, so a path-traversal entry is refused; the database must pass
  `quick_check` and have KERYX tables), unpacks to `pending-import/`, and the
  next launch swaps it in *before* the database opens (Windows cannot replace
  an open file). Replaced data is moved to `before-import-<time>/`, never
  deleted; a swap that fails halfway puts the old data back.
- **Logs and diagnostics** (`electron/logger.cjs`, `system.cjs`): a daily log
  in `%APPDATA%\KERYX\logs` (7 days) including crashes; "Salvar diagnóstico"
  saves a zip of the recent logs plus system info (versions, displays, output
  assignments, installed Bibles, backup state). Nothing is sent anywhere.
- **Updates** (`electron/updater.cjs`, electron-updater, from
  comunidadegerar/keryx-releases): checks on launch and every 6 hours
  (`electron/updateSchedule.cjs`), again 30 s / 2 / 10 / 30 min after a check
  that failed (a PC that boots before its network does: the log of
  2026-10-10 shows `ERR_NAME_NOT_RESOLVED` on launch and nothing until the
  operator pressed "Verificar") and 15 s after the PC wakes. By
  default it only tells (the bell, and "Atualizar agora" under Configurações
  in the KERYX menu); **Atualizar automaticamente** (Configurações › Dados)
  checks at once on launch and downloads what it finds. Every state change is
  pushed to the console (`keryx:update`), which shows a popup with a progress
  bar (MB, speed, time left): opened by "Atualizar agora", or by itself when
  auto is on and an update turns up in the first 3 minutes after opening.
  Installing (a silent `quitAndInstall`, about 30 s with the outputs closed)
  is the console's call, never the main process's: with nothing on air it
  counts down 5 s (Cancelar stops it), with something on air it waits for
  "Instalar mesmo assim". Rules in `src/lib/console/updates.js` (tested).
- **Notifications** (`electron/notifications.cjs`, tested): the console's
  bell, red dot while unread, kept in settings.json (30 at most, one per
  key). Today: an update found, downloaded or failed, "KERYX atualizado para
  a versão X" after one, and backups that went to the default folder or left
  media out. Each may carry an action the console runs (`update`,
  `settings:dados`).
- **Installer:** `npm run dist` → `release/KERYX-Setup-<version>.exe` (NSIS,
  per user, pt-BR, desktop and Start-menu shortcuts, unsigned: Windows shows
  the "Run anyway" prompt once). Uninstalling does not delete
  `%APPDATA%\KERYX`. `npm run dist:dir` builds the unpacked app only.

Original plan, for reference:

- **Backups:** SQLite online backup to `<backup folder>/keryx-YYYY-MM-DD.db`
  on launch and on close, keeping the last 14; the folder is configurable
  (USB stick, network share, OneDrive folder). "Exportar tudo" produces a
  zip of database + media; "Importar" restores it.
- **Updates:** `electron-updater` against GitHub Releases. The app checks on
  launch and shows "Nova versão disponível", never installs on its own.
- **Packaging:** `electron-builder`, NSIS installer, unsigned (single-church
  use; the first run shows the SmartScreen "Run anyway" prompt). Code signing
  is a config change if KERYX is ever offered to other churches.
- **Logs:** `electron-log` to `%APPDATA%/KERYX/logs/`, with "Enviar
  diagnóstico" zipping the last log.

## 8a. Prévia no navegador (dev)

`npm run dev` (and the side-panel preview, `.claude/launch.json` "keryx-ui")
runs the whole console in a plain browser on sample data, for a quick look
at the UI. It is the real store and live engine, not a mock:
`scripts/preview/server.cjs` opens `electron/db/store.cjs` and
`electron/live.cjs` on a throwaway folder (`%TEMP%\keryx-preview`, wiped on
every start, or `keryx-preview-<pid>` when another preview holds it),
seeds `scripts/preview/fixtures.cjs` (invented songs, a culto with
sections, avisos, media on the bundled backgrounds, a turma with a quiz, and
João 3:14-18 as "Texto de exemplo do versículo N" — never real Bible text)
and answers an HTTP API with the shape of the desktop IPC (`/__keryx/db`,
`/__keryx/live`, `/__keryx/events` over SSE, media at `/media/`), mounted
by a Vite plugin in `vite.config.js`. Loopback only (by address and Host
name), writes need the `X-Keryx` header; tested in
`scripts/preview/server.test.cjs`. In the browser,
`src/api/backends/preview.js` is installed as `window.keryxDesktop` (same
shape as `preload.cjs`), so every desktop path runs unchanged; monitors,
Bible downloads, web lyrics, the network server, backups and the audio
meters answer "Disponível no aplicativo do computador" or a harmless
default, and outputs open as browser tabs only from Saídas (a send never
takes the tab). A strip says "PRÉVIA DE DESENVOLVIMENTO". None of it is in
a production build (`import.meta.env.DEV`; a plain browser there still gets
`DesktopOnly`), in the packaged app (scripts/ is not in electron-builder's
files) or in `npm run desktop:dev` (`KERYX_NO_PREVIEW`). The smoke and
`desktop:dev` remain the truth for outputs, audio and displays.

## 8b. Nuvem (futuro)

Recorded so the decision is not lost (2026-10-08; nothing built):

- The web build was retired on purpose: projection apps are desktop apps;
  the hybrid parts exist around them (phone control on the local network,
  optional accounts for sync), not instead of them.
- The local SQLite stays the source of truth (local-first): the church
  projects with no internet.
- Optional cloud features live inside the desktop app, not in a web UI:
  - "Conectar conta" in Configurações, signing in through the system
    browser (OAuth with a loopback or deep-link return);
  - a scheduled copy of the existing backup file to Google Drive (or
    Supabase Storage);
  - later, sync of rows and media to Supabase for a second computer or the
    team's phones, conflict rule "last edit wins" per row by
    `updated_date`.
- `supabase/` (migrations, Edge Functions) is kept, unused, as the starting
  point for that.

### Sincronização entre computadores (owner 2026-10-16; being built)

The owner chose **two-way sync through a shared folder** (as Holyrics'
Drive sync): every verified computer edits, and each one writes to and reads
from one folder that Google Drive para computador (or OneDrive, Dropbox)
keeps in sync. No sign-in inside KERYX, no server, nothing to pay, and it
syncs whenever Drive does. Conflict rule: last edit wins per row
(`updated_date`, the computer's id breaking ties). Planned PRs:

1. **Groundwork (done):** what travels is `electron/db/syncScope.cjs` —
   `SYNC_ENTITIES` (the church's content) and `LOCAL_ENTITIES` (Bibles
   installed per computer, OutputPref, the live and retired tables); every
   entity is in exactly one (`npm test`). The profile travels without this
   computer's fields (`LOCAL_USER_FIELDS`: who operates it, `prefs_version`,
   the console density; `syncRow`). Deleting a synced row leaves a
   tombstone (`_tombstone`: entity, id, deleted_at; `store.tombstones(since)`,
   `pruneTombstones(before)`), cleared when the row exists again.
2. **Outbox and inbox, store side (done):** each database has a stable
   computer id (`_meta.pc_id`, `store.pcId`). Every create, update and
   delete of a synced entity made through the store's operations is
   recorded in `_outbox` (seq, entity, id, op `upsert|delete`, row, at,
   pc) in the same transaction as the write — `syncRow` shapes the row; a
   delete is at its tombstone's date; `importRows` records nothing.
   `store.outbox(after, limit)` reads it, `pruneOutbox(seq)` forgets what
   the transport wrote. `store.applyRemote(changes)` takes the other
   computers' entries: last edit wins per row against the version here
   (`_version`: at + pc of the edit the row holds, else the row's
   `updated_date` or its tombstone's `deleted_at`), the greater computer
   id winning a tie; upserts go through the `importRows` path (ids and
   timestamps kept), deletes leave a tombstone even when the row was never
   here. **The profile syncs field by field** (one row of independent
   preferences): its outbox entries carry only the church fields the write
   set, each field has its own version (`local.<field>`), a write of only
   this computer's fields (`LOCAL_USER_FIELDS`) records nothing, and
   remote copies never touch them. What is taken emits the usual change
   event (windows refresh); nothing applied from elsewhere is recorded in
   the outbox (no echo). Returns `{ applied, skipped, failed }`; a change
   that fails is rolled back alone (a savepoint). Known edge for later
   PRs: an entity this version does not know is skipped, not kept for a
   newer version.
3. **The folder, main-process side (done):** `electron/sync.cjs`
   (`createSyncEngine`, pure Node, tested with three temp stores and one
   folder). The folder chosen holds:

   ```
   <folder>/sync/<pc>/changes-000001.jsonl   this computer's outbox entries,
                                             one JSON line each, appended only;
                                             a new file past 256 KB
   <folder>/sync/<pc>/state.json             what it has read and the media it
                                             uses (for the cleanup, below)
   <folder>/sync/media/<file>                the media its rows name, by uuid name
   ```

   A pass writes the outbox to this computer's folder (lines appended
   whole and fsync'd, then `pruneOutbox` only what is on disk; two
   entries for the same row at the same millisecond become one line — the
   later one, the profile's merged), copying each `keryx-media://<file>`
   the rows name into `sync/media/` (temp name + rename, never over an
   existing file; `bundled/…` never travels; the line says each file's
   size). Then it reads every other computer's folder from its cursor —
   a byte offset per file, in `_meta` `sync.state` with the folder, the
   writer's file number and the media still missing (never synced) — and
   hands the entries to `applyRemote` in batches of 500. What Drive and
   friends do is harmless: a last line without its newline is left for the
   next pass (the cursor never passes it); conflict copies
   (`changes-000003 (1).jsonl`, OneDrive's `-PC`, Dropbox's "conflicted
   copy") and late or out-of-order files are just more files (entries are
   idempotent); a file shorter than its cursor is read again; a complete
   line that is not JSON is skipped once a later line or a pass without
   growth shows it was not still arriving; an entry naming another computer
   than its folder is ignored; a computer's folder deleted stops nothing,
   and this computer's own deleted folder starts at the next file number
   (never reused, so no other cursor points into a new file). Media comes
   in before its row is applied when it is there whole (the size the line
   says); else the row goes in anyway and the file is retried every pass,
   across restarts. The database keeps `keryx-media://` urls. No folder =
   off; a folder that is not there (Drive not running, a drive not
   mounted) = status `offline`, nothing created, the outbox kept. The main
   process runs a pass every 30 s and 3 s after a local change to a
   synced entity (not after what a pass applied), when a folder is set in
   the electron settings (`"sync": { "folder": "…" }`, off by default;
   `engine.status()` is what the UI will show: state, last pass, sent,
   received, missing media, media collected, the computers seen and when each last wrote).
   **The sync id is the computer's**: `applyPendingImport` (Importar,
   Restaurar um backup) gives the staged database the id of the one it
   replaces, else none (a new one), so a clone never writes another
   computer's folder. Restoring a backup on a computer that syncs does not
   push the restored rows to the others (they keep their newer copies):
   for PR 5/6.
   **A file that has not come down yet** (the row arrived first): the
   engine's `missing()` (the names in `sync.state.missing`; none with sync
   off) reaches the windows through `keryx:sync:missing` (asked once by
   preload's `sync.missing()`, pushed by main when the list changes) and
   `keryx.pendingMedia` in the renderer (`src/lib/pendingMedia.js`, tested;
   `usePendingMedia()`; empty on network screens). The Biblioteca and the
   Mídia say "Baixando…" instead of "Arquivo não encontrado" (no Localizar…,
   no broken still; `useMediaFiles` marks `syncing`/`posterSyncing`), the
   background library keeps the tile with "Baixando…" and does not let it
   be chosen, a theme whose background is coming shows "Baixando…" in Temas
   and the library (`ThemeThumb`, `themePending`) and is not applied, the
   Prévia says it over the screen, and the console refuses to send any
   stage — or the theme that would dress it — naming a pending file
   (`send` in useConsole.js, `PENDING_SAY`; a video's still does not
   count). A file no row here names any more (its row deleted meanwhile)
   leaves the list.
   **The cleanup of `sync/media`** (it would only grow: a video deleted on
   every computer held the Drive's space for ever). After each pass a
   computer writes `<pc>/state.json` (temp + rename, only when it
   changed): `read` (its cursors, by file), `refs` (every `keryx-media`
   name its synced rows use) and `collected`. At most every 10 minutes
   (`collect`) it looks at `sync/media`: a file that no row here and no
   other computer's `refs` names becomes a candidate, with a mark of every
   change file's size at that moment (`sync.state.gc`); it is deleted only
   when it has stayed unused for 7 days and every computer seen (each
   folder in `sync/`, this one included) has read past the mark in every
   file but its own — so each had taken the deletes that freed it. A
   computer with a folder and no `state.json` (an older KERYX, one never
   run) holds every file; a computer that left the church holds them until
   its folder is deleted (PR 5's Configurações can offer that). Only the
   shared copy goes: no computer's media folder is ever touched. Safety
   nets for a row that names a file again: a new outbox line copies its
   files into `sync/media` again when they are not there (`shipMedia`), and
   a computer that still uses a name another announced in `collected` (a
   row edited while it was away) puts it back from its media folder. A file
   merely absent from the shared folder is never copied back blindly (Drive
   may still be bringing it). Deleting there sends the file to the Drive's
   trash (30 days), outside KERYX.
   What only a real run with Drive can confirm: Drive's own temp and
   conflict names, files read while Drive downloads them, a video of
   hundreds of MB copied while the console projects, the cleanup's
   deletes reaching the other computers.
4. **Pairing, "PCs verificados" (done):** whoever has the church's sync
   code syncs; nobody else counts.
   - **The code** (`shared/syncCode.mjs`, tested; shared by main and the
     console, which checks it as it is typed): 8 symbols in two groups,
     `K7QM-2HXP` (the owner chose short over long, 2026-10-16), Crockford's
     base32 (no I, L, O or U), 7 random (35 bits) and a check symbol
     (weighted sum mod 31), so a typo says "alguma letra está errada"
     instead of looking like another church's code. Typing forgives lower
     case, spaces or dots for the dash, O for zero, I or L for one.
   - **The folder's code file**, `sync/keryx-sync.json` `{ v, id, check,
     made, by, removed, mac }` (`electron/syncPairing.cjs`, tested in
     `sync.test.cjs`): `id` is random, made with the code; `check` (an HMAC
     of the id with the key) proves a typed code is this folder's before a
     line is read; `removed` lists the computers taken out ("Tirar", below)
     and counts only under a valid `mac` (an HMAC of the file's fields with
     the key). The code and the key are never in the folder. `createPairing` writes it only
     where there is none (`wx`; two computers making a code at once leave a
     conflict copy, and only the file named `keryx-sync.json` counts);
     `joinPairing` answers the typed code with the key, or `short`/`check`/…
     (a typo), `nocode` (the folder has none yet), `busy` (its file is still
     arriving) or `wrong` (a valid code, another folder's).
   - **The key** is `scrypt(code, "keryx-sync:" + id)` (N 2^16, r 8: about
     half a second and 64 MB a try, paid once when the code is made or
     typed; the code is short, so each guess from a line someone copied out
     of the folder has to be slow: 2^35 tries is centuries of one core). Each computer keeps it (PR 5: the code itself,
     encrypted with the system's own protection, Electron `safeStorage`, so
     "Mostrar o código" works when a third computer joins months later).
   - **What is signed: each line.** A line is the entry's JSON with `"sig"`
     last: an HMAC-SHA256 (16 bytes, base64url) of the line's own bytes
     before it, with a key derived from the code's key. A line is checked
     alone, so everything §3 made harmless (files still arriving, conflict
     copies, a file read again) stays harmless. A line that does not verify
     (a computer that never had the code, the old code, an edited line) is
     counted for its computer and never applied; the reader moves past it.
     `engine.status().computers[]` adds `verified` (the last line read from
     it verified; null = nothing read yet) and `rejected`, kept per computer
     in `sync.state` (`peers`), and `status.rejected` counts a pass's.
   - **States**: `unpaired` (a folder, no code here: nothing read or
     written), `mismatch` (the folder's code file is another code's: the
     code changed; nothing read or written, the outbox waits), `removed`
     (this computer is on the code file's `removed` list: the same, with
     who took it out), `offline` also while the code file is arriving
     half-written. A missing code file
     is written back by any computer with the code. A new code (joining
     again, or the code changed) resets the cursors: every file is read again
     under the new key.
   - **Taking a computer out** (owner's pick: both): **"Tirar"** in the list
     of computers adds it to the code file's `removed` list
     (`updateRemoved`): it stops (`removed`, its changes wait) and the
     others skip its folder, until the code is typed on it again (joining
     takes it off the list). It pauses an honest computer; with one shared
     key a computer that wanted to could sign as another, so **"Trocar o
     código"** is the real cut: a new id and code over the old file;
     computers that should stay type the new code, the one left out keeps
     the old key, sees `mismatch`, and its lines no longer verify anywhere.
     A computer retired on purpose just leaves the sync (Sair da
     sincronização); a dead one stays quiet in the list — "Tirar" it, so it
     no longer holds the cleanup of `sync/media` back.
   - **The cleanup counts only computers with the code**: each
     `state.json` is signed like a line; a computer whose files never
     verified (no code, an old one) or that was taken out does not hold a
     file back, and one with the code but no `state.json` yet still does.
5. Configurações › Sincronização; the first join merges (never replaces) and
   flags likely duplicate songs.

## 9. Project layout after the change

```
electron/
  main/        app lifecycle, windows, display manager, settings, updater
  db/          schema, migrations, query compiler for the adapter's filters
  server/      HTTP + WebSocket (loopback full app, LAN screens), /media
  media/       library import, thumbnails
  preload.cjs  exposes window.keryxDesktop (db, projection, settings, media)
src/           the React app, as today; src/api/client.js gets a
               transport layer (ipc | network) under the same surface
resources/     bundled Bibles, default backgrounds
supabase/      kept for the future cloud sync; not used by the desktop app
```

Build: the renderer keeps the plain Vite setup; the main and preload files are
unbundled CommonJS (`.cjs`), which needs no extra build tool until they grow
dependencies that must be bundled. `BrowserRouter` keeps working
because windows load from `http://127.0.0.1:7700/…`, not `file://`.

## 10. Phases

Each phase ends with the app runnable end to end. Effort is focused
development time, not calendar time.

| # | Phase | Result | Effort |
| --- | --- | --- | --- |
| 0 | Scaffold | **Done.** Electron shell opens the current UI from a loopback server; 13 dead dependencies removed (Stripe, Leaflet, three, Quill, lodash, moment, …) | 1–2 days |
| 1 | Local data | **Done.** SQLite store with Base44 query semantics (20 tests), adapter over IPC, change events, local operator profile, uploads to `media/`, import script from Base44. No Supabase requests in the desktop build. | 4–5 days |
| 2 | Outputs | **Done** (opening at launch came with phase 6, section 3). Display placement of the windows pages open, hot-plug re-placement, "Telas e saídas" settings, identify, test/close | 2–3 days |
| 3 | Media + Bible | **Done** (thumbnails skipped, Bibles installed rather than bundled; sections 4–5). Media library on disk, offline verse lookup and search, bundled backgrounds and logo | 2–3 days |
| 4 | Ship it | **Built.** Backups, export/import, updater (off until a release repo exists), unsigned NSIS installer, logs and diagnostics. Not yet done: install on the booth PC and run a service with it | 2 days |
| 5 | Network screens | **Built.** LAN server (off until enabled), screen routes only, read-only API, PIN, QR code in Settings, auto-reconnect, StageView fed from the database | 2–3 days |
| 6 | Redesign | Live-state projection engine (section 2; engine and outputs built), one control module, then the UI/UX work | separate plan |

Phases 1 and 2 are the risk; after them, nothing depends on the internet.

## 11. Decisions

Settled on 2026-10-06:

1. **Windows only** for v1.
2. **Language and Bible:** Brazilian Portuguese throughout (UI copy was
   standardized to pt-BR the same day); Bible versions NVI/ACF/AA, installed
   by the church rather than bundled because all three are copyrighted
   (section 5).
3. **Outputs:** HDMI displays, tablets and Wi-Fi screens are all in v1, so the
   network-screens phase (section 7, phase 5) is **in** v1, not deferrable.
4. **AI features: out of v1.** Most AI calls fetch Bible text, which the
   bundled Bible replaces. What remains (topical Bible search, finding lyrics
   online) comes back later as one optional online-lyrics button using the
   church's own Anthropic key. Note `SongSearch` and `UrlLyricsImporter` are
   not reachable from any page today.
5. **Supabase project:** kept as is. It is the source for the phase 1 data
   import and the base for future sync (idle free-tier projects pause
   themselves; check the plan if it is a paid one).

## Risks

- **The adapter's filter semantics** must match exactly what pages expect;
  a mismatch shows up as "empty list" bugs. Mitigation: a test suite for the
  query compiler, the first tests in the project.
- **Electron and `postMessage` across windows** behave slightly differently
  from a browser (origin checks, timing of `PROJECTION_READY`). The
  `projectionWindow.js` fallbacks already tolerate this; phase 2 verifies
  with two displays.
- **Church PC capability:** older PCs and 4K projectors. Output windows
  render in Chromium; keep animations GPU-friendly and test on the actual
  booth machine in phase 4, not after.
- **Data loss on one PC** is the price of offline-first; backups in phase 4
  are not optional.
