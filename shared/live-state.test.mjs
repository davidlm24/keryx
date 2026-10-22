import test from "node:test";
import assert from "node:assert/strict";
import {
    applyOp, emptyState, restoreState, mainLayer, livePosition, currentSlide, nextSlide, toolTime, playbackPlan, playbackGain, LiveError, OP_NAMES, WHILE_LOCKED, layerLocked, followPosition, followIndex, slideAtTime, FOLLOW_SOURCES,
    activitySteps, revealStep, revealOf,
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

test("a passage in two editions: each slide carries the second one's text and sigla (Rodada P)", () => {
    const s = run([["content.show", { kind: "bible", title: "Atos 11", slides: [{ text: "3 Dizendo: Entraste", ref: "Atos 11:3 · ACF", pair: { text: "3 e disseram: Você entrou", version: "NVI", extra: 1 } }, { text: "4 Mas Pedro" }], style: { pair: "stack" } }]]);
    assert.deepEqual(s.content.slides[0].pair, { text: "3 e disseram: Você entrou", version: "NVI" }, "only the text and the sigla ride");
    assert.equal(s.content.slides[1].pair, undefined, "a slide without one shows one edition");
    assert.equal(s.content.style.pair, "stack");
    assert.equal(run([["content.show", { kind: "bible", slides: [{ text: "x", pair: { text: "y", version: "NVI" } }] }]]).content.style.pair, undefined, "no choice: the renderer puts them side by side");
    assert.throws(() => run([["content.show", { kind: "bible", slides: [{ text: "x", pair: "NVI" }] }]]), LiveError);
    assert.throws(() => run([["content.show", { kind: "bible", slides: [{ text: "x" }], style: { pair: "grid" } }]]), LiveError);
    assert.throws(() => run([["content.show", { kind: "bible", slides: [{ text: "x", pair: { text: "y", version: "SIGLA-LONGA-DEMAIS" } }] }]]), LiveError);
    // A live edit keeps it (content.update runs the same slide check).
    const up = applyOp(s, "content.update", { slides: [{ text: "3 a", pair: { text: "3 b", version: "ARA" } }] }, T0);
    assert.equal(up.content.slides[0].pair.version, "ARA");
});

test("Camadas' eye: a layer hidden stays on air; a new send or Fundo shows it again", () => {
    const pic = { kind: "image", value: "keryx-media://a.webp" };
    let s = run([["content.show", song], ["background.set", pic]]);
    assert.deepEqual(s.hiddenLayers, []);
    s = applyOp(s, "layers.hide", { layer: "content" }, T0);
    s = applyOp(s, "layers.hide", { layer: "background" }, T0);
    assert.deepEqual(s.hiddenLayers, ["content", "background"]);
    assert.ok(s.content && s.background, "hidden, not taken off");
    assert.equal(applyOp(s, "layers.hide", { layer: "content" }, T0), s, "already hidden: no change");
    assert.equal(applyOp(s, "content.next", {}, T0).content.index, 1, "the arrows still walk the hidden text");
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(s)), T0).hiddenLayers, ["content", "background"], "survives a restart");
    assert.deepEqual(applyOp(s, "layers.show", { layer: "content" }, T0).hiddenLayers, ["background"]);
    assert.deepEqual(applyOp(s, "content.show", song, T0).hiddenLayers, ["background"], "a new item shows its text");
    assert.deepEqual(applyOp(s, "background.set", pic, T0).hiddenLayers, ["content"], "a Fundo chosen shows the Fundo");
    assert.deepEqual(applyOp(s, "clear", {}, T0).hiddenLayers, ["background"], "Esc: the text goes, the Fundo stays hidden");
    assert.throws(() => applyOp(s, "layers.hide", { layer: "logo" }, T0), LiveError);
    const locked = applyOp(run([["content.show", song]]), "screens.lock", { locked: true }, T0);
    assert.deepEqual(applyOp(locked, "layers.hide", { layer: "content" }, T0).hiddenLayers, ["content"], "hiding works locked");
    const hiddenLocked = applyOp(applyOp(run([["content.show", song]]), "layers.hide", { layer: "content" }, T0), "screens.lock", { locked: true }, T0);
    assert.throws(() => applyOp(hiddenLocked, "layers.show", { layer: "content" }, T0), (e) => e.status === 423, "showing it again does not");
    assert.deepEqual(restoreState({ ...JSON.parse(JSON.stringify(s)), hiddenLayers: ["logo", "content", 3] }, T0).hiddenLayers, ["content"], "only known layers come back");
});

test("Camadas' padlock: a locked Fundo is held against every sender", () => {
    const pic = { kind: "image", value: "keryx-media://a.webp" };
    let s = run([["background.set", pic], ["layers.lock", { layer: "background", locked: true }]]);
    assert.deepEqual(s.lockedLayers, ["background"]);
    assert.ok(layerLocked(s, "background"));
    assert.equal(applyOp(s, "layers.lock", { layer: "background", locked: true }, T0), s, "already locked: no change");
    assert.throws(() => applyOp(s, "background.set", { kind: "color", value: "#000000" }, T0), (e) => e.status === 423, "nothing changes it");
    assert.throws(() => applyOp(s, "background.clear", {}, T0), (e) => e.status === 423, "nor takes it off");
    s = applyOp(s, "content.show", song, T0);
    s = applyOp(s, "clear", {}, T0);
    assert.equal(s.background.value, pic.value, "sends and Esc leave it alone");
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(s)), T0).lockedLayers, ["background"], "survives a restart");
    const screens = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.deepEqual(applyOp(screens, "layers.lock", { layer: "background", locked: false }, T0).lockedLayers, [], "works with the screens locked");
    s = applyOp(s, "layers.lock", { layer: "background", locked: false }, T0);
    assert.equal(applyOp(s, "background.clear", {}, T0).background, null, "unlocked: free again");
    assert.throws(() => applyOp(s, "layers.lock", { layer: "content", locked: true }, T0), LiveError);
    assert.throws(() => applyOp(s, "layers.lock", { layer: "background" }, T0), LiveError);
    assert.deepEqual(restoreState({ ...JSON.parse(JSON.stringify(s)), lockedLayers: ["logo", "background", 1] }, T0).lockedLayers, ["background"]);
});

test("the item title: shown or hidden for this item, else the church's choice", () => {
    let s = run([["content.show", song]]);
    assert.equal(s.content.style.title, undefined, "unset: the church decides (Aparência)");
    s = applyOp(s, "content.update", { style: { ...s.content.style, title: "hide" } }, T0);
    assert.equal(s.content.style.title, "hide");
    assert.throws(() => applyOp(s, "content.update", { style: { title: "maybe" } }, T0), LiveError);
});

test("the Fundo padrão: Esc puts it on the Fundo; none, the Fundo stays", () => {
    const song_bg = { kind: "generator", value: "aurora", title: "Aurora" };
    const padrao = { kind: "image", value: "keryx-media://culto.webp", title: "Fundo do culto" };
    let s = run([["background.set", song_bg], ["content.show", song]]);
    assert.equal(applyOp(s, "clear", {}, T0).background.value, "aurora", "no Fundo padrão: Esc leaves the Fundo");
    s = applyOp(s, "background.default", { background: padrao }, T0);
    assert.equal(s.background.value, "aurora", "setting it changes nothing on screen");
    assert.equal(applyOp(s, "background.default", { background: padrao }, T0), s, "the same: no change");
    const after = applyOp(s, "clear", {}, T0);
    assert.equal(after.content, null);
    assert.equal(after.background.value, padrao.value, "Esc: the service's (or the day's) background");
    const held = applyOp(s, "layers.lock", { layer: "background", locked: true }, T0);
    assert.equal(applyOp(held, "clear", {}, T0).background.value, "aurora", "the padlock holds the Fundo");
    const screens = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(applyOp(screens, "background.default", { background: null }, T0).defaultBackground, null, "set with the screens locked too");
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(s)), T0).defaultBackground, s.defaultBackground, "survives a restart");
    assert.equal(restoreState({ ...JSON.parse(JSON.stringify(s)), defaultBackground: { kind: "nope" } }, T0).defaultBackground, null);
    assert.throws(() => applyOp(s, "background.default", { background: { kind: "image" } }, T0), LiveError);
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

test("after a crash the screens come back as the audience saw them, sound still paused", () => {
    const s = run([
        ["content.show", { ...song, index: 2 }],
        ["video.show", { kind: "video", url: "v" }, T0],
        ["transport", { action: "seek", time: 12 }, T0 + 1000],
        ["screens.lock", { locked: true }, T0 + 2000],
    ]);
    const saved = JSON.parse(JSON.stringify(s));
    const back = restoreState(saved, T0 + 60_000, { afterCrash: true });
    assert.equal(back.screen, "show", "lit, not Tela preta");
    assert.equal(mainLayer(back), "content");
    assert.equal(back.content.index, 2);
    assert.equal(back.locked, true, "a lock set before the crash still holds");
    assert.equal(back.video.playback.paused, true, "how far it played after the crash is unknown");
    assert.equal(livePosition(back.video.playback, T0 + 999_999), 12);
    // Tela preta or the Logo before the crash stay what they were.
    const black = applyOp(s, "screen.set", { mode: "black" }, T0 + 3000);
    assert.equal(restoreState(JSON.parse(JSON.stringify(black)), T0, { afterCrash: true }).screen, "black");
    assert.equal(restoreState({ ...saved, screen: "off" }, T0, { afterCrash: true }).screen, "black", "an unknown mode is black");
    // A normal close keeps today's rule.
    assert.equal(restoreState(saved, T0).screen, "black");
    assert.equal(restoreState(saved, T0, { afterCrash: false }).locked, false);
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

test("idle screen: its look (fundo, logo, words) is part of the document (owner 2026-10-19)", () => {
    let s = emptyState(T0);
    assert.equal(s.idleLook, null, "the look the screens always had");
    s = applyOp(s, "idle.look", { look: { bg: "color", color: "#112233", logo: "l", phrase: "own", text: "Bem-vindos" } }, T0);
    assert.deepEqual([s.idleLook.bg, s.idleLook.color, s.idleLook.logo, s.idleLook.text], ["color", "#112233", "l", "Bem-vindos"]);
    assert.equal(applyOp(s, "idle.look", { look: { ...s.idleLook } }, T0), s, "the same look: no change");
    assert.throws(() => applyOp(s, "idle.look", { look: { logo: "xl" } }, T0), /logo/);
    assert.throws(() => applyOp(s, "idle.look", { look: { color: "blue" } }, T0), LiveError);
    // Locked screens still change it (nothing new goes on air).
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(applyOp(locked, "idle.look", { look: null }, T0).idleLook, null);
    // The default look is stored as null; a restart keeps the look; old saves have none.
    assert.equal(applyOp(s, "idle.look", { look: { bg: "gradient", logo: "m" } }, T0).idleLook, null);
    assert.equal(restoreState(JSON.parse(JSON.stringify(s)), T0 + 9).idleLook.color, "#112233");
    assert.equal(restoreState({ version: s.version, rev: 1, idleLook: "junk" }, T0).idleLook, null);
    assert.equal(restoreState({ version: s.version, rev: 1 }, T0).idleLook, null);
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

test("audio channel: plays under the screens, stops with Encerrar, has its own transport and list", () => {
    let s = run([["content.show", song], ["audio.show", { url: "keryx-media://ofertorio.mp3", title: "Ofertório" }, T0]]);
    assert.equal(s.audio.kind, "audio", "kind defaults to audio");
    assert.equal(mainLayer(s), "content", "audio is not a main layer");
    s = applyOp(s, "transport", { layer: "audio", action: "volume", volume: 0.4 }, T0 + 1000);
    assert.equal(s.audio.playback.volume, 0.4);
    assert.equal(applyOp(s, "audio.clear", {}, T0).audio, null);
    const ended = applyOp(s, "clear", {}, T0 + 2000);
    assert.equal(ended.content, null);
    assert.equal(ended.audio, null, "Encerrar stops the music too (Rodada G3, owner 2026-10-17)");
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

test("Tirar o vídeo · o som continua: the video leaves the projector, its sound goes on in the audio channel", () => {
    let s = run([["content.show", song], ["media.show", { kind: "video", url: "keryx-media://v.mp4", title: "Abertura", duration: 90 }, T0]]);
    s = applyOp(s, "transport", { layer: "media", action: "volume", volume: 0.6 }, T0);
    const moved = applyOp(s, "media.toAudio", {}, T0 + 12_000);
    assert.equal(moved.media, null);
    assert.equal(mainLayer(moved), "content", "the screen shows what was under the video");
    assert.deepEqual([moved.audio.kind, moved.audio.url, moved.audio.title, moved.audio.duration], ["video", "keryx-media://v.mp4", "Abertura", 90]);
    assert.deepEqual(moved.audio.playback, { paused: false, position: 12, at: T0 + 12_000, volume: 0.6 }, "same second, same volume");
    assert.equal(moved.audio.shownAt, T0 + 12_000, "the player follows it");
    assert.equal(moved.history[0].layer, "media", "Voltar ao anterior can bring the video back");
    assert.equal(applyOp(moved, "clear", {}, T0 + 13_000).audio, null, "Esc stops the sound, as all the player's music (Rodada G3)");
    assert.ok(applyOp(moved, "content.show", song, T0 + 13_000).audio, "the next send leaves it playing");

    // Paused stays paused, where it was.
    const paused = applyOp(applyOp(s, "transport", { layer: "media", action: "pause" }, T0 + 5000), "media.toAudio", {}, T0 + 60_000);
    assert.deepEqual([paused.audio.playback.paused, paused.audio.playback.position], [true, 5]);

    // And back: the same file on the projector, from the second it reached.
    const back = applyOp(moved, "audio.toMedia", {}, T0 + 20_000);
    assert.equal(back.audio, null);
    assert.equal(mainLayer(back), "media");
    assert.deepEqual(back.media.playback, { paused: false, position: 20, at: T0 + 20_000, volume: 0.6 });
    assert.throws(() => applyOp(run([["audio.show", { url: "a.mp3" }]]), "audio.toMedia", {}, T0), LiveError, "music has no picture");

    // Only what can be heard; YouTube cannot play hidden.
    assert.throws(() => applyOp(emptyState(T0), "media.toAudio", {}, T0), (e) => e.status === 409);
    assert.throws(() => applyOp(run([["media.show", { kind: "image", url: "i.jpg" }]]), "media.toAudio", {}, T0), LiveError);
    assert.throws(() => applyOp(run([["media.show", { kind: "youtube", url: "https://youtu.be/x" }]]), "media.toAudio", {}, T0), LiveError);

    // Locked: the video can leave the screen, not come back.
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    const off = applyOp(locked, "media.toAudio", {}, T0 + 1000);
    assert.equal(off.media, null);
    assert.throws(() => applyOp(off, "audio.toMedia", {}, T0), (e) => e.status === 423);
});

test("the eye (Rodada G4): toAudio carries the fade, carried playback has no ramp, works locked", () => {
    const s = run([["content.show", song], ["media.show", { kind: "video", url: "keryx-media://v.mp4" }, T0]]);
    const moved = applyOp(s, "media.toAudio", { fade: 300 }, T0 + 5000);
    assert.deepEqual(moved.fade, { ms: 300, at: T0 + 5000 }, "the picture fades out as Esc's does");
    assert.equal(moved.updatedAt, moved.fade.at);
    assert.deepEqual(moved.leaving, [], "the sound never leaves: it goes on in the audio channel");
    assert.deepEqual(Object.keys(moved.audio.playback).sort(), ["at", "paused", "position", "volume"], "no ramp: the sound goes on at its level");
    assert.equal(applyOp(s, "media.toAudio", {}, T0).fade, null, "Corte: no fade");
    assert.equal(applyOp(s, "media.toAudio", { fade: 9999 }, T0).fade.ms, 3000, "clamped");
    assert.throws(() => applyOp(s, "media.toAudio", { fade: "suave" }, T0), LiveError);

    // Mostrar o vídeo fades in with the same fade.
    const back = applyOp(moved, "audio.toMedia", { fade: 600 }, T0 + 9000);
    assert.deepEqual(back.fade, { ms: 600, at: T0 + 9000 });
    assert.deepEqual(Object.keys(back.media.playback).sort(), ["at", "paused", "position", "volume"]);

    // Locked: the video leaves the screen with its fade; it cannot come back.
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    const off = applyOp(locked, "media.toAudio", { fade: 300 }, T0 + 1000);
    assert.deepEqual([off.media, off.fade.ms], [null, 300]);
    assert.throws(() => applyOp(off, "audio.toMedia", { fade: 300 }, T0 + 2000), (e) => e.status === 423);

    // A single video that ends by itself: the projector clears it with the fade.
    const ended = applyOp(s, "media.clear", { fade: 300 }, T0 + 90_000);
    assert.deepEqual([ended.media, ended.fade], [null, { ms: 300, at: T0 + 90_000 }]);
    assert.equal(applyOp(s, "media.clear", {}, T0).fade, null);
});

test("a video's still (poster) rides with it: shown, in a list, to the audio channel and back", () => {
    const video = { kind: "video", url: "keryx-media://v.mp4", title: "Abertura", poster: "keryx-media://v-poster.jpg" };
    const shown = run([["media.show", video, T0]]);
    assert.equal(shown.media.poster, "keryx-media://v-poster.jpg");
    const listed = run([["media.playlist", { items: [{ kind: "image", url: "i" }, video], index: 1 }, T0]]);
    assert.equal(listed.media.poster, "keryx-media://v-poster.jpg");
    assert.equal(listed.media.playlist[1].poster, "keryx-media://v-poster.jpg");
    const moved = applyOp(shown, "media.toAudio", {}, T0 + 1000);
    assert.equal(moved.audio.poster, "keryx-media://v-poster.jpg");
    assert.equal(applyOp(moved, "audio.toMedia", {}, T0 + 2000).media.poster, "keryx-media://v-poster.jpg");
    assert.equal("poster" in run([["media.show", { kind: "video", url: "v" }, T0]]).media, false, "none, no field");
    assert.throws(() => applyOp(emptyState(T0), "media.show", { ...video, poster: { url: "x" } }, T0), LiveError);
});

test("Tirar o vídeo from a list:the list goes along, only what can be heard, and stops at its end", () => {
    const items = [{ kind: "image", url: "i" }, { kind: "video", url: "a" }, { kind: "pdf", url: "p" }, { kind: "video", url: "b" }, { kind: "audio", url: "c" }];
    const s = run([["media.playlist", { items, index: 3 }, T0], ["media.toAudio", {}, T0 + 1000]]);
    assert.deepEqual(s.audio.playlist.map((it) => it.url), ["a", "b", "c"]);
    assert.equal(s.audio.playlistIndex, 1, "the same item, in the shorter list");
    assert.equal(s.audio.url, "b");
    const last = applyOp(applyOp(s, "audio.advance", { fromIndex: 1 }, T0 + 2000), "audio.advance", { fromIndex: 2 }, T0 + 3000);
    assert.equal(last.audio.playback.paused, true, "music does not wrap");
    const alone = run([["media.playlist", { items: [{ kind: "image", url: "i" }, { kind: "video", url: "a" }], index: 1 }, T0], ["media.toAudio", {}, T0]]);
    assert.equal(alone.audio.playlist, null, "one item left is not a list");
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

test("the theme's typography (Rodada HF2): a free size, bold, italic, spacing and outline", () => {
    const s = run([["content.show", { ...song, style: { font_size: "5.3", font_weight: "bold", font_style: "italic", line_height: 1.6, letter_spacing: 0.9, text_outline_px: 12, text_outline_color: "#FF0000" } }]]);
    assert.deepEqual(s.content.style, { font_size: "5.3", font_weight: "bold", font_style: "italic", line_height: 1.6, letter_spacing: 0.5, text_outline_px: 8, text_outline_color: "#ff0000" });
    // The line spacing takes its old names, a number (or a numeric string), clamped.
    assert.equal(run([["content.show", { ...song, style: { line_height: "tight" } }]]).content.style.line_height, "tight");
    assert.equal(run([["content.show", { ...song, style: { line_height: "1.3" } }]]).content.style.line_height, 1.3);
    assert.equal(run([["content.show", { ...song, style: { line_height: 0.2 } }]]).content.style.line_height, 0.9);
    assert.equal(run([["content.show", { ...song, style: { letter_spacing: -1 } }]]).content.style.letter_spacing, -0.1);
    assert.equal(run([["content.show", { ...song, style: { text_outline_px: 0 } }]]).content.style.text_outline_px, 0);
    // A theme's comment never reaches the screens.
    assert.equal("note" in run([["content.show", { ...song, style: { note: "só para o culto jovem" } }]]).content.style, false);
    assert.throws(() => run([["content.show", { ...song, style: { font_weight: "black" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { font_style: "oblique" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { text_outline_color: "preto" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { letter_spacing: "largo" } }]]), LiveError);
});

test("the text bar's keys (Rodada P, P8-1): underline, justify and Primeira Maiúscula", () => {
    const s = run([["content.show", { ...song, style: { text_decoration: "underline", text_justify: "justify", text_case: "capitalize", text_align: "left" } }]]);
    assert.deepEqual(s.content.style, { text_align: "left", text_case: "capitalize", text_decoration: "underline", text_justify: "justify" });
    assert.throws(() => run([["content.show", { ...song, style: { text_decoration: "line-through" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { text_justify: "yes" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...song, style: { text_case: "lower" } }]]), LiveError);
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

test("the idle wallpaper takes a dim and a blur; a new wallpaper starts without the old one's", () => {
    const a = "http://x/a.webp", b = "http://x/b.webp";
    let s = applyOp(emptyState(T0), "idle.set", { mode: "background", url: a, dim: 0.6, blur: 40 }, T0);
    assert.deepEqual([s.idleDim, s.idleBlur], [0.6, 20], "blur kept in range");
    assert.deepEqual([applyOp(s, "idle.set", { mode: "logo" }, T0).idleDim, applyOp(s, "idle.set", { mode: "black" }, T0).idleBlur], [0.6, 20], "a mode change keeps the look");
    assert.equal(applyOp(s, "idle.set", { mode: "background", url: a }, T0), s, "same wallpaper, nothing new: no change");
    assert.deepEqual([applyOp(s, "idle.set", { mode: "background", url: a, dim: null }, T0).idleDim, applyOp(s, "idle.set", { mode: "background", url: a, dim: null }, T0).idleBlur], [null, 20], "null clears one");
    assert.deepEqual([applyOp(s, "idle.set", { mode: "background", url: b }, T0).idleDim, applyOp(s, "idle.set", { mode: "background", url: b }, T0).idleBlur], [null, null], "another wallpaper: its own look");
    assert.deepEqual([applyOp(s, "idle.set", { mode: "background", url: b, dim: 0.2 }, T0).idleDim, applyOp(s, "idle.set", { mode: "background", url: b, dim: 0.2 }, T0).idleBlur], [0.2, null]);
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0);
    assert.deepEqual([back.idleDim, back.idleBlur], [0.6, 20], "survives a restart");
    assert.deepEqual([restoreState({ idle: "logo" }, T0).idleDim, emptyState(T0).idleBlur], [null, null]);
});

test("a slide may carry its part's own look (song themes): sanitized like the content's style", () => {
    const s = applyOp(emptyState(1), "content.show", { title: "M", slides: [
        { text: "Verso", label: "Verso" },
        { text: "Refrão", label: "Refrão", style: { font_family: "serif", background_image: "keryx-media://a.webp", background_dim: 0.3, text_box: "", bogus: "x" } },
        { text: "Vazio", style: {} },
    ] }, 1);
    assert.equal(s.content.slides[0].style, undefined);
    assert.deepEqual(s.content.slides[1].style, { font_family: "serif", background_image: "keryx-media://a.webp", background_dim: 0.3 });
    assert.equal(s.content.slides[2].style, undefined);
    assert.throws(() => applyOp(emptyState(1), "content.show", { title: "M", slides: [{ text: "x", style: "azul" }] }, 1), /Estilo inválido/);
    // Out of range is held to the range, as in the content style.
    assert.equal(applyOp(emptyState(1), "content.show", { title: "M", slides: [{ text: "x", style: { background_dim: 5 } }] }, 1).content.slides[0].style.background_dim, 0.9);
});

test("a passage's display choices are part of its style (verse numbers, reference line)", () => {
    const s = applyOp(emptyState(T0), "content.show", { kind: "bible", title: "João 3:16 · NVI", slides: [{ text: "16 Porque" }], style: { verse_numbers: "hide", ref_line: "plain" } }, T0);
    assert.equal(s.content.style.verse_numbers, "hide");
    assert.equal(s.content.style.ref_line, "plain");
    assert.throws(() => applyOp(emptyState(T0), "content.show", { kind: "bible", slides: [{ text: "x" }], style: { ref_line: "big" } }, T0));
});

test("tool.adjust gives or takes time on a timer on air", () => {
    const T = 1_000_000;
    const on = applyOp(emptyState(T), "tool.show", { mode: "timer", durationMs: 600000 }, T); // ends at T + 10 min
    const more = applyOp(on, "tool.adjust", { deltaMs: 300000 }, T + 1000);
    assert.equal(more.tool.endsAt, T + 900000);
    assert.equal(more.tool.mode, "timer");
    assert.equal(applyOp(more, "tool.adjust", { deltaMs: -60000 }, T + 2000).tool.endsAt, T + 840000);
    // Taking more than is left leaves it at zero, never in the past.
    const low = applyOp(emptyState(T), "tool.show", { mode: "timer", durationMs: 30000 }, T);
    assert.equal(applyOp(low, "tool.adjust", { deltaMs: -60000 }, T + 5000).tool.endsAt, T + 5000);
    assert.equal(toolTime(applyOp(low, "tool.adjust", { deltaMs: -60000 }, T + 5000).tool, T + 5000), 0);
    // A timer that ran out starts again from now.
    const done = applyOp(low, "tool.adjust", { deltaMs: 60000 }, T + 90000);
    assert.equal(done.tool.endsAt, T + 150000);
    assert.equal(toolTime(done.tool, T + 90000), 60000);
    // Only a timer on air, and a sane amount.
    assert.throws(() => applyOp(emptyState(T), "tool.adjust", { deltaMs: 60000 }, T), /projetado/);
    assert.throws(() => applyOp(applyOp(emptyState(T), "tool.show", { mode: "stopwatch" }, T), "tool.adjust", { deltaMs: 60000 }, T), /Só o timer/);
    for (const bad of [0, "", null, "abc", 4 * 3600000, NaN]) assert.throws(() => applyOp(on, "tool.adjust", { deltaMs: bad }, T), /Tempo inválido/);
    // Locked screens refuse it, like a new timer.
    const locked = applyOp(on, "screens.lock", { locked: true }, T);
    assert.throws(() => applyOp(locked, "tool.adjust", { deltaMs: 60000 }, T), /travadas/);
});

test("a generated background: the generator is checked, its numbers clamped and completed", () => {
    const s = applyOp(emptyState(T0), "background.set", { kind: "generator", value: "fluid", title: "Lava", gen: { speed: 9, colors: ["#3f0000", "#ff7600"] }, dim: 0.3 }, T0);
    assert.equal(s.background.kind, "generator");
    assert.equal(s.background.gen.id, "fluid");
    assert.equal(s.background.gen.speed, 2);
    assert.equal(s.background.gen.detail, 5, "an unsent number is the default");
    assert.deepEqual(s.background.gen.colors, ["#3f0000", "#ff7600"]);
    assert.equal(s.background.dim, 0.3);
    assert.throws(() => applyOp(emptyState(T0), "background.set", { kind: "generator", value: "lava" }, T0), /Gerador inválido/);
    const plain = applyOp(emptyState(T0), "background.set", { kind: "generator", value: "clouds" }, T0);
    assert.equal(plain.background.gen.id, "clouds", "no gen at all is the defaults");
});

// Automatic lyrics (owner 2026-10-15, Rodada D4): the same marks follow a
// video, a playback on the audio channel or a live clock.
const timed = { title: "Canção", slides: [{ text: "intro" }, { text: "um", start: 10 }, { text: "dois", start: 20 }, { text: "três", start: 30 }] };
const S = 1000;

test("Esc puts the papel de parede back with the look it was given (0.2.18)", () => {
    const pic = { kind: "image", value: "keryx-media://p.webp", dim: 0, blur: 0 };
    let s = run([["background.default", { background: pic }], ["background.set", pic], ["content.show", song]]);
    s = applyOp(s, "clear", {}, T0);
    assert.equal(s.background.dim, 0, "not the renderer's 45 % fallback");
    assert.equal(s.background.value, pic.value);
});

test("slides keep their start; a song with marks follows its source", () => {
    assert.deepEqual(FOLLOW_SOURCES, ["video", "audio", "clock", "time"]);
    let s = run([["content.show", { ...timed, follow: { source: "audio", url: "/media/a.mp3", length: 200 } }]]);
    assert.equal(s.content.slides[1].start, 10);
    assert.deepEqual(s.content.follow, { source: "audio", paused: false, offset: 0, clock: null, pausedIndex: null, url: "/media/a.mp3", length: 200 });
    // No marks: no follow, whatever was asked.
    assert.equal(run([["content.show", { ...song, follow: { source: "clock" } }]]).content.follow, null);
    assert.throws(() => run([["content.show", { ...timed, follow: { source: "radio" } }]]), LiveError);
    assert.throws(() => run([["content.show", { ...timed, follow: { source: "video" } }]]), LiveError, "a media source needs its url");
    assert.equal(slideAtTime(timed.slides, 5), -1);
    assert.equal(slideAtTime(timed.slides, 20), 2);
    assert.equal(slideAtTime(timed.slides, 99), 3);
    // The audio channel plays it: the slide follows its position.
    s = applyOp(s, "audio.show", { url: "/media/a.mp3" }, T0);
    assert.equal(followPosition(s, T0 + 12 * S), 12);
    assert.equal(followIndex(s, T0 + 5 * S), null, "before the first mark: left as it is");
    assert.equal(followIndex(s, T0 + 21 * S), 2);
    // Another file on the channel: nothing to follow.
    assert.equal(followIndex(applyOp(s, "audio.show", { url: "/media/b.mp3" }, T0), T0 + 21 * S), null);
    // The player's eye moves a video between layers: still followed.
    let v = run([["content.show", { ...timed, follow: { source: "video", url: "/media/v.mp4" } }], ["video.show", { kind: "video", url: "/media/v.mp4" }]]);
    assert.equal(followIndex(v, T0 + 31 * S), 3);
    v = run([["media.show", { kind: "video", url: "/media/v.mp4" }], ["media.toAudio", {}]], v);
    assert.equal(followPosition(v, T0 + 5 * S), 5);
});

test("the arrows re-sync the follow there, the follower's own moves do not", () => {
    let s = run([["content.show", { ...timed, follow: { source: "audio", url: "/a.mp3" } }], ["audio.show", { url: "/a.mp3" }]]);
    // At 12 s the operator jumps to "três" (30 s): from then on it follows 18 s ahead.
    s = applyOp(s, "content.goTo", { index: 3 }, T0 + 12 * S);
    assert.equal(s.content.follow.offset, 18);
    assert.equal(s.content.follow.paused, false, "the arrows never turn it off");
    assert.equal(followIndex(s, T0 + 12.5 * S), 3);
    // The follower's own move (auto) keeps the offset.
    s = applyOp(s, "content.goTo", { index: 1, auto: true }, T0 + 13 * S);
    assert.equal(s.content.follow.offset, 18);
    // content.next re-syncs too.
    s = applyOp(s, "content.next", {}, T0 + 14 * S);
    assert.equal(s.content.follow.offset, 6);
});

test("the live clock: waits for Iniciar, pauses, resumes from the slide moved to", () => {
    let s = run([["content.show", { ...timed, follow: { source: "clock", length: 210 } }]]);
    assert.equal(s.content.follow.paused, true, "waits for the operator");
    assert.equal(followIndex(s, T0 + 50 * S), null);
    s = applyOp(s, "content.follow", { action: "start" }, T0);
    assert.deepEqual(s.content.follow.clock, { paused: false, position: 0, at: T0 });
    assert.equal(followIndex(s, T0 + 11 * S), 1);
    // Pause at 15 s: the clock stops there.
    s = applyOp(s, "content.follow", { action: "pause" }, T0 + 15 * S);
    assert.equal(followPosition(s, T0 + 60 * S), 15);
    assert.equal(followIndex(s, T0 + 60 * S), null);
    // Resumed without moving: the clock goes on from 15 s, no re-sync.
    let r = applyOp(s, "content.follow", { action: "resume" }, T0 + 60 * S);
    assert.equal(r.content.follow.offset, 0);
    assert.equal(followPosition(r, T0 + 65 * S), 20);
    // Moved to "três" while paused, then resumed: it goes on from there.
    s = applyOp(s, "content.goTo", { index: 3 }, T0 + 30 * S);
    r = applyOp(s, "content.follow", { action: "resume" }, T0 + 60 * S);
    assert.equal(r.content.follow.offset, 15);
    assert.equal(followIndex(r, T0 + 60.5 * S), 3);
    // Starting from a later slide: the clock starts at its mark.
    let t = run([["content.show", { ...timed, index: 2, follow: { source: "clock" } }], ["content.follow", { action: "start" }]]);
    assert.equal(t.content.follow.clock.position, 20);
    assert.throws(() => applyOp(run([["content.show", song]]), "content.follow", { action: "start" }, T0), (e) => e.status === 409);
    assert.throws(() => applyOp(t, "content.follow", { action: "dance" }, T0), LiveError);
    // Locked: the clock does not start.
    assert.throws(() => run([["content.show", { ...timed, follow: { source: "clock" } }], ["screens.lock", { locked: true }], ["content.follow", { action: "start" }]]), (e) => e.status === 423);
});

test("letra por tempo (Rodada P7): the live clock over the starts the console filled, from the slide on air", () => {
    // 8 s a slide, the third one 12 s: the console sends the starts 0, 8, 16, 28.
    const band = { title: "Banda", slides: [{ text: "um", start: 0 }, { text: "dois", start: 8 }, { text: "três", start: 16, duration: 12 }, { text: "quatro", start: 28 }] };
    let s = run([["content.show", { ...band, follow: { source: "time", each: 8, length: 36 } }]]);
    assert.deepEqual(s.content.follow, { source: "time", paused: true, offset: 0, clock: null, pausedIndex: null, each: 8, length: 36 }, "no url: it waits for Iniciar");
    assert.equal(s.content.slides[2].duration, 12);
    assert.throws(() => run([["content.show", { ...band, follow: { source: "time", each: "x" } }]]), LiveError);
    assert.equal(run([["content.show", { ...band, follow: { source: "time", each: 9999 } }]]).content.follow.each, 600);
    s = applyOp(s, "content.follow", { action: "start" }, T0);
    assert.deepEqual(s.content.follow.clock, { paused: false, position: 0, at: T0 });
    assert.equal(followIndex(s, T0 + 9 * S), 1);
    assert.equal(followIndex(s, T0 + 27 * S), 2, "the exception holds the third slide 12 s");
    assert.equal(followIndex(s, T0 + 29 * S), 3);
    // The arrows go on from the slide chosen.
    s = applyOp(s, "content.goTo", { index: 3 }, T0 + 2 * S);
    assert.equal(s.content.follow.offset, 26);
    // Started on the third slide: the clock starts at its start.
    const t = run([["content.show", { ...band, index: 2, follow: { source: "time", each: 8 } }], ["content.follow", { action: "start" }]]);
    assert.equal(t.content.follow.clock.position, 16);
    assert.equal(followIndex(t, T0 + 1 * S), 2, "never back to the first slide");
    // A song saved on air with another time keeps the running clock.
    const u = applyOp(s, "content.update", { slides: band.slides, follow: { source: "time", each: 10 } }, T0 + 3 * S);
    assert.equal(u.content.follow.each, 10);
    assert.equal(u.content.follow.clock.at, T0);
});

test("saving the song on air keeps the follow running; a restart pauses it", () => {
    let s = run([["content.show", { ...timed, follow: { source: "clock" } }], ["content.follow", { action: "start" }]]);
    const moved = { ...timed.slides[1], start: 11 };
    s = applyOp(s, "content.update", { slides: [timed.slides[0], moved, timed.slides[2], timed.slides[3]], follow: { source: "clock" } }, T0 + 5 * S);
    assert.equal(s.content.follow.paused, false);
    assert.equal(s.content.follow.clock.at, T0);
    assert.equal(s.content.slides[1].start, 11);
    // Marks gone: the follow goes.
    assert.equal(applyOp(s, "content.update", { slides: ["a", "b"] }, T0).content.follow, null);
    const back = restoreState(JSON.parse(JSON.stringify(s)), T0 + 99 * S);
    assert.equal(back.content.follow.paused, true);
    assert.equal(back.content.follow.clock.paused, true);
});

test("Escola bíblica: a slide's activity is revealed without changing slide; → walks it, ← hides it again", () => {
    const quiz = { kind: "text", title: "Quiz", slides: [
        { text: "Quem construiu a arca?", label: "Pergunta 1", activity: { kind: "choice", options: ["Moisés", "Noé", "Abraão"], correct: 1, explain: "Gênesis 6" } },
        { text: "A arca tinha três andares.", label: "Afirmação", activity: { kind: "truefalse", correct: 0 } },
        { text: "Porque Deus amou o mundo", activity: { kind: "blanks", blanks: [4, 1, 4] } },
        { text: "fim" },
    ] };
    let s = run([["content.show", quiz]]);
    assert.deepEqual(s.content.slides[0].activity, { kind: "choice", explain: "Gênesis 6", options: ["Moisés", "Noé", "Abraão"], correct: 1 });
    assert.deepEqual(s.content.slides[2].activity.blanks, [1, 4], "blanks sorted, each once");
    assert.deepEqual(s.content.revealed, {});
    assert.equal(activitySteps(s.content.slides[2]), 2);
    assert.equal(activitySteps(s.content.slides[3]), 0);
    // Revelar: same slide, the step recorded with its time.
    s = applyOp(s, "content.reveal", {}, T0 + 1);
    assert.equal(s.content.index, 0);
    assert.deepEqual(revealOf(s.content), { step: 1, at: T0 + 1 });
    assert.equal(applyOp(s, "content.reveal", {}, T0 + 2), s, "already revealed: no change");
    // → goes on once revealed; ← comes back to it revealed, then hides it.
    s = applyOp(s, "content.next", {}, T0);
    assert.equal(s.content.index, 1);
    s = applyOp(s, "content.next", {}, T0);
    assert.equal(s.content.index, 1, "→ reveals the V or F first");
    assert.equal(revealStep(s.content, 1), 1);
    s = applyOp(s, "content.next", {}, T0);
    s = applyOp(s, "content.next", {}, T0);
    assert.equal(revealStep(s.content), 1, "blanks: one word at a time");
    s = applyOp(s, "content.prev", {}, T0);
    assert.equal(revealStep(s.content), 0);
    assert.equal(s.content.index, 2);
    s = applyOp(s, "content.goTo", { index: 0 }, T0);
    assert.equal(revealStep(s.content), 1, "a question keeps what was revealed");
    s = applyOp(s, "content.prev", {}, T0);
    assert.equal(revealStep(s.content), 0, "← hides it first");
    assert.equal(s.content.index, 0);
    // By step, to a slide that is not on air, and back to nothing.
    s = applyOp(s, "content.reveal", { index: 2, step: 9 }, T0);
    assert.equal(revealStep(s.content, 2), 2, "clamped to the activity's steps");
    s = applyOp(s, "content.reveal", { index: 2, step: 0 }, T0);
    assert.equal(revealOf(s.content, 2), null);
    assert.throws(() => applyOp(applyOp(s, "content.goTo", { index: 3 }, T0), "content.reveal", {}, T0), (e) => e.status === 409);
    // A live edit keeps only what still fits.
    s = applyOp(s, "content.reveal", { index: 1 }, T0);
    const edited = applyOp(s, "content.update", { slides: quiz.slides.slice(0, 1) }, T0);
    assert.deepEqual(edited.content.revealed, {});
    // Locked: refused, like moving the slide.
    assert.throws(() => applyOp(applyOp(s, "screens.lock", { locked: true }, T0), "content.reveal", { index: 0 }, T0), (e) => e.status === 423);
    // A plain song still walks as before.
    assert.equal(applyOp(run([["content.show", song]]), "content.next", {}, T0).content.index, 1);
});

test("Escola bíblica: activities are checked", () => {
    const show = (activity) => run([["content.show", { kind: "text", slides: [{ text: "x", activity }] }]]).content.slides[0].activity;
    assert.throws(() => show({ kind: "choice", options: ["só uma"] }), LiveError);
    assert.throws(() => show({ kind: "choice", options: Array.from({ length: 9 }, (_, i) => `o${i}`) }), LiveError, "eight options at most");
    assert.equal(show({ kind: "choice", options: ["a", "b"], correct: 7 }).correct, 1);
    assert.throws(() => show({ kind: "truefalse", correct: 2 }), LiveError);
    assert.throws(() => show({ kind: "blanks", blanks: [] }), LiveError);
    assert.throws(() => show({ kind: "quiz" }), LiveError);
    assert.deepEqual(show({ kind: "memorize", order: [2, 0, 1, 0], rounds: 40 }), { kind: "memorize", order: [2, 0, 1], rounds: 12 });
    assert.deepEqual(show({ kind: "discussion", minutes: 3 }), { kind: "discussion", minutes: 3 });
    assert.equal(activitySteps({ activity: show({ kind: "memorize", order: [], rounds: 3 }) }), 3);
});

test("a presentation (Rodada F3): a PDF's pages as picture slides, walked like a song, over what was on air", () => {
    const pages = [1, 2, 3].map((n) => ({ image_url: `keryx-media://p${n}.jpg`, label: `Página ${n}` }));
    let s = run([["content.show", song], ["media.show", { kind: "image", url: "keryx-media://a.png" }]]);
    s = applyOp(s, "content.show", { kind: "presentation", title: "Missões 2026", ref: { mediaId: "m1" }, slides: pages }, T0 + 10);
    assert.equal(mainLayer(s), "content", "it takes the media off, as any item sent");
    assert.equal(s.media, null);
    assert.equal(s.content.kind, "presentation");
    assert.deepEqual(s.content.ref, { mediaId: "m1" });
    assert.deepEqual(s.content.slides[1], { text: "", image_url: "keryx-media://p2.jpg", label: "Página 2" }, "no text, the page's picture and name");
    assert.equal(s.history[0].layer, "media", "Voltar ao anterior remembers what it covered");
    s = applyOp(s, "content.next", {}, T0 + 20);
    assert.equal(currentSlide(s.content).label, "Página 2");
    assert.equal(nextSlide(s.content).image_url, "keryx-media://p3.jpg");
    s = applyOp(s, "content.prev", {}, T0 + 30);
    assert.equal(s.content.index, 0);
    assert.throws(() => applyOp(s, "content.show", { kind: "slides", slides: pages }, T0), LiveError, "unknown kinds are still refused");
});

// One sound at a time (owner 2026-10-16, Rodada F2): the console adds the
// church's transition to the ops that start a sound.
const FADE = { mode: "fade", ms: 500 };
const CUT = { mode: "cut" };
const MUSIC = { url: "keryx-media://ofertorio.mp3", title: "Ofertório" };
const CLIP = { kind: "video", url: "keryx-media://clipe.mp4", title: "Clipe" };

test("one sound at a time: a video over an audio stops the audio, fading it out", () => {
    const s = run([["audio.show", MUSIC, T0], ["video.show", { ...CLIP, transition: FADE }, T0 + 10_000]]);
    assert.equal(s.audio, null, "the music stops");
    assert.equal(s.video.url, CLIP.url);
    assert.equal(s.leaving.length, 1);
    const [e] = s.leaving;
    assert.deepEqual([e.layer, e.item.url, e.at, e.until], ["audio", MUSIC.url, T0 + 10_000, T0 + 10_500], "it rides in leaving until it is silent");
    assert.equal(e.item.playback.paused, false, "still playing while it fades");
    assert.ok(!("playlist" in e.item), "without its list");
    // The other way round: an audio over a video on the projector takes the
    // video off (into the history), and a cut leaves nothing behind.
    const v = run([["content.show", song], ["media.show", CLIP, T0], ["audio.show", { ...MUSIC, transition: CUT }, T0 + 1000]]);
    assert.equal(v.media, null);
    assert.equal(mainLayer(v), "content", "the screen shows what was under the video");
    assert.equal(v.history[0].layer, "media", "Voltar ao anterior can bring it back");
    assert.deepEqual(v.leaving, []);
    assert.equal(v.audio.url, MUSIC.url);
    // A video on the projector over a clip on the video channel.
    const both = run([["video.show", CLIP, T0], ["media.show", { kind: "youtube", url: "https://youtu.be/x", transition: CUT }, T0 + 1]]);
    assert.equal(both.video, null);
    assert.equal(both.media.kind, "youtube");
});

test("one sound at a time: a song's playback over a playing audio crossfades on the audio channel", () => {
    const s = run([["audio.playlist", { items: [MUSIC, { url: "keryx-media://b.mp3" }] }, T0], ["content.show", song, T0 + 1], ["audio.show", { kind: "audio", url: "keryx-media://playback.mp3", title: "Grande é o Senhor", transition: FADE }, T0 + 2000]]);
    assert.equal(s.audio.url, "keryx-media://playback.mp3");
    assert.deepEqual(s.leaving.map((e) => [e.layer, e.item.url, e.until]), [["audio", MUSIC.url, T0 + 2500]]);
    assert.ok(s.content, "the song stays on screen");
    const cut = run([["audio.show", MUSIC, T0], ["audio.show", { url: "keryx-media://playback.mp3", transition: CUT }, T0 + 1]]);
    assert.deepEqual(cut.leaving, [], "a cut replaces it, as before");
    const list = run([["video.show", CLIP, T0], ["audio.playlist", { items: [MUSIC], transition: FADE }, T0 + 1]]);
    assert.equal(list.video, null, "a list of audios starts with sound too");
});

test("one sound at a time: nothing is hushed by silence, by Tocar junto or by the player's swap", () => {
    const playing = run([["audio.show", MUSIC, T0]]);
    // Tocar junto (mix), or a sender that says nothing: both play, as before.
    assert.ok(applyOp(playing, "video.show", { ...CLIP, transition: { mode: "mix", ms: 500 } }, T0 + 1).audio);
    assert.ok(applyOp(playing, "video.show", CLIP, T0 + 1).audio);
    // A muted video, a video at volume 0, a picture: nothing to hear.
    const muted = applyOp(playing, "video.show", { ...CLIP, muted: true, transition: FADE }, T0 + 1);
    assert.ok(muted.audio);
    assert.equal(muted.video.playback.volume, 0);
    assert.ok(applyOp(playing, "media.show", { ...CLIP, volume: 0, transition: FADE }, T0 + 1).audio);
    assert.ok(applyOp(playing, "media.show", { kind: "image", url: "i.jpg", transition: FADE }, T0 + 1).audio, "pictures over music");
    assert.ok(applyOp(playing, "media.playlist", { items: [{ kind: "image", url: "i.jpg" }, CLIP], transition: FADE }, T0 + 1).audio, "a list counts by the item it starts with");
    // A layer at volume 0 is not heard, so it stays.
    const quiet = applyOp(run([["video.show", CLIP, T0]]), "transport", { layer: "video", action: "volume", volume: 0 }, T0);
    assert.ok(applyOp(quiet, "audio.show", { ...MUSIC, transition: FADE }, T0 + 1).video);
    // The lyrics (content.show) keep the music under them.
    const lyrics = applyOp(playing, "content.show", song, T0 + 1);
    assert.ok(lyrics.audio);
    assert.deepEqual(lyrics.leaving, []);
    // A video on the Fundo (an animated papel de parede) is muted: it never hushes.
    const fundo = applyOp(playing, "background.set", { kind: "video", value: "keryx-media://fundo.mp4" }, T0 + 1);
    assert.ok(fundo.audio);
    assert.ok(applyOp(fundo, "audio.show", { ...MUSIC, transition: CUT }, T0 + 2).background, "and is never hushed");
    // Tirar o vídeo · o som continua: the swap never hushes anything.
    const s = run([["video.show", CLIP, T0], ["media.show", { kind: "video", url: "keryx-media://v.mp4" }, T0]]);
    const swapped = applyOp(s, "media.toAudio", {}, T0 + 1000);
    assert.ok(swapped.video, "the clip on the video channel plays on");
    assert.deepEqual(swapped.leaving, []);
    const back = applyOp(swapped, "audio.toMedia", {}, T0 + 2000);
    assert.ok(back.video);
    assert.deepEqual(back.leaving, []);
});

test("one sound at a time: leaving entries go once they are over", () => {
    const s = run([["audio.show", MUSIC, T0], ["video.show", { ...CLIP, transition: FADE }, T0 + 100], ["media.show", { kind: "image", url: "i.jpg" }, T0 + 200]]);
    assert.equal(s.leaving.length, 1, "still fading");
    const later = applyOp(s, "content.show", song, T0 + 700);
    assert.deepEqual(later.leaving, [], "the next change drops what finished leaving");
    const music = run([["content.show", song], ["audio.show", MUSIC, T0]]);
    assert.throws(() => applyOp(music, "video.show", { ...CLIP, transition: { mode: "loud" } }, T0), LiveError);
    assert.throws(() => applyOp(music, "video.show", { ...CLIP, transition: "fade" }, T0), LiveError);
    assert.equal(applyOp(music, "video.show", { ...CLIP, transition: { mode: "fade", ms: 99_999 } }, T0).leaving[0].until, T0 + 5000, "the fade is clamped");
    // Nothing of it survives a restart.
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(s)), T0 + 9999).leaving, []);
});

// Rodada G3 (owner 2026-10-17): Esc and Parar stop the player's music too,
// on the same fade as the screens; pausing and playing again fade (a ramp).
test("Esc stops the music, paused or not, fading it out with the screens", () => {
    const music = run([["content.show", song], ["audio.show", MUSIC, T0]]);
    const end = applyOp(music, "clear", { fade: 300 }, T0 + 1000);
    assert.equal(end.audio, null, "the music stops");
    assert.deepEqual(end.fade, { ms: 300, at: T0 + 1000 }, "Esc needs nothing new: the music rides the screens' fade");
    assert.deepEqual(end.leaving.map((e) => [e.layer, e.item.url, e.at, e.until, e.item.playback.paused]), [["audio", MUSIC.url, T0 + 1000, T0 + 1300, false]], "it fades out with the picture");
    // A cut, music already paused, a silent track: it just goes.
    assert.deepEqual(applyOp(music, "clear", {}, T0 + 1000).leaving, [], "Corte: no fade");
    const paused = applyOp(music, "transport", { layer: "audio", action: "pause" }, T0 + 500);
    const pausedEnd = applyOp(paused, "clear", { fade: 300 }, T0 + 1000);
    assert.equal(pausedEnd.audio, null, "paused music stops too");
    assert.deepEqual(pausedEnd.leaving, [], "nothing to hear, nothing leaves");
    const silent = applyOp(music, "transport", { layer: "audio", action: "volume", volume: 0 }, T0 + 500);
    assert.deepEqual(applyOp(silent, "clear", { fade: 300 }, T0 + 1000).leaving, []);
    // Only music: Esc still ends it.
    assert.equal(applyOp(run([["audio.show", MUSIC, T0]]), "clear", { fade: 300 }, T0 + 1).audio, null);
    // A second Esc has no music to stop: the first one's fade goes on alone.
    assert.equal(applyOp(end, "clear", { fade: 300 }, T0 + 1100).leaving.length, 1);
});

test("Parar: audio.clear, media.clear and video.clear take the exit fade", () => {
    const music = run([["audio.show", MUSIC, T0]]);
    const stop = applyOp(music, "audio.clear", { fade: 600 }, T0 + 1000);
    assert.equal(stop.audio, null);
    assert.deepEqual(stop.leaving.map((e) => [e.layer, e.until]), [["audio", T0 + 1600]]);
    assert.equal(stop.fade, null, "the screens have nothing new to fade");
    assert.deepEqual(applyOp(music, "audio.clear", {}, T0 + 1000).leaving, [], "a cut");
    const media = run([["content.show", song], ["media.show", CLIP, T0]]);
    const off = applyOp(media, "media.clear", { fade: 300 }, T0 + 50);
    assert.deepEqual([off.media, off.fade], [null, { ms: 300, at: T0 + 50 }]);
    assert.equal(off.history[0].layer, "media");
    assert.equal(applyOp(media, "media.clear", {}, T0 + 50).fade, null);
    const clip = run([["video.show", CLIP, T0]]);
    assert.deepEqual(applyOp(clip, "video.clear", { fade: 99_999 }, T0 + 50).fade, { ms: 3000, at: T0 + 50 }, "clamped");
    // They work locked, as anything that comes off the air.
    assert.equal(applyOp(applyOp(music, "screens.lock", { locked: true }, T0), "audio.clear", { fade: 300 }, T0 + 1).audio, null);
});

test("Anterior / Próximo: with a fade the track that stops fades out, nothing else is hushed", () => {
    const list = run([["video.show", CLIP, T0], ["audio.playlist", { items: [MUSIC, { url: "keryx-media://b.mp3" }] }, T0]]);
    const next = applyOp(list, "playlist.goTo", { layer: "audio", index: 1, transition: FADE }, T0 + 1000);
    assert.equal(next.audio.url, "keryx-media://b.mp3");
    assert.deepEqual(next.leaving.map((e) => [e.layer, e.item.url, e.until]), [["audio", MUSIC.url, T0 + 1500]]);
    assert.ok(next.video, "the clip on the video channel plays on");
    assert.deepEqual(applyOp(list, "playlist.goTo", { layer: "audio", index: 1, transition: CUT }, T0 + 1000).leaving, []);
    assert.deepEqual(applyOp(list, "playlist.goTo", { layer: "audio", index: 1 }, T0 + 1000).leaving, [], "no transition: a cut, as before");
});

test("transport: pausing and playing again fade (playback.ramp), from where the sound is", () => {
    const s = run([["audio.show", MUSIC, T0]]);
    const pause = applyOp(s, "transport", { layer: "audio", action: "pause", fade: 200 }, T0 + 10_000);
    assert.deepEqual(pause.audio.playback, { paused: true, position: 10, at: T0 + 10_000, volume: 1, ramp: { at: T0 + 10_000, ms: 200, from: 1, to: 0 } });
    assert.equal(playbackGain(pause.audio.playback, T0 + 10_100), 0.5, "halfway down");
    assert.equal(playbackGain(pause.audio.playback, T0 + 10_400), 0, "silent once it is over");
    // Played again inside the fade: it rises from the level it reached, and
    // goes on from where the sound got to (it played on while fading).
    const play = applyOp(pause, "transport", { layer: "audio", action: "play", fade: 200 }, T0 + 10_050);
    assert.deepEqual(play.audio.playback, { paused: false, position: 10.05, at: T0 + 10_050, volume: 1, ramp: { at: T0 + 10_050, ms: 200, from: 0.75, to: 1 } });
    assert.equal(playbackGain(play.audio.playback, T0 + 10_150), 0.875);
    // A pause that finished fading: play rises from 0, past the tail.
    const late = applyOp(pause, "transport", { layer: "audio", action: "play", fade: 200 }, T0 + 20_000);
    assert.deepEqual([late.audio.playback.position, late.audio.playback.ramp.from], [10.2, 0]);
    // Rapid toggle: each ramp starts where the last one was.
    const again = applyOp(play, "transport", { layer: "audio", action: "pause", fade: 200 }, T0 + 10_100);
    assert.equal(again.audio.playback.ramp.from, 0.8125);
    // A volume change and a seek while playing keep the ramp; a paused seek drops it.
    assert.deepEqual(applyOp(play, "transport", { layer: "audio", action: "volume", volume: 0.5 }, T0 + 10_060).audio.playback.ramp, play.audio.playback.ramp);
    const seek = applyOp(play, "transport", { layer: "audio", action: "seek", time: 60 }, T0 + 10_060);
    assert.deepEqual([seek.audio.playback.position, seek.audio.playback.ramp], [60, play.audio.playback.ramp]);
    assert.equal(applyOp(pause, "transport", { layer: "audio", action: "seek", time: 30 }, T0 + 20_000).audio.playback.ramp, undefined);
    // Corte: no ramp, and a cut drops one still running.
    assert.equal(applyOp(s, "transport", { layer: "audio", action: "pause" }, T0 + 1).audio.playback.ramp, undefined);
    assert.equal(applyOp(pause, "transport", { layer: "audio", action: "play" }, T0 + 10_050).audio.playback.ramp, undefined);
    // Clamped like the exit fade; a restart, a new item and the eye drop it.
    assert.equal(applyOp(s, "transport", { layer: "audio", action: "pause", fade: 99_999 }, T0 + 1).audio.playback.ramp.ms, 3000);
    assert.equal(restoreState(JSON.parse(JSON.stringify(pause)), T0 + 99_999).audio.playback.ramp, undefined);
    assert.equal(applyOp(pause, "audio.show", MUSIC, T0 + 11_000).audio.playback.ramp, undefined);
    const video = run([["content.show", song], ["media.show", CLIP, T0]]);
    assert.equal(applyOp(video, "transport", { layer: "media", action: "play", fade: 200 }, T0), video, "playing already: no change");
    const v = applyOp(applyOp(video, "transport", { layer: "media", action: "pause", fade: 200 }, T0 + 1000), "media.toAudio", {}, T0 + 1100);
    assert.equal(v.audio.playback.ramp, undefined, "the eye carries no ramp");
});

test("playbackPlan: the ramp scales the volume, and a pause waits for its fade", () => {
    const el = (o) => ({ currentTime: 10, paused: false, ended: false, duration: 120, ...o });
    const pb = { paused: true, position: 10, at: T0, volume: 0.8, ramp: { at: T0, ms: 200, from: 1, to: 0 } };
    assert.deepEqual(playbackPlan(el({ currentTime: 10.1 }), pb, T0 + 100), { volume: 0.4 }, "still fading: no pause yet");
    assert.deepEqual(playbackPlan(el({ currentTime: 10.2 }), pb, T0 + 200), { volume: 0, pause: true }, "the end of the fade pauses it");
    assert.deepEqual(playbackPlan(el({ paused: true }), pb, T0 + 100), { volume: 0.4 }, "a window opened mid-fade does not start the tail");
    const up = { paused: false, position: 10, at: T0, volume: 1, ramp: { at: T0, ms: 200, from: 0, to: 1 } };
    assert.deepEqual(playbackPlan(el({ paused: true }), up, T0 + 50), { volume: 0.25, play: true });
    assert.equal(playbackGain({ paused: false, position: 0, at: T0, volume: 1 }, T0), 1, "no ramp: full");
});

test("audio.show: where and how it starts (position, paused, a fade-in), and the same file stops leaving", () => {
    const back = applyOp(emptyState(T0), "audio.show", { ...MUSIC, position: 72.5, fadeIn: 200, volume: 0.6 }, T0 + 1000);
    assert.deepEqual(back.audio.playback, { paused: false, position: 72.5, at: T0 + 1000, volume: 0.6, ramp: { at: T0 + 1000, ms: 200, from: 0, to: 1 } });
    const paused = applyOp(emptyState(T0), "audio.show", { ...MUSIC, position: 30, paused: true, fadeIn: 200 }, T0);
    assert.deepEqual(paused.audio.playback, { paused: true, position: 30, at: T0, volume: 1 }, "paused stays paused, no ramp");
    assert.deepEqual(applyOp(emptyState(T0), "audio.playlist", { items: [MUSIC], position: 5, fadeIn: 200 }, T0).audio.playback.ramp, { at: T0, ms: 200, from: 0, to: 1 });
    assert.deepEqual(applyOp(emptyState(T0), "audio.show", MUSIC, T0).audio.playback, { paused: false, position: 0, at: T0, volume: 1 }, "nothing asked: from the top");
    assert.equal(applyOp(emptyState(T0), "audio.show", { ...MUSIC, fadeIn: true }, T0).audio.playback.ramp, undefined, "fadeIn is ms (the console turns true into the pref)");
    assert.throws(() => applyOp(emptyState(T0), "audio.show", { ...MUSIC, position: -1 }, T0), LiveError);
    // Desfazer inside Esc's fade: the leaving copy goes, the music is back.
    const ended = applyOp(run([["audio.show", MUSIC, T0]]), "clear", { fade: 600 }, T0 + 10_000);
    assert.equal(ended.leaving.length, 1);
    const undone = applyOp(ended, "audio.show", { ...MUSIC, position: 10, fadeIn: 200, transition: { mode: "mix" } }, T0 + 10_100);
    assert.deepEqual(undone.leaving, [], "the same file stops leaving");
    assert.equal(undone.audio.playback.position, 10);
});

test("the exit fade: Esc, Limpar, Tela preta and Logo carry how long what leaves fades out", () => {
    const s = run([["content.show", song], ["tool.show", { mode: "clock" }, T0]]);
    const esc = applyOp(s, "clear", { fade: 300 }, T0 + 50);
    assert.deepEqual(esc.fade, { ms: 300, at: T0 + 50 }, "at = the change's updatedAt");
    assert.equal(esc.updatedAt, esc.fade.at);
    assert.equal(applyOp(s, "clear", {}, T0 + 50).fade, null, "no fade: a cut");
    assert.equal(applyOp(s, "clear", { fade: 0 }, T0 + 50).fade, null);
    assert.equal(applyOp(s, "clear", { fade: 9999 }, T0).fade.ms, 3000, "clamped");
    assert.throws(() => applyOp(s, "clear", { fade: "suave" }, T0), LiveError);
    // The single-layer clears each say how their layer goes.
    const tool = applyOp(s, "tool.clear", { fade: 600 }, T0 + 1);
    assert.deepEqual(tool.fade, { ms: 600, at: T0 + 1 });
    assert.deepEqual(applyOp(tool, "content.clear", { fade: 600 }, T0 + 2).fade, { ms: 600, at: T0 + 2 });
    const notice = run([["communication.show", { item: { type: "announcement", text: "Bem-vindos" } }]]);
    assert.deepEqual(applyOp(notice, "communication.clear", { fade: 1000 }, T0 + 3).fade, { ms: 1000, at: T0 + 3 });
    assert.equal(applyOp(tool, "tool.clear", { fade: 600 }, T0 + 4), tool, "nothing to take off: no change");
    // Tela preta and Logo, in and out.
    const black = applyOp(s, "screen.set", { mode: "black", fade: 300 }, T0 + 5);
    assert.deepEqual([black.screen, black.fade], ["black", { ms: 300, at: T0 + 5 }]);
    assert.equal(applyOp(black, "screen.set", { mode: "show" }, T0 + 6).fade, null);
    // Locked, Esc and Tela preta still work, with their fade.
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(applyOp(locked, "clear", { fade: 300 }, T0 + 7).fade.ms, 300);
    assert.equal(restoreState(JSON.parse(JSON.stringify(esc)), T0 + 9999).fade, null);
});

test("Limpar (text.clear): timer, aviso and text go in one change with one fade; history as three clears", () => {
    const notice = { item: { type: "announcement", text: "Bem-vindos" } };
    const s = run([["content.show", song], ["communication.show", notice, T0 + 1], ["tool.show", { mode: "clock" }, T0 + 2]]);
    const lim = applyOp(s, "text.clear", { fade: 300 }, T0 + 10);
    assert.equal(lim.rev, s.rev + 1, "one change, so an output fades once from what was on screen");
    assert.deepEqual([lim.tool, lim.communication, lim.content], [null, null, null]);
    assert.deepEqual(lim.fade, { ms: 300, at: T0 + 10 });
    // The history the three clears in a row would keep.
    const three = run([["tool.clear", {}, T0 + 10], ["communication.clear", {}, T0 + 10], ["content.clear", {}, T0 + 10]], s);
    assert.deepEqual(lim.history, three.history);
    // What stays: the Fundo, the media, the logo, the audio channel.
    const withMedia = run([["media.show", { kind: "image", url: "https://x/a.jpg" }, T0 + 3], ["communication.show", notice, T0 + 4]]);
    const kept = applyOp(withMedia, "text.clear", {}, T0 + 11);
    assert.deepEqual([kept.media?.url, kept.communication], ["https://x/a.jpg", null]);
    // Only what is there goes; nothing there: no change.
    const onlyText = run([["content.show", song]]);
    assert.equal(applyOp(onlyText, "text.clear", {}, T0 + 12).content, null);
    const empty = emptyState(T0);
    assert.equal(applyOp(empty, "text.clear", { fade: 300 }, T0), empty);
    // Locked, it still works (taking things off the air).
    assert.ok(WHILE_LOCKED.has("text.clear"));
    const locked = applyOp(s, "screens.lock", { locked: true }, T0);
    assert.equal(applyOp(locked, "text.clear", {}, T0 + 13).content, null);
});

// Rodada G5 (owner 2026-10-17): Ao entrar ou trocar. Every op that puts
// something new on the screens, or replaces it, keeps its `fade` as
// live.fade, checked like the exit's; moving the slide never fades.
test("enter fade (Rodada G5): each show op stores and clamps its fade; locked is refused", () => {
    const base = run([["content.show", song]]);
    const shows = [
        ["content.show", { ...song, title: "Outra" }],
        ["media.show", { kind: "image", url: "keryx-media://i.jpg" }],
        ["media.playlist", { items: [{ kind: "image", url: "keryx-media://a.jpg" }, { kind: "image", url: "keryx-media://b.jpg" }] }],
        ["video.show", CLIP],
        ["tool.show", { mode: "clock" }],
        ["communication.show", { item: { title: "Aviso" } }],
    ];
    for (const [op, args] of shows) {
        const s = applyOp(base, op, { ...args, fade: 500 }, T0 + 100);
        assert.deepEqual(s.fade, { ms: 500, at: T0 + 100 }, op);
        assert.equal(applyOp(base, op, args, T0 + 100).fade, null, `${op}: Corte`);
        assert.equal(applyOp(base, op, { ...args, fade: 9999 }, T0 + 100).fade.ms, 3000, `${op}: clamped`);
        assert.equal(applyOp(base, op, { ...args, fade: 10 }, T0 + 100).fade.ms, 50, `${op}: clamped`);
        assert.throws(() => applyOp(base, op, { ...args, fade: "suave" }, T0 + 100), LiveError, op);
        const locked = applyOp(base, "screens.lock", { locked: true }, T0 + 50);
        assert.throws(() => applyOp(locked, op, { ...args, fade: 500 }, T0 + 100), (e) => e.status === 423, `${op}: locked`);
    }
    // The outputs move a list on with the fade, locked too (they always could).
    const list = applyOp(run([["media.playlist", { items: [{ kind: "image", url: "keryx-media://a.jpg" }, { kind: "image", url: "keryx-media://b.jpg" }] }]]), "screens.lock", { locked: true }, T0 + 1);
    assert.deepEqual(applyOp(list, "media.advance", { fromIndex: 0, fade: 400 }, T0 + 10).fade, { ms: 400, at: T0 + 10 });
    assert.equal(applyOp(list, "media.advance", { fromIndex: 0 }, T0 + 10).fade, null);
    const notices = applyOp(run([["communication.show", { playlist: [{ title: "A" }, { title: "B" }] }]]), "screens.lock", { locked: true }, T0 + 1);
    assert.deepEqual(applyOp(notices, "communication.advance", { fromIndex: 0, fade: 500 }, T0 + 10).fade, { ms: 500, at: T0 + 10 });
    // Moving the slide keeps the fade of the change that sent it: an output
    // knows it is not its own (at ≠ updatedAt).
    const sent = applyOp(base, "content.show", { ...song, fade: 500 }, T0 + 100);
    const moved = applyOp(sent, "content.goTo", { index: 2, fade: 500 }, T0 + 200);
    assert.deepEqual(moved.fade, { ms: 500, at: T0 + 100 }, "goTo takes no fade");
});

// Setlist automática (Rodada N2): `ended` says a medium reached its end by
// itself, as an output reported it — never Esc, Limpar or Parar.
test("ended: a medium that played out is marked, a medium taken off is not", () => {
    assert.equal(emptyState(T0).ended, null);
    const clip = { ...CLIP, id: "m1" };
    const media = run([["media.show", clip, T0]]);
    const out = applyOp(media, "media.clear", { ended: true, fade: 300 }, T0 + 50);
    assert.deepEqual(out.ended, { layer: "media", id: "m1", url: clip.url, at: T0 + 50 });
    assert.equal(applyOp(media, "media.clear", { fade: 300 }, T0 + 50).ended, null, "Parar");
    assert.equal(applyOp(media, "clear", {}, T0 + 50).ended, null, "Esc");
    const video = applyOp(run([["video.show", clip, T0]]), "video.clear", { ended: true }, T0 + 9);
    assert.equal(video.ended.layer, "video");
    // A list: past its last item (back to the first), not on the way.
    const list = run([["media.playlist", { items: [{ kind: "image", url: "keryx-media://a.jpg", id: "a" }, { kind: "image", url: "keryx-media://b.jpg", id: "b" }] }, T0]]);
    const second = applyOp(list, "media.advance", { fromIndex: 0 }, T0 + 1);
    assert.equal(second.ended, null);
    assert.deepEqual(applyOp(second, "media.advance", { fromIndex: 1 }, T0 + 2).ended, { layer: "media", id: "b", url: "keryx-media://b.jpg", at: T0 + 2 });
    // Music: a list stops at its end; a single file stays where it is, marked.
    const tracks = run([["audio.playlist", { items: [MUSIC] }, T0]]);
    assert.equal(applyOp(tracks, "audio.advance", { fromIndex: 0 }, T0 + 3).ended.layer, "audio");
    const one = run([["audio.show", MUSIC, T0]]);
    const played = applyOp(one, "audio.ended", { url: MUSIC.url }, T0 + 4);
    assert.deepEqual([played.audio, played.ended.layer, played.ended.at], [one.audio, "audio", T0 + 4]);
    assert.equal(applyOp(played, "audio.ended", { url: MUSIC.url }, T0 + 5), played, "a second report changes nothing");
    assert.equal(applyOp(one, "audio.ended", { url: "keryx-media://other.mp3" }, T0 + 4), one, "another file");
    assert.equal(applyOp(tracks, "audio.ended", { url: MUSIC.url }, T0 + 4), tracks, "a list ends by audio.advance");
    // It works locked: it puts nothing on air.
    assert.ok(WHILE_LOCKED.has("audio.ended"));
    assert.equal(applyOp(applyOp(one, "screens.lock", { locked: true }, T0), "audio.ended", { url: MUSIC.url }, T0 + 4).ended.layer, "audio");
});
