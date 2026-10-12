import test from "node:test";
import assert from "node:assert/strict";
import { lookDefaults, withLookDefaults } from "./look.js";

test("the User's transition defaults, kept in range", () => {
    assert.deepEqual(lookDefaults({ transition_type: "slide", transition_ms: 300 }), { transition: "slide", transition_ms: 300, bible: { ref_line: null, verse_numbers: null } });
    assert.deepEqual(lookDefaults({ transition_type: "zoom", transition_ms: 5000 }), { transition: null, transition_ms: 600, bible: { ref_line: null, verse_numbers: null } }, "unknown kind: none; too long: 600");
    assert.deepEqual(lookDefaults({ transition_ms: 10 }), { transition: null, transition_ms: 120, bible: { ref_line: null, verse_numbers: null } });
    assert.deepEqual(lookDefaults(null), { transition: null, transition_ms: null, bible: { ref_line: null, verse_numbers: null } });
});

test("stamped into content.show where the item has no choice of its own", () => {
    const d = { transition: "cut", transition_ms: 250 };
    assert.deepEqual(withLookDefaults("content.show", { title: "Hino", style: { font_size: "large" } }, d).style, { font_size: "large", transition: "cut", transition_ms: 250 });
    assert.equal(withLookDefaults("content.show", { style: { transition: "fade" } }, d).style.transition, "fade", "the item's own choice wins");
    assert.deepEqual(withLookDefaults("content.show", { title: "x" }, d).style, { transition: "cut", transition_ms: 250 }, "no style yet");
    const media = { kind: "image", url: "a.png" };
    assert.equal(withLookDefaults("media.show", media, d), media, "only text items");
    assert.deepEqual(withLookDefaults("content.show", { style: {} }, { transition: null, transition_ms: null }).style, {}, "no defaults: untouched");
});

test("the Bíblia's display: stamped only into a passage, its own choice wins", () => {
    assert.deepEqual(lookDefaults({ bible_show_reference: false }).bible, { ref_line: "none", verse_numbers: null });
    assert.deepEqual(lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" }).bible, { ref_line: "plain", verse_numbers: "hide" });
    const d = lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "bible", style: {} }, d).style, { ref_line: "plain", verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "lyrics", style: {} }, d).style, {}, "a song is not a passage");
    assert.equal(withLookDefaults("content.show", { kind: "bible", style: { ref_line: "full" } }, d).style.ref_line, "full");
});
