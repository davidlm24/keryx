import test from "node:test";
import assert from "node:assert/strict";
import { isChordToken, isChordLine, hasInlineChords, stripLine, stripChords, transposeChord, transposeInline, transposeLine, transposeChords, chordLinesToInline, parseChordLine } from "./chords.js";

test("chord tokens: real chords in, markers and words out", () => {
    for (const ok of ["G", "Am", "Am7", "A7", "G/B", "D/F#", "C#m", "Bb", "F#m7", "C7(9)", "Am7(b5)", "Gsus4", "Dsus", "Dadd9", "E7M", "Cº", "C°", "Em"]) {
        assert.ok(isChordToken(ok), `${ok} is a chord`);
    }
    for (const bad of ["Verso", "Verso 1", "Refrão", "Coro", "Ponte", "Final", "Bridge", "Instrumental", "x2", "Deus", "Ele", "Glória", "Casa", "Dados", ""]) {
        assert.ok(!isChordToken(bad), `${bad} is not a chord`);
    }
    assert.ok(isChordLine("C   G/B   Am7   F"));
    assert.ok(isChordLine("[G] [D]"));
    assert.ok(!isChordLine("E o amor permanece"));
});

test("stripping: chords out, markers and literal brackets stay", () => {
    assert.equal(stripLine("[G]Deus é [D]fiel"), "Deus é fiel");
    assert.equal(stripLine("Canta [x2] agora"), "Canta [x2] agora", "a non-chord bracket is text");
    assert.equal(stripChords("[Verso]\n[G]Deus é [D]fiel\n[G] [D]\nSanto é Ele"), "[Verso]\nDeus é fiel\nSanto é Ele", "a chords-only line disappears; the marker stays");
    assert.equal(stripChords("sem acordes"), "sem acordes");
    assert.ok(hasInlineChords("la [G] la") && !hasInlineChords("[Refrão]\nla la"));
});

test("transpose: inline brackets only; slash chords; words untouched", () => {
    assert.equal(transposeChord("G/B", 2), "A/C#", "root AND bass move");
    assert.equal(transposeInline("[G]Deus é [D/F#]fiel", 1), "[G#]Deus é [D#/G]fiel");
    assert.equal(transposeInline("[Final]\n[G]fim", 2), "[Final]\n[A]fim", "[Final] is not a chord (the old regex corrupted it to [Ginal])");
    assert.equal(transposeLine("Deus é fiel", 2), "Deus é fiel", "a lyric line in a legacy block is untouched (old bug: Deus -> Eeus)");
    assert.equal(transposeLine("G  D  Em  C", 2), "A  E  F#m  D");
    assert.equal(transposeChords("G  D\nDeus é fiel", 2), "A  E\nDeus é fiel");
});

test("chords-over-lyrics becomes inline at each chord's column", () => {
    const raw = "G        D\nDeus é   fiel\n\nEm\nSanto";
    assert.equal(chordLinesToInline(raw), "[G]Deus é   [D]fiel\n\n[Em]Santo");
    assert.equal(chordLinesToInline("C\n"), "", "a chord line with nothing under it is dropped");
    const past = chordLinesToInline("C      G\ncurto");
    assert.equal(past, "[C]curto[G]", "a chord past the line's end is appended");
});

test("parseChordLine: segments with the chord riding the text after it", () => {
    assert.deepEqual(parseChordLine("[G]Deus é [D]fiel"), [{ chord: "G", text: "Deus é " }, { chord: "D", text: "fiel" }]);
    assert.deepEqual(parseChordLine("intro [G]"), [{ chord: null, text: "intro " }, { chord: "G", text: "" }]);
    assert.deepEqual(parseChordLine("sem acordes"), [{ chord: null, text: "sem acordes" }]);
    assert.deepEqual(parseChordLine("la [x2] [G]fim"), [{ chord: null, text: "la [x2] " }, { chord: "G", text: "fim" }]);
});
