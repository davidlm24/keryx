import test from "node:test";
import assert from "node:assert/strict";
import { DETACHABLE, HOSTED, canDetach, normalizeDetached, isDetached, detachedList, detachModule, attachModule, panelTitle, panelWindowName, panelQuery, panelFromParams } from "./detach.js";

test("which panels may leave for a window: never the Programa, the Prévia, the No ar strip, the Player or the Bíblia's", () => {
    for (const id of ["programa", "previa", "onair", "player", "books", "reading", "air"]) assert.equal(DETACHABLE.includes(id), false, id);
    assert.deepEqual(HOSTED, ["lib", "setlist", "abas"], "Rodada 1 hosts these three");
    assert.ok(HOSTED.every((id) => DETACHABLE.includes(id)));
    assert.equal(canDetach("lib"), true);
    assert.equal(canDetach("camadas"), false, "not hosted yet");
    assert.equal(canDetach("toString"), false);
});

test("layout.detached is made safe, and detaching never leaves the panel folded", () => {
    assert.deepEqual(normalizeDetached({ lib: true, setlist: "yes", onair: true, abas: true, zz: true }), { lib: true, abas: true });
    assert.deepEqual(normalizeDetached(null), {});
    assert.deepEqual(normalizeDetached(["lib"]), {});
    const layout = { folded: { lib: true, setlist: true }, detached: {} };
    const out = detachModule(layout, "lib");
    assert.deepEqual(out.detached, { lib: true });
    assert.deepEqual(out.folded, { setlist: true });
    assert.equal(detachModule(out, "lib"), out, "twice: nothing changes");
    assert.equal(detachModule(layout, "programa"), layout, "the Programa never leaves");
    assert.equal(isDetached(out, "lib"), true);
    assert.deepEqual(detachedList({ detached: { lib: true, setlist: true, onair: true } }), ["lib", "setlist"]);
    const back = attachModule(out, "lib");
    assert.deepEqual(back.detached, {});
    assert.equal(attachModule(back, "lib"), back, "already back: nothing changes");
});

test("the window: its name, its URL, its title", () => {
    assert.equal(panelWindowName("setlist"), "keryx-janela-panel-setlist");
    assert.equal(panelQuery("lib"), "page=panel&module=lib");
    assert.equal(panelFromParams(new URLSearchParams(panelQuery("abas"))), "abas");
    assert.equal(panelFromParams(new URLSearchParams("page=panel&module=programa")), null);
    assert.equal(panelFromParams(new URLSearchParams("page=song&module=lib")), null);
    assert.equal(panelTitle("abas"), "Painel");
    assert.equal(panelTitle("lib"), "Biblioteca");
});
