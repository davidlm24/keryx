import test from "node:test";
import assert from "node:assert/strict";
import { emPerChar, styleMetrics } from "./fontMetrics.js";

// Outside a browser (and while a font has not loaded) the estimate is
// Geist's 0.55 em per character; the measure itself runs in the editors.
test("emPerChar falls back to Geist's 0.55 without a canvas", () => {
    assert.equal(emPerChar("sans"), 0.55);
    assert.equal(emPerChar("Montserrat", 700), 0.55);
});

test("styleMetrics: the weight the screens draw and the letter spacing", () => {
    assert.deepEqual(styleMetrics({}), { em: 0.55, spacing: 0 });
    assert.deepEqual(styleMetrics({ font_weight: "bold", letter_spacing: 0.1 }), { em: 0.55, spacing: 0.1 });
    assert.deepEqual(styleMetrics({ letter_spacing: "" }), { em: 0.55, spacing: 0 });
});
