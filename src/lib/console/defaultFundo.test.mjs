import test from "node:test";
import assert from "node:assert/strict";
import { defaultFundo, defaultFundoArgs, defaultFundoFrom, fundoGoesOnNow, fundoNow, FUNDO_TITLES } from "./defaultFundo.js";
import { applyOp, emptyState, restoreState, LIVE_VERSION } from "../../../shared/live-state.mjs";

const T = new Date(2026, 9, 11, 19, 0).getTime();
const user = {
    default_background: { kind: "image", value: "keryx-media://igreja.webp" },
    // No longer read: the service (and its template) took the day's place.
    weekday_backgrounds: { 0: { kind: "generator", value: "aurora" } },
};

test("the service's background first, then the church's", () => {
    const svc = defaultFundo({ service: { background: { kind: "video", value: "v.mp4" } }, user });
    assert.deepEqual([svc.from, svc.title], ["culto", "Papel de parede do culto"]);
    const church = defaultFundo({ service: { date: "2026-10-11" }, user });
    assert.deepEqual([church.from, church.spec.value], ["igreja", "keryx-media://igreja.webp"], "a weekday background no longer counts");
    assert.equal(defaultFundo({ service: null, user: {} }), null);
    assert.equal(defaultFundo(), null);
});

test("rows from before: the standby picture still counts", () => {
    assert.equal(defaultFundo({ service: { standby_background: "keryx-media://antigo.webp" }, user }).spec.value, "keryx-media://antigo.webp");
    assert.equal(defaultFundo({ service: null, user: { standby_background: "keryx-media://padrao.webp" } }).spec.value, "keryx-media://padrao.webp");
});

test("background.default takes it", () => {
    const args = defaultFundoArgs(defaultFundo({ service: { background: { kind: "color", value: "#203040" } }, user }));
    const s = applyOp(emptyState(T), "background.default", { background: args }, T);
    assert.equal(s.defaultBackground.value, "#203040");
    assert.equal(s.defaultBackground.title, "Papel de parede do culto");
    assert.equal(defaultFundoFrom(s), "culto", "the UI that warns on the fallback row reads whose it is");
    assert.equal(defaultFundoFrom(emptyState(T)), null);
    assert.equal(defaultFundoArgs(null), null);
});

test("fundoNow names whose background the Fundo holds (culto, igreja, the item's own)", () => {
    const empty = emptyState(T);
    assert.equal(fundoNow(empty), null, "nothing on the Fundo");
    assert.equal(fundoNow(null), null);
    // The default-fundo plumbing titles what it sends (defaultFundoArgs).
    const culto = applyOp(applyOp(empty,
        "background.default", { background: { kind: "color", value: "#405060", title: FUNDO_TITLES.culto } }, T),
        "background.set", { kind: "color", value: "#405060", title: FUNDO_TITLES.culto }, T);
    assert.deepEqual(fundoNow(culto), { from: "culto", title: "Papel de parede do culto" });
    const igreja = applyOp(applyOp(empty,
        "background.default", { background: { kind: "image", value: "keryx-media://igreja.webp", title: FUNDO_TITLES.igreja } }, T),
        "background.set", { kind: "image", value: "keryx-media://igreja.webp", title: FUNDO_TITLES.igreja }, T);
    assert.deepEqual(fundoNow(igreja), { from: "igreja", title: "Papel de parede da igreja" });
    // A live state from before the rename (the old titles) is still named.
    const antigo = applyOp(empty, "background.set", { kind: "color", value: "#405060", title: "Fundo do culto" }, T);
    assert.deepEqual(fundoNow(antigo), { from: "culto", title: "Papel de parede do culto" });
    assert.equal(fundoNow(applyOp(empty, "background.set", { kind: "color", value: "#101010", title: "Fundo padrão" }, T)).from, "igreja");
    // An untitled Fundo that matches the Fundo padrão is still named by it.
    const untitled = applyOp(culto, "background.set", { kind: "color", value: "#405060" }, T);
    assert.equal(fundoNow(untitled).from, "culto");
    // A song's own background (fundoOps titles it with the item).
    const song = applyOp(culto, "background.set", { kind: "generator", value: "aurora", title: "Oceans" }, T);
    assert.deepEqual(fundoNow(song), { from: "item", title: "Oceans" });
});

test("a new Fundo padrão goes on at once with nothing on air, under Tela preta too, never past a lock", () => {
    const empty = emptyState(T);
    assert.equal(fundoGoesOnNow(empty), true);
    // KERYX reopens with the screens black (restoreState): the Fundo is set under it.
    const black = restoreState({ ...empty, version: LIVE_VERSION }, T);
    assert.equal(black.screen, "black");
    assert.equal(fundoGoesOnNow(black), true);
    const song = applyOp(empty, "content.show", { title: "Canto", slides: [{ text: "a" }] }, T);
    assert.equal(fundoGoesOnNow(song), false, "something on air keeps its Fundo");
    assert.equal(fundoGoesOnNow(restoreState({ ...song, version: LIVE_VERSION }, T)), false, "and so does what reopens under Tela preta");
    assert.equal(fundoGoesOnNow(applyOp(empty, "screens.lock", { locked: true }, T)), false, "Travar telas");
    assert.equal(fundoGoesOnNow(applyOp(empty, "layers.lock", { layer: "background", locked: true }, T)), false, "Camadas' padlock");
    assert.equal(fundoGoesOnNow(null), false);
});
