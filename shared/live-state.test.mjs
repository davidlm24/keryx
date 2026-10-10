import test from "node:test";
import assert from "node:assert/strict";
import {
    applyOp, emptyState, restoreState, mainLayer, livePosition, currentSlide, nextSlide, toolTime, playbackPlan, LiveError, OP_NAMES, WHILE_LOCKED,
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

test("communication playlist", () => {
    let s = run([["communication.show", { playlist: [{ type: "countdown", duration: 300 }, { type: "announcement", text: "Bem-vindos" }] }]]);
    assert.equal(mainLayer(s), "communication");
    s = applyOp(s, "communication.advance", { fromIndex: 0 }, T0 + 1);
    assert.equal(s.communication.item.text, "Bem-vindos");
    assert.equal(s.communication.startedAt, T0 + 1);

});

test("sessions and the position in the rundown", () => {
    let s = run([["session.start", { serviceId: "svc1" }, T0]]);
    assert.match(s.session.id, /^[0-9a-f-]{36}$/);
    assert.equal(s.session.serviceId, "svc1");
    s = applyOp(s, "session.item", { itemId: "it3", index: 2 }, T0 + 1);
    assert.equal(s.session.serviceId, "svc1", "the session is kept");
    assert.equal(s.session.itemId, "it3");
    assert.equal(s.session.itemIndex, 2);
    assert.equal(s.session.itemAt, T0 + 1);
    s = applyOp(s, "session.end", {}, T0);
    assert.equal(s.session, null);
    assert.equal(applyOp(s, "session.end", {}, T0), s);
    const bare = applyOp(emptyState(T0), "session.item", { itemId: "it1" }, T0);
    assert.ok(bare.session && bare.session.itemId === "it1" && bare.session.itemIndex === null, "a position starts a session when none runs");
});

test("history: what the projector showed before each change, newest first, for 'Voltar ao anterior'", () => {
    let s = run([["content.show", { ...song, index: 1 }, T0]]);
    assert.deepEqual(s.history, [], "nothing was replaced yet");
    s = applyOp(s, "content.next", {}, T0 + 1);
    assert.deepEqual(s.history, [], "moving a slide is not a change of what is on air");
    s = applyOp(s, "media.show", { kind: "image", url: "a", title: "Foto" }, T0 + 2);
    assert.equal(s.history.length, 1);
    assert.equal(s.history[0].layer, "content");
    assert.equal(s.history[0].title, song.title);
    assert.equal(s.history[0].data.index, 2, "the slide it was on comes back with it");
    assert.equal(s.history[0].at, T0 + 2);
    s = applyOp(s, "content.clear", {}, T0 + 3);
    assert.equal(s.history.length, 1, "clearing a layer the media was covering records nothing");
    s = applyOp(s, "media.clear", {}, T0 + 4);
    assert.equal(s.history[0].layer, "media");
    assert.equal(s.history[0].title, "Foto");
    assert.equal(s.history[1].layer, "content");
    s = applyOp(s, "tool.show", { mode: "clock" }, T0 + 5);
    assert.equal(s.history.length, 2, "nothing was on air to remember");
    s = applyOp(s, "clear", {}, T0 + 6);
    assert.equal(s.history[0].layer, "tool");
    for (let i = 0; i < 12; i++) s = applyOp(s, "content.show", { title: `m${i}`, slides: ["x"] }, T0 + 10 + i);
    assert.equal(s.history.length, 8, "capped");
    assert.equal(s.history[0].title, "m10");
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0);
    assert.equal(back.history.length, 8, "history survives a restart");
});

test("the corner logo is a layer of its own", () => {
    const s0 = emptyState(T0);
    assert.deepEqual(s0.logo, { visible: false, corner: "bottom-right", size: "medium" });
    let s = applyOp(s0, "logo.set", { visible: true, corner: "top-left" }, T0);
    assert.deepEqual(s.logo, { visible: true, corner: "top-left", size: "medium" });
    assert.equal(applyOp(s, "logo.set", { visible: true }, T0), s, "no change, no broadcast");
    assert.throws(() => applyOp(s, "logo.set", { corner: "middle" }, T0), LiveError);
    s = applyOp(s, "clear", {}, T0);
    assert.equal(s.logo.visible, true, "Encerrar leaves the logo layer");
    assert.equal(restoreState(JSON.parse(JSON.stringify(s)), T0).logo.corner, "top-left");
    const styled = run([["content.show", { slides: ["x"], style: { text_align: "left", text_position: "bottom", transition: "cut" } }]]);
    assert.deepEqual(styled.content.style, { text_align: "left", text_position: "bottom", transition: "cut" });
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

test("a Bible chapter sent whole: each slide keeps its own reference", () => {
    const s = run([["content.show", { kind: "bible", title: "João 3", slides: [{ text: "16 Porque Deus", ref: "João 3:16 · NVI" }, { text: "17 Porque" }], index: 0 }]]);
    assert.equal(s.content.slides[0].ref, "João 3:16 · NVI");
    assert.equal(s.content.slides[1].ref, undefined);
    assert.equal(applyOp(s, "content.next", {}, T0).content.index, 1, "the arrows walk the chapter");
});

test("layer order: the operator stacks the look layers", () => {
    let s = emptyState(T0);
    assert.deepEqual(s.layerOrder, ["logo", "overlays", "content", "background"]);
    s = applyOp(s, "layers.order", { order: ["content", "logo", "overlays", "background"] }, T0);
    assert.deepEqual(s.layerOrder, ["content", "logo", "overlays", "background"]);
    assert.equal(applyOp(s, "layers.order", { order: [...s.layerOrder] }, T0), s, "same order: no change");
    assert.throws(() => applyOp(s, "layers.order", { order: ["logo", "content"] }, T0), LiveError);
    assert.throws(() => applyOp(s, "layers.order", { order: ["logo", "logo", "content", "background"] }, T0), LiveError);
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(s)), T0).layerOrder, s.layerOrder, "survives a restart");
});

test("Travar telas: nothing new goes on while locked, anything can come off", () => {
    let s = run([["content.show", song], ["background.set", { kind: "color", value: "#123456" }]]);
    s = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(s.locked, true);
    assert.equal(applyOp(s, "screens.lock", { locked: true }, T0), s, "already locked: no change");
    assert.throws(() => applyOp(s, "screens.lock", { locked: "sim" }, T0), LiveError);
    // Adding or changing what is on air is refused, with 423, for any sender.
    for (const [op, args] of [["content.show", song], ["content.next"], ["content.goTo", { index: 1 }], ["tool.show", { mode: "clock" }], ["alert.show", { message: "Atenção" }], ["session.item", { itemId: "x", index: 0 }], ["logo.set", { visible: true }], ["transport", { action: "pause", layer: "media" }]]) {
        assert.throws(() => applyOp(s, op, args, T0), (e) => e instanceof LiveError && e.status === 423, op);
    }
    // Taking things off, Tela preta / Logo and the idle screen still work.
    assert.equal(applyOp(s, "screen.set", { mode: "black" }, T0).screen, "black");
    assert.equal(applyOp(s, "idle.set", { mode: "black" }, T0).idle, "black");
    assert.equal(applyOp(s, "content.clear", {}, T0).content, null);
    const cleared = applyOp(s, "clear", {}, T0);
    assert.equal(cleared.content, null);
    assert.equal(cleared.locked, true, "Esc does not unlock");
    assert.equal(applyOp(s, "background.clear", {}, T0).background, null);
    // Every op is either allowed or refused: the list names real ops.
    for (const op of WHILE_LOCKED) assert.ok(OP_NAMES.includes(op), op);
    // Unlocked, sending works again.
    s = applyOp(s, "screens.lock", { locked: false }, T0);
    assert.equal(applyOp(s, "content.next", {}, T0).content.index, 1);
});

test("Travar telas is for the session: a restart comes back unlocked", () => {
    const s = run([["content.show", song], ["screens.lock", { locked: true }]]);
    assert.equal(emptyState(T0).locked, false);
    assert.equal(restoreState(JSON.parse(JSON.stringify(s)), T0 + 9).locked, false);
});

test("idle screen: logo or black, part of the document", () => {
    let s = emptyState(T0);
    assert.equal(s.idle, "logo");
    s = applyOp(s, "idle.set", { mode: "black" }, T0);
    assert.equal(s.idle, "black");
    assert.equal(applyOp(s, "idle.set", { mode: "black" }, T0), s, "same mode: no change");
    assert.throws(() => applyOp(s, "idle.set", { mode: "pink" }, T0), LiveError);
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0 + 99);
    assert.equal(back.idle, "black", "survives a restart");
    assert.equal(restoreState({ version: back.version, rev: 1 }, T0).idle, "logo");
});

test("idle screen: a wallpaper the operator chose, kept across Logo and Preto", () => {
    const wall = "http://127.0.0.1:7700/media/bundled/backgrounds/1557672172-298e090bd0f1.webp";
    let s = emptyState(T0);
    assert.equal(s.idleUrl, null);
    assert.throws(() => applyOp(s, "idle.set", { mode: "background" }, T0), /Escolha a imagem/, "Fundo needs its image");
    s = applyOp(s, "idle.set", { mode: "background", url: wall }, T0);
    assert.deepEqual([s.idle, s.idleUrl], ["background", wall]);
    assert.equal(applyOp(s, "idle.set", { mode: "background", url: wall }, T0), s, "same wallpaper: no change");
    s = applyOp(s, "idle.set", { mode: "logo" }, T0);
    assert.deepEqual([s.idle, s.idleUrl], ["logo", wall], "Logo keeps the last wallpaper");
    s = applyOp(s, "idle.set", { mode: "background" }, T0);
    assert.equal(s.idle, "background", "Fundo again: the same image comes back");
    assert.throws(() => applyOp(s, "idle.set", { mode: "background", url: { src: wall } }, T0), LiveError);
    assert.throws(() => applyOp(s, "idle.set", { mode: "background", url: "x".repeat(5000) }, T0), LiveError, "too long");
    // Locked screens still change their idle look (nothing new goes on air).
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(applyOp(locked, "idle.set", { mode: "black" }, T0).idle, "black");
    // Restarts: kept; an old save ("logo"/"black") loads; a wallpaper with no image falls back.
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0 + 99);
    assert.deepEqual([back.idle, back.idleUrl], ["background", wall]);
    assert.deepEqual([restoreState({ version: back.version, rev: 1, idle: "black" }, T0).idle, restoreState({ version: back.version, rev: 1, idle: "black" }, T0).idleUrl], ["black", null]);
    assert.equal(restoreState({ version: back.version, rev: 1, idle: "background" }, T0).idle, "logo");
});

test("audio channel: plays under the screens, survives Encerrar, has its own transport and list", () => {
    let s = run([["content.show", song], ["audio.show", { url: "keryx-media://ofertorio.mp3", title: "Ofertório" }, T0]]);
    assert.equal(s.audio.kind, "audio", "kind defaults to audio");
    assert.equal(mainLayer(s), "content", "audio is not a main layer");
    s = applyOp(s, "transport", { layer: "audio", action: "volume", volume: 0.4 }, T0 + 1000);
    assert.equal(s.audio.playback.volume, 0.4);
    s = applyOp(s, "clear", {}, T0 + 2000);
    assert.equal(s.content, null);
    assert.ok(s.audio, "Encerrar leaves the music playing");
    assert.equal(applyOp(s, "audio.clear", {}, T0).audio, null);
    assert.throws(() => applyOp(s, "audio.show", { kind: "image", url: "x" }, T0), LiveError);
    assert.equal(applyOp(s, "audio.show", { kind: "video", url: "keryx-media://v.mp4" }, T0).audio.kind, "video", "a video file for its sound");

    s = run([["audio.playlist", { items: [{ url: "a" }, { url: "b" }], index: 0 }, T0]]);
    s = applyOp(s, "transport", { layer: "audio", action: "volume", volume: 0.5 }, T0);
    s = applyOp(s, "audio.advance", { fromIndex: 0 }, T0 + 5000);
    assert.equal(s.audio.url, "b");
    assert.equal(s.audio.playback.volume, 0.5, "volume kept");
    assert.equal(applyOp(s, "audio.advance", { fromIndex: 0 }, T0), s, "duplicate report ignored");
    const end = applyOp(s, "audio.advance", { fromIndex: 1 }, T0 + 9000);
    assert.equal(end.audio.url, "b", "the list does not wrap");
    assert.equal(end.audio.playback.paused, true);
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0 + 99999);
    assert.equal(back.audio.playback.paused, true, "restored paused");
});

test("playlist.goTo: Anterior / Próximo in the player keep the volume", () => {
    let s = run([["media.playlist", { items: [{ kind: "video", url: "a" }, { kind: "video", url: "b" }, { kind: "image", url: "c" }], index: 1 }, T0]]);
    s = applyOp(s, "transport", { layer: "media", action: "volume", volume: 0.3 }, T0);
    s = applyOp(s, "playlist.goTo", { layer: "media", index: 0 }, T0 + 100);
    assert.equal(s.media.url, "a");
    assert.equal(s.media.playlistIndex, 0);
    assert.equal(s.media.playback.volume, 0.3);
    assert.equal(s.media.shownAt, T0 + 100);
    assert.equal(applyOp(s, "playlist.goTo", { layer: "media", index: 0 }, T0), s, "same item: no change");
    assert.equal(applyOp(s, "playlist.goTo", { layer: "media", index: 99 }, T0).media.url, "c", "clamped");
    assert.throws(() => applyOp(s, "playlist.goTo", { layer: "video", index: 0 }, T0), LiveError);
    const single = run([["media.show", { kind: "video", url: "v" }, T0]]);
    assert.throws(() => applyOp(single, "playlist.goTo", { layer: "media", index: 1 }, T0), LiveError);
});

test("Camadas text style: typed keys clamp or choose; bad values are errors; old keys stay text", () => {
    const s = run([["content.show", { ...song, style: { font_size: "large", text_opacity: 1.7, text_max_width: 10, line_height: "loose", text_case: "upper", text_box: "block", text_box_color: "#1A2B3C", text_box_opacity: 0.5, text_nudge: -50 } }]]);
    assert.deepEqual(s.content.style, { font_size: "large", text_opacity: 1, text_max_width: 40, line_height: "loose", text_case: "upper", text_box: "block", text_box_opacity: 0.5, text_nudge: -20, text_box_color: "#1a2b3c" });
    assert.throws(() => run([["content.show", { ...song, style: { line_height: "huge" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { text_box_color: "red" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { text_opacity: "muito" } }]]), LiveError);
    // content.update keeps them too (Camadas edits what is on air).
    const u = applyOp(s, "content.update", { style: { ...s.content.style, text_case: "none" } }, T0);
    assert.equal(u.content.style.text_case, "none");
    assert.equal(u.content.style.text_box, "block");
});

test("Camadas logo: opacity, margin and free width, clamped; null resets; no change, no broadcast", () => {
    let s = applyOp(emptyState(T0), "logo.set", { visible: true, opacity: 0.05, margin: 4, width: 50 }, T0);
    assert.deepEqual(s.logo, { visible: true, corner: "bottom-right", size: "medium", opacity: 0.2, margin: 4, width: 30 });
    assert.equal(applyOp(s, "logo.set", { opacity: 0.2 }, T0), s, "same values: the same object");
    s = applyOp(s, "logo.set", { width: null }, T0);
    assert.equal("width" in s.logo, false);
    assert.throws(() => applyOp(s, "logo.set", { opacity: "x" }, T0), LiveError);
});

test("Camadas background: fit, dim, blur and position, only when set", () => {
    const plain = run([["background.set", { kind: "image", value: "keryx-media://a.jpg" }]]).background;
    assert.deepEqual(Object.keys(plain).sort(), ["kind", "title", "value"], "an old call keeps the old shape");
    const b = run([["background.set", { kind: "image", value: "keryx-media://a.jpg", fit: "contain", dim: 2, blur: 8, position: "top" }]]).background;
    assert.equal(b.fit, "contain");
    assert.equal(b.dim, 0.9);
    assert.equal(b.blur, 8);
    assert.equal(b.position, "top");
    assert.throws(() => run([["background.set", { kind: "image", value: "x", fit: "stretch" }]]), LiveError);
});

test("the slide transition's length rides in the text style, kept between 120 and 600 ms", () => {
    const show = (ms) => applyOp(emptyState(T0), "content.show", { kind: "lyrics", title: "T", slides: [{ text: "a" }], style: { transition: "slide", transition_ms: ms } }, T0).content.style;
    assert.equal(show(300).transition_ms, 300);
    assert.equal(show(5000).transition_ms, 600, "too long: 600");
    assert.equal(show(10).transition_ms, 120, "too short: 120");
    assert.throws(() => show("depressa"), LiveError);
});

test("an item's own background takes a dim and a blur (Fundos), kept in range", () => {
    const show = (extra) => applyOp(emptyState(T0), "content.show", { kind: "lyrics", title: "T", slides: [{ text: "a" }], style: { background_image: "http://x/a.webp", ...extra } }, T0).content.style;
    assert.equal(show({ background_dim: 0 }).background_dim, 0, "no dim at all is a choice");
    assert.equal(show({ background_dim: 2 }).background_dim, 0.9);
    assert.equal(show({ background_blur: 40 }).background_blur, 20);
    assert.equal(show({}).background_dim, undefined, "unset: the screen's default");
});
