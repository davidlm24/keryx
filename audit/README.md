# Keryx Audit Kit

## Install
Copy `.claude/` and `audit/` into the Keryx repo root. Commit them on a branch (e.g. `audit/2026-10`) so reports are versioned.

## Run order
Run each pass in a fresh Claude Code session (`/clear` between passes). Each pass reads `audit/AUDIT_CONTEXT.md` and the earlier reports, so context stays lean.

| # | Command | Output | Focus |
|---|---------|--------|-------|
| 0 | `/audit-0-recon` | `00-recon.md` | Map the repo, stack, process model, IPC, features |
| 1 | `/audit-1-architecture` | `01-architecture.md` | Process boundaries, IPC, state, output-window sync |
| 2 | `/audit-2-security` | `02-security.md` | Electron hardening, preload, updates, file handling |
| 3 | `/audit-3-functionality` | `03-functionality.md` | Feature correctness, live flows, parity vs Holyrics/ProPresenter |
| 4 | `/audit-4-performance` | `04-performance.md` | Startup, memory, output smoothness on low-spec hardware |
| 5 | `/audit-5-ux` | `05-ux.md` | Operator UX under live pressure |
| 6 | `/audit-6-accessibility-copy` | `06-accessibility-copy.md` | Keyboard, contrast, focus, PT/EN copy |
| 7 | `/audit-7-testing` | `07-testing.md` | Test gaps and a test plan for the critical paths |
| 8 | `/audit-8-synthesis` | `08-backlog.md` | Deduplicated, prioritized fix backlog |

All commands accept an optional scope, e.g. `/audit-5-ux bible panel only`.

## After the audit
Fix from `08-backlog.md` in order. When a finding is fixed, set its Status in `FINDINGS.md` to `Fixed (<commit>)`. Re-run a single pass to verify.
