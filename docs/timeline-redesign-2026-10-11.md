# Linha do tempo do culto — estudo (2026-10-11)

Item 10 do ciclo de feedback (`docs/next-version-plan-2026-10-11.md`, fatia
9). O dono pediu: "deve ser amplamente revisado e otimizado… algo como uma
timeline de editor… a setlist, mas que passa o tempo do que já foi passado e
talvez dando para colocar uma transição entre vídeos". Este documento é o
estudo; **nada aqui foi implementado**. O mockup navegável (o hoje, a
proposta com zoom e o AGORA andando, e as interações) está no canvas
**Linha do tempo KERYX**: https://claude.ai/artifact/8PCXj3vqBdxj4cHMAxUcGY
(privado; compartilhável pelo menu Share).

## O que existe hoje (fatos do código)

- `Timeline.jsx` + `src/lib/console/timeline.js`: uma régua de 72 px no
  rodapé, fechada por padrão (`layout.tlOpen`), ocultável em Ver. Por item,
  um traço pontilhado (plano) e um bloco de 28 px (real/no ar), sem nome e
  sem ícone; marcador AGORA; 8 relógios; clique prepara o item.
- **As seções nunca aparecem**: a régua recebe `playableItems`, que as
  descarta antes.
- **O decorrido real é local**: `keryx.console.log.<serviceId>` no
  localStorage (`Console.jsx`), escrito só em `sendStage` com
  `serviceItemId`. Reiniciou o app, perdeu; a rede (Tela do pastor) nunca vê.
  O estado ao vivo já guarda `session.itemAt`, mas não o histórico.
- O relógio do culto (`serviceClock`) e o atraso (`serviceTiming.late`) já
  existem e alimentam a barra do topo.
- Nenhum concorrente tem isso (pesquisa de 2026-10-09): o mais próximo é o
  Proclaim com "target start times". É uma vantagem do KERYX a lapidar.

## Proposta: a setlist como trilha de editor

Trilha de ~128 px (aberta por padrão?, ver perguntas), desenhada no mockup:

- **Blocos nomeados**: ícone do tipo + título + duração, como os itens da
  Setlist. Feito = preenchido apagado; no ar = contorno vermelho com o
  **decorrido real preenchendo** o bloco; por vir = contorno.
- **Seções como faixas** em cima da trilha (PRÉ-CULTO, CULTO…), com seus
  horários — hoje elas somem.
- **AGORA** como playhead, com o chip "+N min" (reusa `late`).
- **Hover**: plano × real do item ("plano 19:05–19:09 · real 19:07–…").
- **Zoom 1× / 2×** com rolagem horizontal (cultos longos).
- Clique prepara, dois cliques enviam — como em tudo no console.
- **Transição entre vídeos**: quando um vídeo/playback segue outro, um
  conector entre os dois blocos ("Esmaecer · 0,5 s"); ao enviar o segundo,
  ele entra com fade em vez de corte.

## O registro do ar sai do localStorage

Opções estudadas:

| | Onde | Prós | Contras |
|---|---|---|---|
| A (recomendada) | `session.log` no estado ao vivo: `[{itemId, start, end}]`, escrito por `session.item`/`session.end` | sobrevive ao reinício (restoreState); chega à rede (Pastor pode mostrar "passou por…"); um lugar só | cresce dentro da sessão (limitar a ~200 entradas) |
| B | tabela nova `ServicePlay` | histórico permanente; alimentaria Relatórios | esquema novo + escrita a cada envio; nada pede isso hoje |
| C | manter local | zero trabalho | os dois defeitos de hoje continuam |

## Fases de implementação (quando o dono aprovar)

1. **Fase 1 (M)** — visual novo da trilha (blocos nomeados, seções, fill do
   decorrido, hover, zoom) + `session.log` no estado ao vivo (opção A), a
   régua lendo dele. Sem mudanças de esquema.
2. **Fase 2 (M)** — arrastar: borda muda `ServiceItem.duration`, bloco
   reordena (mesmo mecanismo da Setlist).
3. **Fase 3 (M-L)** — transições entre vídeos: campo `ServiceItem.transition`
   (+ms), conector na trilha, e o fade no envio (toca `video.show`/renderer:
   a parte com mais risco, smoke nas duas janelas).

## Perguntas para o dono (fechadas)

1. A linha do tempo passa a vir **aberta por padrão** (hoje nasce fechada)?
2. Altura: **~128 px** como no mockup, ou mais baixa (96 px) para não roubar
   espaço dos monitores?
3. Fase 2 já na primeira leva, ou só o visual (fase 1) primeiro?
4. Transição entre vídeos: só **Esmaecer** (corte é o padrão), ou também
   Deslizar?
5. Registro do ar: a opção **A** (estado ao vivo, compartilhado) está boa, ou
   você quer desde já o histórico permanente (B) para Relatórios?
6. O zoom (1×/2×) vale a pena, ou cultos de vocês nunca passam de ~90 min e
   dá para viver sem?
