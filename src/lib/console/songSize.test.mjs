import test from "node:test";
import assert from "node:assert/strict";
import { songStep, stepValue, steppedSize, stepCaption, STEP_OPTIONS } from "./songSize.js";
import { songContent } from "./content.js";
import { withThemeDefaults, followsTheme } from "./themes.js";

test("songStep: an old song's preset reads as its step from G (lazy, nothing rewritten)", () => {
    assert.equal(songStep({}), 0, "no size: the theme's");
    assert.equal(songStep({ font_size: "" }), 0);
    assert.equal(songStep({ font_size: "large" }), 0);
    assert.equal(songStep({ font_size: "medium" }), -1);
    assert.equal(songStep({ font_size: "small" }), -2);
    assert.equal(songStep({ font_size: "xsmall" }), -2, "PP is below the range: −2");
    assert.equal(songStep({ font_size: "xlarge" }), 1);
    assert.equal(songStep({ font_size: "xxlarge" }), 2);
    assert.equal(songStep({ font_size: "5.2" }), 0, "a number nobody wrote: the theme's size");
    assert.equal(songStep(null), 0);
});

test("stepValue: what Song.font_size keeps, so an older KERYX still draws the same over a G theme", () => {
    assert.deepEqual([-2, -1, 0, 1, 2].map(stepValue), ["small", "medium", "", "xlarge", "xxlarge"]);
    assert.equal(stepValue(5), "xxlarge", "clamped");
    assert.equal(stepValue("-1"), "medium");
    for (const [v] of STEP_OPTIONS) assert.equal(songStep({ font_size: stepValue(v) }), Number(v), "round trip");
});

test("steppedSize: the theme's size along the presets' ladder", () => {
    assert.equal(steppedSize("large", 0), "large", "0 keeps the theme's own value");
    assert.equal(steppedSize("4.8", 0), "4.8");
    assert.equal(steppedSize("", 0), "large");
    assert.equal(steppedSize("large", -2), "3", "G −2 is P exactly: an old song looks the same");
    assert.equal(steppedSize("large", -1), "3.8");
    assert.equal(steppedSize("large", 1), "5.8");
    assert.equal(steppedSize("4.8", 2), "7");
    assert.equal(steppedSize("4.3", 1), "5.3", "between presets: half way from G to GG");
    assert.equal(steppedSize("7", 2), "10.1", "past GGG: ×1.2 a step");
    assert.equal(steppedSize("11", 2), "12", "never past the range");
    assert.equal(steppedSize("2.4", -2), "1.7");
    assert.equal(stepCaption("large", 1), "5,8 %");
});

test("a song bigger or smaller keeps following the theme (P8-2: it silently turned \"own\")", () => {
    assert.ok(followsTheme({ font_size: "xlarge" }));
    assert.ok(followsTheme({ font_size: "small", font_family: "sans" }));
    assert.ok(!followsTheme({ font_size: "small", font_family: "serif" }), "the font still makes it its own");
});

test("songContent + the theme: the whole theme, its size moved by the song's step", () => {
    const theme = { id: "t", font_family: "serif", font_size: "4.8", text_box: "band", text_position: "bottom", line_height: 1.5, font_weight: "bold", text_decoration: "underline" };
    const song = { id: "s", title: "Grande é o Senhor", lyrics: "Grande é o Senhor", font_size: "xlarge" };
    const args = songContent(song, {}, [theme]);
    assert.deepEqual(args.inherit, { look: true, background: true, step: 1 });
    const out = withThemeDefaults("content.show", args, theme);
    assert.equal(out.style.font_family, "serif");
    assert.equal(out.style.font_size, "5.8");
    assert.equal(out.style.text_box, "band");
    assert.equal(out.style.text_position, "bottom");
    assert.equal(out.style.line_height, 1.5);
    assert.equal(out.style.font_weight, "bold");
    assert.equal(out.style.text_decoration, "underline");
    // No theme at all: the step moves the factory G.
    assert.equal(songContent(song, {}, []).style.font_size, "5.8");
    assert.equal(songContent({ ...song, font_size: "" }, {}, []).style.font_size, "large");
});

test("a song with a look of its own still takes the theme's box, position and spacing (the gap of P8-2)", () => {
    const theme = { id: "t", font_family: "serif", font_size: "6", text_box: "block", text_align: "left", letter_spacing: 0.05 };
    const song = { id: "s", title: "X", lyrics: "X", style_mode: "own", font_family: "mono", text_color: "#ffcc00", font_size: "small" };
    const args = songContent(song, {}, [theme]);
    assert.equal(args.inherit.look, false);
    const out = withThemeDefaults("content.show", args, theme);
    assert.equal(out.style.font_family, "mono", "its own font stays");
    assert.equal(out.style.text_color, "#ffcc00");
    assert.equal(out.style.text_box, "block");
    assert.equal(out.style.text_align, "left");
    assert.equal(out.style.letter_spacing, 0.05);
    assert.equal(out.style.font_size, steppedSize("6", -2), "the size is a step from the theme's, own look or not");
});

test("a song following a theme of its own: that theme whole, sized by the step; the default theme adds nothing", () => {
    const own = { id: "o", font_family: "georgia", font_size: "5", text_box: "band" };
    const def = { id: "d", is_default: true, font_family: "serif", text_position: "top", line_height: 1.8, transition: "slide" };
    const song = { id: "s", title: "X", slides: [{ text: "Y", label: "Refrão" }], theme_id: "o", part_themes: { "refrão": "o" }, font_size: "medium" };
    const args = songContent(song, {}, [own, def]);
    assert.deepEqual(args.inherit, { look: false, background: false, extras: false });
    assert.equal(args.style.font_size, steppedSize("5", -1));
    assert.equal(args.slides[0].style.font_size, steppedSize("5", -1), "a part's theme moves by the step too");
    const out = withThemeDefaults("content.show", args, def);
    assert.equal(out.style.text_position, undefined, "the default theme's extras stay out of a complete look");
    assert.equal(out.style.line_height, undefined);
    assert.equal(out.style.transition, "slide", "the church's transition still fills");
});
