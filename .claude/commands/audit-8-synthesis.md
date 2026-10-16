---
description: Keryx audit pass 8 — consolidate all findings into one prioritized backlog
---
Read `audit/AUDIT_CONTEXT.md`, every report `audit/00…07-*.md`, and `audit/FINDINGS.md`. Do not re-audit the code except to resolve contradictions between reports.

Optional scope from user: $ARGUMENTS

## Steps
1. **Deduplicate** — merge findings that share a root cause (e.g. a missing single source of truth for live state may appear as ARCH, FUNC and UX). Keep the lowest ID as primary and list the merged IDs.
2. **Root causes** — identify the 3–5 systemic causes behind most findings.
3. **Prioritise** by: severity first, then live-service risk, then effort (quick wins with high impact rise). Fixes that unblock other fixes go earlier.
4. **Group into milestones** sized for a solo developer working evenings/weekends:
   - **M0 — Before next Sunday**: P0s and S-effort P1s that reduce live risk now.
   - **M1 — Stabilise (2–4 weeks)**: remaining P1s, data safety, crash recovery, critical tests.
   - **M2 — Operator experience (1–2 months)**: UX, keyboard model, accessibility, copy.
   - **M3 — Parity & differentiation**: functionality gaps and differentiators from pass 3.
   - **Later / won't fix**: with a one-line reason.
5. **Tech-debt summary** — the refactors that are worth it, and the ones that are not (say why).

## Output `audit/08-backlog.md`
- Executive summary (10 lines max): overall health verdict per area (Architecture, Security, Functionality, Performance, UX, Accessibility, Testing) rated Good / Needs work / At risk, plus the 3 things to fix first.
- Root causes.
- Milestone tables: Order | ID(s) | Title | Severity | Effort | Depends on | Done-when (verifiable acceptance criterion).
- Contradictions between reports and how you resolved them.

Update `audit/FINDINGS.md`: mark merged duplicates `Merged → <ID>`. Print the executive summary and stop.
