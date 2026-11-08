# Handoff: audit status as of 2026-10-16

Passes 0–2 were done in claude.ai, using a clone of `d12d94d`. Continue the audit in Claude Code from pass 3.

## Done
- **Pass 0:** `00-recon.md`. The map of the repo.
- **Pass 1:** `01-architecture.md`. 9 findings (ARCH-001…009).
- **Pass 2:** `02-security.md`. 6 findings (SEC-001…006).
- **Test run:** 731 of 732 passed. Two findings, TEST-001 and TEST-002, are in `FINDINGS.md`.

## Owner decisions already made
- **Network screens:** at CCG they are joined with the PIN or a QR code. SEC-001 is now P2.
- **Releases:** only Davi can push them. SEC-003 is now P3.
- **Base44 leftovers:** may be deleted, but only the 15 unused entities listed in ARCH-009.
  - WorshipTeam, BibleSchoolClass, BibleNote and Quiz are live features. Keep them.
  - Keep the schema source; rename `base44/entities` to `schema/entities`.

## Next steps, in order
1. **Fix ARCH-001 (P0) before Sunday.** Use the prompt below, on its own branch.
2. Optionally, fix ARCH-002 (P1) if the projector ever switches input during a service.
3. Resume the audit with `/audit-3-functionality`, then 4 → 8. Run `/clear` between passes.

## Prompt for fixing ARCH-001
```
Fix ARCH-001 from audit/01-architecture.md.
Scope: electron/main.cjs (guardWindow), electron/outputs-manager.cjs. Nothing else.
Do:
1. On render-process-gone (reason !== "clean-exit"): log, reload after 300 ms; max 3 reloads per 60 s per window, then notifications.add a warning.
2. On unresponsive: 4 s timer (cleared on responsive) → forcefullyCrashRenderer() + reload.
3. outputs.open(key): if the tracked window's webContents.isCrashed(), close it and open a fresh one.
4. Console window: same reload; after reload show a toast "O console foi reiniciado; nada saiu do ar".
5. Add a smoke step: forcefullyCrashRenderer() on /Projection → it reloads and shows the same live rev.
Don't: change live-state logic or page code. Run npm test and desktop:smoke before opening the PR.
```

When a finding is fixed, set its Status in `FINDINGS.md` to `Fixed (<commit or PR>)`.
