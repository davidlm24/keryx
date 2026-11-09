import test from "node:test";
import assert from "node:assert/strict";
import { cleanSourceUrl, mediaInfoPatch, DESCRIPTION_MAX } from "./mediaInfo.js";

test("the link of origin: empty, an http(s) address, or not a link", () => {
    assert.equal(cleanSourceUrl(""), "");
    assert.equal(cleanSourceUrl("   "), "");
    assert.equal(cleanSourceUrl(" https://youtu.be/abc "), "https://youtu.be/abc");
    assert.equal(cleanSourceUrl("http://exemplo.com/x"), "http://exemplo.com/x");
    assert.equal(cleanSourceUrl("youtu.be/abc"), null);
    assert.equal(cleanSourceUrl("javascript:alert(1)"), null);
    assert.equal(cleanSourceUrl("file:///c:/x.mp4"), null);
});

test("only what changed is saved; an empty name or a bad link is not", () => {
    const row = { title: "Louvor", description: "", source_url: "https://youtu.be/a" };
    assert.equal(mediaInfoPatch(row, { title: "Louvor" }), null);
    assert.equal(mediaInfoPatch(row, { title: "  " }), null, "the name keeps the row's");
    assert.deepEqual(mediaInfoPatch(row, { title: " Louvor de sábado " }), { title: "Louvor de sábado" });
    assert.deepEqual(mediaInfoPatch(row, { description: "Culto de 01/11" }), { description: "Culto de 01/11" });
    assert.equal(mediaInfoPatch(row, { description: "x".repeat(DESCRIPTION_MAX + 50) }).description.length, DESCRIPTION_MAX);
    assert.deepEqual(mediaInfoPatch(row, { source_url: "" }), { source_url: "" }, "emptied: unlinked");
    assert.equal(mediaInfoPatch(row, { source_url: "não é link" }), null);
    assert.equal(mediaInfoPatch(row, { source_url: "https://youtu.be/a" }), null);
    assert.equal(mediaInfoPatch(null, { title: "x" }), null);
});

