import test from "node:test";
import assert from "node:assert/strict";
import { parseChords, songFromText, songsFromFile, songsFromJson, isChordLine, slidesFromLyrics, songSlidesFor, linesLimit, reflowLyrics, sungLines, isNoLyrics, sniffSongFile, decodeSongBytes, splitRepeated, importSummary, readSongFile, importPlan, importedItems, importRowMeta, importRowSize, importSource, importCounts, insertParts } from "./songImport.js";

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
    const three = songFromText(raw, { name: "x.txt", lines: 3 });
    assert.equal(three.lines_per_slide, 3, "any limit from 1 to 12 is kept");
    assert.deepEqual(three.slides.map((x) => x.text), ["um\ndois\ntrês", "quatro\ncinco", "seis"]);
    assert.equal(songFromText(raw, { name: "x.txt", lines: 40 }).lines_per_slide, 12);
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


test("lines per slide: any limit, the lyrics never rewritten", () => {
    assert.deepEqual([0, -1, "x", null, 1, 3, 2.6, 12, 99].map(linesLimit), [0, 0, 0, 0, 1, 3, 3, 12, 12]);
    const lyrics = "[Verso]\num\ndois\ntrês\nquatro\ncinco\n\n[Refrão]\nseis\nsete";
    const texts = (lines) => slidesFromLyrics(lyrics, { lines }).map((s) => s.text);
    assert.deepEqual(texts(3), ["um\ndois\ntrês", "quatro\ncinco", "seis\nsete"]);
    assert.deepEqual(texts(2), ["um\ndois", "três\nquatro", "cinco", "seis\nsete"]);
    assert.deepEqual(texts(0), ["um\ndois\ntrês\nquatro\ncinco", "seis\nsete"], "Estrofe after a smaller limit joins back: the split is a setting, not the text");
    const three = songSlidesFor({ lyrics, lines_per_slide: 3 });
    assert.deepEqual(three.slides.map((s) => s.text), texts(3));
    assert.deepEqual(three.slides.map((s) => s.label), ["Verso", "Verso", "Refrão"]);
});

test("songSlidesFor: saved slides keep the chords the editor saved with them", () => {
    const built = songSlidesFor({ lyrics: "x", slides: [{ text: "Deus é fiel", chorded: "[G]Deus é [D]fiel", label: "Verso" }, { text: "Santo" }] });
    assert.deepEqual(built.slides.map((s) => s.text), ["Deus é fiel", "Santo"]);
    assert.ok(built.slides.every((s) => !("chorded" in s)), "the twin rides apart, never in the slide");
    assert.deepEqual(built.chordedSlides, ["[G]Deus é [D]fiel", "Santo"]);
});

test("songSlidesFor: slides saved before the twins were kept get them from the lyrics", () => {
    const lyrics = "[Verso]\n[G]Deus é [D]fiel\nSanto é Ele\n\n[Refrão]\n[C]Glória";
    const old = songSlidesFor({ lyrics, slides: [{ text: "Deus é fiel\nSanto é Ele", label: "Verso", start: 3 }, { text: "Glória", label: "Refrão" }] });
    assert.deepEqual(old.chordedSlides, ["[G]Deus é [D]fiel\nSanto é Ele", "[C]Glória"]);
    assert.equal(old.slides[0].start, 3, "the saved slide keeps its timing");
    const apart = songSlidesFor({ lyrics, slides: [{ text: "outra coisa" }] });
    assert.equal(apart.chordedSlides, null, "slides that no longer match the lyrics stay as saved");
});

test("what a file is comes from its content: a ChordPro .pro is text, ProPresenter is refused", () => {
    const chordpro = "{title: Algo Novo}\n{copyright: 2020 Fulano}\n{soc}\n[G]Vem, Espírito\n{eoc}";
    const [song] = songsFromFile("algo.pro", new TextEncoder().encode(chordpro));
    assert.equal(song.title, "Algo Novo");
    assert.equal(song.copyright, "2020 Fulano");
    // ProPresenter 7: protobuf, NUL bytes and all.
    const pro7 = Uint8Array.from([0x0a, 0x24, 0x0a, 0x00, 0x12, 0x05, 0x41, 0x6d, 0x61, 0x7a, 0x00, 0x1a]);
    assert.throws(() => songsFromFile("Amazing.pro", pro7), /do ProPresenter 7, que o KERYX ainda não lê/);
    assert.throws(() => songsFromFile("foto.txt", pro7), /não é um arquivo de texto/);
    assert.throws(() => songsFromFile("Amazing.pro6", "<?xml version=\"1.0\"?>\n<RVPresentationDocument height=\"1080\">"), /ProPresenter 6/);
    assert.throws(() => songsFromFile("outra.xml", "<?xml version=\"1.0\"?><playlist><item/></playlist>"), /XML que não é do OpenLyrics/);
    assert.equal(sniffSongFile("x.txt", "[Verso 1]\nJesus"), "text", "a label is not JSON");
    assert.equal(sniffSongFile("musicas", "{\"songs\":[]}"), "json", "JSON without its extension");
    assert.equal(sniffSongFile("x.txt", "<b>Refrão</b> sem fim"), "text", "a stray tag is still text");
});

test("bytes: UTF-8 with or without BOM, UTF-16, and the old Windows-1252 .txt", () => {
    assert.equal(decodeSongBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x43, 0xc3, 0xa9, 0x75])), "Céu");
    assert.equal(decodeSongBytes(Uint8Array.from([0xff, 0xfe, 0x43, 0x00, 0xe9, 0x00, 0x75, 0x00])), "Céu");
    assert.equal(decodeSongBytes(Uint8Array.from([0x43, 0xe9, 0x75, 0x20, 0x61, 0x7a, 0x75, 0x6c])), "Céu azul", "not UTF-8: Windows-1252");
    const [song] = songsFromFile("Graça.txt", Uint8Array.from([...new TextEncoder().encode("Gra"), 0xe7, 0x61]).buffer);
    assert.equal(song.lyrics, "Graça");
});

test("an import leaves out what the library has, and repeats inside the same import", () => {
    const existing = [{ id: "1", title: "Grande é o Senhor", lyrics: "Grande é o [G]Senhor\ne mui digno" }];
    const rows = [
        { title: "GRANDE É O SENHOR", lyrics: "[Estrofe]\nGrande é o Senhor!\nE mui digno" },
        { title: "Nova", lyrics: "um" },
        { title: "Nova", lyrics: "um" },
    ];
    const { fresh, repeated } = splitRepeated(rows, existing);
    assert.deepEqual(fresh.map((r) => r.title), ["Nova"]);
    assert.equal(repeated.length, 2);
});

test("the import's toast", () => {
    assert.equal(importSummary({ made: 3, repeated: 2, bad: ["a.pro (do ProPresenter 7, que o KERYX ainda não lê)"] }),
        "3 músicas importadas · 2 já estavam na biblioteca e ficaram de fora · não deu: a.pro (do ProPresenter 7, que o KERYX ainda não lê).");
    assert.equal(importSummary({ made: 1 }), "1 música importada.");
    assert.equal(importSummary({ repeated: 1 }), "1 já estava na biblioteca e ficou de fora.");
    assert.equal(importSummary({ bad: ["x.txt"] }), "Nenhuma letra encontrada · não deu: x.txt.");
});

test("readSongFile names the format the import shows", () => {
    assert.equal(readSongFile("a.cho", "{title: A}\n{soc}\nVem\n{eoc}").format, "ChordPro");
    assert.equal(readSongFile("a.txt", "Vem, Espírito").format, "texto");
    assert.equal(readSongFile("a.json", JSON.stringify([{ title: "A", lyrics: "a" }])).format, "KERYX");
    assert.equal(readSongFile("h.json", JSON.stringify([{ title: "A", lyrics: { paragraphs: [{ text: "a" }] } }])).format, "Holyrics");
});

test("the import plan: ready, repeated (library or this import) and files that gave nothing", () => {
    const files = [
        { name: "a.xml", format: "OpenLyrics", rows: [{ title: "Nova", artist: "Fulano", song_key: "G", lyrics: "um", slides: [{ text: "um" }, { text: "dois", chorded: "[G]dois" }] }] },
        { name: "b.txt", format: "texto", rows: [{ title: "Velha", lyrics: "já tem", slides: [{ text: "já tem" }] }] },
        { name: "c.txt", format: "texto", rows: [{ title: "Nova", lyrics: "um", slides: [] }] },
        { name: "x.pro", error: "do ProPresenter 7, que o KERYX ainda não lê" },
        { name: "vazio.txt", format: "texto", rows: [] },
    ];
    const { items, counts } = importPlan(files, [{ id: "1", title: "VELHA", lyrics: "Já tem!" }]);
    assert.deepEqual(items.map((it) => it.status), ["ok", "repeated", "repeated", "bad", "bad"]);
    assert.deepEqual(counts, { ok: 1, repeated: 2, bad: 2 });
    assert.equal(importRowMeta(items[0]), "Fulano · Tom G");
    assert.equal(importRowSize(items[0].row), "2 slides · com cifra");
    assert.equal(importRowMeta(items[1]), "parece repetida · já está na biblioteca");
    assert.equal(importRowMeta(items[2]), "parece repetida · já está nesta importação");
    assert.equal(importRowMeta(items[3]), "do ProPresenter 7, que o KERYX ainda não lê");
    assert.equal(importRowMeta(items[4]), "nenhuma letra encontrada");
    // Pular as repetidas (default), one forced in, or none skipped.
    assert.deepEqual(importedItems(items).map((it) => it.key), ["0:0"]);
    assert.deepEqual(importedItems(items, { forced: new Set(["1:0"]) }).map((it) => it.key), ["0:0", "1:0"]);
    assert.equal(importedItems(items, { skip: false }).length, 3);
    assert.equal(importCounts(counts), "1 pronta · 2 repetidas · 2 não deram");
    assert.equal(importSource(files, "Músicas OpenLP"), "5 arquivos de Músicas OpenLP · OpenLyrics, texto");
    assert.equal(importSource(files.slice(0, 1)), "1 arquivo · OpenLyrics");
});

test("LRC (Rodada P12): timed lines read, the offset applied, tags and empty lines out", async () => {
    const { parseLrc } = await import("./songImport.js");
    assert.deepEqual(parseLrc("[ar:Alguém]\n[offset:+500]\n[00:12.50]Primeira linha\n[00:10.00]\n[00:20.00][01:05.25]Refrão\n[1:02:03]x"), [
        { t: 12, text: "Primeira linha" },
        { t: 19.5, text: "Refrão" },
        { t: 64.75, text: "Refrão" },
        { t: 61.53, text: "x" },
    ].sort((a, b) => a.t - b.t));
    assert.deepEqual(parseLrc(""), []);
});

test("lrcMarks: each slide takes its first line's time, in order, a repeated chorus included", async () => {
    const { lrcMarks, songFromText, withTimings } = await import("./songImport.js");
    const song = songFromText("Primeira linha da estrofe\nsegunda linha\n\nRefrão de exemplo, ó Deus\noutra linha do refrão\n\nPonte só aqui\n\nRefrão de exemplo, ó Deus\noutra linha do refrão");
    const lrc = [
        "[00:12.00]Primeira linha da estrofe", "[00:16.00]Segunda linha",
        "[00:20.00]Refrão de exemplo, oh Deus", "[00:24.00]Outra linha do refrão",
        // The recording sings the chorus twice here; the lyrics have it once.
        "[00:28.00]Refrão de exemplo, oh Deus", "[00:32.00]Outra linha do refrão",
        "[00:40.00]Ponte só aqui!",
        "[00:50.00]Refrão de exemplo ó Deus", "[00:54.00]outra linha do refrão",
    ].join("\n");
    const marks = lrcMarks(song.slides, lrc);
    assert.deepEqual(marks, [12, 20, 40, 50]);
    // A first line spelled otherwise: its second line finds it, a line earlier.
    assert.deepEqual(lrcMarks([{ text: "Uma linha bem diferente\nsegunda linha" }], "[00:03.00]Outra coisa\n[00:05.00]segunda linha"), [3]);
    // Not in the recording: unmarked, and the next one is still found.
    assert.deepEqual(lrcMarks([{ text: "não está lá" }, { text: "Ponte só aqui" }], lrc), [null, 40]);
    assert.deepEqual(lrcMarks(song.slides, ""), [null, null, null, null]);
    // As withTimings keeps them: the song's marks, the last to its length.
    assert.deepEqual(withTimings(song.slides, marks, 60).map((s) => [s.start, s.duration]), [[12, 8], [20, 20], [40, 10], [50, 10]]);
});

test("reflowLyrics: 2/4 linhas rewrite the text as the slides read (back 2026-11-10)", () => {
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
    assert.equal(reflowLyrics("[G] [D]\num\n[C]dois\ntrês", 2), "[G] [D]\num\n[C]dois\n\ntrês", "a chords-only row rides with the row under it");
});

test("a part with no lyrics alone is a slide with no text (2026-11-11, ministração)", () => {
    const lyrics = "[Refrão]\nEu vou viver\nEm minha vida\n\n[Ministração]\n\n[Refrão]\nEu vou viver\n\nOutra estrofe";
    const slides = slidesFromLyrics(lyrics, { chorded: true });
    assert.deepEqual(slides.map((s) => [s.text, s.label]), [["Eu vou viver\nEm minha vida", "Refrão"], ["", "Ministração"], ["Eu vou viver", "Refrão"], ["Outra estrofe", "Refrão"]]);
    assert.equal(slides[1].chorded, "");
    // The stanza after it carries no label of its.
    assert.deepEqual(slidesFromLyrics("[Instrumental]\n\nletra").map((s) => [s.text, s.label]), [["", "Instrumental"], ["letra", ""]]);
    // Any other name alone keeps naming what follows, as before.
    assert.deepEqual(slidesFromLyrics("[Verso]\n\nletra").map((s) => [s.text, s.label]), [["letra", "Verso"]]);
    // A no-lyrics name WITH lines is an ordinary part.
    assert.deepEqual(slidesFromLyrics("[Solo]\numa linha").map((s) => [s.text, s.label]), [["uma linha", "Solo"]]);
    for (const l of ["Ministração", "ministracao", "Instrumental 2", "Solo", "Interlúdio", "Introdução"]) assert.equal(isNoLyrics(l), true, l);
    for (const l of ["Refrão", "Verso", "Final", "Ponte", ""]) assert.equal(isNoLyrics(l), false, l);
    // It is one line for the marks, so it can be marked like any slide.
    assert.deepEqual(sungLines(lyrics).map((l) => l.text), ["Eu vou viver", "Em minha vida", "", "Eu vou viver", "Outra estrofe"]);
    // 2/4 linhas keep it alone.
    assert.deepEqual(slidesFromLyrics(reflowLyrics(lyrics, 1), { lines: 1 }).map((s) => s.text), ["Eu vou viver", "Em minha vida", "", "Eu vou viver", "Outra estrofe"]);
});

test("songSlidesFor: a song never saved with [Parte] lines reads them (no \"[Refrão]\" on screen)", () => {
    const { slides } = songSlidesFor({ lyrics: "[Refrão]\num\ndois\n\n[Ministração]\n\n[Refrão]\ntrês" });
    assert.deepEqual(slides.map((s) => [s.text, s.label]), [["um\ndois", "Refrão"], ["", "Ministração"], ["três", "Refrão"]]);
    assert.deepEqual(songSlidesFor({ lyrics: "um\ndois\n\ntrês" }).slides.map((s) => s.text), ["um\ndois", "três"], "plain lyrics as before");
});

test("insertParts: a Ministração between slides, the other lines where they were (owner 2026-11-14)", () => {
    const song = "[Verso]\na1\na2\n\nb1\nb2\n\n[Refrão]\nc1\nc2";
    // Between two stanzas: a block of its own; the stanza after it names itself again.
    const between = insertParts(song, [{ before: 2, label: "Ministração" }]);
    assert.equal(between, "[Verso]\na1\na2\n\n[Ministração]\n\n[Verso]\nb1\nb2\n\n[Refrão]\nc1\nc2");
    assert.deepEqual(sungLines(between).map((l) => [l.text, l.label]), [["a1", "Verso"], ["a2", "Verso"], ["", "Ministração"], ["b1", "Verso"], ["b2", "Verso"], ["c1", "Refrão"], ["c2", "Refrão"]]);
    // Before a stanza with its own heading: the heading stays on its stanza.
    assert.equal(insertParts(song, [{ before: 4, label: "Ministração" }]), "[Verso]\na1\na2\n\nb1\nb2\n\n[Ministração]\n\n[Refrão]\nc1\nc2");
    // Inside a stanza: it cuts there.
    const inside = insertParts(song, [{ before: 1, label: "Instrumental" }]);
    assert.deepEqual(sungLines(inside).map((l) => l.text), ["a1", "", "a2", "b1", "b2", "c1", "c2"]);
    assert.equal(sungLines(inside)[2].label, "Verso");
    // At the end, and two at once.
    assert.deepEqual(sungLines(insertParts(song, [{ before: 6, label: "Solo" }])).map((l) => l.text), ["a1", "a2", "b1", "b2", "c1", "c2", ""]);
    assert.deepEqual(sungLines(insertParts(song, [{ before: 4, label: "Ministração" }, { before: 6, label: "Interlúdio" }])).map((l) => l.label), ["Verso", "Verso", "Verso", "Verso", "Ministração", "Refrão", "Refrão", "Interlúdio"]);
    // Chords ride with their line; nothing to insert = the same text.
    assert.equal(insertParts("[G]a1\n[D]\nb1", [{ before: 1, label: "Solo" }]), "[G]a1\n\n[Solo]\n\n[D]\nb1");
    assert.equal(insertParts(song, []), song);
});
