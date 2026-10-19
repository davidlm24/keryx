import test from "node:test";
import assert from "node:assert/strict";
import { typography, getTextEffect } from "./deviceStyles.js";

test("typography: nothing set, nothing drawn (the screen's CSS stays)", () => {
    assert.deepEqual(typography({}), {});
    assert.deepEqual(typography({ font_weight: "", font_style: "", line_height: "", letter_spacing: "", text_outline_px: "", text_outline_color: "" }), {});
    assert.deepEqual(typography({ letter_spacing: 0, text_outline_px: 0 }), {});
});

test("typography: bold, italic, the line and letter spacing (Rodada HF2)", () => {
    assert.deepEqual(typography({ font_weight: "bold", font_style: "italic" }), { fontWeight: 700, fontStyle: "italic" });
    assert.equal(typography({ font_weight: "normal" }).fontWeight, 400);
    assert.equal(typography({ line_height: "loose" }).lineHeight, 1.45, "an old theme's name");
    assert.equal(typography({ line_height: 1.6 }).lineHeight, 1.6);
    assert.equal(typography({ letter_spacing: 0.05 }).letterSpacing, "0.05em");
    assert.equal(typography({ letter_spacing: 3 }).letterSpacing, "0.5em", "clamped");
});

test("typography: the outline is behind the letters, px of a 1920 screen, independent of the effect", () => {
    const o = typography({ text_outline_px: 4, text_outline_color: "#ff0000" });
    // 4 px show outside the letters: the stroke is 8 px wide, half under the fill.
    assert.equal(o.WebkitTextStroke, `${(8 * 100 / 1920).toFixed(3)}cqw #ff0000`);
    assert.equal(o.paintOrder, "stroke fill");
    assert.match(typography({ text_outline_px: 2 }).WebkitTextStroke, / #000000$/, "black by default");
    assert.match(typography({ text_outline_px: 2, text_outline_color: "red" }).WebkitTextStroke, / #000000$/, "never a colour that is not #rrggbb");
    assert.match(typography({ text_outline_px: 40 }).WebkitTextStroke, new RegExp(`^${(16 * 100 / 1920).toFixed(3)}cqw`), "at most 8 px");
    // The old Contorno effect (now "Vazado") still draws hollow letters.
    assert.equal(getTextEffect("outline", "#fff").WebkitTextFillColor, "transparent");
});
