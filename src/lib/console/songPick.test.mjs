import test from "node:test";
import assert from "node:assert/strict";
import { marksWith, songsUsing, songPick, songMediaNote } from "./songPick.js";

const play = { id: "m1", type: "audio", file_url: "http://x/media/play.mp3" };
const songs = [
    { id: "a", title: "Óleo de alegria", artist: "Coral", audio_url: "" },
    { id: "b", title: "Espírito Santo", audio_url: play.file_url },
    { id: "c", title: "Canção de exemplo", audio_url: "http://x/media/outro.mp4" },
];

test("only a video or an audio of the computer marks times", () => {
    assert.equal(marksWith(play), true);
    assert.equal(marksWith({ type: "video", file_url: "keryx-media://v.webm" }), true);
    assert.equal(marksWith({ type: "video", file_url: "https://youtu.be/abc" }), false, "a YouTube link does not play hidden");
    assert.equal(marksWith({ type: "image", file_url: "a.png" }), false);
    assert.equal(marksWith({ type: "video", category: "background", file_url: "b.mp4" }), false);
    assert.equal(marksWith(null), false);
});

test("the songs using the file first, then every other song by title", () => {
    assert.deepEqual(songsUsing(play, songs).map((s) => s.id), ["b"]);
    const all = songPick(play, songs);
    assert.deepEqual(all.using.map((s) => s.id), ["b"]);
    assert.deepEqual(all.others.map((s) => s.id), ["c", "a"], "pt-BR order, the one using it not repeated");
    assert.deepEqual(songPick(play, songs, "oleo").others.map((s) => s.id), ["a"], "no accents, no case");
    assert.deepEqual(songPick(play, songs, "coral").others.map((s) => s.id), ["a"], "the artist counts");
    assert.deepEqual(songPick(play, songs, "zzz"), { using: [], others: [] });
    assert.equal(songMediaNote(songs[2], play), "tem outro vídeo ou playback");
    assert.equal(songMediaNote(songs[1], play), "usa este arquivo");
    assert.equal(songMediaNote(songs[0], play), "");
});
