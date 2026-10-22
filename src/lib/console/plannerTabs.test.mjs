import test from "node:test";
import assert from "node:assert/strict";
import { NO_TABS, readTabs, pruneTabs, adoptTabs, openTab, closeTab, tabLabel, lastService, cultosToOpen, duplicateFields } from "./plannerTabs.js";

test("readTabs takes what was saved, and nothing odd", () => {
    assert.deepEqual(readTabs('{"ids":["a","b"],"active":"b"}'), { ids: ["a", "b"], active: "b" });
    assert.deepEqual(readTabs({ ids: ["a", "a", 3, "", "b"], active: "z" }), { ids: ["a", "b"], active: "a" });
    assert.deepEqual(readTabs({ ids: [], active: "a" }), { ids: [], active: null });
    for (const bad of [null, undefined, "", "{", "[]", '{"ids":"a"}', 42]) assert.equal(readTabs(bad), NO_TABS);
});

test("pruneTabs closes the tabs of cultos that are gone", () => {
    const tabs = { ids: ["a", "b", "c"], active: "a" };
    assert.equal(pruneTabs(tabs, ["a", "b", "c", "d"]), tabs, "the same object when nothing changed");
    assert.deepEqual(pruneTabs(tabs, new Set(["a", "c"])), { ids: ["a", "c"], active: "a" });
    // The one in front goes to its right neighbour, else its left.
    assert.deepEqual(pruneTabs({ ids: ["a", "b", "c"], active: "b" }, ["a", "c"]), { ids: ["a", "c"], active: "c" });
    assert.deepEqual(pruneTabs({ ids: ["a", "b", "c"], active: "c" }, ["a"]), { ids: ["a"], active: "a" });
    assert.deepEqual(pruneTabs({ ids: ["a", "b"], active: "a" }, []), { ids: [], active: null });
    // The new tab's chooser in front (active null) stays in front.
    assert.deepEqual(pruneTabs({ ids: ["a", "b"], active: null }, ["b"]), { ids: ["b"], active: null });
});

test("adoptTabs takes another window's cultos and keeps this one's front", () => {
    const own = { ids: ["a", "b"], active: "b" };
    assert.deepEqual(adoptTabs(own, { ids: ["a", "b", "c"], active: "c" }), { ids: ["a", "b", "c"], active: "b" });
    assert.deepEqual(adoptTabs(own, { ids: ["a"], active: "a" }), { ids: ["a"], active: "a" }, "its front closed there");
    assert.equal(adoptTabs(own, { ids: ["a", "b"], active: "a" }), own, "the same object when only their front differs");
    assert.deepEqual(adoptTabs({ ids: ["a"], active: null }, { ids: ["a", "c"], active: "c" }), { ids: ["a", "c"], active: "c" });
});

test("openTab opens right of the tab in front, or brings an open one forward", () => {
    assert.deepEqual(openTab(NO_TABS, "a"), { ids: ["a"], active: "a" });
    assert.deepEqual(openTab({ ids: ["a", "b", "c"], active: "a" }, "d"), { ids: ["a", "d", "b", "c"], active: "d" });
    assert.deepEqual(openTab({ ids: ["a", "b"], active: null }, "d"), { ids: ["a", "b", "d"], active: "d" });
    assert.deepEqual(openTab({ ids: ["a", "b"], active: "a" }, "b"), { ids: ["a", "b"], active: "b" });
    const same = { ids: ["a"], active: "a" };
    assert.equal(openTab(same, "a"), same);
    assert.equal(openTab(same, ""), same);
    assert.equal(openTab(same, null), same);
});

test("closeTab moves the front to the right neighbour, else the left", () => {
    assert.deepEqual(closeTab({ ids: ["a", "b", "c"], active: "b" }, "b"), { ids: ["a", "c"], active: "c" });
    assert.deepEqual(closeTab({ ids: ["a", "b", "c"], active: "c" }, "c"), { ids: ["a", "b"], active: "b" });
    assert.deepEqual(closeTab({ ids: ["a", "b", "c"], active: "a" }, "c"), { ids: ["a", "b"], active: "a" });
    assert.deepEqual(closeTab({ ids: ["a"], active: "a" }, "a"), { ids: [], active: null });
    const tabs = { ids: ["a"], active: "a" };
    assert.equal(closeTab(tabs, "z"), tabs);
});

test("tabLabel: the title and the day, the day once", () => {
    assert.equal(tabLabel({ title: "Domingo", date: "2026-10-26" }), "Domingo 26/10");
    assert.equal(tabLabel({ title: "Culto de 26/10", date: "2026-10-26" }), "Culto de 26/10");
    assert.equal(tabLabel({ title: "Ceia" }), "Ceia");
    assert.equal(tabLabel({ title: "  ", date: "2026-11-02" }), "Culto sem nome 02/11");
    assert.equal(tabLabel(null), "Culto");
});

const S = [
    { id: "d19", title: "Domingo", date: "2026-10-19" },
    { id: "d26", title: "Domingo", date: "2026-10-26" },
    { id: "s31", title: "Jovens", date: "2026-10-31" },
    { id: "d12", title: "Domingo", date: "2026-10-12" },
    { id: "x", title: "Sem data" },
];

test("lastService: the last culto up to today, else the next one", () => {
    assert.equal(lastService(S, "2026-10-21").id, "d19");
    assert.equal(lastService(S, "2026-10-26").id, "d26", "today counts");
    assert.equal(lastService(S, "2026-01-01").id, "d12");
    assert.equal(lastService([{ id: "x", title: "Sem data" }], "2026-10-21").id, "x");
    assert.equal(lastService([], "2026-10-21"), null);
});

test("cultosToOpen: the ones not open, coming first, then past, then undated", () => {
    assert.deepEqual(cultosToOpen(S, ["d26"], "2026-10-21").map((s) => s.id), ["s31", "d19", "d12", "x"]);
    assert.deepEqual(cultosToOpen(S, S.map((s) => s.id), "2026-10-21"), []);
});

test("duplicateFields: how the culto runs and looks, on the new day", () => {
    const src = { id: "d19", title: "Domingo", date: "2026-10-19", startTime: "18:00", location: "Templo", service_type: "culto", background: { kind: "color", value: "#000" }, theme_id: "t1", kind_themes: { lyrics: "t0" }, worship_team: [{ member_name: "Ana" }], autoplay: true, status: "DONE", operator_notes: "x", notes: "y", event_description: "" };
    const got = duplicateFields(src, { title: "Culto de 26/10", date: "2026-10-26", startTime: "19:00" });
    assert.deepEqual(got, { startTime: "18:00", location: "Templo", service_type: "culto", background: { kind: "color", value: "#000" }, theme_id: "t1", worship_team: [{ member_name: "Ana" }], autoplay: true, title: "Culto de 26/10", date: "2026-10-26" });
    assert.deepEqual(duplicateFields(null, { title: "T", date: "2026-10-26" }), { title: "T", date: "2026-10-26" });
});
