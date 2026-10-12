import test from "node:test";
import assert from "node:assert/strict";
import { defaultFundo, defaultFundoArgs, weekdayOf, withDay } from "./defaultFundo.js";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";

const sunday = new Date(2026, 9, 11, 19, 0).getTime(); // 11 Oct 2026, a Sunday
const user = {
    default_background: { kind: "image", value: "keryx-media://igreja.webp" },
    weekday_backgrounds: { 0: { kind: "generator", value: "aurora" }, 3: { kind: "color", value: "#101820" } },
};

test("the service's background first, then the day's, then the church's", () => {
    assert.equal(defaultFundo({ service: { background: { kind: "video", value: "v.mp4" } }, user, now: sunday }).from, "culto");
    const day = defaultFundo({ service: { date: "2026-10-14" }, user, now: sunday });
    assert.deepEqual([day.from, day.spec.value, day.title], ["dia", "#101820", "Fundo de quarta"], "the service's day, not today");
    assert.equal(defaultFundo({ service: null, user, now: sunday }).spec.value, "aurora", "no service: today");
    const church = defaultFundo({ service: { date: "2026-10-13" }, user, now: sunday });
    assert.deepEqual([church.from, church.spec.value], ["igreja", "keryx-media://igreja.webp"]);
    assert.equal(defaultFundo({ service: null, user: {}, now: sunday }), null);
    assert.equal(defaultFundo(), null);
});

test("rows from before: the standby picture still counts", () => {
    assert.equal(defaultFundo({ service: { standby_background: "keryx-media://antigo.webp" }, user, now: sunday }).spec.value, "keryx-media://antigo.webp");
    assert.equal(defaultFundo({ service: null, user: { standby_background: "keryx-media://padrao.webp" }, now: sunday }).spec.value, "keryx-media://padrao.webp");
});

test("background.default takes it; the weekday map keeps one per day", () => {
    const args = defaultFundoArgs(defaultFundo({ user, now: sunday }));
    const s = applyOp(emptyState(sunday), "background.default", { background: args }, sunday);
    assert.equal(s.defaultBackground.value, "aurora");
    assert.equal(s.defaultBackground.title, "Fundo de domingo");
    assert.equal(defaultFundoArgs(null), null);
    assert.equal(weekdayOf({ date: "2026-10-11" }), 0);
    assert.deepEqual(withDay({ 0: { kind: "color", value: "#000000" } }, 6, { kind: "color", value: "#FFFFFF" }), { 0: { kind: "color", value: "#000000" }, 6: { kind: "color", value: "#ffffff" } });
    assert.deepEqual(withDay({ 0: { kind: "color", value: "#000000" } }, 0, null), {});
});
