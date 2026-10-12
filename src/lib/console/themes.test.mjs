import test from "node:test";
import assert from "node:assert/strict";
import { themeStyle, sameLook, bgOf, themeBackgroundArgs, defaultTheme, isDefaultTheme, defaultChanges, isFactoryLook, followsTheme, withThemeDefaults, THEME_FONTS, FAMILY_SET } from "./themes.js";

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
    assert.deepEqual(bgOf({ background_blur: 4 }), { blur: 4 });
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
    assert.equal(out.style.background_image, "bg.jpg");
    assert.equal(out.style.background_dim, 0.3);
    // An own look keeps itself; the theme's transition still fills the gap.
    const own = withThemeDefaults("content.show", { ...args, style: { font_family: "mono" }, inherit: { look: false, background: false } }, theme);
    assert.equal(own.style.font_family, "mono");
    assert.equal(own.style.transition, "slide");
    assert.equal(own.style.background_image, undefined);
    // A Fundo up in Camadas wins over the theme's picture.
    assert.equal(withThemeDefaults("content.show", args, theme, { fundo: { kind: "video" } }).style.background_image, undefined);
    // No default theme: just the item, without inherit.
    assert.deepEqual(withThemeDefaults("content.show", args, null), { title: "X", slides: [], style: args.style });
    // Other ops and items without inherit pass untouched.
    assert.equal(withThemeDefaults("content.update", args, theme), args);
    const plain = { style: {} };
    assert.equal(withThemeDefaults("content.show", plain, theme), plain);
});
