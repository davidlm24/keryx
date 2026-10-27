# Holyrics × SPresenter × KERYX — comparação

Data: 2026-10-11. Feita olhando os dois programas abertos no PC da igreja (Holyrics 2.30.0, SPresenter free) e o código do KERYX deste repositório.

## Como ler

- **Visto** = abri a tela e li. **Não visto** = o recurso existe no menu, mas não abri, ou o programa estava vazio.
- Nada foi salvo, criado ou projetado de propósito. Dois efeitos colaterais, já desfeitos: no Holyrics, um clique direito selecionou outro tema por alguns minutos (voltou ao original); no SPresenter ficou um item de teste na setlist (criado por você).
- As senhas de acesso por celular do Holyrics não foram reveladas.
- O SPresenter estava sem músicas, temas ou setlist, então vi estrutura, não uso real. O Holyrics tem a biblioteca real da igreja.
- Do KERYX, tudo vem de `CLAUDE.md`, `README.md`, a proposta do presenter de 09/10 e `CenterPanel.jsx`. Não renderizei o KERYX nesta sessão.

## Lado a lado

| Área | Holyrics | SPresenter | KERYX hoje |
| --- | --- | --- | --- |
| Janela principal | Colunas: biblioteca, setlist/slides da música, **uma prévia grande**, anotações/mídia, coluna de temas | Painéis: setlist, painel central (Bíblia/letra), monitor + medidores + camadas, biblioteca de mídia, painel de abas | Console único: Biblioteca, Slides, **coluna ao vivo** (Programa, Prévia, Enviar ao ar, player, Próximo), Setlist |
| Modelo de "ao vivo" | O que está na prévia grande é o que sai; clicar em slide/tema aplica | Camadas (Fundo, Conteúdo) com olho liga/desliga; clique direito limpa | Prévia prepara; Enter, duplo clique ou "Enviar ao ar" manda; Travar telas para ensaiar |
| Setlist | Lista da música aberta + Escala (por integrante ou função) | Setlist com "+": Letra, Bíblia, Apresentação, PDF/PPTX, YouTube, Macro | Setlist com seções (SECTION), relógio do culto, "Depois" |
| Bíblia | **Página própria**: 66 livros em blocos coloridos por grupo, capítulos e versículos em grade, Favoritos, Histórico, 3 versões | Painel no centro: livro/capítulo, busca em todas as versões, 4 visões (Detalhado, Grade, Card, Lista) | Ambiente próprio: Ler, Buscar, Comparar, notas; salto rápido "jo 3 16" |
| Temas | Por música ("Salvar Tema para Música") e por saída; editor com abas (fonte, efeito, cor de fundo, contorno, comentário...) | Tema padrão por saída e tipo; **editor de canvas por verso** (texto, formas, imagem, vídeo, web, QR) | Temas e Fundos unificados (presets com editor ao vivo, biblioteca com vídeos) |
| Saídas | Public + HTML-Image + HTML 1/2/3, Multiview, NDI; cada saída com **filtro de conteúdo** | Principal + Retorno (Stage); destinos por saída; 3ª tela é PRO | Projeção, Letras, Vídeo, Comunicação, Palco, Pastor, Transmissão (OBS), com ajustes por saída |
| Palco / retorno | "Visão do Palco" nas saídas HTML (comentários, próximo versículo/imagem) | Aba "Retorno" com relógio e timer, tema próprio | Palco e Tela do pastor, próprias do KERYX |
| Avisos | "Mensagem Personalizada" (Chamar pessoa, Carro, Kids, Baby) + Painel de Comunicação | Aba "Avisos": mensagem, "limpar após N s", "só no retorno" | Aviso rápido + Avisos como camada de comunicação |
| Timers | Contagem regressiva (Ferramentas) | Aba "Timers" com presets (5, 10, 15, 30, 60 min), formato, ±tempo | Não vi no que li |
| Player de mídia | Faixa fina **acima** da prévia, recolhível | Aba "Controle de mídia" no painel de baixo | Slot reservado de 36 px **entre o Programa e a Prévia** (desde 2026-10-12) |
| Controle remoto | App de celular com 5 senhas separadas | Página remota por QR + API HTTP com tokens | Telas na rede **só leem**; o console nunca é servido |
| Automação | JavaScript, API local/web, plugin | **Automações**, **Macros**, plugins isolados, MIDI (PRO) | Não tem |
| Perfis | — | Perfis com PIN, administrador | Um operador local (decisão do projeto) |
| Backup | Restaurar Arquivos, Apagar dados | Backup `.sbk` + export separado das saídas `.spo` | Backup e importação de zip |
| Cifra/letra | Editor de letras próprio | "+cifra", "nota", "grupo" por estrofe, campo Tom | Cifras na letra: `[G]Deus é [D]fiel` |
| Ajustes | Janela com 8 abas | Janela com barra lateral agrupada (Sistema, Exibição, Conteúdo, Controle, Integrações) e busca | Seções: Igreja, Aparência, Telas, Temas, Bíblias, Rede, Dados |

## O que cada um faz melhor

**Holyrics**
- **Filtro de conteúdo por saída:** cada saída decide se mostra Letras, Bíblia, Alerta, Texto, Imagem e Anúncios. O palco pode ter comentário e o projetor não.
- **Página da Bíblia:** os blocos coloridos por grupo de livros são rápidos de usar e o mapa dos 66 livros fica sempre à vista.
- **Mensagens prontas:** avisos de poucos toques ("Chamar pessoa", "Kids").
- **Multiview:** um monitor com quatro quadrantes para ver várias saídas ao mesmo tempo.
- **Leitura alternada:** rótulos (por exemplo "Church"/"Leader") nos versículos alternados.

**SPresenter**
- **Tema por verso:** um slide diferente para cada estrofe, num editor de canvas.
- **Abas operacionais:** Avisos e Timers como abas do mesmo painel, com saída escolhida na própria aba.
- **Painéis editáveis:** um modo de editar painéis e layouts salvos ("Louvor", "Bíblia").
- **Exportar a configuração das saídas** (`.spo`), útil antes de reinstalar ou trocar de máquina.
- **Dicas de tela:** ícones com dica de uso ("clique direito limpa").

**KERYX (já tem e é diferente ou melhor)**
- **Travar telas** (ensaio sem sair no projetor) e Esc com "Desfazer". O Holyrics tem "Congelar Tela" (Ctrl+Shift+F), parecido.
- **Prévia como a saída verá:** um seletor mostra o slide como ficará em cada saída, inclusive Palco e Pastor.
- **Telas na rede** read-only para tablets, TVs e palco, com PIN opcional, e OBS por `/StreamView`.
- **Cifras dentro do texto** da letra e nenhum texto bíblico embutido (só edições instaladas).

## A pergunta do player

Hoje o KERYX tem a ordem Programa → Prévia (+ Enviar) → **slot do player** → Próximo. O slot é reservado, então o monitor não se mexe quando um vídeo começa (`CenterPanel.jsx`, `.pslot`).

- **Holyrics:** faixa fina acima da prévia, recolhível.
- **SPresenter:** não é barra fixa, é uma aba (Controle de mídia) no painel de baixo.
- **Sua ideia (entre Programa e Prévia):** faz sentido porque o player controla a mídia que está no ar, e é o Programa que mostra isso. O custo é afastar a Prévia do Programa em 36 px e rever a regra "a Prévia fica logo abaixo do Programa". Mantendo o slot reservado, a altura total não muda.
- **Alternativa:** o slot colado na borda inferior do Programa, como parte do monitor, sem separar os dois.

**Decidido em 2026-10-12:** o player foi para entre o Programa e a Prévia (slot ainda reservado; `CenterPanel.jsx` e `docs/design-system.md`).

## Candidatos para o KERYX (ordem sugerida, nada implementado)

1. **Filtro de conteúdo por saída:** já existe em parte (o seletor "Conteúdo" nos ajustes de saída). Vale conferir se cobre Letras, Bíblia, Aviso e Imagem como no Holyrics.
2. **Mensagens prontas para o Aviso rápido** (Chamar pessoa, Kids, Carro): baixo custo, alto uso no culto.
3. **Tema por verso / por música:** decidir se o KERYX precisa do nível de verso ou só de música.
4. **Exportar e importar a configuração das saídas**, como o `.spo`.
5. **Multiview contínuo** das saídas: hoje o Verificar é um overlay, não um painel permanente.
6. **Timers com presets** (5, 10, 15, 30, 60 min), se o cronômetro atual não os tiver.
7. **Controle remoto pelo celular:** os dois concorrentes têm; no KERYX o console nunca é servido. É uma decisão de produto (segurança e escopo), não só de interface.
8. **Fora do escopo por ora:** macros, automações, plugins, MIDI e NDI. São de operações maiores e não combinam com um app para um operador só.

## Limites

- O Holyrics foi explorado pelos menus e abas; não abri as janelas "Configurações avançadas" das saídas além do primeiro nível, nem o editor de letras.
- No SPresenter, a PRO (MIDI, Réplica, 3ª tela) só mostrou a tela de venda.
- NDI, multiview e macros: procurei no código do KERYX e não achei, mas a busca foi por texto, não por execução.
