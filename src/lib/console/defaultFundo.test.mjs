import test from "node:test";
import assert from "node:assert/strict";
import { defaultFundo, defaultFundoArgs } from "./defaultFundo.js";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";

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
