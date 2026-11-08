---
description: Keryx audit pass 6 — keyboard accessibility, contrast, focus, and PT/EN copy
---
Read `audit/AUDIT_CONTEXT.md` and `audit/05-ux.md` first. Follow all rules. Use accessibility-review and ux-copy skills if available.

Optional scope from user: $ARGUMENTS
ID prefixes: A11Y (accessibility), COPY (text)

## Accessibility (WCAG 2.1 AA as the baseline, adapted to an operator tool)
- Contrast of text and controls in operator UI, both themes, including disabled/secondary text (compute ratios from the actual color tokens; cite them).
- Projection defaults: default themes legible from the back of a room (font size, contrast, text shadow/outline over video backgrounds).
- Full keyboard operability; visible focus indicators; logical tab order; no keyboard traps.
- Semantic roles/labels on icon-only buttons; accessible names for screen readers.
- Hit target sizes for touch-screen operators and the remote control.
- Motion: can heavy transitions be reduced (`prefers-reduced-motion`)?
- Color-only signals (e.g. red = live) — is there a second cue?

## Copy & i18n
- Inventory of UI strings: hardcoded vs in i18n files. Missing PT or EN translations.
- Terminology consistency (e.g. "culto/serviço/evento", "slide/diapositivo", "letra/lyrics").
- Error messages: say what happened and what to do, in plain language, no stack traces.
- Empty states and onboarding: do they tell a new volunteer what to do next?
- Labels for panic controls and destructive actions: unambiguous.
- Portuguese quality: European vs Brazilian consistency (pick one or support both deliberately), accents, capitalisation.

Provide before/after rewrites for the 10 worst strings.

Write `audit/06-accessibility-copy.md`, append A11Y and COPY rows, print the summary and stop.
