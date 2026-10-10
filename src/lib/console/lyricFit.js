// Will a slide's lines fit across the screen? The lyrics sit in 84% of the
// screen's width (8% margin each side, src/components/screen/screen.css) at
// a size in % of the width (ScreenRenderer SIZE_CQW). Geist averages about
// 0.55 em per character, so a line longer than this wraps on the screens.
// An estimate: a line of wide letters (M, W) wraps a little sooner.

const SIZE_PCT = { xsmall: 2.4, small: 3, medium: 3.8, large: 4.8, xlarge: 5.8, xxlarge: 7 };
const TEXT_WIDTH_PCT = 84;
const EM_PER_CHAR = 0.55;

// The characters that fit on one line at a font size ("large" if unknown).
export function lineLimit(fontSize) {
    const size = SIZE_PCT[fontSize] || SIZE_PCT.large;
    return Math.floor(TEXT_WIDTH_PCT / (size * EM_PER_CHAR));
}

// -> { lines, chars, longest, limit, wraps }: wraps lists the 1-based
// numbers of the lines that will break on screen.
export function slideFit(text, fontSize) {
    const rows = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const limit = lineLimit(fontSize);
    const lengths = rows.map((l) => [...l].length);
    return {
        lines: rows.length,
        chars: lengths.reduce((a, b) => a + b, 0),
        longest: lengths.length ? Math.max(...lengths) : 0,
        limit,
        wraps: lengths.map((n, i) => (n > limit ? i + 1 : 0)).filter(Boolean),
    };
}

// The stanza (blank-line block) around a caret position in the lyrics, as
// [start, end) offsets, for "Duplicar estrofe".
export function stanzaAt(text, at) {
    const s = String(text || "");
    const pos = Math.max(0, Math.min(at ?? s.length, s.length));
    const before = s.lastIndexOf("\n\n", pos === 0 ? 0 : pos - 1);
    let start = before < 0 ? 0 : before + 2;
    while (start < s.length && s[start] === "\n") start += 1;
    const after = s.indexOf("\n\n", pos);
    const end = after < 0 ? s.length : after;
    return [start, Math.max(start, end)];
}

// Where slide `index` sits in the lyrics, as [start, end) offsets of its
// lines, for the slide's right-click menu (Duplicar estrofe, Dividir em
// dois, Mostrar na letra). Slides are matched in order, line by line (whole
// lines, trailing spaces ignored), so a repeated chorus finds its own copy.
// null when the slide is not in the lyrics (saved slides edited apart).
export function slideSpan(lyrics, slides, index) {
    const text = String(lyrics || "").replace(/\r/g, "");
    const lineAt = (line, from) => {
        for (let p = text.indexOf(line, from); p >= 0; p = text.indexOf(line, p + 1)) {
            const startsLine = p === 0 || text[p - 1] === "\n";
            const rest = text.slice(p + line.length, (text.indexOf("\n", p + line.length) + 1 || text.length + 1) - 1);
            if (startsLine && !rest.trim()) return p;
        }
        return -1;
    };
    let cursor = 0;
    for (let j = 0; j <= index && j < (slides || []).length; j += 1) {
        const rows = String(slides[j]?.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
        if (!rows.length) { if (j === index) return null; continue; }
        let at = cursor, start = -1, end = -1;
        for (const row of rows) {
            const p = lineAt(row, at);
            if (p < 0) return null;
            if (start < 0) start = p;
            end = p + row.length;
            at = end;
        }
        if (j === index) return [start, end];
        cursor = end;
    }
    return null;
}
