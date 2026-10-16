---
description: Keryx audit pass 4 — startup, memory, output smoothness on low-spec hardware
---
Read `audit/AUDIT_CONTEXT.md` and `audit/00-recon.md` first. Follow all rules. Measure first, recommend second. Use a performance skill if available.

Optional scope from user: $ARGUMENTS
ID prefix: PERF

Target hardware assumption: 8 GB RAM, dual-core, integrated GPU, HDD or slow SSD, Windows 10.

## Static analysis (always)
- Startup path: what runs before the first window is visible? Sync requires, DB opens, library indexing, Bible module loading. Is `ready-to-show` used to avoid white flashes?
- Bundle: renderer bundle size, unused heavy dependencies, code splitting for non-critical screens (settings, editors).
- Hot paths: slide changes, search-as-you-type (songs, Bible), thumbnail generation, list rendering of large libraries (virtualised or not?).
- Output window rendering: transitions done with CSS transforms/opacity (GPU) or layout-triggering properties? Video backgrounds: hardware decoding, multiple video elements, memory release when switching.
- Leaks: event listeners, IPC listeners, intervals, object URLs, video elements, image caches not released over a 2-hour session.
- Main-process blocking: sync fs, large JSON parse/stringify on save, image processing on the main thread.

## Measurement (ask before running anything)
Propose a measurement script in `audit/tmp/` (not touching tracked files) for: cold start time to interactive, memory after start vs after 100 slide changes vs after 20 video background switches, search latency on a large library (generate synthetic data in `audit/tmp/`). Run only if I approve; otherwise report static findings only and mark measurement as pending.

Rule of thumb for severity: any visible stutter or delay > 150 ms on a slide change, or memory growth that would hit limits within a 3-hour service, is P1 or higher. A freeze of the output is P0.

Write `audit/04-performance.md` with measured numbers (or "not measured"), append PERF rows, print the summary and stop.
