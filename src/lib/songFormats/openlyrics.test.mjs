import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOpenLyrics, isOpenLyrics, chordName } from "./openlyrics.js";
import { parseXml, textOf } from "./xml.js";
import { songsFromFile, songSlidesFor } from "../songImport.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const text = (name) => fixture(name).toString("utf8");

test("xml: entities, CDATA, comments, namespaces, quoted >", () => {
    const root = parseXml("<?xml version='1.0'?><!-- c --><ol:a xmlns:ol='x' t=\"1 > 0\"><b>&amp;&#233;&#x41;</b><![CDATA[<raw>]]></ol:a>");
    assert.equal(root.name, "a");
    assert.equal(root.attrs.t, "1 > 0");
    assert.equal(textOf(root), "&éA<raw>");
    assert.throws(() => parseXml("<a><b></a>"), /XML inválido/);
    assert.throws(() => parseXml("<a>"), /XML inválido/);
});

test("the simplest sample: one verse, <br/> splits the lines", () => {
    assert.equal(isOpenLyrics(text("simple.xml")), true);
    const [s] = parseOpenLyrics(text("simple.xml"));
    assert.equal(s.title, "Amazing Grace");
    assert.equal(s.lyrics, "[Estrofe]\nAmazing grace how sweet the sound\nthat saved a wretch like me;");
    assert.equal(s.artist, "");
});

test("complex sample: metadata, the song's language, verseOrder, comments out", () => {
    const [s] = parseOpenLyrics(text("complex.xml"));
    assert.equal(s.title, "Amazing Grace", "the original title");
    assert.equal(s.artist, "John Newton, Chris Rice, Richard Wagner", "translators left out");
    assert.equal(s.copyright, "public domain");
    assert.equal(s.ccli_number, "4639462");
    assert.equal(s.song_key, "C#");
    assert.equal(s.bpm, 90);
    // verseOrder "v1 v2 v3 c v4 c1 c2 b b1 b2": v3, v4, c2, b… do not exist;
    // "c1" finds "c", so the chorus is sung twice.
    const labels = s.lyrics.split("\n").filter((l) => /^\[[^\]]+\]$/.test(l));
    assert.deepEqual(labels, ["[Estrofe 1]", "[Estrofe 2]", "[Refrão]", "[Refrão]"]);
    assert.ok(s.lyrics.startsWith("[Estrofe 1]\nAmazing grace how sweet the sound that saved a wretch like me;\n\nA b c\nD e f"), "v1 in English, its two <lines> as two stanzas");
    assert.ok(!/Erstaunliche/.test(s.lyrics), "the German v1 is left out");
    assert.ok(!/any (comment|text)/.test(s.lyrics), "comments never reach the lyrics");
    assert.ok(/\[D\]Amazing grace how sweet \[D\]the sound/.test(s.lyrics), "chords inline");
});

test("0.9 chords by root and structure become the cifra; the slides keep a chorded twin", () => {
    const [s] = parseOpenLyrics(text("Amazing Grace.xml"));
    assert.equal(s.copyright, "1982 Jubilate Hymns Limited");
    assert.equal(s.ccli_number, "1037882");
    assert.ok(s.lyrics.startsWith("[Estrofe 1]\nA[D]mazing [D7]grace how [G]sweet the [D]sound that [Bm]saved a [E]wretch like [A]me;"));
    const [row] = songsFromFile("Amazing Grace.xml", fixture("Amazing Grace.xml"));
    assert.equal(row.slides.length, 4);
    assert.deepEqual(row.slides.map((x) => x.label), ["Estrofe 1", "Estrofe 2", "Estrofe 3", "Estrofe 4"]);
    assert.equal(row.slides[0].text.split("\n")[0], "Amazing grace how sweet the sound that saved a wretch like me;", "the projector never sees a chord");
    assert.ok(row.slides[0].chorded.startsWith("A[D]mazing [D7]grace"));
    const { slides, chordedSlides } = songSlidesFor(row);
    assert.equal(slides[0].text, row.slides[0].text);
    assert.ok(chordedSlides[0].includes("[Bm]saved"));
});

test("an instrumental part is not lyrics; verseOrder i v1 plays v1 only", () => {
    const [s] = parseOpenLyrics(text("version0.9.xml"));
    assert.equal(s.title, "A kapudat nyisd meg");
    assert.ok(s.lyrics.startsWith("[Estrofe]\nA kapudat nyisd meg"));
    assert.equal(s.lyrics.split("\n\n").length, 2, "two <lines>, two stanzas");
});

test("0.8 chord names: H is B, a line of only chords leaves the projector", () => {
    const [s] = parseOpenLyrics(text("test0.8-convert.xml"));
    assert.equal(s.song_key, "Esm");
    assert.equal(s.artist, "", "only a translator");
    assert.ok(s.lyrics.includes("óha[Bm]junk!"), "Hm -> Bm");
    assert.ok(s.lyrics.includes("[Estrofe 5]\n[C] [C4] [C5]"), "the chord chart stays for the Palco");
    const row = songsFromFile("t.xml", text("test0.8-convert.xml"))[0];
    for (const slide of row.slides) assert.ok(!/\[[^\]]*\]/.test(slide.text), `no bracket left on air: ${slide.text}`);
});

test("chordName: the formula or shortcode, bass, German B, and refusals", () => {
    assert.equal(chordName({ root: "A", structure: "min7", bass: "G" }), "Am7/G");
    assert.equal(chordName({ root: "C", structure: "3-5-7" }), "C7M");
    assert.equal(chordName({ root: "F♯", structure: "m3-5" }), "F#m");
    assert.equal(chordName({ name: "B" }, true), "Bb");
    assert.equal(chordName({ name: "H7" }), "B7");
    assert.equal(chordName({ name: "Xyz" }), "");
    assert.equal(chordName({}), "");
});

test("verseOrder repeats a chorus; labels number only when a kind repeats", () => {
    const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9"><properties>
        <titles><title>Castelo</title></titles><verseOrder>v1 c v2 c b</verseOrder></properties><lyrics>
        <verse name="v1"><lines>um<br/>dois</lines></verse>
        <verse name="v2"><lines>três</lines></verse>
        <verse name="c1"><lines>coro</lines></verse>
        <verse name="b1"><lines>ponte</lines></verse>
        </lyrics></song>`;
    const [s] = parseOpenLyrics(xml);
    assert.equal(s.lyrics, "[Estrofe 1]\num\ndois\n\n[Refrão]\ncoro\n\n[Estrofe 2]\ntrês\n\n[Refrão]\ncoro\n\n[Ponte]\nponte");
    const [row] = songsFromFile("castelo.xml", xml, { lines: 1 });
    assert.equal(row.lines_per_slide, 1);
    assert.deepEqual(row.slides.map((x) => x.text), ["um", "dois", "coro", "três", "coro", "ponte"]);
    assert.equal(row.slides[2].is_chorus, true);
    assert.equal("chorded" in row.slides[0], false, "no chords, no twin");
});
