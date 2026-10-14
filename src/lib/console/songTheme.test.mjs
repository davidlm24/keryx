import test from "node:test";
import assert from "node:assert/strict";
import { partOf, partKey, songParts, themeLookOf, cleanPartThemes, songTheme, withSongThemes } from "./songTheme.js";

const azul = { id: "t-azul", name: "Azul", font_family: "serif", font_size: "xlarge", text_effect: "glow", text_color: "#ccddff", background_image: "keryx-media://azul.webp", background_dim: 0.3 };
const sem = { id: "t-sem", name: "Sem fundo", font_family: "mono", text_color: "#ffee00" };
const THEMES = [azul, sem];
const slides = [
    { text: "Verso um", label: "Verso 1" },
    { text: "Refrão um", label: "Refrão", is_chorus: true },
    { text: "Verso dois", label: "Verso 2" },
    { text: "Refrão dois", label: "refrão", is_chorus: true },
    { text: "Coro sem rótulo", is_chorus: true },
    { text: "Solto" },
];
const content = { title: "Grande é o Senhor", slides, style: { font_family: "sans", font_size: "large", text_color: "#ffffff", background_image: "keryx-media://proprio.webp" } };

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

test("a theme's whole look, picture and its darkening included, empty values out", () => {
    const look = themeLookOf(azul);
    assert.equal(look.font_family, "serif");
    assert.equal(look.text_color, "#ccddff");
    assert.equal(look.background_image, "keryx-media://azul.webp");
    assert.equal(look.background_dim, 0.3);
    assert.ok(!("text_color_2" in look));
    assert.ok(!("background_image" in themeLookOf(sem)));
    assert.deepEqual(themeLookOf(null), {});
});

test("part_themes is cleaned: lower-case keys, blank and odd values dropped", () => {
    assert.deepEqual(cleanPartThemes({ "Refrão": "t-azul", Ponte: "", Verso: 3 }), { "refrão": "t-azul" });
    assert.deepEqual(cleanPartThemes(null), {});
    assert.deepEqual(cleanPartThemes(["x"]), {});
});

test("a song following a theme takes its whole look; a deleted theme falls back to the song's own", () => {
    const linked = withSongThemes(content, { theme_id: "t-azul" }, THEMES);
    assert.equal(linked.style.font_family, "serif");
    // Its background goes to the Fundo layer when sent, not in the style.
    assert.equal(linked.style.background_image, undefined);
    assert.equal(linked.fundo.value, "keryx-media://azul.webp");
    assert.deepEqual(songTheme({ theme_id: "t-azul" }, THEMES), { theme: azul, missing: false });
    const gone = songTheme({ theme_id: "t-gone" }, THEMES);
    assert.deepEqual(gone, { theme: null, missing: true });
    assert.equal(withSongThemes(content, { theme_id: "t-gone" }, THEMES), content);
    assert.equal(withSongThemes(content, { theme_id: "" }, THEMES), content);
    assert.equal(withSongThemes(content, { theme_id: "t-azul" }, []), content);
});

test("a song's own theme carries its item-title choice as style.title", () => {
    const out = withSongThemes(content, { theme_id: "t-azul" }, [{ ...azul, show_item_title: false }]);
    assert.equal(out.style.title, "hide");
    assert.equal(withSongThemes(content, { theme_id: "t-azul" }, [{ ...azul, show_item_title: true }]).style.title, "show");
    // A theme without the field stamps nothing (the kind theme or the legacy
    // church pref then decides).
    assert.equal(withSongThemes(content, { theme_id: "t-azul" }, THEMES).style.title, undefined);
});

test("each themed part's slides carry their theme's look; the rest are untouched", () => {
    const out = withSongThemes(content, { part_themes: { "Refrão": "t-azul", "verso 2": "t-sem" } }, THEMES);
    assert.equal(out.style, content.style); // the song's look stays
    assert.equal(out.slides[0], slides[0]); // Verso 1: no theme, the same slide
    for (const i of [1, 3, 4]) assert.equal(out.slides[i].style.background_image, "keryx-media://azul.webp"); // every Refrão, with or without its label
    assert.equal(out.slides[2].style.font_family, "mono"); // Verso 2
    assert.ok(!("background_image" in out.slides[2].style)); // a theme without a picture keeps the song's
    assert.equal(out.slides[5], slides[5]);
    // A part pointing at a deleted theme: nothing changes.
    assert.equal(withSongThemes(content, { part_themes: { "refrão": "t-gone" } }, THEMES), content);
});
