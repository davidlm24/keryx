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
import { SECTIONS, TELAS_TABS } from "./settings.js";

const e = (section, label, hint, keywords = [], extra = {}) => ({ section, label, hint, keywords, target: extra.target || label, tab: extra.tab || null });

export const SETTINGS_INDEX = [
    e("igreja", "Nome", "o nome da igreja", ["igreja", "título"]),
    e("igreja", "Cidade", "a cidade da igreja"),
    e("igreja", "Logo", "no canto das telas, na tela ociosa e em Mostrar logo", ["logotipo", "marca", "imagem"]),
    e("igreja", "Logo nas telas", "o canto, o tamanho e a opacidade do logo", ["canto", "tamanho", "opacidade", "transparente", "mostrar logo"]),

    e("telas", "Identificar telas", "os monitores ligados e o número de cada um", ["monitores", "monitor", "projetor", "tv", "número"]),
    e("telas", "Saídas", "em que tela abre cada saída, tela cheia ou janela", ["projeção", "letras", "vídeo", "comunicação", "palco", "pastor", "tela cheia", "janela", "trazer para a frente", "fechar", "abrir"]),
    e("telas", "Abrir ao iniciar", "a saída abre sozinha quando o KERYX abre", ["iniciar", "automático"], { target: "Saídas" }),
    e("telas", "Exportar ajustes das saídas", "salva num arquivo a tela e os ajustes de cada saída", ["exportar", "salvar", "arquivo", "backup das saídas", "outro computador", "reinstalar", "spo"], { tab: "geral" }),
    e("telas", "Importar ajustes das saídas", "abre um arquivo de saídas e mostra o que muda antes de aplicar", ["importar", "restaurar", "arquivo", "outro computador", "reinstalar", "carregar"], { tab: "geral" }),
    e("telas", "Som do aviso", "o sino dos avisos: ligar, desligar, volume, testar", ["som", "sino", "alerta", "volume", "testar som", "áudio"], { tab: "geral" }),
    e("telas", "Ajustes", "nome, ícone, conteúdo, layout, texto, margens, logo e tema de cada saída",
        ["Nome", "Ícone", "Conteúdo", "Layout", "Escala do texto", "Cifra", "Relógio e tempo", "Notas para músicos", "Próximo slide", "Relógio", "Próximos itens", "Margens", "Mostrar logo", "Tema", "Restaurar padrão", "tamanho da letra", "Mostrar", "filtro", "só letras", "só Bíblia",
            "Faixa", "Tamanho do texto", "Posição", "Referência na legenda"]),
    e("telas", "Layouts das telas", "os desenhos do Palco e da Tela do pastor: onde ficam relógio, timer, letra e próxima",
        ["layout", "layouts", "desenho", "canvas", "elementos", "palco", "pastor", "retorno", "relógio", "timer", "próxima letra", "próximo slide", "cifra", "monitor", "Novo layout", "Editar", "Duplicar", "Excluir", "editar no canvas"], { tab: "layouts" }),

    e("rede", "Telas na rede", "celulares, tablets e TVs pela rede da igreja", ["wifi", "wi-fi", "celular", "tablet", "rede", "ligar", "endereço", "qr", "link", "obs", "transmissão"]),
    e("rede", "Transmissão", "a legenda para a live no OBS: cor, tamanho e posição da faixa", ["obs", "live", "legenda", "faixa", "transmissão", "youtube"], { target: "Telas na rede" }),
    e("rede", "Controle remoto", "um celular conduz o culto: slides, Tela preta, setlist, Bíblia", ["celular", "remoto", "controle", "telefone", "palco", "pregador", "Celular", "Código", "Conectados", "desconectar"]),
    e("rede", "PIN", "o código que os aparelhos pedem para entrar; Mostrar PIN", ["senha", "código", "proteger", "mostrar pin", "esqueci"]),
    e("rede", "Telas conectadas pela rede", "os aparelhos conectados agora", ["aparelhos", "conectados"]),

    e("aparencia", "Transição entre slides", "esmaecer, deslizar ou corte, para todo item", ["esmaecer", "deslizar", "corte", "fade", "animação"]),
    e("aparencia", "Duração", "quanto dura a transição", ["ms", "velocidade", "tempo", "transição"]),
    e("aparencia", "Fundo padrão", "o fundo das telas quando nada está no ar (e depois do Esc), se o culto não tiver o seu", ["fundo de espera", "espera", "wallpaper", "imagem", "esc"]),
    e("aparencia", "Títulos nas telas", "o título do item no slide e a faixa de título do YouTube", ["título", "nome da música", "youtube", "canal", "esconder"]),
    e("aparencia", "Tela ociosa", "logo ou preto quando nada está no ar e não há fundo", ["ociosa", "logo", "preto", "nada no ar"]),
    e("aparencia", "Fundos", "a biblioteca de fundos: imagens, vídeos, gerados e cores; nome, categoria, escurecer, desfoque, ocultar",
        ["imagens", "vídeos", "gerados", "enviar do computador", "Categoria", "Escurecer", "Desfoque", "Nas galerias", "favorito", "oculto", "biblioteca"]),
    e("temas", "Temas padrão", "um tema para cada tipo: músicas, Bíblia, texto e timer", ["tema padrão", "estilo padrão do texto", "estilo de fábrica", "padrão", "música", "bíblia", "texto", "timer", "relógio", "escola bíblica"]),
    e("temas", "Temas", "estilos prontos de texto e fundo; no console, o card Temas",
        ["tema padrão", "presets", "estilo", "Nome", "Fonte", "Efeito e cor", "Caixa do texto", "Transição", "Fundo", "Ajuste do fundo", "Escurecer", "Escurecer · desfoque", "Tornar padrão", "Novo tema"]),

    e("biblia", "Livros da Bíblia", "abreviados (Gn) ou com o nome inteiro (Gênesis)", ["abreviados", "nome inteiro", "abrev", "livros"]),
    e("biblia", "Tema da Bíblia", "o tema das passagens, separado do das músicas", ["tema", "bíblia", "passagens", "fundo", "estilo"]),
    e("biblia", "Versículos por slide", "quantos versículos de um trecho vão em cada slide", ["versículos", "slide", "automático", "trecho"]),
    e("biblia", "Referência", "mostrar João 3:16 embaixo do texto", ["referência", "capítulo"]),
    e("biblia", "Versão na referência", "João 3:16 · NVI, ou sem a versão", ["versão", "NVI"]),
    e("biblia", "Números dos versículos", "pequenos no texto ou ocultos", ["números", "versículos", "ocultar"]),
    e("biblia", "Ao importar letras", "uma estrofe, 2 ou 4 linhas por slide", ["importar", "letras", "músicas", "estrofe", "linhas", "slide"]),
    e("biblia", "Bíblias instaladas", "baixar versões para usar sem internet; a versão padrão",
        ["versão padrão", "baixar", "instalar", "sem internet", "offline", "do arquivo", "NVI", "ARA", "ACF", "ARC", "NAA", "NTLH", "AA", "BKJ1611"]),

    e("culto", "Dia do culto", "o dia da semana do Novo culto", ["domingo", "dia", "semana"]),
    e("culto", "Horário padrão", "o horário de sempre do culto", ["horário", "hora", "início", "19:00"]),
    e("culto", "Duração padrão", "quanto dura uma música, e qualquer outro item, na setlist", ["duração", "minutos", "música", "tempo"]),
    e("culto", "Modelos de culto", "renomear, excluir e o visual (fundo e temas) que cada modelo traz ao culto", ["modelo", "template", "setlist", "visual", "visual do culto", "tema do culto", "fundo do culto"]),
    e("culto", "Equipe de louvor", "os músicos e cantores para escalar no culto", ["equipe", "músicos", "louvor", "vocal", "banda", "membro"]),
    e("culto", "Previsão do culto", "termina ~ e passou N min na barra do topo", ["previsão", "atraso", "termina", "passou", "fim", "duração"]),

    e("console", "Módulos", "Biblioteca, Slides, Camadas, Temas e Setlist", ["biblioteca", "slides", "camadas", "temas", "setlist", "mostrar", "esconder", "ocultar"]),
    e("console", "Densidade", "confortável ou compacta", ["compacta", "confortável", "linhas", "altura"]),
    e("console", "Layout", "restaurar os módulos, a densidade e as colunas", ["restaurar layout", "colunas", "tamanhos", "padrão"]),
    e("console", "Ao fechar", "perguntar antes de fechar com algo no ar", ["fechar", "sair", "confirmar", "perguntar"]),
    e("console", "Iniciar com o Windows", "abrir o KERYX quando o computador liga", ["windows", "iniciar", "ligar", "automático", "inicialização"]),
    e("console", "Atalhos", "as teclas do console: Enter, setas, B, L, C, Esc", ["teclado", "teclas", "atalho", "enter", "esc"]),

    e("backup", "Backup", "o último backup e Fazer backup agora", ["cópia", "segurança", "backup agora"]),
    e("backup", "Backup automático", "um backup ao abrir e ao fechar, por dia; pode desligar", ["automático", "desligar", "ligar"]),
    e("backup", "Manter os últimos", "quantos backups ficam (7, 14, 30, 60)", ["quantos", "dias", "antigos", "apagar"]),
    e("backup", "Mídias no backup", "as imagens e vídeos também vão para a pasta de backup", ["mídias", "imagens", "vídeos"]),
    e("backup", "Pasta de backup", "onde os backups ficam (um pen drive, outro disco)", ["pasta", "pen drive", "disco"]),
    e("backup", "Restaurar", "voltar os dados de um dia", ["restaurar um backup", "voltar", "recuperar"]),
    e("backup", "Outro computador", "exportar tudo num arquivo e importar em outro computador", ["exportar", "importar", "levar", "zip", "migrar"]),
    e("backup", "Pasta de dados", "onde o KERYX salva tudo neste computador", ["dados", "abrir pasta"]),
    e("backup", "Suporte", "um arquivo de diagnóstico para o suporte", ["diagnóstico", "log", "ajuda", "problema"]),
    e("backup", "Versão", "a versão instalada e as atualizações", ["atualizar", "atualização", "novidades", "versão"]),
    e("backup", "Atualizar automaticamente", "baixar e instalar as atualizações sozinho", ["automático", "atualizações"]),
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
const TAB = Object.fromEntries(TELAS_TABS);

// "Telas e saídas › Layouts das telas": where an entry lives, for its result line.
export const placeOf = (entry) => [NAME[entry.section], entry.tab && TAB[entry.tab]].filter(Boolean).join(" › ");

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
