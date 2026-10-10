import { test } from "node:test";
import assert from "node:assert/strict";
import { mainLayer } from "../../../shared/live-state.mjs";
import { lyricView, standbyView, nextItems } from "./views.js";

const song = { title: "Hino", slides: [{ text: "a" }], index: 0 };
const media = { kind: "image", url: "x.png", title: "Foto" };

test("lyricView keeps the slides and drops media, avisos and tools", () => {
    const v = lyricView({ screen: "show", content: song, media, communication: { item: {} }, tool: { mode: "clock" } });
    assert.equal(mainLayer(v), "content");
    assert.equal(v.media, null);
    assert.equal(mainLayer(lyricView({ screen: "show", media })), "none");
    assert.equal(mainLayer(lyricView({ screen: "black", content: song })), "black");
    assert.equal(lyricView(null), null);
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
