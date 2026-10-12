import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGenerator, GENERATOR_IDS, GENERATOR_PARAMS, PARAM_IDS, DEFAULT_COLORS } from "./generators.mjs";

test("normalizeGenerator: defaults, clamps, colours", () => {
    const d = normalizeGenerator();
    assert.equal(d.id, "fluid");
    for (const k of PARAM_IDS) assert.equal(d[k], GENERATOR_PARAMS[k][2], k);
    assert.deepEqual(d.colors, DEFAULT_COLORS);
    assert.equal(d.audio, false);
    const g = normalizeGenerator({ id: "clouds", speed: 99, scale: "x", detail: 3.7, contrast: -1, colors: ["#ABCDEF", "red", "#000000", "#111111", "#222222"], audio: true });
    assert.equal(g.id, "clouds"); assert.equal(g.speed, 2); assert.equal(g.scale, 3); assert.equal(g.detail, 4); assert.equal(g.contrast, 0);
    assert.deepEqual(g.colors, ["#abcdef", "#000000", "#111111"]);
    assert.equal(g.audio, true);
    assert.equal(normalizeGenerator({ audio: "yes" }).audio, false, "only a real true");
    assert.equal(normalizeGenerator({ id: "nope" }).id, "fluid");
    assert.equal(normalizeGenerator("junk").id, "fluid");
    assert.equal(GENERATOR_IDS.length, 5);
});
