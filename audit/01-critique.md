# PASS 1 — Design critique

Skill: `design:design-critique` (available in this session); its framework
(first impression, usability, hierarchy, consistency) was applied through the
pass's 7-point checklist, and findings use the shared table format.

Inputs: audit/screens/01–10 (1366×768), plus the side-panel preview
(`keryx-ui`, sample data) walked at 1024×768, 1280×720, 1366×768 and
1920×1080. New captures, all from the preview:

- `1-air-and-prevw-1366x768.jpg`: a song on air with another in the Prévia
- `1-air-and-prevw-1280x720.jpg`: the same at 1280×720, with a Bíblia
  passage in the Prévia
- `1-biblia-missing-edition-1366x768.jpg`: the Bíblia with the quick jump to
  an edition that isn't installed
- `1-biblia-saidas-1366x768.jpg`: the Saídas popover
- `1-camadas-fundo-menu-1366x768.jpg`: the Camadas drawer and the Fundo menu
- `1-background-library-1366x768.jpg`: the background library, a picture
  selected
- `1-editor-tela-projecao-1366x768.jpg`: the Editor de telas
- `1-editar-disposicao-1366x768.jpg`: Ver › Editar disposição
- `1-tela-preta-avisos-1366x768.jpg`: Tela preta on, Biblioteca › Avisos

Scope: what the operator sees and does. Code is cited only to locate a screen
element. Contrast numbers, tokens, code quality and motion are left to the
later passes.

## Findings

| ID | Severity | Location | Issue | Why it matters | Fix (one line) | Effort S/M/L |
|----|----------|----------|-------|----------------|----------------|--------------|
| CRIT-01 | Major | Editor de música, left column "Cifra" block (`src/components/console/SongEditor.jsx:396-404`) vs the Letra's Acorde chips | A song has two places for chords. Inline `[G]` goes in the Letra (the Acorde chips, Tom − / +). The legacy "Cifra" block, with the placeholder "Acordes para o Palco (opcional)", is always shown and editable. The code calls that block "legacy". | In flow 1 a first-time operator types the chords into the box that names the Palco and never learns about the inline chords the screens actually use. Two sources then drift apart. | Show the Cifra block only when it already has text, and give it a single action ("Colocar na letra"). Keep "Importar cifra" next to the Letra. | S |
| CRIT-02 | Major | Slides column footer, Anterior / Próximo (`SlidesPanel.jsx:87-91`) | When an item is in the Prévia, the column lists the Prévia's slides and its counter reads "prévia 1/2". The two buttons directly under that list still move the slide on air (`c.moveSlide`, "Slide anterior no ar · ←"). | The buttons sit under one item and act on another. A click meant to step through the prepared song changes what the audience sees. This is the ambiguity the audit goal rules out. | While the column shows the Prévia, label the pair as acting on air ("No ar ◀ ▶") or hide it. Either way the counter and the buttons name the same item. | S |
| CRIT-03 | Major | Slides column tabs "No ar · …" and "Prévia · …" (`SlidesPanel.jsx:59-65`, `console.css:339`); the Programa pill's title at 1280×720 | At 1366 the tabs cut mid-word with no "…": "No ar · Canção de exe" and "Prévia · Canção de ex" (253→153 px and 224→137 px). The song name and the "2/3" are lost. `text-overflow` has no effect on the inline-flex button. At 1280 the pill, the only caption of the air, reads "Canção de exemplo · Gra…". | When the air and the Prévia hold the same kind of item (two songs with similar names), the operator can't tell from the tabs which is which. The position "2/3" disappears too. | Put the title in its own ellipsized span, let the dots stand for "No ar"/"Prévia", and keep "n/m" outside the clipped part. | S |
| CRIT-04 | Major | Setlist row state (`Rundown.jsx:77`, `airItemId = c.cur?.session?.itemId` in `src/pages/Console.jsx:402`) | After Esc (and after a reload), the last item sent stays red (`is-air`) in the Setlist while the Programa says "Nada no ar". The Biblioteca drops the red for the same song, and the controle remoto still labels it "no ar". | The Setlist is where the operator looks during a service. Red there says the song is still on the screens. The two lists disagree about the same item. | Use `is-air` only while that item is really on air. Once nothing is, mark the session's last item with its own quieter "último" state. | S |
| CRIT-05 | Major | Output names: Saídas popover and Telas e saídas (`electron/outputs.cjs:8-14`) vs the Editor de telas rail and the views (`src/lib/network/views.js:45-60`) | The same outputs carry different names. Saídas has "Projeção principal", "Letras (tela de letras)", "Comunicação" and "Tela do pastor". The Editor's TELAS list has "Projeção", "Letras", "Avisos" and "Pastor". The code says this is on purpose ("each surface has its own factory label"). | Flow 3: the operator turns on "Comunicação" in Saídas, then can't find it in the Editor, which says "Avisos". This breaks the copy rule of one word per concept. "Letras (tela de letras)" says the same thing twice. | Give each output one factory name, used by every surface: Projeção, Letras, Vídeo, Avisos or Comunicação (pick one), Palco, Pastor. | S |
| CRIT-06 | Minor | Editor de música, Letra column help line (`SongEditor.jsx:492`) | The one sentence that explains the syntax ("[G] dentro da linha é acorde; [Refrão] sozinho na linha é o nome da parte…") is cut off at the bottom of the column at 1366×768 and 1280×720 (screens 05 and the 1280 walk). | It is the only place the lyrics syntax is explained, and the end of it is missing. | Let the line wrap above the textarea, or put it in a tooltip on the Acorde row. | S |
| CRIT-07 | Minor | Editor de música, "Estilo desta música" (`SongEditor.jsx:405-425`) | The song's look uses its own words: "Estilo", "Tema padrão (estilo de fábrica)", "Tema · …", "Próprio" and "Copiar para o visual próprio". The rest of the app says Tema, and "Visual" was retired with "Visual do culto". | One concept has three names, so the operator can't link this select to Temas, Temas padrão or Camadas. | Call it "Tema desta música" and its options "O mesmo das músicas", "Tema …" and "Só desta música"; drop "visual". | S |
| CRIT-08 | Minor | Editor de música title bar (screen 05; WinBar actions) | "Excluir…" sits in the same row and weight as Imprimir, Cancelar and Salvar, one item away from Cancelar. | A destructive command next to the routine exits. It does ask first, but the placement invites a slip at the end of an edit. | Move Excluir… to the song's right-click menu, or set it apart at the left of the bar. | S |
| CRIT-09 | Minor | Planejar o culto add bar (`ServicePlanner.jsx:26, 349`) | The row Música · Bíblia · Vídeo · … · EBD · Seção has no "Adicionar" label, and "Música" is pre-outlined, so it reads as a filter on the list above. "EBD" is the only abbreviation; the rest of the app says "Escola bíblica". | A first-time operator (flow 1) won't see this as the way to add items until they click it. "EBD" doesn't match the menu or the page title. | Prefix the row with "Adicionar:", don't pre-outline one type, and write "Escola bíblica". | S |
| CRIT-10 | Minor | Planejar o culto › Culto, "Papel de parede" (`ServicePlanner.jsx:259`; screen 06) | The empty value is the phrase "o de qualquer outro culto", cut to "o de qualquer outr…" at 1366 and 1280. | The row meant to answer "which wallpaper does this culto use?" shows a fragment. | Show a short value ("Qualquer outro culto") and keep the full phrase in the tooltip. | S |
| CRIT-11 | Minor | Configurações › Temas e fundos with no themes (`settings/TemasSection.jsx:128`; `library/BackgroundLibrary.jsx:216`; screen 03) | The empty state says "ajuste o texto em Camadas e salve como novo", but Camadas no longer edits the text look. The library's empty Temas tab points to "Configurações › Temas", a section that is now "Temas e fundos". The four Temas padrão boxes are blank grey rectangles captioned "Estilo de fábrica". | Flow 1 for a new church: the hint sends the operator to a control that isn't there. The blank boxes read as missing previews, not as "the factory look". | Point the hint at "Novo tema…" or the Editor de temas, fix the section name, and draw the factory look in the four boxes. | S |
| CRIT-12 | Minor | Background library, factory photos (`1-background-library-1366x768.jpg`) | The factory pictures are named "Fundo 1" to "Fundo 16". One of them ("Fundo 14") is a close portrait of a smiling man. | Names that say nothing can't be searched or told apart in a select. A stranger's face is an odd default worship background for any church. | Give them descriptive names ("Montanhas ao amanhecer"…) and drop the portrait from the factory set. | S |
| CRIT-13 | Minor | Camadas, layer eyes (`Layers.jsx:90, 229-241`; `1-camadas-fundo-menu-1366x768.jpg`) | An empty layer looks exactly like one the operator hid: eye-off, dimmed row, menu "Mostrar". With nothing on air, all four layers (Logo, Sobreposição, Texto principal, Fundo) look hidden, and after Esc the Texto principal offers "Mostrar" with nothing to show. | Live, the operator can't tell "I hid the text" from "there is no text". A click on "Mostrar" then does nothing visible. | Give the empty state its own look (no eye, "vazio" muted) and keep eye-off for layers actually hidden. | S |
| CRIT-14 | Minor | Tela preta / Logo while lyrics are on air (`1-tela-preta-avisos-1366x768.jpg`) | With Tela preta on, the Slides column keeps the on-air slide gold and the Setlist keeps the song red, with no mark that the audience sees black. Only the pill says "Tela preta". | Stepping slides under Tela preta changes what comes back, and the column the operator is working in doesn't say the screens are covered. | While Tela preta or Logo is on, dim the Slides/No ar on-air state and add a "coberto · Tela preta" note to the column header. | S |
| CRIT-15 | Minor | Bíblia headers at 1366×768 (`BibleEnv.jsx` Livros header; Texto header; `1-biblia-missing-edition-1366x768.jpg`) | The Livros title is cut to "LIVR…" by the version select, Abrev\|Nomes, + and the grid icon in a 300 px column. The Texto hint is cut mid-word ("clique ou ↑↓ sel…") instead of being dropped, as CLAUDE.md's header rule says. | The module name is the first thing cut, and a half hint is noise in a header that is meant to stay one clean line. | Drop the hint before it truncates, and let "Livros" win over Abrev\|Nomes (move that into the view menu at this width). | S |
| CRIT-16 | Minor | Bíblia, Selecionado with a chapter that can't load (`BibleEnv.jsx:488, 496`) | The header says "Selecionado · Salmos 23:1 · capítulo a partir daqui" while the body says "Nenhum versículo selecionado · Clique num versículo…". | The same panel claims a selection and denies it, in an error state where the operator needs one clear message. | When the chapter is unavailable, say so in Selecionado ("Salmos 23 indisponível nesta versão"), not "nenhum". | S |
| CRIT-17 | Minor | Bíblia, No ar agora monitor (`BibleEnv.jsx:485`, `console.css:209`) | The monitor always has a red ("on air") frame, even when the header says "No ar agora · nada". The culto's Programa has no frame. | Red means live everywhere else in the console, so a red frame around nothing reads as a fault. The two environments also draw the same monitor differently. | Frame it red only while something is on air, as the pill's dot does. | S |
| CRIT-18 | Minor | Ver menu (`src/lib/console/layoutChoices.js:11`); Editar disposição tray (`1-editar-disposicao-1366x768.jpg`) | "Painel de abas" (Notas, Aviso rápido, Timers) is a module that can go to the tray, but Ver doesn't list it. At 1366 and 1280 it starts in the tray, so only Editar disposição brings it back. Its header says "Painel"; the tray says "Painel de abas". | On a notebook the operator's Notas (and the item notes) have no obvious way back, and the module goes by two names. | Add it to Ver's module switches under one name. | S |
| CRIT-19 | Minor | Programa column density (1366×768 and 1920×1080 walks) | At 1366 the Programa monitor is 629 px wide in a 782 px column (153 px empty at the sides). At 1920 the Programa panel is 726 px tall but the monitor and player fill about 663, which leaves an empty band between the player and the Prévia row. | The most valuable area on a notebook, next to the live image, holds nothing, while the Slides and Setlist lists are cramped. | Let the centre column give its spare width or height to the Prévia row (or the neighbours) when the 16:9 can't use it. | M |
| CRIT-20 | Minor | Menus and labels (`Popovers.jsx:52, 85, 191`; logo menu; Culto menu) | Labels are inconsistent: "Atalhos do teclado" (Ver) vs "Atalhos" (logo menu); "Verificar tudo" (logo menu) vs "Verificar tudo…" (Saídas); "Planejar o culto" and "Configurações" open a page without "…" while "Modelos de culto…" and "Sobre o KERYX…" have it; "legenda para a live no OBS" uses English. | The copy rules ask for one word per concept and no English UI words. The Windows convention for "…" (more input follows) is applied unevenly. | Use one label per command everywhere, apply "…" by one rule, and say "transmissão ao vivo". | S |
| CRIT-21 | Minor | "Biblioteca" and "Enviar" (`Library.jsx:170`, `MediaView.jsx:204`, `menuBar.js:64`) | "Biblioteca" names the left panel, "Biblioteca de mídia" (a page titled "Mídia") and the background library ("Abrir a biblioteca…"). On the Mídia page the upload button says "+ Enviar", while the menu says "Enviar arquivos…" and everywhere else "Enviar" means "Enviar ao ar". | The verb that puts things on the projector also uploads files, and three places share one name. | Name the button "Enviar arquivos…" and the page "Mídia" everywhere; keep "Biblioteca" for the panel and say "biblioteca de fundos" for the other. | S |

## What already works

- **Live keys:** Enter, ←/→, B and Esc did what CLAUDE.md says, and Esc's
  toast "Projeção encerrada · Desfazer" is clear.
- **Bíblia quick jump:** typing "sl 23 1" filled Livro, Capítulo and
  Versículo live, with "Enter seleciona · Enter de novo projeta".
- **Prepare-then-send states:** green for the Prévia and red/gold for the air
  are consistent across the Biblioteca, the Setlist and the Prévia badge.
- **Saídas popover:** one row per output with a plain state word, Travar
  telas and Tela ociosa in the same place.
- **Empty and loading states:** most have them ("Nenhum item em mãos · Clique
  num item da Setlist ou da Biblioteca.", "Lendo as telas…", the Configurações
  skeleton, the Bíblia's "Capítulo indisponível" with its reason).
- **Right-click menus:** the Biblioteca's song menu ends with "Enviar ao ar"
  after a separator, and "Excluir…" asks first.

## Flow notes

- **1. Prepare a culto.** Most likely stuck in the Editor de música: two
  chord inputs (CRIT-01), with the syntax help cut off (CRIT-06). On a church
  with no themes, the Temas empty state points to Camadas, which has no text
  controls (CRIT-11).
- **2. Run it live.** Most likely stuck when the Prévia holds one item and
  the air another: the Slides tabs lose the names (CRIT-03) and Anterior /
  Próximo under the Prévia's slides move the air (CRIT-02). After Esc, the
  Setlist keeps saying the song is on air (CRIT-04).
- **3. Set up the screens and the church.** Most likely stuck matching
  outputs between Saídas and the Editor de telas, whose names differ (CRIT-05).
  On a notebook, the Painel de abas is missing from Ver (CRIT-18).

## Needs manual check

- **Screen actions in the pill (owner's pick B):** Tela preta, Logo, Limpar
  and Encerrar are glyph-only ~24 px buttons on the live image
  (`CenterPanel.jsx:125-129`), with labels only in tooltips. Owner: are glyphs
  enough in a dark room, or should Tela preta and Logo carry a word at ≥1366?
- **Two "on air" colours (owner decision 2026-10-14):** gold in the Slides
  column and No ar, red in the Biblioteca, Setlist, pill and Bíblia. Confirm
  this still reads as one state to volunteers.
- **Temas with no themes:** the 9 dashed "+" slots take about 206 px above
  the Setlist (wide tier) and fill the Camadas drawer (owner decision: "the
  Temas panel is its 9 slots"). Should an empty church get one line instead?
- **Planned times:** the Setlist and the planner show clock times per item
  and "termina às 19:22" even with "Previsão do culto" off. The owner's
  2026-10-12 note says the church plans order only. Keep them?
- **Send verbs:** "Ir" (Setlist), "Tocar" (Mídia) and "Projetar" (Escola
  material rows, `SchoolView.jsx:182`) send to air, beside "Enviar ao ar"
  elsewhere. design-system.md lists them; the copy rule says one word per
  concept.
- **"Qualquer outro culto…" in the Camadas › Fundo menu** (owner's wording):
  out of the Configurações context, the label doesn't say it is about the
  papel de parede.
- **The song's own look ("Próprio": font, size, colour, effect, background
  in the Editor de música)** next to "the Editor de temas is the only place a
  theme is edited". Is that intended as a second look editor?
- **Projeção idle / Logo:** the bundled `resources/branding/church-logo.jpg`
  is a square photo with the mark over it, so the projector shows a
  hard-edged photo tile on the dark ground (screen 09). Check on the church
  projector; a transparent PNG of the mark may be wanted.
- **Mídia:** both sample images show black thumbnails with "0:10"
  (screen 07). Check on the desktop whether real images get their still.
- **Bíblia without the edition:** in the preview the error state offers no
  button. The code shows "Instalar …" on the desktop (`BibleEnv.jsx:451`);
  verify there.
- **Backup e atualizações:** the preview shows only "Não foi possível ler os
  dados". Judge the real section on the desktop.
- **Window chrome, DPI and focus:** the titleBarOverlay caption buttons over
  the top bar, 150 % scaling, and real output windows aren't visible in the
  browser preview.
- **Slide row states:** check that on air (gold at 24 % over bg-2) and
  "next" (bg-3) stay apart on the church notebook's panel. This is for the
  contrast pass.
- **Doc drift for the SYS pass:** docs/design-system.md still calls slides
  and verses "cards", while CLAUDE.md (owner, 2026-10-14) says rows.

## Top 3 to fix first

1. **CRIT-02:** Anterior / Próximo under the Prévia's slides move the air.
   One click can change the projector by mistake.
2. **CRIT-04:** the Setlist keeps the last song red after Esc. The live list
   contradicts the Programa.
3. **CRIT-03:** the Slides tabs (and the pill at 1280) lose the item's name
   and position, so with two items in hand the operator can't tell air from
   Prévia.
