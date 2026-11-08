---
description: Keryx audit pass 5 — operator UX under live-service pressure
---
Read `audit/AUDIT_CONTEXT.md`, `audit/00-recon.md` and `audit/03-functionality.md` first. Follow all rules. Use design-critique, web-design-guidelines and emil-design-eng skills if available.

Optional scope from user: $ARGUMENTS
ID prefix: UX

## Inputs
Preferred: screenshots. If you can launch the app and capture screenshots via a temporary script in `audit/tmp/` without changing tracked files, ask me first and then do it. Otherwise, audit from the UI code and ask me for screenshots of: main operator view (idle and live), song editor, Bible panel, schedule, media panel, settings, output window, stage display.

## Persona
A volunteer with 3 weeks of experience, operating alone during a service, with a pastor who changes the order on the fly. Evaluate every screen through this persona.

## Evaluate
1. **Live vs preview clarity** — Is it instantly obvious what the congregation sees right now? Can the operator confuse preview with live? Is there a persistent live indicator and output thumbnail?
2. **Panic controls** — Blackout, clear text, clear all, logo: reachable in one keystroke, visible, undoable. Time to recover from a wrong click.
3. **Speed of the core loop** — Keystrokes/clicks to: find a song and go live; find a Bible passage and go live; jump to the chorus; insert an unplanned item into the schedule. Report counts and propose reductions.
4. **Keyboard model** — Complete, consistent, discoverable (cheat sheet, tooltips)? Conflicts? Does focus ever get trapped in a text field so arrow keys stop advancing slides?
5. **Information hierarchy** — What gets the most visual weight vs what matters most during a service. Density for dim rooms; dark theme quality.
6. **Feedback & state** — Loading, saving, errors, missing media, disconnected output: is every state communicated without modal dialogs blocking the live flow?
7. **Destructive actions** — Delete song/schedule item: confirmation or undo? Any modal that can pop over the operator during a service (update prompts, crash dialogs)?
8. **Consistency** — Spacing, typography, components, icons, terminology across screens.
9. **Polish** — Transitions, hover/active states, perceived quality vs ProPresenter.

For each screen, give a short critique (what works, what fails), then the findings. Finish with "Top 5 changes with the biggest operator impact".

Write `audit/05-ux.md`, append UX rows, print the summary and stop.
