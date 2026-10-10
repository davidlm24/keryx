import test from "node:test";
import assert from "node:assert/strict";
import { serviceTiming, lateWords, serviceClock } from "./timeline.js";

const day = new Date(2026, 9, 9);
const at = (h, m) => new Date(2026, 9, 9, h, m).getTime();
const items = [{ duration: 300 }, { duration: 600 }, { duration: 1200 }];
const times = ["19:00", "19:05", "19:15"];

test("a service with no items has nothing to say", () => {
    assert.deepEqual(serviceTiming({ items: [], times: [], airIdx: -1, startedAt: null, now: day.getTime() }), { count: 0, done: 0, late: 0, plannedEnd: null, forecastEnd: null });
});

test("nothing on air yet: the plan, no lateness", () => {
    const t = serviceTiming({ items, times, airIdx: -1, startedAt: null, now: at(18, 55) });
    assert.equal(t.count, 3);
    assert.equal(t.done, 0);
    assert.equal(t.late, 0);
    assert.equal(t.plannedEnd, at(19, 35));
    assert.equal(t.forecastEnd, at(19, 35));
});

test("running late moves the end by the same minutes", () => {
    // The second item was planned for 19:05 and went on air at 19:09.
    const t = serviceTiming({ items, times, airIdx: 1, startedAt: at(19, 9), now: at(19, 10) });
    assert.equal(t.done, 1);
    assert.equal(t.late, 4);
    assert.equal(t.forecastEnd, at(19, 39));
    assert.equal(lateWords(t.late, true), "+4 min atrasado");
});

test("ahead of the plan", () => {
    const t = serviceTiming({ items, times, airIdx: 1, startedAt: at(19, 3), now: at(19, 4) });
    assert.equal(t.late, -2);
    assert.equal(t.forecastEnd, at(19, 33));
    assert.equal(lateWords(t.late, true), "−2 min adiantado");
    assert.equal(lateWords(0, true), "no horário");
    assert.equal(lateWords(5, false), "");
});

test("planned times unknown: no end is invented", () => {
    const t = serviceTiming({ items, times: ["", "", ""], airIdx: 1, startedAt: at(19, 9), now: at(19, 10) });
    assert.equal(t.plannedEnd, null);
    assert.equal(t.forecastEnd, null);
    assert.equal(t.late, 0);
});

test("something on air that is not in the Setlist (a song from the Biblioteca) does not count as late", () => {
    const t = serviceTiming({ items, times, airIdx: -1, startedAt: at(19, 20), now: at(19, 21) });
    assert.equal(t.late, 0);
    assert.equal(t.forecastEnd, t.plannedEnd);
});

// The service clock: 9 Oct 2026, a service at 19:00 with 1h10 of Setlist.
const svc = { date: "2026-10-09", startTime: "19:00" };
const sec = (h, m, s) => new Date(2026, 9, 9, h, m, s).getTime();

test("service clock: nothing chosen, no time set (never a 19:00 fallback)", () => {
    assert.equal(serviceClock({ service: null, now: at(18, 0) }).text, "Sem culto");
    const none = serviceClock({ service: { date: "2026-10-09" }, now: at(19, 30) });
    assert.equal(none.text, "Culto sem horário");
    assert.equal(none.muted, true);
    // The legacy "time" field counts.
    assert.equal(serviceClock({ service: { date: "2026-10-09", time: "18:30" }, now: at(18, 0) }).text, "Começa às 18:30");
});

test("service clock: another day, and later today", () => {
    assert.equal(serviceClock({ service: { date: "2026-10-12", startTime: "19:00" }, now: at(18, 0) }).text, "Culto em 12/10 às 19:00");
    const soon = serviceClock({ service: svc, now: sec(18, 48, 30) });
    assert.deepEqual([soon.text, soon.more], ["Começa às 19:00", "em 12 min"]);
    assert.equal(serviceClock({ service: svc, now: at(16, 55) }).more, "em 2h05");
});

test("service clock: running, with the forecast end", () => {
    const c = serviceClock({ service: svc, seconds: 70 * 60, now: sec(19, 42, 10) });
    assert.deepEqual([c.text, c.more, c.warn], ["Culto 0:42:10", "termina ~20:10", false]);
    // Late: the end moves and turns amber.
    const late = serviceClock({ service: svc, seconds: 70 * 60, late: 4, now: sec(19, 42, 10) });
    assert.deepEqual([late.more, late.warn], ["termina ~20:14 · +4 min", true]);
    // No durations in the Setlist: no end is invented.
    assert.equal(serviceClock({ service: svc, now: at(19, 5) }).more, "");
});

test("service clock: past the end, and a service long over", () => {
    const over = serviceClock({ service: svc, seconds: 70 * 60, now: sec(20, 15, 5) });
    assert.deepEqual([over.text, over.more, over.warn], ["Culto 1:15:05", "passou 5 min", true]);
    // Running past midnight still counts from the start.
    assert.equal(serviceClock({ service: { date: "2026-10-09", startTime: "23:00" }, now: new Date(2026, 9, 10, 0, 30).getTime() }).text, "Culto 1:30:00");
    assert.equal(serviceClock({ service: { date: "2026-10-05", startTime: "19:00" }, now: at(10, 0) }).text, "Culto de 05/10 às 19:00");
});
