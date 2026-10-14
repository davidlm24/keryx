import test from "node:test";
import assert from "node:assert/strict";
import { lineLimit, slideFit, stanzaAt, slideSpan, fitScale } from "./lyricFit.js";

test("the characters that fit on a screen line shrink as the letters grow", () => {
    assert.equal(lineLimit("large"), 31);
    assert.equal(lineLimit("medium"), 40);
    assert.equal(lineLimit("xxlarge"), 21);
    assert.equal(lineLimit(undefined), lineLimit("large"), "unknown size: the default");
    assert.ok(lineLimit("xsmall") > lineLimit("small"));
});

test("a slide's lines, characters and the lines that will wrap", () => {
    const fit = slideFit("Tu és fiel, Senhor\n\nA tua bondade me alcança todos os dias da minha vida\n", "large");
    assert.equal(fit.lines, 2, "blank lines do not count");
    assert.equal(fit.longest, 52);
    assert.deepEqual(fit.wraps, [2]);
    assert.equal(slideFit("Tu és fiel, Senhor", "large").wraps.length, 0);
    assert.equal(slideFit("ação", "large").chars, 4, "accents count as one character");
    assert.deepEqual(slideFit("", "large"), { lines: 0, chars: 0, longest: 0, limit: 31, wraps: [] });
});

test("the stanza around the caret, for Duplicar estrofe", () => {
    const text = "[Verso]\nlinha 1\nlinha 2\n\n[Refrão]\nrefrão 1\n\nfim";
    const refrao = text.indexOf("refrão 1");
    const [a, b] = stanzaAt(text, refrao);
    assert.equal(text.slice(a, b), "[Refrão]\nrefrão 1");
    assert.equal(text.slice(...stanzaAt(text, 0)), "[Verso]\nlinha 1\nlinha 2");
    assert.equal(text.slice(...stanzaAt(text, text.length)), "fim");
    const spaced = "um\ndois\n  \ntrês\n\n\nquatro\n";
    assert.equal(spaced.slice(...stanzaAt(spaced, 1)), "um\ndois", "a line of spaces separates stanzas, as the slides split them");
    assert.equal(spaced.slice(...stanzaAt(spaced, spaced.indexOf("\n\n") + 1)), "quatro", "on a blank line: the stanza after it");
    assert.equal(spaced.slice(...stanzaAt(spaced, spaced.length)), "quatro", "trailing blank: the stanza before it");
});

test("slideSpan finds each slide's own lines, a repeated chorus its own copy", () => {
    const text = "[Verso]\nlinha 1\nlinha 2\n\n[Refrão]\nrefrão 1\nrefrão 2\n\n[Verso 2]\noutra 1\n\n[Refrão]\nrefrão 1\nrefrão 2";
    const slides = [{ text: "linha 1\nlinha 2" }, { text: "refrão 1\nrefrão 2" }, { text: "outra 1" }, { text: "refrão 1\nrefrão 2" }];
    const [a, b] = slideSpan(text, slides, 1);
    assert.equal(text.slice(a, b), "refrão 1\nrefrão 2");
    const second = slideSpan(text, slides, 3);
    assert.equal(text.slice(...second), "refrão 1\nrefrão 2");
    assert.ok(second[0] > b);
    // Two-line slides of one stanza (Dividir por 2 linhas) each find their part.
    const four = "a\nb\nc\nd";
    assert.equal(four.slice(...slideSpan(four, [{ text: "a\nb" }, { text: "c\nd" }], 1)), "c\nd");
    // Whole lines only, trailing spaces ignored.
    assert.deepEqual(slideSpan("linha 10\nlinha 1  ", [{ text: "linha 1" }], 0), [9, 16]);
});

test("slideSpan is null when the slide is not in the lyrics", () => {
    assert.equal(slideSpan("outra letra", [{ text: "não está" }], 0), null);
    assert.equal(slideSpan("x", [], 0), null);
    assert.equal(slideSpan("x", [{ text: "" }], 0), null);
});

test("slideSpan maps stripped slides back to chorded lyric lines", () => {
    const text = "[Verso]\n[G]Deus é [D]fiel\n[Em]Santo é Ele\n\n[Refrão]\nrefrão um";
    const slides = [{ text: "Deus é fiel\nSanto é Ele" }, { text: "refrão um" }];
    const [a, b] = slideSpan(text, slides, 0);
    assert.equal(text.slice(a, b), "[G]Deus é [D]fiel\n[Em]Santo é Ele", "the selection covers the chorded lines");
    assert.equal(text.slice(...slideSpan(text, slides, 1)), "refrão um");
});

test("fitScale: the font shrinks only as much as the longest line needs", () => {
    assert.equal(fitScale(800, 600), 1, "fits: untouched");
    assert.equal(fitScale(800, 1000), 0.8);
    assert.equal(fitScale(800, 4000), 0.55, "never below the minimum");
    assert.equal(fitScale(800, 4000, 0.3), 0.3);
    assert.equal(fitScale(0, 100), 1, "nothing measured yet: untouched");
});
