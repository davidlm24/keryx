# KERYX audit — consolidated backlog (2026-11-26)

Scope asked by the owner: feature usability and usefulness, incomplete features or options, UI/UX inconsistencies and bad workflows, performance. Code at master `8ca3ca6d` (0.2.34 plus the musicians' notes).

How it was done: five read-only passes over the code (`03-functionality-flows.md`, `03-functionality-inventory.md`, `04-performance.md`, `05-ux-console.md`, `05-ux-surfaces.md`), a walkthrough of the running UI in the browser preview at 1366×768, and a re-read of the code behind every P1 before it was kept. Accessibility and testing (passes 6 and 7) were not run. Nothing was changed outside `audit/`.

## Executive summary

| Area | Verdict | Why |
|---|---|---|
| Architecture | Good | One live state, the lock enforced in one place, crash recovery. Passes 1–2 stand; `ARCH-002` looks fixed (outputs wait hidden since 16/10) and the register should say so. |
| Functionality | Good, with one weak spot | 44 of 49 features are complete, none is a stub. The weak spot is media on air: there is no failure path for a video that will not play. |
| Incomplete features | Few | Screen designs and "Recebe" rules do not sync between computers; a handful of fields are written and never shown; the live Setlist lacks two actions the planner has. |
| Performance | Needs work (console only) | The outputs are lean. The console re-renders as one tree on every live change and does work that grows with the library. |
| UX, live console | Needs work | The core loops are short, but there are traps around the Prévia, Esc and the keyboard, and the default layout under 1400 px hides the Painel. |
| UX, other windows | Good, uneven at the seams | Each page is well built; save, confirm and picker behaviour differ from page to page. |
| Usefulness | Mostly earned | The live core, the Palco, the phone and the sync are used every service. Several elaborate features have no evidence of use (see "Usefulness"). |

The three things to fix first:

1. **Esc and Desfazer traps** (`UX-004`, `UX-005`, `FUNC-010`): two Escs from a search field end the projection, and a pedido toast removes the Desfazer.
2. **Wrong slide after an edit on air** (`FUNC-001`), and the Prévia traps around "slide no ar" (`UX-001`, `UX-002`).
3. **Media that fails in silence** (`FUNC-002`, `FUNC-003`): YouTube offline and a video Chromium cannot decode both give a black screen with no message.

Totals after review: 78 new findings (7 P1, 36 P2, 35 P3) and one merged duplicate; no P0. The P1s are `FUNC-001`, `FUNC-002`, `FUNC-003`, `PERF-001`, `UX-002`, `UX-004` and `UX-007`.

## Root causes

1. **The Prévia is one slot doing three jobs**: the next item, another slide of the item on air, and a theme's example. Each job overwrites the others, and one of them (`airSlide`) goes stale when the air changes. Behind `UX-001`, `UX-002`, `UX-008`, `UX-020`, `UX-023`.
2. **Key handling depends on where the focus is and on state captured at render time.** One Esc means "leave the field", the next means "end the projection"; B and L are dropped while a popover is open; keys typed before the search mounts go to the live keys. Behind `UX-003`, `UX-004`, `UX-011`, `UX-015`, `UX-017`, `UX-022`.
3. **The console is one React tree with no memoisation, and any row write refetches its whole table.** The work per render grows with the library. Behind `PERF-001` to `PERF-004`, `PERF-008`, `PERF-017`.
4. **Media playback has a happy path only.** No `error` listener on `<video>`, a YouTube loader that never rejects, picture and sound in separately started elements, an "ended" report with no identity. Behind `FUNC-002` to `FUNC-005`, `FUNC-011`.
5. **Pages grew one at a time.** Each has its own save model, confirm style and pickers. Behind `UX-101` to `UX-105`, `UX-111`, `UX-112`, `UX-114`.
6. **The default layout under 1400 px predates the Painel's role.** The medium tier was set on 14/10; Avisos, Pedidos and Chat moved into the Painel later. Behind `UX-007`, `UX-019`.

## Measured

- **Biblioteca, per console render** (`audit/tmp/bench-library.mjs`, this development PC, synthetic songs with chords): building a stage for every row costs 23.5 ms at 300 songs, 72 ms at 1,000, 192 ms at 3,000. The same work runs on every slide change and every volume step. Multiply by 3 to 4 for a dual-core laptop.
- **Biblioteca search, per keystroke**: 18 ms at 300 songs, 57 ms at 1,000, 200 ms at 3,000. With an index built once per song list: under 1 ms.
- **Search opening** (`/`): 80 ms on first open and about 18 ms after, in the dev build on this PC. During that time the live keys still act (`UX-022`).
- **Bundle** (from `dist/`): each output loads 395–398 kB of JS against a 405 kB budget; the console loads 1.70 MB, of which one 1.1 MB chunk holds every page of the window; one 395 kB stylesheet goes to every output and network screen.

Not measured: anything in the real Electron app (slide relay delay, memory over three hours, lip sync). `04-performance.md` has the plan and two scripts ready (`audit/tmp/trace-slide.cjs`, the existing soak).

## Findings added in the synthesis

### UX-022 — Keys typed right after "/" reach the live keys until the search mounts
- Severity: P2
- Effort: S
- Confidence: Medium (mechanism read in code and seen in the preview; the timing on a slow PC is not measured)
- Location: src/pages/Console.jsx:931 (`if (open) return`), :962 (`setOpen("palette")`), :972 (the handler is re-registered only after the render)
- Evidence: the key handler reads `open` from the render it was created in. After "/", the old handler stays until React commits, so the next keys are still live keys. In the preview, seven characters sent right after "/" never reached the field. First open took 80 ms on a fast PC.
- Live-service impact: on a slow laptop, typing "/b…", "/l…" or "/c…" fast can toggle Tela preta, the Logo or Limpar in front of the congregation instead of searching for "Bondade", "Lugar" or "Cristo".
- Fix: keep `open` in a ref that `setOpen` updates synchronously and read the ref in the handler; the same for `ctxMenu`.

### UX-023 — A direct send wipes another item prepared in the Prévia
- Severity: P2
- Effort: S
- Confidence: High (seen in the preview; code read)
- Location: src/components/console/useConsole.js:383 (`clearsPrev = !keepPrev || prev?.id === stage.id`)
- Evidence: with a song prepared in the Prévia, sending "jo 3 16" on air from the search with Ctrl+Enter left the Prévia empty. Only the phone, the Setlist footer and Autoplay pass `keepPrev`.
- Live-service impact: the pastor asks for a verse while the next song is prepared; after the verse the operator has to find and prepare the song again.
- Fix: clear the Prévia only when the stage sent is the one in it; every other send keeps it.

### UX-024 — Planejar o culto shows clock times nobody planned
- Severity: P3
- Effort: S
- Confidence: Medium (the owner said on 12/10 that the church plans order only)
- Location: src/components/console/ServicePlanner.jsx:522; src/utils/servicePdfExport.js:50
- Evidence: every row shows a clock time and a duration, and the header says "termina às 19:22", computed from default durations. The top bar's forecast was made optional and off by default for the same reason.
- Live-service impact: none live; the PDF handed to the team carries invented times.
- Fix: show the times only when "Previsão do culto" is on, in the planner and in the PDF.

### UX-025 — Editor da tela, Palco, "No ar": hidden element's content behind the lyrics
- Severity: P3
- Effort: S
- Confidence: Medium (seen in the preview with a passage on air)
- Location: Editor da tela › Palco › Mostrar com › No ar (src/components/console/editor/ScreenEditor.jsx; the ghost classes of `LayoutRenderer`)
- Evidence: the "Com vídeo no ar" element, not shown in that state, still draws the projection's text dimmed under the Letra atual, so the canvas shows the same words twice, overlapping.
- Live-service impact: none live; the editor looks broken and the operator cannot judge the design.
- Fix: an element that is out by its rule draws its dashed outline and name only, never its content.

## Severity changes after review

| ID | Pass report | Here | Reason |
|---|---|---|---|
| FUNC-004 | P1 | P2 | The mechanism is real; the size of the offset is unknown until measured on the church PC. |
| FUNC-006 | P2 | P3 | Whether Esc should lift Tela preta is the owner's call; only the missing Desfazer is a defect. |
| PERF-002, PERF-003 | P1 | P2 | Felt only above a few hundred songs; the fixes are small, so they still go early. |
| UX-001 | P1 | P2 | Needs three steps in a row; the Prévia does show the slide that Enter will send. |
| UX-003, UX-005 | P1 | P2 | One extra Esc works around the first; the second needs a pedido to arrive inside the 8 seconds. |
| UX-006 | P1 | P2 | Friction, not risk. |
| UX-117 | P3 | merged | Same defect as UX-021. |

## Usefulness

There is no usage data, so this is judgment from the code, the owner's recorded notes and what a church of this size does on a Sunday. A local-only counter of which features are opened (kept on the computer, shown in Sobre, never sent) would replace the judgment with facts and is the cheapest way to decide what to simplify.

**Used every service, worth every hour spent**: Biblioteca, Setlist, Slides, Programa and Prévia; the Bíblia environment; the search; the Palco with chords and now notes; per-output "Recebe" rules; Esc with Desfazer; crash recovery; the sound engine; the phone's Controle.

**Useful, and specific to this church**: sync through the church's Google account; the Equipe's pedidos and chat, and the GERAR link; Marcar os tempos with the letra automática; YouTube download; Planejar o culto with the shared Setlist.

**Elaborate, with no evidence of use** (keep working, stop extending until someone asks):

| Feature | Why it is in doubt |
|---|---|
| Camadas overlays (five text overlays, six positions) | The owner's 28/10 review found only the Fundo layer was ever used. |
| Editar painéis: Exato percentages, typed weights, saved arrangements per width, panels in their own windows | A large, intricate system (`dock.js`) for a console that one or two people arrange once. |
| Fundos gerados: twenty loops, colour ramps, audio-reactive | Pleasant; nobody asked for more than a few looks. |
| Escola bíblica activities (quiz, blanks, memorise) | A second product inside the app; unknown whether a class uses it. |
| Exportar vídeo com a letra | One-off use at most. |
| Multiview of 2 and 6 outputs | 1 and 4 cover a two- or three-screen church. |
| Planner fields Tipo, Local, Status, clock times | The church plans order only (`UX-024`). |
| Relatórios and CCLI | `Song.copyright` is imported and never shown, so the report cannot be complete (`FUNC-105`). |

**Gaps against Holyrics and ProPresenter** (not defects; "?" = not sure of the competitor):

| Capability | Holyrics | ProPresenter | KERYX | Priority here |
|---|---|---|---|---|
| A key per song part (jump to the chorus) | Yes | Yes | Absent (`UX-018`) | High |
| Song arrangement (order of parts per service, without editing the lyrics) | Partial ? | Yes | Absent: the chorus is repeated in the text | Medium |
| Insert an item at a chosen place in the list | Yes | Yes | Lands at the end (`UX-006`) | High |
| Cross-chapter and comma Bible references | Yes | Yes | Cut silently (`FUNC-007`) | Medium |
| PowerPoint | Yes | Yes | PDF only, by the owner's decision | Low |
| MIDI, API or scripting | Yes | Yes | Absent | Low |
| NDI or key output | ? | Yes | OBS lower third only | Low |
| Second language under each line | ? | Yes | Bible only (2ª versão) | Low unless services are bilingual |

**Where KERYX is already ahead, and could go further with what exists**: the phone for the worship team (pedidos, chat, the Cifra); the notes and chords on the Palco; one Setlist for every computer with no server; a console that tells which screen will not show the item before it is sent.

## Incomplete features and options

| What | State | ID |
|---|---|---|
| Screen designs and "Recebe" rules between the church's computers | Not synced; the code comment waits for work that has since landed | FUNC-102 |
| Importing a cifra or ChordPro file | Chords and part names are dropped, though the editor's own "Importar cifra" keeps them | FUNC-009 |
| Desativar and Duplicar on a live Setlist item | Only the planner has them | FUNC-103 |
| Duplicar for songs, avisos, media, Escola materials | Missing; themes, backgrounds and cultos have it | FUNC-104 |
| `Song.copyright`, play count, last played | Stored, never shown | FUNC-105 |
| "Modelo do KERYX" default template; `Service.templateId` | A reader with no writer; a writer with no reader | FUNC-106 |
| Help text | Primeiros passos step 2 and Atalhos describe the app of a month ago | UX-107, UX-108, UX-010 |
| Checks only real hardware can close | OBS transparency, ARA fallback, two-PC Drive, real phones | FUNC-108 |
| shadcn UI kit and about 35 npm packages | Shipped, imported by nothing | FUNC-101 |

## Backlog

Sized for one person working evenings. "Done when" is a check someone can run.

### M0 — before the next service (all small, all reduce live risk)

| # | ID | Change | Done when |
|---|---|---|---|
| 1 | UX-004 | After an Esc that leaves a field, ignore Esc for about a second, or end only on an Esc pressed with no field focused in the last second | Two fast Escs from the Biblioteca search leave the song on air |
| 2 | UX-005, FUNC-010 | A pedido or chat toast queues behind an action toast; Desfazer is disarmed when something new goes on air | With the Desfazer toast up, a new pedido does not remove it; Ctrl+Z after a new send does nothing |
| 3 | FUNC-001 | `songSaved` sends the index of the slide whose text is on screen; `content.update` falls back to the old number only when it cannot be found | Splitting slide 1 of a song on slide 3 leaves the same words on the projector |
| 4 | UX-001, UX-002, UX-023 | Drop an "airSlide" Prévia when the air's item changes; a double click in No ar sends without touching the Prévia; a direct send keeps a different prepared item | The three scenarios in the findings leave the prepared song in place |
| 5 | UX-003, UX-022 | Tela preta and Logo pass while a popover is open; the handler reads `open` from a ref | B works with Saídas open; "/b" typed fast searches for "b" |
| 6 | FUNC-002 | The YouTube loader rejects on `error` and after a timeout, clears its cached promise, and the item leaves the air through the existing refusal path | Offline, a YouTube item says why on the console and can be retried without a reload |

### M1 — stabilise (two to four weeks)

| # | ID | Change | Done when |
|---|---|---|---|
| 7 | FUNC-003 | An `error` listener on file videos takes the item off with a message; the import door refuses containers Chromium cannot play | An `.avi` is refused on import; a broken file on air shows a toast, not a black screen |
| 8 | PERF-001, PERF-002 | Build a row's drag stage on drag start, not on render; index title, artist and stripped lyrics once per song list; memoise the Biblioteca | The bench drops under 2 ms at 1,000 songs; typing in the search stays smooth |
| 9 | PERF-003, PERF-008 | Patch the query cache with the row the `subscribe` event already carries instead of refetching the table; move the play count out of `Song`; run backfills only with nothing on air | Sending a song causes no `Song.list`; no backfill write during a service |
| 10 | FUNC-004, FUNC-005 | Measure the picture-to-sound offset on the church PC; let the muted picture follow the sound with the rate nudge network screens already use; "ended" carries the item's url and start | Offset under 40 ms after ten seconds; a slow window cannot end another window's video |
| 11 | UX-016, FUNC-011 | Auto-install waits while an aviso, the Logo or a timer is on screen; the sound engine's last crash rings the bell | Reviewed against `updates.js`; a notification after the fifth crash |
| 12 | FUNC-101, PERF-012 | Delete `src/components/ui`, `src/lib/utils.js` and the packages only they use | `npm test`, lint and build pass; the installer and the stylesheet are smaller |
| 13 | PERF-007 | Backups leave installed Bible text out (it can be downloaded again) or copy it only when it changed | A backup with four editions installed is a few MB |
| 14 | register | Mark `ARCH-002` fixed after checking it against the hidden-waiting behaviour; re-check `ARCH-003`, `TEST-001` | `FINDINGS.md` matches the code |

### M2 — operator experience (one to two months; each visual change needs its mockup first)

| # | ID | Change |
|---|---|---|
| 15 | UX-007, UX-019 | A medium-tier default that keeps the Painel on screen as a tab beside the Setlist, and a taller Setlist; decide from the church PC's real width |
| 16 | UX-006, FUNC-103 | Add after the item in the Prévia or on air everywhere; Alt+↑/↓ to move; Desativar and Duplicar in the live Setlist |
| 17 | UX-018 | Keys for the parts of the song on air (1–9, or R for the chorus), shown on the cards |
| 18 | UX-008, FUNC-008 | "Voltar ao anterior" as one key; Desfazer puts a video back at its second |
| 19 | UX-013, UX-015, UX-017, UX-011 | The Biblioteca search finishes from the keyboard; a key to switch environment; row keys work after a click; the key list says what L and C do in the Bíblia |
| 20 | UX-101 to UX-105, UX-111, UX-112, UX-114 | One confirm, one colour picker, one background picker, one rename, one search word; each page says whether it saves by itself |
| 21 | UX-106, UX-107, UX-108, UX-010, UX-115, UX-116 | Conexões holds every connection; help and first steps rewritten for the shared Setlist |
| 22 | FUNC-007, FUNC-009 | Cross-chapter and comma references; chords kept on file import |
| 23 | UX-009, UX-014, UX-012 | Undo for a theme click; a toast with Desfazer when a culto is activated; decide what the arrows do under a video |

### M3 — parity and reach

| # | ID | Change |
|---|---|---|
| 24 | FUNC-102 | Sync screen designs and rules, keeping placement per computer |
| 25 | — | Song arrangement per service, if the band asks for it |
| 26 | — | Local feature counters, then prune or simplify what nobody opens |
| 27 | PERF-004, PERF-006, PERF-011 | Slimmer live broadcasts, detached windows in their own process, window pages as lazy chunks |

### Later or not worth it

- `PERF-013`, `PERF-014`, `PERF-015`, `PERF-016`: real but unfelt; fix when touching those files.
- `UX-109`, `UX-110`: copy slips; batch them into any copy PR.
- `FUNC-105` to `FUNC-107`: tidy when the entity folder is renamed (`ARCH-009`).
- PowerPoint, MIDI, NDI: no demand at this church.

## Refactors

Worth it: the query-cache patch (item 9) removes a whole class of refetches for every table; splitting the Prévia's three jobs into explicit fields (`next`, `airSlide`) removes root cause 1 for good; a single key dispatcher that reads refs removes root cause 2.

Not worth it now: virtualising every list (memoising the Biblioteca gets most of the gain), breaking up `Console.jsx` for its own sake, replacing the dock model.

## Questions for the owner

1. How many songs and media files does the church have, and what is the church PC's screen width and Windows scale? These set the priority of items 8, 9 and 15.
2. Should Esc lift Tela preta and the Logo (`FUNC-006`)?
3. Which of the "no evidence of use" features does the church use?
4. Is the 1366-wide laptop a real case, or is the console always on a larger monitor?
5. Has anyone noticed sound and picture out of step since the sound engine arrived (08/11)?
6. Can `src/components/ui` go, or is it kept for a future screen?
7. Was Space as Tocar/Pausar weighed against volunteers who press Space to advance?
