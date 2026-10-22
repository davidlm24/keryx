// Configurações' search: every setting, where it lives, and the words an
// operator may type for it. Pure (tested): the index is checked against the
// sections' sources (settingsSearch.test.mjs), so a new row is findable.
//   - target: the row's label (FormRow `k`, or a data-cfg-k on the element);
//     a jump scrolls to it and lights it up for a moment.
//   - keywords: other words, and the rows of a card that opens from it
//     (an output's Ajustes, the theme editor, a background's settings).
// Matching ignores accents and case, every word must match (the Bíblia's
// query rules, src/lib/bibleSearch.js) and a word matches the start of a
// word: "transi" finds Transição, "nvi" finds NVI but not "enviar".
import { fold, searchTerms } from "../bibleSearch.js";
import { SECTIONS } from "./settings.js";
import { TRANSITION_TYPES } from "../contentKinds.js";

const e = (section, label, hint, keywords = [], extra = {}) => ({ section, label, hint, keywords, target: extra.target || label, tab: extra.tab || null });

export const SETTINGS_INDEX = [
    e("igreja", "Nome", "o nome da igreja", ["igreja", "título"]),
    e("igreja", "Cidade", "a cidade da igreja"),
    e("igreja", "Logo", "no canto das telas, na tela ociosa e em Mostrar logo", ["logotipo", "marca", "imagem"]),
    e("igreja", "Logo nas telas", "o canto, o tamanho e a opacidade do logo", ["canto", "tamanho", "opacidade", "transparente", "mostrar logo"]),

    e("telas", "Identificar telas", "os monitores ligados e o número de cada um", ["Telas", "monitores", "monitor", "projetor", "tv", "número"]),
    e("telas", "Saídas", "as saídas, uma a uma: abrir e fechar aqui; a tela onde cada uma abre fica no Editor, em Destino", ["projeção", "letras", "vídeo", "comunicação", "palco", "pastor", "tela cheia", "janela", "trazer para a frente", "fechar", "abrir"]),
    e("telas", "Abrir ao iniciar", "a saída abre sozinha quando o KERYX abre: no Editor da tela, em Ajustes › Destino", ["iniciar", "automático", "Destino"], { target: "Saídas" }),
    e("telas", "Remover saída", "no clique direito da tela: tira a saída das listas; os ajustes continuam salvos", ["remover", "tirar", "esconder", "desativar", "excluir saída"], { target: "Saídas" }),
    e("telas", "Adicionar saída", "traz de volta uma saída removida, com os mesmos ajustes", ["adicionar", "ativar", "restaurar saída", "voltar"]),
    e("telas", "Arquivo de ajustes", "exportar e importar a tela e os ajustes de cada saída", ["arquivo", "exportar", "importar"]),
    e("telas", "Exportar ajustes das saídas", "salva num arquivo a tela e os ajustes de cada saída", ["exportar", "salvar", "arquivo", "backup das saídas", "outro computador", "reinstalar", "spo"] ),
    e("telas", "Importar ajustes das saídas", "abre um arquivo de saídas e mostra o que muda antes de aplicar", ["importar", "restaurar", "arquivo", "outro computador", "reinstalar", "carregar"] ),
    e("telas", "Transições", "como um som dá lugar ao outro, como pausa, como as coisas entram, trocam e saem do ar", ["transição", "transições", "suave", "corte", "esmaecer", "fade"]),
    e("telas", "Ao pausar o som", "Pausar e Tocar no player: corte, 0,2 s ou 0,4 s", ["transição", "pausar", "pausa", "tocar", "player", "música", "som", "suave", "corte", "fade", "estalo"]),
    e("telas", "Ao tirar do ar", "Esc, Limpar e Parar: a imagem e o som saem juntos, de uma vez ou suave", ["transição", "esc", "limpar", "parar", "encerrar", "tirar", "música", "som", "suave", "corte", "esmaecer", "fade", "duração", "tirar da tela"]),
    e("telas", "Ao entrar ou trocar", "o que entra na tela ou troca outra coisa: corte ou suave, 0,3 s, 0,5 s ou 1 s; passar de slide é do tema", ["transição", "entrar", "trocar", "troca", "música", "imagem", "vídeo", "aviso", "suave", "corte", "esmaecer", "fade", "crossfade", "duração"]),
    e("telas", "Por tipo de conteúdo", "a transição de cada tipo: padrão, corte ou suave (o timer vem em corte)", ["transição", "tipo", "conteúdo", "exceção", ...TRANSITION_TYPES.map((t) => t.label), "timer", "relógio", "cronômetro", "pdf", "gif", "youtube"]),
    e("telas", "Entre áudios e vídeos", "quando um começa, o que tocava para: corte, suave ou tocar junto", ["transição", "áudio", "vídeo", "música", "som", "um de cada vez", "tocar junto", "corte", "suave", "crossfade", "esmaecer", "duração"]),
    e("telas", "Tela preta e Logo", "entram e saem com a transição de Ao tirar do ar", ["transição", "tela preta", "preto", "logo", "suave", "esmaecer"]),
    e("telas", "Som do aviso", "o sino dos avisos: ligar, desligar, volume, testar", ["Som e YouTube", "som", "sino", "alerta", "volume", "testar som", "áudio"] ),
    e("telas", "Título do YouTube", "esconder a faixa de título que o YouTube põe sobre o vídeo", ["youtube", "canal", "faixa", "esconder", "título"]),
    e("telas", "Ajustes", "clique numa tela: os cinco blocos do Editor, Destino, Conteúdo, Aparência, Comportamento e Diagnóstico",
        ["Destino", "Conteúdo", "Aparência", "Comportamento", "Diagnóstico", "Estado", "Na rede", "Tela", "Nome", "Ícone", "Desenho", "layout", "Editar a tela", "O que esta tela recebe", "recebe", "receber", "Tudo", "Letra e Bíblia", "Vídeos", "Avisos", "personalizado", "YouTube", "Por cima de tudo", "Logo no canto", "Sem item da lista", "Já faz sozinho", "Mostrando agora",
            "Escala do texto", "Cifra", "Nome da parte", "acordes", "Refrão", "Relógio e tempo", "Notas para músicos", "Próximo slide", "Relógio", "Próximos itens", "Vista antiga", "Partes do desenho", "Aviso rápido por cima", "Margens", "Mostrar logo", "Tema", "Restaurar padrão", "tamanho da letra", "Mostrar", "filtro", "só letras", "só Bíblia", "Apresentações", "PDF",
            "Faixa", "Tamanho do texto", "Posição", "Referência na legenda", "Estilo", "Cores", "Tamanho", "Entrada"], { target: "Saídas" }),
    e("telas", "Aviso rápido nas telas", "como cada tela mostra o aviso, no Editor: no alto ou embaixo, faixa ou pílula, cores, tamanho e entrada",
        ["aviso rápido", "alerta", "barra", "faixa", "pílula", "Posição", "Estilo", "Cores", "Tamanho", "Entrada", "deslizar", "aparecer", "cor do aviso", "comunicação"], { target: "Saídas" }),

    e("rede", "Ligar telas na rede", "celulares, tablets e TVs pela rede da igreja", ["Conexão", "wifi", "wi-fi", "celular", "tablet", "rede", "ligar", "endereço", "qr", "link", "obs", "transmissão"]),
    e("rede", "Endereços", "o endereço de cada tela, com QR code, para abrir no tablet ou na TV", ["endereço", "url", "link", "qr", "qr code", "ip", "copiar"]),
    e("rede", "Transmissão", "a legenda da transmissão ao vivo (OBS): cor, tamanho e posição da faixa", ["obs", "live", "legenda", "faixa", "transmissão", "youtube"], { target: "Ligar telas na rede" }),
    e("rede", "Controle remoto", "um celular conduz o culto: slides, Tela preta, setlist, Bíblia", ["celular", "remoto", "controle", "telefone", "palco", "pregador", "Celular", "Código", "Conectados", "desconectar"]),
    e("rede", "PIN", "o código que os aparelhos pedem para entrar; Mostrar PIN", ["senha", "código", "proteger", "mostrar pin", "esqueci"]),
    e("rede", "Telas conectadas pela rede", "os aparelhos conectados agora", ["aparelhos", "conectados"]),

    e("temas", "Temas padrão", "um tema para cada tipo: músicas, Bíblia, texto e timer", ["tema padrão", "estilo padrão do texto", "estilo de fábrica", "padrão", "música", "bíblia", "texto", "timer", "relógio", "escola bíblica"]),
    e("temas", "Todos os temas", "estilos prontos de texto e fundo; clicar abre o Editor",
        ["tema padrão", "presets", "estilo", "fonte", "efeito", "cor", "caixa do texto", "transição", "esmaecer", "deslizar", "corte", "duração", "animação", "fundo", "alinhamento", "posição do texto", "Tornar padrão", "Novo tema", "editor de temas",
            "título do item", "nome da música no slide", "mostrar o título"]),
    e("temas", "Fundos", "a biblioteca de fundos: imagens, vídeos, gerados e cores; nome, categoria, escurecer, desfoque, excluir",
        ["imagens", "vídeos", "gerados", "enviar do computador", "Categoria", "Escurecer", "Desfoque", "favorito", "oculto", "ocultar", "excluir fundo", "excluídos", "restaurar", "fundos do keryx", "biblioteca", "aparência"]),
    e("temas", "Tela ociosa", "o que todas as telas mostram sem nada no ar e sem papel de parede: logo ou preto, fundo, tamanho do logo, frase", ["ociosa", "logo", "preto", "nada no ar", "fundo", "degradê", "cor", "frase", "espera"]),
    e("temas", "Fontes da igreja", "as fontes copiadas do computador ou de um arquivo para os temas: faces, tamanho, excluir; novas entram pelo Editor de temas",
        ["fonte", "fontes", "fonte do computador", "arquivo de fonte", "ttf", "otf", "woff", "família", "tipografia", "letra", "excluir fonte", "editor de temas", "trazer"]),
    e("temas", "Categorias de fundos", "criar, renomear, ordenar e excluir as categorias; abre a biblioteca de fundos",
        ["categoria", "categorias", "nova categoria", "renomear", "ordem", "excluir categoria", "outros", "fundos", "galerias"]),

    e("biblia", "Passagens", "como uma passagem aparece nas telas: versículos por slide, referência e números, com um exemplo", ["passagem", "trecho", "exemplo", "prévia"]),
    e("biblia", "Livros e importação", "livros abreviados e o corte das letras importadas", ["livros", "importar", "estrofe"]),
    e("biblia", "Livros da Bíblia", "abreviados (Gn) ou com o nome inteiro (Gênesis)", ["abreviados", "nome inteiro", "abrev", "livros"]),
    e("temas", "Tema da Bíblia", "o tema das passagens, em Temas padrão", ["tema", "bíblia", "passagens", "fundo", "estilo"], { target: "Temas padrão" }),
    e("biblia", "Versículos por slide", "quantos versículos de um trecho vão em cada slide", ["versículos", "slide", "automático", "trecho"]),
    e("biblia", "Referência", "mostrar João 3:16 embaixo do texto", ["referência", "capítulo"]),
    e("biblia", "Versão na referência", "João 3:16 · NVI, ou sem a versão", ["versão", "NVI"]),
    e("biblia", "Números dos versículos", "pequenos no texto ou ocultos", ["números", "versículos", "ocultar"]),
    e("biblia", "Ao importar letras", "uma estrofe, 2 ou 4 linhas por slide", ["importar", "letras", "músicas", "estrofe", "linhas", "slide"]),
    e("biblia", "Bíblias instaladas", "baixar versões para usar sem internet; a versão em uso na Bíblia",
        ["versão em uso", "usar esta", "versão padrão", "tornar padrão","baixar", "instalar", "sem internet", "offline", "do arquivo", "NVI", "ARA", "ACF", "ARC", "NAA", "NTLH", "AA", "KJA", "King James", "pela internet", "zip"]),

    e("culto", "Planejamento", "o dia, o horário e a duração padrão do culto, a previsão do fim e a pausa entre itens", ["dia", "horário", "duração", "previsão", "setlist", "novo culto", "pausa"]),
    e("culto", "Fora do ar", "o que as telas mostram sem nada no ar e depois do Esc", ["papel de parede", "fora do ar", "esc", "espera", "aparência"]),
    e("culto", "Qualquer outro culto", "o papel de parede dos cultos sem um próprio (era o Fundo padrão de Aparência)", ["papel de parede", "fundo padrão", "fundo de espera", "wallpaper", "imagem", "esc", "igreja", "aparência"]),
    e("culto", "Sem papel de parede", "as telas mostram a tela ociosa; leva ao Editor de telas", ["ociosa", "tela ociosa", "nada no ar"]),
    e("culto", "Dia do culto", "o dia da semana do Novo culto", ["domingo", "dia", "semana"]),
    e("culto", "Horário padrão", "o horário de sempre do culto", ["horário", "hora", "início", "19:00"]),
    e("culto", "Duração padrão", "quanto dura uma música, e qualquer outro item, na setlist", ["duração", "minutos", "música", "tempo"]),
    e("culto", "Modelos de culto", "renomear, excluir e o visual (papel de parede e tema) que cada modelo traz ao culto", ["modelo", "template", "setlist", "visual", "visual do culto", "tema do culto", "fundo do culto", "papel de parede"]),
    e("culto", "Equipe de louvor", "os músicos e cantores para escalar no culto", ["equipe", "músicos", "louvor", "vocal", "banda", "membro"]),
    e("culto", "Previsão do culto", "termina ~ e passou N min na barra do topo", ["previsão", "atraso", "termina", "passou", "fim", "duração"]),
    e("culto", "Pausa entre itens", "com Avançar sozinho ligado, quanto a Setlist espera antes de mandar o próximo", ["avançar sozinho", "autoplay", "setlist automática", "pausa", "próximo", "automático", "segundos", "contagem"]),

    e("console", "Módulos", "Biblioteca, Slides, Camadas, Temas, No ar e Setlist · deste computador", ["biblioteca", "slides", "camadas", "temas", "no ar", "setlist", "mostrar", "esconder", "ocultar"]),
    e("console", "Densidade", "automática, confortável ou compacta · da igreja, viaja no backup", ["automática", "compacta", "confortável", "linhas", "altura", "notebook", "tela pequena"]),
    e("console", "Disposição", "restaurar os módulos, a densidade e as colunas · deste computador", ["escopo", "Restaurar", "restaurar disposição", "layout", "colunas", "tamanhos", "padrão"]),
    e("console", "Este computador", "zoom, ao fechar e iniciar com o Windows · deste computador", ["máquina", "zoom", "fechar", "iniciar", "windows"]),
    e("console", "Teclas de uma letra", "B, L, C, / e ?: ligadas, com Shift ou desligadas · da igreja", ["teclas", "letras", "shift", "atalho", "tela preta", "ditado", "voz", "acessibilidade", "desligar"]),
    e("console", "Zoom", "aumentar ou diminuir tudo no console (Ctrl+= Ctrl+− Ctrl+0) · deste computador", ["zoom", "tamanho", "texto", "letra maior", "aumentar", "diminuir", "ampliar", "acessibilidade", "escala"]),
    e("console", "Ao fechar", "perguntar antes de fechar o KERYX", ["fechar", "sair", "confirmar", "perguntar"]),
    e("console", "Iniciar com o Windows", "abrir o KERYX quando o computador liga", ["windows", "iniciar", "ligar", "automático", "inicialização"]),
    e("console", "Atalhos", "as teclas do console: Enter, setas, B, L, C, Esc", ["teclado", "teclas", "atalho", "enter", "esc"]),

    e("sincronizacao", "Andamento", "ligada ou pausada, a pasta, o estado, as mudanças enviadas e recebidas e os computadores", ["status", "progresso", "computadores", "estado"]),
    e("sincronizacao", "Pasta", "a pasta do Google Drive, OneDrive ou Dropbox que os computadores da igreja compartilham", ["sincronizar", "sincronização", "google drive", "drive", "onedrive", "dropbox", "pasta compartilhada", "outro computador", "notebook", "nuvem", "Escolher a pasta", "Trocar", "Abrir"]),
    e("sincronizacao", "Código da igreja", "criar, digitar, mostrar ou trocar o código que os computadores da igreja usam para sincronizar", ["Código", "código", "senha", "pcs verificados", "verificado", "Criar o código da igreja", "Entrar", "Mostrar", "Trocar o código", "entrar na sincronização", "parear"]),
    e("sincronizacao", "Sincronizar", "ligar ou pausar a sincronização neste computador", ["pausar", "ligar", "desligar", "parar"]),
    e("sincronizacao", "Estado", "em dia, aguardando a pasta, código mudou; Sincronizar agora", ["status", "sincronizar agora", "agora", "erro", "offline", "aguardando"]),
    e("sincronizacao", "Desde que abriu", "quantas mudanças foram enviadas e recebidas", ["enviadas", "recebidas", "mudanças"]),
    e("sincronizacao", "Mídias", "os arquivos de mídia que ainda estão chegando pela pasta", ["arquivos", "vídeos", "imagens", "chegando"]),
    e("sincronizacao", "Computadores", "os computadores da igreja que sincronizam, quando cada um escreveu; Tirar e Deixar voltar", ["computador", "notebook", "lista", "tirar", "Tirar", "Deixar voltar", "sem o código", "verificado"]),
    e("sincronizacao", "O que vai e o que fica", "o que a pasta leva para os outros computadores e o que fica em cada um; espelhar os arquivos do Drive", ["o que vai", "o que fica", "vídeos", "imagens", "letras", "setlist", "telas", "Bíblias", "espelhar", "espelhamento", "off-line", "offline", "compartilhada", "atalho", "Compartilhados comigo"]),
    e("sincronizacao", "Músicas repetidas", "músicas com o mesmo título e a mesma letra depois de juntar os computadores; Juntar em uma, Manter as duas", ["repetidas", "duplicadas", "iguais", "Juntar em uma", "Manter as duas", "juntar"]),
    e("sincronizacao", "Sair", "este computador para de sincronizar; nada é apagado", ["sair da sincronização", "parar", "desligar", "desconectar"]),

    e("backup", "Fazer backup", "o último backup e fazer um backup agora", ["Backup", "cópia", "segurança", "backup agora", "último backup"]),
    e("backup", "Backup automático", "um backup ao abrir e ao fechar, por dia; pode desligar", ["automático", "desligar", "ligar"]),
    e("backup", "Manter os últimos", "quantos backups ficam (7, 14, 30, 60)", ["quantos", "dias", "antigos", "apagar"]),
    e("backup", "Mídias no backup", "as imagens e vídeos também vão para a pasta de backup", ["mídias", "imagens", "vídeos"]),
    e("backup", "Pasta de backup", "onde os backups ficam (um pen drive, outro disco)", ["pasta", "pen drive", "disco"]),
    e("backup", "Restaurar", "voltar os dados de um dia", ["restaurar um backup", "voltar", "recuperar"]),
    e("backup", "Outro computador", "exportar tudo num arquivo e importar em outro computador", ["exportar", "importar", "levar", "zip", "migrar"]),
    e("backup", "Pasta de dados", "onde o KERYX salva tudo neste computador", ["Dados", "dados", "abrir pasta"]),
    e("backup", "Suporte", "salvar o diagnóstico ou relatar um problema ao suporte pela internet", ["diagnóstico", "Salvar diagnóstico", "log", "registro", "ajuda", "problema", "Relatar um problema", "relatar", "erro", "bug", "e-mail", "email", "suporte"]),
    e("backup", "Relatos na fila", "relatos que este computador ainda não conseguiu enviar ao suporte", ["fila", "relato", "relatos", "sem internet", "Tentar agora", "Mandar por e-mail", "e-mail", "suporte"]),
    e("backup", "Versão", "a versão instalada e as atualizações", ["Atualizações", "atualizar", "atualização", "novidades", "versão"]),
    e("backup", "Atualizar automaticamente", "baixar e instalar as atualizações sozinho", ["automático", "atualizações"]),

    e("sobre", "Versão", "a versão do KERYX, Ver novidades e o caminho para as atualizações", ["novidades", "sobre", "atualizar", "atualização", "KERYX", "Ver novidades"]),
    e("sobre", "Igreja", "o nome da igreja, que se muda em Igreja", ["nome", "Mudar em Igreja"]),
    e("sobre", "Feito com", "as versões do Electron e do Chromium do aplicativo", ["electron", "chromium", "chrome"]),
    e("sobre", "Fontes", "a fonte Geist e a licença que a acompanha", ["geist", "licença", "ofl", "fonte", "Ver a licença", "direitos autorais"]),
    e("sobre", "Bíblias", "as Bíblias não vêm no KERYX: cada igreja instala as suas", ["bíblia", "direitos autorais", "licença", "edições", "NVI", "ARA", "Abrir Bíblia e músicas"]),
];

const startsWord = (hay, term) => {
    for (let at = hay.indexOf(term); at >= 0; at = hay.indexOf(term, at + 1)) {
        if (at === 0 || !/[\p{L}\p{N}]/u.test(hay[at - 1])) return true;
    }
    return false;
};
const matches = (text, terms) => { const hay = fold(text); return terms.every((t) => startsWord(hay, t)); };

const ORDER = Object.fromEntries(SECTIONS.map((s, i) => [s.id, i]));
const NAME = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));
// Where an entry lives ("Telas e saídas"), for its result line.
export const placeOf = (entry) => NAME[entry.section] || "";

// -> the entries matching the query (every word, in the label, the hint, the
// keywords or the section's name), in the order of the sections; within a
// section, label matches first. extra: entries built at run time (the
// church's themes, say), same shape.
export function searchSettings(query, extra = []) {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const hits = [];
    for (const entry of [...SETTINGS_INDEX, ...extra]) {
        const hay = [entry.label, entry.hint, placeOf(entry), ...(entry.keywords || [])].join(" · ");
        if (!matches(hay, terms)) continue;
        hits.push({ ...entry, strong: matches(entry.label, terms) });
    }
    return hits
        .map((h, i) => ({ h, i }))
        .sort((a, b) => (ORDER[a.h.section] - ORDER[b.h.section]) || (Number(b.h.strong) - Number(a.h.strong)) || (a.i - b.i))
        .map(({ h }) => h);
}

// -> [{ section, name, hits }]: the results grouped by section, in order.
export function groupHits(hits) {
    const groups = [];
    for (const h of hits) {
        const last = groups[groups.length - 1];
        if (last && last.section === h.section) last.hits.push(h);
        else groups.push({ section: h.section, name: NAME[h.section], hits: [h] });
    }
    return groups;
}

// -> { [section]: n }: how many results each section has (the left column).
export const countBySection = (hits) => hits.reduce((acc, h) => ({ ...acc, [h.section]: (acc[h.section] || 0) + 1 }), {});
