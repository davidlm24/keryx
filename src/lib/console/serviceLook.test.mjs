import test from "node:test";
import assert from "node:assert/strict";
import { serviceTheme, lookOf, lookFields, templateLookFields, lookForService } from "./serviceLook.js";

test("a service's look: its background and one theme", () => {
    assert.equal(serviceTheme({ theme_id: " vinho " }), "vinho");
    assert.equal(serviceTheme({ kind_themes: { lyrics: "antigo", bible: "b" } }), "antigo", "an old Visual do culto: its Música theme");
    assert.equal(serviceTheme({ theme_id: "novo", kind_themes: { lyrics: "antigo" } }), "novo", "theme_id wins");
    assert.equal(serviceTheme({ kind_themes: { bible: "b" } }), "", "no Música theme: none");
    assert.equal(serviceTheme(null), "");
    const look = lookOf({ background: { kind: "color", value: "#101820" }, theme_id: "vinho" });
    assert.deepEqual(look, { background: { kind: "color", value: "#101820" }, theme_id: "vinho" });
    assert.equal(lookOf({ standby_background: "keryx-media://a.webp" }).background.value, "keryx-media://a.webp", "the old standby picture counts");
    assert.deepEqual(lookFields({ background: { kind: "image", value: "u.png" }, theme_id: "t" }), { background: { kind: "image", value: "u.png" }, theme_id: "t", standby_background: "u.png" });
    assert.deepEqual(templateLookFields({ background: null }), { background: null, theme_id: "" });
    assert.ok(!("kind_themes" in lookFields({ background: null, kind_themes: { lyrics: "x" } })), "the old per-kind themes are never written");
});

test("a template fills what the service has not chosen", () => {
    const template = { background: { kind: "generator", value: "fluid" }, theme_id: "vinho" };
    assert.deepEqual(lookForService({}, template), { background: { kind: "generator", value: "fluid", gen: lookOf(template).background.gen }, theme_id: "vinho", standby_background: "" });
    const own = lookForService({ background: { kind: "color", value: "#000000" } }, template);
    assert.equal(own.background.value, "#000000", "the service's own background stays");
    assert.equal(own.theme_id, "vinho", "the missing theme comes");
    assert.equal(lookForService({ theme_id: "meu" }, template).theme_id, "meu", "its own theme stays");
    assert.equal(lookForService({ background: { kind: "color", value: "#000000" }, theme_id: "a" }, template), null, "nothing to fill");
    assert.equal(lookForService({}, { kind_themes: { lyrics: "antigo" } }).theme_id, "antigo", "an old template's Música theme");
    assert.equal(lookForService({}, {}), null);
});
