import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_LOOK_DEFAULT, idleLookOf, isDefaultIdleLook, checkIdleLook, idleBackground, liveIdleLook, idleText } from "./idleLook.mjs";

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
