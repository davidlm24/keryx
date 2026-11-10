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

test("a song's own theme, part themes and look are not read: the theme in use dresses it, sized by its step (2026-11-09)", () => {
    const own = { id: "o", font_family: "georgia", font_size: "5", text_box: "band" };
    const def = { id: "d", is_default: true, font_family: "serif", font_size: "6", text_position: "top", line_height: 1.8, transition: "slide" };
    const song = { id: "s", title: "X", slides: [{ text: "Y", label: "Refrão" }], theme_id: "o", part_themes: { "refrão": "o" }, style_mode: "own", font_family: "mono", text_color: "#ffcc00", background: { kind: "color", value: "#123456" }, font_size: "medium" };
    const args = songContent(song, {}, [own, def]);
    assert.deepEqual(args.inherit, { look: true, background: true, step: -1 });
    assert.equal(args.fundo, undefined, "its own background is not read");
    assert.equal(args.slides[0].style, undefined, "nor a part's theme");
    const out = withThemeDefaults("content.show", args, def);
    assert.equal(out.style.font_family, "serif", "the theme in use's font, not the song's");
    assert.equal(out.style.text_color, def.text_color ?? out.style.text_color);
    assert.notEqual(out.style.text_color, "#ffcc00");
    assert.equal(out.style.text_position, "top");
    assert.equal(out.style.line_height, 1.8);
    assert.equal(out.style.transition, "slide");
    assert.equal(out.style.font_size, steppedSize("6", -1), "the step still moves the theme's size");
});

test("isVideoUrl: every container the Mídia imports is a video (a .webm went to the audio channel)", async () => {
    const { isVideoUrl } = await import("./content.js");
    for (const u of ["keryx-media://a.mp4", "http://127.0.0.1:7700/media/b.webm", "x.MOV", "y.m4v", "z.mkv?t=1"]) assert.equal(isVideoUrl(u), true, u);
    for (const u of ["keryx-media://a.mp3", "x.m4a", "playback.wav", "", null]) assert.equal(isVideoUrl(u), false, String(u));
});
