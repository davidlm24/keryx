import test from "node:test";
import assert from "node:assert/strict";
import { songRow, mmss, SONG_BADGES } from "./libraryRows.js";

const song = { title: "Grande é o Senhor", artist: "Adhemar de Campos", song_key: "G", duration: 245 };

test("the second line is only the key and the length; the artist only when asked", () => {
    assert.equal(songRow(song).meta, "G · 4:05");
    assert.equal(songRow(song, { showArtist: true }).meta, "Adhemar de Campos · G · 4:05", "the artist starts the line");
    assert.equal(songRow({ title: "Sem nada" }).meta, "", "no key, no length: no second line");
    assert.equal(songRow({ title: "x", artist: "  " }, { showArtist: true }).meta, "", "a blank artist is no artist");
    assert.equal(songRow({ ...song, audio_url: "keryx-media://a.mp3" }).meta, "G · 4:05", "no more vídeo/playback words");
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
