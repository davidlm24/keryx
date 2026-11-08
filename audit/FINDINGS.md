# Keryx — Findings Register

| ID | Pass | Sev | Effort | Title | Location | Status |
|----|------|-----|--------|-------|----------|--------|
| ARCH-001 | 1 | P0 | S | Crashed/hung windows never recover; "Abrir" re-focuses the dead projector | electron/main.cjs:273; outputs-manager.cjs:198 | Fixed (PR #245) |
| ARCH-002 | 1 | P1 | S | Projector signal drop throws all outputs onto the operator's screen | outputs-manager.cjs:150; outputs.cjs:62 | Open |
| ARCH-003 | 1 | P1 | M | Unopenable DB stops Keryx at launch though backups exist | electron/main.cjs:284 | Open |
| ARCH-004 | 1 | P2 | M | Slow sync work (DB, Bible search, backup) on the slide-relay thread | db/store.cjs:117; main.cjs:388 | Open |
| ARCH-005 | 1 | P2 | S | Page with a failed first live read stays empty until next change | src/api/liveClient.js:52 | Fixed (first read retried, 2026-10-20) |
| ARCH-006 | 1 | P3 | M | No type checking on preload/main/page contract | electron/preload.cjs; data-ipc.cjs | Open |
| ARCH-007 | 1 | P3 | M | Oversized files and leftovers (Console.jsx, CLAUDE.md 88 KB, supabase/) | src/pages/Console.jsx | Open |
| ARCH-008 | 1 | P3 | S | Backups only at open/close | electron/system.cjs:165 | Open |
| ARCH-009 | 1 | P3 | S | 15 unused Base44 entities + web-build leftovers (owner: delete) | base44/entities; syncScope.cjs | Open |
| TEST-001 | 7* | P2 | S | `npm test` unquoted globs skip ~490/732 tests outside cmd.exe | package.json "test" | Open |
| TEST-002 | 7* | P3 | S | Flaky LAN test: fixed 100 ms sleep | electron/lan.test.cjs:112 | Open |

*Found during the test run; full write-up in pass 7.
| SEC-001 | 2 | P2 | M | LAN screens expose whole DB (team phones/emails, students) with no PIN by default; no Host check | electron/lan.cjs:52, 284, 400 | Open |
| SEC-002 | 2 | P2 | M | YouTube script runs in privileged app origin; no CSP | src/utils/youtube.js:50 | Open |
| SEC-003 | 2 | P3 | M | Unsigned builds and updates | package.json build.win | Open |
| SEC-004 | 2 | P3 | S | Electron fuses not set | package.json build | Open |
| SEC-005 | 2 | P3 | S | Browser-side packages shipped as runtime deps; audit noise | package.json dependencies | Open |
| SEC-006 | 2 | P3 | S | Remote code guessable slowly across rotating IPs | electron/lan.cjs:85 | Open |
