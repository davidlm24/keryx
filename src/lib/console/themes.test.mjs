import test from "node:test";
import assert from "node:assert/strict";
import { themeStyle, sameLook, bgOf, themeBackgroundArgs, defaultTheme, THEME_FONTS, FAMILY_SET } from "./themes.js";

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
    assert.equal(defaultTheme([{ id: "a" }]).id, "a");
    assert.equal(defaultTheme([]), null);
    assert.equal(THEME_FONTS.length, 8, "every shipped family is offered");
    assert.ok(FAMILY_SET.has("cursive") && FAMILY_SET.has("times"), "the old false 'não instalada' families included");
});
