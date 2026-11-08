import test from "node:test";
import assert from "node:assert/strict";
import { placementValue, placementTarget, placementOptions, placementWord, pixelSize } from "./placement.js";

const D1 = { id: 11, label: "Dell", width: 2560, height: 1440 };
const D2 = { id: 22, label: "Projetor", width: 1920, height: 1080, bounds: { width: 1280, height: 720 } };
const displays = [D1, D2];
const gone = { id: 33, label: "TV", width: 1280, height: 720 };

test("the value is auto, window, d:<id> or gone:<id>", () => {
    assert.equal(placementValue({ target: "auto" }, displays), "auto");
    assert.equal(placementValue({ target: "window" }, displays), "window");
    assert.equal(placementValue({ target: D2 }, displays), "d:22");
    assert.equal(placementValue({ target: gone }, displays), "gone:33");
    assert.equal(placementValue(null, displays), "auto");
    assert.equal(placementValue({}, displays), "auto");
});

test("choosing asks for the mode, or the monitor with its size (bounds first)", () => {
    assert.equal(placementTarget("auto", displays), "auto");
    assert.equal(placementTarget("window", displays), "window");
    assert.deepEqual(placementTarget("d:22", displays), { id: 22, label: "Projetor", width: 1280, height: 720 });
    assert.deepEqual(placementTarget("d:11", displays), { id: 11, label: "Dell", width: 2560, height: 1440 });
});

test("a monitor that is not there asks for nothing", () => {
    assert.equal(placementTarget("d:99", displays), null);
    assert.equal(placementTarget("gone:33", displays), null);
});

test("the options: the two modes, the monitors that are on, then the off one disabled", () => {
    assert.deepEqual(placementOptions(displays, { target: "auto" }).map((o) => o.label), [
        "Automático", "Sempre numa janela", "Tela 1 · 2560×1440", "Tela 2 · 1280×720",
    ]);
    const withGone = placementOptions(displays, { target: gone });
    assert.deepEqual(withGone.at(-1), { value: "gone:33", label: "1280×720 (desligada)", disabled: true });
    assert.equal(withGone.length, 5);
    assert.equal(placementOptions(displays, { target: D1 }).some((o) => o.disabled), false);
    assert.equal(placementOptions([], { target: "auto" }).length, 2);
});

test("the popover's word: the mode, the monitor's number, or the off size in amber", () => {
    assert.deepEqual(placementWord({ target: "auto" }, displays), { text: "Automático", off: false });
    assert.deepEqual(placementWord({ target: "window" }, displays), { text: "Janela", off: false });
    assert.deepEqual(placementWord({ target: D2 }, displays), { text: "Tela 2", off: false });
    assert.deepEqual(placementWord({ target: gone }, displays), { text: "1280×720 (desligada)", off: true });
    // Automático says what it chose (2026-11-08).
    assert.deepEqual(placementWord({ target: "auto" }, displays, { mode: "fullscreen", displayId: 22 }), { text: "Automático · Tela 2", off: false });
    assert.deepEqual(placementWord({ target: "auto" }, displays, { mode: "window", displayId: null }), { text: "Automático · janela", off: false });
    assert.deepEqual(placementWord({ target: "auto" }, displays, { mode: "hidden", missing: true }), { text: "Automático", off: false });
});

test("a monitor's size in pixels, with the Windows scale beside it when not 100 % (2026-11-08)", () => {
    // The owner's Tela 2: 2880×1620 at 200 %, which Electron gives as 1440×810.
    assert.equal(pixelSize({ bounds: { width: 1440, height: 810 }, scaleFactor: 2 }), "2880×1620 · 200 %");
    assert.equal(pixelSize({ bounds: { width: 1536, height: 864 }, scaleFactor: 1.25 }), "1920×1080 · 125 %");
    assert.equal(pixelSize({ bounds: { width: 1920, height: 1080 }, scaleFactor: 1 }), "1920×1080");
    assert.equal(pixelSize({ width: 1280, height: 720 }), "1280×720");
    // The options say pixels; what is stored stays in Electron's units.
    const hi = { id: 44, label: "4K", bounds: { width: 1440, height: 810 }, scaleFactor: 2 };
    assert.equal(placementOptions([hi]).at(-1).label, "Tela 1 · 2880×1620 · 200 %");
    assert.deepEqual(placementTarget("d:44", [hi]), { id: 44, label: "4K", width: 1440, height: 810 });
});
