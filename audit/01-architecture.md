# Keryx audit, pass 1: Architecture

Repo @ `d12d94d`. Static read, plus a full `node --test` run (731 of 732 tests passed).

## Summary
The core design is strong. Main holds a single live state, each update carries a revision number, and pages ignore any update older than the one they already show. Saves are crash-safe. Sync goes through signed, append-only files, applied idempotently in batches.

The weak spot is recovery when the runtime itself fails.

**Top 3 risks**
1. A crashed or hung projector (or console) window never recovers on its own, and "Abrir" on the dead window just re-focuses it (ARCH-001).
2. A projector signal drop throws every output onto the operator's screen as a 1280×720 window (ARCH-002).
3. A database that won't open stops Keryx at launch, even though good backups exist (ARCH-003).

## Findings

### ARCH-001 — Crashed or hung windows never recover; the projector stays dead
- **Severity / effort / confidence:** P0 · S · High
- **Location:** electron/main.cjs:273, electron/outputs-manager.cjs:198–207, electron/main.cjs:126–197 (guardWindow)
- **Evidence:**
  - `render-process-gone` and `child-process-gone` are handled app-wide by `logger.error(...)` only.
  - Nothing reloads the window, and there is no `unresponsive` handler.
  - The dead window stays in the output manager's `windows` map. `open(key)` then finds it "existing" and only calls `showInactive()` + `moveTop()`.
- **How the failure unfolds:**
  1. A video background with a GPU driver hiccup, or an out-of-memory error on an 8 GB laptop, kills the output renderer.
  2. Main logs it.
  3. The projector shows a blank or crashed page, and stays always-on-top.
  4. The operator clicks "Abrir" in Telas e saídas. That focuses the same dead window, and nothing changes.
  5. Only Fechar followed by Abrir, or restarting Keryx, fixes it.
  6. If it is the **console** renderer that dies, the operator loses all control, while the outputs freeze on the last slide.
- **Live-service impact:** a blank or frozen projector, plus an operator who doesn't know how to get it back, during a service.
- **Fix:** add this inside `guardWindow` so it covers every app window.
  - On `render-process-gone` with `details.reason !== "clean-exit"`: log it, then reload after 300 ms.
  - Back off after repeated failures: at most 3 reloads per 60 s, then show a notification ("A saída Projeção reiniciou 3 vezes; veja o diagnóstico").
  - On `unresponsive`: start a 4 s timer and clear it on `responsive`. If the timer fires, call `forcefullyCrashRenderer()` and reload.
  - In `outputs-manager.open()`, treat `win.webContents.isCrashed()` as "not existing": close the window and open a new one.
  - The pages need no other change. Keeping live state in main, plus the revision-checking client (src/api/liveClient.js), already restores the exact slide on reload.
  - For the console, show a toast after reload ("O console foi reiniciado; nada saiu do ar").
  - Add a smoke step that calls `webContents.forcefullyCrashRenderer()` on `/Projection` and asserts it reloads and shows the same `rev`.

### ARCH-002 — A projector signal drop throws all outputs onto the operator's screen
- **Severity / effort / confidence:** P1 · S · Medium (depends on how the church PC's GPU and projector report hot-plug)
- **Location:** electron/outputs-manager.cjs:150–154 (`reapplyAll` on `display-removed` / `display-metrics-changed`), electron/outputs.cjs:62–70 and 83–89
- **Evidence:**
  - When the target display disappears, `resolvePlacement` returns `{ mode: "window" }` (missing, or `auto` with no external screen).
  - `present()` then leaves full screen and calls `setBounds(windowedBounds())`, a 1280×720 window **centred on the primary display**. The primary display is the operator's.
  - `applyOnTop` drops always-on-top, but the window has just been raised over the console.
  - This repeats for every open output: Projeção, Letras, Palco, Pastor and so on.
  - There is no debounce, so a 1–2 s HDMI blip goes full screen → windowed → full screen.
- **Live-service impact:**
  - Common real triggers: a projector switching input, an HDMI extender renegotiating, or a projector's eco mode.
  - When it happens, video windows cover the console mid-song exactly when the operator needs it.
  - The operator also sees what the congregation would have seen, which can be confusing.
- **Fix:**
  - Debounce `reapplyAll` by about 1.5 s, so blips do nothing.
  - When an output's display is truly gone, `hide()` the window instead of windowing it on the primary display. Keep it rendering, since backgroundThrottling is already off. Raise a notification: "Projetor desconectado — a saída volta sozinha quando ele voltar."
  - When the display comes back, call `present()` + `showInactive()`.
  - Keep the windowed fallback only for the explicit `target: "window"` setting.

### ARCH-003 — A database that won't open stops Keryx at launch, though backups exist
- **Severity / effort / confidence:** P1 · M · High (code path); likelihood is low
- **Location:** electron/main.cjs:284–289, electron/system.cjs:166–183, electron/backup.cjs:44
- **Evidence:**
  - `createStore` throwing leads to `fatal("KERYX não conseguiu abrir os dados", …)` and then `app.exit(1)`.
  - Daily backups (`keryx-YYYY-MM-DD.db`) are made with `VACUUM INTO`, so they are consistent copies.
  - But restoring one is done from Configurações, which requires the app to be running.
- **Live-service impact:**
  - A power cut while the laptop is writing, a disk error, or antivirus locking the file all lead to the same result.
  - Sunday morning, Keryx won't start and the volunteer has no way back.
- **Fix:**
  - On open failure, first move `keryx.db` (plus `-wal` and `-shm`) to `keryx.db.broken-<timestamp>`.
  - Then show a dialog: "Os dados não abriram. Restaurar o backup de <data, hora>?" with Restaurar / Sair.
  - On Restaurar, copy the newest backup into place and continue the normal startup.
  - Log the original error for the diagnostic bundle.
  - Add a unit test: a truncated database file must lead to an offer to restore, and accepting must open a working store.

### ARCH-004 — Slow synchronous work runs on the same thread that relays every slide change
- **Severity / effort / confidence:** P2 · M · Medium (needs measurement, see the performance pass)
- **Location:**
  - electron/db/store.cjs:117–124 (`DatabaseSync`, JS function `keryx_contains`)
  - src/lib/bibleText.js:112 (Bible text search uses `$regex`, which becomes `keryx_contains` on every verse row)
  - electron/main.cjs:388 (backup on open)
  - electron/system.cjs:174 (backup target can be a USB pen drive)
  - electron/sync.cjs (applyRemote batches of 500)
- **Evidence:**
  - Every database call, the Bible full-text scan, `VACUUM INTO` and sync batch transactions run synchronously in main.
  - Main is also what broadcasts `keryx:live-change` to the outputs.
  - The backup on open runs before the console window is created, writing to a folder that may be a pen drive.
- **Live-service impact:**
  - On a slow laptop, a Bible text search or a sync pass mid-service can delay a slide change by hundreds of milliseconds.
  - Startup waits for a full database copy to the backup folder.
- **Fix:**
  - Cheap first steps:
    - Run the startup backup after the console is shown (`setImmediate` after `ready-to-show`).
    - Skip a pass's backup and sync work while a transition is in progress.
  - Structural step: move the store into a `worker_thread`. `node:sqlite` works there, and `store.call` is already a single message-shaped entry point, so the IPC layer barely changes.
  - At minimum, move Bible text search and `VACUUM INTO` to a worker.

### ARCH-005 — A page whose first live read fails stays empty until the next change
- **Severity / effort / confidence:** P2 · S · High
- **Location:** src/api/liveClient.js:52–58
- **Evidence:** `start()` calls `load()` once. If that fails, it only `console.error`s, and `current` stays `null` until the next `live-change` event arrives.
- **Live-service impact:**
  - An output opened, or auto-reloaded (ARCH-001), while main is briefly busy stays black.
  - It only recovers when the operator happens to change the slide. That's fine during songs, but bad during a long sermon on one slide.
- **Fix:** retry `load()` with backoff (250 ms, 1 s, 3 s, then every 5 s) until it gets a snapshot. The `rev` guard already makes late replies safe.

### ARCH-006 — No type checking on the contract between preload, main and the pages
- **Severity / effort / confidence:** P3 · M · High
- **Location:** electron/preload.cjs, electron/data-ipc.cjs, src/api/*, jsconfig.json; `typescript` sits unused in devDependencies
- **Evidence:**
  - About 52k lines of plain JS.
  - IPC payload shapes (`{ entity, op, args }`, `{ op, args }`) and live operations are checked only at runtime and by tests.
  - There is no `tsc --noEmit` step in CI.
- **Live-service impact:** indirect. A renamed op or field between processes is caught only by tests that happen to cover it.
- **Fix:**
  - Set `"checkJs": true` in jsconfig, scoped first to `electron/preload.cjs`, `electron/data-ipc.cjs`, `src/api/` and `shared/live-state.mjs`.
  - Add JSDoc typedefs for the bridge.
  - Add `tsc --noEmit -p jsconfig.json` to CI.
  - Widen the scope later.

### ARCH-007 — Files too large to change safely, and leftovers
- **Severity / effort / confidence:** P3 · M · High
- **Location:**
  - src/pages/Console.jsx (1,434 lines; keyboard handler at about line 870)
  - src/lib/console/dock.js (848), electron/db/store.cjs (846), electron/sync.cjs (910)
  - supabase/ (retired), scripts/import-base44.mjs (one-off)
  - CLAUDE.md (88 KB, 1,157 lines)
- **Evidence:**
  - Console.jsx mixes layout, keyboard routing and actions.
  - CLAUDE.md is loaded into every Claude Code session, so a large share of context is spent before any work starts.
- **Live-service impact:** none directly. Changes to the most-used screen carry more risk of regressions.
- **Fix:**
  - Extract the console keyboard map into `src/lib/console/keys.js`, a pure module with tests.
  - Cut CLAUDE.md to the ground rules, commands and "Watch out for" sections (target ≤ 15 KB). Move the rest to `docs/` and reference it by path.
  - Archive `supabase/` and the Base44 import script on a branch.
  - Keep `base44/entities`, since it is the schema source, but consider renaming it to `schema/`.

### ARCH-008 — Backups only happen when Keryx opens or closes
- **Severity / effort / confidence:** P3 · S · High
- **Location:** electron/system.cjs:165 (`AUTOMATIC = ["ao abrir", "ao fechar"]`), electron/main.cjs:388/550
- **Evidence:** there is no periodic backup. A crash or power cut skips the closing backup.
- **Live-service impact:** after a long rehearsal plus service with heavy edits, the newest backup may be from that morning.
- **Fix:** add a backup when the app is idle, about 3 hours after the last one and only when nothing is on air (`liveRules.isOnAir`). This reuses `backupNow` after ARCH-004 moves it off the main thread.

### ARCH-009 — Fifteen unused Base44 entities and the old web-build paths are still shipped
- **Severity / effort / confidence:** P3 · S · High (no code references found outside tests and schema files)
- **Location:** base44/entities/*.jsonc → electron/db/schema.json, electron/db/syncScope.cjs, scripts/import-base44.mjs, src/lib/backgrounds.js:70, supabase/
- **Evidence:**
  - These entities have **zero** references in `src/`, `shared/` and `electron/` (excluding tests, schema and sync-scope lists): AlertMessage, BannerTemplate, BibleProjectionSync, ChatMessage, LiveSession, LyricSync (test only), Playlist, Poll, ProjectionDevice, ProjectionScene, ProjectionState, Raffle, VideoControl, VideoSync, VolunteerSchedule.
  - `HOSTED_LOGO` still points at media.base44.com for the retired web build.
  - The **live** ones stay: WorshipTeam, BibleSchoolClass, BibleNote, Quiz and the rest.
- **Live-service impact:** none. Removing them shrinks the schema, the sync scope and the data the network screens can see (SEC-001).
- **Fix (owner approved deleting the leftovers):**
  1. Remove the 15 entity files, regenerate the schema (`npm run db:schema`), and drop them from `syncScope.cjs`.
     - Existing tables in old databases can stay; they are harmless.
     - Sync already parks entities it doesn't know (store.cjs `applyOne`), so a PC still on an older version won't break.
     - Update `lan.test.cjs`, which uses `LyricSync`, to use `Song`.
  2. **Keep** the schema source but rename `base44/entities` to `schema/entities`. Update `build-schema.cjs`, `gen-sqlite-schema.mjs` and the comment in `src/lib/prefs/schema.js`.
  3. Delete `scripts/import-base44.mjs`, the `db:import` script, the `.env.example` Base44 lines, `scripts/localize-media.cjs` (if no longer needed), `HOSTED_LOGO`, and `supabase/` (or archive them on a branch).
  4. Run `npm test` (with quoted globs, TEST-001), `desktop:smoke` and a backup-restore round trip.

## What's done well (keep it)
- **Single source of truth for live state:** main owns the state (`shared/live-state.mjs`), and pages adopt only newer revisions (liveClient.js:23–25). Reload-safe by design.
- **Crash-safe saves:** live state is saved atomically (tmp + rename, 300 ms debounce), and a corrupt `live.json` starts empty instead of failing (live.cjs:27–33).
- **SQLite done right:** WAL mode, explicit transactions, `VACUUM INTO` backups, and columns added automatically for schema growth.
- **Sync built to survive real cloud folders:**
  - Signed, append-only JSONL files.
  - Idempotent last-write-wins.
  - Partial last lines are left for the next pass.
  - Batches of 500.
  - Bible verses are kept local.
- **Projection-specific Electron details:**
  - Occlusion and background-media suspend are disabled.
  - Outputs are tool windows outside the taskbar and Alt+Tab, with no cursor, always-on-top at screen-saver level on their own screen, and they hand focus back to the console.
- **Update and close safety:** installs are allowed only off-air, and closing asks first when something is on air.
- **IPC hygiene:**
  - One origin check covers every channel, and generic operations use allow-lists.
  - Each page subscribes once, globally, so there are no per-component listener leaks.
  - Remote commands time out after 5 s.

## Open questions for Davi
1. **Seen in practice?** Have you ever seen an output go white, black or frozen and need Fechar/Abrir or a restart? That would confirm ARCH-001 in real life.
2. **Signal drops:** when the church projector is switched off or changes input, does Windows remove the display? You'd see the outputs jump onto your screen. That would confirm ARCH-002.
3. **Backup folder:** is it on the internal disk or a pen drive at the church?

## Handoffs to other passes
- **PERF:** measure `keryx_contains` Bible search time and the startup `VACUUM INTO` on the church laptop.
  - Each live operation stringifies the full snapshot (live.cjs) and broadcasts it to every window; check its size and cost with 7 outputs open.
  - Audio level is broadcast 20 times a second to every window.
- **SEC:**
  - No Content Security Policy.
  - Unsigned builds: electron-updater checks only the sha512 from the GitHub feed.
  - `store.call(entity, op)` is the widest bridge and needs a check of how entities and ops are restricted.
  - The LAN `/api/db` is readable with no PIN.
- **TEST:** these come from the earlier test run.
  - `npm test` globs skip about 490 of 732 tests outside cmd.exe (quote them).
  - `lan.test.cjs:112` is flaky because of a fixed 100 ms sleep.
  - No test covers a renderer crash or display hot-plug.
