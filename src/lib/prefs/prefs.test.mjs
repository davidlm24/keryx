import { test } from "node:test";
import assert from "node:assert/strict";
import { prefsOf, PREF_FIELDS, hiddenList, hiddenMap } from "./schema.js";
import { migrateLocalPrefs, needsMigration, LEGACY } from "./migrate.js";

const storage = (entries) => ({ getItem: (k) => (k in entries ? entries[k] : null) });

test("prefs: an empty or old row reads as the defaults", () => {
    const defaults = Object.fromEntries(Object.entries(PREF_FIELDS).map(([k, f]) => [k, f.default]));
    assert.deepEqual(prefsOf(null), defaults);
    assert.deepEqual(prefsOf({ bible_version: null, import_lines: null }), defaults);
});

test("prefs: bad values fall back, good ones pass", () => {
    const p = prefsOf({ bible_version: " ARA ", bible_book_names: "full", import_lines: 4, console_density: "compact", console_hidden_modules: ["camadas", "tl", "nope", "camadas"] });
    assert.deepEqual(p, { bible_version: "ARA", bible_book_names: "full", bible_verses_per_slide: "auto", bible_show_reference: true, bible_show_version: true, bible_verse_numbers: "sup", service_start_time: "", service_weekday: null, duration_song: 240, duration_other: 120, logo_corner: "bottom-right", logo_size: "medium", logo_opacity: 1, idle_mode: "logo", chime_on: true, chime_volume: 35, show_item_title: true, youtube_hide_title: true, bible_theme_id: "", text_theme_id: "", timer_theme_id: "", import_lines: 4, console_density: "compact", console_hidden_modules: ["camadas"] }, "a saved \"tl\" (the Linha do tempo, removed) is dropped");
    const bad = prefsOf({ bible_version: "<x>", bible_book_names: "long", import_lines: 2.5, console_density: "tiny", console_hidden_modules: "camadas" });
    assert.deepEqual(bad, { bible_version: "NVI", bible_book_names: "short", bible_verses_per_slide: "auto", bible_show_reference: true, bible_show_version: true, bible_verse_numbers: "sup", service_start_time: "", service_weekday: null, duration_song: 240, duration_other: 120, logo_corner: "bottom-right", logo_size: "medium", logo_opacity: 1, idle_mode: "logo", chime_on: true, chime_volume: 35, show_item_title: true, youtube_hide_title: true, bible_theme_id: "", text_theme_id: "", timer_theme_id: "", import_lines: 0, console_density: "auto", console_hidden_modules: [] });
    const culto = prefsOf({ service_start_time: "18:30", service_weekday: 0, duration_song: 300, duration_other: 5 });
    assert.deepEqual([culto.service_start_time, culto.service_weekday, culto.duration_song, culto.duration_other], ["18:30", 0, 300, 120]);
    assert.equal(prefsOf({ service_start_time: "25:00" }).service_start_time, "");
    const bible = prefsOf({ bible_verses_per_slide: "2", bible_show_reference: false, bible_show_version: false, bible_verse_numbers: "hide" });
    assert.deepEqual([bible.bible_verses_per_slide, bible.bible_show_reference, bible.bible_show_version, bible.bible_verse_numbers], ["2", false, false, "hide"]);
});

test("prefs: hidden modules map and list round-trip", () => {
    assert.deepEqual(hiddenList({ tl: true, lib: false, camadas: true }), ["camadas"], "unknown modules (the old \"tl\") are left out");
    assert.deepEqual(hiddenMap(["camadas"]), { camadas: true });
    assert.deepEqual(hiddenMap(null), {});
});

test("migration: moves the local preferences into an empty row", () => {
    const s = storage({
        [LEGACY.bible]: JSON.stringify({ version: "ARA", bookNames: "full", book: "Salmos", chapter: 23, favs: [] }),
        [LEGACY.importLines]: "4",
        [LEGACY.layout("Operador")]: JSON.stringify({ density: "compact", hidden: { slides: true, lib: false }, libW: 300 }),
    });
    assert.deepEqual(migrateLocalPrefs({ full_name: "Operador" }, s), {
        bible_version: "ARA", bible_book_names: "full", import_lines: 4, console_density: "compact", console_hidden_modules: ["slides"],
    });
});

test("migration: never overwrites a value already in the database", () => {
    const s = storage({ [LEGACY.bible]: JSON.stringify({ version: "ARA" }), [LEGACY.importLines]: "2" });
    assert.deepEqual(migrateLocalPrefs({ bible_version: "NVI", import_lines: 0 }, s), {});
});

test("migration: the layout saved before the profile loaded (default) counts", () => {
    const s = storage({ [LEGACY.layout("")]: JSON.stringify({ density: "compact" }) });
    assert.deepEqual(migrateLocalPrefs({ full_name: "Operador" }, s), { console_density: "compact" });
    // The profile's own key wins over "default".
    const both = storage({ [LEGACY.layout("")]: JSON.stringify({ density: "compact" }), [LEGACY.layout("Operador")]: JSON.stringify({ density: "comfortable" }) });
    assert.deepEqual(migrateLocalPrefs({ full_name: "Operador" }, both), { console_density: "comfortable" });
});

test("migration: corrupt or missing storage moves nothing", () => {
    assert.deepEqual(migrateLocalPrefs({}, storage({ [LEGACY.bible]: "{nope", [LEGACY.importLines]: "x" })), {});
    assert.deepEqual(migrateLocalPrefs({}, null), {});
    assert.deepEqual(migrateLocalPrefs({}, { getItem() { throw new Error("blocked"); } }), {});
});

test("migration: the marker says when it is done", () => {
    assert.equal(needsMigration({}), true);
    assert.equal(needsMigration({ prefs_version: null }), true);
    assert.equal(needsMigration({ prefs_version: 1 }), false);
});
