import test from "node:test";
import assert from "node:assert/strict";
import { songRow, mmss, SONG_BADGES, mediaIcon, copyingRows, COPYING_SAY, QUEUED_SAY } from "./libraryRows.js";

test("one glyph per kind of media, everywhere it is listed", () => {
    assert.equal(mediaIcon({ type: "video", file_url: "keryx-media://a.mp4" }), "film");
    assert.equal(mediaIcon({ type: "video", file_url: "https://www.youtube.com/watch?v=x" }), "youtube");
    assert.equal(mediaIcon({ type: "video", file_url: "https://youtu.be/x" }), "youtube");
    assert.equal(mediaIcon({ type: "audio" }), "volume", "the speaker, as in the Setlist; the note is a song");
    assert.equal(mediaIcon({ type: "pdf" }), "presentation");
    assert.equal(mediaIcon({ type: "powerpoint" }), "presentation");
    assert.equal(mediaIcon({ type: "gif" }), "image");
    assert.equal(mediaIcon({ type: "zz" }), "film");
});

const song = { title: "Grande é o Senhor", artist: "Adhemar de Campos", song_key: "G", duration: 245 };

test("the second line is only the key and the length; the artist only when asked", () => {
    assert.equal(songRow(song).meta, "G · 4:05");
    assert.equal(songRow(song, { showArtist: true }).meta, "Adhemar de Campos · G · 4:05", "the artist starts the line");
    assert.equal(songRow({ title: "Sem nada" }).meta, "", "no key, no length: no second line");
    assert.equal(songRow({ title: "x", artist: "  " }, { showArtist: true }).meta, "", "a blank artist is no artist");
    assert.equal(songRow({ ...song, audio_url: "keryx-media://a.mp3" }).meta, "G · 4:05", "no more vídeo/playback words");
    assert.equal(songRow(song, { showKey: false }).meta, "4:05");
    assert.equal(songRow(song, { showLength: false }).meta, "G");
    assert.equal(songRow(song, { showKey: false, showLength: false }).meta, "", "all off: no second line");
    assert.equal(songRow(song, { showArtist: true, showKey: false, showLength: false }).meta, "Adhemar de Campos");
});

test("the artist is always in the tooltip", () => {
    assert.equal(songRow(song).tip, "Grande é o Senhor · Adhemar de Campos");
    assert.equal(songRow({ title: "Só título" }).tip, "Só título");
});

test("the flags are badges, in a fixed order, never words in the line", () => {
    const synced = { ...song, slides: [{ text: "a", start: 0 }, { text: "b" }] };
    assert.deepEqual(songRow(song).badges, []);
    assert.deepEqual(songRow(synced).badges.map((b) => b.id), ["synced"]);
    assert.deepEqual(songRow(synced, { duplicate: true, syncing: true }).badges.map((b) => b.id), ["syncing", "synced", "duplicate"]);
    assert.equal(songRow(synced, { duplicate: true }).meta, "G · 4:05");
    assert.ok(SONG_BADGES.duplicate.warn);
    for (const b of Object.values(SONG_BADGES)) assert.ok(b.icon && b.label, `${b.id} has an icon and its words`);
    assert.deepEqual(songRow({ ...song, slides: [{ start: null }] }).badges, [], "a slide without a time is not synced");
});

test("mmss", () => {
    assert.equal(mmss(0), "0:00");
    assert.equal(mmss(61.4), "1:01");
    assert.equal(mmss(-3), "0:00");
});

test("a file being copied is a row of its own until its Media row arrives", () => {
    const copying = [
        { key: "1:0", name: "Culto.pdf", title: "Culto", type: "pdf", category: "other", waiting: false, rowId: null },
        { key: "1:1", name: "Fundo.mp4", title: "Fundo", type: "video", category: "other", waiting: true, rowId: null },
        { key: "2:0", name: "Céu.jpg", title: "Céu", type: "image", category: "background", waiting: false, rowId: null },
    ];
    assert.deepEqual(copyingRows(copying, []).map((r) => [r.title, r.meta]), [["Culto", COPYING_SAY], ["Fundo", QUEUED_SAY]], "a background never shows in these lists");
    assert.deepEqual(copyingRows(copying, [], { kinds: ["pdf", "powerpoint"] }).map((r) => r.key), ["1:0"], "a list shows only its kinds");
    assert.deepEqual(copyingRows(copying, [], { q: "fun" }).map((r) => r.key), ["1:1"], "and follows the search");
    const done = [{ ...copying[0], rowId: "m1" }, copying[1]];
    assert.deepEqual(copyingRows(done, [{ id: "m9" }]).map((r) => r.key), ["1:0", "1:1"], "copied, its row not listed yet: still there");
    assert.deepEqual(copyingRows(done, [{ id: "m1" }]).map((r) => r.key), ["1:1"], "the real row takes its place");
    assert.deepEqual(copyingRows(), []);
});
