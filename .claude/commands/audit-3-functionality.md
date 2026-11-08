---
description: Keryx audit pass 3 — feature correctness, live-service flows, and parity vs Holyrics/ProPresenter
---
Read `audit/AUDIT_CONTEXT.md`, `audit/00-recon.md` and `audit/01-architecture.md` first. Follow all rules. Use the write-spec / competitive-brief approach if those skills are available.

Optional scope from user: $ARGUMENTS
ID prefix: FUNC

## Part A — Reverse spec
For each feature marked Present/Partial in recon, write 2–4 lines: what it does today, inputs, outputs, and its edge-case behaviour as implemented (cite code). This becomes `audit/03-functionality.md` section "Current behaviour spec".

## Part B — Critical live-service flows
Trace each flow through the code end to end and report where it can fail:
1. Open service → load schedule → go live with the first item.
2. Song: select → slides generated → next/previous → jump to chorus/bridge (by key) → blackout → clear text but keep background.
3. Bible: type a reference in PT and EN formats ("Jo 3:16-18", "1 Co 13", "John 3:16", "Sl 23"), multi-verse, cross-chapter ranges, two versions side by side, long verses splitting across slides.
4. Media: play video on output with audio, loop background video behind lyrics, missing/moved media file, unsupported codec.
5. Last-minute edit: fix a typo in a song while it is live — does the output update correctly and safely?
6. Display change: projector unplugged and replugged, resolution change, output on wrong screen.
7. Crash or forced quit mid-service → relaunch → how fast can the operator get back to the same slide?
8. Import a song/library from Holyrics, ProPresenter, OpenLP or ChordPro (whichever exist).

For each flow: steps, code path (file:line), failure points, and findings.

## Part C — Edge cases & data correctness
Empty states, very long titles/lines, special characters and accents (ç, ã, õ, é), RTL or emoji, duplicate song names, huge libraries (5,000+ songs), time zones in schedules, unsaved-changes handling.

## Part D — Parity matrix
Table: Capability | Holyrics | ProPresenter | Keryx (Present/Partial/Absent) | Priority for a Portuguese-speaking church (High/Med/Low). Base competitor columns on widely known capabilities; mark uncertain ones with "?". Missing capabilities are not findings unless they cause failures; list them as "Gaps" with a priority.

End with "Differentiation opportunities": 3–5 things Keryx could do better than both, grounded in what the code already supports.

Write `audit/03-functionality.md`, append FUNC rows to `audit/FINDINGS.md`, print the summary and stop.
