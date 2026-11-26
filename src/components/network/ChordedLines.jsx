import React from "react";
import { parseChordLine, transposeInline, hasNote, noteOf, stripNote, isNoteLine, hasNotes, notesOnly, dropNotes } from "@/lib/chords";
import { semitoneLabel } from "@/utils/chordTranspose";

// A slide's lines with their chords riding above the syllables (the Palco,
// and a layout's "Letra atual"): `chorded` is the slide's chorded twin from
// stage.chordedSlides, transposed by `transpose` semitones. Chord-less lines
// render plain. Styles: net.css (.ns-chorded and friends), screen.css.
// Each segment is cut into words (the chord rides on the first), so a long
// line wraps between words where the screen lets it, never past the edge.
// A musicians' note ("// suave", chords.js) is drawn in italics where it was
// written: alone on its row, or after the line.
const byWords = (segs) => segs.flatMap((g) => {
    const words = String(g.text).split(/(?<=\s)(?=\S)/);
    return words.map((text, i) => ({ chord: i === 0 ? g.chord : "", text }));
});
export default function ChordedLines({ chorded, transpose = 0 }) {
    const lines = transposeInline(chorded, transpose).split("\n");
    return (
        <span className="ns-chorded">
            {lines.map((raw, i) => {
                if (isNoteLine(raw)) return noteOf(raw) ? <span key={i} className="ns-line ns-note">{noteOf(raw)}</span> : null;
                const note = hasNote(raw) ? noteOf(raw) : "";
                const line = note ? stripNote(raw) : raw;
                const tail = note && <em className="ns-note">{` ${note}`}</em>;
                const segs = parseChordLine(line);
                if (segs.every((g) => !g.chord)) return <span key={i} className="ns-line">{segs.map((g) => g.text).join("")}{tail}</span>;
                return (
                    <span key={i} className="ns-line">
                        {byWords(segs).map((g, k) => (
                            <span key={k} className="ns-seg">
                                <span className={`ns-ch ${g.chord ? "" : "is-empty"}`} aria-hidden={g.chord ? undefined : "true"}>{g.chord || ""}</span>
                                <span className="ns-tx">{g.text}</span>
                            </span>
                        ))}
                        {tail}
                    </span>
                );
            })}
        </span>
    );
}

// The slide's chorded twin when the lyrics carry chords and the twin differs
// from the plain text; null otherwise.
export const chordedOf = (song, index, plain) => {
    const c = Array.isArray(song?.chordedSlides) ? song.chordedSlides[index] : null;
    return c != null && c !== (plain || "") ? c : null;
};

// What a screen draws for the slide's twin by its own switches (Cifra,
// Anotações): the chords and the notes, either alone, or null (the plain
// text).
export const twinFor = (song, index, plain, { chords = false, annotations = false } = {}) => {
    const c = chordedOf(song, index, plain);
    if (!c || (!chords && !annotations)) return null;
    const out = chords ? (annotations ? c : dropNotes(c)) : (hasNotes(c) ? notesOnly(c) : null);
    return out != null && out !== (plain || "") ? out : null;
};

// − 0 + : the transposition control (never inside a monitor).
export function Transpose({ value, onChange, className = "" }) {
    return (
        <>
            <button type="button" className={className} onClick={() => onChange(value - 1)} aria-label="Baixar meio tom">−</button>
            <output aria-label="Transposição">{semitoneLabel(value)}</output>
            <button type="button" className={className} onClick={() => onChange(value + 1)} aria-label="Subir meio tom">+</button>
        </>
    );
}
