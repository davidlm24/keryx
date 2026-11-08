# Requisitos do computador

> **Provisório até a medição.** Os números abaixo foram tirados do código
> do KERYX (o que ele usa e como desenha), não de uma medição. Eles serão
> confirmados — ou corrigidos — com um teste de 3 horas no computador da
> igreja e no computador mais fraco que tivermos (veja "Como medir", abaixo).
> Até lá, trate o "Mínimo" como uma estimativa.

## A tabela

| | Mínimo | Recomendado |
|---|---|---|
| Sistema | Windows 10 (22H2) ou 11, 64 bits | Windows 11 |
| Processador | 4 threads, de 2017 em diante (Core i3 de 7ª geração / Ryzen 3) | Core i5 de 8ª geração ou melhor / Ryzen 5 |
| Memória | 8 GB | 16 GB |
| Vídeo | Integrado com DirectX 11 (Intel HD 620 ou melhor), driver atualizado | Intel Iris Xe / Radeon Vega ou melhor |
| Disco | SSD, 2 GB livres + as mídias da igreja | SSD, 20 GB livres ou mais |
| Telas | Console em 1366 × 768 + 1 saída (HDMI) | Console em 1920 × 1080 + 2 saídas |
| Rede | Opcional (instalar Bíblias, atualizações, sincronização) | Wi-Fi ou cabo, para telas na rede e o celular |

## De onde vêm esses números

- **Windows 64 bits:** o instalador do KERYX é só para Windows x64 (Electron 44).
- **Processador e memória:** cada janela do KERYX é um processo próprio do
  Chromium — o console e cada saída aberta (Projeção, Letras, Palco, Vídeo,
  Avisos, Pastor; até 7). Uma igreja comum abre o console e 2 ou 3 saídas.
  Uma auditoria anterior já viu o KERYX ficar sem memória num computador de
  8 GB (corrigido), por isso 8 GB é o piso.
- **Vídeo:** os fundos gerados (Aurora, Fluido…) são desenhados pela placa de
  vídeo (WebGL, até 30 quadros por segundo e 960 px de largura). Sem
  aceleração eles caem para uma versão parada, e os vídeos pesam no
  processador.
- **Telas:** o console precisa de pelo menos 960 × 600 e se arruma em
  1100 e 1400 px de largura; abaixo de 820 px de altura ele fica compacto.
  As saídas são desenhadas para 1920 × 1080.
- **Disco:** as mídias são copiadas para `%APPDATA%\KERYX\media`, sem limite;
  o espaço que falta depende dos vídeos da igreja.
- **Rede:** o KERYX funciona sem internet. A internet só serve para instalar
  Bíblias (ou lê-las online), atualizar o KERYX e sincronizar os computadores
  pela pasta do Google Drive. As telas na rede e o controle remoto usam a
  rede local (porta 7701).

## Como medir (o teste de 3 horas)

O KERYX tem um modo de teste longo: ele abre as saídas e passa um culto em
repetição — músicas sobre um vídeo em loop, um capítulo da Bíblia e uma
música sobre fundos gerados, um vídeo sozinho e a tela sem nada — durante o
tempo pedido, e a cada 30 segundos anota quanto cada janela gasta de memória
e de processador. Os textos são de teste (nenhuma letra ou Bíblia de
verdade). **Ele não usa os dados da igreja:** tudo fica numa pasta separada.

Antes de começar:

1. Feche o KERYX.
2. Ligue o projetor (e os outros monitores) como num domingo.
3. Deixe o computador na tomada e não use o computador durante o teste.
4. Se quiser um teste mais fiel, tenha à mão um vídeo de fundo que a igreja
   usa (um `.mp4`); sem ele o KERYX grava um vídeo de teste de 20 segundos.

### No computador da igreja (KERYX instalado, versão 0.2.21 ou mais nova)

Abra o **PowerShell** e cole as três linhas (3 horas = 180 minutos). A
primeira acha onde o KERYX foi instalado:

```powershell
$keryx = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object DisplayName -like "KERYX*" | Select-Object -First 1).InstallLocation; if (-not $keryx) { $keryx = "$env:LOCALAPPDATA\Programs\keryx" }
$env:KERYX_SMOKE="1"; $env:KERYX_SOAK="180"; $env:KERYX_DATA_DIR="C:\keryx-soak"; $env:KERYX_PORT="0"; $env:KERYX_LAN_PORT="0"
& "$keryx\KERYX.exe"
```

Para usar o vídeo da igreja, acrescente antes do `&`:
`$env:KERYX_SOAK_VIDEO="C:\caminho\do\video.mp4";`

O KERYX abre, as saídas aparecem nos monitores e, depois de 3 horas, ele
fecha sozinho. Os resultados ficam em **`C:\keryx-soak`**:

- `soak-AAAA-MM-DD-HHMM.csv` — uma linha por janela a cada 30 s (abre no Excel);
- `soak-AAAA-MM-DD-HHMM.json` — o computador, a placa de vídeo e o resumo
  (memória no começo e no fim, picos por janela, processador, quedas).

Mande os dois arquivos. Se precisar parar antes, feche o KERYX: o que já foi
medido fica salvo.

### Pelo código (no computador de desenvolvimento)

```powershell
$env:KERYX_SOAK="180"; $env:KERYX_DATA_DIR="C:\keryx-soak"; npm run desktop:smoke
```

Aqui a linha `SOAK FIM {...}` aparece no terminal no fim.

### Outras opções

- `KERYX_SOAK_OUTPUTS` — quais saídas abrir, separadas por vírgula. O padrão é
  `/Projection,/StageView,/VideoProjection` (Projeção, Palco e Vídeo). Para o
  "Mínimo" (uma saída só): `$env:KERYX_SOAK_OUTPUTS="/Projection"`.
- `KERYX_SOAK_OUT` — outro caminho para o CSV (o JSON vai ao lado).
- `KERYX_SOAK_SAMPLE` — segundos entre as medições (30 por padrão, 5 no mínimo).

### O diagnóstico também mede

**Ajuda › Salvar diagnóstico…** (e **Relatar um problema…**) agora põe no
zip um `desempenho.json`: a memória e o processador de cada janela naquele
momento, a placa de vídeo e se o Chromium está desenhando sem aceleração
(`"software": true` — o sinal de um driver de vídeo velho ou faltando).

## Depois da medição

Com os arquivos dos dois computadores, a tabela acima é corrigida, perde o
aviso de "provisório" e passa a citar a medição (data, computador, número de
saídas). O mínimo também vai para Configurações › Sobre e para as notas da
versão.
