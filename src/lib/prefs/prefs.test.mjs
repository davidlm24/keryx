import { test } from "node:test";
import assert from "node:assert/strict";
import { prefsOf, PREF_FIELDS, hiddenList, hiddenMap } from "./schema.js";
import { migrateLocalPrefs, migrateTransition, migrateItemTitle, migrationFrom, needsMigration, LEGACY } from "./migrate.js";

const storage = (entries) => ({ getItem: (k) => (k in entries ? entries[k] : null) });

test("prefs: an empty or old row reads as the defaults", () => {
    const defaults = Object.fromEntries(Object.entries(PREF_FIELDS).map(([k, f]) => [k, f.default]));
    assert.deepEqual(prefsOf(null), defaults);
    assert.deepEqual(prefsOf({ bible_version: null, import_lines: null }), defaults);
});

test("prefs: bad values fall back, good ones pass", () => {
    const p = prefsOf({ bible_version: " ARA ", bible_book_names: "full", import_lines: 4, console_density: "compact", console_hidden_modules: ["camadas", "tl", "nope", "camadas"] });
    assert.deepEqual(p, { bible_version: "ARA", bible_book_names: "full", bible_verses_per_slide: "auto", bible_show_reference: true, bible_show_version: true, bible_verse_numbers: "sup", service_start_time: "", service_weekday: null, duration_song: 240, duration_other: 120, logo_corner: "bottom-right", logo_size: "medium", logo_opacity: 1, idle_mode: "logo", chime_on: true, chime_volume: 35, show_item_title: true, youtube_hide_title: true, media_transition: "fade", media_transition_ms: 500, clear_transition: "fade", clear_transition_ms: 300, screen_transition: true, bible_theme_id: "", text_theme_id: "", timer_theme_id: "", import_lines: 4, background_categories: null, console_density: "compact", console_hidden_modules: ["camadas"] }, "a saved \"tl\" (the Linha do tempo, removed) is dropped");
    const bad = prefsOf({ bible_version: "<x>", bible_book_names: "long", import_lines: 2.5, console_density: "tiny", console_hidden_modules: "camadas" });
    assert.deepEqual(bad, { bible_version: "NVI", bible_book_names: "short", bible_verses_per_slide: "auto", bible_show_reference: true, bible_show_version: true, bible_verse_numbers: "sup", service_start_time: "", service_weekday: null, duration_song: 240, duration_other: 120, logo_corner: "bottom-right", logo_size: "medium", logo_opacity: 1, idle_mode: "logo", chime_on: true, chime_volume: 35, show_item_title: true, youtube_hide_title: true, media_transition: "fade", media_transition_ms: 500, clear_transition: "fade", clear_transition_ms: 300, screen_transition: true, bible_theme_id: "", text_theme_id: "", timer_theme_id: "", import_lines: 0, background_categories: null, console_density: "auto", console_hidden_modules: [] });
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

test("migration: the marker says when it is done, and which steps a row still takes", () => {
    assert.equal(needsMigration({}), true);
    assert.equal(needsMigration({ prefs_version: null }), true);
    assert.equal(needsMigration({ prefs_version: 1 }), true, "version 1 still moves the transition into the theme");
    assert.equal(needsMigration({ prefs_version: 2 }), true, "version 2 still moves the item title into the themes");
    assert.equal(needsMigration({ prefs_version: 3 }), false);
    // A church already at 2 must not get an old transition re-applied.
    assert.equal(migrationFrom({ prefs_version: 2 }), 2);
    assert.equal(migrationFrom({}), 0);
    assert.equal(migrationFrom({ prefs_version: null }), 0);
});

// Version 3 (Rodada B 2026-10-14, Aparência dissolved): the church's "Título
// do item nas telas" becomes each theme's, so the screens keep showing (or
// hiding) the title exactly as before.
test("migration: the church's item title moves into every theme without a choice", () => {
    const themes = [{ id: "a" }, { id: "b", show_item_title: false }, { id: "c", show_item_title: true }, { name: "no id" }];
    assert.deepEqual(migrateItemTitle({ show_item_title: false }, themes), [{ id: "a", show_item_title: false }]);
    assert.deepEqual(migrateItemTitle({ show_item_title: true }, themes), [{ id: "a", show_item_title: true }]);
    assert.deepEqual(migrateItemTitle({}, themes), [{ id: "a", show_item_title: true }], "never set means shown, the default");
    assert.deepEqual(migrateItemTitle(null, [{ id: "a" }]), [{ id: "a", show_item_title: true }]);
    assert.deepEqual(migrateItemTitle({ show_item_title: false }, []), []);
    assert.deepEqual(migrateItemTitle({ show_item_title: false }, null), []);
});

// Version 2 (audit 2026-10-14, achado nº 4): the old Aparência transition
// becomes the default theme's, once, so the church keeps seeing it.
test("migration: the Aparência transition moves into the default theme", () => {
    const user = { transition_type: "slide", transition_ms: 200 };
    // The default theme inherits ("Padrão"): it takes the church's transition.
    assert.deepEqual(migrateTransition(user, [{ id: "a" }, { id: "b", is_default: true }]),
        { id: "b", patch: { transition: "slide", transition_ms: 200 } });
    // A theme in "Herdar" saved as "" counts as inheriting.
    assert.deepEqual(migrateTransition(user, [{ id: "b", is_default: true, transition: "" }]).id, "b");
    // The theme already chose: it won before too, nothing to write.
    assert.equal(migrateTransition(user, [{ id: "b", is_default: true, transition: "fade" }]), null);
    // No theme marked default: a theme with only the transition, marked padrão.
    assert.deepEqual(migrateTransition(user, []), { create: { transition: "slide", transition_ms: 200, is_default: true } });
    assert.deepEqual(migrateTransition(user, [{ id: "a" }]), { create: { transition: "slide", transition_ms: 200, is_default: true } }, "none marked: never the first by surprise");
    // No saved length: the theme keeps its natural one (transition_ms untouched).
    assert.deepEqual(migrateTransition({ transition_type: "cut" }, [{ id: "b", is_default: true }]), { id: "b", patch: { transition: "cut" } });
    // The length is kept in range, as lookDefaults did.
    assert.equal(migrateTransition({ transition_type: "fade", transition_ms: 5000 }, []).create.transition_ms, 600);
    assert.equal(migrateTransition({ transition_type: "fade", transition_ms: 10 }, []).create.transition_ms, 120);
    // Nothing chosen in Aparência (or an unknown kind): nothing to move.
    assert.equal(migrateTransition({}, []), null);
    assert.equal(migrateTransition(null, []), null);
    assert.equal(migrateTransition({ transition_type: "zoom" }, []), null);
    assert.equal(migrateTransition({ transition_ms: 300 }, []), null, "a length alone moves nothing");
});
