import { test } from "node:test";
import assert from "node:assert/strict";
import { notesSummary, noticeTextSummary, noticeBackgroundSummary } from "./pageGroups.js";

test("small summaries", () => {
    assert.equal(notesSummary(""), "vazio");
    assert.equal(notesSummary("Intro"), "Intro");
    assert.ok(notesSummary("x".repeat(80)).endsWith("…"));
});
test("notice summaries", () => {
    const sizes = [["large", "Grande"]], effects = [["shadow", "Sombra"]];
    assert.equal(noticeTextSummary({}, sizes, effects), "Grande · Sombra");
    assert.equal(noticeBackgroundSummary({}), "sem fundo");
    assert.equal(noticeBackgroundSummary({ background_image: "x", background_audio: "y", files: [1, 2] }), "imagem · áudio · sequência de 2");
});
