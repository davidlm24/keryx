import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHolyrics, isHolyrics } from "./holyrics.js";
import { songsFromFile, sniffSongFile } from "../songImport.js";

// A real Holyrics export (2026-10-21, the church's library), seven songs as
// exported, every lyric line replaced by "Linha n da letra".
const raw = readFileSync(new URL("./fixtures/holyrics.json", import.meta.url));
const data = JSON.parse(raw.toString("utf8"));
const byTitle = (rows, t) => rows.find((r) => r.title === t);

test("a Holyrics export is a JSON list of songs with paragraphs", () => {
    assert.equal(sniffSongFile("2026-10-21_00-09-36.json", raw.toString("utf8")), "json");
    assert.equal(isHolyrics(data), true);
    assert.equal(isHolyrics([{ title: "A", lyrics: "a" }]), false, "KERYX's own export is not");
    assert.equal(parseHolyrics(data).length, 7);
});

test("the Título/Artista paragraph is the song's header, never a slide", () => {
    const s = byTitle(parseHolyrics(data), "A Alegria Está no Coração");
    assert.equal(s.artist, "Corinhos Evangélicos");
    assert.ok(s.lyrics.startsWith("Linha 1 da letra\nLinha 2 da letra"));
    assert.ok(!/T[ií]tulo:|Artista:/.test(s.lyrics));
    assert.equal(s.lyrics.split("\n\n").length, 7, "8 paragraphs, the header out");
});

test("the header's title keeps the punctuation the title field lost", () => {
    const rows = parseHolyrics(data);
    assert.ok(byTitle(rows, "Aviva-nos / A Terra Clama"), "title field: 'Aviva-nos  A Terra Clama'");
    assert.ok(byTitle(rows, "Eis-me Aqui"), "double spaces collapse");
});

test("key, BPM and the artist; the author only when there is no artist", () => {
    const s = byTitle(parseHolyrics(data), "Marca da Promessa");
    assert.equal(s.song_key, "Em");
    assert.equal(s.bpm, 77.5);
    assert.equal(s.artist, "Davi Sacer");
    assert.equal("copyright" in s, false, "empty in the export");
    const [noArtist] = parseHolyrics([{ ...data[2], artist: "" }]);
    assert.equal(noArtist.artist, "Davi Sacer, Luiz Arcanjo, Deco Rodrigues, Ronald Fonseca");
});

test("comments stay out: text, not text_with_comment", () => {
    const s = byTitle(parseHolyrics(data), "Santo Espírito");
    assert.ok(!s.lyrics.includes("//"));
    assert.ok(s.lyrics.endsWith("Linha 17 da letra\nLinha 18 da letra"));
});

test("[Coro][2x] and [Refrão] (2 Vezes) name the part; a lone marker sings it again", () => {
    const rows = songsFromFile("export.json", raw);
    const coro = byTitle(rows, "Amor Tão Lindo");
    assert.deepEqual(coro.slides.map((x) => x.label || "-"), ["-", "-", "-", "Coro", "Estrofe", "Estrofe", "Estrofe", "Estrofe", "Coro"]);
    assert.equal(coro.slides[3].is_chorus, true);
    assert.equal(coro.slides[3].text, "Linha 7 da letra\nLinha 8 da letra", "the repeat note is not on air");
    const refrao = byTitle(rows, "Eis-me Aqui");
    assert.deepEqual(refrao.slides.map((x) => x.label || "-"), ["-", "Refrão", "Estrofe", "Refrão", "Estrofe", "Refrão", "Estrofe"]);
    assert.equal(refrao.slides[3].text, refrao.slides[1].text, "'[Refrão] (2 Vezes)' alone repeats the chorus");
    for (const r of rows) for (const sl of r.slides) assert.ok(!/^\[|\]$/.test(sl.text.split("\n")[0]), `${r.title}: ${sl.text}`);
});

test("one paragraph, one slide; the import preference still cuts long ones", () => {
    const rows = songsFromFile("export.json", raw);
    assert.equal(byTitle(rows, "A Alma Abatida").slides.length, 8);
    const cut = byTitle(songsFromFile("export.json", raw, { lines: 2 }), "A Alma Abatida");
    assert.equal(cut.slides.length, 16);
    assert.equal(cut.lines_per_slide, 2);
});
