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
