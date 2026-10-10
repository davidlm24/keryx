import test from "node:test";
import assert from "node:assert/strict";
import { lineLimit, slideFit, stanzaAt, slideSpan } from "./lyricFit.js";

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
