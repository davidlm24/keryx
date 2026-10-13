import test from "node:test";
import assert from "node:assert/strict";
import { cleanKindThemes, lookOf, lookFields, templateLookFields, lookForService, hasLook } from "./serviceLook.js";
import { themeForKind } from "./themes.js";

test("a service's look: its background and its theme per kind", () => {
    assert.deepEqual(cleanKindThemes({ lyrics: " t1 ", bible: "", text: 3, nope: "x" }), { lyrics: "t1" });
    assert.deepEqual(cleanKindThemes(null), {});
    const look = lookOf({ background: { kind: "color", value: "#101820" }, kind_themes: { lyrics: "vinho" } });
    assert.deepEqual(look, { background: { kind: "color", value: "#101820" }, kind_themes: { lyrics: "vinho" } });
    assert.equal(lookOf({ standby_background: "keryx-media://a.webp" }).background.value, "keryx-media://a.webp", "the old standby picture counts");
    assert.deepEqual(lookFields({ background: { kind: "image", value: "u.png" }, kind_themes: { text: "t" } }), { background: { kind: "image", value: "u.png" }, kind_themes: { text: "t" }, standby_background: "u.png" });
    assert.deepEqual(templateLookFields({ background: null, kind_themes: {} }), { background: null, kind_themes: {} });
    assert.ok(hasLook({ kind_themes: { tool: "x" } }));
    assert.ok(!hasLook({}));
});

test("a template fills what the service has not chosen", () => {
    const template = { background: { kind: "generator", value: "fluid" }, kind_themes: { lyrics: "vinho", bible: "azul" } };
    assert.deepEqual(lookForService({}, template), { background: { kind: "generator", value: "fluid", gen: lookOf(template).background.gen }, kind_themes: { lyrics: "vinho", bible: "azul" }, standby_background: "" });
    const own = lookForService({ background: { kind: "color", value: "#000000" }, kind_themes: { lyrics: "meu" } }, template);
    assert.equal(own.background.value, "#000000", "the service's own background stays");
    assert.deepEqual(own.kind_themes, { lyrics: "meu", bible: "azul" }, "its own theme stays; the missing one comes");
    assert.equal(lookForService({ background: { kind: "color", value: "#000000" }, kind_themes: { lyrics: "a", bible: "b" } }, template), null, "nothing to fill");
    assert.equal(lookForService({}, {}), null);
});

test("the service's theme comes before the church's Temas padrão", () => {
    const themes = [{ id: "padrao", is_default: true }, { id: "vinho" }, { id: "biblia" }];
    assert.equal(themeForKind(themes, "lyrics", {}, { lyrics: "vinho" }).id, "vinho");
    assert.equal(themeForKind(themes, "bible", { bible: "biblia" }, { lyrics: "vinho" }).id, "biblia", "no theme of its own for that kind: the church's");
    assert.equal(themeForKind(themes, "lyrics", {}, { lyrics: "apagado" }).id, "padrao", "a deleted one is passed over");
    assert.equal(themeForKind(themes, "lyrics", {}, { lyrics: "none" }), null, "the factory look, on purpose");
    assert.equal(themeForKind(themes, "lyrics", {}).id, "padrao");
});
