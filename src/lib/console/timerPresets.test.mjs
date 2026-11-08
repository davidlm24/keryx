import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_MINUTES, cleanMinutes, timerChoices, canKeepTimer, minutesLabel, ADJUST_STEPS } from "./timerPresets.js";

test("the five that always come, in order", () => {
    assert.deepEqual(BUILTIN_MINUTES, [5, 10, 15, 30, 60]);
    assert.deepEqual(timerChoices([]).map((c) => c.minutes), [5, 10, 15, 30, 60]);
    assert.ok(timerChoices([]).every((c) => c.id === null));
});

test("minutes must be a whole number from 1 to 180", () => {
    assert.equal(cleanMinutes("7"), 7);
    assert.equal(cleanMinutes(7.4), 7);
    assert.equal(cleanMinutes(180), 180);
    for (const bad of [0, -3, 181, "", null, undefined, "abc", NaN]) assert.equal(cleanMinutes(bad), null);
});

test("kept times join the list, sorted, once each, with their row to delete", () => {
    const rows = [{ id: "a", minutes: 45 }, { id: "b", minutes: 7 }, { id: "c", minutes: 10 }, { id: "d", minutes: 7 }, { id: "e", minutes: 999 }, { minutes: 20 }, null];
    const choices = timerChoices(rows);
    assert.deepEqual(choices.map((c) => c.minutes), [5, 7, 10, 15, 30, 45, 60]);
    assert.equal(choices.find((c) => c.minutes === 7).id, "b"); // the first row of a repeated time
    assert.equal(choices.find((c) => c.minutes === 10).id, null); // the built-in one wins over a kept copy
    assert.equal(choices.find((c) => c.minutes === 45).id, "a");
});

test("a time can be kept when valid and not already on offer; the reason says why not", () => {
    const rows = [{ id: "a", minutes: 45 }];
    assert.deepEqual(canKeepTimer(7, rows), { ok: true, why: "" });
    assert.match(canKeepTimer(10, rows).why, /10 min já está/); // a built-in one
    assert.match(canKeepTimer(45, rows).why, /45 min já está/); // a kept one
    assert.match(canKeepTimer(0, rows).why, /de 1 a 180/);
    assert.match(canKeepTimer("", rows).why, /de 1 a 180/);
});

test("times as they read on a button", () => {
    assert.equal(minutesLabel(5), "5 min");
    assert.equal(minutesLabel(60), "1 h");
    assert.equal(minutesLabel(90), "1 h 30 min");
    assert.equal(minutesLabel(120), "2 h");
});

test("the steps for a timer on air", () => {
    assert.deepEqual(ADJUST_STEPS.map(([ms]) => ms), [-60000, 60000, 300000]);
});
