# Notas de versão

Uma nota por versão, `<versão>.md`, em pt-BR e para quem opera o KERYX (o que mudou na tela e o que fazer de diferente), não para quem programa. Ela vira o texto do release no GitHub e o KERYX a mostra no popup de atualização e no sino ("KERYX atualizado para a versão X · O que mudou").

Escreva a nota **antes** de publicar: o build a lê com `-c.releaseInfo.releaseNotesFile=docs/release-notes/<versão>.md`. Curta: o app mostra até 1.200 caracteres. Use títulos `##` e itens `-`; negrito com `**`.
