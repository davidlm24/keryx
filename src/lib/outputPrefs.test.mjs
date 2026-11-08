import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRule, ruleOf, defaultRule, applyRule, ruleShortcut, ruleLabel, ruleSummary, outputsNotShowing, RULE_SHORTCUTS, normalizePref, isDefaultPref, isDefaultSettings, prefViewKey, prefState, prefVars, themeLook, outputMeta, outputLook, ICON_CHOICES, stageOptions, pastorOptions, lyricsOptions, STAGE_DEFAULTS, PASTOR_DEFAULTS, streamOptions, bandBackground, STREAM_DEFAULTS, designOf, ownsTheme, alertOptions, isDefaultAlert, cleanAlertOptions, showsAlert, alertOf, ALERT_DEFAULTS, alertDefaults } from "./outputPrefs.js";

const live = {
    screen: "show",
    content: { kind: "lyrics", title: "Grande é o Senhor", index: 0, slides: [{ text: "Grande é o Senhor" }], style: { font_size: "large", text_color: "#ffffff" } },
    media: null,
    communication: { item: { title: "Aviso" } },
    logo: { visible: true, size: "medium", corner: "br" },
    background: { kind: "color", value: "#000000" },
};

test("no row, or an empty one, is the default: the output as before", () => {
    for (const row of [null, undefined, {}, { screen_path: "/Projection" }, { text_scale: "", margin_pct: null, show_logo: true, theme_id: "" }]) {
        const p = normalizePref(row);
        assert.deepEqual(p, { content: "", hidden: [], scale: 1, margin: 0, showLogo: true, themeId: "", design: null, layoutId: "", name: "", icon: "", options: {}, rule: null });
        assert.ok(isDefaultPref(p));
        assert.equal(prefVars(p), null);
        assert.deepEqual(prefState("/LyricProjection", live, p), prefState("/LyricProjection", live, null));
        assert.equal(prefState("/Projection", live, p), live);
    }
});

test("normalizePref clamps scale and margins and drops unknown content", () => {
    assert.deepEqual(normalizePref({ text_scale: 300, margin_pct: -4, content: "cifra" }), { content: "", hidden: [], scale: 1.4, margin: 0, showLogo: true, themeId: "", design: null, layoutId: "", name: "", icon: "", options: {}, rule: null });
    assert.deepEqual(normalizePref({ text_scale: 50, margin_pct: 25, content: "lyrics", show_logo: false, theme_id: "t1" }), { content: "lyrics", hidden: [], scale: 0.8, margin: 10, showLogo: false, themeId: "t1", design: null, layoutId: "", name: "", icon: "", options: {}, rule: null });
    assert.equal(normalizePref({ text_scale: 112.4 }).scale, 1.12);
});

test("Conteúdo picks another output's view; empty keeps the page's own", () => {
    assert.equal(prefViewKey("/Projection", normalizePref({ content: "lyrics" })), "/LyricProjection");
    assert.equal(prefViewKey("/LyricProjection", normalizePref({})), "/LyricProjection");
    // A projector set to "Só letras" drops the aviso, as the Letras screen does.
    assert.equal(prefState("/Projection", live, normalizePref({ content: "lyrics" })).communication, null);
    assert.equal(prefState("/LyricProjection", live, normalizePref({ content: "notices" })).content, null);
});

test("Mostrar logo off hides the logo layer only on this output", () => {
    const s = prefState("/Projection", live, normalizePref({ show_logo: false }));
    assert.equal(s.logo.visible, false);
    assert.equal(live.logo.visible, true);
});

test("a theme sets its text look and background, leaving keys it does not set", () => {
    const theme = { name: "Noite", font_size: "xlarge", text_color: "#ffcc00", text_effect: "", background_image: "http://127.0.0.1:7700/media/x.webp", background_dim: 0.6 };
    assert.deepEqual(themeLook(theme), { font_size: "xlarge", text_color: "#ffcc00" });
    const s = prefState("/LyricProjection", live, normalizePref({ theme_id: "t1" }), theme);
    assert.equal(s.content.style.font_size, "xlarge");
    assert.equal(s.content.style.text_color, "#ffcc00");
    assert.deepEqual(s.background, { kind: "image", value: theme.background_image, title: "Noite", dim: 0.6 });
    // The theme row not loaded yet: the live look.
    assert.equal(prefState("/LyricProjection", live, normalizePref({ theme_id: "t1" }), null).content.style.font_size, "large");
});

test("the main Projeção has no theme of its own: an old theme_id on its row is never read", () => {
    const theme = { id: "t1", name: "Noite", font_size: "xlarge", text_color: "#ffcc00", background_image: "http://127.0.0.1:7700/media/x.webp" };
    assert.equal(ownsTheme("/Projection"), false);
    assert.equal(ownsTheme("/LyricProjection"), true);
    // Read from the row: the field stays in the database, the settings drop it.
    const p = normalizePref({ screen_path: "/Projection", theme_id: "t1", text_scale: 110 });
    assert.equal(p.themeId, "");
    assert.equal(p.scale, 1.1);
    assert.equal(normalizePref({ screen_path: "/LyricProjection", theme_id: "t1" }).themeId, "t1");
    // Even a pref that carries a themeId (no path on the row) cannot dress it.
    const s = prefState("/Projection", live, { ...normalizePref({}), themeId: "t1" }, theme);
    assert.equal(s.content.style.font_size, "large");
    assert.deepEqual(s.background, live.background);
    // A stale theme_id alone leaves the settings at their default ("Restaurar padrão" off).
    assert.ok(isDefaultPref(normalizePref({ screen_path: "/Projection", theme_id: "t1" })));
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

const ruleFor = (page, row) => ruleOf(normalizePref({ screen_path: page, ...row }), page);
const ALL = ["lyrics", "bible", "text", "image", "video", "youtube", "presentation", "tool", "notice"];

// The migration table of the G10 mockup ("Suas telas de hoje"): no row, or an
// old row, is the rule that draws the exact same screen as before.
test("O que esta tela recebe: no row is each page's own rule (the mockup's table)", () => {
    assert.deepEqual(ruleFor("/Projection", {}), { kinds: ALL, top: { alert: true, logo: true }, empty: "wall" }, "Projeção: Tudo, Aviso rápido and Logo on top");
    assert.deepEqual(ruleFor("/LyricProjection", {}), { kinds: ["lyrics", "bible", "text"], top: { alert: true, logo: true }, empty: "wall" }, "Letras: Letra e Bíblia (it drew the Logo layer, so the Logo stays)");
    assert.deepEqual(ruleFor("/VideoProjection", {}), { kinds: ["video", "youtube"], top: { alert: true, logo: false }, empty: "wall" }, "Vídeo: Vídeos");
    assert.deepEqual(ruleFor("/CommunicationProjection", {}), { kinds: ["notice"], top: { alert: true, logo: false }, empty: "wall" }, "Avisos: Avisos");
    for (const page of ["/StageView", "/PastorView", "/StreamView"]) assert.equal(ruleFor(page, {}).top.alert, true, page);
    assert.deepEqual(ruleOf(null, "/Projection"), defaultRule("/Projection"), "no pref at all is the page's");
    assert.equal(ruleShortcut(ruleFor("/Projection", {})), "all");
    assert.equal(ruleShortcut(ruleFor("/LyricProjection", {})), "letters");
    assert.equal(ruleShortcut(ruleFor("/VideoProjection", {})), "videos");
    assert.equal(ruleShortcut(ruleFor("/CommunicationProjection", {})), "notices");
});

test("O que esta tela recebe: an old Mostrar button off is that item unchecked; Conteúdo is the list of its view", () => {
    // Any output, a Mostrar button off: the same item unchecked (Personalizado).
    const noSongs = ruleFor("/Projection", { hidden_kinds: ["lyrics"] });
    assert.deepEqual(noSongs.kinds, ALL.filter((k) => k !== "lyrics"));
    assert.equal(ruleShortcut(noSongs), "custom");
    assert.deepEqual(ruleFor("/Projection", { hidden_kinds: ["media"] }).kinds, ALL.filter((k) => !["image", "video", "youtube"].includes(k)), "Imagens e vídeos was one switch");
    assert.deepEqual(ruleFor("/Projection", { hidden_kinds: ["presentation", "tool", "communication"] }).kinds, ["lyrics", "bible", "text", "image", "video", "youtube"]);
    assert.equal(ruleFor("/Projection", { hidden_kinds: ["alert"] }).top.alert, false, "the Aviso rápido on top follows its old button");
    assert.equal(ruleFor("/LyricProjection", { hidden_kinds: ["alert"] }).top.alert, false);
    assert.equal(ruleFor("/Projection", { show_logo: false }).top.logo, false, "Mostrar logo off is Logo no canto off");
    assert.equal(ruleFor("/LyricProjection", { show_logo: false }).top.logo, false);
    assert.equal(ruleFor("/VideoProjection", { show_logo: true }).top.logo, false, "Vídeo never drew the Logo layer: still not");
    // Conteúdo swapped (Letras with "Tudo"): the list of the chosen view, minus what was off.
    assert.deepEqual(ruleFor("/LyricProjection", { content: "all" }).kinds, ALL);
    assert.deepEqual(ruleFor("/LyricProjection", { content: "all", hidden_kinds: ["tool"] }).kinds, ALL.filter((k) => k !== "tool"));
    assert.deepEqual(ruleFor("/Projection", { content: "video" }), { kinds: ["video", "youtube"], top: { alert: true, logo: false }, empty: "wall" });
    assert.deepEqual(ruleFor("/StageView", { content: "lyrics" }).kinds, ["lyrics", "bible", "text"], "a Palco turned into a renderer view keeps its view");
});

test("O que esta tela recebe: a saved rule wins over every old field and is checked", () => {
    const saved = { kinds: ["notice", "youtube", "nope", "lyrics"], top: { alert: false, logo: true }, empty: "black" };
    const p = normalizePref({ screen_path: "/Projection", content: "video", hidden_kinds: ["alert"], show_logo: false, content_rule: saved });
    assert.deepEqual(p.rule, { kinds: ["lyrics", "youtube", "notice"], top: { alert: false, logo: true }, empty: "black" }, "unknown kinds dropped, the list's order");
    assert.deepEqual(ruleOf(p, "/Projection"), p.rule);
    assert.ok(!isDefaultPref(p));
    assert.equal(normalizeRule(null), null);
    assert.equal(normalizeRule("tudo"), null);
    assert.equal(normalizeRule({ kinds: "lyrics" }), null);
    assert.deepEqual(normalizeRule({ kinds: [] }), { kinds: [], top: { alert: true, logo: false }, empty: "wall" }, "an empty list is a choice");
    assert.equal(normalizeRule({ kinds: ["lyrics"], empty: "rosa" }).empty, "wall");
    assert.deepEqual(RULE_SHORTCUTS.map((s) => s.id), ["all", "letters", "videos", "notices"]);
});

test("O que esta tela recebe: the summary and the quadrant label", () => {
    assert.equal(ruleSummary(defaultRule("/Projection")), "Tudo · por cima: Aviso rápido, Logo");
    assert.equal(ruleSummary(defaultRule("/LyricProjection")), "Letra e Bíblia · por cima: Aviso rápido, Logo");
    assert.equal(ruleSummary(defaultRule("/VideoProjection")), "Vídeos · por cima: Aviso rápido");
    assert.equal(ruleSummary({ kinds: ["lyrics", "image"], top: { alert: true, logo: false }, empty: "wall" }), "Personalizado: Letras, Imagens · por cima: Aviso rápido");
    assert.equal(ruleSummary({ kinds: ["lyrics", "bible", "text", "image"], top: { alert: false, logo: false }, empty: "wall" }), "Personalizado: 4 tipos");
    assert.equal(ruleSummary({ kinds: [], top: { alert: false, logo: false }, empty: "wall" }), "Nada");
    assert.equal(ruleLabel(defaultRule("/CommunicationProjection")), "Avisos");
    assert.equal(ruleLabel({ kinds: ["image"] }), "Personalizado");
});

test("the rule: a kind not in the list goes, the rest stays; the same state when nothing on air is left out", () => {
    const noLyrics = prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["lyrics"] }));
    assert.equal(noLyrics.content, null);
    assert.ok(noLyrics.tool && noLyrics.communication && noLyrics.alert);
    // The song's playback track keeps playing on that output.
    assert.deepEqual(noLyrics.track, { src: "keryx-media://faixa.mp3", startedAt: 5 });
    // Leaving Bíblia out changes nothing for a song: the very same state.
    assert.equal(applyRule(songLive, ruleOf(normalizePref({ hidden_kinds: ["bible"] }), "/Projection")), songLive);
    const quiet = prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["tool", "communication", "alert"] }));
    assert.equal(quiet.tool, null);
    assert.equal(quiet.communication, null);
    assert.equal(quiet.alert, null);
    assert.equal(quiet.content.title, "Grande é o Senhor");
    // Papel de parede and theme settings still apply on top.
    assert.equal(prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["lyrics"], show_logo: false })).background.value, "#000000");
    assert.equal(applyRule(null, defaultRule("/Projection")), null);
});

test("the rule filters every layer by its kind: a video of the computer, YouTube, a picture, a PDF", () => {
    const withMedia = (kind) => ({ screen: "show", media: { kind, url: "x", title: "m" }, alert: null });
    const only = (...kinds) => ({ kinds, top: { alert: true, logo: false }, empty: "wall" });
    assert.ok(applyRule(withMedia("video"), only("video")).media);
    assert.equal(applyRule(withMedia("video"), only("youtube")).media, null, "a video file is not YouTube");
    assert.ok(applyRule(withMedia("youtube"), only("youtube")).media);
    assert.equal(applyRule(withMedia("youtube"), only("video")).media, null);
    assert.ok(applyRule(withMedia("image"), only("image")).media);
    assert.ok(applyRule(withMedia("gif"), only("image")).media, "a GIF is a picture");
    assert.equal(applyRule(withMedia("image"), only("video", "youtube")).media, null);
    // The video channel (the Vídeo screen's clip) follows the same list.
    const clip = { screen: "show", video: { kind: "youtube", url: "y" } };
    assert.ok(applyRule(clip, only("youtube")).video);
    assert.equal(applyRule(clip, only("video")).video, null);
    const pdf = { screen: "show", content: { kind: "presentation", slides: [] } };
    assert.ok(applyRule(pdf, only("presentation")).content);
    assert.equal(applyRule(pdf, only("lyrics", "bible", "text")).content, null);
});

test("the rule: overlays follow the text kinds, the Logo no canto its switch", () => {
    const st = { screen: "show", overlays: [{ text: "Bem-vindos" }], logo: { visible: true, size: "m", corner: "br" } };
    assert.equal(prefState("/Projection", st, normalizePref({})).overlays.length, 1);
    assert.equal(prefState("/LyricProjection", st, normalizePref({})).overlays.length, 1);
    assert.deepEqual(prefState("/VideoProjection", st, normalizePref({})).overlays, [], "Vídeo and Avisos never drew them");
    assert.deepEqual(prefState("/CommunicationProjection", st, normalizePref({})).overlays, []);
    assert.equal(prefState("/Projection", st, normalizePref({})).logo.visible, true);
    assert.equal(prefState("/VideoProjection", st, normalizePref({})).logo.visible, false);
    assert.equal(prefState("/Projection", st, normalizePref({ content_rule: { kinds: ALL, top: { alert: true, logo: false } } })).logo.visible, false);
    assert.equal(prefState("/VideoProjection", st, normalizePref({ content_rule: { kinds: ["video"], top: { alert: true, logo: true } } })).logo.visible, true, "any output can have the Logo on top now");
});

test("the rule: the console's Tela preta and Logo reach the screens that ever showed them", () => {
    const black = { screen: "black" };
    const logo = { screen: "logo" };
    assert.equal(prefState("/Projection", black, normalizePref({})).screen, "black");
    assert.equal(prefState("/LyricProjection", black, normalizePref({})).screen, "black");
    assert.equal(prefState("/VideoProjection", black, normalizePref({})).screen, "black", "Vídeo respected the black");
    assert.equal(prefState("/VideoProjection", logo, normalizePref({})).screen, "show", "but not the Logo");
    assert.equal(prefState("/CommunicationProjection", black, normalizePref({})).screen, "show", "Avisos neither");
    assert.equal(prefState("/CommunicationProjection", logo, normalizePref({})).screen, "show");
    assert.equal(prefState("/LyricProjection", logo, normalizePref({})).screen, "logo");
});

test("the rule: with nothing from the list on air the screen shows the papel de parede, the Tela preta or the Logo", () => {
    const rule = (empty) => ({ kinds: ["lyrics", "bible", "text"], top: { alert: true, logo: false }, empty });
    const video = { screen: "show", media: { kind: "video", url: "x" }, background: { kind: "color", value: "#123456" } };
    assert.equal(applyRule(video, rule("wall")).screen, "show", "the papel de parede stays (the Fundo layer)");
    assert.equal(applyRule(video, rule("wall")).background.value, "#123456");
    assert.equal(applyRule(video, rule("black")).screen, "black");
    assert.equal(applyRule(video, rule("logo")).screen, "logo");
    // A song of the list is shown: the choice does not touch it.
    assert.equal(applyRule(songLive, rule("black")).screen, "show");
    assert.ok(applyRule(songLive, rule("black")).content);
    // Nothing on air at all: the same.
    assert.equal(applyRule({ screen: "show" }, rule("black")).screen, "black");
    // The video channel counts as something on air.
    assert.equal(applyRule({ screen: "show", video: { kind: "video", url: "v" } }, { kinds: ["video"], top: { alert: true, logo: false }, empty: "black" }).screen, "show");
});

test("the Prévia lists the outputs that normally show the prepared kind and will not", () => {
    const row = (page, rule) => ({ screen_path: page, content_rule: rule });
    const bible = { kind: "bible" };
    assert.deepEqual(outputsNotShowing(bible, []), [], "no row: every output as always");
    assert.deepEqual(outputsNotShowing({ kind: "audio" }, []), []);
    const rows = [
        row("/Projection", { kinds: ["lyrics"], top: { alert: true, logo: true }, empty: "wall" }),
        row("/LyricProjection", { kinds: ["lyrics", "text"], top: { alert: true, logo: true }, empty: "black" }),
    ];
    const got = outputsNotShowing(bible, rows);
    assert.deepEqual(got.map((g) => [g.page, g.name, g.kind, g.instead]), [["/Projection", "Projeção", "Bíblia", "o papel de parede"], ["/LyricProjection", "Letras", "Bíblia", "a tela preta"]]);
    // Vídeo and Avisos never showed a Bíblia, so they are not in the warning.
    assert.ok(!got.some((g) => g.page === "/VideoProjection" || g.page === "/CommunicationProjection"));
    // A named output is named.
    assert.equal(outputsNotShowing(bible, [{ ...rows[0], name: "Telão" }])[0].name, "Telão");
    // A media stage is its own kind.
    assert.deepEqual(outputsNotShowing({ kind: "media", args: { kind: "youtube", url: "u" } }, [row("/VideoProjection", { kinds: ["video"], top: { alert: true, logo: false }, empty: "wall" })]).map((g) => g.kind), ["YouTube"]);
    assert.deepEqual(outputsNotShowing({ kind: "video", args: { kind: "video", url: "u" } }, []), []);
    assert.deepEqual(outputsNotShowing({ kind: "piece" }, [row("/CommunicationProjection", { kinds: [], top: { alert: true, logo: false }, empty: "wall" })]).map((g) => g.kind), ["Avisos"]);
});

test("an output with a theme of its own ignores the song parts' themes", () => {
    const withParts = { ...live, content: { ...live.content, slides: [{ text: "Refrão", style: { font_family: "serif", background_image: "keryx-media://parte.webp" } }] } };
    const theme = { id: "t1", font_family: "mono", text_color: "#00ff00" };
    const s = prefState("/LyricProjection", withParts, normalizePref({ theme_id: "t1" }), theme);
    assert.equal(s.content.slides[0].style, undefined);
    assert.equal(s.content.style.font_family, "mono");
    // Without an output theme the part keeps its look.
    assert.equal(prefState("/LyricProjection", withParts, normalizePref({})).content.slides[0].style.font_family, "serif");
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

test("Aviso rápido: no choice is the bar as the Projeção always drew it (Rodada E3)", () => {
    assert.deepEqual(ALERT_DEFAULTS, { position: "top", style: "band", bg: "#f5a524", fg: "#1a1300", size: "m", entrance: "slide" });
    for (const pref of [null, undefined, normalizePref(null), { options: {} }, { options: { band: "#ff0000", size: "l", position: "bottom" } }]) {
        assert.deepEqual(alertOptions(pref), ALERT_DEFAULTS, "the Transmissão's own keys never leak into the bar");
        assert.ok(isDefaultAlert(alertOptions(pref)));
    }
    // Every choice, colours in lower case.
    const all = { alert_position: "bottom", alert_style: "pill", alert_bg: "#1E40AF", alert_fg: "#FFFFFF", alert_size: "l", alert_entrance: "fade" };
    assert.deepEqual(alertOptions({ options: all }), { position: "bottom", style: "pill", bg: "#1e40af", fg: "#ffffff", size: "l", entrance: "fade" });
    assert.ok(!isDefaultAlert(alertOptions({ options: all })));
    // Anything unknown falls back key by key.
    assert.deepEqual(alertOptions({ options: { alert_position: "left", alert_style: "box", alert_bg: "amber", alert_fg: "#fff", alert_size: "xl", alert_entrance: "zoom" } }), ALERT_DEFAULTS);
    assert.deepEqual(alertOptions({ options: { alert_size: "s", alert_entrance: "none" } }), { ...ALERT_DEFAULTS, size: "s", entrance: "none" });
});

test("Aviso rápido: prefState carries this output's look with the alert; none set, the same state", () => {
    const alert = { message: "Carro ABC-1234", type: "message", since: 5 };
    const withAlert = { ...live, alert };
    // No row: the very same object (the renderer draws the bar as always).
    assert.equal(prefState("/Projection", withAlert, normalizePref({})), withAlert);
    assert.equal(prefState("/Projection", withAlert, normalizePref({})).alert.look, undefined);
    const look = prefState("/Projection", withAlert, normalizePref({ options: { alert_position: "bottom", alert_style: "pill" } })).alert;
    assert.deepEqual(look, { ...alert, look: { ...ALERT_DEFAULTS, position: "bottom", style: "pill" } });
    // Every view shows it, in its own look; Mostrar still leaves it out.
    const pill = normalizePref({ options: { alert_style: "pill" } });
    for (const page of ["/LyricProjection", "/VideoProjection", "/CommunicationProjection"]) {
        assert.equal(prefState(page, withAlert, pill).alert.look.style, "pill", page);
        assert.equal(prefState(page, withAlert, normalizePref({ hidden_kinds: ["alert"], options: { alert_style: "pill" } }))?.alert ?? null, null, page);
    }
    // Comunicação with no aviso on air: the bar alone, never the song.
    const onlyAlert = prefState("/CommunicationProjection", { screen: "show", content: live.content, alert }, normalizePref({}));
    assert.deepEqual(onlyAlert, { screen: "show", content: null, alert });
});

test("Aviso rápido: which screens draw it, and the bar for the pages that draw it themselves", () => {
    for (const page of ["/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection", "/StageView"]) assert.ok(showsAlert(page, normalizePref({})), page);
    assert.ok(!showsAlert("/PastorView", normalizePref({})), "the Pastor's page draws none");
    assert.ok(!showsAlert("/StreamView", normalizePref({})));
    // A Pastor set to show the projection's content is a renderer view: it does.
    assert.ok(showsAlert("/PastorView", normalizePref({ content: "all" })));
    const alert = { message: "Oi", type: "message", since: 1 };
    assert.equal(alertOf({ alert }, normalizePref({})), alert, "no look: the same alert");
    assert.deepEqual(alertOf({ alert }, normalizePref({ options: { alert_size: "s" } })).look, { ...ALERT_DEFAULTS, size: "s" });
    assert.equal(alertOf({ alert }, normalizePref({ hidden_kinds: ["alert"] })), null);
    assert.equal(alertOf({ alert: null }, normalizePref({})), null);
    assert.equal(alertOf(null, null), null);
});

test("Aviso rápido: cleanAlertOptions keeps valid alert_* keys, drops the rest, leaves the others", () => {
    const out = cleanAlertOptions({ chords: true, band: "#000000", alert_position: "bottom", alert_bg: "#ABCDEF", alert_fg: "white", alert_size: 3, alert_style: "pill", alert_entrance: "none", alert_nope: 1 });
    assert.deepEqual(out, { chords: true, band: "#000000", alert_position: "bottom", alert_bg: "#abcdef", alert_style: "pill", alert_entrance: "none" });
    assert.deepEqual(cleanAlertOptions(null), {});
    assert.deepEqual(cleanAlertOptions(["x"]), {});
});

test("Aviso rápido: the Palco's bar starts at the bottom, where its old pill sat (owner 2026-10-16)", () => {
    assert.deepEqual(alertDefaults("/StageView"), { ...ALERT_DEFAULTS, position: "bottom" });
    for (const page of [undefined, "/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection"]) assert.deepEqual(alertDefaults(page), ALERT_DEFAULTS, String(page));
    assert.equal(alertOptions(null, "/StageView").position, "bottom");
    assert.equal(alertOptions({ options: { alert_position: "top" } }, "/StageView").position, "top", "its Ajustes can still say Alto");
    assert.equal(alertOptions({ options: { alert_style: "pill" } }, "/StageView").position, "bottom", "other choices keep the Palco's default");
    // The look rides with the alert, since AlertBar alone draws it at the top.
    const alert = { message: "Oi", type: "message", since: 1 };
    assert.deepEqual(alertOf({ alert }, normalizePref({}), "/StageView").look, { ...ALERT_DEFAULTS, position: "bottom" });
    assert.equal(alertOf({ alert }, normalizePref({ options: { alert_position: "top" } }), "/StageView"), alert, "Alto on the Palco: no look needed");
    // A Palco set to show another output's content is still the Palco.
    assert.equal(prefState("/StageView", { screen: "show", alert }, normalizePref({ content: "all" })).alert.look.position, "bottom");
    assert.equal(prefState("/Projection", { screen: "show", alert }, normalizePref({})).alert, alert);
});

test("the rule: a song's playback track follows the screens that receive text, never a screen of videos or avisos", () => {
    assert.ok(prefState("/Projection", songLive, normalizePref({ hidden_kinds: ["lyrics"] })).track, "Projeção without Letras: the music goes on");
    assert.equal(prefState("/VideoProjection", songLive, normalizePref({})).track, undefined, "Vídeo never played a song's track");
    assert.equal(prefState("/CommunicationProjection", songLive, normalizePref({})).track, undefined);
    assert.ok(prefState("/VideoProjection", songLive, normalizePref({ content_rule: { kinds: ["video", "bible"] } })).track, "with a text kind in its list it does");
});

test("the rule's doors: a shortcut, one kind more, what leaves the air (owner 2026-10-27)", async () => {
    const { ruleWithShortcut, ruleWithKind, leavesOut, airKinds, leftOutNow, outputsLeavingAir, ruleDrops } = await import("./outputPrefs.js");
    const all = defaultRule("/Projection");
    const custom = { kinds: ["lyrics"], top: { alert: false, logo: true }, empty: "black" };
    // A shortcut changes the kinds only: Por cima de tudo and Sem item da lista stay.
    assert.deepEqual(ruleWithShortcut(custom, "videos"), { kinds: ["video", "youtube"], top: { alert: false, logo: true }, empty: "black" });
    assert.equal(ruleWithShortcut(custom, "nope"), custom);
    // One kind more, in the list's order; already there = the same object.
    assert.deepEqual(ruleWithKind(custom, "bible").kinds, ["lyrics", "bible"]);
    assert.deepEqual(ruleWithKind({ ...custom, kinds: ["video"] }, "lyrics").kinds, ["lyrics", "video"]);
    assert.equal(ruleWithKind(custom, "lyrics"), custom);
    assert.equal(ruleWithKind(custom, "nope"), custom);
    // Only an output that normally shows a kind leaves it out; never the Palco.
    assert.equal(leavesOut("/VideoProjection", defaultRule("/VideoProjection"), "lyrics"), false, "the Vídeo never showed lyrics");
    assert.equal(leavesOut("/Projection", custom, "bible"), true);
    assert.equal(leavesOut("/Projection", all, "bible"), false);
    assert.equal(leavesOut("/StageView", custom, "bible"), false);
    // What fills the screens: none under Tela preta or the Logo.
    assert.deepEqual(airKinds(live), ["lyrics", "notice"]);
    assert.deepEqual(airKinds({ ...live, screen: "black" }), []);
    assert.deepEqual(airKinds(null), []);
    assert.deepEqual(airKinds({ media: { kind: "youtube", url: "u" } }), ["youtube"]);
    assert.deepEqual(leftOutNow("/Projection", { ...custom, kinds: ["notice"] }, live), { kind: "lyrics", label: "Letras", instead: "a tela preta" });
    assert.equal(leftOutNow("/Projection", all, live), null);
    // Every output leaving the air out, by name and what it receives.
    const rows = [{ screen_path: "/Projection", name: "Telão", content_rule: { kinds: ["video", "youtube"], top: { alert: true, logo: true }, empty: "wall" } }];
    assert.deepEqual(outputsLeavingAir(live, rows), [{ page: "/Projection", name: "Telão", kind: "Letras", receives: "Vídeos" }]);
    assert.deepEqual(outputsLeavingAir(live, []), [], "no row: every output as always");
    // What a change of rule takes off a screen now.
    assert.deepEqual(ruleDrops(all, ruleWithShortcut(all, "videos"), live), ["Letras", "Avisos"]);
    assert.deepEqual(ruleDrops(all, ruleWithShortcut(all, "letters"), { content: live.content }), []);
});

test("the Prévia's warning carries the kind's id for its fix", () => {
    const got = outputsNotShowing({ kind: "bible" }, [{ screen_path: "/Projection", content_rule: { kinds: ["lyrics"], top: { alert: true, logo: true }, empty: "wall" } }]);
    assert.equal(got[0].kindId, "bible");
});
