import test from "node:test";
import assert from "node:assert/strict";
import { ELEMENT_HINTS, elementBar, barToElement, alignElements, distributeElements, moveElements, boxOf, gridRect, cleanGrid, churchModels, modelFields, modelCategory, modelNameTaken, ALIGN_ACTIONS } from "./layoutEditor.js";
import { ELEMENT_TYPES, normalizeElement, normalizeLayout } from "./layouts.js";

test("every element type has its hint in the editor's module, none left in the outputs' one", () => {
    for (const t of ELEMENT_TYPES) {
        assert.ok(ELEMENT_HINTS[t.id], `hint for ${t.id}`);
        assert.equal(t.hint, undefined, `${t.id}: the hint lives in layoutEditor.js`);
    }
});

test("an element keeps the text bar's look, checked (P8-3)", () => {
    const el = normalizeElement({ type: "text", font_style: "italic", text_decoration: "underline", text_case: "capitalize", text_justify: "justify", line_height: 3, letter_spacing: -1, text_outline_px: 3.6, text_outline_color: "#FF0000" });
    assert.equal(el.font_style, "italic");
    assert.equal(el.text_decoration, "underline");
    assert.equal(el.text_case, "capitalize");
    assert.equal(el.text_justify, "justify");
    assert.equal(el.line_height, 2, "clamped");
    assert.equal(el.letter_spacing, -0.1);
    assert.equal(el.text_outline_px, 4);
    assert.equal(el.text_outline_color, "#ff0000");
    const plain = normalizeElement({ type: "text", font_style: "oblique", text_case: "lower", line_height: "x", text_outline_px: 0 });
    for (const k of ["font_style", "text_decoration", "text_case", "text_justify", "line_height", "letter_spacing", "text_outline_px", "text_outline_color"]) assert.equal(plain[k], "", `${k} unset`);
});

test("the text bar speaks the theme's keys; the element keeps its own names", () => {
    const el = normalizeElement({ type: "title", align: "right", color: "#112233" });
    const bar = elementBar(el);
    assert.equal(bar.font_weight, "bold", "the title is bold by default");
    assert.equal(bar.text_align, "right");
    assert.equal(bar.text_color, "#112233");
    assert.deepEqual(barToElement({ font_weight: "", text_align: "center", text_justify: "", text_color: "" }), { weight: "normal", align: "center", text_justify: "", color: "" });
    assert.deepEqual(barToElement({ font_weight: "bold", text_decoration: "underline", line_height: 1.4 }), { weight: "bold", text_decoration: "underline", line_height: 1.4 });
});

const els = () => [
    { id: "a", x: 10, y: 10, w: 20, h: 10 },
    { id: "b", x: 50, y: 30, w: 10, h: 20 },
    { id: "c", x: 70, y: 60, w: 20, h: 10 },
    { id: "z", x: 0, y: 90, w: 10, h: 10 },
];
const at = (list, id) => list.find((e) => e.id === id);

test("alignElements: two or more line up on the box around them, one alone on the screen", () => {
    assert.deepEqual(boxOf(els().slice(0, 3)), { x: 10, y: 10, w: 80, h: 60 });
    const left = alignElements(els(), ["a", "b", "c"], "left");
    assert.deepEqual(["a", "b", "c"].map((id) => at(left, id).x), [10, 10, 10]);
    assert.equal(at(left, "z").x, 0, "an unmarked element stays");
    const right = alignElements(els(), ["a", "b", "c"], "right");
    assert.deepEqual(["a", "b", "c"].map((id) => at(right, id).x + at(right, id).w), [90, 90, 90]);
    const mid = alignElements(els(), ["a", "c"], "vmiddle");
    assert.equal(at(mid, "a").y, 35);
    assert.equal(at(mid, "c").y, 35);
    const hc = alignElements(els(), ["b"], "hcenter");
    assert.equal(at(hc, "b").x, 45, "one alone: centred on the screen");
    assert.equal(at(alignElements(els(), ["b"], "bottom"), "b").y, 80);
    assert.equal(ALIGN_ACTIONS.length, 6);
});

test("distributeElements: the first and the last stay, the gaps become equal", () => {
    const out = distributeElements(els(), ["a", "b", "c"], "x");
    assert.equal(at(out, "a").x, 10);
    assert.equal(at(out, "c").x, 70);
    // span 10..90 = 80, sizes 50, two gaps of 15: b at 10+20+15 = 45.
    assert.equal(at(out, "b").x, 45);
    const down = distributeElements(els(), ["a", "b", "c"], "y");
    assert.equal(at(down, "b").y, 30, "already even down: gaps (60 − 40) / 2 = 10");
    const list = els();
    assert.equal(distributeElements(list, ["a", "b"], "x"), list, "two: nothing to distribute");
});

test("moveElements: the marked move as one and stop at the screen's edge together", () => {
    const out = moveElements(els(), ["a", "c"], 15, 0);
    assert.equal(at(out, "a").x, 20, "the group stops when c touches the right edge");
    assert.equal(at(out, "c").x, 80);
    assert.equal(at(out, "b").x, 50);
    const up = moveElements(els(), ["a", "b"], 0, -50);
    assert.equal(at(up, "a").y, 0);
    assert.equal(at(up, "b").y, 20, "the gap between them is kept");
});

test("the grid: a move puts the corner on it, a resize the dragged edges", () => {
    assert.deepEqual(gridRect({ x: 12, y: 18, w: 20, h: 10 }, 5), { x: 10, y: 20, w: 20, h: 10 });
    assert.deepEqual(gridRect({ x: 10, y: 20, w: 23, h: 12 }, 5, "se"), { x: 10, y: 20, w: 25, h: 10 });
    assert.deepEqual(gridRect({ x: 12, y: 20, w: 20, h: 10 }, 10, "w"), { x: 10, y: 20, w: 22, h: 10 });
    assert.deepEqual(gridRect({ x: 10, y: 20, w: 1, h: 10 }, 5, "e"), { x: 10, y: 20, w: 5, h: 10 }, "never thinner than a square");
    assert.deepEqual(gridRect({ x: 12, y: 18, w: 20, h: 10 }, 0), { x: 12, y: 18, w: 20, h: 10 }, "off: as it is");
    assert.deepEqual(cleanGrid(null), { on: false, step: 5 });
    assert.deepEqual(cleanGrid({ on: true, step: 2.5 }), { on: true, step: 2.5 });
    assert.deepEqual(cleanGrid({ on: "yes", step: 7 }), { on: false, step: 5 });
});

test("the church's models: ScreenLayout rows by name; Salvar como modelo writes the drawing, named and filed", () => {
    const rows = [
        { id: "r2", name: "Palco da banda", category: "palco", elements: [{ type: "clock", x: 1, y: 1 }] },
        { id: "r1", name: "", category: "publico", elements: [{ type: "text" }] },
        { id: "r3", name: "Vazio", elements: [] },
    ];
    const models = churchModels(rows);
    assert.deepEqual(models.map((m) => m.name), ["Modelo sem nome", "Palco da banda"], "an empty drawing is no model");
    assert.equal(modelCategory("/StageView"), "palco");
    assert.equal(modelCategory("/LyricProjection"), "publico");
    const draft = normalizeLayout({ elements: [{ id: "x1", type: "clock", x: 5, y: 5 }], background: { color: "#101010" } });
    const f = modelFields(draft, "Hora grande", "/PastorView");
    assert.equal(f.name, "Hora grande");
    assert.equal(f.category, "pastor");
    assert.equal(f.elements.length, 1);
    assert.equal(f.elements[0].id, undefined, "the ids are the screen's, never the model's");
    assert.equal(f.background.color, "#101010");
    assert.ok(modelNameTaken(models, " palco da BANDA "));
    assert.ok(!modelNameTaken(models, "Outro"));
});
