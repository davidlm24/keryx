# KERYX presenter UX research — handoff for Claude

Date: 2026-10-09  
Scope: operator console, Bible environment, service flow, and responsive layout. This is a research and design brief, not an implementation request.

## Goal

Make KERYX complete enough for worship services and Bible school while remaining calm and learnable for a volunteer. The design should feel specific to KERYX rather than like a generic dashboard or a smaller copy of ProPresenter.

## Evidence and limits

- KERYX was inspected in the user's two 1521 × 893 screenshots and in the development browser preview at approximately 1000 × 900. The browser preview explicitly uses sample data and has no real outputs; it is not proof of desktop output behavior.
- Competitor findings below come from official product sites and documentation. Feature descriptions establish capabilities and documented arrangements, not measured usability or reliability. The ProPresenter guide cited here describes ProPresenter 7 through 7.12; verify behavior against a current installation before treating it as a current-version specification.
- The project already has a design system in `docs/design-system/`. Use its tokens, components, color meanings, and pt-BR vocabulary as the starting point. The repo's `CLAUDE.md` and `docs/design-system.md` record later user decisions that supersede older Claude artboards.

## What the competitors establish

| Product | Observed official pattern | KERYX implication |
| --- | --- | --- |
| ProPresenter | The documented Show view gives the central slide area the most space, places Library/Playlists on the left, and places output Preview/Clear near the top right. Bible lookup accepts references and keyword search; passages can become a presentation or playlist item. Audience and Stage outputs can have different layouts, including current/next slide and notes on Stage. | Keep the running service, slide controls, output image, and output health in the operator's immediate field of view. Preserve a fast path from Bible lookup to an item in the service. Do not expose every editor and production feature in the live workspace. |
| Holyrics | Its service playlist can mix lyrics, Bible verses, text, media, announcements, and countdowns, with section headers, durations, and projected times. It separates content from themes and documents library, slides, preview/player, and playlist/theme regions in its main window. Stage returns can have different content and formatting. | A mixed-content Setlist is core, not an optional song queue. Keep content and presentation style separate. KERYX's current wide layout is already close to Holyrics' documented four-region arrangement; its opportunity is a clearer hierarchy and better narrow-window behavior. |
| Spresenter | Its official site emphasizes real-time preview before Live, search across lyrics/Bible, independent layers, and multiple destinations such as main screen, stage, and livestream. It also advertises advanced production tools including automation and edge blending. | Make preview and destination state excellent. Advanced routing and production tools can exist without occupying the default live view. Do not treat a marketing feature list as a reason to copy every capability. |

Official sources:

- ProPresenter: [interface](https://learn.renewedvision.com/propresenter/interface), [Bible workflow](https://learn.renewedvision.com/propresenter/other-features), [screen configuration](https://learn.renewedvision.com/propresenter/screen-configuration).
- Holyrics: [feature reference](https://holyrics.com.br/tips/features.html), [Bible and worship features](https://holyrics.com.br/software.php).
- Spresenter: [product overview](https://spresenter.com/en).

## KERYX findings tied to the inspected UI

1. **At wide desktop size, the hierarchy is split across four columns.** Library, Slides, Program, and Layers/Setlist compete for attention. The Program image is prominent, but Preview and `Enviar ao ar` are much lower, separated from Program by unused space. The persistent Layers editor takes space from the service order during live operation. The idle media transport remains visible even when nothing is playing.
2. **At the browser side-panel width, the live workflow falls below the fold.** Library and Slides stack above Program and Preview. A volunteer must scroll to see what is on air and what can be sent next. This is the highest-priority layout issue. The desktop Electron window may have a different minimum size; verify it separately.
3. **The Bible layout improved between the screenshot and the inspected preview.** The preview uses a selected book, chapters, Recents, Favorites, and Notes rather than showing the whole book grid. However, the large `No ar agora` monitor pushes the selected passage and send controls down the page at the side-panel width.
4. **State labels need to agree.** The preview shows `Ao vivo` alongside `Saídas · 0 conectadas`, while the footer can show `AGORA —` even with a song in Program. The development banner explains the absence of real outputs, but a real operator still needs a clear difference between outputs armed, connected, and receiving content. Treat the apparent mismatch as a UI question to verify in the desktop app, not a confirmed output-engine defect.
5. **Bible text must carry trustworthy provenance.** Development sample verses are visibly labelled under an NVI-selected view. The preview banner says data is exemplary, but this combination must never be mistaken for licensed NVI text in a real service. Keep translation identity, installed/online status, reference, and copyright requirements attached to real Bible content.
6. **Projection shortcuts are inconsistent across the observed surfaces.** Console send advertises `Ctrl+Enter`; slide and Bible help advertise Enter and double-click. `CLAUDE.md` records deliberate user decisions about Enter, arrows, and double-click. Audit focus and on-air behavior in the actual desktop app before proposing changes. Do not silently replace the chosen workflow with a mandatory two-step mode.

## Recommended product decisions

### P0 — visible live control at every supported window size

At approximately 1000 × 900, the operator should see Program, Preview, `Enviar ao ar`, current/next Setlist item, and output health without vertical or horizontal scrolling. Compress or collapse Library, slide navigation, and secondary controls first. The two monitors may become smaller, but their content and labels must remain legible. Test the actual Electron minimum size and the side-panel preview separately.

Keep a fixed relationship between the three live elements: **Program → Preview → Send**. They should be adjacent enough that the operator can compare them in one glance. Avoid a large empty gap between the Program and Preview areas. Keep emergency controls visible and distinct.

### P0 — make output state explicit

Distinguish `Ao vivo`/armed, connected destinations, and the content actually on each destination. A green connected marker must not visually imply success beside `0 conectadas`. The output popover should answer: destination name, connection state, current content, and recovery action. A pre-service check can remain the existing `Verificar` overlay from `Saídas`; do not recreate the rejected three-step top-level workflow.

### P1 — promote the mixed-content Setlist

The default live navigation should prioritize the service order over typography or layer editing. Include songs, Scripture, media, announcements, countdowns, and Bible-school materials in one ordered sequence, with sections and durations where useful. Existing Setlist terminology is a settled local UI choice. Searchable Library access must remain immediate for unexpected requests.

### P1 — simplify Bible projection without reducing capability

Make reference search, keyword search, Recents, and the selected passage the main Bible path. Keep the book/chapter browser available as a secondary path. Let a passage be prepared for immediate projection or added to the Setlist. In narrow layouts, use a compact current-output monitor so the passage, selected verses, and action are visible together. Show a clear install/change-version action when a translation is unavailable. Do not substitute sample or AI-generated text for an unavailable edition.

### P1 — contextual controls and themes

Show the media transport when media is active or selected; otherwise reclaim its space. Keep Layers and theme editing in a contextual panel or dedicated editor rather than permanently prioritizing them during a service. Preserve the existing content/theme separation and KERYX token meanings. The projection theme can be richer than the deliberately quiet console.

### P2 — Bible-school and stage presets

Use the existing Escola bíblica model as a lesson Setlist: passages, teaching slides, images/video, questions, answer reveal, discussion timer, and teacher notes that do not appear on the audience screen. Provide simple Audience, Stage, and Stream presets. Stage should be able to show current/next text, time, and notes. Add advanced per-destination controls only after the basic presets are clear.

### Defer from the default UX

Do not place timecode, OSC automation, edge blending, complex layer compositing, or detailed video mapping in the ordinary live view. Those are legitimate advanced capabilities in competitor products, but they do not define KERYX's first-use experience.

## Existing decisions Claude must preserve while exploring changes

- Desktop-first, local SQLite, offline core; the browser is a development preview, not the deployed operator product.
- pt-BR user-facing copy and the current KERYX design system.
- One console, always live; Ensaio is the sandbox and Verificar is an overlay from Saídas. Do not revive Preparar/Verificar/Apresentar as three permanent top-level steps.
- `Setlist` is the application term. Older canvas documentation also says `Roteiro`; follow the current implementation and `CLAUDE.md`.
- Enter, arrows, and double-click-to-project are documented as user-selected behaviors. Research suggests making the live boundary easier to perceive, but any change to these shortcuts is a product decision, not an incidental cleanup.
- Real Bible editions have copyright and installation requirements. The project routes Bible text through `src/lib/bibleText.js`.

## Review criteria for a proposed redesign

1. Show a desktop state and a roughly 1000 × 900 state, with Program, Preview, Send, current/next item, and outputs visible in both.
2. Demonstrate a normal song advance, an unexpected Scripture request, a video item, and a Bible-school question/answer item. Identify what stays visible and what changes contextually.
3. Mark every action that can change an audience output and show its keyboard and mouse trigger. Check that the focus model prevents accidental projection from text entry.
4. Show what the operator sees when no output is connected, when one destination disconnects mid-service, and when a Bible edition is unavailable.
5. Use existing KERYX tokens and components first. If a token or layout rule prevents the P0 visibility goal, propose a specific change to the design system rather than adding unrelated styles.

**Design thesis:** KERYX can be complete through its content model and output system while keeping the default console focused on the next live decision. Its distinctiveness should come from a calm, dependable service rhythm, not more panels or decorative effects.
