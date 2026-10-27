// Chords, one module: what counts as a chord, how inline bracket chords
// ([G]Deus é [D]fiel, ChordPro-style) are read, stripped and transposed, and
// how a chords-over-lyrics block becomes inline. The projector never shows
// chords: slides are built from the STRIPPED text (songImport.js,
// content.js); the Palco draws the chorded lines (StageScreen). Pure, so
// node --test checks it.

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_RE = /^([A-G])([#b]?)(.*)$/;

const noteIndex = (letter, accidental) => {
    let idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
    if (accidental === "#") idx += 1;
    if (accidental === "b") idx -= 1;
    return ((idx % 12) + 12) % 12;
};
const indexToNote = (idx, useFlats) => (useFlats ? FLATS : SHARPS)[((idx % 12) + 12) % 12];

// One chord token, anchored and strict: G, Am7, G/B, C#m, Bb, C7(9), Gsus4,
// E7M, Cº. NOT section markers or words: Verso, Final (F + "inal" fails the
// anchor), Bridge, x2, Deus. The old transpose regex matched [Final] as a
// chord and corrupted it to [Ginal]; this one cannot.
const CHORD_BODY = "[A-G](?:#|b)?(?:maj|min|dim|aug|m|M|º|°|\\+)?\\d*M?(?:\\([^()\\s]{1,6}\\))?(?:(?:sus|add)\\d*)?(?:\\/[A-G](?:#|b)?)?";
export const CHORD_RE = new RegExp(`^${CHORD_BODY}$`);
export const isChordToken = (t) => CHORD_RE.test(String(t || ""));

// A line that is only chords ("C   G/B   Am7   F", or "[G] [D]").
export const isChordLine = (line) => {
    const words = String(line || "").trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((w) => isChordToken(w.replace(/[()|[\]]/g, "")) || isChordToken(w.replace(/[|[\]]/g, "")));
};

const INLINE_RE = /\[([^\][]+)\]/g;

// Any bracket chord anywhere in the text (a full-line [Refrão] is not one).
export function hasInlineChords(text) {
    for (const m of String(text || "").matchAll(INLINE_RE)) if (isChordToken(m[1])) return true;
    return false;
}

// One line with its inline chords removed; "[x2]" and section markers stay.
export const stripLine = (line) => String(line ?? "").replace(INLINE_RE, (all, tok) => (isChordToken(tok) ? "" : all));

// A whole text: inline chords out of every line; a line that was only
// chords ("[G] [D]", "G  D  Em") disappears; markers and plain lines stay.
export function stripChords(text) {
    return String(text ?? "").split("\n").filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^\[[^\][]+\]$/.test(t)) return !isChordToken(t.slice(1, -1)); // a marker stays, [G] goes
        return !(hasInlineChords(line) && !stripLine(line).trim());
    }).map(stripLine).join("\n");
}

// "C" -> "D"; a slash chord transposes root AND bass ("G/B" +2 -> "A/C#").
export function transposeChord(chord, semitones) {
    if (!semitones) return chord;
    const [head, bass] = String(chord).split("/");
    const one = (part) => {
        const m = String(part || "").match(NOTE_RE);
        if (!m) return part;
        return indexToNote(noteIndex(m[1], m[2]) + semitones, m[2] === "b") + m[3];
    };
    return bass !== undefined ? `${one(head)}/${one(bass)}` : one(head);
}

// Bracket chords in a chorded line, transposed; everything else untouched.
export const transposeInline = (text, semitones) => (!semitones ? String(text ?? "")
    : String(text ?? "").replace(INLINE_RE, (all, tok) => (isChordToken(tok) ? `[${transposeChord(tok, semitones)}]` : all)));

// A legacy chords block line: bracket chords when it has them; a bare
// chords-only line token by token; a lyric line untouched (the old code
// transposed "Deus" to "Eeus").
export function transposeLine(line, semitones) {
    if (!semitones) return line;
    if (hasInlineChords(line)) return transposeInline(line, semitones);
    if (!isChordLine(line)) return line;
    return String(line).split(/(\s+)/).map((tok) => (/^\s*$/.test(tok) ? tok : transposeChord(tok, semitones))).join("");
}

export function transposeChords(chordsText, semitones) {
    if (!chordsText || !semitones) return chordsText;
    return String(chordsText).split("\n").map((l) => transposeLine(l, semitones)).join("\n");
}

// The chords of a key, for the song editor's chips: a major key's I ii iii
// IV V vi ("D" -> D Em F#m G A Bm), a minor key's i III iv v VI VII
// ("Am" -> Am C Dm Em F G). Flats where the key is written in flats (F, Bb,
// Dm, Gm…). [] when the key is not one ("", "x", "Verso").
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
export function keyChords(key) {
    const m = /^([A-G])([#b]?)(m(?!aj))?/.exec(String(key || "").trim());
    if (!m) return [];
    const root = noteIndex(m[1], m[2]);
    const minor = Boolean(m[3]);
    const major = minor ? (root + 3) % 12 : root;
    const flats = m[2] === "b" || (m[2] !== "#" && FLAT_MAJORS.has(major));
    const steps = minor ? [[0, "m"], [3, ""], [5, "m"], [7, "m"], [8, ""], [10, ""]] : [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"]];
    return steps.map(([s, q]) => indexToNote(root + s, flats) + q);
}

export function semitoneLabel(semitones) {
    if (semitones === 0) return "Original";
    return (semitones > 0 ? "+" : "") + semitones;
}

// Chords-over-lyrics -> inline: a chords-only line drops its chords into the
// lyric line below, each at its column (past the end: appended). A chord
// line with nothing under it is dropped (intro bars belong in the notes).
export function chordLinesToInline(raw) {
    const lines = String(raw || "").replace(/\r/g, "").split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line.trim()) { out.push(""); continue; }
        if (isChordLine(line)) {
            const next = lines[i + 1];
            if (next && next.trim() && !isChordLine(next)) {
                const chords = [];
                for (const m of line.matchAll(/\S+/g)) chords.push({ at: m.index, tok: m[0].replace(/[()|[\]]/g, "") });
                let lyric = next;
                for (let k = chords.length - 1; k >= 0; k -= 1) {
                    const at = Math.min(chords[k].at, lyric.length);
                    lyric = `${lyric.slice(0, at)}[${chords[k].tok}]${lyric.slice(at)}`;
                }
                out.push(lyric);
                i += 1;
            }
            continue;
        }
        out.push(line);
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// A chorded line as segments for rendering: [{ chord, text }], the chord
// riding the text that follows it. A literal non-chord bracket stays in the
// text. A line with no chords is one { chord: null } segment.
export function parseChordLine(line) {
    const s = String(line ?? "");
    const segs = [];
    let last = 0;
    let pending = null;
    for (const m of s.matchAll(INLINE_RE)) {
        if (!isChordToken(m[1])) continue;
        const before = s.slice(last, m.index);
        if (pending !== null || before) segs.push({ chord: pending, text: before });
        pending = m[1];
        last = m.index + m[0].length;
    }
    const tail = s.slice(last);
    if (pending !== null || tail || !segs.length) segs.push({ chord: pending, text: tail });
    return segs;
}
