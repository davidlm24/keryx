import test from "node:test";
import assert from "node:assert/strict";
import { READ_SIZES, readStep, stepRead, readScale, readLabel, wheelStep } from "./bibleRead.js";

test("the reading text has five sizes, M the console's own", () => {
    assert.deepEqual(READ_SIZES.map(([l]) => l), ["P", "M", "G", "GG", "GGG"]);
    assert.equal(readScale(undefined), 1);
    assert.equal(readLabel(null), "M");
    assert.equal(readStep(9), 1, "a bad save is the default");
    assert.equal(readStep(4), 4);
});

test("A− and A+ step one size, never past the ends", () => {
    assert.equal(stepRead(1, 1), 2);
    assert.equal(stepRead(4, 1), 4);
    assert.equal(stepRead(0, -1), 0);
    assert.equal(stepRead(undefined, -1), 0);
    assert.equal(readScale(4), 1.5);
});

test("Ctrl + the wheel zooms the text, the plain wheel scrolls", () => {
    assert.equal(wheelStep({ ctrlKey: true, deltaY: -100 }), 1);
    assert.equal(wheelStep({ ctrlKey: true, deltaY: 40 }), -1);
    assert.equal(wheelStep({ ctrlKey: false, deltaY: -100 }), null);
    assert.equal(wheelStep({ ctrlKey: true, deltaY: 0 }), null);
});
