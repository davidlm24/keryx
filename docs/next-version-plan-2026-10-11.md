# Next cycle — owner feedback plan (2026-10-11)

Segue o modelo de docs/next-version-plan-2026-10-10.md: fatias viram PRs,
quem termina uma fatia anota aqui ("built"), e o release sai em lote quando o
dono pedir, pelo fluxo de rascunho (scripts/release-check.cjs).

## Contexto

Depois da 0.2.14, o dono revisou o app no preview e mandou 12 pedidos com prints:
Prévia, saídas personalizáveis, editor de letras, temas/fundos, mídia/YouTube,
cifras, configurações, timeline, Bíblia e busca. Este plano transforma os 12 em
PRs. Decisões já tomadas pelo dono (não reabrir):

1. **Prévia:** botões das saídas numa coluna à esquerda do monitor, ícone + nome;
   um monitor só (sem telinhas).
2. **Saídas:** as 6 continuam fixas, mas cada uma ganha nome, ícone e tipo de
   conteúdo escolhidos pelo usuário, e personalização visual completa com prévia
   ao vivo em Configurações.
3. **Cifra:** dentro da letra, `[G]Deus é [D]fiel` (ChordPro). Projetor remove;
   Palco mostra o acorde sobre a sílaba, transponível.
4. **Bíblia:** colunas Livros | Capítulos (leitura embaixo) | Versículos |
   No ar + Selecionado (direita como hoje), separadas por linhas.
5. Escurecer/desfoque dos fundos = ponto de partida; categorias fixas + livres
   (decisões anteriores, continuam valendo).

Exploração e desenho detalhado já feitos (3 agentes de exploração + 1 de plano);
os pontos críticos verificados estão anotados em cada fatia.

## Fatias (PRs), em ordem

| # | PR | Itens | Tamanho | Depende de |
|---|---|---|---|---|
| 1 | `previa-rail-left` + busca no centro | 1, 12 | S-M | — |
| 2 | `editor-fixes`: reflow 2/4 linhas + overflow + Letras-config | 3, 6, 9 | M | — |
| 3 | `telas-nome-icone` | 2 (parte A) | S-M | — |
| 4 | `telas-ajustes-preview`: Palco/Pastor + prévia ao vivo | 2, 8 | M | 3 |
| 5 | `cifras-na-letra` | 7 | M-L | 2 (reflow), 4 (StageScreen) |
| 6 | `temas-fundos`: biblioteca unificada, upload, vídeo, presets | 4 | L | — |
| 7 | `media-tabs-youtube`: Imagens/Vídeos + YouTube na setlist | 5 | M | 6 (leve) |
| 8 | `biblia-colunas` | 11 | M-L | — |
| 9 | `timeline-estudo`: doc + mockup, SEM implementação | 10 | S-M (doc) | — |

1, 2, 3, 6, 8, 9 podem andar em paralelo. Cada PR: `npm test`, lint, build,
preview; smoke anunciado uma vez no fim da fatia. Release só quando o dono pedir
(fluxo de rascunho novo: `scripts/release-check.cjs <v> --publish`).

---

## 1 · Prévia: botões à esquerda + busca no centro (itens 1, 12)

**Built** (release session, 2026-10-11) — o PR desta fatia inclui este doc.

**Rail fora do monitor.** Em `CenterPanel.jsx`, o `.prev-rail` sai de dentro do
`.kx-mon` e vira uma coluna `.prev-outs` à esquerda do monitor da Prévia, no
`.subrow`: `[coluna de botões ~110px] [monitor 46%] [.side com Enviar ao ar]`.
Cada botão: `Icon` + nome (`useRailViews()` quando a fatia 3 entrar; antes,
`RAIL_VIEWS`). Abaixo de ~380px de container, os nomes somem e ficam só os
ícones (container query). A escolha continua por sessão (decisão registrada no
CSS); a altura dos monitores não muda, então a constante 0.82125 do
`.liveblock` (console.css L105-112) não muda — conferir de todo modo a 960×600.
- CSS: remover `.console .prev-rail` absoluto (L705-714) e o
  `padding-right:36px` do `.net-stage.net-embed`; criar `.prev-outs`.
- Smoke: reescrever `railFits` (botões dentro do `.subrow`, não mais do
  monitor) e os seletores de `prevRail`/`prevRailScreens` (aria-labels
  "Prévia como X" continuam).

**Busca no centro.** `console.css` L99: `.palette` passa a `left:50%;
transform:translateX(-50%)`, sem `paletteWidth()` (Console.jsx L537-542, L674).
Reverte a decisão da 0.2.13 "a busca não cobre o Programa" — pedido explícito
do dono; o scrim já escurece o fundo. Smoke `paletteClear` (L1688-1701) troca a
asserção "não cobre o Programa" por "centrada no viewport". Atualizar os
comentários (Popovers L258-263) e `docs/design-system.md`.

## 2 · Editor: reflow, overflow, Letras-config (itens 3, 6, 9)

**Built** (release session, 2026-10-11, PR #76).

**Reflow (3).** Novo `reflowLyrics(lyrics, lines)` em `src/lib/songImport.js`:
para `lines` 2/4, repica cada estrofe em blocos de N linhas separados por linha
vazia, `[Label]` fica na primeira; para "Estrofe" não mexe (não dá para
re-fundir — avisar no title do Seg). Ligar no Seg do split (SongEditor L317):
`setLyrics(reflowLyrics(...))` além do `setSplit`. Timings: se a contagem de
slides mudar, zerar `starts` e avisar com `c.say`. Testes em
`songImport.test.mjs` (o teste L39-46, que pinava lyrics não-refluídas, muda).
Smoke: asserção nova de que o textarea muda junto com os thumbs.

**Overflow (6)** — achados medidos pelo explorador, corrigir todos:
- `.ed-tools` (linha dos marcadores): `flex-wrap: wrap` (estoura em TODA
  largura — a coluna do meio é 480px e a linha soma ~600px).
- Seg de tamanho PP…GGG (coluna esquerda a 280px): reduzir padding/fonte ou
  permitir 2 linhas.
- `.ed-thumbs.is-l`: `minmax(320px,1fr)` → `minmax(min(320px,100%),1fr)`.
- Painel de vídeo: `.ed-media` flexível (não `flex: 0 0 260px`) e header com
  wrap; `.ed-acts` (rodapé): `flex-wrap`.
- Smoke novo `edNoOverflow`: `scrollWidth <= clientWidth` nos painéis do editor
  a 1248 e 1366 (padrão do `barFits`).

**Letras em Configurações (9).** Remover a seção (ficou só o seg "Ao importar"
+ nota LRCLIB). O seg muda para onde é usado: o painel "Na internet"
(LyricsSearch) e o menu "+" da Biblioteca (grupo "Ao importar" com 3
MenuItems-check), ambos gravando o mesmo `keryx.import.lines`. Atualizar
`SECTIONS` (SettingsView), o loop `cfgSections` do smoke (lista de 8 → 7) e
`sectionIds` (deep link `?config=letras` morre — ok, é interno).

## 3 · Telas: nome e ícone por saída (item 2A)

**Built** (release session, 2026-10-11, PR #77). `outputLook` ganhou `custom`:
cada superfície mantém o rótulo de fábrica próprio quando nada foi escolhido.

Plano validado pelo agente (correções: janelas não têm título — não mexer em
`electron/outputs.cjs`; lan.cjs já recebe `store` e pode ler OutputPref).

- **Schema** `base44/entities/OutputPref.jsonc`: `name` (string, "") e `icon`
  (string, ""); `npm run db:schema`.
- **`src/lib/outputPrefs.js`**: `normalizePref` ganha name (trim, ≤40) e icon
  (`/^[a-z0-9-]{1,32}$/`); `outputMeta(path)` (padrões de RAIL_VIEWS +
  /StreamView), `outputLook(path, row)`, `ICON_CHOICES` (projector, tv,
  monitor, tablet, film, megaphone, book, image, text, star, layers, external).
  Fica aqui e não em views.js (evita import circular).
- **Hooks** em `useOutputPref.js`: `useOutputPrefRows()`, `useOutputLooks()`,
  `useRailViews()`. Sem linha no banco = exatamente o de hoje.
- **Consumidores**: rail (CenterPanel), popover Saídas e banner (mapear o
  label em `useOutputs`/useConsoleData, mantendo `src/lib/console/outputs.js`
  puro), TelasSection e RedeSection (apagar os dois `OUTPUT_ICON` locais).
- **lan.cjs**: `screenLabels()` via `store.call("OutputPref","list",[])`
  (best-effort, try/catch); `/api/screens`, `clients()` e `network.cjs info()`
  servem o nome custom → NetworkHome e RedeSection herdam.
- **UI**: OutputPrefCard ganha Nome (placeholder = padrão) e Ícone (botões
  ICON_CHOICES + "Padrão"); "Restaurar padrão" zera.
- **Testes**: outputPrefs.test (normalize, look, defaults = hoje),
  lan.test (linha custom e store quebrado), smoke: renomear Projeção → "Telão",
  ver popover + rail, restaurar ANTES dos checks `prevRail` (que pinam os
  aria-labels padrão).

## 4 · Telas: ajustes do Palco/Pastor + prévia ao vivo (itens 2B, 8)

**Built** (release session, 2026-10-11): o card de Ajustes virou duas colunas
com a prévia ao vivo (o renderer de verdade; amostra em `settings/sample.js`
quando nada está no ar), Palco/Pastor ganharam `options` + Escala, e um
Conteúdo escolhido torna a página uma view do renderer (OutputScreen).

- **Schema**: OutputPref ganha `options` (object, `{}`) — chaves por página;
  `text_scale` tipado continua servindo para todas.
- **Lib**: `STAGE_DEFAULTS { chords, clock, notes, next }`,
  `PASTOR_DEFAULTS { clock, next_count: 3 }` (0–5; 0 esconde), `stageOptions`/
  `pastorOptions`, `PREF_PAGES = PREF_OUTPUTS + /StageView + /PastorView`.
- **Páginas**: StageView/PastorView leem `useOutputPref` (padrão já usado por
  rede); `pref.content` vazio → layout próprio com `opts`; preenchido →
  `OutputScreen` (é isso que "tipo de tela" significa para Palco/Pastor).
  Cuidado verificado: `prefState` de página fora de OUTPUT_VIEWS cai na view da
  Projeção — o branch da página garante que Palco+content="" nunca chega lá.
  StageView passa a ler o live state inteiro.
- **StageScreen/PastorScreen**: props `opts`/`scale`; `--kp-text` multiplica os
  tamanhos em `net.css` (`calc(7.4cqmin * var(--kp-text,1))` etc.); padrão 1 =
  pixel-idêntico (o smoke `prevRailScreens` guarda isso).
- **Card com prévia ao vivo** (OutputPrefCard, duas colunas): controles à
  esquerda, prévia à direita — ScreenRenderer com `prefState` para as 4
  páginas-renderer, `StageScreen`/`PastorScreen` embed para as outras (retrato
  via `.kp-portrait`). Fonte da prévia: `c.live` quando há algo no ar, senão
  amostra via `applyOp` (extrair o SAMPLE da AparenciaSection para
  `settings/sample.js`; para Avisos, um `communication.show` enlatado).
  O rail passa os mesmos `opts` ao embed do Palco/Pastor.
- **Testes**: outputPrefs.test (options, clamps); smoke: Ajustes do Palco com
  prévia, desligar "Mostrar cifra" some da prévia e da janela real, Pastor
  `next_count=0` esconde a lista, Restaurar padrão no fim.

## 5 · Cifras na letra (item 7)

**Built** (release session, 2026-10-11). O módulo é `src/lib/chords.js`
(chordTranspose re-exporta dele); `songSlidesFor` em songImport.js monta
slides stripados + `stage.chordedSlides`; o Palco desenha `.ns-seg/.ns-ch`
com transposição própria (`.ns-trans`); editor ganhou "Montar com cifra na
letra" e "Colocar na letra". Corrigidos de graça: [Final]→[Ginal] e
Deus→Eeus no transpositor antigo.

Módulo novo **`src/lib/chords.js`** (puro, testado): `CHORD_RE` estrito e
ancorado (aceita G, Am7, G/B, C#m, C7(9), Gsus4; rejeita Verso, Final, Bridge,
x2, Deus — o `m(?!aj)` + `$` evita o bug real de hoje em que `[Final]` vira
`[Ginal]` no transpositor), `stripLine`/`stripChords` (linha só de acordes é
descartada; `[x2]` fica), `hasInlineChords`, `transposeInline` (raiz E baixo de
G/B), `chordLinesToInline` (cifra-sobre-letra → inline por coluna),
`parseChordLine` (segmentos para render).

**Regra de desambiguação**: marcador de seção = colchete sozinho na linha cujo
token NÃO é acorde; linha só com `[G]`/`[G] [D]` = linha de acordes (sai dos
slides); colchete inline que não é acorde fica literal.

**Strip em dois pontos** (cinto e suspensório):
- `slidesFromLyrics(lyrics, { lines, chorded })`: linhas stripadas para os
  slides, `chorded` paralelo 1:1 (mesmas linhas, mesmos cortes — invariante que
  mantém o reflow da fatia 2 seguro).
- `content.js songSlides`: slides salvos passam por `stripChords` no envio;
  `stage.chordedSlides: string[]` alinhado (stage é `loose()` — **nenhuma
  mudança no live-state**). Slides no banco ficam só stripados; a cifra vive na
  letra.

**Palco**: quando `chordedSlides[index]` existe e `opts.chords`, o slide atual
vira segmentos `.ns-seg > .ns-ch + .ns-tx` (acorde sobre a sílaba, wrap entre
segmentos, sem monospace); o `<pre>` lateral fica só para músicas legadas
(`song.chords` sem inline). Transpose: `transposeInline` para inline; o modo
legado ganha o guard `isChordLine` (conserta "Deus"→"Eeus") e slash chords.

**Editor**: `slideSpan` refeito para casar linha stripada com linha crua
(senão os menus de slide quebram — pinado pelo smoke `edSlideMenuOk`);
"Importar cifra" ganha "Montar com cifra na letra" (inline) e o campo legado um
"Colocar na letra" (converte; merge com letra existente fica FORA de escopo —
arriscado). Dica curta sob o textarea. Busca da Biblioteca stripa antes de
casar. `printSong`/PDF: conferir e stripar se preciso.

**Testes**: `chords.test.mjs` (matriz de tokens, strip, transpose, colunas),
songImport (alinhamento chorded nos 3 splits), `content.test.mjs` novo,
lyricFit (slideSpan com cifra), smoke: projetar `[G]Deus é [D]fiel` → projetor
sem `[`, Palco com G sobre "Deus", `+` vira G#.

## 6 · Temas e Fundos unificados (item 4)

- **Mover a FundosGallery de Aparência para Temas.** Temas passa a ter: em
  cima os **presets** (lista + editor novo: nome, fonte/tamanho/efeito/cores/
  caixa + fundo com fit/dim/blur, amostra ScreenRenderer ao vivo — reusar
  `themeStyle`/`themeLook`; hoje só dá para salvar tema a partir de Camadas);
  embaixo a **biblioteca de fundos** dividida **Imagens | Vídeos de fundo**,
  com botão **"Enviar do computador…"** → `importMediaFiles` (vira linha Media,
  aparece em "Suas imagens"/"Seus vídeos" em toda galeria — hoje os uploads do
  SongEditor/NoticeEditor não criam Media e somem). Aparência fica com
  transição + fundo de espera.
- **Fundos de vídeo**: linhas Media `type video` locais (YouTube não);
  BackgroundPref já aceita qualquer URL (`sourceOf`); Camadas › Fundo ganha
  tiles de vídeo mandando `background.set { kind:"video" }` (o renderer e o
  live-state já suportam — hoje nenhuma UI envia). Fundo próprio de música/
  aviso continua imagem (o renderer desenha `style.background_image` como CSS
  image); o fundo de espera continua imagem (`Idle` é `ks-bg-img`).
- **Galerias consistentes**: Layers/SongEditor/NoticeEditor passam a chamar
  `useBackgrounds(media)` (hoje passam `null` e não veem "Suas imagens").
- **Preset na hora, estilo Holyrics**: o "Tema:" do cabeçalho de Camadas vira
  um select permanente e visível que aplica no ar (`applyTheme`: content.update
  + background.set), e `is_default` (hoje escrito e nunca lido) passa a ser o
  tema inicial. Opcional pequeno: chip "Tema ▾" no cabeçalho do Programa com o
  mesmo select.
- ProjectionTheme ganha os campos que faltam para um preset completo
  (`text_align`, `text_position`, `transition`) — jsonc + db:schema.
- Testes: unit para o merge do editor de temas; smoke: criar tema no editor,
  aplicar pelo select de Camadas, upload de fundo aparece na galeria do editor
  de música; os checks `bgPref*` existentes continuam.

## 7 · Biblioteca Imagens/Vídeos + YouTube na setlist (item 5)

- **Tabs da Biblioteca** (`Library.jsx` L43): Letras | **Imagens** | **Vídeos**
  | Avisos (+Setlist no compacto). Imagens = Media type image/gif; Vídeos =
  video + YouTube + seção "Áudios · Tocar em sequência" (áudio mora na aba
  Vídeos — é a aba audiovisual; se o dono preferir aba própria, é 1 linha).
- **YouTube guardável**: extrair o `addLink` do MediaView para
  `mediaFromYouTube(url)` em `mediaImport.js`; o campo do YouTube ganha
  `dragProps` e um botão "Guardar" (cria Media) ao lado de "Tocar";
  `addStageToSetlist` (Console.jsx L273-292) ganha o branch `yt:` que cria/
  reutiliza a linha Media e grava `contentId` num ServiceItem VIDEO. Sem campo
  novo no ServiceItem. Nota: item da setlist toca via `media.show` (projetor);
  "Tocar" direto continua `video.show` (canal de vídeo) — manter e documentar.
- Smoke: `mvYouTube` continua; novo check de arrastar/guardar o link na setlist.

## 8 · Bíblia em colunas (item 11)

Layout aprovado: **Livros | Capítulos (leitura embaixo) | Versículos |
No ar + Selecionado**, separados por `border-left` (`--line`).
- `BibleEnv.jsx`: a `.bband` deixa de ser faixa horizontal; vira grid de
  colunas. Coluna 1: busca em cima + os 66 livros em lista/grade vertical
  estreita (barra de cor por grupo, Abrev|Nomes continua). Coluna 2: grade de
  capítulos em cima, painel de leitura (Ler/Buscar/Comparar) embaixo — a
  leitura continua no meio como hoje. Coluna 3: células de versículos na
  vertical. Coluna 4: inalterada. Recentes/Favoritos/Anotações: chips no topo
  da coluna 2.
- CSS: substituir `.bband/.bgrid/.chapters/.bverses` horizontais (console.css
  L208-259) por colunas; manter os folds de altura (680/760px) adaptados.
- **Smoke**: reescrever o bloco L1012-1096 (bibleNoScroll vira "cada coluna sem
  scroll horizontal e Salmos 150 alcançável", bibleShort, bibleVerseRow,
  bibleNames, seletores novos) e conferir o veredito L1854+. Atualizar
  `docs/design-system.md` L175-193.

## 9 · Timeline: estudo, não implementação (item 10)

O dono pediu "vamos estudar bem essa parte". Entregável: documento
`docs/timeline-redesign-<data>.md` + mockup navegável (HTML estático no
preview ou artifact) com: timeline estilo editor (track mais alta, blocos por
item com ícone do tipo, sombreamento do decorrido real vs planejado — o log
hoje é localStorage por culto, `Console.jsx` L44; avaliar movê-lo para o live
state via `session.itemAt`), marcador de transição entre vídeos consecutivos
(campo futuro `transition` no ServiceItem), zoom/scroll. SEM código de produção
neste ciclo; o doc termina com perguntas fechadas para o dono escolher.

---

## Verificação (cada fatia)

- `npm test` (os arquivos de teste citados por fatia), `npm run lint`,
  `npm run build`, preview no navegador (reiniciar o server quando live-state/
  schema mudarem) com screenshot para o dono.
- Smoke do desktop uma vez no fim da fatia, **anunciado antes** (abre janelas e
  toca tom ~5 min); atualizar os checks pinados listados em cada fatia — vários
  pinam seletores/textos exatos (railFits, prevRail*, paletteClear, edFit,
  edSlideMenuOk, cfgSections, bloco da Bíblia).
- Duas janelas para features de projeção (console + saída real/rede).
- PR por fatia; merge e release só quando o dono pedir.
