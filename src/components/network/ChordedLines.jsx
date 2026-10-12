import React from "react";
import { parseChordLine, transposeInline } from "@/lib/chords";
import { semitoneLabel } from "@/utils/chordTranspose";

// A slide's lines with their chords riding above the syllables (the Palco,
// and a layout's "Letra atual"): `chorded` is the slide's chorded twin from
// stage.chordedSlides, transposed by `transpose` semitones. Chord-less lines
// render plain. Styles: net.css (.ns-chorded and friends).
export default function ChordedLines({ chorded, transpose = 0 }) {
    const lines = transposeInline(chorded, transpose).split("\n");
    return (
        <span className="ns-chorded">
            {lines.map((line, i) => {
                const segs = parseChordLine(line);
                if (segs.every((g) => !g.chord)) return <span key={i} className="ns-line">{segs.map((g) => g.text).join("")}</span>;
                return (
                    <span key={i} className="ns-line">
                        {segs.map((g, k) => (
                            <span key={k} className="ns-seg">
                                <span className={`ns-ch ${g.chord ? "" : "is-empty"}`} aria-hidden={g.chord ? undefined : "true"}>{g.chord || ""}</span>
                                <span className="ns-tx">{g.text}</span>
                            </span>
                        ))}
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
