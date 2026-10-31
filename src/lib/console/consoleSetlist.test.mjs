import test from "node:test";
import assert from "node:assert/strict";
import { isConsoleSetlist, cultosOf, consoleSetlistOf, consoleSetlistRow, visibleService, mergePlan, mergedOrders, copyItems, setlistTitle } from "./consoleSetlist.js";

const shared = (id, created) => ({ id, title: "Setlist", service_type: "console", created_date: created });
const culto = (id, title = "Culto de 27/10") => ({ id, title, service_type: "culto", date: "2026-10-27" });

test("the shared Setlist is the console row, never a culto", () => {
    assert.equal(isConsoleSetlist(shared("s", "2026-10-29")), true);
    assert.equal(isConsoleSetlist(culto("c")), false);
    assert.equal(isConsoleSetlist({ id: "old" }), false, "a row from before has no type: a culto");
    assert.equal(isConsoleSetlist(null), false);
    assert.deepEqual(cultosOf([shared("s"), culto("c"), { id: "e", service_type: "evento" }]).map((s) => s.id), ["c", "e"]);
});

test("a new shared row: the console kind, today's date, a fixed title", () => {
    const row = consoleSetlistRow(new Date(2026, 9, 29, 23, 30));
    assert.deepEqual(row, { title: "Setlist", date: "2026-10-29", service_type: "console", status: "READY" });
});

test("every console shows the church's active culto, else the shared Setlist", () => {
    const list = [culto("c27"), shared("s", "2026-10-29T10:00:00Z"), culto("c22", "Culto de 22/10")];
    assert.deepEqual(visibleService(list, "c22"), { service: list[2], active: true });
    assert.deepEqual(visibleService(list, ""), { service: list[1], active: false });
    assert.deepEqual(visibleService(list, null), { service: list[1], active: false });
    assert.deepEqual(visibleService(list, "gone"), { service: list[1], active: false }, "a deleted culto: back to the Setlist");
    assert.deepEqual(visibleService(list, "s"), { service: list[1], active: false }, "the shared row is never 'active'");
    assert.deepEqual(visibleService([culto("c27")], ""), { service: null, active: false }, "no shared row yet");
    assert.deepEqual(visibleService([], "c27"), { service: null, active: false });
});

test("two shared rows: every computer keeps the oldest and drops the rest", () => {
    const list = [shared("b", "2026-10-29T10:00:05Z"), culto("c"), shared("a", "2026-10-29T10:00:05Z"), shared("z", "2026-10-29T09:00:00Z")];
    assert.equal(consoleSetlistOf(list).id, "z");
    assert.deepEqual(mergePlan(list), { keep: "z", drop: ["a", "b"] }, "same time: the id decides, the same on every computer");
    assert.equal(mergePlan([shared("one", "2026-10-29"), culto("c")]), null);
    assert.equal(mergePlan([]), null);
});

test("the dropped row's items go after the kept row's, in their own order", () => {
    const kept = [{ id: "k0", order: 0 }, { id: "k1", order: 1 }];
    const moved = [{ id: "m1", order: 1 }, { id: "m0", order: 0 }];
    assert.deepEqual(mergedOrders(kept, moved), [{ id: "m0", order: 2 }, { id: "m1", order: 3 }]);
    assert.deepEqual(mergedOrders([{ id: "k", order: 7 }], [{ id: "m" }]), [{ id: "m", order: 8 }], "after the highest number, a gap or not");
    assert.deepEqual(mergedOrders([], [{ id: "m", order: 3 }]), [{ id: "m", order: 0 }]);
    assert.deepEqual(mergedOrders(kept, []), []);
});

test("Guardar no culto copies the items in order, after the culto's own", () => {
    const items = [
        { id: "2", serviceId: "s", order: 1, type: "SONG", title: "Santo", contentId: "song-1", notes: null, requested_by: "Ana" },
        { id: "1", serviceId: "s", order: 0, type: "SECTION", title: "Louvor", created_date: "x" },
    ];
    assert.deepEqual(copyItems(items, "c27", 3), [
        { type: "SECTION", title: "Louvor", serviceId: "c27", order: 3 },
        { type: "SONG", title: "Santo", contentId: "song-1", requested_by: "Ana", serviceId: "c27", order: 4 },
    ]);
    assert.deepEqual(copyItems([], "c27"), []);
});

test("the panel's title: the culto while one is active", () => {
    assert.equal(setlistTitle({ service: culto("c"), active: true }), "Culto de 27/10");
    assert.equal(setlistTitle({ service: shared("s"), active: false }), "Setlist");
    assert.equal(setlistTitle({ service: null, active: false }), "Setlist");
    assert.equal(setlistTitle({ service: { id: "c", title: "" }, active: true }), "Culto sem nome");
});
