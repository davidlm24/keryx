# KERYX UX addendum for Claude — fonts, hierarchy, and discoverability

Date: 2026-10-09  
Companion: [presenter UX research and handoff](presenter-ux-research-2026-10-09.md).

## Purpose

Use this addendum when reviewing or proposing changes to the current KERYX console and design system. The goal is a sleek, modern, distinctive interface that remains calm and fast for a volunteer running a live service. These are additional findings, not authorization to replace established workflows or implement a redesign without a visual review.

## 1. Make type rendering dependable offline

**Evidence:** `docs/design-system/components/bundle.css` imports Geist from Google Fonts. `src/index.css` also imports Montserrat from Google Fonts. No `.woff`, `.woff2`, `.ttf`, or `.otf` files are tracked in the repository. `src/components/console/VerifyView.jsx` checks whether Geist loaded and warns when it did not. KERYX is an offline-first desktop app, and audience/stage screens can render in other windows or browsers on the local network.

**Risk:** The operator's Program/Preview and an audience or network screen may use different fallback fonts. Different glyph widths can change lyric and Bible line breaks. This is a fidelity and reliability issue, not merely a branding detail. The browser development preview cannot prove whether it happens in the installed desktop app.

**Recommendation:** Bundle a licensed font locally and serve the same font files to the console and every output, including LAN screens. If system fonts are preferred, make that an explicit cross-platform choice and test their wrapping. Avoid runtime dependence on Google Fonts for presentation-critical typography. Preserve the existing fallback as a recovery path.

**Acceptance:** With internet disabled and an empty font cache, compare the same long lyric and Bible passage in Program, Preview, an Electron audience window, and a LAN screen. Font identity and intended line breaks should agree. The pre-service check should report a missing required font with a clear recovery action.

## 2. Give live-critical information its own type hierarchy

**Evidence:** The design system limits ordinary console type to 11–14 px and describes 28 px controls and rows as the standard. In the current console, the service item, headings, toolbar labels, metadata, and action hints have little size separation. At a side-panel width, Program and Preview compete with long lists and large empty regions.

**Finding:** The restraint keeps the product from looking like a generic AI dashboard, but the near-uniform scale makes the live state harder to scan. It can feel bland despite the strong state-color system. The issue is visual priority, not a need for more accent colors, gradients, decorative cards, or animation.

**Recommendation:** Add a small number of semantic emphasis levels to the design system. Give the current item, prepared item, output failure, and immediate next action larger and more readable text than metadata. Reserve 11 px for secondary telemetry. Consider a comfortable default density and a compact option for experienced operators. Keep the current palette, type family, 4 px rhythm, and color meanings unless testing shows a specific need to change them.

**Acceptance:** At the installed app's supported desktop sizes and at about 1000 × 900 in the browser preview, a new operator can identify what is on air, what is prepared, what is next, and whether outputs are connected without reading the entire screen or scrolling. Check with realistic long Portuguese song names, Bible references, and service notes, not only short sample labels.

## 3. Reveal important interactions before the operator needs them

**Evidence:** The design system favors bare 16 px icons, tooltip-only explanations, and nearly invisible splitters. In the running browser, the Outputs button measured about 19 × 28 px and some collapse controls about 20 × 20 px; other icon controls have larger click areas. Those dimensions warrant a target-size and spacing audit, not an automatic compliance verdict. [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) sets a 24 × 24 CSS pixel minimum with defined exceptions.

**Recommendation:** Make critical actions and panel affordances understandable at rest. Keep the quiet icon language for secondary controls, but give live-impact actions visible names or grouping. Show a subtle splitter handle on hover and keyboard focus; provide a discoverable layout reset. Keep shortcuts in tooltips or a keyboard-help surface, while making their consequences clear beside the relevant action. Add a clear press/prepared/sent response so the operator knows what changed.

**Acceptance:** A volunteer unfamiliar with KERYX can find the Setlist, resize or restore panels, inspect outputs, and explain which actions change the audience screen without relying on someone to reveal tooltips. Pointer targets and spacing are checked against the actual rendered app.

## 4. Keep the design system aligned with the live product

**Evidence:** The design-system artifact and `docs/design-system/README.md` still contain `Roteiro`, a click-only-prepares rule, and older three-step navigation. The current app uses `Setlist`, one always-live console with Ensaio and a Verificar overlay, and deliberate double-click/Enter projection behaviors recorded in `CLAUDE.md`.

**Recommendation:** Mark old artboards as historical and update the canonical usage guidance and component examples to the current terminology and behavior. Do not silently change the user's chosen shortcut model while resolving the documentation. A focused usability test can assess whether its live boundary is sufficiently obvious.

**Acceptance:** A designer or developer reading the design system, `CLAUDE.md`, and the running UI encounters one consistent account of Setlist terminology, modes, click/double-click behavior, keyboard shortcuts, and output-state labels.

## Design direction in one sentence

Keep KERYX's restrained broadcast character, but make the live state unmistakable, the typography dependable offline, and the important interactions discoverable without turning the console into a larger or busier dashboard.
