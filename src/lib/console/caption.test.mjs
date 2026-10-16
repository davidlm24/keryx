import { test } from "node:test";
import assert from "node:assert/strict";
import { airSince, airFor, airInPlayer, titleParts, airAnnouncement } from "./caption.js";

const song = { content: { title: "Hino", slides: [{ text: "a" }], index: 0, startedAt: 10_000 } };

test("how long the item has been on air", () => {
    assert.equal(airFor(song, 10_000 + 222_000), "3:42");
    assert.equal(airFor(song, 10_000), "0:00");
    assert.equal(airFor(song, 10_000 + 3_725_000), "1:02:05", "past the hour: h:mm:ss");
    assert.equal(airFor(song, 5_000), "0:00", "never negative");
});

test("a new item restarts the count; moving slides does not", () => {
    // content.startedAt is set when the item goes on air, not on slide changes.
    assert.equal(airSince({ content: { ...song.content, index: 3 } }), 10_000);
    assert.equal(airSince({ content: { ...song.content, startedAt: 99_000 } }), 99_000);
});

test("other layers count from when they went on air; nothing to count says nothing", () => {
    assert.equal(airSince({ media: { title: "Clipe", shownAt: 7_000 } }), 7_000);
    assert.equal(airSince({ communication: { item: { title: "Aviso" }, startedAt: 8_000 } }), 8_000);
    assert.equal(airSince({ video: { title: "V", shownAt: 4_000 }, content: song.content }), 4_000, "the video channel covers it");
    for (const doc of [null, {}, { screen: "black", content: song.content.content }, { screen: "logo" }, { tool: { mode: "timer", startedAt: 1 } }]) {
        assert.equal(airSince(doc), null);
        assert.equal(airFor(doc, 50_000), "");
    }
});

test("the pill's title only when the player does not name what is on air (Rodada F1, pick A)", () => {
    const pb = { paused: false, position: 0, at: 0 };
    const clip = { kind: "video", url: "v", title: "Abertura", playback: pb, shownAt: 1 };
    const music = { kind: "audio", url: "a", title: "Hino 42", playback: pb, shownAt: 2 };
    // In the player: the title is there already.
    assert.equal(airInPlayer({ video: clip }), true, "a video-channel clip");
    assert.equal(airInPlayer({ video: clip, content: song.content }), true, "the clip covers the lyrics");
    assert.equal(airInPlayer({ media: clip }), true, "a video on the projector");
    assert.equal(airInPlayer({ media: { ...clip, kind: "youtube" } }), true, "a YouTube link");
    assert.equal(airInPlayer({ media: music }), true, "an audio file on the projector");
    assert.equal(airInPlayer({ audio: music }), true, "music with nothing on the screens");
    assert.equal(airInPlayer({ audio: { ...clip, kind: "video" } }), true, "a video playing as sound only");
    // Not in the player: the pill says what it is.
    assert.equal(airInPlayer({ content: song.content }), false, "lyrics, a passage, text");
    assert.equal(airInPlayer({ content: song.content, audio: music }), false, "lyrics over their playback");
    assert.equal(airInPlayer({ media: { kind: "image", url: "i", title: "Batismo" } }), false, "a picture");
    assert.equal(airInPlayer({ media: { kind: "presentation", url: "p", title: "Missões" } }), false, "a presentation");
    assert.equal(airInPlayer({ tool: { mode: "timer" }, audio: music }), false, "a timer over music");
    assert.equal(airInPlayer({ communication: { item: { title: "Aviso" } } }), false, "an aviso");
    assert.equal(airInPlayer({ screen: "black", video: clip }), false, "Tela preta");
    assert.equal(airInPlayer({ screen: "logo", audio: music }), false, "Logo");
    assert.equal(airInPlayer({}), false, "nothing: \"Nada no ar\"");
    assert.equal(airInPlayer(null), false);
});

test("titleParts: the end of a long title stays whole (C-17)", () => {
    assert.deepEqual(titleParts("Canção de exemplo · Manhã"), { head: "Canção de exemplo ·", tail: "Manhã" });
    assert.deepEqual(titleParts("Grande é o Senhor - ao vivo"), { head: "Grande é o Senhor -", tail: "ao vivo" });
    assert.deepEqual(titleParts("Porque Ele vive para sempre"), { head: "Porque Ele vive para", tail: "sempre" });
    assert.deepEqual(titleParts("Hino curto"), { head: "Hino curto", tail: "" });
    assert.deepEqual(titleParts("Umapalavrasóquenãotemespaço"), { head: "Umapalavrasóquenãotemespaço", tail: "" });
    assert.deepEqual(titleParts("Salmo 23 · Versão contemporânea longa"), { head: "Salmo 23 · Versão contemporânea longa", tail: "" });
    assert.deepEqual(titleParts(""), { head: "", tail: "" });
    assert.deepEqual(titleParts(null), { head: "", tail: "" });
});

test("what a screen reader hears when the air changes (C-25)", () => {
    const hino = { content: { title: "Hino", slides: [{ text: "a" }, { text: "b" }, { text: "c" }], index: 0, startedAt: 1 } };
    assert.equal(airAnnouncement(hino), "No ar: Hino · 1/3");
    assert.equal(airAnnouncement({ content: { ...hino.content, index: 2 } }), "No ar: Hino · 3/3", "each slide is a change");
    assert.equal(airAnnouncement({ content: { ...hino.content, startedAt: 99 } }), "No ar: Hino · 1/3", "time is never in the words");
    assert.equal(airAnnouncement({ screen: "black", content: hino.content }), "No ar: Tela preta");
    assert.equal(airAnnouncement(null), "Nada no ar");
    assert.equal(airAnnouncement({}), "Nada no ar");
});
