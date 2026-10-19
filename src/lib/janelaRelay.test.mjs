import test from "node:test";
import assert from "node:assert/strict";
import { JANELA_MESSAGES, MAX_BYTES, checkMessage } from "./janelaRelay.js";

const stage = { id: "media:v1", kind: "media", title: "Vídeo", args: { url: "keryx-media://v.mp4" } };

test("a detached page sends what goes to the Prévia or on air; the console runs it", () => {
    assert.deepEqual(checkMessage({ type: "prev.set", stage }, "janela"), { type: "prev.set", stage });
    assert.ok(checkMessage({ type: "prev.set", stage: null }, "janela"), "null empties the Prévia");
    assert.ok(checkMessage({ type: "stage.send", stage }, "janela"));
    assert.ok(checkMessage({ type: "prev.send" }, "janela"));
    assert.ok(checkMessage({ type: "prev.step", d: -1 }, "janela"));
    assert.ok(checkMessage({ type: "song.saved", song: { id: "s1", title: "Hino", slides: [] } }, "janela"));
    assert.ok(checkMessage({ type: "setlist.material", material: { id: "m1", title: "Lição 1" } }, "janela"));
    assert.ok(checkMessage({ type: "console.open", what: "novidades" }, "janela"));
    assert.ok(checkMessage({ type: "console.open", what: "settings", section: "console" }, "janela"));
    assert.ok(checkMessage({ type: "console.hello" }, "janela"));
    // The console answers with its Prévia.
    assert.ok(checkMessage({ type: "console.prev", stage }, "console"));
    assert.ok(checkMessage({ type: "console.prev", stage: null }, "console"));
});

test("the list is closed: an unknown type, or one from the wrong side, is dropped", () => {
    assert.equal(checkMessage({ type: "live.call", op: "clear" }, "janela"), null);
    assert.equal(checkMessage({ type: "__proto__" }, "janela"), null);
    assert.equal(checkMessage({ type: "toString" }, "janela"), null);
    assert.equal(checkMessage({ type: "console.prev", stage }, "janela"), null, "only the console says what its Prévia holds");
    assert.equal(checkMessage({ type: "stage.send", stage }, "console"), null, "the console never sends on a page's behalf");
    assert.equal(checkMessage(null, "janela"), null);
    assert.equal(checkMessage("prev.send", "janela"), null);
    assert.equal(checkMessage([{ type: "prev.send" }], "janela"), null);
    for (const [type, spec] of Object.entries(JANELA_MESSAGES)) assert.ok(spec.from === "janela" || spec.from === "console", type);
});

test("each message carries what it says", () => {
    assert.equal(checkMessage({ type: "prev.set" }, "janela"), null, "no stage");
    assert.equal(checkMessage({ type: "stage.send", stage: { kind: "media" } }, "janela"), null, "a stage has an id");
    assert.equal(checkMessage({ type: "stage.send", stage: { id: "x" } }, "janela"), null, "and a kind");
    assert.equal(checkMessage({ type: "stage.send", stage: { ...stage, slides: "a" } }, "janela"), null, "slides are a list");
    assert.equal(checkMessage({ type: "prev.step", d: 3 }, "janela"), null);
    assert.equal(checkMessage({ type: "song.saved", song: { title: "sem id" } }, "janela"), null);
    assert.equal(checkMessage({ type: "setlist.material", material: { id: "m1" } }, "janela"), null, "a material has its title");
    assert.equal(checkMessage({ type: "console.open", what: "telas-pretas" }, "janela"), null);
    assert.equal(checkMessage({ type: "console.open", what: "settings", section: 5 }, "janela"), null);
});

test("what arrives is a plain copy, and never too big", () => {
    const sent = { type: "stage.send", stage: { ...stage, at: new Date(0), run: () => 1 } };
    const got = checkMessage(sent, "janela");
    assert.notEqual(got.stage, sent.stage, "a copy");
    assert.equal(got.stage.run, undefined, "functions stay behind");
    assert.equal(got.stage.at, "1970-01-01T00:00:00.000Z");
    const big = { type: "stage.send", stage: { ...stage, slides: [{ text: "x".repeat(MAX_BYTES) }] } };
    assert.equal(checkMessage(big, "janela"), null);
    const loop = { id: "a", kind: "text" };
    loop.self = loop;
    assert.equal(checkMessage({ type: "stage.send", stage: loop }, "janela"), null, "a cycle cannot travel");
});

test("the console tells detached pages how far each PDF's pages are; a page asks it to try again", () => {
    const pages = { m1: { done: 3, total: 12 }, m2: { done: 0, total: 0 }, m3: { error: { cause: "o arquivo está corrompido ou incompleto", retryable: true } } };
    assert.deepEqual(checkMessage({ type: "pages.progress", pages }, "console"), { type: "pages.progress", pages });
    assert.ok(checkMessage({ type: "pages.progress", pages: {} }, "console"), "nothing being made");
    assert.ok(checkMessage({ type: "pages.progress", pages: { m4: { error: { cause: "x", retryable: false, terminal: "PDF protegido por senha." } } } }, "console"));
    assert.equal(checkMessage({ type: "pages.progress", pages }, "janela"), null, "only the console makes pages");
    assert.equal(checkMessage({ type: "pages.progress" }, "console"), null, "a map");
    assert.equal(checkMessage({ type: "pages.progress", pages: [] }, "console"), null);
    assert.equal(checkMessage({ type: "pages.progress", pages: { m1: { done: 5, total: 2 } } }, "console"), null, "done never passes total");
    assert.equal(checkMessage({ type: "pages.progress", pages: { m1: { done: "1", total: 2 } } }, "console"), null);
    assert.equal(checkMessage({ type: "pages.progress", pages: { m1: { error: "falhou" } } }, "console"), null, "a failure is the console's own shape");
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`m${i}`, { done: 0, total: 1 }]));
    assert.equal(checkMessage({ type: "pages.progress", pages: many }, "console"), null, "200 at most");
    assert.deepEqual(checkMessage({ type: "pages.retry", id: "m3" }, "janela"), { type: "pages.retry", id: "m3" });
    assert.equal(checkMessage({ type: "pages.retry", id: "m3" }, "console"), null);
    assert.equal(checkMessage({ type: "pages.retry" }, "janela"), null);
});
