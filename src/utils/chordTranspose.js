// Transposição de acordes — reescreve cifras mudando a tonalidade N semitons

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_RE = /^([A-G])([#b]?)(.*)$/;

function noteIndex(match) {
    const letter = match[1];
    const accidental = match[2] || "";
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
    let idx = base;
    if (accidental === "#") idx += 1;
    if (accidental === "b") idx -= 1;
    return ((idx % 12) + 12) % 12;
}

function indexToNote(idx, useFlats) {
    idx = ((idx % 12) + 12) % 12;
    return useFlats ? FLATS[idx] : SHARPS[idx];
}

// Transpõe um único acorde (ex: "C" → "D", "Am7" → "Bm7", "F#" → "G#")
export function transposeChord(chord, semitones) {
    if (!semitones) return chord;
    const match = chord.match(NOTE_RE);
    if (!match) return chord;
    const rootIdx = noteIndex(match);
    const useFlats = match[2] === "b";
    const newRoot = indexToNote(rootIdx + semitones, useFlats);
    return newRoot + match[3];
}

// Transpõe uma linha de cifra com acordes inline (ex: "[C]Jesus [G]name")
// ou acordes separados por espaços (ex: "C  G  Am  F")
export function transposeLine(line, semitones) {
    if (!semitones) return line;
    // Acordes entre parêntesis retos: [C] [Am7] [F#m]
    if (/\[([A-G][#b]?[a-z0-9]*)\]/.test(line)) {
        return line.replace(/\[([A-G][#b]?[a-z0-9]*)\]/g, (_, chord) => `[${transposeChord(chord, semitones)}]`);
    }
    // Acordes separados por espaços no início da linha (linha de cifra)
    return line.split(/(\s+)/).map(tok => {
        if (/^\s+$/.test(tok) || !tok) return tok;
        return transposeChord(tok, semitones);
    }).join("");
}

// Transpõe um bloco de cifra completo
export function transposeChords(chordsText, semitones) {
    if (!chordsText || !semitones) return chordsText;
    return chordsText.split("\n").map(line => transposeLine(line, semitones)).join("\n");
}

// Formata semitons como tonalidade relativa (ex: +2 → "+2", -1 → "-1")
export function semitoneLabel(semitones) {
    if (semitones === 0) return "Original";
    return (semitones > 0 ? "+" : "") + semitones;
}