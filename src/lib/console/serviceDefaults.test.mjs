import { test } from "node:test";
import assert from "node:assert/strict";
import { nextWeekday, newServiceDefaults, defaultDuration, localDate, teamRole, TEAM_ROLES } from "./serviceDefaults.js";

// Local times: what the church computer's clock says.
const at = (y, m, d, h = 22) => new Date(y, m - 1, d, h, 30);

test("the next service day: today included, across months and years", () => {
    assert.equal(localDate(nextWeekday(at(2026, 10, 11), 0)), "2026-10-11", "Sunday on a Sunday: today");
    assert.equal(localDate(nextWeekday(at(2026, 10, 12), 0)), "2026-10-18", "Monday: next Sunday");
    assert.equal(localDate(nextWeekday(at(2026, 10, 30), 3)), "2026-11-04", "into the next month");
    assert.equal(localDate(nextWeekday(at(2026, 12, 31), 0)), "2027-01-03", "into the next year");
    assert.equal(localDate(nextWeekday(at(2026, 10, 12), null)), "2026-10-12", "no day chosen: today");
});

test("a late Sunday night is still Sunday (local date, not UTC)", () => {
    assert.equal(newServiceDefaults({ service_weekday: 0 }, at(2026, 10, 11, 23)).date, "2026-10-11");
});

test("Novo culto: the church's day and time, no invented hour", () => {
    assert.deepEqual(newServiceDefaults({ service_weekday: 0, service_start_time: "18:30" }, at(2026, 10, 12)), { title: "Culto de 18/10", date: "2026-10-18", startTime: "18:30" });
    assert.deepEqual(newServiceDefaults({}, at(2026, 10, 12)), { title: "Culto de 12/10", date: "2026-10-12" }, "nothing chosen: today, no time");
});

test("default lengths: a song, anything else, a section", () => {
    const prefs = { duration_song: 300, duration_other: 90 };
    assert.equal(defaultDuration("SONG", prefs), 300);
    assert.equal(defaultDuration("BIBLE", prefs), 90);
    assert.equal(defaultDuration("SECTION", prefs), 0);
    assert.equal(defaultDuration("SONG", {}), 240, "the old figures without a preference");
    assert.equal(defaultDuration("TEXT", null), 120);
});

test("team roles in pt-BR, unknown ones as Outro", () => {
    assert.equal(teamRole("keyboardist"), "Teclado");
    assert.equal(teamRole("nope"), "Outro");
    assert.equal(TEAM_ROLES.length, 7);
});
