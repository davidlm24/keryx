# Checagem no computador da igreja

Roteiro para rodar **uma vez**, no computador onde o KERYX vai projetar, depois de instalar uma versão nova. Cada item diz o que fazer e o que deve acontecer. Se algo não bater, anote a versão do KERYX (Configurações › Backup e atualizações) e o que apareceu na tela.

Use o **KERYX instalado**, não o modo de desenvolvimento: alguns itens só existem no aplicativo instalado.

## 1. Atualização e Novidades

1. Com uma versão anterior aberta, deixe o KERYX buscar a atualização (Configurações › Backup e atualizações › Verificar atualização).
2. Quando a atualização terminar e o KERYX reiniciar, deve abrir sozinho o popup **"O KERYX foi atualizado para a versão X"**, com as notas de todas as versões desde a anterior.
3. Clique em **Entendi**. Ao reabrir o KERYX, o popup não deve voltar.
4. Pelo menu do KERYX, escolha **Novidades**. As notas devem abrir de novo, agora de todas as versões.

## 2. Telas na rede e Transmissão no OBS

1. Em Configurações › Telas na rede, ligue as telas na rede e confira o endereço que aparece.
2. Num tablet ou celular do mesmo Wi-Fi, abra o endereço. Deve aparecer a página inicial com o nome da igreja.
3. Em Telas na rede › Transmissão › **Ajustes**, mude a cor da faixa para algo bem visível (por exemplo, vermelho) e a posição para **Em cima**. A prévia deve mudar na hora.
4. No OBS, adicione uma **Fonte de navegador** com o endereço de Transmissão, 1920 × 1080. Escreva algo num slide do console (uma letra, por exemplo).
5. **Transparência:** a legenda deve aparecer sobre a imagem da câmera, com o fundo ao redor transparente. Se o fundo aparecer preto ou branco, anote: é o item "OBS transparency (#51)" ainda por confirmar.

## 3. Bíblia sem internet (ARA)

1. Desligue a internet do computador (modo avião, ou desconecte o cabo).
2. Em Bíblia, escolha a versão **ARA** e abra um capítulo que já esteja instalado (Configurações › Bíblia e músicas › Bíblias instaladas).
3. O capítulo deve abrir sem erro, e a versão que aparece deve ser a ARA.
4. Se a ARA não estiver instalada, o KERYX deve avisar e mostrar outra versão instalada, sem trocar em silêncio. Anote se isso acontecer: é o item "ARA offline fallback (#58)" ainda por confirmar.
5. Ligue a internet de novo.

## 4. Iniciar com o Windows

1. Em Configurações › Console, ligue **Iniciar com o Windows**. Não deve dar erro.
2. Reinicie o computador. O KERYX deve abrir sozinho.
3. Se alguma saída tiver **Abrir ao iniciar**, ela abre em tela cheia logo depois. Confira se isso é o que a igreja quer no começo do culto.
4. Desligue a opção de novo, para o teste não ficar ligado.

## 5. Pergunta ao fechar com algo no ar

1. Coloque um slide no ar.
2. Clique no X do console. O KERYX deve perguntar: **Fechar o KERYX** ou **Continuar projetando**, com **Continuar projetando** já selecionado (Enter não fecha).
3. Escolha **Continuar projetando**: o KERYX deve continuar aberto e as telas, como estavam.
4. Tire tudo do ar (tecla **Esc** ou Limpar) e clique no X de novo: agora deve fechar sem perguntar.
5. Em Configurações › Console, desligue **Perguntar antes de fechar com algo no ar**, se a igreja preferir.

## 6. Som do aviso

1. Em Configurações › Telas e saídas › Som do aviso, clique em **Testar som**. Deve tocar o sino curto neste computador.
2. Mude o volume para **Baixo** e teste de novo. O som deve ficar mais baixo.
3. Volte para **Médio**.

## 7. Dispositivos de áudio (para decidir a saída de som)

Este item não muda nada no KERYX; serve para decidir se a escolha da placa de som vale a pena.

1. Anote o nome das saídas de áudio que aparecem no Windows (Configurações do Windows › Som) quando há um projetor, uma TV ou um fone ligado ao computador.
2. Confira se o KERYX mostra algum nome desses (em Telas e saídas, ou no Verificar).
3. Anote o que aparece: nomes reais (como "Saída HDMI · TV") ou só "Saída 1", "Saída 2". Essa informação decide a próxima etapa.

## 8. Sincronização entre computadores (Google Drive)

Precisa de dois computadores com o **Google Drive para computador** instalado e a mesma pasta do Drive nos dois (por exemplo `G:\Meu Drive\KERYX`). Chamamos aqui de **PC da igreja** o que projeta e **notebook** o outro.

**Antes de começar**

- Nos dois, no Google Drive para computador, deixe os arquivos **espelhados** (Preferências › Pastas do Google Drive), ou clique com o botão direito na pasta do KERYX e deixe-a **disponível off-line**. Assim os vídeos ficam no computador, não só na nuvem.
- Se a pasta é de outra conta e foi **compartilhada** com você, ela não aparece no computador sozinha: no site do Drive, em **Compartilhados comigo**, clique com o botão direito na pasta e escolha **Adicionar atalho ao Drive** (coloque o atalho em Meu Drive). Espere o Drive para computador baixar e só então escolha a pasta no KERYX.

**Ligar**

1. No PC da igreja, em Configurações › Sincronização, **Escolher a pasta…** e **Criar o código da igreja**. Anote o código (8 letras e números).
2. A primeira vez copia todas as mídias para a pasta: confira se o KERYX continua projetando normalmente enquanto isso, e se a nuvem no topo fica verde quando termina.
3. No notebook, escolha a mesma pasta e digite o código. As músicas dos dois devem aparecer nos dois (nada some). Se houver músicas iguais, o sino avisa e a Biblioteca mostra "parece repetida".
4. Confira o quadro **O que vai e o que fica** na mesma tela: ele diz o que deve chegar e o que não chega.

**A igreja inteira chega ao outro computador** (faça no notebook e confira no PC da igreja)

5. Crie ou mude um item de cada tipo, um com arquivo onde houver:
   - uma **música** com fundo próprio (um vídeo), um playback e marcas de Sincronizar;
   - um **tema** com fundo de vídeo, e marque-o para aparecer em Temas (Fixar no console);
   - um **culto** na Setlist, com papel de parede, e um **modelo de culto**;
   - na **Mídia**: um vídeo, uma imagem, um áudio e um **PDF** (espere as páginas ficarem prontas);
   - um **fundo** novo na biblioteca de fundos, numa categoria;
   - um **aviso** com imagem ou vídeo, um aviso rápido pronto e um timer pronto;
   - na **Escola bíblica**, uma turma e um material com imagem;
   - em Configurações › Igreja, troque o **logo**, e em Culto, o papel de parede de **Qualquer outro culto**.
6. Em cerca de 30 segundos (mais o tempo do Drive), tudo isso deve aparecer no PC da igreja. Enquanto um arquivo grande ainda vem, a linha dele diz **"Baixando…"** e o console não deixa mandá-lo ao ar; quando chega, o aviso some sozinho. Em Sincronização, a linha **Mídias** deve terminar em "todas aqui".
7. No PC da igreja, mande ao ar a música, o vídeo, uma página do PDF e o aviso. Devem aparecer iguais ao notebook (o tema, o fundo, o logo no canto).
8. Exclua no PC da igreja dois itens criados no notebook (por exemplo a imagem e o aviso). Devem sumir do notebook também.

**O que fica em cada computador**

9. Em Configurações › Bíblia e músicas, instale no notebook uma Bíblia que o PC da igreja não tem (por exemplo a ACF). Em até alguns minutos, o PC da igreja deve mostrar **"Instaladas no outro computador: … Falta a ACF aqui."** com **Instalar aqui**. Clique: a ACF baixa da internet (o texto nunca vem pela pasta) e o aviso some.
10. Mude no notebook o desenho de uma tela (Editor de telas) ou a posição de uma saída: o PC da igreja **não** muda. É o esperado por enquanto.

**Quando algo falha**

11. Feche o Google Drive num deles: a nuvem fica âmbar ("Aguardando a pasta") e o KERYX continua normal. Abra o Drive de novo: as mudanças vão sozinhas.
12. Em Computadores, use **Tirar…** no outro computador: ele deve parar e pedir o código. Digite o código nele: volta a sincronizar.
13. Em um deles, **Sair da sincronização…**: nada é apagado, e os outros continuam com o que ele mandou.
14. Anote quanto tempo uma mudança leva para chegar, quanto tempo um vídeo grande leva, e qualquer arquivo estranho que o Drive criar na pasta `sync` (cópias com "(1)" no nome são normais).

## Ao terminar

Mande para o responsável pelo KERYX:
- a versão instalada;
- o que deu certo e o que não deu, em uma frase cada item;
- as capturas de tela dos pontos que ficaram estranhos (a transparência do OBS e a lista de áudio).
