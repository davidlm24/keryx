import test from "node:test";
import assert from "node:assert/strict";
import { parseChords, songFromText, songsFromFile, songsFromJson, isChordLine, slidesFromLyrics, reflowLyrics, songSlidesFor } from "./songImport.js";

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
    assert.equal(s.lines_per_slide, 2, "the song keeps the split it was imported with");
    assert.equal(songFromText(raw, { name: "x.txt" }).lines_per_slide, 0);
    assert.equal(songFromText(raw, { name: "x.txt", lines: 3 }).lines_per_slide, 0, "only 0, 2 or 4 are kept");
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

test("reflowLyrics: the text is rewritten as the slides read", () => {
    const lyrics = "[Verso]\num\ndois\ntrês\nquatro\ncinco\n\n[Refrão]\nseis\nsete";
    assert.equal(reflowLyrics(lyrics, 2), "[Verso]\num\ndois\n\ntrês\nquatro\n\ncinco\n\n[Refrão]\nseis\nsete");
    assert.equal(reflowLyrics(lyrics, 4), "[Verso]\num\ndois\ntrês\nquatro\n\ncinco\n\n[Refrão]\nseis\nsete");
    assert.equal(reflowLyrics(lyrics, 0), lyrics, "Estrofe: untouched");
    assert.equal(reflowLyrics("[Instrumental]\n\nsolo um\nsolo dois\nsolo três", 2), "[Instrumental]\n\nsolo um\nsolo dois\n\nsolo três", "a marker alone stays its own block");
    assert.equal(reflowLyrics("", 2), "");
    const done = reflowLyrics(lyrics, 2);
    assert.equal(reflowLyrics(done, 2), done, "stable: reflowing again changes nothing");
    const s1 = slidesFromLyrics(lyrics, { lines: 2 }).map((s) => [s.text, s.label]);
    const s2 = slidesFromLyrics(done, { lines: 2 }).map((s) => [s.text, s.label]);
    assert.deepEqual(s2, s1, "same slides before and after the rewrite");
});

test("chorded lyrics: stripped slides, chorded twins aligned, same cuts", () => {
    const lyrics = "[Verso]\n[G]um\n[D]dois\n[Em]três\n[C]quatro\n\n[Refrão]\n[G] [D]\nrefrão um\nrefrão dois";
    for (const lines of [0, 2]) {
        const built = slidesFromLyrics(lyrics, { lines, chorded: true });
        assert.deepEqual(built.map((s) => s.text.split("\n").length), built.map((s) => s.chorded.split("\n").length), "1:1 rows");
        assert.ok(built.every((s) => !/\[[A-G]/.test(s.text)), "slides carry no chords");
        assert.ok(built.some((s) => /\[G\]/.test(s.chorded)), "the chorded twin keeps them");
    }
    const two = slidesFromLyrics(lyrics, { lines: 2, chorded: true });
    assert.equal(two[0].text, "um\ndois");
    assert.equal(two[0].chorded, "[G]um\n[D]dois");
    assert.equal(two[2].text, "refrão um\nrefrão dois", "the chords-only line is not a row");
});

test("songSlidesFor: chordedSlides only when the lyrics carry chords; saved slides stripped at send", () => {
    const chorded = songSlidesFor({ lyrics: "[Verso]\n[G]Deus é [D]fiel\nSanto é Ele" });
    assert.equal(chorded.slides[0].text, "Deus é fiel\nSanto é Ele");
    assert.deepEqual(chorded.chordedSlides, ["[G]Deus é [D]fiel\nSanto é Ele"]);
    const plain = songSlidesFor({ lyrics: "Deus é fiel\n\nSanto é Ele" });
    assert.equal(plain.chordedSlides, null);
    const saved = songSlidesFor({ slides: [{ text: "[G]Deus é fiel", label: "Verso" }], lyrics: "" });
    assert.equal(saved.slides[0].text, "Deus é fiel", "brackets saved into slides never reach the screen");
    assert.deepEqual(saved.chordedSlides, ["[G]Deus é fiel"]);
    const split = songSlidesFor({ lyrics: "[G]a\n[D]b\n[Em]c\n[C]d", lines_per_slide: 2 });
    assert.deepEqual(split.slides.map((s) => s.text), ["a\nb", "c\nd"]);
    assert.deepEqual(split.chordedSlides, ["[G]a\n[D]b", "[Em]c\n[C]d"]);
});

test("reflowLyrics keeps a chords-only line with the row under it", () => {
    assert.equal(reflowLyrics("[Verso]\n[G] [D]\num\ndois\ntrês", 2), "[Verso]\n[G] [D]\num\ndois\n\ntrês");
});
