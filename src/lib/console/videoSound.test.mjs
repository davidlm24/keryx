import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";
import { soundModeFor, songMedia, songSoundWhy, soundModeValue, syncedToMarks, soundStays, undoSoundStays } from "./videoSound.js";

const T = 1_000_000;
const VIDEO = "http://127.0.0.1:7700/media/louvor.mp4";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const run = (state, ops, at) => ops.reduce((s, [op, args]) => applyOp(s, op, args, at), state);
const onAir = (extra = {}) => applyOp(emptyState(T), "media.show", { kind: "video", url: VIDEO, title: "Louvor", ...extra }, T);
const lyrics = { kind: "lyrics", op: "content.show", playback: null, video: null };
const text = { kind: "lyrics", title: "Canto", slides: [{ text: "um" }, { text: "dois" }] };

test("the editor offers the switch for a video file, a hint for YouTube, nothing for a playback", () => {
    assert.equal(soundModeFor(VIDEO), "switch");
    assert.equal(soundModeFor(YT), "youtube");
    assert.equal(soundModeFor("http://127.0.0.1:7700/media/playback.mp3"), null);
    assert.equal(soundModeFor(""), null);
});

test("a song's video goes to the video channel, or as its playback with Só o som do vídeo", () => {
    assert.deepEqual(songMedia({ audio_url: VIDEO }), { video: VIDEO, playback: null });
    assert.deepEqual(songMedia({ audio_url: VIDEO, playback_mode: "" }), { video: VIDEO, playback: null });
    assert.deepEqual(songMedia({ audio_url: VIDEO, playback_mode: "sound" }), { video: null, playback: VIDEO, playbackKind: "video" });
    // A playback stays a playback; the mode means nothing for it.
    assert.deepEqual(songMedia({ audio_url: "x.mp3", playback_mode: "sound" }), { video: null, playback: "x.mp3" });
    assert.deepEqual(songMedia({ audio_url: "" }), { video: null, playback: null });
    assert.deepEqual(songMedia({}), { video: null, playback: null });
});

test("a song that follows its marks plays its video as sound only by itself (2026-11-12)", () => {
    const marked = { audio_url: VIDEO, slides: [{ text: "um", start: 4 }, { text: "dois" }] };
    assert.deepEqual(songMedia(marked), { video: null, playback: VIDEO, playbackKind: "video" });
    assert.equal(songSoundWhy(marked), "marks");
    // Marks by line count too (a song saved before its slides carried them).
    assert.equal(syncedToMarks({ audio_url: VIDEO, slides: [{ text: "um" }], line_starts: [null, 3], follow_mode: "marks" }), true);
    // "video": the clip on the screens anyway.
    assert.deepEqual(songMedia({ ...marked, playback_mode: "video" }), { video: VIDEO, playback: null });
    // The switch chosen wins and says so.
    assert.equal(songSoundWhy({ ...marked, playback_mode: "sound" }), "switch");
    // Avançar sozinha off, or by time: the marks are not followed.
    assert.deepEqual(songMedia({ ...marked, follow_mode: "off" }), { video: VIDEO, playback: null });
    assert.deepEqual(songMedia({ ...marked, follow_mode: "time" }), { video: VIDEO, playback: null });
    // "Pelas marcas" with nothing marked yet: the video still shows.
    assert.equal(songSoundWhy({ audio_url: VIDEO, follow_mode: "marks", slides: [{ text: "um" }] }), null);
    // YouTube never plays hidden, marks or not.
    assert.equal(songSoundWhy({ ...marked, audio_url: YT }), null);
    // A playback is a playback.
    assert.equal(songSoundWhy({ ...marked, audio_url: "x.mp3" }), null);
    // The editor's draft slides decide while editing.
    assert.equal(songSoundWhy({ audio_url: VIDEO, slides: [] }, [{ start: 2 }]), "marks");
});

test("the switch writes \"\" while it says what the song does by itself", () => {
    const marked = { audio_url: VIDEO, slides: [{ text: "um", start: 4 }] };
    const clip = { audio_url: VIDEO, slides: [{ text: "um" }] };
    assert.equal(soundModeValue(marked, true), "");
    assert.equal(soundModeValue(marked, false), "video");
    assert.equal(soundModeValue(clip, true), "sound");
    assert.equal(soundModeValue(clip, false), "");
    assert.equal(soundModeValue({ ...marked, playback_mode: "video" }, true), "");
});

test("the playback of a video plays on the audio channel, off the screens", () => {
    const m = songMedia({ audio_url: VIDEO, playback_mode: "sound" });
    const s = applyOp(emptyState(T), "audio.show", { kind: m.playbackKind, url: m.playback, title: "Canto" }, T);
    assert.equal(s.audio.kind, "video");
    assert.equal(s.media, null);
});

test("a text over a video playing with sound keeps the video's sound", () => {
    assert.equal(soundStays("content.show", lyrics, onAir()), true);
    assert.equal(soundStays("content.show", { kind: "bible" }, onAir()), true);
});

test("an item with sound of its own silences the video as always", () => {
    assert.equal(soundStays("content.show", { ...lyrics, playback: "x.mp3" }, onAir()), false);
    assert.equal(soundStays("content.show", { ...lyrics, video: VIDEO }, onAir()), false);
    assert.equal(soundStays("media.show", { op: "media.show" }, onAir()), false);
    assert.equal(soundStays("tool.show", { op: "tool.show" }, onAir()), false);
});

test("nothing to keep: no video, a picture, a silent, paused or YouTube video", () => {
    assert.equal(soundStays("content.show", lyrics, emptyState(T)), false);
    assert.equal(soundStays("content.show", lyrics, null), false);
    assert.equal(soundStays("content.show", lyrics, applyOp(emptyState(T), "media.show", { kind: "image", url: "a.jpg" }, T)), false);
    assert.equal(soundStays("content.show", lyrics, onAir({ volume: 0 })), false);
    assert.equal(soundStays("content.show", lyrics, applyOp(onAir(), "transport", { layer: "media", action: "pause" }, T + 1)), false);
    assert.equal(soundStays("content.show", lyrics, applyOp(emptyState(T), "media.show", { kind: "youtube", url: YT }, T)), false);
});

test("the video channel is never touched: a text on the projector does not hide it", () => {
    const s = applyOp(emptyState(T), "video.show", { kind: "video", url: VIDEO }, T);
    assert.equal(soundStays("content.show", lyrics, s), false);
    assert.equal(applyOp(s, "content.show", text, T + 1).video.url, VIDEO);
});

test("the gesture: the video becomes sound at the same second, the text goes on air", () => {
    const sent = run(onAir(), [["media.toAudio", {}], ["content.show", text]], T + 5000);
    assert.equal(sent.media, null);
    assert.equal(sent.audio.kind, "video");
    assert.equal(sent.audio.url, VIDEO);
    assert.equal(sent.content.title, "Canto");
});

test("Desfazer puts the video back on the screens and takes the text off", () => {
    const sent = run(onAir(), [["media.toAudio", {}], ["content.show", text]], T + 5000);
    const ops = undoSoundStays(sent, { url: VIDEO, startedAt: sent.content.startedAt });
    assert.deepEqual(ops, [["audio.toMedia", {}], ["content.clear", {}]]);
    const back = run(sent, ops, T + 8000);
    assert.equal(back.media.url, VIDEO);
    assert.equal(back.audio, null);
    assert.equal(back.content, null);
});

test("Desfazer leaves alone what changed since: another sound, another text", () => {
    const sent = run(onAir(), [["media.toAudio", {}], ["content.show", text]], T + 5000);
    const was = { url: VIDEO, startedAt: sent.content.startedAt };
    const other = applyOp(sent, "content.show", { ...text, title: "Outro" }, T + 6000);
    assert.deepEqual(undoSoundStays(other, was), [["audio.toMedia", {}]]);
    const stopped = applyOp(sent, "audio.clear", {}, T + 6000);
    assert.deepEqual(undoSoundStays(stopped, was), [["content.clear", {}]]);
    assert.deepEqual(undoSoundStays(null, was), []);
});
