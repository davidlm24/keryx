# Keryx audit, pass 4: Performance

Tree: worktree `letra-som-video-ad0915` at `a662879d` (master, 2026-11-26). Static analysis plus measurements of the built `dist/` only (sizes, gzip sizes and chunk graph, with `audit/tmp/chunks.cjs`, `audit/tmp/dyn.cjs` and `audit/tmp/css.cjs`). Nothing in the app was run: no Electron, no dev server, no npm script. No performance skill was available beyond the audit-4 checklist; I followed `.claude/commands/audit-4-performance.md`. Target: 8 GB RAM, dual-core, integrated GPU, slow disk, Windows 10, 2–3 monitors, 2–3 hour service.

## 1. Summary

- **Verdict:** the output side is in good shape. Outputs run in their own processes, load 395–398 kB of JS (budget 405 kB), animate only opacity and transform, and the documented rules mostly hold. The weak side is the **operator console**. It re-renders as one big tree on every live-state change, with no memoisation and no list virtualisation. Some of that work grows with the size of the library.
- **Risk 1 (PERF-001/002):** the Biblioteca rebuilds every song's slides on every console render and on every search keystroke, which happens on every slide change and every 80 ms volume step. With a large library this is the stutter the operator will feel.
- **Risk 2 (PERF-003):** each song sent on air writes `play_count`. That write makes every window refetch the whole Song table, through synchronous SQLite and JSON in the main process, right when the next slide arrow is pressed.
- **Risk 3 (PERF-004/007):** each live change ships the whole document, including up to 8 history items, to every window and phone. Backups copy every installed Bible (about 10 MB per edition) synchronously, at open and at close.
- **Not measured:** every number below is an estimate from the code unless it is marked "measured". A measurement plan with two proposed scripts (not run) is in §6.

## 2. Findings

### PERF-001 — The Biblioteca rebuilds every song's slides and every row on each console render
- Severity: P1
- Effort: M
- Confidence: High (mechanism) / Medium (size)
- Location: src/components/console/Library.jsx:311-343 (`dragOf(s.id, stageFromSong(s, {}, data.themes), …)` at :334); src/components/console/useConsole.js:223 and :497; src/components/console/PlayerBar.jsx:70-72; src/components/console/dragGhost.js:131
- Evidence:
  - `useConsole()` reads the whole live state (`const live = useLiveState()`, :223). It returns a new `c` object, with callbacks that depend on `live`, on every change. `Library` gets `c` and is not memoised. The repo has only two `memo(` calls in `src/components/console`, both in dialogs.
  - On every render, every song row eagerly calls `stageFromSong` for its `dragProps` (:334). `stageDragProps` takes a finished stage, not a thunk (dragGhost.js:131).
  - `stageFromSong` → `songContent` → `songSlidesFor` (src/lib/songImport.js:444-459) does the following, per song:
    - runs regexes over the lyrics (`hasMarks`, `/^\s*\[…\]$/m`),
    - may split them again (`slidesFromLyrics`, `withChordedTwins` :428-434),
    - strips the chords of every slide,
    - runs `withFollowStarts`.
  - Every row also renders about 10 DOM nodes and 2–3 icon buttons. There is no virtualisation and no `content-visibility` on `.kx-row` (it is used only in the import and font dialogs).
  - What triggers a console render:
    - every live op: a slide change, the letra automática's `content.goTo`, a timer adjust;
    - every volume step while dragging (`onVolume` at most every 80 ms, PlayerBar.jsx:70, about 12 renders/s);
    - every toast.
- Live-service impact:
  - With the Letras tab on screen, each slide change re-runs N slide builds and reconciles N rows on the console's main thread. Rough cost on the dual-core target: 1,000 songs ≈ tens of ms; 5,000 songs ≈ several hundred ms (bench proposed in §6).
  - The operator sees the arrow and the highlight lag, and dragging the volume stutters.
  - The projector itself is a separate process and keeps going. A detached Biblioteca (PERF-006) adds a second copy of this work on the same thread.
- Fix:
  1. Build the drag stage lazily: `stageDragProps(() => stageFromSong(…), time, many)`, built in `onDragStart`. Do the same in Library.jsx:398 and every other caller.
  2. Extract `SongRow`/`MediaRow` as `React.memo` components with primitive props: the song object, `state` string, `marked`, flags, and stable handlers through `useCallback` with refs.
  3. Pass Library `airId`, `prevId` and `say` instead of the whole `c`.
  4. As a cheap first step, add `content-visibility: auto; contain-intrinsic-size: auto 44px` to `.console .kx-acts-list > .kx-row` (the Row rule in bundle.css; the inset-card rule stays as it is).

### PERF-002 — Biblioteca search strips and lowercases every song's lyrics on every keystroke
- Severity: P1
- Effort: S
- Confidence: High (mechanism) / Medium (size)
- Location: src/components/console/Library.jsx:108 (`match`), :151, :192
- Evidence:
  - `songsShown = data.songs.filter((s) => … match(ql, s.title, s.artist, stripChords(s.lyrics || "")))` runs on every keystroke. `setQ` is set straight from the field, with no debounce and no `useDeferredValue`.
  - `match` calls `String(f).toLowerCase()` on the whole stripped lyrics of every song.
  - Then the full list re-renders, and every row repeats the PERF-001 stage build.
- Live-service impact: typing a song's name during the service (the common "find the next song" moment) lags one frame or more per letter on a big library. On the dual-core PC, letters appear late and the list jumps.
- Fix:
  - Build `useMemo(() => data.songs.map((s) => [s, fold(`${s.title}\n${s.artist}\n${stripChords(s.lyrics||"")}`)]), [data.songs])` once per library change, using `fold` from bibleSearch.js, which the palette already uses. Filter on that.
  - Wrap `ql` in `useDeferredValue`.
  - The bench in §6 compares both versions.

### PERF-003 — A song sent on air makes every window refetch the whole Song table through synchronous main-process SQLite
- Severity: P1
- Effort: M
- Confidence: High (mechanism) / Medium (size)
- Location:
  - src/pages/Console.jsx:633 (`Song.update(songId, { play_count, last_played_at })` on every song sent)
  - src/components/console/useConsoleData.js:26-36 (any change → `invalidateQueries(["console", key])` → `Song.list("title")`)
  - electron/db/store.cjs:402-406 (`SELECT *` + `decodeRow`: JSON.parse of `slides`, `line_starts`, `part_themes` and `background` per row)
  - src/api/backends/desktop.js:37 (`fromStore` = `mapStrings` deep copy of the whole list)
- Evidence:
  - The change event already carries the whole row (store.cjs:424, data-ipc.cjs:372-378). Yet every subscriber throws its cache away and re-reads the whole table.
  - The same happens in every window that mounts `useLibrary`: the console, each `/Janela` page, and a detached Biblioteca or Setlist panel.
  - The read is synchronous on main, the thread that relays every slide (ARCH-004 is the general case). This is a specific, frequent trigger: one per song sent.
  - Other triggers:
    - a favourite toggled;
    - "Editar este slide…" and Marcar os tempos;
    - sync applying another computer's song edits during the service;
    - for Media, the same path runs on every poster, codec or PDF-pages write (PERF-009).
- Live-service impact:
  - Song rows carry lyrics, slides with chorded twins and line marks, a few kB each. 2,000 songs is roughly 5–10 MB to read, parse, clone to each window and deep-copy again.
  - That can block main for 100+ ms on the target PC about 100 ms after the operator sends a song, which is exactly when they press → for the first verse. The arrow's relay to the projector waits behind it.
- Fix:
  - In `useList`, apply the event to the cache instead of invalidating: `client.setQueryData(["console", key], (rows) => upsert/remove by change.id with fromStore(change.data))`. Keep the 100 ms coalescing for bursts above about 50 events, then invalidate once.
  - Separately, move the counters off the Song row: `SongHistory.create` at Console.jsx:632 already records the play, so `play_count` can be computed in Relatórios.

### PERF-004 — Every live change ships the whole document, history included, to every window and phone, and throws away object identity
- Severity: P2
- Effort: M
- Confidence: High (mechanism) / Medium (size)
- Location:
  - electron/live.cjs:55 (`JSON.stringify(next)` size check per op) and :61-68
  - electron/data-ipc.cjs:328-334 (broadcast of the full snapshot to every window)
  - electron/lan.cjs:770 (`JSON.stringify(snapshot)` per change; it runs whenever the LAN server is on, even with no client)
  - shared/live-state.mjs:126 and :642-650 (`MAX_HISTORY = 8`; each entry holds the whole `data` of the layer it replaced)
  - src/api/backends/desktop.js:37 and :190 (a deep `mapStrings` copy per change)
  - src/hooks/useLiveState.js:10-13 (the selector runs after `useSyncExternalStore`, so it never avoids a re-render)
- Evidence:
  - A content entry is the whole item: every slide, chorded twins, `stage`, `follow`. For a Bible chapter it is every verse, plus `slide.pair` for the 2ª versão.
  - With 8 such entries in `history`, the document is easily 50–150 kB.
  - Per op, main:
    - stringifies it once for the 8 MB check;
    - stringifies it again for SSE;
    - structured-clones it to every window: console, each output, the sound engine, `/Janela` pages, `/Render`.
  - The console gets it twice: as the reply to `live:call` and again as the broadcast, which `adopt` drops by rev after paying for the clone.
  - Each window then deep-copies it (`mapStrings`), so every sub-object is new even when only `audio.playback.volume` changed.
  - Every phone and TV receives the full document per change over Wi-Fi.
- Live-service impact:
  - The cost scales with ops/s × document size × windows. While a volume is dragged or a letra automática runs, that is several full-document clones per second per window.
  - Nothing that memoises on `live.content` identity can hit, which multiplies PERF-001.
  - Phones on weak church Wi-Fi get 50–150 kB per slide.
- Fix:
  - `applyOp` returns shallow spreads, so the untouched top-level keys keep their identity in main. Have `live.call` send `{ rev, updatedAt, serverNow, changed: { key: value, … }, removed: [...] }`, built by comparing `next[k] !== state[k]`.
  - Have `liveClient.adopt` merge the patch into `current`, keeping untouched keys' references, with a full `get()` on a rev gap.
  - Size-check only the changed keys.
  - In lan.cjs, skip the stringify when `clients.size === 0`.
  - Keep SSE full for the network screens if simpler, but drop `history` from what phones and TVs get. They never draw it; the controle remoto's Voltar uses `state`.

### PERF-005 — Each renderer measures the text fit 2–3 times per slide change, with up to about 13 forced layouts each
- Severity: P2
- Effort: S
- Confidence: Medium
- Location: src/components/screen/ScreenRenderer.jsx:345-407 (`useLayoutEffect(measure, …)` :391; the effect at :392-407 re-created on every slide via `...deps`, which `observe()`s a new ResizeObserver and calls `document.fonts.ready.then(measure)`); src/hooks/useBoxFit.js:30-41 (synchronous `measure()` plus `fonts.ready.then(later)`, every key change)
- Evidence:
  - Per slide change, `measure` runs three times:
    1. in the layout effect;
    2. from the new ResizeObserver's initial notification (fired on `observe()`), and when the text box changed size;
    3. from `fonts.ready`, already resolved, so it runs in a microtask.
  - Each run forces layout through `getComputedStyle`, `offsetWidth` and `getBoundingClientRect`. When the slide does not fit at 1, `fitSearch` adds 8 more `set(f)` + `getBoundingClientRect` rounds over every item (screenFit.js:36-44).
  - `useBoxFit` (the Palco's lyrics and design elements) measures synchronously and again on the next frame, every key change, for each fitted element.
  - In the console this happens for:
    - the Programa monitor;
    - the Prévia;
    - each Multiview tile (up to 6);
    - the Bíblia's monitor;
    - the cards of Telas e saídas while open.
- Live-service impact:
  - Long Bible slides and Palco lyrics cost tens of ms of main-thread layout per slide on the dual-core PC, at the start of the transition. The compositor-driven fade itself stays smooth.
  - In the console it adds to PERF-001.
- Fix:
  - Split the effect: register the RO and the fonts listener once with deps `[on, measure]`, not `...deps`.
  - Ignore the RO's first callback by keeping the last observed size.
  - Call `fonts.ready.then` only when `document.fonts.status !== "loaded"`.
  - Start the search from the previous slide's `h`: test `fits(prevH)` and `fits(prevH * 1.1)` before bisecting.
  - Apply the same three changes in `useBoxFit` and `useContentFit`.

### PERF-006 — Detached panels and pages share the console's renderer process
- Severity: P2
- Effort: M
- Confidence: Medium
- Location: src/pages/Console.jsx:341 and :1496; src/lib/editorWindow.js:33; src/lib/console/detach.js:64 (`PANEL_WINDOW_FEATURES = "width=420,height=820"`, no `noopener`); electron/main.cjs:247-270 (`action: "allow"`)
- Evidence:
  - `/Janela` windows are opened with `window.open` from the console, keep an opener, are same-origin, and are allowed by `setWindowOpenHandler`. Chromium puts such popups in the opener's process.
  - Outputs are different: main creates them as fresh `BrowserWindow`s (main.cjs:363-375), so they are isolated.
  - `CLAUDE.md` says the console reopens detached panels at launch, so a church that detaches the Biblioteca or Setlist runs both trees on one main thread. Each has its own live subscription and its own Song/Media cache (PERF-003).
- Live-service impact:
  - A heavy console render (PERF-001) freezes the detached Setlist or Biblioteca the operator is clicking on the second monitor, and the other way round.
  - Memory for the duplicated library copies adds to one process.
- Fix:
  - Open them with `"noopener"`, as MediaView.jsx:81 already does. The console uses the returned handle only for `focus()`, and main's `panelWindows` already brings an open panel forward.
  - Or create them in main, as `openOutputWindow` does, through `keryxDesktop.janela`.
  - First confirm with the PID check in §6.

### PERF-007 — Every backup copies every installed Bible, synchronously, at open and at close
- Severity: P2
- Effort: M
- Confidence: Medium (size estimate)
- Location: electron/db/store.cjs:826 (`VACUUM INTO`); electron/backup.cjs:44-58; electron/main.cjs:672-675 (before the console window) and :1072-1075 (on quit); electron/db/store.cjs:43-46 (`bible_verse` index); shared/bibleSetup.mjs (`DEFAULT_BIBLES` NVI, ARA, ARC, NTLH)
- Evidence:
  - Bible verses are rows of `keryx.db` (a `BibleVerse` row has 11 columns, including a uuid id, two ISO dates and the verse text, plus the 4-column index). That is about 300 B × 31k ≈ 10 MB per edition.
  - The first-run dialog ticks four editions, so a typical database is ≥ 40 MB of Bible text the church can download again.
  - `VACUUM INTO` copies all of it at every open and every close, on main, `keep` times over in the backup folder. That folder may be a pen drive (system.cjs:195-198).
  - ARCH-004 covers the thread. This finding is about the size, which grows with each edition installed.
- Live-service impact:
  - Launch is slower by about 1–5 s on a slow disk or USB 2 (the splash cannot repaint while main is in `VACUUM INTO`).
  - Closing takes as long again, at the moment after the service when people turn the PC off.
  - Backup folders fill up `keep` × 40–80 MB.
- Fix:
  - Keep `BibleVerse`/`BibleEdition` in an attached second database (`bibles.db`, `ATTACH` in createStore), left out of `VACUUM INTO`. The rows are `ON_EACH_COMPUTER` already and never sync.
  - Back up only an own edition's source file reference: its file is the church's.
  - As a smaller step, run the opening backup after the console's `ready-to-show`.

### PERF-008 — Media backfills run during the service with no idle guard, and each result refetches the Media table everywhere
- Severity: P2
- Effort: S
- Confidence: Medium
- Location: src/hooks/usePosterBackfill.js:27-52 (one still or thumbnail every ~0.8 s); src/hooks/useCodecBackfill.js:5-30 (every 0.6 s); src/hooks/usePagesBackfill.js:64-90; src/lib/pdfPagesCapture.js:41-49 (`page.render` at about 1920 px on a main-thread canvas)
- Evidence:
  - None of the three checks what is on air.
  - Each one:
    - decodes media in the console process: it seeks a video at several points, decodes a full photo, or renders a PDF page to a 1920 px canvas;
    - then writes a Media row. Through the path in PERF-003, that refetches the whole Media table (plus `FileInfo`) in every window and re-renders the console.
  - Scenario: a second computer syncs 300 videos and photos in on Saturday. On Sunday the console works through them one by one, during the service.
- Live-service impact: periodic console hitches every second or so for minutes, while the operator works. Extra decoder load competes with the projector's video on the same CPU and GPU.
- Fix:
  - Gate the three effects on "nothing heard and no video on air, or screens locked" (`soundPlan`/`lyricsOnAir`), and run them only through `requestIdleCallback`.
  - With PERF-003's `setQueryData`, a write no longer refetches the table.

### PERF-009 — Every output page re-renders its whole screen every second
- Severity: P3
- Effort: S
- Confidence: High
- Location:
  - src/pages/Projection.jsx:18 and :74
  - src/pages/LyricProjection.jsx:15
  - src/pages/VideoProjection.jsx:28
  - src/pages/CommunicationProjection.jsx:17
  - src/pages/StageView.jsx:22
  - src/pages/PastorView.jsx:18
  - src/components/screen/ScreenRenderer.jsx:50-51
- Evidence:
  - The pages call `useLiveNow(1000)` unconditionally and pass `now` down.
  - ScreenRenderer's own gate (`useLiveNow(1000, props.now === undefined && countsTime(state))`) is therefore bypassed.
  - `OutputScreen` recomputes `prefState` and `applyRule`, and reconciles the screen, about 10,800 times in a 3-hour service per output, even for a still song slide.
  - CLAUDE.md "Watch out for" says renderers "tick only while they draw something that counts".
- Live-service impact: small but constant CPU and GC churn in every output process on a dual-core PC, which competes with video decode. It does not show on screen.
- Fix:
  - In the renderer pages, call `useLiveNow(1000, countsTime(live) || pageShowsTime)`, using `layoutCountsTime(layout)` for designed screens (Palco and Pastor clocks).
  - Or pass no `now` at all and let ScreenRenderer own it.

### PERF-010 — Startup does everything before it creates the console window, including an eager supabase-js require
- Severity: P3
- Effort: S
- Confidence: High (order) / Low (durations)
- Location: electron/main.cjs:5-43 (about 40 modules required at load); :554-1027 (store, server, backup, Bible setup, live, LAN, updater, Google auth, sync, YouTube, GERAR, then `createMainWindow` at :1029); :966 (`require("@supabase/supabase-js")`)
- Evidence:
  - The splash shows early (good), but the console window is created only after every subsystem is up.
  - `require("@supabase/supabase-js")`, about 3.4 MB in `node_modules/@supabase` with six sub-packages, is evaluated at every launch: `gerarConfig().configured` is true because the URL and key are written in. That happens even on a computer never connected to the GERAR, while `supabaseRealtime` creates the client only on `subscribe` (gerarInbox.cjs:265-269).
  - The console then parses about 1.7 MB of JS (PERF-011).
- Live-service impact: a slower cold start on HDD PCs. This matters after a crash restart mid-service: the watchdog relaunch goes through the same chain.
- Fix:
  - Pass `createClient: (...a) => require("@supabase/supabase-js").createClient(...a)`.
  - Create the main window right after `live` is ready, and start network, sync, GERAR, YouTube and the opening backup in `win.once("ready-to-show")`. The splash's step list stays as it is.
  - Log each step's duration to the daily log, so the soak and field reports show it.

### PERF-011 — `selectPick-*.js` is the whole console in one 1.1 MB chunk, every THE-window page included (measured)
- Severity: P3
- Effort: S
- Confidence: High
- Location: dist/assets/selectPick-BVjYu1Ov.js; src/components/console/WinPages.jsx:2-13
- Evidence:
  - Measured:
    - `selectPick` is 1,097,551 B (364,919 B gzip). Rollup names a shared chunk after its first module, so the name means nothing.
    - It is the code `Console` and `Janela` both import. Its only lazy imports are pdf.js and jspdf (`audit/tmp/dyn.cjs`).
    - `/Console` loads 1,703,725 B (574,967 B gzip) in total.
  - WinPages imports statically:
    - SongEditor, SyncView and ServicePlanner;
    - MediaView, NoticeEditor, SchoolView, MaterialView and ReportsView;
    - SettingsView and its sections;
    - ThemeEditor and ScreenEditor.
  - None of these pages is needed to project.
  - pdf.js (483 kB + 1.27 MB worker), jspdf (391 kB), html2canvas (202 kB) and the generator shaders are already lazy.
- Live-service impact: a longer console parse and compile at every launch and crash restart on the dual-core PC, roughly a few hundred ms. Nothing affects the outputs.
- Fix: `React.lazy` each `winPage` case in WinPages.jsx, inside the window's existing Suspense frame, and add a size report line for `/Console` in bundle-budget.cjs, as it already computes `CONSOLE_PAGE`.

### PERF-012 — One 395 kB stylesheet in every output window and network screen (measured)
- Severity: P3
- Effort: S
- Confidence: High
- Location: dist/assets/index-CVon-KwC.css; tailwind.config.js:4 (`content: ["./src/**/*"]`); src/components/ui/ (no file outside it imports it)
- Evidence:
  - Measured with `audit/tmp/css.cjs`:
    - 395,297 B in total (64,603 B gzip);
    - about 187 kB of `.console` rules, 37 kB of the phone's `.rm` and about 70 kB of single-class utilities;
    - the screen itself (`.ks`/`.kl`) needs about 20 kB.
  - Tailwind scans the unused shadcn `ui/` folder, which leaves `data-*`, `group`, recharts and cmdk utilities in the CSS.
  - lan.cjs serves `/assets` uncompressed (bundle-budget.cjs:5-7), so a TV or phone downloads 395 kB of CSS plus about 400 kB of JS on its first load over Wi-Fi.
- Live-service impact: a slower first paint of a TV or phone joining mid-service on weak Wi-Fi, and parse and memory cost in every output. The CSS is cached afterwards (`immutable`).
- Fix:
  - Add `"!./src/components/ui/**"` to the Tailwind content globs.
  - Serve `.gz` siblings, or gzip on the fly, for `/assets` in lan.cjs when `Accept-Encoding` allows it.
  - The single-stylesheet cascade rule in bundle-budget.cjs stays as it is.

### PERF-013 — The Programa pill's 36 px backdrop blur sits over a moving monitor
- Severity: P3
- Effort: S
- Confidence: Low (needs a GPU trace)
- Location: docs/design-system/components/bundle.css:644-645 (`.kx-pill`, `.kx-mon-badge` → `backdrop-filter: var(--glass-blur)`, which is `blur(36px) saturate(180%) brightness(0.5)`); CenterPanel's ProgramaPill
- Evidence:
  - The pill stays on screen over the Programa monitor, which plays the Fundo's video or a generator at 30 fps (`motion`).
  - A backdrop filter over content that changes every frame is re-rasterised every frame. Integrated GPUs pay for large blur kernels.
  - THE window's scrim blur is fine, because the Programa freezes underneath (tokens.json `blur-backdrop`).
- Live-service impact: GPU time taken from the projector's video on the same integrated GPU. Possible dropped frames on weak hardware.
- Fix:
  - Under `.prog-screen` while the monitor moves, use the solid `bg-2` fallback (the same block already handles `prefers-reduced-transparency`).
  - Or a cheap 8 px blur there.
  - First measure with the GPU trace in §6.

### PERF-014 — A blurred video Fundo is a full-screen filter every frame, on every output and on the Programa monitor
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: src/components/screen/ScreenRenderer.jsx:258 and :266-273 (`bgLook` → `media: { …, filter: blur(…cqw), transform: scale(1.06) }` on `<video className="ks-bg-video">`)
- Evidence:
  - The library's blur setting applies to videos as well as pictures. On a picture the blur is rasterised once; on a video it runs per decoded frame.
  - It runs in each output that shows the Fundo, plus the console's moving Programa monitor.
- Live-service impact: on an integrated GPU, a 1080p blurred loop on 2–3 outputs can drop frames or raise GPU load enough to stutter other video.
- Fix: in the background library, warn that blur on a video costs the GPU, or cap it for videos. In `bgLook`, apply the blur to a downscaled layer: wrap the `<video>` in a box at 50 % size with `transform: scale(2)` and blur half the radius.

### PERF-015 — A full GROUP BY over every Bible verse runs on main about once a minute
- Severity: P3
- Effort: S
- Confidence: High (mechanism) / Low (cost)
- Location: electron/main.cjs:842-852 (`installedBibles`, 60 s TTL) and :873 (`describe` inside sync status); electron/syncControl.cjs:356-361; src/hooks/useSyncStatus.js:14 and :71 (4 s poll while the cloud is mounted, which is always); electron/db/store.cjs:539-543 (`countBy`)
- Evidence:
  - The always-visible cloud polls sync status every 4 s.
  - `status()` calls `describe()`, which recounts `SELECT version, COUNT(*) … GROUP BY version` over about 125k–250k index entries whenever the 60 s cache has expired. It runs synchronously on main, during the service, even on a computer that does not sync.
- Live-service impact: a periodic main-thread blip, likely tens of ms on a cold HDD cache, that can coincide with a slide relay.
- Fix: cache the installed list until a Bible install or removal (`installFromSource`, the own-edition ops, `bibleSetup` onChange) invalidates it, not by TTL. Also call `describe()` only when the payload is actually written (`computers/<pc>.json`), not inside `status()`.

### PERF-016 — The online Bible cache grows in localStorage without a bound
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: src/lib/bibleText.js:71-87 (`bible_b_<version>_<book>_<chapter>`); src/lib/console/layout.js:215 (layout saves share the same origin quota)
- Evidence:
  - Every chapter read online is kept forever, about 4–10 kB each.
  - All windows share one localStorage per origin (`127.0.0.1:7700`), with Chromium's per-origin quota of about 5 M characters. A church that reads online, with no edition installed, fills it in months.
  - Every other `setItem` is wrapped in `try { } catch { /* not remembered */ }`, so the failure is silent:
    - the console arrangement (`saveLayout`);
    - the theme in use (`keryx.themeInUse`);
    - the Prévia;
    - the pedidos "seen" marks.
- Live-service impact: from one day on, the console stops remembering its panels and the theme in use, with no error shown. This is a slow-burn, and reads pay a large `getItem` parse.
- Fix: cap the cache at N chapters, for example 200, kept as an LRU index key. Or move it to IndexedDB, or to main (`bible.cjs`, a small file cache in the data folder).

### PERF-017 — The song editor re-renders and re-fits every slide preview on every keystroke
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: src/components/console/SongEditor.jsx:605 (lyrics `onChange`) and :614-630 (one `ScreenRenderer` per slide, plus `slideFit` per slide)
- Evidence:
  - Each keystroke rebuilds `doc` and maps every slide to a `ScreenRenderer`, each with its `useFit` (PERF-005).
  - With "divisão ao vivo", one edit can shift every slide's text, so every preview re-measures.
- Live-service impact: typing lags in long songs. This is mostly a preparation-time issue, but "Editar este slide…" and quick fixes happen during services too.
- Fix: `useDeferredValue(song.lyrics)` for the previews' `doc`, and memoise each thumbnail on its slide text and style.

## 3. What is already done well (keep it)

- **Outputs are isolated processes.** Main creates them (main.cjs:363-375), so a console stall never freezes the projector. Occlusion and background-media suspend are disabled for covered projectors (main.cjs:49-50).
- **Route-level lazy chunks with an enforced budget.** Measured: outputs load 395.2–397.8 kB, `/Remote` 379.8 kB, StreamView 314.0 kB, against a 405 kB budget (scripts/bundle-budget.cjs). pdf.js, jspdf, html2canvas and the generator shaders load on demand. Outputs carry none of the console's code: their `lucide` icons map is in `followWords-*`, which no output loads.
- **No ticking clock in the console.** `c` has no `now` (useConsole.js:219-222). `useLiveNow` shares one timer per interval and stops when nobody listens (useLiveState.js:18-58).
- **Meters bypass React.** RAF paints the bars directly at 25 fps (PlayerBar.jsx:20-48). Capture retries back off, and there is one AudioContext.
- **Hot controls are throttled.** Volume goes out at most every 80 ms. The seek is one op on release. Splitter drags never ease, and layout saves are debounced 150 ms.
- **Video handling.** The media pool reuses elements (mediaPool.js) and has a 5 s grace before dispose. Still previews use `VideoStill`, and generator stills share ONE offscreen WebGL context (GeneratorBackground.jsx:99-113). Moving generators cap at 960 px, 30 fps, pause when hidden, and dispose their context.
- **The seek-bar frame preview** uses its own element, closes bitmaps on eviction (an LRU of 40) and releases the file on url change (useFramePreview.js:43-70).
- **Transitions are compositor-friendly.** Fades, slides, zooms and ghosts animate only opacity and transform (screen.css:67-72, :175-178).
- **List and IPC hygiene.**
  - `useList` coalesces bursts (100 ms).
  - `useOutputs` keeps the old object when the 5 s poll answers the same.
  - `keryx:media-info` stats files asynchronously.
  - The data-folder size is cached 60 s.
  - Gallery images are `loading="lazy" decoding="async"`, and `content-visibility` is used in the import dialog and the phone.
  - Phones page the library (IntersectionObserver).
- **The live state is saved safely.** `live.json` is debounced 300 ms and written atomically. Preload listeners are module-level sets with no per-subscribe `ipcRenderer.on` leak.
- **There is a soak harness** (electron/soak.cjs + perfMetrics.cjs: CPU and memory per process every 30 s). Build on it rather than adding a second one.

## 4. Open questions (for Davi)

1. **Library size at CCG:** how many songs and media rows? The severities of PERF-001, PERF-002 and PERF-003 scale with it. At under 500 songs, they drop to P2.
2. **Does the hidden sound engine decode video frames?** SoundEngine.jsx:56-64 plays the video channel and the media layer's video in a `<video>`. With `disable-background-media-suspend` (main.cjs:50), Chromium may decode every frame of a page no one sees. If so, one clip on air is decoded by the projector, the Programa monitor, any Letras or Vídeo output and the sound engine: 3–4 decoders on a dual-core with an iGPU. Check Task Manager's GPU "Video Decode" with the engine on and off. If confirmed, play video items' sound from an `<audio>` element with the same `src` in the engine, or `disablePictureInPicture` plus `video.style.display="none"`, which still decodes, so `<audio>` is the real fix.
3. **Do `/Janela` windows share the console's process** (PERF-006)? `webContents.getOSProcessId()` for the console vs a detached panel answers it in one line.
4. **Typical live-state size** with a Bible chapter and 2ª versão on air plus 8 history entries (PERF-004). A one-line log of `JSON.stringify(next).length` in live.cjs during a real service would settle it.
5. **Is the backup folder a pen drive at CCG**, and how many Bible editions are installed (PERF-007)?
6. **Does V8's code cache apply to scripts served from `http://127.0.0.1:7700`** with `immutable`? If it does, PERF-011 costs less on second launches. Compare the console's first-load and second-load script compile in a DevTools Performance trace.

## 5. Handoffs to other passes

- **FUNC:** `keryx:media-info` slices to 2,000 names (data-ipc.cjs:69). With more than 2,000 Media rows, the rest are never checked for missing files. Check whether `FileInfo` chunks the request.
- **TEST:** the soak runs on a fresh, near-empty data folder (soak.cjs), so it cannot see PERF-001, PERF-002, PERF-003 or PERF-007. Add a seeded-library option.
- **ARCH:** PERF-003, PERF-004 and PERF-015 are concrete hot spots of ARCH-004, all main-thread synchronous work during a service.
- **SEC:** SEC-005's "browser packages as runtime deps" also inflates `app.asar` and the update download. That is an installer-size, not a runtime, cost.

## 6. Measurement plan (NOT RUN)

Already measured, from `dist/` only:

| Item | Size |
|---|---|
| `selectPick` chunk | 1,097,551 B (364,919 B gzip) |
| `/Console` total | 1,703,725 B (574,967 B gzip) |
| Output pages | 395–398 kB |
| `/Remote` | 380 kB |
| CSS | 395,297 B (64,603 B gzip) |

Breakdown: `audit/tmp/chunks.cjs` (`node audit/tmp/chunks.cjs <chunk>` prints the chunk's static closure) and `audit/tmp/css.cjs`.

Proposed, run only with the owner's OK, always on a temp `KERYX_DATA_DIR` (never `%APPDATA%\KERYX`):

1. **`audit/tmp/bench-library.mjs` (written, not run).** Pure-module timing over a synthetic 2,000 or 5,000-song library (`node audit/tmp/bench-library.mjs 5000`). It times:
   - `songContent` per row, which is the per-render cost of PERF-001;
   - the per-keystroke filter (PERF-002) against the proposed index.

   Multiply by about 3–4 for the dual-core target. Pass/fail: render < 16 ms and keystroke < 16 ms at the CCG library size.
2. **`audit/tmp/trace-slide.cjs` (written, not run).** It attaches over CDP (`--remote-debugging-port`) to the console and the Projeção, puts a 12-slide song on air, sends 100 `content.goTo`, and reports:
   - relay delay console → projector (p50 / p95 / max);
   - long tasks (> 50 ms) per page;
   - JS heap before and after.

   Run it three times:
   - (a) the default library;
   - (b) a library seeded with 5,000 songs and 2,000 media rows, with the Biblioteca's Letras tab open;
   - (c) (b) plus a detached Biblioteca (PERF-006).

   Seed by importing a generated `.keryx` or a JSON song export through Importar músicas, so no tracked file is touched.

   Thresholds:
   - p95 relay > 150 ms, or a console long task > 150 ms, confirms P1;
   - heap growth over 100 changes after GC > 5 MB means a leak, so take a heap snapshot.
3. **Soak with the seeded data folder.** Use `KERYX_SOAK=180` from docs/requisitos.md, with `KERYX_DATA_DIR` pointing at the folder seeded in (2). Compare:
   - the CSV's `memoria_privada_mb` per process at 5 min, 60 min and 180 min;
   - the console's CPU % in the "video" vs "nothing" scenes.

   It answers the 3-hour memory question, plus Open question 2: compare the sound engine's CPU and GPU in the video scene.
4. **Startup.** Time each splash step: add a temporary log, or read the existing `[keryx-abertura]` and backup log lines' timestamps. Do it cold, after a reboot, on the HDD target, with 0 and with 4 Bible editions installed (PERF-007, PERF-010).
5. **GPU.** Take a Chromium trace (`--enable-gpu-benchmarking`, or `chrome://tracing` categories `gpu,cc,viz`) of the console with a moving generator under the Programa pill, with the glass on and off (PERF-013), and of an output with a blurred vs unblurred video Fundo (PERF-014).

## Rows for `audit/FINDINGS.md` (not appended: this pass was asked not to edit it)

| ID | Pass | Sev | Effort | Title | Location | Status |
|----|------|-----|--------|-------|----------|--------|
| PERF-001 | 4 | P1 | M | Biblioteca rebuilds every song's slides and every row on each console render | src/components/console/Library.jsx:334; useConsole.js:223 | Open |
| PERF-002 | 4 | P1 | S | Biblioteca search strips and lowercases all lyrics per keystroke | src/components/console/Library.jsx:192 | Open |
| PERF-003 | 4 | P1 | M | A song sent on air refetches the whole Song table in every window | src/pages/Console.jsx:633; useConsoleData.js:26 | Open |
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
