import test from "node:test";
import assert from "node:assert/strict";
import { normalizePref, isDefaultPref, prefViewKey, prefState, prefVars, themeLook, outputMeta, outputLook, ICON_CHOICES } from "./outputPrefs.js";

const live = {
    screen: "show",
    content: { kind: "song", title: "Grande é o Senhor", index: 0, slides: [{ text: "Grande é o Senhor" }], style: { font_size: "large", text_color: "#ffffff" } },
    media: null,
    communication: { item: { title: "Aviso" } },
    logo: { visible: true, size: "medium", corner: "br" },
    background: { kind: "color", value: "#000000" },
};

test("no row, or an empty one, is the default: the output as before", () => {
    for (const row of [null, undefined, {}, { screen_path: "/Projection" }, { text_scale: "", margin_pct: null, show_logo: true, theme_id: "" }]) {
        const p = normalizePref(row);
        assert.deepEqual(p, { content: "", scale: 1, margin: 0, showLogo: true, themeId: "", name: "", icon: "" });
        assert.ok(isDefaultPref(p));
        assert.equal(prefVars(p), null);
        assert.deepEqual(prefState("/LyricProjection", live, p), prefState("/LyricProjection", live, null));
        assert.equal(prefState("/Projection", live, p), live);
    }
});

test("normalizePref clamps scale and margins and drops unknown content", () => {
    assert.deepEqual(normalizePref({ text_scale: 300, margin_pct: -4, content: "cifra" }), { content: "", scale: 1.4, margin: 0, showLogo: true, themeId: "", name: "", icon: "" });
    assert.deepEqual(normalizePref({ text_scale: 50, margin_pct: 25, content: "lyrics", show_logo: false, theme_id: "t1" }), { content: "lyrics", scale: 0.8, margin: 10, showLogo: false, themeId: "t1", name: "", icon: "" });
    assert.equal(normalizePref({ text_scale: 112.4 }).scale, 1.12);
});

test("Conteúdo picks another output's view; empty keeps the page's own", () => {
    assert.equal(prefViewKey("/Projection", normalizePref({ content: "lyrics" })), "/LyricProjection");
    assert.equal(prefViewKey("/LyricProjection", normalizePref({})), "/LyricProjection");
    // A projector set to "Só letras" drops the aviso, as the Letras screen does.
    assert.equal(prefState("/Projection", live, normalizePref({ content: "lyrics" })).communication, null);
    assert.equal(prefState("/LyricProjection", live, normalizePref({ content: "notices" })).content, undefined);
});

test("Mostrar logo off hides the logo layer only on this output", () => {
    const s = prefState("/Projection", live, normalizePref({ show_logo: false }));
    assert.equal(s.logo.visible, false);
    assert.equal(live.logo.visible, true);
});

test("a theme sets its text look and background, leaving keys it does not set", () => {
    const theme = { name: "Noite", font_size: "xlarge", text_color: "#ffcc00", text_effect: "", background_image: "http://127.0.0.1:7700/media/x.webp", background_dim: 0.6 };
    assert.deepEqual(themeLook(theme), { font_size: "xlarge", text_color: "#ffcc00" });
    const s = prefState("/Projection", live, normalizePref({ theme_id: "t1" }), theme);
    assert.equal(s.content.style.font_size, "xlarge");
    assert.equal(s.content.style.text_color, "#ffcc00");
    assert.deepEqual(s.background, { kind: "image", value: theme.background_image, title: "Noite", dim: 0.6 });
    // The theme row not loaded yet: the live look.
    assert.equal(prefState("/Projection", live, normalizePref({ theme_id: "t1" }), null).content.style.font_size, "large");
});

test("prefVars carries scale and margins as CSS variables", () => {
    assert.deepEqual(prefVars(normalizePref({ text_scale: 120, margin_pct: 5 })), { "--kp-text": "1.2", "--kp-margin": "5cqw" });
});

test("outputLook: the row's name and icon, else the factory's (today's exactly)", () => {
    assert.deepEqual(
        ["/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection", "/StageView", "/PastorView", "/StreamView"].map((p) => outputLook(p, null)),
        [{ name: "Projeção", custom: "", icon: "projector" }, { name: "Letras", custom: "", icon: "tv" }, { name: "Vídeo", custom: "", icon: "film" }, { name: "Avisos", custom: "", icon: "megaphone" },
            { name: "Palco", custom: "", icon: "monitor" }, { name: "Pastor", custom: "", icon: "tablet" }, { name: "Transmissão", custom: "", icon: "external" }],
        "no row = the names and icons the app always had; custom empty keeps each surface's own label");
    assert.deepEqual(outputLook("/Projection", { name: "  Telão  ", icon: "star" }), { name: "Telão", custom: "Telão", icon: "star" });
    assert.deepEqual(outputLook("/Projection", { name: "   ", icon: "Má!" }), { name: "Projeção", custom: "", icon: "projector" }, "blank name and a bad icon fall back");
    assert.equal(outputLook("/Projection", { name: "x".repeat(60) }).name.length, 40, "names are capped");
    assert.deepEqual(outputMeta("/qualquer"), { name: "/qualquer", icon: "monitor" });
    assert.ok(ICON_CHOICES.includes("projector") && ICON_CHOICES.includes("tablet"));
    assert.ok(!isDefaultPref(normalizePref({ name: "Telão" })), "a name alone counts as an adjustment");
});
