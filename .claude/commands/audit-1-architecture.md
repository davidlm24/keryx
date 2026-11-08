---
description: Keryx audit pass 1 — architecture, process boundaries, IPC, state and output sync
---
Read `audit/AUDIT_CONTEXT.md` and `audit/00-recon.md` first. Follow all rules. Use an architecture or code-review skill if available.

Optional scope from user: $ARGUMENTS
ID prefix: ARCH

## Evaluate
1. **Process boundaries** — Is business logic in the right process? Is the renderer doing file system/DB work it shouldn't? Is the main process blocked by synchronous work (sync fs, sync IPC, heavy parsing) that could freeze every window?
2. **IPC design** — Consistency of naming and patterns (invoke/handle vs send/on), payload typing, error propagation back to the UI, listener cleanup (leaks on window reload), chatty IPC on hot paths (e.g. per-keystroke or per-frame).
3. **Single source of truth for "what is live"** — How does the operator window tell the output window what to show? Can operator and output ever disagree? What happens if the output window reloads, is closed, or a display is unplugged/replugged mid-service? Is live state recoverable after a crash?
4. **State management** — Where state lives, duplication across windows, derived vs stored state, undo/redo design.
5. **Data layer** — Write safety (atomic writes, temp file + rename, transactions), corruption risk on power loss, schema versioning/migrations, autosave and backups.
6. **Module structure & coupling** — Circular dependencies, god files (>800 lines), feature boundaries, shared code between main/renderer.
7. **Error handling & resilience** — uncaughtException/unhandledRejection handlers, renderer crash handling (`render-process-gone`), GPU process crash, logging to a file the user can send you.
8. **Build & update architecture** — Dev/prod config separation, auto-update flow, and whether a failed update can leave the app unusable before a service.

For any P0/P1 about live-state sync or data safety, include a short sequence ("operator does X → main does Y → output shows Z") to prove the failure path.

Write `audit/01-architecture.md` per the report structure, append rows to `audit/FINDINGS.md`, then print the summary and stop.
