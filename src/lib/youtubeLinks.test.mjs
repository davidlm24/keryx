import test from "node:test";
import assert from "node:assert/strict";
import { isYouTubeRow, checkWords, linkActions, stateOfCheck, stateOfCode, jobMeta, jobFraction, jobActive, refusedWords, linkNote } from "./youtubeLinks.js";

const link = { type: "video", file_url: "https://youtu.be/aBcDeFgHiJk", title: "Abertura" };

test("isYouTubeRow: a link, never a downloaded file", () => {
    assert.equal(isYouTubeRow(link), true);
    assert.equal(isYouTubeRow({ type: "video", file_url: "keryx-media://a.mp4", source_url: link.file_url }), false);
    assert.equal(isYouTubeRow({ type: "image", file_url: link.file_url }), false);
    assert.equal(isYouTubeRow(null), false);
});

test("the check: words and the dialog's buttons", () => {
    assert.deepEqual(checkWords({ state: "ok" }), { tone: "ok", text: "Toca no KERYX pela internet" });
    assert.match(checkWords({ state: "blocked" }).text, /não deixa tocar fora do YouTube/);
    assert.equal(checkWords({ state: "offline" }).tone, "warn");
    assert.equal(checkWords(null), null);
    assert.deepEqual(linkActions({ state: "ok" }), ["add", "download"]);
    assert.deepEqual(linkActions({ state: "offline" }), ["add", "download"], "unchecked: the link still goes in");
    assert.deepEqual(linkActions({ state: "blocked" }), ["download"]);
    assert.deepEqual(linkActions({ state: "missing" }), []);
    assert.deepEqual(linkActions(null), []);
    assert.deepEqual(["ok", "blocked", "missing", "offline"].map((s) => stateOfCheck({ state: s })), ["ok", "blocked", "missing", undefined]);
});

test("stateOfCode: YouTube's player errors", () => {
    assert.deepEqual([101, 150, 100, 5, 153].map(stateOfCode), ["blocked", "blocked", "missing", null, null]);
});

test("jobMeta / jobFraction: the row's line and bar", () => {
    assert.equal(jobMeta({ phase: "downloading", bytes: 18e6, total: 43e6 }), "Baixando 41 % · 18 de 43 MB");
    assert.equal(jobMeta({ phase: "downloading", bytes: 43e6, total: 43e6 }), "Baixando 99 % · 43 de 43 MB", "100 % only once saved");
    assert.equal(jobMeta({ phase: "downloading", bytes: 1.5e6, total: null }), "Baixando · 1,5 MB");
    assert.equal(jobMeta({ phase: "downloading", bytes: 250e6, total: 300e6 }), "Baixando 83 % · 250 de 300 MB");
    assert.equal(jobMeta({ phase: "waiting" }), "Na fila para baixar");
    assert.equal(jobMeta({ phase: "saving" }), "Salvando na Mídia…");
    assert.equal(jobMeta({ phase: "failed", message: "Este vídeo não existe ou é privado." }), "Este vídeo não existe ou é privado.");
    assert.equal(jobMeta(null), "");
    assert.equal(jobFraction({ phase: "downloading", bytes: 1, total: 4 }), 0.25);
    assert.equal(jobFraction({ phase: "saving" }), 1);
    assert.equal(jobFraction({ phase: "done" }), null);
    assert.deepEqual(["waiting", "downloading", "saving", "done", "failed"].map((phase) => jobActive({ phase })), [true, true, true, false, false]);
});

test("refusedWords and linkNote", () => {
    assert.equal(refusedWords({ title: "Clipe", code: 150 }), "O YouTube não deixou tocar “Clipe” fora do site. As telas voltaram ao papel de parede.");
    assert.match(refusedWords({ title: "Clipe", code: 100 }), /não existe mais ou é privado/);
    assert.match(refusedWords({ title: "", code: 5 }), /^O YouTube não tocou o vídeo \(erro 5\)/);
    assert.equal(linkNote({ ...link, youtube_state: "blocked" }), "o dono não deixa tocar fora do YouTube");
    assert.equal(linkNote({ ...link, youtube_state: "ok" }), "");
    assert.equal(linkNote({ type: "video", file_url: "keryx-media://a.mp4", youtube_state: "blocked" }), "");
});
