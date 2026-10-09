# "Enviar ao ar" and the Ao vivo toggle — research

Date: 2026-10-09
Question (from the owner): do we need the "send to air" step at all, and the
**Ensaio | Ao vivo** toggle in the top bar? Other presenter apps do not seem
to have them; the slot might be better used for a service-time counter.

Method: official vendor docs, help centres and manuals, read on the web.
Where a page could not be read, or a claim rests on a search snippet or a
forum, it says so. Nothing here has been tested in the products themselves.

## KERYX today (for reference)

- **Prévia and Programa.** A click on a song, slide, verse or Setlist item
  only *prepares* it in the Prévia. It goes on air with **Enter**, a
  **double click**, a drag onto the Programa, or **Enviar ao ar**
  (also Ctrl+Enter). ←/→ move the slide already on air.
- **Ensaio | Ao vivo.** In Ensaio the console works on a local copy and the
  real screens keep what was on air. Ao vivo arms the outputs (with a
  confirmation). Tela preta, Logo, Limpar and Encerrar are separate.

## Findings by product

### ProPresenter 7 (Renewed Vision) — well sourced
- **Click:** clicking a slide "will send it to the screen instantly"; you
  click a slide "to display it live".
- **Preview/program:** none. The top-right "Preview" shows "the content that
  is playing live" (a program monitor, not a staging area). No Take button.
- **Output switch:** toolbar buttons "toggle on/off system screens setup as
  audience or stage screens" (SDI/NDI stay on); per-layer Clear and "clear
  group". **Stage Only** (Ctrl/Cmd+0) sends slides only to stage screens,
  with a red indicator — the nearest thing to a rehearsal mode.
- **Timing:** a Timers panel (Countdown, Count Down to Time, Elapsed Time,
  with overrun), shown on stage screens through linked text. No fixed service
  clock in the operator UI is described.

### Holyrics (Brazil) — official docs are thin
- **Click:** the main window shows a "pré-visualização do parágrafo/slide
  selecionado". A presentation starts with F5 / Shift+F5, or a **double
  click** starts it from that slide. What a single click does once a
  presentation is running is not stated.
- **Output switch:** none documented. "Simular projeção" lets you practise as
  if there were two screens. Esc ends; Shift+F8 ends and shows the wallpaper.
- **Safety detail:** Ctrl+←/→ changes the projected slide only when Ctrl is
  released.
- **Timing:** countdown on the projection (before the service), the time full
  screen or as an alert, stopwatch/countdown in the Communication panel. No
  service-elapsed counter is stated.

### EasyWorship 7 — well sourced
- **Click:** a selection appears in the Preview area, whose arrows "don't
  change the live output". Double click in Preview sends it live.
- **Preview/program:** yes, by default, with a **Go Live** button; also
  layouts "Live with Resource Preview" and "Preview and Live Combined".
- **Output switch:** a flashing **LIVE** button turns live output on and off
  ("Show Live screen on startup" option); Black, Logo, Clear.
- **Timing:** none in the pages read.

### FreeShow — partly sourced
- **Click:** sends the slide to the output (search snippet only; the page
  body could not be fetched).
- **Preview/program:** none; output previews show the output.
- **Output switch:** Present (Ctrl/Cmd+O); a **padlock** locks all outputs
  ("outputs will not change until it is unlocked"), per output too; Clear per
  layer, Clear all, Restore Output.
- **Timing:** countdown timers, a slide-timer layer.

### OpenLP — manual
- Separate **Preview** and **Live** panes, a Go Live button, and settings for
  "Preview items when clicked", "Double-click to send items straight to live",
  "Automatically preview next item", a blank-screen warning at startup. Stage
  view has a clock. No service timer is stated.

### MediaShout 7 — brief
- Each cue has a **Fire** button (or double click). "Edit on the Fly" (off by
  default) pushes edits live as you type. The live-service section could not
  be read.

### Proclaim (Faithlife) — brief (help centre returned 403; from snippets)
- An **On Air** button (red on, grey off). Going On Air starts the
  pre-service loop until a warm-up countdown timed to the **service start
  time**, then the Service section; a post-service loop runs until Off Air.
- While On Air a click on a slide goes live. **Edit mode** lets you browse and
  edit while the presentation continues.
- **Target Start Times** show expected times per section and warn when going
  On Air late. A forum user's countdown failed because they were not On Air —
  the failure mode of a master live toggle.

### OBS Studio "Studio Mode" — the conceptual origin
- Preview/Program with a Transition button is an **opt-in** mode; "transition
  on double click" is a setting, off by default (forum and commit log, not the
  official KB). Broadcast switching is a crew's mode, not a single operator's
  default.

## Summary

| | Click = live | Preview + "Go Live" | Master output switch | Service timing |
|---|---|---|---|---|
| ProPresenter 7 | yes | no | screens on/off; Stage Only | timers incl. elapsed |
| Holyrics | double click / F5 | preview of the selection | none documented | countdown, clock, stopwatch |
| EasyWorship 7 | in the Live area | **yes, default** | LIVE button | not stated |
| FreeShow | yes (snippet) | no | Present + output lock | countdowns |
| OpenLP | Live pane | **yes** | blank modes | stage clock |
| Proclaim | yes, once On Air | no (Edit mode) | **On Air** | **start time + target times** |

- **No product documents a sandbox like KERYX's Ensaio** (a local copy while
  the screens keep what was on air). The closest are Proclaim's Edit mode,
  FreeShow's output lock and ProPresenter's Stage Only.
- **A master live switch has a known failure:** forgetting to turn it on.
- **Staging new content is common** (EasyWorship, OpenLP, Holyrics), while
  ProPresenter and FreeShow project on click.
- **A service clock has precedent** in Proclaim (start time, target times).

## Options (brainstorm — opinion, not findings)

- **A. Keep as is.** Lowest risk of accidental projection; costs two steps per
  change, and Ao vivo can be forgotten.
- **B. Click = live by default, Prévia optional.** Fewest steps; highest risk
  (a stray click on a library row or a search result projects it). Reverses
  the 2026-10-07 decision.
- **C. Drop Ensaio | Ao vivo; the slot becomes a service clock.**
  "Culto 00:42:10 · termina ~11:30", ahead/behind from the Setlist durations.
  Rehearsal becomes a **"Travar telas"** lock in Saídas (FreeShow-style) or
  "Simular telas" without a projector (Holyrics-style).
- **D. Hybrid (the researcher's pick).** Within the item **already on air**, a
  click on one of its slides goes live (ProPresenter); **new** content
  (Setlist, Biblioteca, search, Bíblia) still lands in the Prévia and goes out
  with Enter or a double click (Holyrics, EasyWorship, OpenLP); Enviar ao ar
  stays, smaller; plus C's clock and lock.
- **E. Minimal.** Keep the Prévia exactly; only replace Ensaio | Ao vivo with
  the clock and a lock. The smallest change, and it answers the "not even the
  Ao vivo toggle" half of the question.

## Open questions for the owner

1. If the toggle goes, what is rehearsal: a lock (screens freeze) or no mode
   at all (practise during the week with the projector off)?
2. What starts the service clock: a button, the first send to air, or the
   service's scheduled time? Should it also show on Palco and Pastor screens?
3. Should the planned end and ahead/behind come from the Setlist durations,
   and are those durations filled in today?
4. Should a click on a slide of the item already on air go live in one step?
5. How experienced are the volunteers who usually operate? Less experience
   argues for keeping more friction on new content.

## Evidence gaps

- The ProPresenter user guide PDF and Proclaim's help centre could not be
  fetched; Proclaim rests on search snippets.
- Holyrics' docs do not say what a single click does during a presentation.
- FreeShow's click behaviour comes from a search snippet.
- MediaShout's live-service section could not be read.

## Sources

- ProPresenter: https://support.renewedvision.com/hc/en-us/articles/360041344174 ·
  https://support.renewedvision.com/hc/en-us/articles/360041345954-Understanding-The-ProPresenter-User-Interface ·
  https://support.renewedvision.com/hc/en-us/articles/6032278869011-Using-ProPresenter-Control ·
  https://support.renewedvision.com/hc/en-us/articles/47985491763219-Using-Slide-Destination-within-ProPresenter ·
  https://support.renewedvision.com/hc/en-us/articles/360050782494
- Holyrics: https://holyrics.com.br/faq · https://holyrics.com.br/tips/features.html · https://holyrics.com.br/tutorial.html
- EasyWorship: https://help.easyworship.com/PreviewArea.html · https://help.easyworship.com/LiveArea.html ·
  https://easyworship.com/blog/7-easyworship-basics ·
  https://support.easyworship.com/support/solutions/articles/24000034804-can-t-see-taskbar-and-screen-is-black
- FreeShow: https://freeshow.app/docs/output · https://freeshow.app/docs/features · https://freeshow.app/docs/show
- OpenLP: https://manual.openlp.org/_sources/configure.rst.txt · https://manual.openlp.org/glossary.html ·
  https://discuss.openlp.org/d/904-go-live-to-specific-verse-in-song
- MediaShout: https://support.mediashout.com/761068-MediaShout-7-User-Guide
- Proclaim (snippets): https://support.proclaim.logos.com/hc/en-us/articles/19863521025293 ·
  https://support.proclaim.logos.com/hc/en-us/articles/41164168512397-Using-Target-Start-Times-to-Track-Progress-Through-a-Service ·
  https://community.logos.com/discussion/comment/366778
- OBS (forum): https://obsproject.com/forum/threads/hotkey-question.75699/ ·
  https://obsproject.com/forum/threads/switching-scenes-in-multiview-now-changes-the-preview-output-not-live-after-updating-to-v26.131227/
