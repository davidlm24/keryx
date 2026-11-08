import test from "node:test";
import assert from "node:assert/strict";
import { emptyHistory, record, undo, redo, breakGroup, canUndo, canRedo, historyKey, hasOwnUndo, HISTORY_LIMIT } from "./editorHistory.js";

// Walk a run of changes the way the editors do: each records the draft it replaced.
const walk = (h, steps) => steps.reduce((acc, [before, opts]) => record(acc, before, opts), h);

test("each change is a step; undo and redo walk them in order", () => {
    let h = walk(emptyHistory(), [["a"], ["b"]]); // a → b → c on screen
    assert.equal(canUndo(h), true);
    assert.equal(canRedo(h), false);
    let r = undo(h, "c");
    assert.equal(r.value, "b");
    r = undo(r.history, r.value);
    assert.equal(r.value, "a");
    assert.equal(undo(r.history, r.value), null);
    h = r.history;
    assert.equal(canRedo(h), true);
    r = redo(h, "a");
    assert.equal(r.value, "b");
    r = redo(r.history, r.value);
    assert.equal(r.value, "c");
    assert.equal(redo(r.history, r.value), null);
});

test("a new change after an undo drops what was undone", () => {
    const h = walk(emptyHistory(), [["a"], ["b"]]);
    const r = undo(h, "c"); // back on b
    const next = record(r.history, "b");
    assert.equal(canRedo(next), false);
    assert.equal(undo(next, "d").value, "b");
});

test("one drag folds into one step", () => {
    const h = walk(emptyHistory(), [["a", { group: "drag:1", at: 10 }], ["b", { group: "drag:1", at: 20 }], ["c", { group: "drag:1", at: 9000 }]]);
    assert.equal(h.past.length, 1);
    assert.equal(undo(h, "d").value, "a");
});

test("two drags are two steps", () => {
    const h = walk(emptyHistory(), [["a", { group: "drag:1" }], ["b", { group: "drag:1" }], ["c", { group: "drag:2" }]]);
    assert.deepEqual(h.past, ["a", "c"]);
});

test("nudges fold while they come close together, not after a pause", () => {
    const n = (at) => ({ group: "nudge:el1", at, window: 1000 });
    const h = walk(emptyHistory(), [["a", n(0)], ["b", n(400)], ["c", n(900)], ["d", n(5000)]]);
    assert.deepEqual(h.past, ["a", "d"]);
});

test("changes without a group never fold", () => {
    const h = walk(emptyHistory(), [["a"], ["b"], ["c"]]);
    assert.deepEqual(h.past, ["a", "b", "c"]);
});

test("undo, redo and breakGroup end the group", () => {
    let h = walk(emptyHistory(), [["a", { group: "f" }], ["b", { group: "f" }]]);
    h = breakGroup(h);
    h = record(h, "c", { group: "f" });
    assert.deepEqual(h.past, ["a", "c"]);
    const r = undo(h, "d");
    const after = record(r.history, "c", { group: "f" });
    assert.deepEqual(after.past, ["a", "c"]);
    assert.equal(canRedo(after), false);
});

test("the stack keeps the last HISTORY_LIMIT steps", () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) h = record(h, i);
    assert.equal(h.past.length, HISTORY_LIMIT);
    assert.equal(h.past[0], 5);
    const small = walk(emptyHistory(), [[1, { limit: 2 }], [2, { limit: 2 }], [3, { limit: 2 }]]);
    assert.deepEqual(small.past, [2, 3]);
});

test("the keys: Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo", () => {
    assert.equal(historyKey({ key: "z", ctrlKey: true }), "undo");
    assert.equal(historyKey({ key: "Z", ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(historyKey({ key: "y", ctrlKey: true }), "redo");
    assert.equal(historyKey({ key: "z", metaKey: true }), "undo");
    assert.equal(historyKey({ key: "z" }), null);
    assert.equal(historyKey({ key: "y", ctrlKey: true, shiftKey: true }), null);
    assert.equal(historyKey({ key: "z", ctrlKey: true, altKey: true }), null); // AltGr
    assert.equal(historyKey({ key: "s", ctrlKey: true }), null);
    // A text field keeps its own undo.
    assert.equal(historyKey({ key: "z", ctrlKey: true }, true), null);
    assert.equal(historyKey({ key: "y", ctrlKey: true }, true), null);
});

test("which fields keep their own undo", () => {
    assert.equal(hasOwnUndo({ tagName: "TEXTAREA" }), true);
    assert.equal(hasOwnUndo({ tagName: "INPUT", type: "text" }), true);
    assert.equal(hasOwnUndo({ tagName: "INPUT", type: "number" }), true);
    assert.equal(hasOwnUndo({ tagName: "INPUT", type: "range" }), false);
    assert.equal(hasOwnUndo({ tagName: "INPUT", type: "color" }), false);
    assert.equal(hasOwnUndo({ tagName: "INPUT", type: "checkbox" }), false);
    assert.equal(hasOwnUndo({ tagName: "SELECT" }), false);
    assert.equal(hasOwnUndo({ tagName: "BUTTON" }), false);
    assert.equal(hasOwnUndo({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(hasOwnUndo(null), false);
});
