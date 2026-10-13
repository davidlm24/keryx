import test from "node:test";
import assert from "node:assert/strict";
import { defaultFundo, defaultFundoArgs, fundoGoesOnNow } from "./defaultFundo.js";
import { applyOp, emptyState, restoreState, LIVE_VERSION } from "../../../shared/live-state.mjs";

const T = new Date(2026, 9, 11, 19, 0).getTime();
const user = {
    default_background: { kind: "image", value: "keryx-media://igreja.webp" },
    // No longer read: the service (and its template) took the day's place.
    weekday_backgrounds: { 0: { kind: "generator", value: "aurora" } },
};

test("the service's background first, then the church's", () => {
    const svc = defaultFundo({ service: { background: { kind: "video", value: "v.mp4" } }, user });
    assert.deepEqual([svc.from, svc.title], ["culto", "Fundo do culto"]);
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
    assert.equal(s.defaultBackground.title, "Fundo do culto");
    assert.equal(defaultFundoArgs(null), null);
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
