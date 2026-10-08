import test from "node:test";
import assert from "node:assert/strict";
import { parseChords, songFromText, songsFromFile, songsFromJson, isChordLine } from "./songImport.js";

test("ChordPro: directives give title/artist, sections and no inline chords", () => {
    const raw = "{title: Algo Novo}\n{artist: Kemuel}\n{sov 1}\n[G]Vem me visitar [D]hoje aqui\n{eov}\n{soc}\nEspírito, [C]vem\n{eoc}";
    const s = songFromText(raw, { name: "algo.chordpro" });
    assert.equal(s.title, "Algo Novo");
    assert.equal(s.artist, "Kemuel");
    assert.deepEqual(s.slides.map((x) => x.text), ["Vem me visitar hoje aqui", "Espírito, vem"]);
    assert.equal(s.slides[1].is_chorus, true);
    assert.equal(s.lyrics, "Vem me visitar hoje aqui\n\nEspírito, vem");
});

test("plain cifra: chord-only lines go, section markers split", () => {
    assert.equal(isChordLine("C   G/B   Am7  F"), true);
    assert.equal(isChordLine("Cristo é a rocha"), false);
    const raw = "Verso 1:\nG       D\nA alegria está no coração\n\nRefrão:\nC   G\nCristo é a Rocha\nDa minha salvação";
    const parts = parseChords(raw);
    assert.deepEqual(parts.map((p) => p.section), ["Verso 1", "Refrão"]);
    assert.equal(parts[1].text, "Cristo é a Rocha\nDa minha salvação");
});

test("plain lyrics: blank lines split slides; the file name is the title", () => {
    const [s] = songsFromFile("A Alegria Está no Coração.txt", "A alegria está no coração\nDe quem já conhece a Jesus\n\nAleluia, aleluia\r\nAleluia");
    assert.equal(s.title, "A Alegria Está no Coração");
    assert.equal(s.slides.length, 2);
    assert.equal(s.slides[1].text, "Aleluia, aleluia\nAleluia");
    assert.deepEqual(songsFromFile("vazio.txt", "  \n "), [], "an empty file adds nothing");
});

test("JSON export of the songs page", () => {
    const rows = songsFromJson(JSON.stringify({ songs: [{ id: "x", title: "A", lyrics: "a", artist: "B" }, { title: "sem letra" }] }));
    assert.deepEqual(rows, [{ title: "A", lyrics: "a", artist: "B" }]);
    assert.throws(() => songsFromJson("{oops"), /JSON inválido/);
});

test("Ao importar: long stanzas cut into slides of n lines; the lyrics stay whole", () => {
    const raw = "um\ndois\ntrês\nquatro\ncinco\n\nseis";
    assert.equal(songFromText(raw, { name: "x.txt" }).slides.length, 2, "0 keeps stanzas whole");
    const s = songFromText(raw, { name: "x.txt", lines: 2 });
    assert.deepEqual(s.slides.map((x) => x.text), ["um\ndois", "três\nquatro", "cinco", "seis"]);
    assert.equal(s.lyrics, "um\ndois\ntrês\nquatro\ncinco\n\nseis");
});

test("editor: live split with [labels], chorus, line cuts", async () => {
    const { slidesFromLyrics } = await import("./songImport.js");
    const ly = "[Verso 1]\nFirme na rocha\nnada me abala\n\n[Refrão]\nRocha eterna\nem Ti descanso\n\nRocha eterna\nnada separa\n\nsem rótulo";
    const s = slidesFromLyrics(ly);
    assert.deepEqual(s.map((x) => x.label), ["Verso 1", "Refrão", "Refrão", "Refrão"], "a label holds until the next");
    assert.equal(s[1].is_chorus, true);
    assert.equal(s[0].text, "Firme na rocha\nnada me abala");
    assert.equal(slidesFromLyrics(ly, { lines: 1 }).length, 7);
    assert.deepEqual(slidesFromLyrics("[Refrão]\n\n"), [], "a lone label adds nothing");
});

test("editor: timings from the marked starts; durations", async () => {
    const { withTimings, parseDuration, formatDuration } = await import("./songImport.js");
    const slides = [{ text: "a" }, { text: "b" }, { text: "c" }];
    const t = withTimings(slides, [2, 10.555, null], 30);
    assert.deepEqual(t[0], { text: "a", start: 2, duration: 8.56 });
    assert.deepEqual(t[1], { text: "b", start: 10.56, duration: 19.45 }, "the last mark runs to the end of the video");
    assert.deepEqual(t[2], { text: "c" }, "unmarked stays as it was");
    assert.equal(parseDuration("4:36"), 276);
    assert.equal(parseDuration("90"), 90);
    assert.equal(parseDuration("x"), null);
    assert.equal(formatDuration(276), "4:36");
});
