# Keryx audit, pass 3 (Parts B and C): live-service flows and edge cases

Repo at master `a662879d` (2026-11-26). Static read plus small `node` runs of pure modules (`quickRef.js`, `slideEdit.js`). Electron was not launched. Skills used: none beyond the audit command file.

## 1. Summary
The live core is solid. Every change is one op on a single state in main, the screen lock is enforced in one place, Esc has an 8 s Desfazer, the state is saved crash-safe, and a crash under 20 minutes old brings the screens back lit. The failures are at the edges where media and edits meet the live state:
1. **Edits on air can put the wrong slide on screen (FUNC-001).** When an edit made during the service changes the number of slides, the output keeps the slide *number* rather than the slide.
2. **Media fails silently and goes black (FUNC-002, FUNC-003).** This happens with YouTube when offline or after a script hiccup (then it stays dead until the window reloads), and with any video file Chromium cannot decode. No error comes back to the operator.
3. **Sound and picture now play in separate windows with no tight sync (FUNC-004, FUNC-005).** Since the sound engine arrived, lip sync can be off by up to 1.5 s and is never corrected. The first window to reach a video's end takes it off for every screen.

## 2. Flows traced

### Flow 1: open → active culto / shared Setlist → first item live
- **Steps and code:**
  - `electron/main.cjs:672` takes a backup, `:706` reads the run marker, `:714` creates the live state.
  - The live state restores as `restoreState` (`shared/live-state.mjs:1223`): screen black, lock off.
  - The console's list is `visibleService` (`src/lib/console/consoleSetlist.js:47`), fed by `User.active_service_id` (`useActiveService.js`).
  - A send goes `sendStage` (`src/pages/Console.jsx:609`), which reopens `/Projection` if it is closed, then `c.send` (`useConsole.js:379`).
  - `c.send` runs `sendBlock` (locked, syncing, missing, blocked), then `session.start`, then the media ops, then `fundoOps`, then `content.show`.
- **Failure points:**
  - The send is several separate ops, not one transaction. If a later op fails (for example, `content.show` rejecting a title over 500 characters with a 413), the playback or video already started stays on air. This is low likelihood, so it is not filed.
  - Otherwise sound.

### Flow 2: song, from select through Esc and Desfazer
- **Select:** `stageFromSong` (`stage.js:18`) → `songContent`.
- **Next and previous:** `moveSlide` (`useConsole.js:194`) → `content.next` / `content.prev` (`live-state.mjs:~860`).
- **Jump:** `content.goTo`.
- **Tela preta:** `toggleScreen` → `screen.set`.
- **Limpar:** `text.clear`. This clears the timer, the aviso and the text in one change. The Fundo stays.
- **Esc:** `end` (`useConsole.js:449`) → `clear` (`live-state.mjs:1183`).
- **Desfazer:** `undoEndOps` (`src/lib/console/restore.js:44`).
- **Failure points:**
  - Esc during Tela preta lights the screens (FUNC-006).
  - Desfazer restarts videos from 0 (FUNC-008).
  - Desfazer stays armed after a new send (FUNC-010).
  - There is no key to jump to the chorus or the bridge. That is a gap, not a failure.

### Flow 3: Bible references, versions and offline
- **Parsing:** `referenceFrom` (`quickRef.js:135`) = `parseReference` (`bibleBooks.js:179`), else `quickReference`.
- **Reading:** `referenceVerses` (`Console.jsx:814`) → `readChapter` (`bibleText.js:42`) → `editionPlan` / `readByPlan` (installed, then online, then fallback) → `stageFromVerses` (`stage.js:37`).
- **Results of the forms in the brief (node run):**

  | Typed | Result |
  |---|---|
  | `Jo 3:16-18` | João 3:16–18 ✓ |
  | `1 Co 13` | chapter ✓ |
  | `Sl 23` | chapter ✓ |
  | `jo 3 16` | ✓ |
  | `Jo 3,16` | ✓ |
  | `John 3:16` | null |
  | `Ps 23` | null |
  | `Jn 3:16` | null (Jonas 3 has 10 verses) |
  | `Jo 3:16-4:2` | **João 3:16 only** |
  | `Jo 3:16,18` | **3:16 only** |
  | `Jd 24` | null |

- **Not installed, or offline:** handled. The message says why, and an installed edition is used as a fallback with a toast.
- **Two versions:** the second edition is joined by verse number. One that cannot be read is left out, by design.
- **Long verses:** shrink to fit (down to 15 %), or split when the theme says "Dividir".
- **Failure point:** FUNC-007.

### Flow 4: media
- **Video with sound:**
  - The picture is the projector's `LiveMediaView` → `LiveVideo`, in a muted window (`outputs-manager.cjs` `track`).
  - The sound is the hidden `/Som` window (`SoundEngine.jsx`, `soundPlan.js:25`).
  - Each one syncs to the live clock on its own (`playbackPlan`, `live-state.mjs:1368`). This is FUNC-004.
- **Looping background:** its own looped element. Fine.
- **Missing file:**
  - Known missing rows are refused at send (`useConsoleData.js:70`, `sendBlock.js:17`).
  - A file that fails at play time has no handler (FUNC-003).
- **Refused codec:** only HEVC and H.264 above 8 bits or not 4:2:0 are refused. Other undecodable files pass (FUNC-003).
- **YouTube that refuses embedding:** handled well. It is hidden until it plays, `onError` → `refused`, and the console offers Baixar.
- **YouTube offline:** FUNC-002.
- **PDF:** pages are made first (`presentation.js`). It is blocked until ready, then walked like slides. Sound.
- **Single video end:** FUNC-005.

### Flow 5: last-minute edit while live
- **Song editor:** `SongEditor` → `onSaved` → `songSaved` (`Console.jsx:585`) → `content.update` (`live-state.mjs:785`).
- **"Editar este slide…":** `SlideEditPop.jsx:54` → `editSlide` (`slideEdit.js:62`) → `Song.update` → `songSaved`.
- **Marks:**
  - Line marks survive the edit (`spliceMarks`).
  - The follow keeps its clock while the same source plays.
  - The Fim rides along.
- **Locked screens:** the console refuses and says so (`Console.jsx:594`, `SlideEditPop.jsx` note).
- **Failure point:** the index on air (FUNC-001).

### Flow 6: display changes
- **Code path:** `reapplyAll` on `display-added` / `-removed` / `-metrics-changed` (`outputs-manager.cjs:~300`) → `resolvePlacement` (`outputs.cjs:118`) / `autoScreens` (`outputs.cjs:74`).
- **Monitor gone:** the output waits hidden (WIN-02). This fixes the old ARCH-002 behaviour.
- **Same place:** no re-present (`inPlace`).
- **Monitor back:** shown, then made full screen.
- **Remembering the monitor:** by id, else by label + size (`findDisplay`, `outputs.cjs:45`).
- **Open question:** see Q1. No finding.

### Flow 7: crash mid-service → relaunch
- **Code path:**
  - The run marker is written every 15 s (`runMarker.cjs:13`).
  - The watchdog relaunches when main's pid dies (`watchdog.cjs:62`).
  - `restoreState(…, { afterCrash })` keeps the screen and the lock and pauses all playback (`live-state.mjs:1223`).
  - `openAtLaunch(crash.outputs)` (`main.cjs:1032`).
  - A notification tells the operator to press play.
- **What is lost:**
  - The Prévia (sessionStorage is per renderer session).
  - The 8 s Desfazer.
  - Any automatic lyrics, which come back paused.
  - The operator is on the same slide as soon as the outputs reopen.
- **Startup cost:** startup still runs `backupNow("ao abrir")` synchronously before the live state (`main.cjs:672–674`). That is already ARCH-004 and ARCH-008, so it is not re-filed.
- **Main that hangs but does not die:** not covered (the watchdog only checks the pid). That is ARCH territory.

### Flow 8: import
- **Formats:** `readSongFile` (`songImport.js:194`) sniffs the content.
  - Holyrics (`songFormats/holyrics.js`) and OpenLyrics keep chords and parts.
  - Plain text and cifra and ChordPro go through `songFromText` (`songImport.js:117`). See FUNC-009.
- **Encoding:** handled (BOM, UTF-8, then the XML declaration, then Windows-1252, `songImport.js:143`).
- **Duplicates:** by `songKey`.
- **Backup import and restore** (`electron/archive.cjs`): the entry allowlist, `quick_check`, the version gate, and the next-launch swap with rollback are all sound.
- **The .keryx package:** not re-traced in depth. It was covered by its own tests and the security pass.

## 3. Findings (P1 → P3)

### FUNC-001: An edit made on air that changes the slide count shows the wrong slide
- Severity: P1
- Effort: S
- Confidence: High
- Location: shared/live-state.mjs:797; src/pages/Console.jsx:598; src/lib/console/slideEdit.js:72
- **Evidence:**
  - `songSaved` sends `content.update` with the new `slides` and no `index`.
  - `content.update` keeps the old position by number: `next.index = clampIndex(a.index ?? current.index, next.slides.length)`.
  - A node run of `editSlide` on a 4-stanza song, splitting slide 1 with a blank line ("Linha A1\n\nLinha A2 corrigida"), gives 5 slides. Every later slide moves one place.
  - The same happens when the song editor adds or removes a stanza, or when a stanza passes the "2/4 linhas" limit.
  - The Prévia's index is kept by number too (`Console.jsx:590`).
- **Live-service impact:** the operator fixes a typo or splits a line in "Editar este slide…" while slide 3 is on air. The congregation now sees slide 2's lyrics, and → walks from there. This happens exactly during the hurried fix the feature exists for.
- **Fix:** in `songSaved`, compute the new index before `content.update`. Match the on-air slide by text in the new slides (nearest index first). For an edit made through `editSlide`, map through the edited span (`slideFirstLines` before and after the splice). Pass it as `index`, and do the same for the Prévia. Add a live-state test: insert a slide before the current one, and the same text stays on air.

### FUNC-002: A YouTube link offline (or after one failed script load) is black and silent until the window reloads
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/utils/youtube.js:42–58; src/components/projection/LiveVideo.jsx:298
- **Evidence:**
  - `loadYouTubeApi` appends `<script src="https://www.youtube.com/iframe_api">` with no `onerror` and no timeout. The promise only resolves, so it never fails.
  - The promise is cached in `apiPromise` for the life of the window.
  - `LiveVideo` hides the player until it reports PLAYING (`visibility: ytPlaying ? …`). `onError` / `onRefused` can only fire once a player exists.
  - `sendBlock` (`src/lib/console/sendBlock.js:13`) does not check connectivity for YouTube.
- **Live-service impact:**
  - On a church laptop with flaky or no Wi-Fi, sending a YouTube link turns the projector black. The media layer covers the lyrics and the Fundo. No toast, no amber pill, and the Autoplay never moves on.
  - If the first load failed even once, every later YouTube link in that window (projector and sound engine) stays black for the rest of the service, even after the internet is back.
- **Fix:**
  - Give the loader `tag.onerror` plus a timeout of about 8 s that rejects and clears `apiPromise`, so the next try loads again.
  - On reject, `LiveVideo` calls `onRefused(-1)` (a new "offline" code in `refusedMark`). The existing path then takes the item off and the console says "Sem internet: baixe o vídeo para a Mídia".
  - Have `sendBlock` refuse a YouTube stage while `navigator.onLine` is false.

### FUNC-003: Undecodable videos pass the import door, and a video that fails on air has no error handling
- Severity: P1
- Effort: M
- Confidence: High
- Location: src/lib/mediaImport.js:11, 128–134; src/lib/videoCodec.js:132–145, 184–189; src/components/projection/LiveVideo.jsx:26–33, 215–231; src/components/console/MediaView.jsx:332
- **Evidence:**
  - The Mídia accepts `video/*` (`MediaView.jsx:332`), and `mediaTypeOf` makes any `video/*` a video. That includes AVI, WMV, MPEG-2 `.mpg`/`.vob` and `.ts`.
  - `readVideoCodec` returns null for anything that is not MP4/MOV/EBML. "A codec the reader does not name passes" (`codecProblem` only knows HEVC, 10-bit and 4:2:2/4:4:4), so the file is copied in.
  - An MKV is read as `"webm"` by its EBML magic, whatever codec it holds.
  - On air, the pooled `<video>` has listeners only for `loadedmetadata` and `ended`. Nothing handles `error` or `stalled`, nothing reports to the live state, and nothing tells the console.
  - The same gap applies to a file deleted or moved after the 30 s `FileInfo` check (`useConsoleData.js:59`), to a song's playback or video file (never checked for `missing`: `stage.js:18`), and to a theme's video background.
- **Live-service impact:**
  - The operator sends a church video exported years ago as .wmv or .avi. The projector goes black over the lyrics, no sound comes out, and the Programa shows the same black.
  - Nothing explains why, and the Setlist Autoplay waits forever.
- **Fix:**
  1. Refuse at the door, in `uploadFile`: a video whose container is not MP4/MOV/WebM/MKV-with-a-known-codec, with `codecRefusal`-style words (HandBrake).
  2. In `LiveVideo`, listen for `error` on the claimed element. Report once per item, through a new `media.clear` / `video.clear` arg `{ failed: code, url }` that mirrors `refused`.
  3. The console shows it the way `useYouTubeRefused` does ("O vídeo não abriu: … Localizar…"), and the pill turns amber.

### FUNC-004: Picture and sound play in two separately started elements; lip sync is off and never corrected
- Severity: P1
- Effort: M
- Confidence: Medium (the mechanism is certain; the size of the offset needs a measurement on the church PC)
- Location: shared/live-state.mjs:1368–1375; src/components/projection/LiveVideo.jsx:19, 162–176; src/lib/soundPlan.js:36; src/pages/SoundEngine.jsx:66
- **Evidence:**
  - Since 2026-11-08 the projector's `<video>` (or YouTube iframe) is in a muted output window. The sound is a second element in the hidden `/Som` window.
  - Each element follows only the live clock, through `playbackPlan`, which seeks only when `|currentTime − target| > tolerance = 1.5` s.
  - At start each element plays from 0 as soon as *it* has loaded, because a 0.2–0.5 s target is under the tolerance. So the difference in load time between the two windows becomes a permanent A/V offset.
  - Rate nudging (`clipRate`) runs only on network screens (`if (NET)`, line 169).
  - For YouTube, both windows run their own YouTube player with independent buffering. Corrections are seeks, which rebuffer.
- **Live-service impact:** testimony and sermon videos and YouTube clips show visibly out-of-sync speech, up to 1.5 s before a jarring seek. Before the sound engine, picture and sound shared one element and this could not happen.
- **Fix:**
  - On desktop outputs that play a video the engine also plays:
    - seek to the target on `loadedmetadata` whatever the drift, so both start in step;
    - apply `clipRate` (already written) instead of `if (NET)` only;
    - use a tolerance of about 0.15 s for the rate and 1.5 s only for a hard seek.
  - For YouTube, consider muting nothing in the projector and having the engine skip YouTube (one player). Or accept and document it.

### FUNC-005: "This video ended" carries no identity, so the first window to finish takes it off every screen
- Severity: P2
- Effort: S
- Confidence: Medium
- Location: src/components/projection/LiveMediaView.jsx:33–39; src/pages/SoundEngine.jsx:58–66; shared/live-state.mjs:928, 936
- **Evidence:**
  - Every desktop window that mounts `LiveMediaView` calls `projection.clearMedia({ ended: true })` on its own element's `ended`: the projector, the other renderer outputs and the sound engine.
  - The sound engine does the same for the video channel (`clearVideo({ ended: true })`).
  - `media.clear` and `video.clear` accept it with no url, id or `shownAt` check. (A playlist's `media.advance` is guarded by `fromIndex`, the single-item path is not.)
  - With the drift from FUNC-004, the earliest element, often the sound engine, ends the item while the projector still has up to 1.5 s left.
  - An element that already sits at its end when the same video is sent again (same url, pooled element handed back) can fire `ended` and clear the new send.
- **Live-service impact:**
  - The last second of a video is cut on the projector.
  - Occasionally a video sent again right as it finishes disappears at once.
- **Fix:**
  - Send `{ ended: true, url, shownAt }` from `LiveMediaView` and the engine.
  - In `media.clear` / `video.clear`, ignore `ended` unless it matches the current item's url and `shownAt`.
  - Prefer the projector's report over the engine's for the media layer (engine: report only when no output plays it).

### FUNC-006: Esc during Tela preta or Logo lights the screens with the wallpaper; with nothing else on air there is no Desfazer
- Severity: P2
- Effort: S
- Confidence: High (code); Medium (that it is unintended)
- Location: shared/live-state.mjs:1192; src/lib/console/restore.js:54; src/pages/Console.jsx:910–960
- **Evidence:**
  - `clear` always returns `screen: "show"` and puts the Fundo padrão on.
  - `undoEndOps` adds `screen.set black/logo` only `if (ops.length && …)`. With only Tela preta up (nothing in content, media, communication, tool, video or audio), Esc returns no ops, so `end` shows a toast with no Desfazer (`useConsole.js:457`).
  - Esc reaches "end" whenever no menu, popover or window is open (`escapeTarget`, `keys.js:115`). Esc is the operator's reflex to close things.
  - Nothing in CLAUDE.md says Esc should lift Tela preta.
- **Live-service impact:** during a prayer with the projector blacked out, the operator presses Esc to dismiss something that already closed. The wallpaper or logo lights up in front of the congregation, and the toast offers no way back.
- **Fix:** in `clear`, keep `screen` when it is `black` or `logo` (only the layers go), or make the Esc key skip `end` while `screen !== "show"`. Either way, add a test. If lifting is wanted, make `undoEndOps` return `screen.set` even when it is the only op.

### FUNC-007: Bible references: cross-chapter ranges and verse lists are silently cut; English names unsupported, and "Jn" means Jonas
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/lib/console/quickRef.js:49–60, 84, 135; src/lib/bibleBooks.js:43, 179–193
- **Evidence (node run of `referenceFrom`):**
  - `"Jo 3:16-4:2"` → `{João 3:16–16}`. `quickRef` overwrites `verseEnd` with each later number, then clamps it to ≥ start.
  - `"Jo 3:16,18"` → 3:16 only.
  - `"John 3:16"`, `"Ps 23"`, `"Phil 4:13"`, `"Rev 22:21"` → null.
  - `"Jn"` is Jonas's short form (`bibleBooks.js:43`), so the English "Jn 1:1" projects Jonah 1:1.
  - `"Jd 24"` (single-chapter convention) → null.
  - The palette and the controle remoto both read references through `referenceFrom`.
- **Live-service impact:**
  - A preacher's slip reading "Jo 3:16–4:2" or "Rm 8:28,38-39" shows only the first verse, with no warning.
  - A bilingual operator typing English abbreviations gets nothing, or the wrong book.
- **Fix:**
  - In `readQuickRef` / `parseReference`: when a second ":" follows the dash (`c1:v1-c2:v2`), return an error ("Intervalo entre capítulos: envie cada capítulo") instead of truncating. Do the same for comma lists, or support the list as `nums`, which `stageFromVerses` already accepts.
  - Accept "Livro N" for one-chapter books (Ob, Fm, 2Jo, 3Jo, Jd) as chapter 1, verse N.
  - Add an English alias table (John, Ps/Psalm, Gen, Rom, Phil, Rev, Jas, Heb, Matt, Mk, Lk, 1 Cor…). Have exact PT short forms win, and treat an English-only token ("Jn" as John?) as ambiguous: list both candidates instead of guessing.

### FUNC-008: Desfazer after Esc restarts projector and video-channel videos from 0
- Severity: P2
- Effort: S
- Confidence: Medium (the code comment states it, but no owner decision is recorded)
- Location: src/lib/console/restore.js:26, 49, 52
- **Evidence:**
  - `undoEndOps` restores the media layer through `restoreArgs` → `media.show { kind, url, … }`, and the video channel as `video.show { … }`. Neither has a `position`.
  - Only the audio channel gets `position` and `paused` (`musicBack`).
  - `media.show` and `video.show` already honour `position` through `startOf` (`live-state.mjs:505`).
- **Live-service impact:** an accidental Esc 20 minutes into a sermon video, or 3 minutes into a worship video, followed by Desfazer, starts it again from the beginning. Recovery is not within the "under 2 s" goal.
- **Fix:** give `media.show` and `video.show` in `undoEndOps` `position: livePosition(before.media.playback, endedAt)` and `paused`, the same as `musicBack`, plus a `restore.test.mjs` case.

### FUNC-009: Importing a cifra or ChordPro file drops its chords and part names
- Severity: P2
- Effort: S
- Confidence: Medium (pinned by `songImport.test.mjs:15`, which likely predates inline chords and the Palco)
- Location: src/lib/songImport.js:50, 65, 117–131
- **Evidence:**
  - `parseChords` filters every chord-only line (`.filter((l) => !isChordLine(l))`).
  - `parseChordPro` strips inline `[C]` chords.
  - `songFromText` writes `lyrics` with no `[Refrão]` labels and slides with no `label` and no `chorded`.
  - The Holyrics and OpenLyrics paths, by contrast, go through `songRow`, which keeps chords and parts.
- **Live-service impact:** after importing the band's cifras, the Palco shows no chords and no part names, and rebuilding slides from those lyrics loses which stanza is the chorus. Musicians notice mid-song.
- **Fix:**
  - Convert chord-over-lyric pairs to inline chords (the editor's format; `chords.js` already parses chord lines).
  - Keep ChordPro `[C]` inline.
  - Emit `[Label]` lines from the sections.
  - Then build the row with `songRow` like the other formats.
  - Update the test.

### FUNC-010: Desfazer stays armed after something new goes on air
- Severity: P3
- Effort: S
- Confidence: High
- Location: src/components/console/useConsole.js:449–461; src/pages/Console.jsx:954–957
- **Evidence:**
  - After Esc, the 8 s Desfazer toast stays even when the operator sends the next item. A send says nothing, so the toast is not replaced.
  - Ctrl+Z (or a click) then runs `undoEnd`, which `content.show`s the old item over the new one.
- **Live-service impact:** the operator presses Esc, sends the next song, then presses Ctrl+Z out of habit or clicks the still-visible Desfazer. The previous song replaces the one just sent.
- **Fix:** drop the end toast (`unsay`) on any successful `send` or `goTo`. Or have `undoEnd` check that `live.rev` has not moved past `after.rev`, apart from `leaving` cleanup.

### FUNC-011: The sound engine gives up silently after 5 crashes a minute
- Severity: P3
- Effort: S
- Confidence: High
- Location: electron/soundEngine.cjs:52–54
- **Evidence:** past `maxRestarts` it only calls `log.error` ("não abre de novo até reiniciar o KERYX"). Unlike `guardWindow` (`main.cjs:212`, "reiniciou 3 vezes"), it adds no notification, and every output is muted.
- **Live-service impact:** if it ever happens, all sound is gone for the rest of the service and the operator has no clue why.
- **Fix:** pass `notify` into `createSoundEngine` and add a warn notification ("O som do KERYX parou: reinicie o KERYX") when it gives up.

## 4. Part C: edge cases (checked, no finding unless noted)
- **Empty states:**
  - Sending with an empty Prévia is refused with words (`sendBlock.js:14`).
  - Arrows with nothing on air: "Nada com slides no ar."
  - A song with no slides is not blocked. It shows a blank screen (minor).
- **Long titles and lines:**
  - A lyrics line shrinks to 45 % before wrapping, and text always fits the safe area.
  - The live state rejects (413) a title over 500 characters and slide text over 20 000. A long free text pasted into "Texto" without the theme's "Dividir" fails to send with "Texto do slide longo demais" (rare).
- **Accents and emoji:** `fold` (`bibleBooks.js:162`) strips marks, and the import decoding handles Windows-1252. No issue found.
- **Duplicate names:** by title + lyrics (`songKey`). Same-title, different-lyrics songs coexist.
- **5,000 songs:** no list virtualization in the console's Biblioteca. That is the performance pass's job (handoff).
- **Dates and time zones:** cultos use local dates (`timeline.js:40`). The CSV and JSON export file names use `toISOString().slice(0,10)`, so after 21:00 in Brazil they carry tomorrow's date (cosmetic). `SongHistory.played_at` is UTC ISO, compared as strings for the period (± 3 h at the edges).
- **Unsaved changes:** one guard per page through `escRef` and `useConfirm`. It opens on Cancelar for destructive actions. No gap found.

## 5. What's done well (don't break it)
- **The single live state.** One `applyOp` with the lock check in one place (`live-state.mjs:1199`), every change a rev, and the save atomic through tmp + rename (`live.cjs:38`).
- **The crash path:**
  - the marker and the watchdog with a restart cap;
  - the screens lit after a crash, with media paused and a notification telling the operator to press play;
  - the outputs reopened.
- **The send guards:**
  - `sendBlock` refuses locked screens, files still syncing, known-missing files and PDFs not ready.
  - `sendStage` reopens a closed projector without stealing focus.
- **YouTube refused-embed handling:** hidden until it plays, `refused` cleared from the screens, and the console offers to download.
- **Bible reading:** installed, then online, then fallback, with a pt-BR reason at each step.
- **Import decoding** (BOM, UTF-8, XML declaration, Windows-1252) and the archive restore (allowlist, `quick_check`, swap at next launch with rollback).
- **Display loss:** outputs wait hidden instead of landing on the console (the earlier ARCH-002 risk is gone), and nothing re-presents when the output is already in place.

## 6. Open questions (for Davi)
- **Q1. Display identity after a replug:** `findDisplay` falls back to label + size only when the label is non-empty and unique (`outputs.cjs:45–52`). On the church PC, does the projector keep its Electron display id across a cable replug or an input switch? If the id changes and the label is blank, an output assigned to that projector would wait hidden forever. Please check `Diagnóstico` before and after a replug.
- **Q2. Esc over Tela preta (FUNC-006):** should Esc lift Tela preta or Logo? If yes, only the missing Desfazer is a bug.
- **Q3. Restarting videos (FUNC-008):** was "media and videos start again from the beginning" on Desfazer a deliberate choice?
- **Q4. Starting with stale content:** after a normal start, the last service's content is loaded under Tela preta, and pressing B shows it (`restoreState`). Is that wanted, or should a normal start clear the content and keep only the Fundo?
- **Q5. Lip sync on the church PC (FUNC-004):** can you measure the A/V offset of a talking-head video on the projector? That would settle the severity.
- **Q6. Arrows under another layer:** arrows while a video or timer covers the lyrics move the hidden lyrics (`moveSlide` checks only `live.content`). Is that intended?

## 7. Handoffs to other passes
- **PERF:** no virtualization in the Biblioteca, Setlist or palette for 5,000+ songs. YouTube loads twice (projector + engine) on church Wi-Fi. The media mirror backup runs right after a crash relaunch.
- **ARCH:** a main process that hangs (not dies) is not covered by the watchdog. A send is several ops, not one transaction.
- **UX:** there is no key to jump to a song part (chorus, bridge) as Holyrics has.
- **TEST:** no test pins the slide index across a `content.update` that changes the slide count (FUNC-001), the identity of an ended report (FUNC-005), or Esc during Tela preta (FUNC-006).
