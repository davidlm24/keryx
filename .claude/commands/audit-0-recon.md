---
description: Keryx audit pass 0 — map the repo, stack, process model, IPC and feature inventory
---
Read `audit/AUDIT_CONTEXT.md` and follow its rules. This pass produces a map, not findings.

Optional scope from user: $ARGUMENTS

## Goal
Build an accurate map of Keryx that every later pass will rely on. Be factual; do not judge yet.

## Produce `audit/00-recon.md` with these sections
1. **Stack & versions** — Electron, Node, UI framework, bundler, language (TS/JS), state library, DB/storage, key dependencies. Flag anything with a known end-of-life or that is more than 2 majors behind (as a note, not a finding).
2. **How to run / build / package** — scripts from package.json, packager (electron-builder, forge…), auto-update mechanism, code signing setup if present.
3. **Process model** — main process entry, every BrowserWindow created (operator, output, stage display, settings…), their webPreferences, which preload each uses, and how windows map to displays.
4. **IPC inventory** — table of every channel: name | direction | sender file:line | handler file:line | payload shape | validated? (yes/no).
5. **Preload surface** — everything exposed via contextBridge (or globals), with file:line.
6. **Data & storage** — where songs, Bible versions, media, schedules, settings and themes live (paths, formats, DB schema), and how saving/autosave/backup works.
7. **Feature inventory** — check presence (Present / Partial / Absent, with file references) for: song library & editor, lyric slide splitting, Bible (versions, search, reference parsing PT+EN), media (images, video, audio, backgrounds), schedule/service order, themes/templates, transitions, layers & blackout/clear, stage/confidence display, multiple outputs, stream output (alpha/lower thirds, NDI), countdown/timers, announcements, remote control (mobile/web), import/export (Holyrics, ProPresenter, OpenLP, ChordPro, CCLI), i18n, crash recovery, offline use.
8. **Tests & tooling** — test frameworks, coverage, lint, type-check, CI.
9. **Red flags for later passes** — one line each, tagged with the pass that should examine it (ARCH/SEC/FUNC/PERF/UX/A11Y/TEST).

Do not append anything to FINDINGS.md in this pass.

When done, print a 10-line summary and stop. Ask me to confirm the map is correct before I run the next pass.
