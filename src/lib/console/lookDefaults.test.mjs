import test from "node:test";
import assert from "node:assert/strict";
import { lookDefaults, withLookDefaults } from "./lookDefaults.js";

// The transition is the theme's alone (audit 2026-10-14, achado nº 4): the
// old Aparência default on the row no longer stamps anything.
test("the User's transition fields are legacy: nothing is stamped from them", () => {
    assert.deepEqual(lookDefaults({ transition_type: "slide", transition_ms: 300 }), { bible: { ref_line: null, verse_numbers: null, pair: null } });
    assert.deepEqual(lookDefaults(null), { bible: { ref_line: null, verse_numbers: null, pair: null } });
    const d = lookDefaults({ transition_type: "slide", transition_ms: 300 });
    assert.deepEqual(withLookDefaults("content.show", { title: "Hino", style: { font_size: "large" } }, d).style, { font_size: "large" });
    assert.equal(withLookDefaults("content.show", { style: { transition: "fade" } }, d).style.transition, "fade", "an item's saved choice still rides");
    const media = { kind: "image", url: "a.png" };
    assert.equal(withLookDefaults("media.show", media, d), media, "only text items");
});

test("the Bíblia's display: stamped only into a passage, its own choice wins", () => {
    assert.deepEqual(lookDefaults({ bible_show_reference: false }).bible, { ref_line: "none", verse_numbers: null, pair: null });
    assert.deepEqual(lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" }).bible, { ref_line: "plain", verse_numbers: "hide", pair: null });
    const d = lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "bible", style: {} }, d).style, { ref_line: "plain", verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "lyrics", style: {} }, d).style, {}, "a song is not a passage");
    assert.equal(withLookDefaults("content.show", { kind: "bible", style: { ref_line: "full" } }, d).style.ref_line, "full");
});

// Rodada P (P2-1): the size on the screens is the Bíblia theme's alone
// (owner 2026-10-22: the bar's A− / A / A+ went); the second edition's place.
test("a passage keeps its theme's size: an old saved step is not read", () => {
    assert.equal(withLookDefaults("content.show", { kind: "bible", style: { font_size: "large" } }, lookDefaults({ bible_text_size: 2 })).style.font_size, "large");
});

test("a second edition's place is stamped only where a slide carries one", () => {
    const d = lookDefaults({ bible_pair: "stack" });
    assert.equal(d.bible.pair, "stack");
    assert.equal(lookDefaults({ bible_pair: "side" }).bible.pair, null, "side by side is the screens' default");
    const two = { kind: "bible", slides: [{ text: "1 a", pair: { text: "1 b", version: "ACF" } }], style: {} };
    assert.equal(withLookDefaults("content.show", two, d).style.pair, "stack");
    assert.equal(withLookDefaults("content.show", { ...two, slides: [{ text: "1 a" }] }, d).style.pair, undefined);
    assert.equal(withLookDefaults("content.show", { ...two, style: { pair: "side" } }, d).style.pair, "side", "the passage's own choice wins");
});
