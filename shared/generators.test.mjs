import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGenerator, GENERATOR_IDS, GENERATOR_PARAMS, PARAM_IDS, DEFAULT_COLORS, BLENDS, BLEND_POS, BLEND_WIDTH } from "./generators.mjs";
import { cssFallback } from "../src/lib/generatorLook.js";

test("normalizeGenerator: defaults, clamps, colours", () => {
    const d = normalizeGenerator();
    assert.equal(d.id, "fluid");
    for (const k of PARAM_IDS) assert.equal(d[k], GENERATOR_PARAMS[k][2], k);
    assert.deepEqual(d.colors, DEFAULT_COLORS);
    assert.equal(d.audio, false);
    const g = normalizeGenerator({ id: "mist", speed: 99, scale: "x", detail: 3.7, contrast: -1, colors: ["#ABCDEF", "red", "#000000", "#111111", "#222222", "#333333", "#444444"], audio: true });
    assert.equal(g.id, "mist"); assert.equal(g.speed, 2); assert.equal(g.scale, 3); assert.equal(g.detail, 4); assert.equal(g.contrast, 0);
    assert.deepEqual(g.colors, ["#abcdef", "#000000", "#111111", "#222222", "#333333"], "up to five");
    assert.equal(g.audio, true);
    assert.equal(normalizeGenerator({ audio: "yes" }).audio, false, "only a real true");
    assert.equal(normalizeGenerator({ id: "nope" }).id, "fluid");
    assert.equal(normalizeGenerator("junk").id, "fluid");
    assert.equal(GENERATOR_IDS.length, 25);
    assert.equal(new Set(GENERATOR_IDS).size, GENERATOR_IDS.length);
});

test("normalizeGenerator: the degradê is there only with colours", () => {
    const plain = normalizeGenerator({ id: "fluid", colors: ["#3f0000", "#ff7600", "#5b0000"] });
    assert.deepEqual(Object.keys(plain).sort(), ["audio", "colors", "contrast", "detail", "id", "intensity", "persistence", "scale", "spacing", "speed"], "a generator of before keeps its shape");
    assert.equal(normalizeGenerator({ colors2: [], blend: "v" }).blend, undefined);
    assert.equal(normalizeGenerator({ colors2: ["nope"] }).colors2, undefined);
    const d = normalizeGenerator({ id: "tunnel", colors2: ["#AA0000", "#00bb00"], blend: "move" });
    assert.deepEqual(d.colors2, ["#aa0000", "#00bb00"]);
    assert.equal(d.blend, "move");
    assert.equal(normalizeGenerator({ colors2: ["#000000"], blend: "sideways" }).blend, BLENDS[0]);
    assert.equal(normalizeGenerator({ colors2: Array(8).fill("#101010") }).colors2.length, 5);
});

test("cssFallback: the colours, the degradê in its direction", () => {
    assert.equal(cssFallback({ colors: ["#3f0000", "#ff7600", "#5b0000"] }), "linear-gradient(160deg, #3f0000, #ff7600, #5b0000)");
    assert.equal(cssFallback(null), "linear-gradient(160deg, #000)");
    assert.equal(cssFallback({ colors: ["#000000", "#111111", "#222222"], colors2: ["#aaaaaa", "#bbbbbb"], blend: "v" }), "linear-gradient(180deg, #111111, #bbbbbb)");
});

test("degradê: Posição e Largura ride only with colors2; absent = the look of before (owner 2026-11-12, G4)", () => {
    const none = normalizeGenerator({ id: "columns", colors: ["#112233"] });
    assert.equal("blendPos" in none, false);
    assert.equal("blendWidth" in none, false);
    const d = normalizeGenerator({ id: "columns", colors: ["#112233"], colors2: ["#445566"] });
    assert.equal(d.blendPos, BLEND_POS[2]);
    assert.equal(d.blendWidth, BLEND_WIDTH[2]);
    const g = normalizeGenerator({ id: "columns", colors: ["#112233"], colors2: ["#445566"], blendPos: 0.321, blendWidth: 2 });
    assert.equal(g.blendPos, 0.32);
    assert.equal(g.blendWidth, 1);
    assert.equal(normalizeGenerator({ id: "columns", colors: ["#112233"], colors2: ["#445566"], blendPos: -3, blendWidth: 0 }).blendPos, 0);
    assert.equal(normalizeGenerator({ id: "columns", colors: ["#112233"], colors2: ["#445566"], blendWidth: 0 }).blendWidth, BLEND_WIDTH[0]);
    assert.deepEqual([BLEND_POS[2], BLEND_WIDTH[2]], [0.5, 0.8], "the smoothstep(0.1, 0.9) of before");
});
