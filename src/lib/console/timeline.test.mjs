import test from "node:test";
import assert from "node:assert/strict";
import { serviceTiming, lateWords } from "./timeline.js";

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
