import test from "node:test";
import assert from "node:assert/strict";
import {
    sourceOf, backgroundList, visibleBackgrounds, backgroundActions, backgroundRemoval, prefsAfterDelete, categoriesOf, backgroundDefaults, backgroundLook, withBackgroundDefaults,
    CATEGORY_SUGGESTIONS, normalizeCategories, categoryList, managedCategories, addCategory, renameCategory, removeCategory, moveCategory, inCategory,
} from "./backgroundPrefs.js";
import { bundledBackgrounds, bundledBackgroundId } from "../backgrounds.js";

test("a bundled background has one key whatever serves it", () => {
    assert.equal(sourceOf("http://127.0.0.1:7700/media/bundled/backgrounds/1557672172-298e090bd0f1.webp"), "bundled:1557672172-298e090bd0f1");
    assert.equal(sourceOf("http://192.168.0.9:7700/media/bundled/backgrounds/1557672172-298e090bd0f1.webp"), "bundled:1557672172-298e090bd0f1");
    assert.equal(sourceOf("https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&q=80"), "bundled:1557672172-298e090bd0f1");
    assert.equal(sourceOf("http://127.0.0.1:7700/media/abc.png"), "http://127.0.0.1:7700/media/abc.png", "the church's images: the URL");
});

const bundled = [{ id: "a", url: "u/a", category: "Natureza" }, { id: "b", url: "u/b", category: "Abstrato" }, { id: "c", url: "u/c", category: "Natureza" }];
const images = [{ id: "m1", url: "http://h/media/m1.png", title: "Cruz" }];

test("the list: settings over the factory names and categories", () => {
    const prefs = [
        { source: "bundled:b", name: " Ondas ", category: "Cruz e igreja", dim_pct: 70, blur_px: 30, favorite: true },
        { source: "bundled:c", hidden: true, category: "  " },
        { source: "http://h/media/m1.png", dim_pct: -5 },
    ];
    const list = backgroundList({ bundled, images, prefs });
    assert.deepEqual(list.map((b) => [b.source, b.name, b.category]), [
        ["bundled:a", "Fundo 1", "Natureza"], ["bundled:b", "Ondas", "Cruz e igreja"], ["bundled:c", "Fundo 3", "Natureza"], ["http://h/media/m1.png", "Cruz", "Suas imagens"],
    ]);
    assert.equal(list[1].dim, 0.7);
    assert.equal(list[1].blur, 20, "kept in range");
    assert.equal(list[0].dim, null, "nothing set: the screen's own default");
    assert.equal(list[3].dim, 0);
    assert.deepEqual(visibleBackgrounds(list).map((b) => b.source), ["bundled:b", "bundled:a", "http://h/media/m1.png"], "favourites first, hidden gone");
    assert.deepEqual(visibleBackgrounds(list, { only: "Natureza" }).map((b) => b.source), ["bundled:a"]);
    assert.deepEqual(visibleBackgrounds(list, { except: "Suas imagens" }).map((b) => b.source), ["bundled:b", "bundled:a"]);
    assert.deepEqual(categoriesOf([...list, { category: "Páscoa" }, { category: "Batismo" }]), ["Natureza", "Cruz e igreja", "Batismo", "Páscoa", "Suas imagens"]);
});

test("a factory photo goes by its own name; the portrait left the set (audit C-44)", () => {
    const list = backgroundList({ bundled: [{ id: "a", url: "u/a", name: "Nebulosa" }, { id: "b", url: "u/b" }], prefs: [{ source: "bundled:1507003211169-0a1dd7228f2d", name: "Retrato" }] });
    assert.deepEqual(list.map((b) => b.name), ["Nebulosa", "Fundo 2"], "a settings row for a photo out of the set is skipped");
    const factory = bundledBackgrounds();
    assert.ok(!factory.some((b) => b.id.startsWith("1507003211169")));
    assert.ok(factory.every((b) => b.name && b.category), "every factory photo has a name and a category");
    assert.equal(new Set(factory.map((b) => b.name)).size, factory.length, "names tell them apart");
    assert.equal(bundledBackgroundId("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920"), "1507003211169-0a1dd7228f2d", "an imported row keeps its file");
});

test("the church's categories: a stored list, the suggestions until it edits one", () => {
    assert.equal(normalizeCategories(null), null);
    assert.equal(normalizeCategories("Natureza"), null);
    assert.deepEqual(normalizeCategories(["  Páscoa ", "páscoa", "", 7, "Suas imagens", "Santa  Ceia"]), ["Páscoa", "Santa Ceia"], "trimmed, once each, never the church's own images");
    assert.deepEqual(normalizeCategories([]), [], "all deleted is a list too");
    assert.deepEqual(categoryList(null), CATEGORY_SUGGESTIONS);
    assert.deepEqual(categoryList(["Batismo", "Natureza"]), ["Batismo", "Natureza"]);

    const entries = [{ category: "Natureza" }, { category: "Batismo" }, { category: "Páscoa" }, { category: "Suas imagens" }];
    assert.deepEqual(categoriesOf(entries, ["Páscoa", "Natureza", "Ceia"]), ["Páscoa", "Natureza", "Batismo", "Suas imagens"], "the church's order, then names in use outside it; empty ones not as chips");
    assert.deepEqual(managedCategories(["Páscoa", "Ceia"], entries), ["Páscoa", "Ceia", "Batismo", "Natureza"], "Configurações lists the empty ones and the strays");
});

test("create, rename, delete and reorder a category", () => {
    const list = ["Adoração", "Natureza", "Outros"];
    assert.deepEqual(addCategory(list, "  Páscoa "), { list: ["Adoração", "Natureza", "Outros", "Páscoa"], name: "Páscoa" });
    assert.ok(addCategory(list, "natureza").error, "no twin, whatever the case");
    assert.ok(addCategory(list, "   ").error);
    assert.ok(addCategory(list, "Seus vídeos").error);

    assert.deepEqual(renameCategory(list, "Natureza", "Paisagens"), { list: ["Adoração", "Paisagens", "Outros"], name: "Paisagens" });
    assert.deepEqual(renameCategory(list, "Natureza", "natureza").list, ["Adoração", "natureza", "Outros"], "a change of case is a rename");
    assert.ok(renameCategory(list, "Natureza", "Adoração").error);
    assert.ok(renameCategory(list, "Outros", "Diversos").error, "Outros keeps its name");
    assert.deepEqual(renameCategory(list, "Batismo", "Batismos").list, ["Adoração", "Natureza", "Outros", "Batismos"], "a name in use outside the list joins it");

    assert.deepEqual(removeCategory(list, "Natureza").list, ["Adoração", "Outros"]);
    assert.ok(removeCategory(list, "Outros").error);

    assert.deepEqual(moveCategory(list, "Natureza", -1), ["Natureza", "Adoração", "Outros"]);
    assert.deepEqual(moveCategory(list, "Outros", 1), list, "at the end: the same");
    assert.deepEqual(moveCategory(list, "Nenhuma", 1), list);
});

test("a rename or a delete moves the factory photos with no settings too", () => {
    const list = backgroundList({ bundled, images, prefs: [{ source: "bundled:b", category: "Natureza" }] });
    assert.deepEqual(inCategory(list, "Natureza").map((b) => b.source), ["bundled:a", "bundled:b", "bundled:c"]);
    assert.deepEqual(inCategory(list, "Natureza").map((b) => Boolean(b.pref)), [false, true, false], "two of them get their first BackgroundPref");
});

test("a background is listed once, however many times Mídia holds it", () => {
    const file = "http://127.0.0.1:7700/media/bundled/backgrounds/a.webp";
    const list = backgroundList({
        bundled,
        images: [
            { id: "m1", url: file, title: "Fundo · luz" },
            { id: "m2", url: "https://images.unsplash.com/photo-b?w=1920", title: "Ondas" },
            { id: "m3", url: "http://h/media/x.png", title: "Cruz" },
            { id: "m4", url: "http://h/media/x.png", title: "Cruz (cópia)" },
        ],
        videos: [{ id: "v1", url: "http://h/media/v.mp4" }, { id: "v2", url: "http://h/media/v.mp4" }],
    });
    const sources = list.map((b) => b.source);
    assert.equal(new Set(sources).size, sources.length, "no source twice");
    assert.deepEqual(sources, ["bundled:a", "bundled:b", "bundled:c", "http://h/media/x.png", "http://h/media/v.mp4"]);
    assert.equal(list[0].category, "Natureza", "the factory entry wins");
    assert.equal(list[3].name, "Cruz");
});

test("every background can leave the library, each by its origin (owner 2026-10-16)", () => {
    const list = backgroundList({
        bundled,
        images: [{ id: "m1", url: "http://h/media/own.png" }, { id: "m2", url: "http://h/media/midia.png", origin: "media" }],
        prefs: [{ source: "bundled:b", hidden: true }, { source: "http://h/media/midia.png", hidden: true }],
    });
    const by = (s) => list.find((b) => b.source === s);
    assert.deepEqual(list.map((b) => b.origin), ["keryx", "keryx", "keryx", "own", "media"]);
    assert.equal(by("http://h/media/own.png").mediaId, "m1");
    assert.deepEqual(backgroundActions(by("bundled:a")), ["exclude"], "a factory photo is excluded, never its file");
    assert.deepEqual(backgroundActions(by("bundled:b")), ["restore"], "excluded: it comes back");
    assert.deepEqual(backgroundActions(by("http://h/media/own.png")), ["delete"]);
    assert.deepEqual(backgroundActions(by("http://h/media/midia.png")), ["restore", "untrack"], "an old Oculto Mídia picture: back, or out of the backgrounds");
    assert.deepEqual(backgroundActions(null), []);
    assert.deepEqual(visibleBackgrounds(list).map((b) => b.source), ["bundled:a", "bundled:c", "http://h/media/own.png"], "the excluded ones are not offered");
});

test("an item's background brings its dim and blur, unless the item has its own", () => {
    const prefs = [{ source: "bundled:a", dim_pct: 60, blur_px: 4 }, { source: "bundled:b", blur_px: 8 }];
    const url = "http://127.0.0.1:7700/media/bundled/backgrounds/a.webp";
    assert.deepEqual(backgroundDefaults(prefs, url), { dim: 0.6, blur: 4 });
    assert.deepEqual(backgroundDefaults(prefs, "x.png"), { dim: null, blur: null });
    const show = (style) => withBackgroundDefaults("content.show", { title: "Hino", style }, prefs).style;
    assert.deepEqual(show({ background_image: url }), { background_image: url, background_dim: 0.6, background_blur: 4 });
    assert.deepEqual(show({ background_image: url, background_dim: 0.2 }), { background_image: url, background_dim: 0.2, background_blur: 4 }, "the item's own wins");
    assert.deepEqual(show({ background_image: "http://127.0.0.1:7700/media/bundled/backgrounds/b.webp" }).background_dim, undefined, "only what was set");
    const media = { kind: "image", url };
    assert.equal(withBackgroundDefaults("media.show", media, prefs), media);
    const plain = { style: { font_size: "large" } };
    assert.equal(withBackgroundDefaults("content.show", plain, prefs), plain, "no background: untouched");
});

test("an aviso and the idle wallpaper bring their background's dim and blur too", () => {
    const prefs = [{ source: "bundled:a", dim_pct: 60, blur_px: 4 }];
    const url = "http://127.0.0.1:7700/media/bundled/backgrounds/a.webp";
    const piece = (extra) => ({ id: "p", title: "Aviso", background_image: url, ...extra });
    const one = withBackgroundDefaults("communication.show", { item: piece() }, prefs).item;
    assert.deepEqual([one.background_dim, one.background_blur], [0.6, 4]);
    assert.equal(withBackgroundDefaults("communication.show", { item: piece({ background_dim: 0.1 }) }, prefs).item.background_dim, 0.1, "the aviso's own wins");
    const seq = withBackgroundDefaults("communication.show", { playlist: [piece(), { id: "q", background_color: "#000" }], index: 0 }, prefs);
    assert.equal(seq.playlist[0].background_dim, 0.6);
    assert.equal(seq.playlist[1].background_dim, undefined, "a colour: nothing to add");
    const none = { item: { id: "p", background_color: "#112233" } };
    assert.equal(withBackgroundDefaults("communication.show", none, prefs), none, "no picture: untouched");
    assert.deepEqual(withBackgroundDefaults("idle.set", { mode: "background", url }, prefs), { mode: "background", url, dim: 0.6, blur: 4 });
    assert.deepEqual(withBackgroundDefaults("idle.set", { mode: "background", url: "x.png" }, prefs), { mode: "background", url: "x.png", dim: null, blur: null }, "no pref: clears the old wallpaper's look");
    const given = { mode: "background", url, dim: 0.2 };
    assert.equal(withBackgroundDefaults("idle.set", given, prefs), given, "an explicit look is kept");
    const mode = { mode: "black" };
    assert.equal(withBackgroundDefaults("idle.set", mode, prefs), mode, "a mode change alone: untouched");
});

test("a background's whole look: dim, blur, fit and position, filled into the Fundo", () => {
    const url = "keryx-media://bundled/backgrounds/1557672172-298e090bd0f1.webp";
    const prefs = [{ source: "bundled:1557672172-298e090bd0f1", dim_pct: 70, blur_px: 6, fit: "contain", position: "top" }];
    assert.deepEqual(backgroundLook(prefs, url), { dim: 0.7, blur: 6, fit: "contain", position: "top" });
    assert.deepEqual(backgroundLook([{ source: "x.png", fit: "stretch" }], "x.png"), { dim: null, blur: null, fit: null, position: null });
    const set = withBackgroundDefaults("background.set", { kind: "image", value: url }, prefs);
    assert.deepEqual([set.dim, set.blur, set.fit, set.position], [0.7, 6, "contain", "top"]);
    const own = withBackgroundDefaults("background.set", { kind: "image", value: url, fit: "cover", dim: 0.2 }, prefs);
    assert.deepEqual([own.dim, own.fit, own.position], [0.2, "cover", "top"], "what the call brings stays");
    const gen = { kind: "generator", value: "fluid" };
    assert.equal(withBackgroundDefaults("background.set", gen, prefs), gen);
});

test("the papel de parede Esc puts back carries its own look (0.2.18)", () => {
    const url = "keryx-media://bundled/backgrounds/1557672172-298e090bd0f1.webp";
    // Escurecer 0 % in the library: an explicit 0, not "padrão".
    const prefs = [{ source: "bundled:1557672172-298e090bd0f1", dim_pct: 0 }];
    const def = withBackgroundDefaults("background.default", { background: { kind: "image", value: url } }, prefs);
    assert.equal(def.background.dim, 0, "the same 0 the Fundo on screen got");
    assert.equal(withBackgroundDefaults("background.set", { kind: "image", value: url }, prefs).dim, 0);
    const none = { background: null };
    assert.equal(withBackgroundDefaults("background.default", none, prefs), none);
    const color = { background: { kind: "color", value: "#000000" } };
    assert.equal(withBackgroundDefaults("background.default", color, prefs), color);
});

test("several backgrounds out at once: each origin its way, one plan (owner 2026-10-21, M3)", () => {
    const list = backgroundList({
        bundled,
        images: [
            { id: "m1", url: "http://h/media/own.png" }, { id: "m3", url: "http://h/media/twice.png" },
            { id: "m2", url: "http://h/media/midia.png", origin: "media" },
        ],
        prefs: [
            { id: "p-b", source: "bundled:b", hidden: true }, { id: "p-own", source: "http://h/media/own.png", category: "Cruz" },
            { id: "p-twice", source: "http://h/media/twice.png" }, { id: "p-midia", source: "http://h/media/midia.png" },
        ],
    });
    const by = (s) => list.find((b) => b.source === s);
    const plan = backgroundRemoval(["bundled:a", "bundled:b", "http://h/media/own.png", "http://h/media/twice.png", "http://h/media/midia.png"].map(by));
    assert.deepEqual(plan.exclude.map((b) => b.source), ["bundled:a"], "a factory photo goes to Excluídos");
    assert.deepEqual(plan.skipped.map((b) => b.source), ["bundled:b"], "already excluded: nowhere further");
    assert.deepEqual(plan.delete.map((b) => b.mediaId), ["m1", "m3"], "the files sent here are deleted");
    assert.deepEqual(plan.untrack.map((b) => b.source), ["http://h/media/midia.png"], "a Mídia picture only leaves the backgrounds");
    assert.deepEqual(backgroundRemoval([]), { exclude: [], delete: [], untrack: [], skipped: [] });

    const media = [
        { id: "m1", file_url: "http://h/media/own.png" }, { id: "m3", file_url: "http://h/media/twice.png" },
        { id: "m4", file_url: "http://h/media/twice.png" },
    ];
    assert.deepEqual(prefsAfterDelete(plan.delete, media), ["p-own"], "another copy of twice.png stays a background: its settings stay");
    assert.deepEqual(prefsAfterDelete([by("http://h/media/twice.png")], media.slice(0, 2)), ["p-twice"], "the last copy: its settings go too");
    assert.deepEqual(prefsAfterDelete([], media), [], "a file whose delete failed keeps its look and category");
    const copy = { ...by("http://h/media/twice.png"), mediaId: "m4" };
    assert.deepEqual(prefsAfterDelete([by("http://h/media/twice.png"), copy], media), ["p-twice"], "both copies gone: once");
});
