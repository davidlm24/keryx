import test from "node:test";
import assert from "node:assert/strict";
import { sourceOf, backgroundList, visibleBackgrounds, categoriesOf, backgroundDefaults, withBackgroundDefaults } from "./backgroundPrefs.js";

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
