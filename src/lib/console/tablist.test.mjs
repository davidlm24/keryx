import test from "node:test";
import assert from "node:assert/strict";
import { tabStep, tabStop } from "./tablist.js";

test("←/→ walk the tabs and wrap; Home/End the ends; other keys are not the list's", () => {
    assert.equal(tabStep(0, 3, "ArrowRight"), 1);
    assert.equal(tabStep(2, 3, "ArrowRight"), 0, "wraps");
    assert.equal(tabStep(0, 3, "ArrowLeft"), 2, "wraps");
    assert.equal(tabStep(1, 3, "Home"), 0);
    assert.equal(tabStep(1, 3, "End"), 2);
    assert.equal(tabStep(1, 3, "ArrowDown"), null, "↑/↓ are not the pattern's (horizontal tabs)");
    assert.equal(tabStep(1, 3, "Enter"), null);
    assert.equal(tabStep(-1, 3, "ArrowRight"), null, "focus is not on a tab");
    assert.equal(tabStep(0, 0, "ArrowRight"), null);
    assert.equal(tabStep(0, 1, "ArrowRight"), 0, "one tab stays");
});

test("one Tab stop per list: the chosen tab, else the first", () => {
    assert.deepEqual([0, 1, 2].map((i) => tabStop(i, i === 1, true)), [-1, 0, -1]);
    assert.deepEqual([0, 1, 2].map((i) => tabStop(i, false, false)), [0, -1, -1]);
});
