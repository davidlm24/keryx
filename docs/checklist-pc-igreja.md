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

## 4b. Se o KERYX cair no meio do culto

1. Abra a Projeção e coloque uma música no ar, num slide do meio.
2. Abra o **Gerenciador de Tarefas** (Ctrl+Shift+Esc) e use **Finalizar tarefa** no KERYX.
3. Em uns 5 segundos o KERYX deve abrir sozinho, a Projeção abrir de novo e mostrar o mesmo slide (não a tela preta). O sino diz "O KERYX fechou sozinho e abriu de novo".
4. Se ele não abrir sozinho, abra pelo ícone: deve voltar com o mesmo slide. Anote qual dos dois aconteceu (o Gerenciador de Tarefas pode encerrar o vigia junto).
5. Feche o KERYX normalmente e abra de novo: agora ele abre com a tela preta, como sempre.

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

## 8. Sincronização entre computadores (conta Google da igreja)

Precisa de dois computadores com internet e da **conta Google da igreja** (a mesma nos dois). Não precisa mais do Google Drive para computador nem de pasta: o KERYX entra direto na conta e guarda tudo numa pasta oculta só dele. Chamamos aqui de **PC da igreja** o que projeta e **notebook** o outro.

**Ligar**

1. No PC da igreja, em Configurações › Sincronização, clique em **Entrar com Google**. O navegador abre na página do Google: escolha a conta da igreja e **Continuar**. Volte ao KERYX: a página mostra a conta, **Andamento: Em dia** e o **Espaço da conta** (quanto o KERYX usa e quanto sobra). A nuvem no topo, ao lado de Ver, fica com o ponto verde.
2. A primeira vez envia todas as mídias para a conta: confira se o KERYX continua projetando normalmente enquanto isso. Clique na nuvem: o resumo mostra **Esperando** e **Chegando** enquanto há arquivos indo e vindo.
3. No notebook, **Entrar com Google** com a **mesma conta**. As músicas dos dois devem aparecer nos dois (nada some), e um aviso diz quantas vieram e quantas foram. Se houver músicas iguais, o sino avisa e a Biblioteca mostra "parece repetida".
4. Em **Dispositivos conectados**, os dois computadores aparecem, cada um com a versão do KERYX e quando foi visto.
5. Confira o grupo **O que vai e o que fica** na mesma tela: ele diz o que deve chegar e o que não chega.

**A igreja inteira chega ao outro computador** (faça no notebook e confira no PC da igreja)

6. Crie ou mude um item de cada tipo, um com arquivo onde houver:
   - uma **música** com fundo próprio (um vídeo), um playback e marcas de Sincronizar;
   - um **tema** com fundo de vídeo, e marque-o para aparecer em Temas (Fixar no console);
   - um **culto** na Setlist, com papel de parede, e um **modelo de culto**;
   - na **Mídia**: um vídeo, uma imagem, um áudio e um **PDF** (espere as páginas ficarem prontas);
   - um **fundo** novo na biblioteca de fundos, numa categoria;
   - um **aviso** com imagem ou vídeo, um aviso rápido pronto e um timer pronto;
   - na **Escola bíblica**, uma turma e um material com imagem;
   - em Configurações › Igreja, troque o **logo**, e em Culto, o papel de parede de **Qualquer outro culto**.
7. Em cerca de 30 segundos, tudo isso deve aparecer no PC da igreja. Enquanto um arquivo grande ainda vem, a linha dele diz **"Baixando…"** e o console não deixa mandá-lo ao ar; a nuvem mostra **Chegando** com a barra. Mande um vídeo de uns 200 MB e anote quanto tempo leva.
8. No PC da igreja, mande ao ar a música, o vídeo, uma página do PDF e o aviso. Devem aparecer iguais ao notebook (o tema, o fundo, o logo no canto).
9. Exclua no PC da igreja dois itens criados no notebook (por exemplo a imagem e o aviso). Devem sumir do notebook também.

**O que fica em cada computador**

10. Em Configurações › Bíblia e músicas, instale no notebook uma Bíblia que o PC da igreja não tem (por exemplo a ACF). Em até alguns minutos, o PC da igreja deve mostrar **"Instaladas no outro computador: … Falta a ACF aqui."** com **Instalar aqui**. Clique: a ACF baixa da internet (o texto nunca vem pela conta) e o aviso some.
11. Mude no notebook o desenho de uma tela (Editor de telas) ou a posição de uma saída: o PC da igreja **não** muda. É o esperado por enquanto.

**Quando algo falha**

12. Desligue a internet de um deles e mude uma música: a nuvem fica âmbar, **Sem internet · 1 mudança esperando**, e o KERYX continua normal. Ligue de novo: a mudança vai sozinha (ou **Tentar agora**).
13. Em **Dispositivos conectados**, use **Desconectar…** no outro computador: ele mostra **"Este computador foi desconectado da sincronização"** e a nuvem fica vermelha. Clique **Entrar com Google** nele: volta a sincronizar.
14. Em um deles, **Sair da conta…**: nada é apagado, a página volta a **Entrar com Google** e os outros continuam com o que ele mandou.
15. Num computador que **sincronizava pela pasta** antes desta versão: depois de atualizar, o sino avisa uma vez e Sincronização mostra a faixa **"A sincronização agora é pela conta Google"** com a pasta dele. Até entrar, ele continua pela pasta. **Entrar com Google** com a mesma conta: ele junta o que tem, nada some. Depois que todos tiverem entrado, a pasta antiga pode ser apagada.
16. Anote quanto tempo uma mudança leva para chegar e quanto tempo um vídeo grande leva.

## Ao terminar

Mande para o responsável pelo KERYX:
- a versão instalada;
- o que deu certo e o que não deu, em uma frase cada item;
- as capturas de tela dos pontos que ficaram estranhos (a transparência do OBS e a lista de áudio).
