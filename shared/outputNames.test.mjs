import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { OUTPUT_NAMES, RAIL_VIEWS } from "../src/lib/network/views.js";
import { outputMeta, outputLook } from "../src/lib/outputPrefs.js";

const require = createRequire(import.meta.url);
const { OUTPUTS } = require("../electron/outputs.cjs");
const { NETWORK_SCREENS } = require("../electron/lan.cjs");

// Each output has ONE factory name (audit C-18): Saídas, Telas e saídas and
// Verificar read the main process's label, the Editor de telas, the Multiview
// and the window titles the renderer's, the network's start page lan.cjs's.
test("main, the network list and the renderer name every output alike", () => {
    for (const o of OUTPUTS) assert.equal(o.label, OUTPUT_NAMES[o.key], o.key);
    for (const s of NETWORK_SCREENS) assert.equal(s.label, OUTPUT_NAMES[s.path], s.path);
    for (const v of RAIL_VIEWS) assert.equal(v.name, OUTPUT_NAMES[v.key], v.key);
    for (const key of Object.keys(OUTPUT_NAMES)) assert.equal(outputMeta(key).name, OUTPUT_NAMES[key], key);
    const keys = new Set([...OUTPUTS.map((o) => o.key), ...NETWORK_SCREENS.map((s) => s.path), ...RAIL_VIEWS.map((v) => v.key)]);
    assert.deepEqual([...keys].sort(), Object.keys(OUTPUT_NAMES).sort(), "every output has a name, and no name is left over");
});

test("the factory names are the short ones, Avisos for the avisos screen", () => {
    assert.deepEqual(OUTPUT_NAMES, {
        "/Projection": "Projeção",
        "/LyricProjection": "Letras",
        "/VideoProjection": "Vídeo",
        "/CommunicationProjection": "Avisos",
        "/StageView": "Palco",
        "/PastorView": "Pastor",
        "/StreamView": "Transmissão",
    });
    // The operator's own name still wins over the factory one.
    assert.equal(outputLook("/PastorView", { name: "Púlpito" }).name, "Púlpito");
    assert.equal(outputLook("/PastorView", { name: " " }).name, "Pastor");
});
