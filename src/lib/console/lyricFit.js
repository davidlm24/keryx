import { stripLine } from "../chords.js";
import { sizeCqw } from "../textSize.js";

// Will a slide's lines fit across the screen? The lyrics sit in 84% of the
// screen's width (8% margin each side, src/components/screen/screen.css) at
// a size in % of the width (src/lib/textSize.js: a number in cqw, or a
// preset's name). Geist averages about 0.55 em per character (a church font
// measures its own, fontMetrics.js emPerChar), so a line longer than this
// wraps on the screens. An estimate: a line of wide letters (M, W) wraps a
// little sooner; the renderer's hidden probe is the truth on screen.

const TEXT_WIDTH_PCT = 84;
export const EM_PER_CHAR = 0.55;

// The characters that fit on one line at a font size (4.8 if unknown).
// em: the font's average width per character; spacing: the theme's letter
// spacing (em), added to every character.
export function lineLimit(fontSize, { em = EM_PER_CHAR, spacing = 0 } = {}) {
    const per = Math.max(0.2, (Number(em) || EM_PER_CHAR) + (Number(spacing) || 0));
    return Math.floor(TEXT_WIDTH_PCT / (sizeCqw(fontSize) * per));
}

// -> { lines, chars, longest, limit, wraps }: wraps lists the 1-based
// numbers of the lines that will break on screen. metrics: lineLimit's.
export function slideFit(text, fontSize, metrics) {
    const rows = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const limit = lineLimit(fontSize, metrics);
    const lengths = rows.map((l) => [...l].length);
    return {
        lines: rows.length,
        chars: lengths.reduce((a, b) => a + b, 0),
        longest: lengths.length ? Math.max(...lengths) : 0,
        limit,
        wraps: lengths.map((n, i) => (n > limit ? i + 1 : 0)).filter(Boolean),
    };
}

// The screens' own fit (fitScale, fitSearch, clampShift) lives in
// src/lib/screenFit.js, small, so the outputs do not load the editors'
// helpers here; re-exported for them.
export { fitScale, fitSearch, clampShift, HEIGHT_MIN } from "../screenFit.js";

// The stanza (block between blank lines, as the slides split them: a line
// of only spaces is blank too) around a caret position in the lyrics, as
// [start, end) offsets of its first and last lines, for "Duplicar estrofe".
// A caret on a blank line takes the stanza after it (else the one before).
export function stanzaAt(text, at) {
    const s = String(text || "");
    const pos = Math.max(0, Math.min(at ?? s.length, s.length));
    const lines = [];
    let off = 0;
    for (const raw of s.split("\n")) { lines.push({ start: off, end: off + raw.length, blank: !raw.trim() }); off += raw.length + 1; }
    let i = lines.findIndex((l) => pos <= l.end);
    if (i < 0) i = lines.length - 1;
    if (lines[i].blank) {
        let j = i;
        while (j < lines.length && lines[j].blank) j += 1;
        if (j === lines.length) { j = i; while (j >= 0 && lines[j].blank) j -= 1; }
        if (j < 0) return [pos, pos];
        i = j;
    }
    let a = i, b = i;
    while (a > 0 && !lines[a - 1].blank) a -= 1;
    while (b < lines.length - 1 && !lines[b + 1].blank) b += 1;
    return [lines[a].start, lines[b].end];
}

// Where slide `index` sits in the lyrics, as [start, end) offsets of its
// lines, for the slide's right-click menu (Duplicar estrofe, Dividir em
// dois, Mostrar na letra). Slides are matched in order, line by line (whole
// lines, trailing spaces ignored), so a repeated chorus finds its own copy.
// null when the slide is not in the lyrics (saved slides edited apart).
export function slideSpan(lyrics, slides, index) {
    const text = String(lyrics || "").replace(/\r/g, "");
    // Raw lines with offsets; a lyric line matches a slide row by its
    // chord-stripped text, so chorded lyrics still map to stripped slides.
    const lines = [];
    let off = 0;
    for (const raw of text.split("\n")) { lines.push({ start: off, end: off + raw.replace(/\s+$/, "").length, bare: stripLine(raw).trim() }); off += raw.length + 1; }
    let li = 0;
    for (let j = 0; j <= index && j < (slides || []).length; j += 1) {
        const rows = String(slides[j]?.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
        if (!rows.length) { if (j === index) return null; continue; }
        let start = -1, end = -1, k = li;
        for (const row of rows) {
            let found = -1;
            for (let i = k; i < lines.length; i += 1) if (lines[i].bare === row) { found = i; break; }
            if (found < 0) return null;
            if (start < 0) start = lines[found].start;
            end = lines[found].end;
            k = found + 1;
        }
        if (j === index) return [start, end];
        li = k;
    }
    return null;
}
