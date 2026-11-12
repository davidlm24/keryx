import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATORS, GENERATOR_IDS, PARAM_IDS, PARAM_LABELS, PRESETS, presetsOf, startArgs, matchingPreset, cssFallback, generatorOf, presetSwatch } from "./generators.js";
import { BODIES, fragmentSource } from "./generatorShaders.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("every generator has a shader body, params the live state knows, and a preset", () => {
    assert.deepEqual(GENERATORS.map((g) => g.id), GENERATOR_IDS);
    assert.deepEqual(Object.keys(BODIES), GENERATOR_IDS);
    for (const g of GENERATORS) {
        assert.ok(g.name && g.hint, g.id);
        for (const p of g.params) assert.ok(PARAM_IDS.includes(p), `${g.id} uses ${p}`);
        assert.match(BODIES[g.id], /float v\b/, `${g.id} leaves v`);
        assert.doesNotMatch(BODIES[g.id], /\bkx(Col|G)\b|\bfloat s\b/, `${g.id} uses a name the coda declares`);
        const src = fragmentSource(g.id);
        assert.match(src, /void main\(\)/);
        assert.match(src, /gl_FragColor/);
        assert.ok(presetsOf(g.id).length >= 1, `${g.id} has a preset`);
    }
    assert.equal(new Set(GENERATORS.map((g) => g.name)).size, GENERATORS.length, "names are unique");
    assert.equal(PARAM_LABELS.length, PARAM_IDS.length);
    assert.equal(generatorOf("zzz").id, "fluid");
});

test("presets are complete and matched", () => {
    for (const p of PRESETS) {
        for (const k of PARAM_IDS) assert.equal(typeof p.gen[k], "number", `${p.id}.${k}`);
        assert.ok(p.gen.colors.length >= 1 && p.gen.colors.length <= 5);
        assert.equal(matchingPreset(p.gen), p);
    }
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length, "preset ids are unique");
    const lava = startArgs("fluid");
    assert.equal(lava.kind, "generator"); assert.equal(lava.value, "fluid"); assert.equal(lava.title, "Fluido · Lava");
    assert.equal(matchingPreset({ ...lava.gen, speed: 1.5 }), null);
    assert.equal(cssFallback(lava.gen), "linear-gradient(160deg, #3f0000, #ff7600, #5b0000)");
});

test("the worship loops: the owner's first colours, a ramp and degradês each", () => {
    const loops = GENERATOR_IDS.slice(5);
    assert.equal(loops.length, 20);
    for (const id of loops) {
        const ps = presetsOf(id);
        assert.ok(ps.length >= 5, `${id} has its colourways`);
        assert.ok(ps.some((p) => p.gen.colors.length >= 4), `${id} has a ramp`);
        assert.ok(ps.filter((p) => p.gen.colors2).length >= 2, `${id} has degradês`);
    }
    assert.equal(startArgs("fluted").title, "Vidro canelado · Cobalto");
    assert.equal(startArgs("tunnel").gen.speed, 0.26);
    const grad = presetsOf("tunnel").find((p) => p.gen.colors2);
    assert.equal(matchingPreset(grad.gen), grad);
    assert.equal(matchingPreset({ ...grad.gen, blend: grad.gen.blend === "h" ? "v" : "h" }), null, "the direction counts");
    assert.match(presetSwatch(grad.gen), /left \/ 50% 100% no-repeat/);
    assert.match(presetSwatch(startArgs("fluid").gen), /^linear-gradient\(135deg, #5b0000 0% 33%/);
});

test("the shaders stay out of the outputs' first load", () => {
    // Only GeneratorBackground loads them, and only through import().
    const screen = path.join(here, "../components/screen");
    for (const name of fs.readdirSync(screen).filter((f) => /\.jsx?$/.test(f))) {
        const src = fs.readFileSync(path.join(screen, name), "utf8");
        assert.doesNotMatch(src, /from\s+["']@\/lib\/(generators|generatorShaders)["']/, `${name} imports the generators statically`);
    }
    const bg = fs.readFileSync(path.join(screen, "GeneratorBackground.jsx"), "utf8");
    assert.match(bg, /import\(["']@\/lib\/generatorShaders["']\)/);
});
