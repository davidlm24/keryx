# Google Drive direto no KERYX — o que o dono faz no Google Cloud

A sincronização entre os computadores da igreja vai passar a falar direto com
o Google Drive, como no Holyrics: cada computador entra com **a conta Google
da igreja** dentro do KERYX, e os arquivos ficam numa **pasta oculta só do
app** (`appDataFolder`), que não aparece no Drive de ninguém. Para isso o
Google precisa saber que o KERYX existe: é um "projeto" no Google Cloud,
criado **uma vez**, com a conta da igreja.

Leva uns 15 minutos. Nada aqui custa dinheiro. No fim, você manda **só o ID
do cliente** (uma linha que termina em `.apps.googleusercontent.com`).

## Antes de começar

- Entre no navegador com **a conta Google da igreja** (a mesma que todos os
  computadores vão usar). Se o navegador tiver outra conta aberta, use uma
  janela anônima.
- O espaço usado sai dessa conta (15 GB grátis, junto com o Gmail e as Fotos
  dela).

## 1. Criar o projeto

1. Abra <https://console.cloud.google.com/>.
2. Se for a primeira vez, aceite os termos do Google Cloud. **Não** é preciso
   ativar faturamento nem cadastrar cartão.
3. No alto da página, clique no seletor de projetos › **Novo projeto**.
4. Nome do projeto: `KERYX`. Organização: deixe como está ("Sem
   organização"). Clique em **Criar** e espere a notificação; depois
   selecione o projeto `KERYX` no seletor.

## 2. Ativar a API do Google Drive

1. Menu ☰ › **APIs e serviços** › **Biblioteca**.
2. Procure `Google Drive API`, abra e clique em **Ativar**.

## 3. Tela de consentimento (o que a pessoa vê ao entrar)

O Google chama essa parte de **Google Auth Platform** (em telas antigas,
"Tela de consentimento OAuth").

1. Menu ☰ › **APIs e serviços** › **Tela de consentimento OAuth** (ou
   **Google Auth Platform** › **Branding**). Clique em **Começar** se ele
   pedir.
2. **Informações do app**: nome do app `KERYX`; e-mail para suporte: o da
   conta da igreja.
3. **Público**: escolha **Externo**. (Interno só existe para contas do
   Google Workspace; com uma conta Gmail comum, é Externo.)
4. **Informações de contato**: o e-mail da igreja de novo.
5. Aceite a política de dados do Google e clique em **Criar**.
6. Logo e links (página inicial, política de privacidade) são opcionais.
   Pode deixar em branco por enquanto.

## 4. Escopos (o que o KERYX pode fazer na conta)

1. Em **Google Auth Platform** › **Acesso a dados** (ou "Escopos"), clique
   em **Adicionar ou remover escopos**.
2. Marque estes três, e só eles:
   - `.../auth/drive.appdata` — "Ver, criar e excluir os próprios dados de
     configuração no seu Google Drive" (só a pasta oculta do KERYX; ele não
     vê nenhum outro arquivo do Drive);
   - `openid`;
   - `.../auth/userinfo.email` (aparece como `email`), para o KERYX mostrar
     qual conta está conectada.
3. Os três são **não sensíveis**: o Google não pede verificação de escopo nem
   avaliação de segurança para eles. Clique em **Atualizar** e **Salvar**.

## 5. Criar o cliente "App para computador"

1. **Google Auth Platform** › **Clientes** (ou **APIs e serviços** ›
   **Credenciais** › **Criar credenciais** › **ID do cliente OAuth**).
2. Tipo de aplicativo: **App para computador** (em inglês, "Desktop app").
3. Nome: `KERYX para Windows`. Clique em **Criar**.
4. Aparece o **ID do cliente** (termina em `.apps.googleusercontent.com`) e
   uma "chave secreta do cliente". **Copie os dois.** Para um app de
   computador o Google trata o cliente como público: o ID e a chave vão
   dentro do KERYX (qualquer um que abra o instalador consegue lê-los) e não
   dão acesso a conta nenhuma — quem decide é a entrada de cada pessoa. Mesmo
   assim, **o Google exige a chave na troca do código** para esse tipo de
   cliente (conferido em 26/10: sem ela, ele responde "client_secret is
   missing"). Se a chave não aparecer mais, em **Clientes** › `KERYX para
   Windows` › **Adicionar chave secreta** gera outra.

## 6. Publicar o app ("Em produção") — importante

Enquanto o app estiver em **Teste**, o Google **desconecta a conta a cada 7
dias** e só deixa entrar quem estiver na lista de "usuários de teste". Por
isso:

1. **Google Auth Platform** › **Público** (ou na tela de consentimento, em
   "Status de publicação").
2. Clique em **Publicar app** › **Confirmar**. O status passa a **Em
   produção**.
3. Como os escopos são não sensíveis, o Google não pede envio para
   verificação. Se ele mostrar um aviso sobre verificação de marca (nome e
   logo), pode seguir sem ela: é opcional.

## 7. O que mandar de volta, e a chave

Mande só o **ID do cliente** (já recebido em 26/10: uma linha que termina em
`.apps.googleusercontent.com`).

A **chave secreta do cliente** (uma linha que começa com `GOCSPX-`) **não se
manda e não vai para o repositório** (decisão de 26/10): ela fica só no
computador que gera o instalador, numa variável de ambiente, e o build a põe
dentro do instalador. Nesse computador, uma vez, no PowerShell ou no Prompt
de Comando:

```
setx KERYX_GOOGLE_CLIENT_SECRET "cole-a-chave-aqui"
```

Feche e abra o terminal (o `setx` vale para os terminais abertos depois).
Sem ela, `npm run dist` e o `electron-builder` param com "Falta
KERYX_GOOGLE_CLIENT_SECRET neste terminal" — para não sair um instalador em
que "Entrar com Google" não funciona. Para um build de teste sem o Google,
`KERYX_BUILD_WITHOUT_GOOGLE=1`. Para testar com `npm run desktop:dev`, a
mesma variável no terminal basta.

Não mande a senha da conta, a chave nem nenhum código que o Google mostrar ao
entrar.

## O que o KERYX guarda, e onde

- **Neste computador** (settings.json, na pasta de dados do KERYX): a
  entrada da conta (o "refresh token" do Google), **selada pela proteção do
  Windows** — só esta conta do Windows, neste computador, consegue abri-la;
  e o e-mail da conta, para mostrar qual está conectada. A senha nunca passa
  pelo KERYX: ela é digitada só na página do Google, no navegador.
- **No Google Drive da igreja**, na pasta oculta do app: as mudanças de cada
  computador (assinadas com a chave da conta, que fica nessa mesma pasta),
  o que cada um já leu e os arquivos de mídia. Nenhum outro app nem pessoa vê essa pasta pelo Drive.
- **Sair da conta** no KERYX apaga a entrada deste computador e avisa o
  Google para cancelá-la.
- Se o Google recusar a entrada guardada (a senha da conta mudou, alguém
  removeu o acesso em <https://myaccount.google.com/permissions>), o KERYX
  para de sincronizar, diz "Entre de novo com a conta da igreja" e guarda as
  mudanças até alguém entrar de novo.

## O que esperar na primeira entrada

- O KERYX abre o navegador do computador na página de entrada do Google (ele
  nunca pede a senha numa janela própria).
- Sem a verificação de marca, o Google pode mostrar **"O Google não
  verificou este app"**. É esperado: clique em **Avançado** › **Acessar
  KERYX (não seguro)**. Isso não impede o uso da igreja; a verificação de
  marca pode ser pedida depois, se quiser tirar o aviso.
- A página pede permissão para o KERYX "ver, criar e excluir os próprios
  dados de configuração" no Drive: é a pasta oculta, e só ela.
- Para desconectar um computador depois: no KERYX (Sincronização ›
  Dispositivos conectados), ou na conta Google em
  <https://myaccount.google.com/permissions> › KERYX › Remover acesso.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "Acesso bloqueado: o app não concluiu o processo de verificação" | O app ainda está em **Teste**: faça o passo 6 (Publicar). |
| A conta desconecta sozinha depois de uma semana | Mesmo motivo: publique o app (passo 6). |
| "redirect_uri_mismatch" | O cliente foi criado com outro tipo: crie um novo do tipo **App para computador** (passo 5). |
| "Google Drive API has not been used in project…" | Falta ativar a API (passo 2). |
| O KERYX diz "O KERYX ainda não está configurado no Google" | O instalador foi gerado sem a chave secreta do cliente (passo 7): gere de novo com `KERYX_GOOGLE_CLIENT_SECRET` no terminal. |
| A página do Google mostra as permissões com caixas de marcar | Deixe marcada a de "dados de configuração" do Drive: sem ela o KERYX não sincroniza e pede para entrar de novo. |
