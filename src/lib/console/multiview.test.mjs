import test from "node:test";
import assert from "node:assert/strict";
import { MV_PAGES, DEFAULT_TILES, normalizeTiles, pickTile, tileStatus, motionTile } from "./multiview.js";

test("four known outputs by default, all of them pickable", () => {
    assert.equal(DEFAULT_TILES.length, 4);
    assert.ok(DEFAULT_TILES.every((p) => MV_PAGES.includes(p)));
    assert.deepEqual(MV_PAGES, ["/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection", "/StageView", "/PastorView"]);
});

test("a saved list keeps what it can and fills the rest, never twice", () => {
    assert.deepEqual(normalizeTiles(null), DEFAULT_TILES);
    assert.deepEqual(normalizeTiles("x"), DEFAULT_TILES);
    assert.deepEqual(normalizeTiles(["/PastorView", "/Nope", "/PastorView", "/VideoProjection"]),
        ["/PastorView", "/VideoProjection", "/Projection", "/LyricProjection"]);
    assert.deepEqual(normalizeTiles(["/StageView", "/PastorView", "/VideoProjection", "/LyricProjection", "/Projection"]),
        ["/StageView", "/PastorView", "/VideoProjection", "/LyricProjection"]);
});

test("picking an output shown elsewhere swaps the two quadrants", () => {
    const t = DEFAULT_TILES; // Projeção, Letras, Palco, Avisos
    assert.deepEqual(pickTile(t, 1, "/PastorView"), ["/Projection", "/PastorView", "/StageView", "/CommunicationProjection"]);
    assert.deepEqual(pickTile(t, 0, "/StageView"), ["/StageView", "/LyricProjection", "/Projection", "/CommunicationProjection"]);
    assert.deepEqual(pickTile(t, 0, "/Projection"), t);
    assert.deepEqual(pickTile(t, 7, "/PastorView"), t);
    assert.deepEqual(pickTile(t, 1, "/Nope"), t);
});

test("where each output is on screen now: problems first, nothing open said plainly", () => {
    const rows = [
        { local: true, key: "/Projection", state: "connected", problem: false },
        { local: false, screen: "/Projection", state: "connected", problem: false },
        { local: true, key: "/StageView", state: "closed", problem: true },
        { local: false, screen: "/StageView", state: "connected", problem: false },
        { local: true, key: "/LyricProjection", state: "unused", problem: false },
        { local: true, key: "/VideoProjection", state: "reconnecting", problem: true },
    ];
    assert.deepEqual(tileStatus("/Projection", rows), { text: "em 2 telas", state: "" });
    assert.deepEqual(tileStatus("/StageView", rows), { text: "1 com problema", state: "warn" });
    assert.deepEqual(tileStatus("/LyricProjection", rows), { text: "sem tela aberta", state: "idle" });
    assert.deepEqual(tileStatus("/VideoProjection", rows), { text: "1 com problema", state: "warn" });
    assert.deepEqual(tileStatus("/PastorView", []), { text: "sem tela aberta", state: "idle" });
    assert.deepEqual(tileStatus("/Projection", [rows[0]]), { text: "em 1 tela", state: "" });
});

test("one quadrant plays videos: Projeção, else Vídeo", () => {
    assert.equal(motionTile(DEFAULT_TILES), 0);
    assert.equal(motionTile(["/StageView", "/VideoProjection", "/PastorView", "/LyricProjection"]), 1);
    assert.equal(motionTile(["/StageView", "/PastorView", "/LyricProjection", "/CommunicationProjection"]), -1);
});
