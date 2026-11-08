import { test } from "node:test";
import assert from "node:assert/strict";
import { mainLayer, applyOp, emptyState } from "../../../shared/live-state.mjs";
import { lyricView, standbyView, noticeView, nextItems, previewSession, RAIL_VIEWS } from "./views.js";
import { screenExitMs } from "../exitFade.js";

const song = { title: "Hino", slides: [{ text: "a" }], index: 0 };
const media = { kind: "image", url: "x.png", title: "Foto" };

test("lyricView keeps the slides and drops media, avisos and tools", () => {
    const v = lyricView({ screen: "show", content: song, media, communication: { item: {} }, tool: { mode: "clock" } });
    assert.equal(mainLayer(v), "content");
    assert.equal(v.media, null);
    assert.equal(mainLayer(lyricView({ screen: "show", media })), "none");
    assert.equal(mainLayer(lyricView({ screen: "black", content: song })), "black");
    assert.equal(lyricView(null), null);
    // A PDF's pages go where pictures go, not to Letras (Rodada F3).
    const pres = { kind: "presentation", title: "Missões", slides: [{ text: "", image_url: "p1.jpg" }], index: 0 };
    assert.equal(mainLayer(lyricView({ screen: "show", content: pres })), "none");
});

test("standbyView shows the idle look, black only under Tela preta", () => {
    assert.equal(mainLayer(standbyView({ screen: "show", content: song, media })), "none");
    assert.equal(mainLayer(standbyView({ screen: "logo", content: song })), "none");
    assert.equal(mainLayer(standbyView({ screen: "black", content: song })), "black");
    assert.deepEqual(standbyView({ screen: "show", overlays: [{ id: 1 }] }).overlays, []);
});

test("nextItems: the items after the one on air, by id, else by position", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    assert.deepEqual(nextItems(items, { itemId: "b" }).map((i) => i.id), ["c", "d"]);
    assert.deepEqual(nextItems(items, { itemIndex: 0 }, 2).map((i) => i.id), ["b", "c"]);
    assert.deepEqual(nextItems(items, { itemId: "gone", itemIndex: 2 }).map((i) => i.id), ["d"]);
    assert.deepEqual(nextItems(items, { serviceId: "s" }).map((i) => i.id), ["a", "b", "c"]);
    assert.deepEqual(nextItems(items, null), []);
});

test("outputView: each output's view of a stage, for the Prévia rail", async () => {
    const { outputView, OUTPUT_VIEWS } = await import("./views.js");
    const clip = { kind: "video", url: "clip.mp4", title: "Clipe" };
    const notice = { item: { title: "Aviso" } };
    const live = { screen: "show", content: song, media, video: clip, communication: notice, idle: "logo" };
    assert.deepEqual(OUTPUT_VIEWS.map((o) => o.name), ["Projeção", "Letras", "Vídeo", "Avisos"]);
    assert.equal(outputView("/Projection", live), live, "the projector shows everything");
    assert.equal(outputView("/LyricProjection", live).media, null);
    assert.equal(outputView("/VideoProjection", live).video, clip);
    assert.equal(outputView("/VideoProjection", live).content, undefined, "only the clip");
    assert.equal(mainLayer(outputView("/VideoProjection", { screen: "show", content: song })), "none", "no clip: the idle look");
    assert.deepEqual(outputView("/CommunicationProjection", live), { screen: "show", communication: notice });
    assert.equal(outputView("/CommunicationProjection", { screen: "show", content: song }), null, "no aviso: nothing");
    assert.equal(outputView("/Nope", live), live, "unknown: the projector");
});

test("every output's view keeps the Aviso rápido (Rodada E3: one bar on every screen)", async () => {
    const { outputView } = await import("./views.js");
    const clip = { kind: "video", url: "clip.mp4", title: "Clipe" };
    const notice = { item: { title: "Aviso" } };
    const alert = { message: "Carro ABC-1234", type: "message", since: 1 };
    const live = { screen: "show", content: song, video: clip, communication: notice, alert };
    for (const key of ["/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection"]) assert.equal(outputView(key, live).alert, alert, key);
    assert.equal(outputView("/VideoProjection", { screen: "show", content: song, alert }).alert, alert, "Vídeo waiting: the bar over the idle look");
    assert.deepEqual(outputView("/CommunicationProjection", live), { screen: "show", communication: notice, alert });
    // No aviso on air: Comunicação draws the bar alone (over its idle look).
    const only = outputView("/CommunicationProjection", { screen: "show", content: song, alert });
    assert.deepEqual(only, { screen: "show", alert });
    assert.equal(mainLayer(only), "none");
});

test("previewSession: the pastor's Próximo follows the prepared Setlist item", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const live = { startedAt: 5, serviceId: "s", itemId: "a" };
    assert.deepEqual(nextItems(items, previewSession(live, { serviceItemId: "c", serviceItemIndex: 2 })).map((i) => i.id), ["d"]);
    assert.equal(previewSession(live, { serviceItemId: "c" }).startedAt, 5, "the service keeps its clock");
    assert.equal(previewSession(live, {}), live, "a library item: what is on air stays the reference");
    assert.deepEqual(previewSession(null, { serviceItemId: "b" }), { itemId: "b", itemIndex: null }, "nothing started yet");
    assert.equal(previewSession(null, {}), null);
    assert.deepEqual(RAIL_VIEWS.map((v) => v.name), ["Projeção", "Letras", "Vídeo", "Avisos", "Palco", "Pastor"]);
});

// Rodada G5: the Avisos screen fades from one aviso of a list to the next,
// as the projector does: its view carries the change (rev, updatedAt, fade).
test("noticeView carries the change, so the Avisos screen fades", () => {
    const T0 = 1_000_000;
    const on = applyOp(emptyState(T0), "communication.show", { playlist: [{ title: "A" }, { title: "B" }] }, T0);
    const next = applyOp(on, "communication.advance", { fromIndex: 0, fade: 500 }, T0 + 10);
    const [a, b] = [noticeView(on), noticeView(next)];
    assert.deepEqual([b.rev, b.updatedAt, b.fade], [next.rev, next.updatedAt, { ms: 500, at: T0 + 10 }]);
    assert.equal(screenExitMs(a, b), 500);
    assert.equal(noticeView(applyOp(on, "communication.clear", {}, T0 + 10)), null, "nothing on air: nothing");
    assert.equal(noticeView({ ...emptyState(T0), alert: { message: "x" } }).rev, 0);
});
