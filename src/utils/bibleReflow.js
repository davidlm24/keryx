// Reflow automático — divide versículos longos em slides legíveis

const MAX_CHARS_PER_LINE = 78;
const MAX_LINES_PER_SLIDE = 4;

// Divide um texto longo em slides com quebras de linha naturais
export function reflowBibleText(text, reference = "") {
    if (!text) return [{ text: "", duration: 0 }];

    // Se o texto já é curto, devolve como slide único
    if (text.length <= MAX_CHARS_PER_LINE * MAX_LINES_PER_SLIDE) {
        const header = reference ? `${reference}\n` : "";
        return [{ text: header + text.trim(), duration: 0 }];
    }

    // Divide em frases (por ponto, ponto e vírgula, ou conjunções)
    const sentences = text
        .replace(/([.;:])\s+/g, "$1\n")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

    const slides = [];
    let currentLines = [];
    let currentLineLen = 0;
    let isFirst = true;

    for (const sentence of sentences) {
        // Quebra a frase em linhas que cabem na largura
        const words = sentence.split(/\s+/);
        let lineWords = [];

        for (const word of words) {
            const prospective = lineWords.concat(word).join(" ");
            if (prospective.length > MAX_CHARS_PER_LINE && lineWords.length > 0) {
                currentLines.push(lineWords.join(" "));
                lineWords = [word];
                if (currentLines.length >= MAX_LINES_PER_SLIDE) {
                    const header = (isFirst && reference) ? `${reference}\n` : "";
                    slides.push({ text: header + currentLines.join("\n"), duration: 0 });
                    currentLines = [];
                    isFirst = false;
                }
            } else {
                lineWords.push(word);
            }
        }
        if (lineWords.length > 0) {
            currentLines.push(lineWords.join(" "));
            if (currentLines.length >= MAX_LINES_PER_SLIDE) {
                const header = (isFirst && reference) ? `${reference}\n` : "";
                slides.push({ text: header + currentLines.join("\n"), duration: 0 });
                currentLines = [];
                isFirst = false;
            }
        }
    }

    if (currentLines.length > 0) {
        const header = (isFirst && reference) ? `${reference}\n` : "";
        slides.push({ text: header + currentLines.join("\n"), duration: 0 });
    }

    return slides;
}