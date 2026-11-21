# KERYX → GERAR: republicação da biblioteca de Louvor

- **Owner:** equipe KERYX
- **Status:** pronto para publicar e provar no computador da mesa
- **Branch / base:** `codex/keryx-library-sync` sobre `release/0.2.33`
- **Commit:** `d481bc56` — `fix(gerar): retry library publication after C8`
- **Dependência externa:** GERAR em produção já tem `keryx_library` e as RPCs C8 aplicadas.

## Problema confirmado

O GERAR tem a migration C8 e a RPC `list_keryx_library`, mas a tabela
`public.keryx_library` está vazia. O KERYX anterior só publicava ao conectar,
ao ligar “Receber os pedidos” ou depois de alteração na Mídia. Se a primeira
tentativa encontrou a RPC ainda ausente (`PGRST202`), uma migration posterior
não causava outra tentativa com a Mídia inalterada.

## Mudança preparada

`electron/gerarLibrary.cjs` agora:

- envia localmente apenas vídeo, áudio e YouTube cuja categoria normalizada é
  `Louvor` (o GERAR continua a impor a mesma regra no servidor);
- quando recebe `PGRST202`, preserva o índice como pendente e tenta publicar de
  novo em cinco minutos;
- não retenta automaticamente quando o dispositivo foi revogado, está offline
  ou requer novo vínculo;
- cancela o retry ao parar o módulo.

Nenhum arquivo, caminho, miniatura, descrição ou credencial deixa o KERYX.
O dispositivo continua publicando somente quando está conectado e com
“Receber os pedidos” ligado.

## Prova após publicar

1. Atualize o KERYX da mesa com a branch/commit acima e abra-o conectado ao
   GERAR com “Receber os pedidos” ligado.
2. Aguarde no máximo cinco minutos — ou altere um item da Mídia e aguarde os
   30 segundos de debounce.
3. Em Configurações › Conexões, confirme a linha
   `Biblioteca no GERAR: N itens · publicada agora`.
4. No banco GERAR, confirme que `public.keryx_library` tem `N > 0` e que todas
   as linhas têm `category = 'Louvor'`.
5. No novo pedido do GERAR, procure um título acentuado sem acento e confirme
   que ele aparece; abra o chat e confirme que uma mensagem nova não move o
   ponto de leitura da pessoa.

## Validação já executada

- `node --test electron/gerarLibrary.test.cjs` — 6/6 passou.
- A suíte completa depende de pacotes ausentes no worktree (`yazl` e `yauzl`);
  os 12 erros resultantes são de instalação, não do módulo de biblioteca.

## Limites

- O GERAR não recebe nada até que um computador KERYX conectado faça a primeira
  publicação bem-sucedida.
- A tabela do GERAR não deve receber `SELECT` direto no cliente e não se deve
  alterar as regras de dispositivo ou autorização para forçar essa publicação.

Próximo: equipe KERYX — publicar `d481bc56` e executar a prova acima — pronto
quando `keryx_library` tiver ao menos um item de Louvor e a tela do GERAR listar
esse item.
