# Audit 05 — UX of the window pages, dialogs and phone (consistency and workflow)

Scope: everything except the live console panels and the Bíblia environment. Audited from code only (no app launched). Skills: none used; manual read against CLAUDE.md, `menuLabels.js`, `confirm.js`.

## 1. Summary
- The window pages are generally well built: shared `WinBar`, `CfgGroup`, `useConfirm`, `uploadFile`, pt-BR copy, labelled icon buttons, phone targets of 44 px or more. The problems are in the seams between pages, not in any one page.
- Top risks: (1) three different "are you sure?" models, with the Configurações network/backup/phone buttons using a "click again" button instead of `useConfirm`; (2) the Editor da tela mixes autosaving Ajustes with a draft Desenho under one Cancelar/Salvar bar; (3) the save model (autosave, draft + Salvar, or a Salvar that does nothing) is different per page and never stated.
- 13 colour fields still use the raw `input[type=color]`, and the screen editor bypasses the background library with an inline gallery, against the recorded rules.
- Help and naming have drifted: "Conexões" means two different things, Primeiros passos step 2 contradicts the shared-Setlist model, the shortcut list is thin, and a few labels break the "…" / Excluir-Tirar-Remover / salvar rules.

## 2. Findings (ordered by impact)

### UX-101 — Three confirmation models; the "click again" button replaces `useConfirm` for network, backup and phone actions
- Severity: P2
- Effort: M
- Confidence: High
- Location: `src/components/console/settings/DadosSection.jsx:52-57, 98, 129, 146, 174`; `settings/RedeSection.jsx:79-83, 118-119`; `settings/PhonesBlock.jsx:136-140, 181`; rule in `src/lib/console/confirm.js:7`
- Evidence: `confirm.js` says any irreversible action "says it with `danger: true` (Trocar o código, Juntar…)" and opens on Cancelar. In code, "Trocar o código" is `twice("code", "Clique de novo em Trocar o código…")` and the button turns into "Trocar mesmo" (`PhonesBlock.jsx:181`), although the same file already uses `useConfirm` for "Desconectar" (`:153`). RedeSection does the same for the PIN: `confirmFirst("remove", …)` and "Remover mesmo" (`:119`), toast "Clique de novo em Remover". DadosSection arms Importar/Restaurar/Instalar e reiniciar by a second click only when something is on air (`run`, `:54`), and the Seg "Manter os últimos" asks you to pick the same value again ("Escolha 7 de novo para confirmar", `:98`). When nothing is on air, Restaurar and Importar rely on a native OS message box in main (`electron/system.cjs:131, 272, 318`), a third look and wording. The armed state has no timeout in the code I read.
- Live-service impact: The operator's send reflex (Enter or a click) can complete an armed, red button; the toast explaining it vanishes. Changing the phones' code or the PIN disconnects every phone mid-service, and the control that does it is the one without the Cancelar-first dialog the owner specified.
- Fix: Route these through `useConfirm` with `danger: true` (title, what it disconnects or restarts, action then Cancelar). Keep the on-air warning as text inside that dialog. Drop the re-pick confirmation of the Seg and apply it with a normal question.

### UX-102 — Editor da tela: Ajustes save at once, Desenho is a draft, one Cancelar/Salvar bar covers both
- Severity: P2
- Effort: M
- Confidence: Medium
- Location: `src/components/editor/ScreenEditor.jsx:77-80, 654-661, 722-728`; `IdleEditor.jsx:161`
- Evidence: Header comment: "nothing is written until 'Salvar a tela'". The bar shows `Cancelar` and `Salvar a tela` (disabled until `dirty`) whatever tab is on, while the Ajustes tab (`OutputAjustes`, Destino, Conteúdo, Aparência) saves on every change (CLAUDE.md: "Cada mudança salva na hora"). Nothing on the page says which half is which. The sibling page in the same left menu, Tela ociosa, says "Muda na hora, sem salvar." (`IdleEditor.jsx:161`).
- Live-service impact: An operator changes a screen's Conteúdo ("Por cima de tudo", Sem item da lista) and the drawing, presses Cancelar and believes both were undone. The screens keep the Ajustes change. The next Sunday a screen drops lyrics.
- Fix: Say it where it applies: a one-line `kx-meta` at the top of the Ajustes tab ("Os ajustes valem na hora") and "Salvar o desenho" on the button (or "Salvar a tela" plus the same hint). Make the Cancelar title say "Descarta só o desenho".

### UX-103 — The save model differs by page and is never declared; Planejar o culto shows a brand "Salvar" that only blurs the field
- Severity: P2
- Effort: M
- Confidence: High
- Location: `ServicePlanner.jsx:161-178`; `SongEditor.jsx:513-516`; `NoticeEditor.jsx:162-165`; `MaterialView.jsx:121-123`; `ThemeEditor.jsx:460, 512`; `ScreenEditor.jsx:660, 728`; `ReportsView`, `MediaView`, `SchoolView`, `SettingsView` (autosave)
- Evidence: Draft + Salvar + Cancelar + "· não salvo" + unsaved guard: Editor de música ("Salvar"), Aviso ("Salvar aviso"), Material ("Salvar material"), Editor de temas ("Salvar tema"), Editor da tela ("Salvar a tela"). Autosave with no button: Configurações, Mídia, Escola, Relatórios, Tela ociosa. Planejar o culto autosaves but has the same brand button, `kind="brand"` "Salvar", whose handler is `document.activeElement?.blur?.(); c.say("Culto salvo.")` (`:162-166`), no Cancelar, no "não salvo". The song editor also keeps ☆ Favorita in the draft (`set({ is_favorite })`, `:520`), so Cancelar un-favorites.
- Live-service impact: A volunteer cannot tell from the screen whether leaving loses work. Today the answers are different on the pages he uses back to back (planner, song, aviso).
- Fix: One rule, shown in the bar: pages that autosave show "Salvo" status text instead of a brand button (the planner's button becomes "Salvo · agora" or a quiet check), pages that draft keep Salvar/Cancelar. Use one label ("Salvar") with the object in the title, not five variants.

### UX-104 — Raw `input[type=color]` in 13 places although ColorPop is "THE colour picker"
- Severity: P2
- Effort: M
- Confidence: High
- Location: `editor/TextBar.jsx:86, 90, 101, 109`; `editor/ThemeEditor.jsx:371`; `editor/ScreenEditor.jsx:466`; `editor/IdleEditor.jsx:120, 124, 126`; `console/NoticeEditor.jsx:201, 203`; `console/MaterialView.jsx:323`; `settings/TelasSection.jsx:69, 70`; `settings/ajustes/AparenciaBlock.jsx:52`; `library/BackgroundLibrary.jsx:404`
- Evidence: Only `GeneratorPanel.jsx:101` uses `<ColorPop>`. CLAUDE.md: "ColorPop … THE colour picker; a raw `input[type=color]` only where it has not migrated yet". The raw one has no hex field, no palette, no eyedropper and opens the OS dialog. The theme text colour (the most used one) is among the raw ones.
- Live-service impact: Picking the same church colour in a theme, an aviso and the idle screen is three different workflows; no hex to paste; a dim-room operator gets a bright OS dialog.
- Fix: Replace each with `<ColorPop value onChange label>`; the second-colour/outline cases already have a pattern in `GeneratorPanel`.

### UX-105 — The screen editor picks backgrounds and images through its own inline gallery, not the library
- Severity: P2
- Effort: M
- Confidence: Medium
- Location: `editor/ScreenEditor.jsx:462-482, 609-625`
- Evidence: "Fundo" row = raw colour input + "Imagem no fundo" with `Escolher…` that opens an inline `nv-pick` list (`pickBgImage`) fed by `bgFileRef` ("Do computador…" upload). Every other place that chooses a background uses `BgChip`/`useLibraryPicker` (Aviso `NoticeEditor.jsx:221`, Material `:327`, Planner `:497`, Culto `CultoSection.jsx:115, 142`, Tema `ThemeEditor.jsx:416`, Tela ociosa `IdleEditor.jsx:61`). CLAUDE.md: "don't add a gallery of thumbnails to a form."
- Live-service impact: A church picture dropped here is a bare file (no category, no dim/blur, never reaches the library) so the same picture looks different on a theme and on a screen design.
- Fix: Use `BgChip` for the design's background and `useLibraryPicker` for image elements.

### UX-106 — "Conexões" means two things; phones live in "Telas na rede", sync in its own section
- Severity: P2
- Effort: S
- Confidence: High
- Location: `src/lib/console/settings.js:15-24`; `src/lib/console/menuBar.js:161-170`
- Evidence: The Ferramentas menu group "Conexões" holds GERAR, "KERYX no celular" (opens Configurações › Telas na rede, `:166`) and "Sincronização" (opens › Sincronização). Configurações has a section named "Conexões" that holds only the GERAR (`ConexoesSection.jsx:85`). A volunteer who follows the menu word into Configurações finds a section that lacks two of the three items. The phone codes (controle, equipe) sit under a section called "Telas na rede".
- Live-service impact: Re-pairing a phone minutes before the service means guessing between "Conexões", "Telas na rede" and "Sincronização".
- Fix: Make Configurações › Conexões the home of all three (GERAR, KERYX no celular, Sincronização as groups), or rename the GERAR-only section "GERAR". Keep the menu items pointing to the matching group.

### UX-107 — Primeiros passos step 2 contradicts the shared-Setlist and "tabs never change what the consoles show" model
- Severity: P2
- Effort: S
- Confidence: High
- Location: `src/lib/console/firstSteps.js:26-28`
- Evidence: "Em Planejar o culto, escolha o culto do dia e ponha músicas… O Setlist, à direita, é essa lista." Per CLAUDE.md, the Setlist is one for the whole church and the planner's tabs "never change what the consoles show": the culto only reaches the Setlist after "Ativar o culto" (tab right click) or the Setlist's title menu. The step does not mention Ativar nor "Guardar no culto…".
- Live-service impact: A new volunteer builds the plan in Planejar o culto and the Setlist stays as it was.
- Fix: Rewrite the step: plan in Planejar o culto, then "Ativar o culto" (right click on its tab) puts it in the Setlist; or build the Setlist directly with the (+).

### UX-108 — Atalhos: the list is short and points at a menu that does not hold it
- Severity: P3
- Effort: S
- Confidence: High
- Location: `settings/ConsoleSection.jsx:102`; `src/lib/console/keys.js:56-88`
- Evidence: With the letter keys off the page says "Também no menu do logo, Atalhos do teclado." The logo menu is Configurações, Saídas, Sobre, Atualizar (CLAUDE.md); Atalhos is only in Ajuda (`menuBar.js:181`). The list itself has 12 rows and omits keys the app has and menus advertise: F2 and Delete in lists (`keys.js:23`), Ctrl+S in every page, Ctrl+A / Ctrl+click for selecting, Alt+letter for the menu bar, Ctrl+Enter / Shift+Enter in the search.
- Live-service impact: Keys that the menus show as hints are not discoverable in the one place built for it.
- Fix: Fix the sentence ("Também em Ajuda › Atalhos"); add the missing rows to `shortcutsFor` with `action: null`.

### UX-109 — Labels that open a page end in "…" against the menu table's own rule
- Severity: P3
- Effort: S
- Confidence: High
- Location: `ThemeStrip.jsx:92, 107`; `Layers.jsx:328`; `settings/ajustes/AparenciaBlock.jsx:48`; `settings/TelasSection.jsx:315`; `settings/CultoSection.jsx:126`; `MediaView.jsx:497`; `ThemeEditor.jsx:316`; table rule `menuLabels.js:22`
- Evidence: `menuLabels.js:22`: "Opening an editor (a page of the window: no '…')" and `editar: "Editar"`. Yet "Editar tema…" appears three times, hand-typed, not from the table; "Novo tema…", "Editar a tela…", "Editar a tela ociosa…" and "Marcar os tempos…" (the table has "Marcar os tempos com uma letra…", which does ask for a song) open pages directly. "Nova música" and "Novo aviso" (same kind of action) have none.
- Live-service impact: Low; the same action reads two ways, and the operator cannot predict whether a dialog follows.
- Fix: Add `editarTema`, `novoTema`, `editarTela` to `MENU_LABELS` without "…" and use `menuItem`; rename the MediaView button to the table's label.

### UX-110 — Copy rule slips: "Remover", "Tema sem nome" captions, "Guardar"/"gravar" for save
- Severity: P3
- Effort: S
- Confidence: High
- Location: `RedeSection.jsx:119`; `SongEditor.jsx:641`; `ThemeEditor.jsx:312, 325, 508`; `BibleSetupDialog.jsx:68, 104`; `ThemeStrip.jsx:70`; `PedidosTab.jsx:319`; `PackageDialogs.jsx:69`; `useSetlistWrites.js:176`
- Evidence: Rule: "Remover só em 'Remover saída'" yet "Remover" the PIN (`RedeSection.jsx:119`) and "Remover" the song's media (`SongEditor.jsx:641`, should be Tirar). Rule: "'Tema sem nome' … never as a caption", yet the Editor de temas WinBar sub and panel count show it (`ThemeEditor.jsx:312, 508`). Rule: salvar, not guardar: "Não foi possível guardar a escolha" and the busy label "Guardando…" (`BibleSetupDialog.jsx:68, 104`), "gravar o tema do culto" (`ThemeStrip.jsx:70`), tooltip "Guardar o vídeo na Mídia" (`PedidosTab.jsx:319`), "O que gravar" (`PackageDialogs.jsx:69`). "Guardar no culto…" is the owner's name for that command (U3), so leave it.
- Fix: Replace in place; caption of an unnamed theme = "Novo tema" or the date-less "Tema" only.

### UX-111 — "Renomear" is inline, a dialog, or "Renomear…" depending on the page
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: `MediaView.jsx:302, 318, 422`; `SchoolView.jsx:105-110, 124-139`; `settings/PhonesBlock.jsx:149, 160`; `settings/RedeSection.jsx:185`
- Evidence: Mídia renames inline (F2, double click, `mv-rename`). Escola, phones and network screens open `PromptDialog` with ok "Renomear". The same menu item `menuItem("renomear")` (label "Renomear", no "…") therefore opens a dialog in three menus; the network row's button is "Renomear…" with ok "Salvar" (`RedeSection.jsx:185`; the console toast says "Nome salvo."). One word, three behaviours.
- Fix: Settle one behaviour: dialogs get "Renomear…" (table entry for it), the Mídia keeps its inline edit; use "Renomear" as the confirm word everywhere.

### UX-112 — Search fields say "Buscar", "Pesquisar" or "Procurar"
- Severity: P3
- Effort: S
- Confidence: High
- Location: `MediaView.jsx:340` ("Pesquisar na Mídia"); `Library.jsx:301`, `AvisosTab.jsx:85`, `SongPickDialog.jsx:48`, `SettingsView.jsx:184` ("Buscar…"); `LyricsSearch.jsx:105`, `PedidosTab.jsx:130` ("Procurar"); `ReportsView.jsx:81` (no verb)
- Evidence: One word per concept is the owner's copy rule; the Mídia, the one library page that is a window, is the odd one. "Procurar a letra na internet" is a different action (online) and can stay.
- Fix: "Buscar na Mídia"; Relatórios placeholder "Buscar música, artista ou culto".

### UX-113 — Relatórios: Copiar wears the save glyph, the "salvo" toast fires before the save dialog is answered, no load/error state
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: `ReportsView.jsx:55-65, 119-120, 45-47`
- Evidence: `<Btn …><Icon name="save" />Copiar</Btn>` next to a glyph-less "Salvar CSV" (the table has `copy` for copy, `save` for exporting). `save()` builds an `<a download>` and calls `a.click()`, then immediately `c.say("Relatório CCLI salvo em CSV.")`; if the OS dialog is cancelled the toast is wrong, and it never says where. The three queries have no loading or error state (an empty history reads "Nada enviado ao ar neste período." while loading), and the history is read with a hard cap `list("-played_at", 5000)`, so "Tudo" silently undercounts after the cap.
- Fix: Swap the glyphs (`copy` on Copiar); say "CSV gerado" and the file name, or go through the main process save dialog and report its result; show a loading line; show "Mostrando as últimas 5000" when the cap is reached.

### UX-114 — Raw `input[type=number]` with one-letter labels where `NumBox` exists
- Severity: P3
- Effort: S
- Confidence: High
- Location: `editor/ScreenEditor.jsx:565-572, 607`; `QuickTools.jsx:122`; `LinesPicker.jsx:29`
- Evidence: Element position/size use `<label>X<input type="number" className="pl-input le-num">` with labels X, Y, L, A. `NumBox` (`kx.jsx:235`) has −/+ buttons, ↑/↓ and Shift ×10, and is what the Editor de temas uses.
- Fix: Use `NumBox` with `unit="%"`; label them Posição X/Y, Largura, Altura.

### UX-115 — "Equipe" names three different groups of people
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: `ServicePlanner.jsx:509` ("Equipe", `worship_team` of the culto, "Tirar da equipe" without question); `CultoSection.jsx:153, 164` ("Equipe de louvor", "Excluir…" with question); `PhonesBlock.jsx:37-40` ("Equipe", the phone door with its own code); `menuBar.js` ("Pedidos da equipe", "Chat da equipe")
- Evidence: Same word for the musicians scale list and the volunteers who use the phone. "Tirar da equipe" in the planner removes from this culto only; "Excluir…" in Configurações deletes the person.
- Fix: Planner panel title "Escala"; phone side "Equipe no celular" in Configurações and the menus; keep "Equipe de louvor" for the people list.

### UX-116 — Phone: "código da igreja" and "Tela de Início" are leftovers
- Severity: P3
- Effort: S
- Confidence: High
- Location: `src/components/network/remote/MoreTab.jsx:61, 67`
- Evidence: "Ligado com o código da igreja." The sign-in page and Configurações name "Código do controle" / "Código da equipe", and CLAUDE.md retired the church code. The same details block says "Adicionar à tela inicial" and "Adicionar à Tela de Início" (the iOS menu's own wording, but unmarked as a quote).
- Fix: "Ligado com o código do controle" (or Equipe, by `state.role`); keep iOS's wording in quotes only.

### UX-117 — Canned message and timer presets are deleted without a question or Desfazer
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: `QuickTools.jsx:47, 63, 106, 116`
- Evidence: `dropPreset`/`dropTimer` call `.delete(p.id)` straight from an × button (tooltip "Excluir esta mensagem pronta"). Every other "Excluir" goes through `useConfirm` (CLAUDE.md copy rules). No toast on success, no Desfazer. (This is the Painel, the other reviewer's area; listed for the pattern.)
- Fix: A toast with Desfazer (re-create the row) is enough; or `useConfirm` for consistency.

### UX-118 — Configurações › Console: a hint says "deste computador" for a setting that is the church's
- Severity: P3
- Effort: S
- Confidence: Medium
- Location: `settings/ConsoleSection.jsx:55-70`; `src/pages/Console.jsx:446-449`
- Evidence: Densidade: "da igreja, viaja no backup" (it is `console_density`, a pref), but Restaurar says "volta os painéis, a densidade, os tamanhos e a ordem … · deste computador"; its handler also writes `console_density` and `console_hidden_modules` prefs (`Console.jsx:447-449`). Restaurar on one computer changes the church's density for the others; Módulos says "deste computador" yet is written to the same church pref.
- Fix: Either keep density and module visibility in `layout` (this computer), or change the hints to say what Restaurar resets for everyone.

## 3. What is done well (do not break)
- `WinBar`/`WinNav`/`CfgGroup` are used on every page; groups, summaries and the search index follow the recorded rules; unsaved guards ("Descartar as mudanças?", `useConfirm`) exist on Música, Aviso, Material, Tema, Tela.
- Delete/exclude goes through `deleteQuestion` + `useConfirm` on Mídia, Fundos, Temas, Modelos, Equipe, Planejar, Aviso, Música, Material, Pedidos.
- Dialog button order is action then Cancelar everywhere I read; every file picker except fonts goes through `uploadFile`; IconBtn forces a title and aria-label; phone targets are 44 to 56 px and carefully commented.
- Rename and delete keys (F2/Delete) are listed through `keyHint`.

## 4. Open questions (for Davi)
1. Planejar o culto "Salvar" (owner 2026-11-17, "apenas salva") is a decision; should the button stay brand-coloured now that the other editors use brand for a real commit? (UX-103)
2. Does Electron show a save dialog for `<a download>` from Relatórios, or does it write straight to Downloads? There is no `will-download` handler in `electron/*.cjs`. (UX-113)
3. Does the "click again" armed state in PhonesBlock/RedeSection ever expire? I found no timer. (UX-101)
4. `.rm-lchip` is 34 px high in landscape (`remote.css:482`), under the 44 px rule; its inner × is a 32 px circle with a 48 px hit area (`:29-30`). Is the chip itself meant to be a target? Not confirmed.
5. CLAUDE.md says `console_hidden_modules` "nothing writes any more"; `Console.jsx:449` writes it. Which is current? (UX-118)

## 5. Handoffs to other passes
- A11Y/COPY: `Primeiros passos` and Atalhos wording (UX-107, UX-108) belong to pass 6 as well.
- FUNC: `SyncDuplicates.jsx:50-55` (Juntar) merges with several sequential writes, not one batch; a failure midway leaves rows rewritten but songs not deleted.
- Console panels reviewer: `QuickTools.jsx` preset deletes (UX-117), `Layers.jsx:328` "Editar tema…" (UX-109).

## 6. Top 5 changes with the biggest impact
1. Move "Trocar o código", "Remover" PIN, Importar/Restaurar/Instalar and the backups Seg to `useConfirm` danger dialogs (UX-101).
2. Make the Editor da tela say which half autosaves and which is a draft (UX-102), then make every page declare autosave vs draft the same way (UX-103).
3. Put the three connection features under one Configurações › Conexões and keep the menu names (UX-106).
4. Replace the 13 raw colour inputs with ColorPop and the screen editor's inline gallery with the library (UX-104, UX-105).
5. Fix Primeiros passos step 2 and the Atalhos list so the first-run help matches the shared Setlist (UX-107, UX-108).
