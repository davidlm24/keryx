import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERATORS, GENERATOR_IDS, PARAM_IDS, PARAM_LABELS, PRESETS, presetsOf, fragmentSource, startArgs, matchingPreset, cssFallback, generatorOf } from "./generators.js";

test("every generator has a shader body, params the live state knows, and a preset", () => {
    assert.deepEqual(GENERATORS.map((g) => g.id), GENERATOR_IDS);
    for (const g of GENERATORS) {
        assert.ok(g.name && g.hint, g.id);
        for (const p of g.params) assert.ok(PARAM_IDS.includes(p), `${g.id} uses ${p}`);
        assert.match(g.body, /float v\b/, `${g.id} leaves v`);
        const src = fragmentSource(g.id);
        assert.match(src, /void main\(\)/);
        assert.match(src, /gl_FragColor/);
        assert.ok(presetsOf(g.id).length >= 1, `${g.id} has a preset`);
    }
    assert.equal(PARAM_LABELS.length, PARAM_IDS.length);
    assert.equal(generatorOf("zzz").id, "fluid");
});

test("presets are complete and matched", () => {
    for (const p of PRESETS) {
        for (const k of PARAM_IDS) assert.equal(typeof p.gen[k], "number", `${p.id}.${k}`);
        assert.ok(p.gen.colors.length >= 1 && p.gen.colors.length <= 3);
        assert.equal(matchingPreset(p.gen), p);
    }
    const lava = startArgs("fluid");
    assert.equal(lava.kind, "generator"); assert.equal(lava.value, "fluid"); assert.equal(lava.title, "Fluido · Lava");
    assert.equal(matchingPreset({ ...lava.gen, speed: 1.5 }), null);
    assert.equal(cssFallback(lava.gen), "linear-gradient(160deg, #3f0000, #ff7600, #5b0000)");
});
