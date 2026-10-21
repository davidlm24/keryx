import { test } from "node:test";
import assert from "node:assert/strict";
import { createSelectionStore } from "./selectionStore.js";

test("Esc clears the list marked last, one per press, until none is left", () => {
    const s = createSelectionStore();
    const cleared = [];
    assert.equal(s.any(), false);
    assert.equal(s.clearTop(), false, "nothing marked: Esc goes on to the air");
    s.set("lib", () => cleared.push("lib"));
    s.set("setlist", () => cleared.push("setlist"));
    s.set("lib", () => cleared.push("lib2")); // a re-render keeps its place
    assert.equal(s.any(), true);
    assert.equal(s.clearTop(), true);
    assert.deepEqual(cleared, ["setlist"]);
    assert.equal(s.clearTop(), true);
    assert.deepEqual(cleared, ["setlist", "lib2"], "the newest clear function is the one called");
    assert.equal(s.any(), false);
});

test("a list that unmarks everything leaves the store", () => {
    const s = createSelectionStore();
    s.set("lib", () => {});
    s.set("lib", null);
    assert.equal(s.any(), false);
    s.set("x", () => { throw new Error("gone"); });
    assert.equal(s.clearTop(), true, "a clear that throws still counts");
    assert.equal(s.any(), false);
});
