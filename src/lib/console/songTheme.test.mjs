import test from "node:test";
import assert from "node:assert/strict";
import { partOf, partKey, songParts } from "./songTheme.js";

const slides = [
    { text: "Verso um", label: "Verso 1" },
    { text: "Refrão um", label: "Refrão", is_chorus: true },
    { text: "Verso dois", label: "Verso 2" },
    { text: "Refrão dois", label: "refrão", is_chorus: true },
    { text: "Coro sem rótulo", is_chorus: true },
    { text: "Solto" },
];

test("a slide's part is its label, a chorus without one is Refrão, keys ignore case", () => {
    assert.equal(partOf(slides[0]), "Verso 1");
    assert.equal(partOf(slides[4]), "Refrão");
    assert.equal(partOf(slides[5]), "");
    assert.equal(partKey(" Refrão "), "refrão");
    assert.equal(partKey("REFRÃO"), "refrão");
});

test("the parts of a song, in order, once each, with how many slides", () => {
    assert.deepEqual(songParts(slides), [
        { key: "verso 1", name: "Verso 1", slides: 1 },
        { key: "refrão", name: "Refrão", slides: 3 },
        { key: "verso 2", name: "Verso 2", slides: 1 },
    ]);
    assert.deepEqual(songParts([{ text: "a" }, { text: "b" }]), []);
});
