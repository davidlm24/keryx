import test from "node:test";
import assert from "node:assert/strict";
import { bgSpec, bgFields, bgArgs, bgLabel, cleanSpec, sameBg, fundoOps, applyWithFundo } from "./backgroundSpec.js";
import { songContent, passageContent } from "./content.js";
import { emptyState, applyOp } from "../../../shared/live-state.mjs";

const T = 1_000_000;

test("one background format: the new field, else the old picture, else the old generated one", () => {
    assert.equal(bgSpec(null), null);
    assert.equal(bgSpec({}), null);
    assert.deepEqual(bgSpec({ background_image: "keryx-media://a.webp", background_dim: 0.3, background_blur: 4, background_fit: "contain" }), { kind: "image", value: "keryx-media://a.webp", dim: 0.3, blur: 4, fit: "contain" });
    const gen = bgSpec({ background_generator: { id: "fluid", speed: 0.4 }, background_dim: 0.2 });
    assert.equal(gen.kind, "generator");
    assert.equal(gen.value, "fluid");
    assert.equal(gen.gen.speed, 0.4);
    assert.ok(Array.isArray(gen.gen.colors), "the generator comes complete");
    assert.equal(gen.dim, 0.2);
    assert.deepEqual(bgSpec({ background: { kind: "color", value: "#0F1A2E" }, background_image: "old.png" }), { kind: "color", value: "#0f1a2e" }, "the new field wins");
    assert.equal(bgSpec({ background: { kind: "color", value: "azul" } }), null, "a colour is #rrggbb");
    assert.equal(cleanSpec({ kind: "generator", value: "nope" }), null, "unknown generator");
    assert.equal(cleanSpec({ kind: "image", value: "  " }), null);
    assert.deepEqual(cleanSpec({ kind: "image", value: "u", dim: 2, blur: -1, fit: "stretch", position: "top" }), { kind: "image", value: "u", dim: 0.9, blur: 0, position: "top" }, "clamped, unknown fit dropped");
});

test("saving: the new field and the old ones in step", () => {
    assert.deepEqual(bgFields({ kind: "image", value: "u.png", dim: 0.4 }), { background: { kind: "image", value: "u.png", dim: 0.4 }, background_image: "u.png", background_generator: null, background_dim: 0.4, background_blur: null, background_fit: "" });
    const g = bgFields({ kind: "generator", value: "clouds" });
    assert.equal(g.background_image, "");
    assert.equal(g.background_generator.id, "clouds");
    assert.deepEqual(bgFields({ kind: "video", value: "v.mp4" }).background_image, "", "a clip is not a picture for old readers");
    assert.deepEqual(bgFields(null), { background: null, background_image: "", background_generator: null, background_dim: null, background_blur: null, background_fit: "" });
});

test("background.set arguments and labels", () => {
    assert.deepEqual(bgArgs({ kind: "video", value: "v.mp4" }, "Clipe"), { kind: "video", value: "v.mp4", title: "Clipe" });
    assert.equal(bgArgs(null), null);
    assert.doesNotThrow(() => applyOp(emptyState(T), "background.set", bgArgs({ kind: "generator", value: "aurora" }, "A"), T));
    assert.equal(bgLabel({ kind: "generator", value: "fluid" }, { fluid: "Fluido" }), "Gerado · Fluido");
    assert.equal(bgLabel({ kind: "color", value: "#000000" }), "Cor #000000");
    assert.equal(bgLabel(null), "Nenhum");
    assert.ok(sameBg({ kind: "image", value: "a" }, { kind: "image", value: "a", dim: 0.2 }));
    assert.ok(!sameBg({ kind: "image", value: "a" }, { kind: "video", value: "a" }));
});

test("the rule of the Fundo: an item's background goes to the Fundo layer, so it stays after Esc", () => {
    const song = { id: "s1", title: "Canto", lyrics: "um\n\ndois", background: { kind: "generator", value: "clouds" } };
    const args = songContent(song);
    assert.equal(args.fundo.kind, "generator");
    const ops = fundoOps("content.show", args, emptyState(T));
    assert.deepEqual(ops.map(([op]) => op), ["background.set", "content.show"]);
    assert.equal(ops[1][1].fundo, undefined, "fundo never reaches the live state");
    let s = applyWithFundo(emptyState(T), "content.show", args, T);
    assert.equal(s.background.value, "clouds");
    assert.equal(s.background.title, "Canto");
    s = applyOp(s, "clear", {}, T);
    assert.equal(s.background.value, "clouds", "Esc: the song's background stays");
    // A picture in the style (a text item, an old history entry) moves too, with its look.
    const pic = fundoOps("content.show", { title: "T", slides: [{ text: "x" }], style: { font_size: "large", background_image: "p.png", background_dim: 0.7, background_blur: 6 } }, null);
    assert.deepEqual(pic[0], ["background.set", { kind: "image", value: "p.png", dim: 0.7, blur: 6, title: "T" }]);
    assert.deepEqual(pic[1][1].style, { font_size: "large" });
    // No background of its own: the Fundo is left as it is.
    assert.deepEqual(fundoOps("content.show", passageContent({ reference: "João 3:16", text: "x" }), null).map(([op]) => op), ["content.show"]);
    // The padlock: nothing changes the Fundo, and the item's picture is not painted either.
    const locked = applyOp(emptyState(T), "layers.lock", { layer: "background", locked: true }, T);
    const held = fundoOps("content.show", { ...args, style: { background_image: "p.png" } }, locked);
    assert.deepEqual(held.map(([op]) => op), ["content.show"]);
    assert.equal(held[0][1].style.background_image, undefined);
    assert.doesNotThrow(() => applyWithFundo(locked, "content.show", args, T));
    // Other ops pass through untouched.
    const other = { index: 2 };
    assert.deepEqual(fundoOps("content.goTo", other), [["content.goTo", other]]);
});
