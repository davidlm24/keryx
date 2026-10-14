import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDock, fromArrangement, fromBibleArrangement, defaultDock, moveModules, hideModule, returnModule, trayFlags, applyTrayFlags, defaultSize, setActive, resizeChild, fitDock, goneModules, lyricsOnAir, onAirHeight, allocate, minSize, leaves, nodeAt, pathOf, group, split, NEW_PX, ONAIR_H, TEMAS_H, PLAYER_SLOT } from "./dock.js";

const g = (...tabs) => group(tabs);
// The console of the 2026-10-13 audit: Biblioteca | Slides | Programa over
// Prévia · Painel de abas | Camadas, Temas and the Setlist, and under all of them,
// edge to edge, the No ar strip (2026-10-14).
const fourColumns = () => split("col", [split("row", [
    g("lib"), g("slides"),
    split("col", [g("programa"), split("row", [g("previa"), g("abas")], [444, null])], [null, 334]),
    split("col", [g("camadas"), g("temas"), g("setlist")], [280, TEMAS_H, null]),
], [260, 300, null, 320]), g("onair")], [null, ONAIR_H]);

test("the default dock is the four-column console, nothing in the tray", () => {
    // centre = 1908 − 326 − 266 − 306 = 1010; the Prévia 44 % = 444; 444 · 9/16 + 84 = 334
    assert.deepEqual(defaultDock(), { tree: fourColumns(), hidden: [] });
});

test("an old layout migrates: its column order, stack order, hidden modules and sizes", () => {
    const d = fromArrangement({ order: { culto: ["live", "side", "lib", "slides"] }, stacks: { side: ["roteiro", "camadas"] }, hidden: { lib: true, camadas: true }, slidesW: 340, prevPct: 25 }, { width: 1500 });
    // centre = 1500 − 326 − 346 = 828; 25 % = 207, at least the Prévia's 220; 220 · 9/16 + 84 = 208
    assert.deepEqual(d.tree, split("col", [split("row", [
        split("col", [g("programa"), split("row", [g("previa"), g("abas")], [220, null])], [null, 208]),
        g("setlist"),
        g("slides"),
    ], [null, 320, 340]), g("onair")], [null, ONAIR_H]));
    assert.deepEqual(d.hidden, ["lib", "camadas", "temas"], "Temas goes where Camadas goes");
    // The Setlist over Camadas: Camadas keeps its own height, Temas under it.
    assert.deepEqual(fromArrangement({ stacks: { side: ["roteiro", "camadas"] }, camadasH: 200 }).tree.children[0].children[3], split("col", [g("setlist"), g("camadas"), g("temas")], [null, 200, TEMAS_H]));
});

test("a saved dock is made safe: every module in exactly one place", () => {
    const d = normalizeDock({
        tree: { dir: "row", children: [{ tabs: ["lib", "lib", "nope"] }, { tabs: [] }, { dir: "col", children: [{ tabs: ["programa"] }], sizes: [null] }], sizes: [200, 100, null] },
        hidden: ["player", "programa", "camadas", "camadas"],
    });
    // Repeats and unknown ids go, the empty group goes, a split of one is its
    // child; the missing Prévia and Setlist come back at the right; the
    // player rides the Programa (never the tray); modules the save did not
    // place go to the tray.
    assert.deepEqual(d.tree, split("row", [g("lib"), g("programa"), g("previa"), g("setlist")], [200, null, NEW_PX, NEW_PX]));
    assert.deepEqual(d.hidden, ["camadas", "slides", "abas", "temas", "onair"]);
    assert.deepEqual(normalizeDock(null), { tree: split("row", [g("programa"), g("previa"), g("setlist")], [null, NEW_PX, NEW_PX]), hidden: ["lib", "slides", "abas", "camadas", "temas", "onair"] });
    assert.deepEqual(normalizeDock({ tree: "junk", hidden: "junk" }), normalizeDock(null));
});

test("a save from before Temas gets it under Camadas, not in the tray", () => {
    // Camadas over the Setlist: Temas comes in between, its height from the Setlist.
    const old = normalizeDock({ tree: split("row", [g("programa"), g("previa"), split("col", [g("camadas"), g("setlist")], [360, null])], [null, 300, 320]), hidden: [] });
    assert.deepEqual(nodeAt(old.tree, [2]), split("col", [g("camadas"), g("temas"), g("setlist")], [360, TEMAS_H, null]));
    assert.equal(old.hidden.includes("temas"), false);
    // Camadas alone in a row: the two become a column in its place.
    const row = normalizeDock({ tree: split("row", [g("programa"), g("camadas"), g("previa"), g("setlist")], [null, 280, 300, 320]) });
    assert.deepEqual(nodeAt(row.tree, [1]), split("col", [g("camadas"), g("temas")], [null, TEMAS_H]));
    // Camadas among tabs: one more tab.
    const tabs = normalizeDock({ tree: split("row", [g("programa", "camadas"), g("previa"), g("setlist")], [null, 300, 400]) });
    assert.deepEqual(nodeAt(tabs.tree, [0]), group(["programa", "camadas", "temas"], "programa"));
    // Camadas in the tray, or Temas already known: nothing moves.
    assert.deepEqual(normalizeDock({ tree: split("row", [g("programa"), g("previa"), g("setlist")], [null, 300, 320]), hidden: ["camadas"] }).hidden, ["camadas", "lib", "slides", "abas", "temas", "onair"]);
    assert.deepEqual(normalizeDock(defaultDock()), defaultDock());
});

test("one flexible child per split, the Programa's when there is a choice", () => {
    const row = (...kids) => normalizeDock({ tree: split("row", [...kids.map((k) => k[0]), g("setlist")], [...kids.map((k) => k[1]), 400]) }).tree.sizes;
    assert.deepEqual(row([g("lib"), 100], [g("programa"), 200], [g("previa"), 300]), [100, null, 300, 400]);
    assert.deepEqual(row([g("lib"), null], [g("previa"), null], [g("programa"), 300]), [null, NEW_PX, 300, 400], "the first of the flexible ones");
    assert.deepEqual(row([g("lib"), null], [g("programa"), null], [g("previa"), 300]), [NEW_PX, null, 300, 400], "the Programa's when it is one of them");
    const noProg = normalizeDock({ tree: split("row", [split("col", [g("programa"), g("previa")], [null, 200]), split("col", [g("lib"), g("slides")], [500, 400]), g("setlist")], [null, 300, 400]) });
    assert.deepEqual(noProg.tree.children[1].sizes, [null, 400], "the largest becomes flexible");
});

test("a split inside a split of the same direction merges into it", () => {
    const flexSlot = normalizeDock({ tree: split("row", [g("lib"), split("row", [g("slides"), g("programa")], [300, null]), g("previa"), g("setlist")], [200, null, 320, 400]) });
    assert.deepEqual(flexSlot.tree, split("row", [g("lib"), g("slides"), g("programa"), g("previa"), g("setlist")], [200, 300, null, 320, 400]));
    // A fixed slot: its flexible child keeps what was left of the slot.
    const fixedSlot = normalizeDock({ tree: split("row", [g("programa"), split("row", [g("slides"), g("lib")], [100, null]), g("previa"), g("setlist")], [null, 400, 320, 400]) });
    assert.deepEqual(fixedSlot.tree.sizes, [null, 100, 294, 320, 400]);
});

test("dropping in the middle of a group makes tabs", () => {
    const d = moveModules(defaultDock(), ["camadas"], { kind: "group", path: [0, 2, 0], zone: "center" });
    assert.deepEqual(nodeAt(d.tree, [0, 2]), split("col", [group(["programa", "camadas"], "camadas"), split("row", [g("previa"), g("abas")], [444, null])], [null, 334]));
    assert.deepEqual(nodeAt(d.tree, [0, 3]), split("col", [g("temas"), g("setlist")], [TEMAS_H, null]), "Temas stays over the Setlist");
});

test("dropping on a side along the split inserts beside, halving a fixed neighbour", () => {
    // Half of the Biblioteca's 260, each kept at its minimum (Setlist 220, Biblioteca 200).
    const d = moveModules(defaultDock(), ["setlist"], { kind: "group", path: [0, 0], zone: "left" });
    assert.deepEqual(leaves(d.tree), ["setlist", "lib", "slides", "programa", "previa", "abas", "camadas", "temas", "onair"]);
    assert.deepEqual(d.tree.children[0].sizes, [220, 200, 300, null, 320]);
    assert.deepEqual(nodeAt(d.tree, [0, 4]), split("col", [g("camadas"), g("temas")], [null, TEMAS_H]));
    const wide = moveModules(fromArrangement({ libW: 480 }), ["abas"], { kind: "group", path: [0, 0], zone: "right" });
    assert.deepEqual(wide.tree.children[0].sizes.slice(0, 2), [237, 237]);
    // Beside the flexible one: the new group gets the size it was given.
    const e = moveModules(defaultDock(), ["lib"], { kind: "group", path: [0, 2, 1, 1], zone: "right" }, { px: 280 });
    assert.deepEqual(nodeAt(e.tree, [0, 1, 1]), split("row", [g("previa"), g("abas"), g("lib")], [444, null, 280]));
    // Over the Programa: the centre column takes it.
    const f = moveModules(defaultDock(), ["slides"], { kind: "group", path: [0, 2, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(f.tree, [0, 1]).sizes, [180, null, 334]);
});

test("dropping on a side across the split wraps the group in a new split", () => {
    const d = moveModules(defaultDock(), ["slides"], { kind: "group", path: [0, 2, 1, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(d.tree, [0, 1, 1, 0]), split("col", [g("slides"), g("previa")], [180, null]));
    assert.deepEqual(nodeAt(d.tree, [0, 1, 1]).sizes, [444, null], "the wrap keeps the Prévia's slot");
    assert.deepEqual(d.tree.children[0].sizes, [260, null, 320], "the column it left is gone");
    // The whole console: a new root.
    const one = { tree: group(["programa", "previa", "setlist"]), hidden: [] };
    const r = moveModules(one, ["setlist"], { kind: "group", path: [], zone: "bottom" }, { px: 250 });
    assert.deepEqual(r.tree, split("col", [g("programa", "previa"), g("setlist")], [null, 250]));
});

test("a drop onto where it already is changes nothing", () => {
    const d = defaultDock();
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [0, 2, 0], zone: "center" }), d);
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [0, 2, 0], zone: "left" }), d, "a lone tab beside itself");
    // One tab of several can leave its group for its own side.
    const tabs = normalizeDock({ tree: split("row", [g("programa", "camadas"), g("previa"), g("setlist")], [null, 300, 400]), hidden: ["temas"] });
    const out = moveModules(tabs, ["camadas"], { kind: "group", path: [0], zone: "right" }, { px: 280 });
    assert.deepEqual(out.tree, split("row", [g("programa"), g("camadas"), g("previa"), g("setlist")], [null, 280, 300, 400]));
});

test("the tray: modules leave the console; the Programa, the Prévia and the Setlist never do", () => {
    const d = hideModule(defaultDock(), "camadas");
    assert.deepEqual(d.hidden, ["camadas"]);
    assert.deepEqual(nodeAt(d.tree, [0, 3]), split("col", [g("temas"), g("setlist")], [TEMAS_H, null]));
    assert.deepEqual(hideModule(defaultDock(), "programa"), defaultDock());
    assert.deepEqual(hideModule(defaultDock(), "setlist"), defaultDock());
    assert.deepEqual(moveModules(defaultDock(), ["previa", "abas"], { kind: "tray" }), defaultDock());
    // Back from the tray onto the console.
    const back = moveModules(d, ["camadas"], { kind: "group", path: [0, 0], zone: "center" });
    assert.deepEqual(back.hidden, []);
    assert.deepEqual(back.tree.children[0].children[0], group(["lib", "camadas"], "camadas"));
});

test("the player rides the Programa until it is placed, and goes home instead of the tray", () => {
    // In a column the player comes in at its own height (80), whatever was asked.
    const placed = moveModules(defaultDock(), ["player"], { kind: "group", path: [0, 3, 2], zone: "top" }, { px: 300 });
    assert.deepEqual(nodeAt(placed.tree, [0, 3]), split("col", [g("camadas"), g("temas"), g("player"), g("setlist")], [280, TEMAS_H, 80, null]));
    const underCamadas = moveModules(defaultDock(), ["player"], { kind: "group", path: [0, 3, 1], zone: "bottom" });
    assert.deepEqual(nodeAt(underCamadas.tree, [0, 3]).sizes, [280, 134, 80, null], "a fixed neighbour gives up just that");
    assert.equal(minSize(g("player"), false, { playerDocked: false }), 76, "its panel header counts");
    assert.deepEqual(pathOf(placed.tree, "player"), [0, 3, 2]);
    const hidden = hideModule(placed, "player");
    assert.equal(pathOf(hidden.tree, "player"), null);
    assert.deepEqual(hidden.hidden, [], "never in the tray");
    assert.deepEqual(hidden.tree, defaultDock().tree);
    assert.deepEqual(moveModules(placed, ["player"], { kind: "home" }).tree, defaultDock().tree);
    assert.deepEqual(moveModules(defaultDock(), ["lib"], { kind: "home" }), defaultDock(), "only the player has a home");
});

test("back from the tray: to the default place, beside what is on screen", () => {
    const d = defaultDock();
    assert.deepEqual(returnModule(hideModule(d, "lib"), "lib"), d);
    assert.deepEqual(returnModule(hideModule(d, "camadas"), "camadas"), d, "over the Setlist, with its height");
    assert.deepEqual(leaves(returnModule(hideModule(d, "abas"), "abas").tree), leaves(d.tree));
    // The Slides gone too: the Biblioteca goes before the centre.
    const both = hideModule(hideModule(d, "lib"), "slides");
    assert.equal(leaves(returnModule(both, "lib").tree)[0], "lib");
    assert.deepEqual(returnModule(d, "lib"), d, "not in the tray: nothing moves");
    // The No ar strip comes back across the whole console, at its height.
    assert.deepEqual(returnModule(hideModule(d, "onair"), "onair"), d);
    const moved = hideModule(moveModules(d, ["setlist"], { kind: "group", path: [0, 0], zone: "left" }), "onair");
    assert.deepEqual(returnModule(moved, "onair").tree, split("col", [moved.tree, g("onair")], [null, ONAIR_H]));
});

test("switching tabs and resizing", () => {
    const tabs = moveModules(defaultDock(), ["camadas"], { kind: "group", path: [0, 2, 0], zone: "center" });
    assert.equal(setActive(tabs, [0, 2, 0], "programa").tree.children[0].children[2].children[0].active, "programa");
    assert.deepEqual(setActive(tabs, [0, 2, 0], "lib"), tabs, "not a tab of that group");
    assert.equal(resizeChild(defaultDock(), [0], 0, 400).tree.children[0].sizes[0], 400);
    assert.equal(resizeChild(defaultDock(), [0], 0, 50).tree.children[0].sizes[0], 200, "never under the module's minimum");
    assert.equal(resizeChild(defaultDock(), [0], 1, -350).tree.children[0].sizes[1], 300, "a drag past the edge stops at the minimum");
    assert.deepEqual(resizeChild(defaultDock(), [0], 2, 900), defaultDock(), "the flexible one takes the rest");
    assert.equal(resizeChild(defaultDock(), [], 1, 20).tree.sizes[1], 96, "the No ar strip: never under one row of cards");
});

test("a splitter's restore: the size the default console gives the same modules", () => {
    const d = defaultDock();
    assert.equal(defaultSize(d, [0], 0), 260);
    assert.equal(defaultSize(d, [0, 3], 0), 280);
    assert.equal(defaultSize(d, [0, 3], 1), TEMAS_H);
    assert.equal(defaultSize(d, [], 1), ONAIR_H);
    const moved = moveModules(d, ["camadas"], { kind: "group", path: [0, 0], zone: "center" });
    assert.equal(defaultSize(moved, [0], 0), null, "Biblioteca with Camadas: nothing to restore to");
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
    const whole = fitDock(d, 1908, 1000);
    assert.deepEqual(whole.children.map((c) => [c.size, c.fold, c.gone]), [[890, undefined, undefined], [ONAIR_H, true, false]], "the No ar strip under every column");
    const wide = whole.children[0].frame;
    assert.deepEqual(wide.children.map((c) => c.size), [260, 300, 1010, 320]);
    assert.equal(JSON.stringify(wide).includes('"collapsed"'), false);
    // 1200 px: the side columns give way to their minimums; the centre is
    // too narrow for the Prévia and the Painel de abas side by side.
    const mid = fitDock(d, 1200, 700).children[0].frame;
    assert.deepEqual(mid.children.map((c) => Math.round(c.size)), [249, 300, 320, 313]);
    const bottom = mid.children[2].frame.children[1];
    assert.equal(Math.round(bottom.size), 334);
    assert.deepEqual({ ...bottom.frame, w: Math.round(bottom.frame.w), h: Math.round(bottom.frame.h) }, { kind: "group", path: [0, 2, 1], tabs: ["previa", "abas"], active: "previa", w: 320, h: 334, collapsed: true, target: [0, 2, 1, 0] });
    // 1000 px: the Biblioteca and the Slides join as tabs (the pair that
    // gives back the most room without touching the Programa); the rest stays.
    const small = fitDock(d, 1000, 700).children[0].frame;
    assert.deepEqual(small.children.map((c) => [c.index, Math.round(c.size), c.frame.tabs || c.frame.dir]), [[0, 300, ["lib", "slides"]], [2, 368, "col"], [3, 320, "col"]]);
    assert.deepEqual(small.children[0].frame.target, [0, 0]);
    assert.deepEqual(small.children.map((c) => c.at), [[0, 1], [2], [3]], "a splitter of the tabs resizes both");
    // 700 px: the Programa's column joins them too; Camadas and the Setlist stay apart.
    const narrow = fitDock(d, 700, 500).children[0].frame;
    assert.deepEqual(narrow.children.map((c) => c.frame.tabs || c.frame.dir), [["lib", "slides", "programa", "previa", "abas"], "col"]);
    // Nothing fits beside anything: one group of tabs over the strip.
    const tiny = fitDock(d, 400, 500).children[0].frame;
    assert.equal(tiny.collapsed, true);
    assert.deepEqual(tiny.tabs, ["lib", "slides", "programa", "previa", "abas", "camadas", "temas", "setlist"]);
    assert.deepEqual(tiny.target, [0, 0]);
});

test("the No ar strip exists only while lyrics are on air", () => {
    const song = { content: { kind: "lyrics", slides: [{ text: "a" }, { text: "b" }], index: 0 }, screen: "show" };
    assert.equal(lyricsOnAir(song), true);
    assert.equal(lyricsOnAir({ content: { kind: "bible", slides: [{ text: "Jo 3:16" }] } }), true, "a passage, free text: text slides too");
    assert.equal(lyricsOnAir(null), false);
    assert.equal(lyricsOnAir({ content: null }), false, "nothing on air, or Esc");
    assert.equal(lyricsOnAir({ content: { slides: [] } }), false);
    assert.equal(lyricsOnAir({ ...song, screen: "black" }), false, "Tela preta");
    assert.equal(lyricsOnAir({ ...song, screen: "logo" }), false);
    assert.equal(lyricsOnAir({ ...song, media: { url: "x.mp4" } }), false, "a video or a picture over it");
    assert.equal(lyricsOnAir({ ...song, tool: { mode: "timer" } }), false);
    assert.equal(lyricsOnAir({ ...song, communication: { item: {} } }), false, "an aviso");
    assert.deepEqual(goneModules(song), []);
    assert.deepEqual(goneModules({}), ["onair"]);

    // Gone, it takes no room: the columns get the whole height, no gutter;
    // its place (and the dock) stay, so it comes back where it was.
    const d = defaultDock();
    const f = fitDock(d, 1908, 1000, { gone: ["onair"] });
    assert.deepEqual(f.children.map((c) => [c.index, c.size, c.fixed, Boolean(c.gone)]), [[0, 1000, false, false], [1, 0, true, true]]);
    assert.deepEqual(f.children[1].frame.path, [1]);
    assert.equal(f.children[0].frame.children[2].frame.children[0].size, 660, "the Programa takes the strip's 110 px");
    assert.deepEqual(fitDock(d, 1908, 1000, { gone: ["programa"] }), fitDock(d, 1908, 1000), "only a folding module folds");
    // Wherever it is placed alone: under the Prévia, the Prévia takes its room.
    const under = moveModules(d, ["onair"], { kind: "group", path: [0, 2, 1, 0], zone: "bottom" });
    const col = fitDock(under, 1908, 1000, { gone: ["onair"] }).children[2].frame.children[1].frame.children[0].frame;
    assert.deepEqual(col.children.map((c) => [c.frame.tabs[0], c.size, Boolean(c.gone)]), [["previa", 334, false], ["onair", 0, true]]);
    // A tab beside another module: it stays.
    const tab = moveModules(d, ["onair"], { kind: "group", path: [0, 3, 0], zone: "center" });
    assert.equal(JSON.stringify(fitDock(tab, 1908, 1000, { gone: ["onair"] })).includes('"gone":true'), false);
    // The flexible child gone: the largest one left takes the rest.
    const flex = normalizeDock({ tree: split("col", [g("onair"), split("row", [g("programa"), g("previa"), g("setlist")], [null, 300, 300])], [null, 400]) });
    assert.deepEqual(fitDock(flex, 1600, 900, { gone: ["onair"] }).children.map((c) => c.size), [0, 900]);
});

test("locked heights: the console's, exact, with no splitter, only down a column", () => {
    const d = defaultDock();
    // The No ar strip at the height its lines ask, whatever the dock saved.
    const f = fitDock(d, 1908, 1000, { locked: { onair: 150 } });
    assert.deepEqual(f.children.map((c) => [c.size, Boolean(c.locked)]), [[844, false], [150, true]]);
    assert.deepEqual(f.children[1].frame.tabs, ["onair"]);
    // Gone wins: nothing on air, no room.
    assert.deepEqual(fitDock(d, 1908, 1000, { gone: ["onair"], locked: { onair: 150 } }).children.map((c) => c.size), [1000, 0]);
    // Camadas over the Setlist: Camadas exactly its list, the Setlist the rest.
    const side = fitDock(d, 1908, 1000, { locked: { camadas: 152 } }).children[0].frame.children[3].frame;
    assert.deepEqual(side.children.map((c) => [c.frame.tabs[0], Boolean(c.locked)]), [["camadas", true], ["temas", false], ["setlist", false]]);
    assert.equal(side.children[0].size, 152);
    // Across a row, or as a tab beside another module, the lock does not apply.
    const row = normalizeDock({ tree: split("row", [g("onair"), g("programa")], [300, null]) });
    assert.equal(JSON.stringify(fitDock(row, 1600, 900, { locked: { onair: 150 } })).includes('"locked":true'), false);
    const tab = moveModules(d, ["onair"], { kind: "group", path: [0, 3, 0], zone: "center" });
    assert.equal(JSON.stringify(fitDock(tab, 1908, 1000, { locked: { onair: 150 } })).includes('"locked":true'), false);
    // A locked child that was the flexible one: the largest free one takes the rest.
    const flex = normalizeDock({ tree: split("col", [g("onair"), split("row", [g("programa"), g("previa"), g("setlist")], [null, 300, 300])], [null, 400]) });
    assert.deepEqual(fitDock(flex, 1600, 900, { locked: { onair: 150 } }).children.map((c) => c.size), [150, 744]);
});

test("the No ar strip is as tall as the slide with the most lines", () => {
    assert.equal(onAirHeight([]), ONAIR_H, "never under the default strip");
    assert.equal(onAirHeight([{ text: "a\nb" }]), Math.max(ONAIR_H, 72 + 2 * 18));
    assert.equal(onAirHeight([{ text: "a\nb" }, { text: "a\nb\nc\nd" }]), 72 + 4 * 18, "4 lines a slide (the song's editor)");
    assert.ok(onAirHeight([{ text: "1\n2\n3\n4\n5\n6" }]) > onAirHeight([{ text: "1\n2\n3\n4" }]), "a whole stanza");
});

// The Bíblia's dock: the same engine, its own modules.
const bible = () => split("row", [
    split("col", [g("bhead"), g("books"), g("chapters"), g("verses")], [132, 320, 200, null]),
    g("reading"),
    g("air"),
], [300, null, 400]);

test("the Bíblia: its default dock is the three columns it had", () => {
    assert.deepEqual(defaultDock({ env: "biblia" }), { env: "biblia", tree: bible(), hidden: [] });
    // An old arrangement: the text first, the pickers in another order, a wider picker column.
    const d = fromBibleArrangement({ order: { biblia: ["reading", "picker", "air"] }, stacks: { picker: ["verses", "books", "chapters"] }, bibleSelW: 340 });
    assert.deepEqual(d.tree, split("row", [
        g("reading"),
        split("col", [g("bhead"), g("verses"), g("books"), g("chapters")], [132, 200, 320, null]),
        g("air"),
    ], [null, 340, 400]));
});

test("the Bíblia: only its modules, its required ones back, the environment kept", () => {
    const d = normalizeDock({ env: "biblia", tree: split("row", [g("reading", "lib"), g("programa")], [null, 300]), hidden: ["slides", "books"] });
    assert.equal(d.env, "biblia");
    assert.deepEqual(leaves(d.tree), ["reading", "bhead", "air"], "culto modules are not the Bíblia's; Versão e busca and No ar come back");
    assert.deepEqual(d.hidden, ["books", "chapters", "verses"]);
    // The culto never takes the Bíblia's modules.
    assert.equal(leaves(normalizeDock({ tree: g("programa", "reading") }).tree).includes("reading"), false);
    const off = hideModule(defaultDock({ env: "biblia" }), "books");
    assert.equal(off.env, "biblia");
    assert.deepEqual(off.hidden, ["books"]);
    assert.deepEqual(hideModule(defaultDock({ env: "biblia" }), "air"), defaultDock({ env: "biblia" }), "No ar never leaves");
    assert.deepEqual(returnModule(off, "books"), defaultDock({ env: "biblia" }));
    const tabs = moveModules(defaultDock({ env: "biblia" }), ["chapters"], { kind: "group", path: [0, 1], zone: "center" });
    assert.equal(tabs.env, "biblia");
    assert.deepEqual(nodeAt(tabs.tree, [0, 1]), group(["books", "chapters"], "chapters"));
    assert.equal(defaultSize(defaultDock({ env: "biblia" }), [], 2), 400);
});

test("the Bíblia fits the smallest window side by side", () => {
    const f = fitDock(defaultDock({ env: "biblia" }), 960, 600);
    assert.equal(JSON.stringify(f).includes('"collapsed"'), false);
    // 948 px: the side columns give way in proportion to their room (60 and 100 px).
    assert.deepEqual(f.children.map((c) => Math.round(c.size)), [258, 360, 330]);
});

test("a console never edited opens as it looked at its width: medium and narrow", () => {
    // A 1366 screen (grid 1354): no right column; Camadas is a drawer, the
    // Setlist beside the Prévia. centre = 1354 − 266 − 306 = 782; 44 % = 344.
    const medium = fromArrangement({}, { width: 1354, height: 768, tier: "medium" });
    assert.deepEqual(medium.tree, split("row", [
        g("lib"), g("slides"),
        split("col", [g("programa"), split("row", [g("previa"), g("setlist")], [344, null])], [null, 278]),
    ], [260, 300, null]));
    assert.deepEqual(medium.hidden, ["camadas", "temas", "abas", "onair"]);
    // The Programa keeps its room, the Prévia and the Setlist side by side.
    const fit = fitDock(medium, 1354, 768);
    assert.equal(Math.round(fit.children[2].size), 782);
    assert.equal(fit.children[2].frame.children[1].frame.kind, "split", "no tabs at 1366");
    // Narrow: the Biblioteca over the Slides in one column, as wide as the Slides.
    const narrow = fromArrangement({ stacks: { source: ["slides", "lib"] } }, { width: 1000, height: 700, tier: "narrow" });
    assert.deepEqual(narrow.tree, split("row", [
        split("col", [g("slides"), g("lib")], [347, null]),
        split("col", [g("programa"), split("row", [g("previa"), g("setlist")], [305, null])], [null, 256]),
    ], [300, null]));
    // Padrão follows the width too.
    assert.deepEqual(defaultDock({ width: 1354, height: 768, tier: "medium" }), medium);
});

test("back from the tray at medium width: Camadas over the Setlist, as in the wide console", () => {
    const medium = fromArrangement({}, { width: 1354, height: 768, tier: "medium" });
    const back = returnModule(medium, "camadas", { width: 1354, height: 768, tier: "medium" });
    assert.deepEqual(nodeAt(back.tree, [2, 1, 1]), split("col", [g("camadas"), g("setlist")], [280, null]));
    assert.deepEqual(back.hidden, ["temas", "abas", "onair"], "Temas stays in the tray: Camadas shows the themes then");
});

test("Ver's module switches over the tray: off goes to the tray, on comes back to its place", () => {
    const ids = ["lib", "slides", "camadas"];
    const d = defaultDock();
    assert.deepEqual(trayFlags(d, ids), { lib: false, slides: false, camadas: false });
    const off = applyTrayFlags(d, { camadas: true }, ids);
    assert.deepEqual(off.hidden, ["camadas"]);
    assert.deepEqual(trayFlags(off, ids), { lib: false, slides: false, camadas: true });
    assert.deepEqual(applyTrayFlags(off, {}, ids), d, "back over the Setlist");
    assert.equal(applyTrayFlags(d, { lib: false }, ids), d, "nothing changed: the same dock");
    // The Painel de abas is not one of Ver's switches: its tray stays.
    const abas = hideModule(d, "abas");
    assert.deepEqual(applyTrayFlags(abas, {}, ids).hidden, ["abas"]);
});
