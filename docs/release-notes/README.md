# Notas de versão

Uma nota por versão, `<versão>.md`, em pt-BR e para quem opera o KERYX (o que mudou na tela e o que fazer de diferente), não para quem programa. Ela vira o texto do release no GitHub e o KERYX a mostra no popup de atualização, no sino ("KERYX atualizado para a versão X · Ver novidades") e no popup **Novidades**, que abre sozinho depois de uma atualização com as notas de todas as versões desde a que estava instalada (e pelo menu do KERYX › Novidades). O popup lê as notas que vão dentro do app (`src/lib/console/releaseNotesData.js`): escreva a nota antes do build.

Escreva a nota **antes** de publicar: o build a lê com `-c.releaseInfo.releaseNotesFile=docs/release-notes/<versão>.md`. Curta: o app mostra até 1.200 caracteres, e o `npm test` reprova uma nota maior (`electron/release-notes.test.cjs`). Use títulos `##` e itens `-`; negrito com `**`.

**Confira o tamanho antes do build, não depois.** O smoke não roda os testes: rode `node --test electron/release-notes.test.cjs` (ou o `npm test` inteiro) no branch `release/<versão>` depois de escrever a nota e antes de construir. A 0.2.21 foi publicada com 2.354 caracteres e o popup de atualização da 0.2.20 e o sino mostraram a nota cortada em "…"; só o CI do PR de release viu, tarde demais. A nota publicada (o `latest.yml` e o texto do release no GitHub) não muda depois: uma versão publicada nunca é refeita.

## Uma mudança visual leva a imagem do mockup

Pedido do dono, 26/11: o que muda na tela chega às Novidades **com uma imagem** do mockup aprovado explicando o que mudou.

- A imagem fica em `img/<nome>.png` (1120 × 700 ou menor, o dobro da largura do popup) e entra na nota numa linha só dela: `![O que a imagem mostra](img/<nome>.png)`.
- Só o popup Novidades mostra a imagem. O popup de atualização, o sino e o texto do release no GitHub ficam sem ela, e ela não conta nos 1.200 caracteres.
- Quem faz a mudança não escreve `<versão>.md` (só a sessão de release faz isso). O PR deixa um **fragmento** em `next/<nome>.md` (o texto para o operador, a imagem incluída) e a imagem em `img/`. A sessão de release junta os fragmentos de `next/` na nota da versão e os apaga.
- O `npm test` confere que toda imagem citada existe em `img/` e que cada fragmento cabe.
