import test from "node:test";
import assert from "node:assert/strict";
import { wordRuns, wordCount, wordsOf, blanksView, memorizeHidden, memorizeView, memorizeOrder, discussionTime, stageLines } from "./activity.js";

test("words and what lies between them, as written", () => {
    const runs = wordRuns("Porque Deus amou o mundo, de tal maneira…");
    assert.equal(runs.map((r) => r.text).join(""), "Porque Deus amou o mundo, de tal maneira…");
    assert.deepEqual(runs.filter((r) => r.word !== undefined).map((r) => r.text), ["Porque", "Deus", "amou", "o", "mundo", "de", "tal", "maneira"]);
    assert.equal(runs.find((r) => r.text === ", ").word, undefined, "punctuation is not a word");
    assert.deepEqual(wordsOf("guarda-chuva d'água 3:16"), ["guarda-chuva", "d'água", "3", "16"]);
    assert.equal(wordCount(""), 0);
});

test("Complete a frase: the blanks come back one at a time, in reading order", () => {
    const text = "Porque Deus amou o mundo";
    const at = (step) => blanksView(text, [4, 1], step).filter((r) => r.blank || r.shown).map((r) => `${r.text}:${r.blank ? "_" : r.last ? "new" : "ok"}`);
    assert.deepEqual(at(0), ["Deus:_", "mundo:_"]);
    assert.deepEqual(at(1), ["Deus:new", "mundo:_"]);
    assert.deepEqual(at(2), ["Deus:ok", "mundo:new"]);
});

test("Memorizar: an even share of the words goes each round, all at the last", () => {
    assert.equal(memorizeHidden([3, 1, 0, 2], 4, 4, 0).size, 0);
    assert.deepEqual([...memorizeHidden([3, 1, 0, 2], 4, 4, 1)], [3]);
    assert.deepEqual([...memorizeHidden([3, 1, 0, 2], 4, 2, 1)], [3, 1]);
    assert.equal(memorizeHidden([3], 4, 3, 3).size, 4, "the last round takes every word, named or not");
    assert.deepEqual([...memorizeHidden([9, 1], 3, 3, 2)], [1, 0], "positions past the text are ignored");
    const v = memorizeView("O Senhor é", [2, 0, 1], 3, 1);
    assert.deepEqual(v.filter((r) => r.blank).map((r) => r.text), ["é"]);
    // The same verse always goes the same way; every word once.
    const o = memorizeOrder("O Senhor é o meu pastor, nada me faltará.");
    assert.deepEqual(o, memorizeOrder("O Senhor é o meu pastor, nada me faltará."));
    assert.deepEqual([...o].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("Discussão: the timer waits for the reveal, then counts down from it", () => {
    const a = { kind: "discussion", minutes: 2 };
    assert.deepEqual(discussionTime(a, null, 5000), { left: 120000, started: false, done: false, endsAt: null });
    assert.deepEqual(discussionTime(a, { step: 1, at: 1000 }, 61000), { left: 60000, started: true, done: false, endsAt: 121000 });
    assert.equal(discussionTime(a, { step: 1, at: 1000 }, 999999).done, true);
});

test("the Palco shows the teacher the answer", () => {
    assert.deepEqual(stageLines({ kind: "choice", options: ["Moisés", "Noé"], correct: 1 }), ["A) Moisés", "✓ B) Noé"]);
    assert.deepEqual(stageLines({ kind: "truefalse", correct: 1 }), ["Resposta: Falso"]);
    assert.deepEqual(stageLines({ kind: "memorize" }), []);
    assert.deepEqual(stageLines(null), []);
});
