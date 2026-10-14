import test from "node:test";
import assert from "node:assert/strict";
import { lookDefaults, withLookDefaults } from "./look.js";

// The transition is the theme's alone (audit 2026-10-14, achado nº 4): the
// old Aparência default on the row no longer stamps anything.
test("the User's transition fields are legacy: nothing is stamped from them", () => {
    assert.deepEqual(lookDefaults({ transition_type: "slide", transition_ms: 300 }), { bible: { ref_line: null, verse_numbers: null } });
    assert.deepEqual(lookDefaults(null), { bible: { ref_line: null, verse_numbers: null } });
    const d = lookDefaults({ transition_type: "slide", transition_ms: 300 });
    assert.deepEqual(withLookDefaults("content.show", { title: "Hino", style: { font_size: "large" } }, d).style, { font_size: "large" });
    assert.equal(withLookDefaults("content.show", { style: { transition: "fade" } }, d).style.transition, "fade", "an item's saved choice still rides");
    const media = { kind: "image", url: "a.png" };
    assert.equal(withLookDefaults("media.show", media, d), media, "only text items");
});

test("the Bíblia's display: stamped only into a passage, its own choice wins", () => {
    assert.deepEqual(lookDefaults({ bible_show_reference: false }).bible, { ref_line: "none", verse_numbers: null });
    assert.deepEqual(lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" }).bible, { ref_line: "plain", verse_numbers: "hide" });
    const d = lookDefaults({ bible_show_version: false, bible_verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "bible", style: {} }, d).style, { ref_line: "plain", verse_numbers: "hide" });
    assert.deepEqual(withLookDefaults("content.show", { kind: "lyrics", style: {} }, d).style, {}, "a song is not a passage");
    assert.equal(withLookDefaults("content.show", { kind: "bible", style: { ref_line: "full" } }, d).style.ref_line, "full");
});
