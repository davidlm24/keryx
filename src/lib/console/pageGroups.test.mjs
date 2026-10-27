import { test } from "node:test";
import assert from "node:assert/strict";
import { songThemeSummary, partThemesSummary, notesSummary, noticeTextSummary, noticeBackgroundSummary } from "./pageGroups.js";

test("song theme summary", () => {
    assert.equal(songThemeSummary({ following: true }), "sem tema próprio");
    assert.equal(songThemeSummary({ following: false }), "só desta música");
    assert.equal(songThemeSummary({ missing: true }), "tema excluído");
    assert.equal(songThemeSummary({ theme: {}, themeName: "Claro" }), "Claro");
    assert.equal(songThemeSummary({ following: true, step: 1 }), "sem tema próprio · tamanho +1", "the size relative to the theme (P8-2)");
    assert.equal(songThemeSummary({ theme: {}, themeName: "Claro", step: -2 }), "Claro · tamanho −2");
});
test("part themes summary", () => {
    const parts = [{ key: "refrao" }, { key: "ponte" }];
    assert.equal(partThemesSummary({}, []), "sem partes marcadas");
    assert.equal(partThemesSummary({}, parts), "nenhuma parte com tema");
    assert.equal(partThemesSummary({ refrao: "a", old: "b" }, parts), "1 parte com tema");
    assert.equal(partThemesSummary({ refrao: "a", ponte: "b" }, parts), "2 partes com tema");
});
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
