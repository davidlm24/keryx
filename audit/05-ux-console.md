# Pass 5 — Operator UX: live console and Bíblia environment

Scope: `src/pages/Console.jsx`, `src/components/console/` (live panels), `src/lib/console/keys.js`, `liveKeys.js`, `menuBar.js`, `paletteSearch.js`, `sendBlock.js`, `toastQueue.js`, `useConsole.js`. Audited from the code only; no app, server or browser was launched. Persona: a volunteer with 3 weeks of experience, alone, with a pastor who changes the order on the fly. No skill was used (the pass is a code read). Per the caller's instructions, `audit/FINDINGS.md` was not edited; the rows are at the end of this file, ready to append.

## 1. Summary

The core loops are fast for someone who knows the palette (`/` then Ctrl+Enter puts a song or a verse on air in 2 keys plus the typing). The model starts to break on the edges of the single Prévia slot and on keys that do nothing in states the operator cannot see. Top 3 risks:
1. A "slide no ar" left in the Prévia keeps the old song's slide number. After a send that keeps the Prévia (the Setlist footer, Autoplay, the phone), Enter jumps the new song to that slide (UX-001).
2. Tela preta and Logo are dead while any popover or dialog is open: Saídas, the bell, Voltar ao anterior, Encerrar, the update popup, Novidades (UX-003).
3. Clicks in No ar wipe the prepared next item (UX-002). Pressing Esc twice from a search field ends the projection (UX-004). A pedido toast deletes the Desfazer of Esc (UX-005).

## 2. Findings (P1 → P3)

### UX-001 — A stale "slide no ar" in the Prévia moves the wrong song
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/lib/console/stage.js:169-178; src/components/console/useConsole.js:383; src/pages/Console.jsx:780-788; src/components/console/CenterPanel.jsx:31-33
- Evidence: ↑/↓ with an empty Prévia, or a click on a No ar card, prepares `stageAirSlide(air, i)`. That stage is `{ op: "content.goTo", args: {}, airSlide: true }` and carries no identity of the content it came from: `stageOp` sends `content.goTo { index }` to whatever is on air. Sends with `keepPrev` keep the Prévia (`clearsPrev = !keepPrev || prev?.id === stage.id`, useConsole.js:383): the Setlist footer's Próximo item (Console.jsx:659), the Autoplay, the controle remoto and a detached panel. Nothing clears an `airSlide` stage when the item on air changes. `previewDoc` then draws the Prévia as `content.goTo` applied to the new content (CenterPanel.jsx:31-33). The badge keeps song A's title while the picture shows song B at A's slide number, and the Slides column lists A's slides (SlidesPanel.jsx:48, 53).
- Live-service impact: during song A the operator presses ↓ to look ahead, then uses the footer's Próximo item (or Autoplay moves on). Song B is on air, and the Prévia still says A. The next Enter, or a double click on one of A's slides, jumps B to slide N, mid-verse, in front of the congregation.
- Fix: give `stageAirSlide` the content's identity (`startedAt` or `liveStageId`). In `send` (useConsole.js), refuse an `airSlide` stage whose identity no longer matches `live.content`, and clear such a Prévia in an effect on `airKey(live)` (useConsole.js:261 already watches it for `last`). Draw nothing in `previewDoc` when it does not match.

### UX-002 — A click in No ar (or in the Slides column's No ar tab) throws away the prepared next item
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/components/console/OnAirPanel.jsx:39-40, 53; src/components/console/SlidesPanel.jsx:76, 38
- Evidence: `pick = (i) => c.setPrev(stageAirSlide(air, i, airId))` runs on every single click, including the first click of a double click (`onClick={() => pick(i)} onDoubleClick={() => go(i)}`). It replaces whatever the Prévia held. In the medium and narrow tiers, the Slides column's "No ar" tab does the same (line 76). Its two tabs also disappear at once, because `twoItems` requires the Prévia to hold another item (line 38). The module's own header comment says No ar exists so "the operator never loses the place while preparing the next item" (OnAirPanel.jsx:10-12).
- Live-service impact: the next song is prepared. The pastor says "the chorus again" and the operator double-clicks the chorus card. The chorus goes on air, and the prepared song is gone from the Prévia with no way back. It must be found again under pressure.
- Fix: in No ar and the Slides "No ar" tab, a double click should do `goTo` without the single-click `setPrev`. Delay the single click's prepare by the double-click interval, or make the single click only highlight. If a single click must prepare, keep the replaced Prévia in a one-deep "back" slot (e.g. `c.prevBefore`) that Esc or the Prévia's menu restores.

### UX-003 — Tela preta and Logo do nothing while any popover or dialog is open
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/pages/Console.jsx:929-939 (line 931 `if (open) return;`); src/components/console/Popovers.jsx:394
- Evidence: the key handler lets B/L through over a right-click menu (930), over the library and confirm dialogs (933) and over THE window (939), but returns on any `open` (931). `open` covers the Saídas popover, the bell, Ver, Voltar ao anterior (`hist`), the menu bar (`mb:*`), Atalhos, Verificar, the Aviso rápido popover, the update popup and Novidades (which open by themselves at launch: Console.jsx:716, 739). The Encerrar dialog is also `open`, and its text says "use Tela preta (B)" (Popovers.jsx:394) while B is dead there.
- Live-service impact: the panic moment is exactly when the operator has Saídas or the bell open ("why is the projector wrong?"). B does nothing; Esc first closes the popover and only then B works. That costs a second and causes confusion, at the worst moment.
- Fix: move line 931 below the emergency check, i.e. `if (open && !["black","logo"].includes(action)) return;`. Inside the palette and the Aviso rápido field, B is typing and stays so (liveAction already returns null for text).

### UX-004 — Pressing Esc twice from a search field ends the projection; fields keep the focus after their job
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/lib/console/liveKeys.js:176; src/pages/Console.jsx:907, 958-961; src/components/console/Library.jsx:301; src/components/console/QuickTools.jsx:53
- Evidence: in a text field the first Esc only blurs (`"blur"`) and gives no visible feedback. With the field empty or full, the second Esc is "end" (`c.end()`). The Biblioteca's search (`<Field value={q} onChange={setQ} placeholder="Buscar…" />`) has no clear button and no Esc-to-clear. The Aviso rápido field keeps the focus after Enter shows the aviso (QuickTools.jsx:53, `showAlert` only clears the text). Until the operator clicks elsewhere, ←/→/PageDown move the caret instead of the slides.
- Live-service impact: the web habit "Esc clears the search", pressed twice because nothing seemed to happen the first time, takes the song and the music off every screen. Desfazer is there for 8 s, but the room has seen it go. After an Aviso rápido, the clicker and the arrows silently stop advancing the song.
- Fix: in console search fields (Biblioteca, the Mídia's search), Esc clears the text first, then blurs, and never reaches "end" on the same field's keystroke. Give `Field` a clear (×) button. In `QuickAlert.showAlert` (and the Chat composer if wanted), `blur()` the input after a successful show so the live keys come back.

### UX-005 — A pedido or chat toast deletes the Desfazer of Esc
- Severity: P1
- Effort: S
- Confidence: High
- Location: src/lib/console/toastQueue.js:35-41; src/components/console/useConsole.js:111, 158; src/pages/Console.jsx:954-957
- Evidence: in `pushToast`, a toast marked `important` (a new pedido or chat message from a phone, `usePedidos`) takes `cur`, and the action toast that was showing is dropped, not queued (`return { cur: t, queue: s.queue }`). `toastAction` then becomes null, so Ctrl+Z does nothing (Console.jsx:956).
- Live-service impact: a wrong Esc during worship, while the Equipe is chatting, which is likely during a service with phones. The Desfazer disappears under "Mensagem de Fulano" within a second. The song, its slide and the music position must be rebuilt by hand.
- Fix: in `pushToast`, when `s.cur.action?.undo` is present and the new toast is `important`, queue the important one (it already waits to be seen) or push the action toast back at the queue's head. Keep the Desfazer reachable from somewhere that does not expire (the Programa's menu: "Desfazer o Encerrar" while `undoEndOps` is non-empty).

### UX-006 — An unplanned item always lands at the END of the Setlist; positioning is drag-only or one step per right click
- Severity: P1
- Effort: M
- Confidence: High
- Location: src/components/console/useSetlistWrites.js:98, 143; src/pages/Console.jsx:847; src/components/console/BibleEnv.jsx:392; versus useSetlistWrites.js:157-161; src/components/console/useRowStep.js:43-44
- Evidence: the Biblioteca's hover "+ Adicionar", the palette's Shift+Enter, the Bíblia's "+ Setlist" and `addReference` all write `order: items.length`. The Setlist's own (+) (Seção, Aviso, Timer) inserts "right under the item in the Prévia" (`addRowToSetlist(row, prevItemId)`). So two doors into the same list put things in different places. Moving an item afterwards means one drag across the list or right click › Subir, one place per menu. Alt+↑/↓ does not work after a mouse click (UX-018). The footer's Próximo item and the Autoplay follow Setlist order (`neighbours`), so the inserted song is not "next" until it is moved.
- Live-service impact: "let's sing X now". The operator adds X, it lands as item 16 of 16, and must drag it into a list that shows about 4 rows at 1366×768 (UX-007), while the current song runs. Otherwise "Próximo item" plays the planned song instead.
- Fix: one rule for every "add to Setlist" door: right after the item on air (else after the Prévia's item, else at the end). Say it in the toast ("X entra depois de Y"). Add "Tocar a seguir" (put after the item on air) to the Setlist row menu and to the Biblioteca row's hover actions.

### UX-007 — At 1366×768 the Painel goes to the tray and the Setlist gets about 4 rows
- Severity: P1
- Effort: M
- Confidence: Medium
- Location: src/lib/console/layout.js:25-27; src/lib/console/dock.js:657-662, 672-676, 700; src/pages/Console.jsx:758, 1426
- Evidence: `TIER_WIDE = 1400`, so a 1366 px laptop (and 1920 px at 150 %, i.e. 1280) is "medium". `fromArrangement` then puts camadas, temas, abas and onair in the tray (line 700) and the Setlist beside the Prévia in the bottom band (line 676). That band is `max(previa.minH 200, prevW·9/16)` tall, about 200 px. In Compacta (automatic under 820 px) that leaves roughly 136 px of rows after the header and the footer. The Painel holds Avisos/Aviso rápido and its saved messages, Timers, Notas, Pedidos and Chat. A pedido's toast then says "veja em Ver › Painel" (Console.jsx:758, 1426), because the dock never moves by itself (owner S9 = B).
- Live-service impact: on the most common church laptop, the pastor's order changes happen in a 4-row Setlist. The Equipe's pedidos and chat, built for the live service, are two steps away and are not seen. The decision "the dock never moves by itself" is fine; the cost is that the default arrangement for this width hides the very panel those toasts point to.
- Fix: for the medium tier's default, give the Setlist a column, e.g. stack it under the Slides or put Setlist and Painel as tabs in the bottom band, instead of sharing the Prévia's 200 px band. Alternatively, lower `TIER_WIDE` to fit 1366 and measure. Have the pedido toast's Ver open a temporary drawer of the Painel (as Camadas has) instead of pointing to Ver.

### UX-008 — Recovering from the wrong item: no one-step undo of a send
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/useConsole.js:379-427; src/components/console/Popovers.jsx:362-378; src/components/console/CenterPanel.jsx:122
- Evidence: `send` offers Desfazer only for "the video left the screens" (line 424). Esc + Desfazer brings back the item that was ended, i.e. the wrong one. The visible door is the pill's ↶ icon, then pick a row ("escolha para pôr na prévia"), then Enter: 3 actions, 4 when the pill is folded under 480 px (the "…"). The fastest path, `/` then Ctrl+Enter on the palette's first "Recentes" row (history[0] is the replaced item, `remember` in live-state.mjs:642-649), is not written anywhere (not in Atalhos, Primeiros passos or the pill's tooltip).
- Live-service impact: a wrong double click in the Biblioteca puts the wrong song on air. A 3-week volunteer reaches for Esc, which blanks the screen, then Desfazer, which brings back the wrong song again.
- Fix: after a send that replaced a main layer, show "X no ar · Voltar a Y" as an action toast (Ctrl+Z runs it, as for Esc). It is the `stageFromHistory(history[0])` send already built for the popover. Also list "/ Ctrl+Enter: voltar ao anterior" in `SHORTCUTS_MID`.

### UX-009 — A click on a theme changes the screen at once; the double click to edit applies it first; no undo
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/themeActions.js:22-25, 35-46; src/components/console/ThemeStrip.jsx:132
- Evidence: `onClick={() => inUse(t)} onDoubleClick={() => edit(t.id)}`. `pickTheme` with content on air runs `applyThemeOnAir`, which does `content.update` of the style, sets the Fundo and makes the theme the one in use for every later send, with no toast and no Desfazer. With nothing on air, the click instead replaces the Prévia's item with an example (`c.setPrev(themeSampleStage(theme))`). Two recorded decisions collide here: "a click makes it the theme in use / dresses the text on air" and "a double click edits it".
- Live-service impact: the operator wants to edit a theme mid-service (double click). The congregation's lyrics change font and background at the first click, and every next song too. Going back means remembering which tile was in use. With nothing on air, the prepared next item is lost (as in UX-002).
- Fix: give the on-air apply an action toast "Tema X no ar · Desfazer" that restores the previous `themeId`, style and Fundo. Defer the single click's apply by the double-click interval so a double click only edits.

### UX-010 — The cheat sheet and Primeiros passos call the selection "verde"; green is on air
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/lib/console/keys.js:81; src/lib/console/firstSteps.js:34
- Evidence: "↑ ↓ Mover a seleção (verde) sem mudar o que está no ar" and "↑ e ↓ escolhem o próximo, em verde". Since Rodada P (P1 = B), green means ao vivo and gold means selecionado (CLAUDE.md "One colour per state").
- Live-service impact: the onboarding text for exactly this persona tells them the green card is the one they chose. Green is what the congregation sees, so the text teaches them to confuse the two.
- Fix: replace "verde" with "dourada", and add "o verde é o que está no ar" to the Primeiros passos step.

### UX-011 — In the Bíblia, L and C open the reference box instead of Logo / Limpar, and the list of keys does not say so
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/lib/console/keys.js:126-133, 62-64, 87; src/pages/Console.jsx:901-904
- Evidence: `quickJumpKey` takes every letter but B in the Bíblia environment (L and C start Lucas, Crônicas…), and it runs before `liveAction`. The ? list shows "L Mostrar logo" and "C Limpar texto" with no exception. Its only hint is a separate row, "Letra: Na Bíblia: digitar a referência".
- Live-service impact: in the Bíblia, with a passage on air, the operator presses C to clear the text and gets a box with "c" in it; the passage stays. With the letters "Com Shift" the problem does not exist (Shift+L/C still act).
- Fix: in `shortcutsFor`, label L and C as "fora da Bíblia" (or add "na Bíblia: Shift+L / Shift+C") and make Shift+L/Shift+C always act in the Bíblia when letters are "on" (no book starts with an uppercase-only key press, and the quick jump can take the lowercase).

### UX-012 — The arrows and a clicker move the hidden song under a video
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/useConsole.js:194-198; shared/live-state.mjs:125, 881-887, 899-901
- Evidence: `media.show` keeps `content` under the media layer (`reveal(["tool","communication"])`, no `without(content)`; `MAIN_LAYERS` puts media above content). `moveSlide` checks only `live.content`, so ←/→/PageDown during a video run `content.next` on the invisible song. No toast says it. No ar is folded at that point (`lyricsOnAir` false), so nothing shows the change.
- Live-service impact: the operator plays a testimony video over a song and taps the clicker. When the video ends, the song comes back on another slide, or past its last verse.
- Fix: in `moveSlide`, when the top main layer is not `content` (`topLayer` ≠ content), refuse with "O vídeo está por cima da letra · Parar o vídeo primeiro". Alternatively, let ←/→ act on the media playlist then.

### UX-013 — The palette behaves differently for "Jo 3:16" and "Jo 3", and the environment switch has no key back
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/Popovers.jsx:484-498, 501, 602; src/pages/Console.jsx:808, 887; src/components/console/TopBar.jsx:70
- Evidence: `here = Boolean(ref?.verseStart && !inBible && onPrepareReference)`. A reference with verses goes to the Prévia without leaving the console. A chapter alone ("Sl 23"), "Buscar … na Bíblia" or "Ver os N na Bíblia" call `openReference` / `searchBibleFor`, which `setEnv("biblia")`. The Bíblia environment has no Setlist. CONSOLE | BÍBLIA is a mouse-only tab pair (no shortcut in `keys.js`).
- Live-service impact: the pastor says "Salmo 23". The operator types "sl 23" and is moved into another environment. They must click a verse, press Enter, and click CONSOLE to return to the Setlist, while the song order is changing.
- Fix: with a chapter alone in the culto environment, offer "Pôr o capítulo na Prévia" (verse 1, the arrows walking it, as a single verse already does) as the Enter action and "Abrir na Bíblia" as the second row. Add a key for the environment pair (e.g. F2/F3 or Ctrl+1/Ctrl+2) in `liveAction` and `shortcutsFor`.

### UX-014 — Activating a culto is one click, for every computer, with no question and no undo
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/useActiveService.js:28-41; src/lib/console/menuBar.js:84
- Evidence: `activate` writes `User.active_service_id` and says "… ativado em todos os computadores". There is no confirm and no Desfazer. "Encerrar o culto…" right below does ask (line 47). The culto list is the head of the Culto menu and of the Setlist title's menu. That title is the Setlist panel's header, a natural place to click.
- Live-service impact: a misclick while looking for "Planejar o culto" swaps the Setlist on every console mid-service (nothing leaves the air). The operator must remember which culto was active to switch back.
- Fix: while something is on air (`isOnAir`), ask ("Trocar a Setlist de todos os computadores para X?"). Always add Desfazer to the toast, re-activating the previous `activeId`.

### UX-015 — The Biblioteca's search is a dead end for the keyboard
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/components/console/Library.jsx:301, 309; src/lib/console/liveKeys.js:181, 195-197; src/components/console/kx.jsx:340-344
- Evidence: the search `Field` has no `onKeyDown`, so Enter and ↓ do nothing (in a text field `liveAction` returns null). A row reached with Tab is a control: Enter prepares it (`rowKeyDown`), and a second Enter prepares it again (control focus → `null`, never "send"). ↑/↓ on a focused row return `selUp`/`selDown`, which walk the Prévia's slides (`selectSlide`), not the list. The two ways to find a song behave differently: the palette is fully keyboard-driven, the Biblioteca's search needs the mouse.
- Live-service impact: a volunteer who types in the visible Biblioteca box (more discoverable than `/`) must reach for the mouse to finish. A keyboard user gets "nothing happens" on Enter.
- Fix: in the Biblioteca search, Enter prepares the first row shown and blurs (so the next Enter sends); ↓ moves focus into the list. On a focused Biblioteca row, ↑/↓ move the focus between rows (as a listbox) instead of the Prévia's slides.

### UX-016 — The update popup can restart KERYX by itself when only the papel de parede, an Aviso rápido, Tela preta or Logo is on screen
- Severity: P2
- Effort: S
- Confidence: Medium
- Location: src/lib/console/updates.js:8, 21-26; shared/live-state.mjs:102-105; src/components/console/Popovers.jsx:677-686; src/pages/Console.jsx:714-717
- Evidence: within 3 minutes of the console opening (`LAUNCH_WINDOW_MS`), a found update opens the popup by itself. When it is "downloaded" and `!onAir(live)`, a 5-second countdown runs `updateInstall`, which closes every output for about 30 s (updates.js:1-4). `isOnAir` counts content, media, video, tool, communication and audio. It does not count the Aviso rápido (`alert`), the overlays, the papel de parede, or `screen` black/logo.
- Live-service impact: KERYX is reopened between items (after a close, or a PC restart) with an Aviso rápido or the Logo on the projector. The operator looks away and KERYX restarts: the projector shows the Windows desktop for about 30 s.
- Fix: make the auto-install also require no `alert`, no overlay and `screen === "show"`, and no output open with a non-idle screen. Or never auto-install when any output window is open; only the explicit button installs.

### UX-017 — Keys shown on rows do not work after a mouse click (Delete, Alt+↑/↓, Ctrl+A)
- Severity: P2
- Effort: S
- Confidence: High
- Location: src/pages/Console.jsx:981-985; src/components/console/useRowStep.js:43-44; src/components/console/Library.jsx:244, 254, 430; src/components/console/Rundown.jsx:240, 319
- Evidence: `onMouseClick` blurs every `[role='listitem'][tabindex]` after a click. Delete and Ctrl+A are handled only by the list's own `onKeyDown` (`ms.keyDown`), and Alt+↑/↓ only by the focused row (`step.onKey`). After a mouse click or Ctrl+click the keydown goes to the window, and nothing happens. The SelBar ("Excluir… · Delete", "Tirar da setlist… · Delete") and the row menus ("Subir · Alt+↑") still show the keys. CLAUDE.md says a menu shows Delete "only where it works… the Mídia and the Escola today".
- Live-service impact: the volunteer marks two Setlist rows with Ctrl+click, presses Delete as the bar says, and nothing happens. Or presses Alt+↑ as the menu says, and nothing happens. They learn not to trust the hints.
- Fix: route Delete, Ctrl+A and Alt+↑/↓ from the window handler to the list that has marks (`selections.any()` already knows), or drop those hints from the console's Biblioteca and Setlist.

### UX-018 — Jumping to the chorus has no key and, from No ar, costs the Prévia
- Severity: P2
- Effort: M
- Confidence: High
- Location: src/lib/console/liveKeys.js:171-202 (no digit or part keys); src/components/console/OnAirPanel.jsx:39-53
- Evidence: the keys reach a part only by stepping (→ n times, or ↓ n times then Enter). Clicking moves to a slide directly, but the slide must be found in the column (the part's name is a small label) and, from No ar, the Prévia is lost (UX-002). In the medium tier with an item in the Prévia, it takes the "No ar" tab and then a double click.
- Live-service impact: "chorus again" means scanning cards for the "Refrão" label and hitting a small target while singing goes on.
- Fix: digits 1–9 jump the item on air to slide N (as the cards are numbered, `kx-slide-n`), and R jumps to the next slide whose label is a chorus (`is_chorus`). Add both to `liveAction`/`shortcutsFor` and leave them off in the Bíblia, where digits start the quick jump.

### UX-019 — The papel de parede's one live door is a hover-only pencil
- Severity: P3
- Effort: S
- Confidence: High
- Location: src/components/console/console.css:579-580; src/components/console/Layers.jsx:226, 240-253
- Evidence: `.kx-layer .layer-edit { opacity: 0 }`, shown only on `:hover` / `:focus-visible`. Its other door is the row's right click. It is "the one live door" (Rodada B). In the medium tier the path is: pill › Camadas (1), hover the Fundo row and click the pencil (1), "Trocar o papel de parede…" (1), pick (1), Usar (1), so 5 clicks.
- Live-service impact: rare live, but undiscoverable without being told.
- Fix: keep the Fundo row's pencil always visible (it is the only row whose pencil opens a menu), or add "Trocar o papel de parede…" to the Programa's menu (progMenu, Console.jsx:1314).

### UX-020 — The Slides footer's Anterior/Próximo change meaning after Esc
- Severity: P3
- Effort: S
- Confidence: High
- Location: src/components/console/SlidesPanel.jsx:119-141
- Evidence: the comment says "The footer's arrows always move what is on air". In the "parou aqui" mode the same two buttons, same labels and same place, call `c.moveLast` (they move the mark, nothing on air), and they are not `kx-btn-live`.
- Live-service impact: after Esc the volunteer presses "Próximo" expecting the next verse on screen, and only a grey ring moves.
- Fix: label them "Marcar anterior / Marcar próximo" (or show only the "parou aqui" mark with Enviar from it) so the same words never mean two things.

### UX-021 — An Aviso rápido saved message is deleted by its × with no question and no undo
- Severity: P3
- Effort: S
- Confidence: High
- Location: src/components/console/QuickTools.jsx:47, 61-63
- Evidence: `dropPreset` runs `AlertPreset.delete` on a click on the small × next to the message, whose own click fills the field. CLAUDE.md: "Excluir = apaga (sempre via `useConfirm`)".
- Live-service impact: a slip next to "Kids" or "Carro" deletes the church's saved message while a parent waits.
- Fix: `useConfirm` as everywhere, or a toast with Desfazer that re-creates the row.

## Core loops, counted from a cold console (letters "Ligadas", wide tier unless said)

| Loop | Fastest path | Notes |
|---|---|---|
| (a) song not in Setlist → air | `/`, type, Ctrl+Enter = 2 keys + typing (Enter, Enter = 3) | Biblioteca: click search + type + double-click row = 2 clicks + typing; no keyboard continuation (UX-015) |
| (b) passage → air, culto | `/`, "jo 3 16", Ctrl+Enter = 2 keys + typing | A chapter alone switches to the Bíblia: + click verse + Enter + click CONSOLE (UX-013) |
| (b) passage → air, Bíblia | type "jo 3 16" (opens the box), Enter, Enter = 2 keys + typing | Reaching the Bíblia: 1 click, no key |
| (c) chorus of the song on air | double-click the card in No ar = 1 (loses the Prévia, UX-002); medium tier: No ar tab + double-click = 2 | Keys: → n times; no part key (UX-018) |
| (d) unplanned item + reorder | `/`, type, Shift+Enter (lands at the end) + 1 drag across a ~4-row Setlist, or 2 clicks × n places | Biblioteca search + drag into the slot = 1 click + typing + 1 precise drag (UX-006, UX-007) |
| (e) video with sound, then back | Vídeos tab + double-click = 2; back: automatic when it ends, or Parar = 1 | The song comes back at its slide unless the arrows were used meanwhile (UX-012) |
| (f) Aviso rápido | wide: Avisos tab (0–1) + click field + type + Enter = 2–3 + typing; medium: Ferramentas › Aviso rápido… + type + Enter = 3 + typing | The field keeps the focus afterwards (UX-004) |
| (g) wrong item sent | pill ↶ + pick + Enter = 3 (4 folded); keyboard `/` + Ctrl+Enter = 2, undocumented | Esc + Desfazer brings back the wrong item (UX-008); wrong Esc: Ctrl+Z = 1 within 8 s, unless a pedido toast arrives (UX-005) |

## Short critique per panel

- **Programa + pill**: works: the state dot, the title only when the player does not name it, and the screen actions one click away. Fails: Voltar ao anterior is an unlabelled ↶ icon that only prepares. B/L are dead while its own Voltar popover or the Encerrar dialog is open (UX-003).
- **Prévia**: works: a gold badge, the "não vai mostrar" band, an Enviar pill with the refusal in its tooltip. Fails: one slot that many incidental clicks overwrite (No ar, theme tiles, timers from the menu, the first click of a double click), and a stale "slide no ar" that retargets (UX-001, UX-002).
- **Slides**: works: the "prévia n/m" vs "No ar n/m" footer, and keep-in-view. Fails: the source switches between the Prévia, on air and "parou aqui" by invisible state, and the footer buttons change meaning (UX-020).
- **No ar**: works: always the item on air, numbered cards, folding away when no lyrics. Fails: a single click prepares and destroys the Prévia (UX-002).
- **Biblioteca**: works: one-line rows, badges, folders, drag to Setlist/Prévia/Programa. Fails: the search has no keyboard path to send, Esc twice ends the air, and the advertised Delete does not work after a mouse click (UX-004, UX-015, UX-017).
- **Setlist**: works: the footer's Item anterior/Próximo, Autoplay countdown on the row, multi-drag. Fails: additions land at the end, reordering is drag-only or one step per right click, and there are about 4 rows at 1366 (UX-006, UX-007).
- **Painel (tabs)**: works: Aviso rápido with saved messages, Pedidos/Chat. Fails: in the tray at 1366, and the field keeps the focus after showing an aviso.
- **Camadas / Temas**: works: a fixed layer order, a single padlock, overlays prepared off air. Fails: a click on a theme changes the screen with no undo, and the papel de parede's door is hover-only (UX-009, UX-019).
- **Top bar / menu bar**: works: compact status, every menu action also in the palette. Fails: a culto activation is one unguarded click (UX-014), and there is no key for CONSOLE | BÍBLIA.
- **Bíblia**: works: the quick jump, Enter selects then sends, the version and Ref. changes reach the air at once. Fails: L/C do not work there and the list does not say so (UX-011), there is no Setlist view, and it is entered by side effects of the palette (UX-013).
- **Toasts / alerts**: works: Desfazer held under the pointer, floating alert cards that never push the dock. Fails: an important toast drops the Desfazer (UX-005), and the 8 s Desfazer is the only door to undoing Esc.

## Top 5 changes with the biggest operator impact

1. Tie an "air slide" Prévia to the content it came from, and clear it when the item on air changes (UX-001).
2. Let B and L through every popover and dialog (UX-003), and never let an important toast drop the Desfazer (UX-005).
3. Stop single clicks in No ar / the No ar tab and on theme tiles from overwriting the Prévia or the air without undo (UX-002, UX-009).
4. One insertion rule for "add to Setlist" (after the item on air) plus "Tocar a seguir", and a medium-tier default that gives the Setlist a real column (UX-006, UX-007).
5. Make the first Esc in a search field clear it and never let the second end the air from there. Blur the Aviso rápido after showing. Give the Biblioteca's search an Enter path (UX-004, UX-015).

## 3. What's done well (keep it during fixes)

- `escapeTarget` closes one layer per Esc and cancels the Autoplay countdown and the selection before ending the air (keys.js:114-117).
- Mouse clicks give the focus back to the console (`onMouseClick`, `blurSelectsAfterPick`), so the live keys keep working after most clicks.
- `sendBlock` gives the same refusal words to the console and the phone (locked, syncing, missing, PDF preparing).
- The palette: ranked, accent-insensitive, Enter / Ctrl+Enter / Shift+Enter in one place, and Recentes before typing.
- Desfazer of Esc restores the music at the second it stopped (`undoEndOps`), held while hovered.
- The projector is reopened by a send when it is closed (Console.jsx:618-625).

## 4. Open questions (for Davi)

- Space is Tocar/pausar. Volunteers coming from ProPresenter or PowerPoint press Space to advance and would pause the worship playback instead. Was that weighed? (keys.js:82)
- When a video with sound is sent over a song that has its own playback, `hush` stops the playback. When the video ends, the lyrics come back but the playback does not, and a letra automática that follows it has no source. Is that intended? I did not trace `followIndex` with a hushed source (useConsole.js:314-332).
- Is a 1366×768 laptop the actual church PC? UX-007's row count (~4) is computed from `fromArrangement`, not measured.
- Does `restoreArgs` (Voltar ao anterior, Recentes) carry the Setlist `serviceItemId`, so the Setlist marks the restored item on air and the footer's Próximo item continues from it? `stageFromHistory` gives it the id `history:<at>` (stage.js:164).
- Encerrar's dialog opens on the Encerrar button (Enter confirms). That is consistent with the owner's choice (it has Desfazer), but with UX-005 the Desfazer is not guaranteed.

## 5. Handoffs to other passes

- A11Y/COPY: stale comments contradict the state colours, which risks a wrong future edit: kx.jsx:371-374 ("on air gold, the Prévia green") and Rundown.jsx:262 ("Red only while it is on air").
- FUNC: `addToService` in BibleEnv.jsx:392 writes `duration: 120` while `addPassage` (Console.jsx:847) uses `defaultDuration("BIBLE")`, so the same passage gets two durations depending on the door.
- FUNC: `isOnAir` ignores the alert, the overlays and `screen` black/logo. It is also used by the update logic (UX-016); check its other callers.

## Rows for audit/FINDINGS.md (not appended, per the caller)

| UX-001 | 5 | P1 | S | Stale "slide no ar" in the Prévia retargets the next song | stage.js:169; useConsole.js:383 | Open |
| UX-002 | 5 | P1 | S | Click in No ar / No ar tab wipes the prepared item | OnAirPanel.jsx:39; SlidesPanel.jsx:76 | Open |
| UX-003 | 5 | P1 | S | Tela preta/Logo dead while any popover/dialog is open | Console.jsx:931 | Open |
| UX-004 | 5 | P1 | S | Esc twice from a search field ends the air; fields keep focus | liveKeys.js:176; Library.jsx:301; QuickTools.jsx:53 | Open |
| UX-005 | 5 | P1 | S | Pedido/chat toast drops the Desfazer of Esc | toastQueue.js:35 | Open |
| UX-006 | 5 | P1 | M | Added items land at the end; reorder drag-only | useSetlistWrites.js:98,143 | Open |
| UX-007 | 5 | P1 | M | 1366×768: Painel in tray, Setlist ~4 rows | layout.js:25; dock.js:676,700 | Open |
| UX-008 | 5 | P2 | S | No one-step undo of a wrong send | useConsole.js:379; Popovers.jsx:362 | Open |
| UX-009 | 5 | P2 | S | Theme click changes the air; double-click applies first; no undo | themeActions.js:22; ThemeStrip.jsx:132 | Open |
| UX-010 | 5 | P2 | S | Atalhos/Primeiros passos call the selection green | keys.js:81; firstSteps.js:34 | Open |
| UX-011 | 5 | P2 | S | L/C type in the Bíblia; key list silent | keys.js:126 | Open |
| UX-012 | 5 | P2 | S | Arrows move the hidden song under a video | useConsole.js:194 | Open |
| UX-013 | 5 | P2 | S | "Jo 3" leaves the console, no key back | Popovers.jsx:484; Console.jsx:808 | Open |
| UX-014 | 5 | P2 | S | Culto activation: one click, all PCs, no undo | useActiveService.js:28 | Open |
| UX-015 | 5 | P2 | S | Biblioteca search has no keyboard path to send | Library.jsx:301; liveKeys.js:181 | Open |
| UX-016 | 5 | P2 | S | Update popup can auto-restart with an aviso/logo on screen | updates.js:26; live-state.mjs:102 | Open |
| UX-017 | 5 | P2 | S | Delete/Alt+↑↓/Ctrl+A hints dead after mouse click | Console.jsx:981; useRowStep.js:43 | Open |
| UX-018 | 5 | P2 | M | No key to jump to a slide/chorus | liveKeys.js:171 | Open |
| UX-019 | 5 | P3 | S | Papel de parede door is a hover-only pencil | console.css:579; Layers.jsx:253 | Open |
| UX-020 | 5 | P3 | S | Slides footer buttons change meaning after Esc | SlidesPanel.jsx:119 | Open |
| UX-021 | 5 | P3 | S | Aviso rápido preset × deletes without asking | QuickTools.jsx:47 | Open |
