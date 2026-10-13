import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDock, fromArrangement, defaultDock, moveModules, hideModule, setActive, resizeChild, fitDock, allocate, minSize, leaves, nodeAt, pathOf, group, split, NEW_PX, PLAYER_SLOT } from "./dock.js";

const g = (...tabs) => group(tabs);
// The console of the 2026-10-13 audit: Biblioteca | Slides | Programa over
// Prévia · Painel de abas | Camadas over the Setlist.
const fourColumns = () => split("row", [
    g("lib"), g("slides"),
    split("col", [g("programa"), split("row", [g("previa"), g("abas")], [444, null])], [null, 334]),
    split("col", [g("camadas"), g("setlist")], [360, null]),
], [260, 300, null, 320]);

test("the default dock is the four-column console, nothing in the tray", () => {
    // centre = 1908 − 326 − 266 − 306 = 1010; the Prévia 44 % = 444; 444 · 9/16 + 84 = 334
    assert.deepEqual(defaultDock(), { tree: fourColumns(), hidden: [] });
});

test("an old layout migrates: its column order, stack order, hidden modules and sizes", () => {
    const d = fromArrangement({ order: { culto: ["live", "side", "lib", "slides"] }, stacks: { side: ["roteiro", "camadas"] }, hidden: { lib: true, camadas: true }, slidesW: 340, prevPct: 25 }, { width: 1500 });
    // centre = 1500 − 326 − 346 = 828; 25 % = 207, at least the Prévia's 220; 220 · 9/16 + 84 = 208
    assert.deepEqual(d.tree, split("row", [
        split("col", [g("programa"), split("row", [g("previa"), g("abas")], [220, null])], [null, 208]),
        g("setlist"),
        g("slides"),
    ], [null, 320, 340]));
    assert.deepEqual(d.hidden, ["lib", "camadas"]);
    // The Setlist over Camadas: Camadas keeps its own height.
    assert.deepEqual(fromArrangement({ stacks: { side: ["roteiro", "camadas"] }, camadasH: 200 }).tree.children[3], split("col", [g("setlist"), g("camadas")], [null, 200]));
});

test("a saved dock is made safe: every module in exactly one place", () => {
    const d = normalizeDock({
        tree: { dir: "row", children: [{ tabs: ["lib", "lib", "nope"] }, { tabs: [] }, { dir: "col", children: [{ tabs: ["programa"] }], sizes: [null] }], sizes: [200, 100, null] },
        hidden: ["player", "programa", "camadas", "camadas"],
    });
    // Repeats and unknown ids go, the empty group goes, a split of one is its
    // child; the missing Prévia comes back at the right; the player rides the
    // Programa (never the tray); modules the save did not place go to the tray.
    assert.deepEqual(d.tree, split("row", [g("lib"), g("programa"), g("previa")], [200, null, NEW_PX]));
    assert.deepEqual(d.hidden, ["camadas", "slides", "abas", "setlist"]);
    assert.deepEqual(normalizeDock(null), { tree: split("row", [g("programa"), g("previa")], [null, NEW_PX]), hidden: ["lib", "slides", "abas", "setlist", "camadas"] });
    assert.deepEqual(normalizeDock({ tree: "junk", hidden: "junk" }), normalizeDock(null));
});

test("one flexible child per split, the Programa's when there is a choice", () => {
    const none = normalizeDock({ tree: split("row", [g("lib"), g("programa"), g("previa")], [100, 200, 300]) });
    assert.deepEqual(none.tree.sizes, [100, null, 300]);
    const two = normalizeDock({ tree: split("row", [g("lib"), g("previa"), g("programa")], [null, null, 300]) });
    assert.deepEqual(two.tree.sizes, [null, NEW_PX, 300], "the first of the flexible ones");
    const withProg = normalizeDock({ tree: split("row", [g("lib"), g("programa"), g("previa")], [null, null, 300]) });
    assert.deepEqual(withProg.tree.sizes, [NEW_PX, null, 300], "the Programa's when it is one of them");
    const noProg = normalizeDock({ tree: split("row", [split("col", [g("programa"), g("previa")], [null, 200]), split("col", [g("lib"), g("slides")], [500, 400])], [null, 300]) });
    assert.deepEqual(noProg.tree.children[1].sizes, [null, 400], "the largest becomes flexible");
});

test("a split inside a split of the same direction merges into it", () => {
    const flexSlot = normalizeDock({ tree: split("row", [g("lib"), split("row", [g("slides"), g("programa")], [300, null]), g("previa")], [200, null, 320]) });
    assert.deepEqual(flexSlot.tree, split("row", [g("lib"), g("slides"), g("programa"), g("previa")], [200, 300, null, 320]));
    // A fixed slot: its flexible child keeps what was left of the slot.
    const fixedSlot = normalizeDock({ tree: split("row", [g("programa"), split("row", [g("slides"), g("lib")], [100, null]), g("previa")], [null, 400, 320]) });
    assert.deepEqual(fixedSlot.tree.sizes, [null, 100, 294, 320]);
});

test("dropping in the middle of a group makes tabs", () => {
    const d = moveModules(defaultDock(), ["camadas"], { kind: "group", path: [2, 0], zone: "center" });
    assert.deepEqual(nodeAt(d.tree, [2]), split("col", [group(["programa", "camadas"], "camadas"), split("row", [g("previa"), g("abas")], [444, null])], [null, 334]));
    assert.deepEqual(nodeAt(d.tree, [3]), g("setlist"), "the right column is the Setlist alone");
});

test("dropping on a side along the split inserts beside, halving a fixed neighbour", () => {
    const d = moveModules(defaultDock(), ["setlist"], { kind: "group", path: [0], zone: "left" });
    assert.deepEqual(leaves(d.tree), ["setlist", "lib", "slides", "programa", "previa", "abas", "camadas"]);
    assert.deepEqual(d.tree.sizes, [127, 127, 300, null, 320]);
    assert.deepEqual(nodeAt(d.tree, [4]), g("camadas"));
    // Beside the flexible one: the new group gets the size it was given.
    const e = moveModules(defaultDock(), ["lib"], { kind: "group", path: [2, 1, 1], zone: "right" }, { px: 280 });
    assert.deepEqual(nodeAt(e.tree, [1, 1]), split("row", [g("previa"), g("abas"), g("lib")], [444, null, 280]));
    // Over the Programa: the centre column takes it.
    const f = moveModules(defaultDock(), ["slides"], { kind: "group", path: [2, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(f.tree, [1]).sizes, [180, null, 334]);
});

test("dropping on a side across the split wraps the group in a new split", () => {
    const d = moveModules(defaultDock(), ["slides"], { kind: "group", path: [2, 1, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(d.tree, [1, 1, 0]), split("col", [g("slides"), g("previa")], [180, null]));
    assert.deepEqual(nodeAt(d.tree, [1, 1]).sizes, [444, null], "the wrap keeps the Prévia's slot");
    assert.deepEqual(d.tree.sizes, [260, null, 320], "the column it left is gone");
    // The whole console: a new root.
    const one = normalizeDock({ tree: g("programa", "previa") });
    const r = moveModules(one, ["previa"], { kind: "group", path: [], zone: "bottom" }, { px: 250 });
    assert.deepEqual(r.tree, split("col", [g("programa"), g("previa")], [null, 250]));
});

test("a drop onto where it already is changes nothing", () => {
    const d = defaultDock();
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [2, 0], zone: "center" }), d);
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [2, 0], zone: "left" }), d, "a lone tab beside itself");
    // One tab of several can leave its group for its own side.
    const tabs = normalizeDock({ tree: split("row", [g("programa", "camadas"), g("previa")], [null, 300]) });
    const out = moveModules(tabs, ["camadas"], { kind: "group", path: [0], zone: "right" }, { px: 280 });
    assert.deepEqual(out.tree, split("row", [g("programa"), g("camadas"), g("previa")], [null, 280, 300]));
});

test("the tray: modules leave the console; the Programa and the Prévia never do", () => {
    const d = hideModule(defaultDock(), "camadas");
    assert.deepEqual(d.hidden, ["camadas"]);
    assert.deepEqual(nodeAt(d.tree, [3]), g("setlist"));
    assert.deepEqual(hideModule(defaultDock(), "programa"), defaultDock());
    assert.deepEqual(moveModules(defaultDock(), ["previa", "setlist"], { kind: "tray" }), defaultDock());
    // Back from the tray onto the console.
    const back = moveModules(d, ["camadas"], { kind: "group", path: [0], zone: "center" });
    assert.deepEqual(back.hidden, []);
    assert.deepEqual(back.tree.children[0], group(["lib", "camadas"], "camadas"));
});

test("the player rides the Programa until it is placed, and goes home instead of the tray", () => {
    const placed = moveModules(defaultDock(), ["player"], { kind: "group", path: [3, 1], zone: "top" }, { px: 60 });
    assert.deepEqual(nodeAt(placed.tree, [3]), split("col", [g("camadas"), g("player"), g("setlist")], [360, 60, null]));
    assert.deepEqual(pathOf(placed.tree, "player"), [3, 1]);
    const hidden = hideModule(placed, "player");
    assert.equal(pathOf(hidden.tree, "player"), null);
    assert.deepEqual(hidden.hidden, [], "never in the tray");
    assert.deepEqual(hidden.tree, defaultDock().tree);
    assert.deepEqual(moveModules(placed, ["player"], { kind: "home" }).tree, defaultDock().tree);
    assert.deepEqual(moveModules(defaultDock(), ["lib"], { kind: "home" }), defaultDock(), "only the player has a home");
});

test("switching tabs and resizing", () => {
    const tabs = moveModules(defaultDock(), ["camadas"], { kind: "group", path: [2, 0], zone: "center" });
    assert.equal(setActive(tabs, [2, 0], "programa").tree.children[2].children[0].active, "programa");
    assert.deepEqual(setActive(tabs, [2, 0], "lib"), tabs, "not a tab of that group");
    assert.equal(resizeChild(defaultDock(), [], 0, 400).tree.sizes[0], 400);
    assert.equal(resizeChild(defaultDock(), [], 0, 50).tree.sizes[0], 200, "never under the module's minimum");
    assert.deepEqual(resizeChild(defaultDock(), [], 2, 900), defaultDock(), "the flexible one takes the rest");
});

test("sizes: fixed children keep theirs, then give way toward their minimums", () => {
    assert.deepEqual(allocate([260, 300, null, 320], [200, 300, 320, 280], 1890), [260, 300, 1010, 320]);
    assert.deepEqual(allocate([260, 300, null], [200, 200, 320], 800), [230, 250, 320]);
    // The Programa's minimum height includes the player riding under it.
    assert.equal(minSize(g("programa"), false), 200 + PLAYER_SLOT);
    assert.equal(minSize(g("programa"), false, { playerDocked: false }), 200);
});

test("fitting: what does not fit side by side becomes tabs, the dock itself unchanged", () => {
    const d = defaultDock();
    const wide = fitDock(d, 1908, 1000);
    assert.deepEqual(wide.children.map((c) => c.size), [260, 300, 1010, 320]);
    assert.equal(JSON.stringify(wide).includes('"collapsed"'), false);
    // 1200 px: the side columns give way to their minimums; the centre is
    // too narrow for the Prévia and the Painel de abas side by side.
    const mid = fitDock(d, 1200, 700);
    assert.deepEqual(mid.children.map((c) => Math.round(c.size)), [249, 300, 320, 313]);
    const bottom = mid.children[2].frame.children[1];
    assert.equal(Math.round(bottom.size), 334);
    assert.deepEqual({ ...bottom.frame, w: Math.round(bottom.frame.w) }, { kind: "group", path: [2, 1], tabs: ["previa", "abas"], active: "previa", w: 320, h: 334, collapsed: true, target: [2, 1, 0] });
    // 700 px: everything is one group of tabs.
    const narrow = fitDock(d, 700, 500);
    assert.equal(narrow.collapsed, true);
    assert.deepEqual(narrow.tabs, ["lib", "slides", "programa", "previa", "abas", "camadas", "setlist"]);
    assert.deepEqual(narrow.target, [0]);
});
