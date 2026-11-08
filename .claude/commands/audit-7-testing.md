---
description: Keryx audit pass 7 — test gaps and a test plan for the critical paths
---
Read `audit/AUDIT_CONTEXT.md`, `audit/00-recon.md`, and all P0/P1 rows in `audit/FINDINGS.md` first. Follow all rules. Use a testing-strategy skill if available.

Optional scope from user: $ARGUMENTS
ID prefix: TEST

## Evaluate
1. Current state: frameworks, number of tests, what they actually cover, flaky or skipped tests, CI integration.
2. Map coverage against the critical live flows from `03-functionality.md` and every P0/P1 finding: which have zero automated protection?

## Produce a test plan
- **Unit** (pure logic, fast): Bible reference parser (PT + EN formats, ranges, invalid input), lyric slide splitting, song import parsers, schedule operations, data migrations.
- **Integration** (main process): IPC handlers with valid/invalid payloads, atomic save and recovery from a truncated file, settings migration.
- **E2E** (Playwright for Electron): go-live flow for song and Bible, blackout/clear, output window reload keeps live state, crash-and-restore.
- **Regression tests for each P0/P1** — one named test per finding ID.

For each proposed test: name, layer, what it protects, finding ID(s), effort (S/M/L). Order by risk reduction per hour of effort. Include one fully written example test per layer, matching the project's existing conventions (put examples in the report, not in the codebase).

Recommend a minimal CI gate (lint + type-check + unit + 3 critical E2E) that fits a solo developer.

Write `audit/07-testing.md`, append TEST rows, print the summary and stop.
