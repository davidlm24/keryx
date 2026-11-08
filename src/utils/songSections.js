// Parser de secções nomeadas — [Verso], [Coro], [Ponte], [Intro], [Final]
// Converte letras com marcadores de secção em slides estruturados

const SECTION_LABELS = {
    verso: "Verso",
    v: "Verso",
    coro: "Coro",
    c: "Coro",
    ponte: "Ponte",
    p: "Ponte",
    intro: "Introdução",
    i: "Introdução",
    final: "Final",
    f: "Final",
    instrumental: "Instrumental",
    pre: "Pré-Coro",
    precoro: "Pré-Coro",
    interludio: "Interlúdio",
};

const SECTION_RE = /^\[(.+?)\]\s*$/;

// Converte letra com secções [Verso 1], [Coro], etc. em slides
// Cada secção vira um slide com o seu label como prefixo
export function parseSections(lyrics) {
    if (!lyrics) return [];

    const lines = lyrics.split("\n");
    const slides = [];
    let currentLabel = "";
    let currentLines = [];

    const flush = () => {
        const text = currentLines.join("\n").trim();
        if (text) {
            slides.push({
                text: currentLabel ? `${currentLabel}\n${text}` : text,
                duration: 0,
            });
        }
        currentLines = [];
    };

    for (const line of lines) {
        const match = line.match(SECTION_RE);
        if (match) {
            flush();
            const key = match[1].trim().toLowerCase().replace(/\s+/g, "");
            currentLabel = SECTION_LABELS[key] || match[1].trim();
            continue;
        }
        currentLines.push(line);
    }
    flush();

    return slides;
}

// Verifica se a letra tem marcadores de secção
export function hasSections(lyrics) {
    if (!lyrics) return false;
    return SECTION_RE.test(lyrics);
}

// Gera slides a partir da letra — usa secções se existirem, senão divide por parágrafos
export function generateSlides(lyrics) {
    if (!lyrics) return [];
    if (hasSections(lyrics)) {
        return parseSections(lyrics);
    }
    return lyrics
        .split(/\n\s*\n/)
        .map(block => ({ text: block.trim(), duration: 0 }))
        .filter(s => s.text);
}