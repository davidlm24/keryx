import test from "node:test";
import assert from "node:assert/strict";
import {
    applyOp, emptyState, restoreState, mainLayer, livePosition, currentSlide, nextSlide, toolTime, playbackPlan, LiveError, OP_NAMES,
} from "./live-state.mjs";

const T0 = 1_000_000;
const run = (ops, state = emptyState(T0)) => ops.reduce((s, [op, args, now = T0]) => applyOp(s, op, args, now), state);
const song = { title: "Grande é o Senhor", artist: "Adhemar", slides: [{ text: "um" }, { text: "dois", is_chorus: true }, "três"] };

test("showing lyrics: slides normalised, index clamped, rev and updatedAt move", () => {
    const s = run([["content.show", { ...song, index: 9, style: { font_size: "large", nope: "x" }, stage: { song_key: "G", chords: "G D" } }, T0 + 5]]);
    assert.equal(s.rev, 1);
    assert.equal(s.updatedAt, T0 + 5);
    assert.deepEqual(s.content.slides, [{ text: "um" }, { text: "dois", is_chorus: true }, { text: "três" }]);
    assert.equal(s.content.index, 2, "index past the end lands on the last slide");
    assert.deepEqual(s.content.style, { font_size: "large" }, "unknown style keys are dropped");
    assert.equal(s.content.stage.song_key, "G");
    assert.equal(s.content.kind, "lyrics");
    assert.equal(s.content.audio, null);
    assert.equal(run([["content.show", { slides: ["x"], audio: "keryx-media://faixa.mp3" }]]).content.audio, "keryx-media://faixa.mp3");
    assert.equal(currentSlide(s.content).text, "três");
    assert.equal(nextSlide(s.content), null);
});

test("slide navigation: goTo, next, prev; no change means the same object (no broadcast)", () => {
    let s = run([["content.show", song]]);
    s = applyOp(s, "content.next", {}, T0);
    assert.equal(s.content.index, 1);
    assert.equal(nextSlide(s.content).text, "três");
    s = applyOp(s, "content.goTo", { index: 2 }, T0);
    const same = applyOp(s, "content.next", {}, T0);
    assert.equal(same, s, "next on the last slide changes nothing");
    s = applyOp(s, "content.prev", {}, T0);
    assert.equal(s.content.index, 1);
    assert.equal(s.rev, 4);
    assert.throws(() => applyOp(emptyState(), "content.next"), (e) => e instanceof LiveError && e.status === 409);
});

test("live edit keeps the position where it can", () => {
    let s = run([["content.show", { ...song, index: 2 }]]);
    s = applyOp(s, "content.update", { slides: ["só um", "dois"] }, T0);
    assert.equal(s.content.index, 1);
    assert.equal(s.content.title, song.title, "fields not sent stay");
});

test("layer priority on the main projector, and new content takes down what hid it", () => {
    let s = run([["content.show", song]]);
    assert.equal(mainLayer(s), "content");
    s = applyOp(s, "media.show", { kind: "image", url: "keryx-media://a.png" }, T0);
    assert.equal(mainLayer(s), "media");
    assert.ok(s.content, "media covers the lyrics, it does not remove them");
    s = applyOp(s, "tool.show", { mode: "clock" }, T0);
    assert.equal(mainLayer(s), "tool");
    s = applyOp(s, "screen.set", { mode: "black" }, T0);
    assert.equal(mainLayer(s), "black");
    // The old bug: after black or a clock, a new song showed nothing.
    s = applyOp(s, "content.show", { title: "Outra", slides: ["x"] }, T0);
    assert.equal(mainLayer(s), "content");
    assert.equal(s.tool, null);
    assert.equal(s.media, null);
    assert.equal(s.screen, "show");
    s = applyOp(s, "clear", {}, T0);
    assert.equal(mainLayer(s), "none");
    assert.equal(mainLayer(null), "none");
});

test("background, overlays and alert are independent of the content", () => {
    let s = run([
        ["background.set", { kind: "video", value: "keryx-media://loop.mp4" }],
        ["content.show", song],
        ["overlays.set", { overlays: [{ id: "1", type: "logo", content: "x" }, "junk"] }],
        ["alert.show", { message: "Carro com farol aceso", type: "message" }, T0 + 1],
    ]);
    assert.equal(s.background.kind, "video");
    assert.equal(s.overlays.length, 1);
    assert.deepEqual(s.alert, { message: "Carro com farol aceso", type: "message", since: T0 + 1 });
    s = applyOp(s, "clear", {}, T0);
    assert.ok(s.background && s.overlays.length === 1 && s.alert, "Parar leaves background, overlays and alert");
    s = applyOp(s, "alert.clear", {}, T0);
    assert.equal(s.alert, null);
    assert.equal(applyOp(s, "alert.clear", {}, T0), s);
});

test("video transport: one shared position every screen can compute", () => {
    let s = run([["video.show", { kind: "video", url: "keryx-media://v.mp4", title: "Abertura" }, T0]]);
    assert.equal(livePosition(s.video.playback, T0 + 2500), 2.5);
    s = applyOp(s, "transport", { action: "pause" }, T0 + 4000);
    assert.equal(s.video.playback.paused, true);
    assert.equal(livePosition(s.video.playback, T0 + 9000), 4, "paused stays put");
    assert.equal(applyOp(s, "transport", { action: "pause" }, T0 + 5000), s, "pausing twice is no change");
    s = applyOp(s, "transport", { action: "play" }, T0 + 10000);
    assert.equal(livePosition(s.video.playback, T0 + 11000), 5);
    s = applyOp(s, "transport", { action: "seek", time: 60 }, T0 + 12000);
    assert.equal(livePosition(s.video.playback, T0 + 13000), 61);
    s = applyOp(s, "transport", { action: "volume", volume: 3 }, T0);
    assert.equal(s.video.playback.volume, 1);
    assert.throws(() => applyOp(s, "transport", { action: "explode" }, T0), LiveError);
    assert.throws(() => applyOp(emptyState(), "transport", { action: "play", layer: "media" }, T0), (e) => e.status === 409);
});

test("fullscreen request and shownAt: a new item is told apart from a pause", () => {
    let s = run([["video.show", { kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }, T0]]);
    assert.equal(s.video.shownAt, T0);
    s = applyOp(s, "transport", { action: "pause" }, T0 + 10);
    assert.equal(s.video.shownAt, T0, "pausing is the same item");
    s = applyOp(s, "transport", { action: "fullscreen" }, T0 + 20);
    assert.equal(s.video.fullscreenAt, T0 + 20);
    s = applyOp(s, "video.show", { kind: "video", url: "keryx-media://b.mp4" }, T0 + 30);
    assert.equal(s.video.shownAt, T0 + 30);
    assert.equal(s.video.fullscreenAt, undefined);
});

test("playbackPlan: how a video element follows the shared position", () => {
    const pb = { paused: false, position: 10, at: T0, volume: 0.5 };
    const el = (o) => ({ currentTime: 0, paused: true, ended: false, duration: 120, ...o });
    assert.deepEqual(playbackPlan(el({ currentTime: 0 }), pb, T0 + 2000), { volume: 0.5, seek: 12, play: true }, "late joiner seeks and plays");
    assert.deepEqual(playbackPlan(el({ currentTime: 12.4, paused: false }), pb, T0 + 2000), { volume: 0.5 }, "small drift is left alone");
    assert.deepEqual(playbackPlan(el({ currentTime: 12, paused: false }), { ...pb, paused: true }, T0), { volume: 0.5, seek: 10, pause: true });
    assert.deepEqual(playbackPlan(el({ currentTime: 30, paused: false }), pb, T0 + 200000), { volume: 0.5, seek: 120 }, "past the end: rest at the end, no replay");
    assert.deepEqual(playbackPlan(el({ currentTime: 120, ended: true }), pb, T0 + 200000), { volume: 0.5 });
    assert.equal(playbackPlan(el({ currentTime: 0 }), pb, T0 + 200000, { loop: true }).seek, 210 % 120, "a loop wraps");
    assert.deepEqual(playbackPlan({ currentTime: 0, paused: true, ended: false, duration: NaN }, pb, T0), { volume: 0.5, seek: 10, play: true }, "unknown duration");
});

test("playlists advance once even when several outputs report the same end", () => {
    let s = run([["media.playlist", { items: [{ kind: "image", url: "a" }, { kind: "video", url: "b" }], index: 0 }]]);
    s = applyOp(s, "media.advance", { fromIndex: 0 }, T0 + 5000);
    assert.equal(s.media.url, "b");
    assert.equal(s.media.playlistIndex, 1);
    assert.equal(s.media.playback.at, T0 + 5000);
    assert.equal(applyOp(s, "media.advance", { fromIndex: 0 }, T0), s, "a late duplicate report is ignored");
    s = applyOp(s, "media.advance", { fromIndex: 1 }, T0);
    assert.equal(s.media.url, "a", "wraps around");
    assert.throws(() => applyOp(s, "media.playlist", { items: [] }, T0), LiveError);
});

test("timers run on the document's clock", () => {
    const s = run([["tool.show", { mode: "timer", durationMs: 60000 }, T0]]);
    assert.equal(s.tool.endsAt, T0 + 60000);
    assert.equal(toolTime(s.tool, T0 + 15000), 45000);
    assert.equal(toolTime(s.tool, T0 + 90000), 0);
    const w = run([["tool.show", { mode: "stopwatch" }, T0]]);
    assert.equal(toolTime(w.tool, T0 + 3000), 3000);
    assert.throws(() => run([["tool.show", { mode: "timer" }]]), LiveError);
});

test("communication playlist and Escola bíblica", () => {
    let s = run([["communication.show", { playlist: [{ type: "countdown", duration: 300 }, { type: "announcement", text: "Bem-vindos" }] }]]);
    assert.equal(mainLayer(s), "communication");
    s = applyOp(s, "communication.advance", { fromIndex: 0 }, T0 + 1);
    assert.equal(s.communication.item.text, "Bem-vindos");
    assert.equal(s.communication.startedAt, T0 + 1);

    s = applyOp(s, "school.show", { content_type: "quiz", title: "Lição 3", quiz_questions: [{ question: "a" }, { question: "b" }] }, T0);
    s = applyOp(s, "school.update", { quiz_reveal: true }, T0);
    assert.equal(s.school.quiz_reveal, true);
    s = applyOp(s, "school.update", { quiz_index: 1 }, T0);
    assert.equal(s.school.quiz_index, 1);
    assert.equal(s.school.quiz_reveal, false, "a new question starts hidden");
    assert.equal(mainLayer(s), "communication", "the school layer is not on the main projector");
});

test("sessions", () => {
    let s = run([["session.start", { serviceId: "svc1" }, T0]]);
    assert.match(s.session.id, /^[0-9a-f-]{36}$/);
    assert.equal(s.session.serviceId, "svc1");
    s = applyOp(s, "session.end", {}, T0);
    assert.equal(s.session, null);
    assert.equal(applyOp(s, "session.end", {}, T0), s);
});

test("bad input is refused with a pt-BR message, not stored", () => {
    const s = emptyState();
    assert.throws(() => applyOp(s, "content.delete"), /Operação desconhecida/);
    assert.throws(() => applyOp(s, "content.show", "x"), /Argumentos inválidos/);
    assert.throws(() => applyOp(s, "content.show", { slides: "x" }), /precisa ser uma lista/);
    assert.throws(() => applyOp(s, "content.show", { slides: [{ text: { a: 1 } }] }), /inválido/);
    assert.throws(() => applyOp(s, "content.show", { slides: ["x".repeat(30000)] }), (e) => e.status === 413);
    assert.throws(() => applyOp(s, "content.show", { kind: "sermão", slides: [] }), /Tipo de conteúdo inválido/);
    assert.throws(() => applyOp(s, "media.show", { kind: "video" }), /Falta Endereço/);
    assert.throws(() => applyOp(s, "screen.set", { mode: "off" }), LiveError);
    assert.throws(() => applyOp(s, "alert.show", {}), /Falta Mensagem/);
    assert.equal(s.rev, 0);
    assert.ok(OP_NAMES.includes("content.show") && OP_NAMES.includes("clear"));
});

test("restore after a restart: same content, screen black, playback paused, rev kept", () => {
    let s = run([
        ["content.show", { ...song, index: 1 }],
        ["video.show", { kind: "video", url: "v" }, T0],
        ["transport", { action: "seek", time: 30 }, T0 + 1000],
    ]);
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0 + 99999);
    assert.equal(back.screen, "black");
    assert.equal(back.rev, s.rev);
    assert.equal(back.content.index, 1);
    assert.equal(back.video.playback.paused, true);
    assert.equal(livePosition(back.video.playback, T0 + 200000), 30);
    assert.equal(mainLayer(applyOp(back, "screen.set", { mode: "show" }, T0)), "content", "one click resumes");
    assert.deepEqual(restoreState({ version: 99, rev: 3 }, T0), emptyState(T0));
    assert.deepEqual(restoreState("garbage", T0), emptyState(T0));
    assert.deepEqual(restoreState({ version: 1, rev: 2, content: "x", overlays: "y" }, T0).content, null);
});
