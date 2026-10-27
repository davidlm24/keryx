import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_LOOK_DEFAULT, idleLookOf, isDefaultIdleLook, checkIdleLook, idleBackground, idleMedia, liveIdleLook, idleText } from "./idleLook.mjs";

test("idleLookOf: a full look from anything, defaults for what is missing or broken", () => {
    assert.equal(idleLookOf(null), null);
    assert.equal(idleLookOf("x"), null);
    assert.deepEqual(idleLookOf({}), { ...IDLE_LOOK_DEFAULT });
    const l = idleLookOf({ bg: "color", color: "#ABCDEF", logo: "l", dir: "sideways", c1: "red", phrase: "own", text: "  Seja   bem-vindo  " });
    assert.equal(l.bg, "color");
    assert.equal(l.color, "#abcdef", "colours lower case");
    assert.equal(l.logo, "l");
    assert.equal(l.dir, "radial", "a broken direction takes the default");
    assert.equal(l.c1, IDLE_LOOK_DEFAULT.c1, "a broken colour takes the default");
    assert.equal(l.text, "Seja bem-vindo", "spaces folded");
    assert.equal(idleLookOf({ phrase: "own", text: "x".repeat(90) }).text.length, 60);
    assert.equal(idleLookOf({ phrase: "none", text: "kept?" }).text, "", "no phrase, no words");
    assert.equal(idleLookOf({ phrase: "church", text: "" }).phrase, "church", "the choice stays without words");
});

test("isDefaultIdleLook and idleBackground: the default draws exactly as before", () => {
    assert.ok(isDefaultIdleLook(null));
    assert.ok(isDefaultIdleLook({}));
    assert.ok(isDefaultIdleLook({ ...IDLE_LOOK_DEFAULT }));
    assert.ok(!isDefaultIdleLook({ logo: "s" }));
    assert.equal(idleBackground(null), null);
    assert.equal(idleBackground({ logo: "l" }), null, "the default gradient stays the renderer's own");
    assert.equal(idleBackground({ bg: "color", color: "#112233" }), "#112233");
    assert.match(idleBackground({ c1: "#ff0000" }), /^radial-gradient\(ellipse at 30% 20%, #ff0000 0%, #06070c 100%\)$/);
    assert.match(idleBackground({ c1: "#ff0000", dir: "down" }), /^linear-gradient\(180deg/);
    assert.match(idleBackground({ c1: "#ff0000", dir: "diag" }), /^linear-gradient\(135deg/);
});

test("checkIdleLook: strict for the live op", () => {
    assert.deepEqual(checkIdleLook(null), { look: null });
    assert.deepEqual(checkIdleLook({ ...IDLE_LOOK_DEFAULT }), { look: null }, "the default is stored as null");
    assert.equal(checkIdleLook({ logo: "s" }).look.logo, "s");
    for (const bad of [{ bg: "image" }, { dir: "up" }, { c1: "#fff" }, { color: "blue" }, { logo: "xl" }, { phrase: "x" }, { text: 3 }, []]) {
        assert.ok(checkIdleLook(bad).error, JSON.stringify(bad));
    }
});

test("liveIdleLook and idleText: the church's name is written in by the console", () => {
    const saved = { phrase: "church", text: "Seja bem-vindo", logo: "l" };
    const live = liveIdleLook(saved, "Igreja de exemplo");
    assert.equal(live.text, "Igreja de exemplo");
    assert.equal(idleText(live), "Igreja de exemplo");
    assert.equal(idleLookOf(saved).text, "Seja bem-vindo", "the saved look keeps its own words for Outra");
    assert.equal(idleText(liveIdleLook({ phrase: "own", text: "Bem-vindos" }, "Igreja")), "Bem-vindos");
    assert.equal(idleText(liveIdleLook({ phrase: "church", logo: "s" }, "")), "", "no name: no words");
    assert.equal(liveIdleLook({ ...IDLE_LOOK_DEFAULT }, "Igreja"), null);
    assert.equal(liveIdleLook(null), null);
});

test("Da biblioteca (Rodada Q6): a picture or a clip under the logo, with its dim", () => {
    const pic = { kind: "image", value: "http://127.0.0.1:7700/media/a.jpg", name: "Cruz" };
    const l = idleLookOf({ bg: "media", media: pic, dim: 0.35 });
    assert.equal(l.bg, "media");
    assert.deepEqual(l.media, pic);
    assert.equal(l.dim, 0.35);
    assert.equal(idleBackground(l), null, "the renderer draws the file");
    assert.deepEqual(idleMedia(l), { ...pic, dim: 0.35 });
    assert.equal(idleMedia({ bg: "color", media: pic }), null, "another fundo: the file waits");
    assert.ok(!isDefaultIdleLook(l));
    // An old saved look draws as before; a kept file alone is still the default.
    assert.ok(isDefaultIdleLook({ bg: "gradient", media: pic, dim: 0.5 }));
    assert.equal(idleLookOf({ logo: "s" }).media, null);
    assert.equal(idleLookOf({ logo: "s" }).dim, 0);
    // Lenient: no file = the default fundo; a dim past the range is clamped.
    assert.equal(idleLookOf({ bg: "media" }).bg, "gradient");
    assert.equal(idleLookOf({ bg: "media", media: { kind: "gif", value: "x" } }).bg, "gradient");
    assert.equal(idleLookOf({ bg: "media", media: pic, dim: 0.95 }).dim, 0.7);
    assert.equal(idleLookOf({ bg: "media", media: pic, dim: "x" }).dim, 0);
    // Strict for the live op.
    assert.equal(checkIdleLook({ bg: "media", media: { kind: "video", value: "http://x/v.mp4" }, dim: 0.7 }).look.media.kind, "video");
    for (const bad of [{ bg: "media" }, { media: { kind: "gif", value: "x" } }, { media: { kind: "image", value: "" } }, { media: { kind: "image", value: "x".repeat(5000) } }, { dim: 0.8 }, { dim: -0.1 }, { dim: "0.2" }]) {
        assert.ok(checkIdleLook(bad).error, JSON.stringify(bad));
    }
    // The console's live look keeps the file.
    assert.equal(liveIdleLook({ bg: "media", media: pic, phrase: "church" }, "Igreja").media.value, pic.value);
});
