import test from "node:test";
import assert from "node:assert/strict";
import { slideToEdit, editSlide, slidesToSave } from "./slideEdit.js";
import { slidesFromLyrics } from "../songImport.js";

const LYRICS = "[Verso]\n[G]Primeira linha\nSegunda [D]linha\n\n[Refrão]\nEste é o refrão\nCantado por todos\n\n[Verso]\nTerceira linha\nQuarta linha\n\n[Refrão]\nEste é o refrão\nCantado por todos";
const song = (extra = {}) => {
    const lyrics = extra.lyrics ?? LYRICS;
    const slides = slidesToSave(slidesFromLyrics(lyrics, { lines: extra.lines_per_slide || 0, chorded: true }));
    return { lyrics, lines_per_slide: 0, slides, ...extra };
};

test("the box opens with the slide's own lines, chords inline, its heading outside", () => {
    const open = slideToEdit(song(), 0);
    assert.equal(open.text, "[G]Primeira linha\nSegunda [D]linha");
    assert.equal(open.label, "Verso");
});

test("a repeated chorus edits its own copy", () => {
    const s = song();
    const { patch } = editSlide(s, 3, "Este é o refrão\nCantado com força");
    assert.match(patch.lyrics, /Este é o refrão\nCantado por todos\n\n\[Verso\]/);
    assert.ok(patch.lyrics.endsWith("Este é o refrão\nCantado com força"));
    assert.equal(patch.slides[1].text, "Este é o refrão\nCantado por todos");
    assert.equal(patch.slides[3].text, "Este é o refrão\nCantado com força");
    assert.equal(patch.slides[3].label, "Refrão");
});

test("chords stay in the lyrics and in the slide's chorded twin", () => {
    const { patch } = editSlide(song(), 0, "[G]Primeira linha nova\nSegunda [D]linha");
    assert.equal(patch.slides[0].text, "Primeira linha nova\nSegunda linha");
    assert.equal(patch.slides[0].chorded, "[G]Primeira linha nova\nSegunda [D]linha");
});

test("2 linhas: one chunk of a stanza is one slide", () => {
    const lyrics = "Um\nDois\nTrês\nQuatro";
    const s = song({ lyrics, lines_per_slide: 2 });
    assert.equal(slideToEdit(s, 1).text, "Três\nQuatro");
    const { patch } = editSlide(s, 1, "Três\nQuatro e mais");
    assert.equal(patch.lyrics, "Um\nDois\nTrês\nQuatro e mais");
    assert.deepEqual(patch.slides.map((x) => x.text), ["Um\nDois", "Três\nQuatro e mais"]);
});

test("the marks of the other slides stay on their lines", () => {
    const s = song({ line_starts: [1, 2, 10, 11, 20, 21, 30, 31] });
    // A line added to the chorus (slide 1): the verse after it keeps 20 and 21.
    const { patch } = editSlide(s, 1, "Este é o refrão\nCantado por todos\nOutra vez");
    assert.deepEqual(patch.line_starts, [1, 2, 10, 11, null, 20, 21, 30, 31]);
    assert.deepEqual(patch.slides.map((x) => x.start), [1, 10, 20, 30]);
    // Old songs marked by slide: their marks move to lines first.
    const old = song();
    old.slides = old.slides.map((x, i) => ({ ...x, start: i * 10 + 1 }));
    const r = editSlide(old, 0, "[G]Só uma linha");
    assert.deepEqual(r.patch.slides.map((x) => x.start), [1, 11, 21, 31]);
    // No marks: none are made.
    assert.deepEqual(editSlide(song(), 0, "Nova").patch.line_starts, []);
});

test("refusals: empty, a part with no lyrics, slides made apart from the lyrics", () => {
    assert.equal(editSlide(song(), 0, "  \n ").refused, "empty");
    const silent = song({ lyrics: "[Ministração]\n\nUm\nDois" });
    assert.equal(slideToEdit(silent, 0).refused, "nolyrics");
    const apart = song();
    apart.slides = [{ text: "Outro texto" }, ...apart.slides.slice(1)];
    assert.equal(slideToEdit(apart, 0).refused, "mismatch");
    assert.equal(slideToEdit(song(), 9).refused, "mismatch");
});

test("a song with no saved slides edits the lyrics' own split", () => {
    const s = { lyrics: "Um\nDois\n\nTrês", lines_per_slide: 0 };
    assert.equal(slideToEdit(s, 1).text, "Três");
    assert.equal(editSlide(s, 1, "Três e quatro").patch.lyrics, "Um\nDois\n\nTrês e quatro");
});
