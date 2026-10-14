import test from "node:test";
import assert from "node:assert/strict";
import { normalizePref, isDefaultPref, isDefaultSettings, prefViewKey, prefState, prefVars, themeLook, outputMeta, outputLook, ICON_CHOICES, stageOptions, pastorOptions, lyricsOptions, STAGE_DEFAULTS, PASTOR_DEFAULTS, streamOptions, bandBackground, STREAM_DEFAULTS, hideKinds, showKindsFor, stageHidden, hiddenOnAir , designOf } from "./outputPrefs.js";

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
        assert.deepEqual(p, { content: "", hidden: [], scale: 1, margin: 0, showLogo: true, themeId: "", design: null, layoutId: "", name: "", icon: "", options: {} });
        assert.ok(isDefaultPref(p));
        assert.equal(prefVars(p), null);
        assert.deepEqual(prefState("/LyricProjection", live, p), prefState("/LyricProjection", live, null));
        assert.equal(prefState("/Projection", live, p), live);
    }
});

test("normalizePref clamps scale and margins and drops unknown content", () => {
    assert.deepEqual(normalizePref({ text_scale: 300, margin_pct: -4, content: "cifra" }), { content: "", hidden: [], scale: 1.4, margin: 0, showLogo: true, themeId: "", design: null, layoutId: "", name: "", icon: "", options: {} });
    assert.deepEqual(normalizePref({ text_scale: 50, margin_pct: 25, content: "lyrics", show_logo: false, theme_id: "t1" }), { content: "lyrics", hidden: [], scale: 0.8, margin: 10, showLogo: false, themeId: "t1", design: null, layoutId: "", name: "", icon: "", options: {} });
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

test("the Palco's and the Pastor's own switches: missing keys are the screen as before", () => {
    assert.deepEqual(stageOptions(normalizePref(null)), STAGE_DEFAULTS);
    assert.deepEqual(pastorOptions(normalizePref(null)), PASTOR_DEFAULTS);
    const p = normalizePref({ options: { chords: false, clock: "sim", next_count: 99 } });
    assert.deepEqual(stageOptions(p), { chords: false, labels: true, clock: true, notes: true, next: true }, "a non-boolean counts as unset");
    assert.deepEqual(pastorOptions(p), { chords: false, labels: false, clock: true, next_count: 5 }, "next_count clamps to 0..5");
    assert.equal(pastorOptions(normalizePref({ options: { next_count: 0 } })).next_count, 0, "0 is a choice (hide the list)");
    assert.deepEqual(normalizePref({ options: ["x"] }).options, {}, "an array is not options");
    assert.ok(!isDefaultPref(normalizePref({ options: { chords: false } })), "an option counts as an adjustment");
});

test("Transmissão: the band's options, clamped; none = the band as always", () => {
    assert.deepEqual(streamOptions(null), STREAM_DEFAULTS);
    assert.deepEqual(streamOptions({ options: { band: "#FF0000", band_opacity: 2, size: "l", position: "top", show_ref: false } }),
        { band: "#ff0000", band_opacity: 1, size: "l", position: "top", show_ref: false });
    assert.deepEqual(streamOptions({ options: { band: "red", band_opacity: "x", size: "huge", position: "left" } }), STREAM_DEFAULTS);
    assert.equal(bandBackground(STREAM_DEFAULTS), "rgba(10, 10, 12, 0.78)");
    assert.equal(bandBackground({ band: "#ffffff", band_opacity: 0 }), "rgba(255, 255, 255, 0)");
});

// Mostrar (2026-10-12): kinds an output leaves out.
const songLive = {
    screen: "show",
    content: { kind: "lyrics", title: "Grande é o Senhor", index: 0, slides: [{ text: "Grande é o Senhor" }], audio: "keryx-media://faixa.mp3", startedAt: 5 },
    media: null,
    tool: { mode: "clock" },
    communication: { item: { title: "Aviso" } },
    alert: { type: "message", message: "Carro ABC-1234" },
    background: { kind: "color", value: "#000000" },
};

test("Mostrar: unknown kinds are dropped, the order is fixed, nothing hidden is the default", () => {
    assert.deepEqual(normalizePref({ hidden_kinds: ["alert", "nope", "lyrics", "alert"] }).hidden, ["lyrics", "alert"]);
    assert.deepEqual(normalizePref({ hidden_kinds: "lyrics" }).hidden, []);
    assert.ok(isDefaultPref(normalizePref({ hidden_kinds: [] })));
    assert.ok(!isDefaultPref(normalizePref({ hidden_kinds: ["bible"] })));
});

test("Mostrar: a hidden kind on air goes, the rest stays; the same state when nothing hidden is on air", () => {
    const noLyrics = prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["lyrics"] }));
    assert.equal(noLyrics.content, null);
    assert.ok(noLyrics.tool && noLyrics.communication && noLyrics.alert);
    // The song's playback track keeps playing on that output.
    assert.deepEqual(noLyrics.track, { src: "keryx-media://faixa.mp3", startedAt: 5 });
    // Hiding Bíblia leaves a song alone: the very same state.
    assert.equal(hideKinds(songLive, ["bible"]), songLive);
    const quiet = prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["tool", "communication", "alert"] }));
    assert.equal(quiet.tool, null);
    assert.equal(quiet.communication, null);
    assert.equal(quiet.alert, null);
    assert.equal(quiet.content.title, "Grande é o Senhor");
    // Logo, background and theme settings still apply on top.
    assert.equal(prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["lyrics"], show_logo: false })).background.value, "#000000");
});

test("Mostrar offers only what the output's view can show", () => {
    assert.deepEqual(showKindsFor("/Projection", normalizePref({})).map((k) => k.id), ["lyrics", "bible", "text", "media", "tool", "communication", "alert"]);
    assert.deepEqual(showKindsFor("/LyricProjection", normalizePref({})).map((k) => k.id), ["lyrics", "bible", "text", "alert"]);
    assert.deepEqual(showKindsFor("/VideoProjection", normalizePref({})), []);
    assert.deepEqual(showKindsFor("/CommunicationProjection", normalizePref({})), []);
    // A projector set to "Só letras" offers the Letras kinds.
    assert.deepEqual(showKindsFor("/Projection", normalizePref({ content: "lyrics" })).map((k) => k.id), ["lyrics", "bible", "text", "alert"]);
});

test("the Prévia says when the output it previews hides the prepared kind", () => {
    const pref = normalizePref({ hidden_kinds: ["bible", "communication"] });
    assert.equal(stageHidden("bible", pref), "Bíblia");
    assert.equal(stageHidden("piece", pref), "Avisos");
    assert.equal(stageHidden("lyrics", pref), null);
    assert.equal(stageHidden("audio", pref), null);
    assert.equal(stageHidden("bible", normalizePref({})), null);
    assert.equal(hiddenOnAir(songLive, normalizePref({ hidden_kinds: ["alert"] })), "Aviso rápido");
    assert.equal(hiddenOnAir(songLive, normalizePref({ hidden_kinds: ["bible"] })), null);
});

test("an output with a theme of its own ignores the song parts' themes", () => {
    const withParts = { ...live, content: { ...live.content, slides: [{ text: "Refrão", style: { font_family: "serif", background_image: "keryx-media://parte.webp" } }] } };
    const theme = { id: "t1", font_family: "mono", text_color: "#00ff00" };
    const s = prefState("/Projection", withParts, normalizePref({ theme_id: "t1" }), theme);
    assert.equal(s.content.slides[0].style, undefined);
    assert.equal(s.content.style.font_family, "mono");
    // Without an output theme the part keeps its look.
    assert.equal(prefState("/Projection", withParts, normalizePref({})).content.slides[0].style.font_family, "serif");
});

test("designOf: the screen's own design, else the old layout_id, else null", () => {
    const rows = [{ id: "L1", name: "Palco da sala", elements: [{ id: "e1", type: "clock", x: 1, y: 1, w: 20, h: 10 }] }];
    const own = normalizePref({ design: { elements: [{ id: "e2", type: "clock", x: 2, y: 2, w: 20, h: 10 }] } });
    assert.equal(designOf(own, rows).elements[0].id, "e2", "its own design wins");
    const old = normalizePref({ layout_id: "L1" });
    assert.equal(designOf(old, rows).name, "Palco da sala", "an old save reads its ScreenLayout, nothing written");
    assert.equal(designOf(normalizePref({ layout_id: "factory:palco" }), []).factory, true);
    assert.equal(designOf(normalizePref({ layout_id: "gone" }), rows), null, "a deleted layout falls back to the page");
    assert.equal(designOf(normalizePref({}), rows), null);
});

test("Restaurar padrão: the settings alone, the drawing aside", () => {
    const drawn = normalizePref({ design: { elements: [{ id: "a", type: "clock" }] } });
    assert.equal(isDefaultPref(drawn), false, "a drawing counts as an adjustment of the screen");
    assert.equal(isDefaultSettings(drawn), true, "but not of its settings: Restaurar padrão has nothing to put back");
    assert.equal(isDefaultSettings(normalizePref({ layout_id: "old" })), true, "an old layout pointer is the drawing too");
    assert.equal(isDefaultSettings(normalizePref({ text_scale: 120, design: { elements: [] } })), false);
});

test("chords and part names: each screen's own choice, on the Palco by default only", () => {
    const none = normalizePref(null);
    assert.deepEqual(lyricsOptions("/StageView", none), { chords: true, labels: true });
    for (const page of ["/Projection", "/LyricProjection", "/PastorView"]) assert.deepEqual(lyricsOptions(page, none), { chords: false, labels: false }, page);
    const on = normalizePref({ options: { chords: true, labels: true } });
    assert.deepEqual(lyricsOptions("/Projection", on), { chords: true, labels: true });
    assert.deepEqual(lyricsOptions("/StageView", normalizePref({ options: { labels: false } })), { chords: true, labels: false });
    // prefState hands the choice to the renderer with the content.
    assert.equal(prefState("/Projection", live, none).content.show, undefined, "nothing added: the congregation sees only the lyrics");
    assert.deepEqual(prefState("/Projection", live, on).content.show, { chords: true, labels: true });
    assert.equal(live.content.show, undefined, "the live state itself is untouched");
    assert.equal(prefState("/Projection", { ...live, content: null }, on).content, null);
});
