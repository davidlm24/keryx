import test from "node:test";
import assert from "node:assert/strict";
import { SIZE_PRESETS, SIZE_CQW, SIZE_RANGE, sizeCqw, sizeValue, sizePreset, sizeLabel, sameSize, lineHeightOf } from "./textSize.js";

test("the presets are today's six sizes, smallest first", () => {
    assert.deepEqual(SIZE_PRESETS.map(([k]) => k), ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"]);
    assert.deepEqual(SIZE_PRESETS.map(([, l]) => l), ["PP", "P", "M", "G", "GG", "GGG"]);
    assert.equal(SIZE_CQW.large, 4.8);
    assert.deepEqual(SIZE_RANGE, [1, 12]);
});

test("sizeCqw reads a number, a numeric string, a preset's key, and falls back otherwise", () => {
    assert.equal(sizeCqw("large"), 4.8);
    assert.equal(sizeCqw("xxlarge"), 7);
    assert.equal(sizeCqw(5.25), 5.3);
    assert.equal(sizeCqw("4.8"), 4.8);
    assert.equal(sizeCqw("4,5"), 4.5);
    assert.equal(sizeCqw(" 6 "), 6);
    assert.equal(sizeCqw(""), 4.8);
    assert.equal(sizeCqw(null), 4.8);
    assert.equal(sizeCqw(undefined), 4.8);
    assert.equal(sizeCqw("huge"), 4.8);
    assert.equal(sizeCqw("constructor"), 4.8, "never a prototype key");
    assert.equal(sizeCqw("", 5), 5, "the caller's fallback");
    assert.equal(sizeCqw(0.2), 1, "clamped up to 1");
    assert.equal(sizeCqw("40"), 12, "clamped down to 12");
});

test("a theme stores the number as a string", () => {
    assert.equal(sizeValue("large"), "4.8");
    assert.equal(sizeValue(4.81), "4.8");
    assert.equal(sizeValue(13), "12");
});

test("sizePreset and sizeLabel: a preset's number shows its name", () => {
    assert.equal(sizePreset("4.8"), "large");
    assert.equal(sizePreset("large"), "large");
    assert.equal(sizePreset(4.9), "");
    assert.equal(sizeLabel("large"), "G");
    assert.equal(sizeLabel("7"), "GGG");
    assert.equal(sizeLabel("4.5"), "4,5 %");
    assert.equal(sizeLabel(12), "12 %");
    assert.equal(sizeLabel(""), "G");
});

test("sameSize compares what draws: a name and its number are the same", () => {
    assert.ok(sameSize("large", "4.8"));
    assert.ok(sameSize("", "large"));
    assert.ok(sameSize(4.8, "4.8"));
    assert.ok(!sameSize("large", "5"));
});

test("lineHeightOf: the old names, a number 0.9–2, normal otherwise", () => {
    assert.equal(lineHeightOf("tight"), 1.08);
    assert.equal(lineHeightOf("loose"), 1.45);
    assert.equal(lineHeightOf("normal"), 1.22);
    assert.equal(lineHeightOf(""), 1.22);
    assert.equal(lineHeightOf("x"), 1.22);
    assert.equal(lineHeightOf(1.3), 1.3);
    assert.equal(lineHeightOf("1.6"), 1.6);
    assert.equal(lineHeightOf(0.5), 0.9);
    assert.equal(lineHeightOf(3), 2);
});
