import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGenerator } from "../../../shared/generators.mjs";
import { consoleThemes, themeInUseSeed, themeName, themeStyle, sameLook, themeBackgroundArgs, themeForKind, defaultTheme, isDefaultTheme, defaultChanges, isFactoryLook, followsTheme, withThemeDefaults, THEME_FONTS, FAMILY_SET } from "./themes.js";

test("themeStyle: classics defaulted, extras empty unless saved", () => {
    const t = { font_family: "serif", text_box: "band", transition: "slide", transition_ms: 300 };
    const s = themeStyle(t);
    assert.equal(s.font_family, "serif");
    assert.equal(s.font_size, "large");
    assert.equal(s.text_box, "band");
    assert.equal(s.transition, "slide");
    assert.equal(s.transition_ms, 300);
    assert.equal(s.text_nudge, "", "an absent extra clears the operator's value");
    assert.ok(sameLook(s, t));
    assert.ok(!sameLook({ ...s, font_family: "mono" }, t));
    assert.ok(sameLook({ ...s, text_color: "" }, t), "a classic falls back, not compares empty");
});

test("background args and the default theme", () => {
    assert.equal(themeBackgroundArgs({ name: "X" }), null);
    assert.deepEqual(themeBackgroundArgs({ name: "X", background_image: "u.png", background_dim: 0.3, background_fit: "" }),
        { kind: "image", value: "u.png", title: "X", dim: 0.3 });
    assert.deepEqual(themeBackgroundArgs({ name: "X", background_image: "u.png", background_blur: 4 }), { kind: "image", value: "u.png", title: "X", blur: 4 });
    // The new field wins over the old ones, any kind.
    assert.deepEqual(themeBackgroundArgs({ name: "V", background: { kind: "video", value: "keryx-media://v.mp4", dim: 0.2 }, background_image: "u.png" }), { kind: "video", value: "keryx-media://v.mp4", dim: 0.2, title: "V" });
    const themes = [{ id: "a" }, { id: "b", is_default: true }];
    assert.equal(defaultTheme(themes).id, "b");
    assert.equal(defaultTheme([{ id: "a" }]), null, "no theme marked: none (never the first by surprise)");
    assert.equal(defaultTheme([{ id: "x", is_default: true, updated_date: "2026-10-01" }, { id: "y", is_default: true, updated_date: "2026-10-09" }]).id, "y", "two marked: the newest");
    assert.ok(isDefaultTheme(themes, themes[1]) && !isDefaultTheme(themes, themes[0]));
    assert.equal(defaultTheme([]), null);
    assert.equal(THEME_FONTS.length, 8, "every shipped family is offered");
    assert.ok(FAMILY_SET.has("cursive") && FAMILY_SET.has("times"), "the old false 'não instalada' families included");
});

test("default theme: one transaction makes one theme the only default", () => {
    const themes = [{ id: "a", is_default: true }, { id: "b" }, { id: "c" }];
    assert.deepEqual(defaultChanges(themes, "b"), [{ id: "a", is_default: false }, { id: "b", is_default: true }]);
    assert.deepEqual(defaultChanges(themes, "a"), [], "already so: nothing to write");
    assert.deepEqual(defaultChanges(themes, null), [{ id: "a", is_default: false }], "none: the factory look");
});

test("default theme: who follows it", () => {
    assert.ok(isFactoryLook({}));
    assert.ok(isFactoryLook({ font_size: "large", font_family: "sans", text_effect: "shadow", text_color: "#ffffff" }));
    assert.ok(!isFactoryLook({ font_family: "serif" }));
    assert.ok(followsTheme({ font_family: "serif", style_mode: "theme" }), "asked to follow");
    assert.ok(!followsTheme({ style_mode: "own" }), "asked not to");
    assert.ok(followsTheme({}), "untouched song");
    assert.ok(!followsTheme({ text_color: "#ffcc00" }), "a song with its own look keeps it");
});

test("default theme: filled in at send time, only where the item asks", () => {
    const theme = { id: "t", font_family: "serif", font_size: "xlarge", text_box: "band", transition: "slide", transition_ms: 300, background_image: "bg.jpg", background_dim: 0.3 };
    const args = { title: "X", slides: [], style: { font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff" }, inherit: { look: true, background: true } };
    const out = withThemeDefaults("content.show", args, theme);
    assert.equal(out.inherit, undefined, "inherit never reaches the live state");
    assert.equal(out.style.font_family, "serif");
    assert.equal(out.style.font_size, "xlarge");
    assert.equal(out.style.text_box, "band");
    assert.equal(out.style.transition, "slide");
    // The theme's background goes to the Fundo layer when sent (args.fundo),
    // not inside the content: it stays after Esc.
    assert.equal(out.style.background_image, undefined);
    assert.deepEqual(out.fundo, { kind: "image", value: "bg.jpg", dim: 0.3, title: "Tema" });
    // An own look keeps itself; the theme's transition still fills the gap.
    const own = withThemeDefaults("content.show", { ...args, style: { font_family: "mono" }, inherit: { look: false, background: false } }, theme);
    assert.equal(own.style.font_family, "mono");
    assert.equal(own.style.transition, "slide");
    assert.equal(own.style.background_image, undefined);
    assert.equal(own.fundo, undefined, "an item with its own background keeps it");
    // A generated background in the theme comes too (it used to be lost).
    const gen = withThemeDefaults("content.show", args, { name: "Céu", background_generator: { id: "clouds" } });
    assert.equal(gen.fundo.kind, "generator");
    assert.equal(gen.fundo.gen.id, "clouds");
    // No default theme: just the item, without inherit.
    assert.deepEqual(withThemeDefaults("content.show", args, null), { title: "X", slides: [], style: args.style });
    // Other ops and items without inherit pass untouched.
    assert.equal(withThemeDefaults("content.update", args, theme), args);
    const plain = { style: {} };
    assert.equal(withThemeDefaults("content.show", plain, theme), plain);
});

test("text placement rides as extras: the theme fills, the item wins", () => {
    const theme = { id: "t", text_align: "left", text_position: "bottom", text_max_width: 60 };
    assert.equal(themeStyle(theme).text_align, "left");
    assert.equal(themeStyle(theme).text_position, "bottom");
    assert.equal(themeStyle({}).text_align, "", "an unmoved theme writes nothing");
    const args = { style: { font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff" }, inherit: { look: true, background: false } };
    // The item left the placement empty: the theme's lands.
    const out = withThemeDefaults("content.show", args, theme);
    assert.equal(out.style.text_align, "left");
    assert.equal(out.style.text_position, "bottom");
    assert.equal(out.style.text_max_width, 60);
    // The item placed its text (Camadas, a song's own look): it survives.
    const own = withThemeDefaults("content.show", { ...args, style: { ...args.style, text_align: "right", text_position: "top" } }, theme);
    assert.equal(own.style.text_align, "right");
    assert.equal(own.style.text_position, "top");
    // sameLook sees a moved box as a change.
    assert.ok(sameLook({ ...themeStyle(theme) }, theme));
    assert.ok(!sameLook({ ...themeStyle(theme), text_position: "top" }, theme));
});

test("a theme with a generated background sets the Fundo as a generator", () => {
    const gen = { id: "clouds", speed: 0.3, colors: ["#000000", "#ffffff"] };
    assert.deepEqual(themeBackgroundArgs({ name: "Céu", background_generator: gen, background_dim: 0.2 }), { kind: "generator", value: "clouds", gen: normalizeGenerator(gen), title: "Céu", dim: 0.2 });
    assert.deepEqual(themeBackgroundArgs({ name: "Céu", background_generator: gen, background_image: "u.png" }).kind, "image", "a picture wins");
    assert.equal(themeBackgroundArgs({ name: "X", background_generator: {} }), null);
});

test("the Bíblia has its own theme; songs keep the default one", () => {
    const themes = [{ id: "letras", is_default: true }, { id: "biblia" }];
    assert.equal(themeForKind(themes, "lyrics", "biblia").id, "letras", "songs: the default theme");
    assert.equal(themeForKind(themes, "bible", "biblia").id, "biblia");
    assert.equal(themeForKind(themes, "bible", "").id, "letras", "none chosen: the same as the songs");
    assert.equal(themeForKind(themes, "bible", "none"), null, "the factory look");
    assert.equal(themeForKind(themes, "bible", "apagado").id, "letras", "a deleted theme falls back");
    assert.equal(themeForKind([], "bible", "biblia"), null);
});

test("a default theme per kind: Música, Bíblia, Texto, Timer", () => {
    const themes = [{ id: "musica", is_default: true }, { id: "biblia" }, { id: "texto" }, { id: "timer", font_family: "mono", text_color: "#ffcc00", background: { kind: "color", value: "#101820" } }];
    const ids = { bible: "biblia", text: "texto", tool: "timer" };
    assert.equal(themeForKind(themes, "lyrics", ids).id, "musica");
    assert.equal(themeForKind(themes, "bible", ids).id, "biblia");
    assert.equal(themeForKind(themes, "text", ids).id, "texto");
    assert.equal(themeForKind(themes, "tool", ids).id, "timer");
    assert.equal(themeForKind(themes, "text", {}).id, "musica", "unset: the same as Música");
    assert.equal(themeForKind(themes, "tool", { tool: "none" }), null, "the factory look");
    assert.equal(themeForKind(themes, "bible", "biblia").id, "biblia", "the Bíblia's id alone still works");
    // A timer with no look of its own takes the theme's font, colour and background.
    const tool = withThemeDefaults("tool.show", { mode: "timer", durationMs: 60000 }, themes[3]);
    assert.deepEqual(tool.style, { font_family: "mono", text_color: "#ffcc00" });
    assert.equal(tool.fundo.value, "#101820");
    const own = { mode: "clock", style: { text_color: "#ffffff" } };
    assert.equal(withThemeDefaults("tool.show", own, themes[3]), own, "its own look stays");
});

test("Camadas › Temas presets: pinned themes, else default + recent", () => {
    const t = (id, extra = {}) => ({ id, name: id, ...extra });
    const many = [t("a"), t("b", { is_default: true }), t("c", { pinned: true }), t("d", { pinned: true }), t("e", { updated_date: "2026-10-12" }), t("f", { updated_date: "2026-10-13" })];
    assert.deepEqual(consoleThemes(many).map((x) => x.id), ["c", "d"], "pinned only, in list order");
    const none = many.map(({ pinned: _p, ...x }) => x);
    assert.deepEqual(consoleThemes(none).map((x) => x.id), ["b", "f", "e", "a", "c", "d"], "default first, then the most recent");
    assert.deepEqual(consoleThemes(none, 2).map((x) => x.id), ["b", "f"], "capped at max");
    assert.deepEqual(consoleThemes([]), []);
    assert.equal(consoleThemes(Array.from({ length: 12 }, (_, i) => t("t" + i))).length, 9, "the panel's 9 slots");
});

test("the theme in use is Música's theme; Bíblia, Texto and Timer follow it unless the church chose theirs", () => {
    const themes = [{ id: "padrao", is_default: true }, { id: "vinho" }, { id: "biblia" }];
    assert.equal(themeForKind(themes, "lyrics", {}, "vinho").id, "vinho", "it wins over the default");
    assert.equal(themeForKind(themes, "lyrics", {}, null).id, "padrao", "none in use: the default");
    assert.equal(themeForKind(themes, "lyrics", {}, "apagado").id, "padrao", "a deleted one is passed over");
    for (const kind of ["bible", "text", "tool"]) {
        assert.equal(themeForKind(themes, kind, {}, "vinho").id, "vinho", `${kind}: the clicked theme`);
        assert.equal(themeForKind(themes, kind, { [kind]: "apagado" }, "vinho").id, "vinho", `${kind}: a deleted one falls back to Música's`);
        assert.equal(themeForKind(themes, kind, { [kind]: "none" }, "vinho"), null, `${kind}: the factory look stays`);
    }
    assert.equal(themeForKind(themes, "bible", { bible: "biblia" }, "vinho").id, "biblia", "the church's Bíblia theme stays");
    assert.equal(themeForKind(themes, "bible", {}, null).id, "padrao", "nothing chosen: the default");
});

test("the theme in use: a culto with a theme of its own replaces it; one with none leaves it (review 2026-10-14)", () => {
    assert.equal(themeInUseSeed("vinho"), "vinho");
    assert.equal(themeInUseSeed(""), undefined, "a culto without a theme: the clicked one stays");
    assert.equal(themeInUseSeed(null), undefined);
    assert.equal(themeInUseSeed(), undefined);
});

test("the theme in use: when KERYX opens, the last click wins over the culto's theme", () => {
    assert.equal(themeInUseSeed("vinho", { reopening: true, inUse: "azul" }), undefined, "the theme clicked before closing stays");
    assert.equal(themeInUseSeed("vinho", { reopening: true, inUse: null }), "vinho", "nothing clicked yet on this computer: the culto's");
    assert.equal(themeInUseSeed("vinho", { reopening: false, inUse: "azul" }), "vinho", "a culto chosen afterwards (or its theme changed): the culto's");
    assert.equal(themeInUseSeed("", { reopening: true, inUse: null }), undefined);
});

test("an unnamed theme has no name (no date made up)", () => {
    assert.equal(themeName({ name: "Vinho" }), "Vinho");
    assert.equal(themeName({ name: "  " }), "Tema sem nome");
    assert.equal(themeName({ name: "" }, ""), "", "a caption passes \"\": no caption");
    assert.equal(themeName(null), "Tema sem nome");
});

// The bug of the review 2026-10-14: with a theme in use, a song went out
// over the Fundo do culto. The whole send chain: content.js builds the
// item, the stamp fills the theme in use (themeForKind + withThemeDefaults),
// fundoOps puts its background on the Fundo before the text, and Esc gives
// the Fundo do culto back.
test("the theme in use puts its background on the Fundo with the content; Esc gives the Fundo do culto back", async () => {
    const { songContent, passageContent } = await import("./content.js");
    const { fundoOps, applyWithFundo } = await import("./backgroundSpec.js");
    const { emptyState, applyOp } = await import("../../../shared/live-state.mjs");
    const vinho = { id: "vinho", name: "Vinho", font_family: "serif", background: { kind: "color", value: "#aa2222" } };
    const themes = [{ id: "padrao", is_default: true, name: "Padrão" }, vinho];
    const stamp = (op, args) => withThemeDefaults(op, args, themeForKind(themes, args.kind, {}, "vinho"));
    const culto = { kind: "color", value: "#224466", title: "Fundo do culto" };
    let live = applyOp(applyOp(emptyState(0), "background.default", { background: culto }, 0), "background.set", culto, 0);

    const song = { id: "s", title: "Graça", lyrics: "Linha um\nLinha dois" };
    const own = { ...song, id: "o", style_mode: "own", font_family: "mono" };
    const passage = { reference: "Jo 3:16", text: "Porque Deus amou o mundo" };
    const text = { kind: "text", title: "Oração", slides: [{ text: "Oremos" }], inherit: { look: true, background: true } };
    for (const [what, args] of [["a song", { ...songContent(song, {}, themes), kind: "lyrics" }], ["a song with its own look", { ...songContent(own, {}, themes), kind: "lyrics" }], ["a passage", { ...passageContent(passage), kind: "bible" }], ["a text", text]]) {
        const ops = fundoOps("content.show", stamp("content.show", args), live);
        assert.deepEqual(ops.map(([o]) => o), ["background.set", "content.show"], `${what}: the Fundo first`);
        assert.equal(ops[0][1].value, "#aa2222", `${what}: the theme's background`);
        const on = applyWithFundo(live, "content.show", stamp("content.show", args), 1);
        assert.equal(on.background.value, "#aa2222", `${what}: on the screen`);
        assert.equal(applyOp(on, "clear", {}, 2).background.value, "#224466", `${what}: Esc, the Fundo do culto`);
    }

    // A song with a background of its own keeps it (owner 2026-10-14).
    const pic = { ...song, background: { kind: "image", value: "keryx-media://mar.webp" } };
    const ops = fundoOps("content.show", stamp("content.show", { ...songContent(pic, {}, themes), kind: "lyrics" }), live);
    assert.equal(ops[0][1].value, "keryx-media://mar.webp");

    // The Fundo's padlock holds it.
    live = applyOp(live, "layers.lock", { layer: "background", locked: true }, 3);
    assert.deepEqual(fundoOps("content.show", stamp("content.show", { ...songContent(song, {}, themes), kind: "lyrics" }), live).map(([o]) => o), ["content.show"]);
});
