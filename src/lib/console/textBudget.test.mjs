import test from "node:test";
import assert from "node:assert/strict";
import { textBudget, chunkText } from "./textBudget.js";

test("textBudget: the factory Bíblia theme holds about what the old Auto did", () => {
    const n = textBudget({});
    assert.ok(n > 200 && n < 300, `about 220 characters: ${n}`);
});

test("textBudget: a bigger font, capitals or a narrower box hold less", () => {
    const base = textBudget({});
    assert.ok(textBudget({ font_size: "7" }) < base / 1.8, "GGG holds about half");
    assert.ok(textBudget({}, { em: 0.68 }) < base, "capitals are wider letters");
    assert.ok(textBudget({ text_max_width: 60 }) < base * 0.7, "a box at 60 % holds less");
    assert.ok(textBudget({ line_height: 2 }) < base, "loose lines hold less");
    assert.ok(textBudget({ font_size: "2.4" }) > base * 3, "PP holds much more");
});

test("textBudget: two editions on screen each hold less than one alone", () => {
    const one = textBudget({});
    assert.ok(textBudget({}, {}, { pair: "side" }) < one);
    assert.ok(textBudget({}, {}, { pair: "stack" }) < one);
});

test("textBudget: free text has no reference line and its own size", () => {
    assert.notEqual(textBudget({}, {}, { kind: "text" }), textBudget({}));
});

test("textBudget: never below a floor", () => {
    assert.equal(textBudget({ font_size: "12", line_height: 2 }, { em: 1.2 }), 40);
});

test("chunkText: whole sentences where they fit, words otherwise", () => {
    const t = "Primeira frase curta. Segunda frase também curta! E uma terceira?";
    assert.deepEqual(chunkText(t, 200), [t], "fits: one piece");
    assert.deepEqual(chunkText(t, 40), ["Primeira frase curta.", "Segunda frase também curta!", "E uma terceira?"]);
    const long = Array.from({ length: 30 }, (_, i) => `palavra${i}`).join(" ");
    const parts = chunkText(long, 50);
    assert.ok(parts.length > 1 && parts.every((p) => p.length <= 50), "a long sentence by words");
    assert.equal(parts.join(" "), long, "nothing lost or reordered");
    assert.deepEqual(chunkText("", 50), []);
    assert.deepEqual(chunkText("7 E até nomeou profetas: “Há um rei em Judá!” Ora, essa informação será levada ao rei.", 50), ["7 E até nomeou profetas: “Há um rei em Judá!”", "Ora, essa informação será levada ao rei."]);
});

test("textBudget: a wider Margem holds less, none holds more (owner 2026-10-30, M = A)", () => {
    const base = textBudget({});
    assert.ok(textBudget({ text_margin: 16 }) < base);
    assert.ok(textBudget({ text_margin: 0 }) > base);
    assert.equal(textBudget({ text_margin: "" }), base, "the factory 8 is the default");
});
