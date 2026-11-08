# Keryx Audit — Shared Context

Every audit pass reads this file first. It defines the product context, the rules, and the output format.

## Product context
Keryx is an Electron desktop app for church presentation (same class as Holyrics and ProPresenter): song lyrics, Bible passages, media, announcements and countdowns projected to one or more output screens during live services.

Operating reality, which every finding must be judged against:
- Operated LIVE by volunteers, often under pressure, in a dim room, with a congregation watching the output.
- Dual (or more) screens: operator window + projection output, possibly a stage/confidence display and a stream output.
- Keyboard-heavy operation; mistakes must be recoverable in under 2 seconds.
- Often runs on old, low-spec church laptops, sometimes offline.
- Bilingual audience (Portuguese and English); Bible references typed in either convention (e.g. "Jo 3:16", "John 3:16").
- A crash, freeze, blank screen or wrong slide during a service is the worst possible outcome. Data loss of the song library or schedule is next.

## Rules for every pass
1. READ-ONLY. Do not modify, refactor or reformat any project file. Only write inside `audit/`. Temporary scripts go in `audit/tmp/` and must not touch tracked files.
2. Evidence or it didn't happen. Every finding cites `path/to/file.ext:line` (or a screen/flow name for UX) and quotes or describes the exact evidence.
3. No speculative findings. If you suspect something but cannot confirm, list it under "Open questions" instead.
4. No framework rewrites, no "migrate to X" recommendations, no generic best-practice padding. Fixes must be concrete and scoped to this codebase.
5. Judge impact through the live-service lens: "what happens to the operator and the congregation if this goes wrong on Sunday?"
6. Ask before running project code, installing packages, or launching the app.
7. Stay inside the pass scope. Note out-of-scope observations in one line under "Handoffs to other passes".
8. If a relevant skill or plugin is available in this environment (e.g. finecomb, code-review, architecture, accessibility-review), use it, and say which one you used.

## Severity rubric
- **P0 — Service-breaking**: can crash, freeze, blank or show wrong content during a live service; data loss; exploitable security hole.
- **P1 — Major**: serious operator friction or risk; a workaround exists but is not obvious.
- **P2 — Minor**: noticeable issue with low live impact.
- **P3 — Polish**: quality and consistency improvements.

Also rate **Effort** (S < half a day, M 1–3 days, L > 3 days) and **Confidence** (High / Medium / Low).

## Finding format (use exactly)
```
### <PREFIX>-<NNN> — <Short title>
- Severity: P0 | P1 | P2 | P3
- Effort: S | M | L
- Confidence: High | Medium | Low
- Location: path/to/file.ts:123 (or Screen > Flow)
- Evidence: <what you observed, short quote or description>
- Live-service impact: <what goes wrong for the operator/congregation>
- Fix: <concrete change, scoped to this codebase>
```

ID prefixes: ARCH, SEC, FUNC, PERF, UX, A11Y, COPY, TEST.

## Report structure (each pass)
Write to `audit/<NN>-<pass>.md`:
1. Summary (5 lines max: overall verdict + top 3 risks)
2. Findings, ordered P0 → P3
3. What's done well (short, specific — so it is not broken during fixes)
4. Open questions (for Davi to answer)
5. Handoffs to other passes

Then append one row per finding to `audit/FINDINGS.md`:
`| ID | Pass | Sev | Effort | Title | Location | Status=Open |`
