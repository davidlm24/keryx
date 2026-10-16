import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, normalizeDock, fromArrangement, fromBibleArrangement, defaultDock, moveModules, hideModule, returnModule, trayFlags, applyTrayFlags, defaultSize, setActive, resizeChild, fitDock, goneModules, lyricsOnAir, onAirHeight, bandOf, moveBand, allocate, minSize, leaves, nodeAt, pathOf, group, split, NEW_PX, ONAIR_H, ONAIR_PAGE_LINES, TEMAS_H, PLAYER_SLOT, rebaseDock, setDockMode, snapPct, dockMode, PCT_STEP, FOLD_STRIP, canFoldModule, programaNatural, dockMotion, easesBetween } from "./dock.js";

const g = (...tabs) => group(tabs);
// The window band: the console's shape before the strip went under the
// columns beside the Setlist (2026-10-14). These tests index its paths; the
// columns band, the default, has its own test below.
const W = { onairSpan: "window" };
// The console of the 2026-10-13 audit: Biblioteca | Slides | Programa over
// Prévia · Painel de abas | Camadas, Temas and the Setlist, and under all of them,
// edge to edge, the No ar strip (2026-10-14).
const fourColumns = () => split("col", [split("row", [
    g("lib"), g("slides"),
    split("col", [g("programa"), split("row", [g("previa"), g("abas")], [444, null])], [null, 250]),
    split("col", [g("camadas"), g("temas"), g("setlist")], [280, TEMAS_H, null]),
], [260, 300, null, 320]), g("onair")], [null, ONAIR_H]);

test("the No ar strip under the columns beside the Setlist: the default band (owner 2026-10-14)", () => {
    const d = defaultDock();
    assert.equal(bandOf(d.tree, "onair"), "columns");
    // The root row: the strip's column (the Biblioteca, the Slides and the
    // centre over the strip) and the Setlist's column, 320 px, to the bottom.
    assert.equal(d.tree.dir, "row");
    assert.deepEqual(d.tree.sizes, [null, 320]);
    assert.deepEqual(leaves(d.tree.children[1]), ["camadas", "temas", "setlist"]);
    assert.deepEqual(d.tree.children[0].sizes, [null, ONAIR_H]);
    assert.deepEqual(leaves(d.tree.children[0].children[0]), ["lib", "slides", "programa", "previa", "abas"]);
    assert.deepEqual(d.tree.children[0].children[1], g("onair"));
    // Editar disposição › No ar: the strip moves between the bands and back.
    assert.deepEqual(moveBand(d, "window"), defaultDock(W));
    assert.deepEqual(moveBand(defaultDock(W), "columns"), d);
    assert.deepEqual(moveBand(d, "columns"), d, "already there");
    assert.equal(bandOf(defaultDock(W).tree, "onair"), "window");
    // A save with the strip elsewhere (a tab beside the Programa) gets the columns band.
    const old = normalizeDock({ tree: split("row", [g("lib"), g("programa", "onair"), split("col", [g("camadas"), g("setlist")], [300, null])], [260, null, 320]) });
    assert.equal(bandOf(old.tree, "onair"), "columns");
    assert.deepEqual(leaves(old.tree.children[0].children[0]), ["lib", "programa", "previa"], "the Prévia, required, came back beside them");
    assert.deepEqual(leaves(old.tree.children[1]), ["camadas", "temas", "setlist"], "Temas came in under Camadas (below)");
    // No row at the root to put the Setlist's column beside: the window band.
    const stacked = normalizeDock({ tree: split("col", [g("programa"), g("previa"), g("setlist"), g("onair")], [null, 300, 300, 104]) });
    assert.equal(bandOf(stacked.tree, "onair"), "window");
    assert.equal(bandOf(moveBand(stacked, "columns").tree, "onair"), "window", "falls back");
    // In the tray it stays there, whatever the band asked.
    const out = hideModule(d, "onair");
    assert.deepEqual(moveBand(out, "window"), out);
    assert.equal(bandOf(returnModule(out, "onair").tree, "onair"), "columns");
    assert.equal(bandOf(returnModule(out, "onair", W).tree, "onair"), "window");
    // The medium and narrow consoles keep the strip in the tray.
    assert.ok(fromArrangement({}, { width: 1354, height: 768, tier: "medium" }).hidden.includes("onair"));
});

test("the window band: the four-column console with the strip under every column", () => {
    // centre = 1908 − 326 − 266 − 306 = 1010; the Prévia 44 % = 444; 444 · 9/16 = 250 (the Prévia has no header nor button since 2026-10-14)
    assert.deepEqual(defaultDock(W), { tree: fourColumns(), hidden: [] });
});

test("an old layout migrates: its column order, stack order, hidden modules and sizes", () => {
    const d = fromArrangement({ order: { culto: ["live", "side", "lib", "slides"] }, stacks: { side: ["roteiro", "camadas"] }, hidden: { lib: true, camadas: true }, slidesW: 340, prevPct: 25 }, { width: 1500, ...W });
    // centre = 1500 − 326 − 346 = 828; 25 % = 207, at least the Prévia's 220; 220 · 9/16 = 124, the Prévia's 200 at least
    assert.deepEqual(d.tree, split("col", [split("row", [
        split("col", [g("programa"), split("row", [g("previa"), g("abas")], [220, null])], [null, 200]),
        g("setlist"),
        g("slides"),
    ], [null, 320, 340]), g("onair")], [null, ONAIR_H]));
    assert.deepEqual(d.hidden, ["lib", "camadas", "temas"], "Temas goes where Camadas goes");
    // The Setlist over Camadas: Camadas keeps its own height, Temas under it.
    assert.deepEqual(fromArrangement({ stacks: { side: ["roteiro", "camadas"] }, camadasH: 200 }, W).tree.children[0].children[3], split("col", [g("setlist"), g("camadas"), g("temas")], [null, 200, TEMAS_H]));
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
    assert.deepEqual(normalizeDock(defaultDock(W)), defaultDock(W));
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
    const d = moveModules(defaultDock(W), ["camadas"], { kind: "group", path: [0, 2, 0], zone: "center" });
    assert.deepEqual(nodeAt(d.tree, [0, 2]), split("col", [group(["programa", "camadas"], "camadas"), split("row", [g("previa"), g("abas")], [444, null])], [null, 250]));
    assert.deepEqual(nodeAt(d.tree, [0, 3]), split("col", [g("temas"), g("setlist")], [TEMAS_H, null]), "Temas stays over the Setlist");
});

test("dropping on a side along the split inserts beside, halving a fixed neighbour", () => {
    // Half of the Biblioteca's 260, each kept at its minimum (Setlist 220, Biblioteca 260).
    const d = moveModules(defaultDock(W), ["setlist"], { kind: "group", path: [0, 0], zone: "left" });
    assert.deepEqual(leaves(d.tree), ["setlist", "lib", "slides", "programa", "previa", "abas", "camadas", "temas", "onair"]);
    assert.deepEqual(d.tree.children[0].sizes, [220, 260, 300, null, 320]);
    assert.deepEqual(nodeAt(d.tree, [0, 4]), split("col", [g("camadas"), g("temas")], [null, TEMAS_H]));
    const wide = moveModules(fromArrangement({ libW: 560 }, W), ["abas"], { kind: "group", path: [0, 0], zone: "right" });
    assert.deepEqual(wide.tree.children[0].sizes.slice(0, 2), [277, 277]);
    // Beside the flexible one: the new group gets the size it was given.
    const e = moveModules(defaultDock(W), ["lib"], { kind: "group", path: [0, 2, 1, 1], zone: "right" }, { px: 280 });
    assert.deepEqual(nodeAt(e.tree, [0, 1, 1]), split("row", [g("previa"), g("abas"), g("lib")], [444, null, 280]));
    // Over the Programa: the centre column takes it.
    const f = moveModules(defaultDock(W), ["slides"], { kind: "group", path: [0, 2, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(f.tree, [0, 1]).sizes, [180, null, 250]);
});

test("dropping on a side across the split wraps the group in a new split", () => {
    const d = moveModules(defaultDock(W), ["slides"], { kind: "group", path: [0, 2, 1, 0], zone: "top" }, { px: 180 });
    assert.deepEqual(nodeAt(d.tree, [0, 1, 1, 0]), split("col", [g("slides"), g("previa")], [180, null]));
    assert.deepEqual(nodeAt(d.tree, [0, 1, 1]).sizes, [444, null], "the wrap keeps the Prévia's slot");
    assert.deepEqual(d.tree.children[0].sizes, [260, null, 320], "the column it left is gone");
    // The whole console: a new root.
    const one = { tree: group(["programa", "previa", "setlist"]), hidden: [] };
    const r = moveModules(one, ["setlist"], { kind: "group", path: [], zone: "bottom" }, { px: 250 });
    assert.deepEqual(r.tree, split("col", [g("programa", "previa"), g("setlist")], [null, 250]));
});

test("a drop onto where it already is changes nothing", () => {
    const d = defaultDock(W);
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [0, 2, 0], zone: "center" }), d);
    assert.deepEqual(moveModules(d, ["programa"], { kind: "group", path: [0, 2, 0], zone: "left" }), d, "a lone tab beside itself");
    // One tab of several can leave its group for its own side.
    const tabs = normalizeDock({ tree: split("row", [g("programa", "camadas"), g("previa"), g("setlist")], [null, 300, 400]), hidden: ["temas"] });
    const out = moveModules(tabs, ["camadas"], { kind: "group", path: [0], zone: "right" }, { px: 280 });
    assert.deepEqual(out.tree, split("row", [g("programa"), g("camadas"), g("previa"), g("setlist")], [null, 280, 300, 400]));
});

test("the tray: modules leave the console; the Programa, the Prévia and the Setlist never do", () => {
    const d = hideModule(defaultDock(W), "camadas");
    assert.deepEqual(d.hidden, ["camadas"]);
    assert.deepEqual(nodeAt(d.tree, [0, 3]), split("col", [g("temas"), g("setlist")], [TEMAS_H, null]));
    assert.deepEqual(hideModule(defaultDock(W), "programa"), defaultDock(W));
    assert.deepEqual(hideModule(defaultDock(W), "setlist"), defaultDock(W));
    assert.deepEqual(moveModules(defaultDock(W), ["previa", "abas"], { kind: "tray" }), defaultDock(W));
    // Back from the tray onto the console.
    const back = moveModules(d, ["camadas"], { kind: "group", path: [0, 0], zone: "center" });
    assert.deepEqual(back.hidden, []);
    assert.deepEqual(back.tree.children[0].children[0], group(["lib", "camadas"], "camadas"));
});

test("the player rides the Programa until it is placed, and goes home instead of the tray", () => {
    // In a column the player comes in at its own height (100), whatever was asked.
    const placed = moveModules(defaultDock(W), ["player"], { kind: "group", path: [0, 3, 2], zone: "top" }, { px: 300 });
    assert.deepEqual(nodeAt(placed.tree, [0, 3]), split("col", [g("camadas"), g("temas"), g("player"), g("setlist")], [280, TEMAS_H, 100, null]));
    const underCamadas = moveModules(defaultDock(W), ["player"], { kind: "group", path: [0, 3, 1], zone: "bottom" });
    assert.deepEqual(nodeAt(underCamadas.tree, [0, 3]).sizes, [280, 120, 100, null], "a fixed neighbour gives up just that (down to its minimum)");
    assert.equal(minSize(g("player"), false, { playerDocked: false }), 96, "its panel header counts");
    assert.deepEqual(pathOf(placed.tree, "player"), [0, 3, 2]);
    const hidden = hideModule(placed, "player");
    assert.equal(pathOf(hidden.tree, "player"), null);
    assert.deepEqual(hidden.hidden, [], "never in the tray");
    assert.deepEqual(hidden.tree, defaultDock(W).tree);
    assert.deepEqual(moveModules(placed, ["player"], { kind: "home" }).tree, defaultDock(W).tree);
    assert.deepEqual(moveModules(defaultDock(W), ["lib"], { kind: "home" }), defaultDock(W), "only the player has a home");
});

test("back from the tray: to the default place, beside what is on screen", () => {
    const d = defaultDock(W);
    assert.deepEqual(returnModule(hideModule(d, "lib"), "lib", W), d);
    assert.deepEqual(returnModule(hideModule(d, "camadas"), "camadas", W), d, "over the Setlist, with its height");
    assert.deepEqual(leaves(returnModule(hideModule(d, "abas"), "abas", W).tree), leaves(d.tree));
    // The Slides gone too: the Biblioteca goes before the centre.
    const both = hideModule(hideModule(d, "lib"), "slides");
    assert.equal(leaves(returnModule(both, "lib", W).tree)[0], "lib");
    assert.deepEqual(returnModule(d, "lib", W), d, "not in the tray: nothing moves");
    // The No ar strip comes back across the whole console, at its height.
    assert.deepEqual(returnModule(hideModule(d, "onair"), "onair", W), d);
    const moved = hideModule(moveModules(d, ["setlist"], { kind: "group", path: [0, 0], zone: "left" }), "onair");
    assert.deepEqual(returnModule(moved, "onair", W).tree, split("col", [moved.tree, g("onair")], [null, ONAIR_H]));
});

test("switching tabs and resizing", () => {
    const tabs = moveModules(defaultDock(W), ["camadas"], { kind: "group", path: [0, 2, 0], zone: "center" });
    assert.equal(setActive(tabs, [0, 2, 0], "programa").tree.children[0].children[2].children[0].active, "programa");
    assert.deepEqual(setActive(tabs, [0, 2, 0], "lib"), tabs, "not a tab of that group");
    assert.equal(resizeChild(defaultDock(W), [0], 0, 400).tree.children[0].sizes[0], 400);
    assert.equal(resizeChild(defaultDock(W), [0], 0, 50).tree.children[0].sizes[0], 260, "never under the module's minimum");
    // The Biblioteca's floor holds its four tabs and the (+) (218 px) with room
    // to spare, as the Slides' 300 holds a 2-line verse (owner 2026-10-14).
    assert.equal(MODULES.lib.minW, 260);
    assert.equal(minSize(g("lib"), true), 260);
    assert.equal(resizeChild(defaultDock(W), [0], 1, -350).tree.children[0].sizes[1], 300, "a drag past the edge stops at the minimum");
    assert.deepEqual(resizeChild(defaultDock(W), [0], 2, 900), defaultDock(W), "the flexible one takes the rest");
    assert.equal(resizeChild(defaultDock(W), [], 1, 20).tree.sizes[1], 96, "the No ar strip: never under one row of cards");
});

test("a splitter's restore: the size the default console gives the same modules", () => {
    const d = defaultDock(W);
    assert.equal(defaultSize(d, [0], 0, W), 260);
    assert.equal(defaultSize(d, [0, 3], 0, W), 280);
    assert.equal(defaultSize(d, [0, 3], 1, W), TEMAS_H);
    assert.equal(defaultSize(d, [], 1, W), ONAIR_H);
    const moved = moveModules(d, ["camadas"], { kind: "group", path: [0, 0], zone: "center" });
    assert.equal(defaultSize(moved, [0], 0, W), null, "Biblioteca with Camadas: nothing to restore to");
});

test("sizes: fixed children keep theirs, then give way toward their minimums", () => {
    assert.deepEqual(allocate([260, 300, null, 320], [200, 300, 320, 280], 1890), [260, 300, 1010, 320]);
    assert.deepEqual(allocate([260, 300, null], [200, 200, 320], 800), [230, 250, 320]);
    // The Programa's minimum height includes the player riding under it.
    assert.equal(minSize(g("programa"), false), 172 + PLAYER_SLOT);
    assert.equal(minSize(g("programa"), false, { playerDocked: false }), 172);
    assert.equal(172 + PLAYER_SLOT, 244, "no header and a two-row player: the column needs what it did");
});

test("fitting: what does not fit side by side becomes tabs, the dock itself unchanged", () => {
    const d = defaultDock(W);
    const whole = fitDock(d, 1908, 1000);
    assert.deepEqual(whole.children.map((c) => [c.size, c.fold, c.gone]), [[890, undefined, undefined], [ONAIR_H, true, false]], "the No ar strip under every column");
    const wide = whole.children[0].frame;
    assert.deepEqual(wide.children.map((c) => c.size), [260, 300, 1010, 320]);
    assert.equal(JSON.stringify(wide).includes('"collapsed"'), false);
    // 1200 px: the side columns give way to their minimums; the centre is
    // too narrow for the Prévia and the Painel de abas side by side.
    const mid = fitDock(d, 1200, 700).children[0].frame;
    assert.deepEqual(mid.children.map((c) => Math.round(c.size)), [260, 300, 320, 302]);
    const bottom = mid.children[2].frame.children[1];
    assert.equal(Math.round(bottom.size), 332, "its 250 and what the Programa cannot use: 590 − 6 − 250 − (320 · 9/16 + 72)");
    assert.deepEqual({ ...bottom.frame, w: Math.round(bottom.frame.w), h: Math.round(bottom.frame.h) }, { kind: "group", path: [0, 2, 1], tabs: ["previa", "abas"], active: "previa", w: 320, h: 332, collapsed: true, target: [0, 2, 1, 0] });
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
    assert.equal(lyricsOnAir({ content: { kind: "presentation", slides: [{ text: "", image_url: "p1.jpg" }] } }), true, "a PDF's pages (Rodada F3)");
    assert.deepEqual(goneModules(song), []);
    assert.deepEqual(goneModules({}), ["onair"]);

    // Gone, it takes no room: the columns get the whole height, no gutter;
    // its place (and the dock) stay, so it comes back where it was.
    const d = defaultDock(W);
    const f = fitDock(d, 1908, 1000, { gone: ["onair"] });
    assert.deepEqual(f.children.map((c) => [c.index, c.size, c.fixed, Boolean(c.gone)]), [[0, 1000, false, false], [1, 0, true, true]]);
    assert.deepEqual(f.children[1].frame.path, [1]);
    assert.equal(f.children[0].frame.children[2].frame.children[0].size, 640, "the Programa takes the strip's 110 px up to its 16:9 (1010 · 9/16 + 72)");
    assert.deepEqual(fitDock(d, 1908, 1000, { gone: ["programa"] }), fitDock(d, 1908, 1000), "only a folding module folds");
});

test("the Programa never takes more than its 16:9: the rest goes to its neighbour (design audit C-51)", () => {
    assert.equal(programaNatural(false, 1010, 999), 568 + PLAYER_SLOT, "down a column: its width's 16:9 and the player");
    assert.equal(programaNatural(false, 1010, 999, false), 568, "the player placed elsewhere");
    assert.equal(programaNatural(true, 999, 432 + PLAYER_SLOT), 768, "across a row: its height's 16:9");
    // The wide console, nothing on air: the Programa is as tall as its screen
    // and the player, and the Prévia's band gets the rest — no empty band
    // under the player. The dock itself keeps the band's 250.
    const d = defaultDock(W);
    const centre = fitDock(d, 1908, 1000, { gone: ["onair"] }).children[0].frame.children[2].frame;
    assert.deepEqual(centre.children.map((c) => [c.size, c.fixed]), [[640, false], [354, true]]);
    assert.equal(nodeAt(d.tree, [0, 2]).sizes[1], 250);
    // With the strip on air the Programa is shorter than its 16:9: nothing moves.
    const onAir = fitDock(d, 1908, 1000).children[0].frame.children[2].frame;
    assert.deepEqual(onAir.children.map((c) => c.size), [890 - 6 - 250, 250]);
    // The operator's splitter still makes the band bigger (the Programa then
    // shorter than its 16:9), never the Programa past it.
    const taller = resizeChild(d, [0, 2], 1, 400);
    assert.deepEqual(fitDock(taller, 1908, 1000, { gone: ["onair"] }).children[0].frame.children[2].frame.children.map((c) => c.size), [594, 400]);
    // The player placed elsewhere: the screen alone.
    const placedPlayer = normalizeDock({ tree: split("row", [split("col", [g("programa"), split("row", [g("previa"), g("setlist")], [400, null])], [null, 300]), g("player")], [null, 300]) });
    const col = fitDock(placedPlayer, 1306, 1000).children[0].frame;
    assert.deepEqual(col.children.map((c) => c.size), [563, 1000 - 6 - 563]);
    // Across a row: its width past its height's 16:9 goes to the next one.
    const row = normalizeDock({ tree: split("row", [g("programa"), g("previa"), g("setlist")], [null, 300, 300]) });
    assert.deepEqual(fitDock(row, 1800, 500).children.map((c) => c.size), [761, 1800 - 12 - 300 - 761, 300]);
    // A locked or folded neighbour never takes it: the Programa keeps the room.
    const locked = { tree: split("col", [g("programa"), g("camadas")], [null, 200]), hidden: [] };
    assert.deepEqual(fitDock(locked, 400, 1000, { locked: { camadas: 150 } }).children.map((c) => c.size), [844, 150]);
});

test("medium and narrow start with the Slides wider by what the Programa's 16:9 cannot use (C-51)", () => {
    // 1366 × 768 with the window and top bars: a grid of 1354 × 654. The
    // Programa's screen fills the centre (668 px) and the Slides take the rest.
    const spare = (d, w, h) => { const live = fitDock(d, w, h).children[2]; return live.size - programaNatural(true, 0, live.frame.children[0].size); };
    const medium = fromArrangement({}, { width: 1354, height: 654, tier: "medium" });
    assert.deepEqual(medium.tree.sizes, [260, 414, null]);
    assert.equal(spare(medium, 1354, 654), 0);
    assert.deepEqual(nodeAt(medium.tree, [2, 1]).sizes, [344, null], "the Prévia keeps its width; the Setlist beside it gives the room");
    assert.deepEqual(fromArrangement({}, { width: 1268, height: 606, tier: "medium" }).tree.sizes, [260, 413, null], "1280 × 720");
    // Tall enough for the Programa to fill the centre: the Slides keep 300.
    assert.deepEqual(fromArrangement({}, { width: 1354, height: 768, tier: "medium" }).tree.sizes, [260, 300, null]);
    // The layout's own width for the Slides wins; the wide console keeps its columns.
    assert.deepEqual(fromArrangement({ slidesW: 300 }, { width: 1354, height: 654, tier: "medium" }).tree.sizes, [260, 414, null], "300 is every layout's default (layout.js)");
    assert.deepEqual(fromArrangement({ slidesW: 340 }, { width: 1354, height: 654, tier: "medium" }).tree.sizes, [260, 340, null]);
    assert.deepEqual(fromArrangement({}, { width: 1908, height: 654, tier: "wide" }).tree.children[0].children[0].sizes, [260, 300, null]);
    // Narrow: the Biblioteca-over-Slides column takes it.
    assert.equal(fromArrangement({}, { width: 1000, height: 600, tier: "narrow" }).tree.sizes[0], 422);
    // Slides in the tray: nothing to give it to.
    assert.deepEqual(fromArrangement({ hidden: { slides: true } }, { width: 1354, height: 654, tier: "medium" }).tree.sizes, [260, null]);
});

test("the No ar strip is pinned to the bottom: never moved, only to the tray and back", () => {
    const d = defaultDock(W);
    const bottom = (dk) => { const t = dk.tree; const last = t.children?.[t.children.length - 1]; return t.dir === "col" && JSON.stringify(last?.tabs) === '["onair"]'; };
    assert.ok(bottom(d));
    // Never dragged elsewhere, and nothing goes into it or beside it.
    assert.deepEqual(moveModules(d, ["onair"], { kind: "group", path: [0, 3, 0], zone: "center" }), d);
    assert.deepEqual(moveModules(d, ["onair"], { kind: "edge", zone: "left" }), d);
    assert.deepEqual(moveModules(d, ["lib"], { kind: "group", path: pathOf(d.tree, "onair"), zone: "center" }), d);
    assert.deepEqual(moveModules(d, ["lib"], { kind: "group", path: pathOf(d.tree, "onair"), zone: "left" }), d);
    // A save with it somewhere else (as a tab beside Camadas, under the
    // Prévia) gets it back across the bottom, the rest as it was.
    const tabSave = normalizeDock({ tree: split("row", [g("lib"), g("programa", "onair"), split("col", [g("previa"), g("setlist")], [300, null])], [260, null, 320]) });
    assert.equal(bandOf(tabSave.tree, "onair"), "columns", "the default band (the window one for a W dock below)");
    assert.deepEqual(nodeAt(tabSave.tree, pathOf(tabSave.tree, "programa")).tabs, ["programa"]);
    // The tray and back: across the bottom again, whatever is on screen.
    const out = hideModule(d, "onair");
    assert.ok(out.hidden.includes("onair") && !pathOf(out.tree, "onair"));
    const back = returnModule(out, "onair", W);
    assert.ok(bottom(back) && !back.hidden.includes("onair"));
    assert.deepEqual(back.tree, d.tree);
});

test("locked heights: the console's, exact, with no splitter, only down a column", () => {
    const d = defaultDock(W);
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
    const row = normalizeDock({ tree: split("row", [g("camadas"), g("programa"), g("previa"), g("setlist")], [300, null, 300, 300]), hidden: ["temas", "onair"] });
    assert.equal(JSON.stringify(fitDock(row, 1600, 900, { locked: { camadas: 152 } })).includes('"locked":true'), false);
    const tab = moveModules(d, ["camadas"], { kind: "group", path: pathOf(d.tree, "setlist"), zone: "center" });
    assert.equal(JSON.stringify(fitDock(tab, 1908, 1000, { locked: { camadas: 152 } })).includes('"locked":true'), false);
    // A locked child that was the flexible one: the largest free one takes the rest.
    const flex = normalizeDock({ tree: split("col", [g("camadas"), split("row", [g("programa"), g("previa"), g("setlist")], [null, 300, 300])], [null, 400]), hidden: ["temas", "onair"] });
    assert.deepEqual(fitDock(flex, 1600, 900, { locked: { camadas: 152 } }).children.map((c) => c.size), [152, 742]);
});

test("folded panels (Rodada F4): a header down a column, a strip across a row, one open child kept", () => {
    const d = defaultDock(W);
    const at = (f) => f.children.map((c) => [c.frame.tabs?.[0], c.size, Boolean(c.locked), Boolean(c.folded)]);
    // The right column (890 px under the 104 px strip): Camadas folded to its
    // header — the fold wins over its measured height — Temas measured, the
    // Setlist the rest.
    const f = fitDock(d, 1908, 1000, { folded: ["camadas"], locked: { camadas: 152, temas: 220 }, head: 28 });
    const side = f.children[0].frame.children[3].frame;
    assert.deepEqual(at(side), [["camadas", 28, true, true], ["temas", 220, true, false], ["setlist", 890 - 28 - 220 - 12, false, false]]);
    assert.deepEqual(side.children.map((c) => c.frame.fold), [{ dir: "col", on: true, can: true }, { dir: "col", on: false, can: true }, { dir: "col", on: false, can: true }]);
    // Across a row: the Biblioteca a 28 px strip, the Programa's column grows.
    const r = fitDock(d, 1908, 1000, { folded: ["lib"] }).children[0].frame;
    assert.deepEqual(r.children.map((c) => c.size), [FOLD_STRIP, 300, 1890 - FOLD_STRIP - 300 - 320, 320]);
    assert.deepEqual([r.children[0].locked, r.children[0].folded, r.children[0].frame.fold], [true, true, { dir: "row", on: true, can: true }]);
    // The Setlist and Temas folded: Camadas is the last open one — its
    // chevron cannot fold it, and it takes the rest instead of its list's height.
    const last = fitDock(d, 1908, 1000, { folded: ["setlist", "temas"], locked: { camadas: 152, temas: 220 } }).children[0].frame.children[3].frame;
    assert.deepEqual(at(last), [["camadas", 890 - 64 - 12, false, false], ["temas", 32, true, true], ["setlist", 32, true, true]]);
    assert.deepEqual(last.children[0].frame.fold, { dir: "col", on: false, can: false });
    // All three folded (a save from another width): the flexible one stays open.
    const all = fitDock(d, 1908, 1000, { folded: ["camadas", "temas", "setlist"] }).children[0].frame.children[3].frame;
    assert.deepEqual(at(all), [["camadas", 32, true, true], ["temas", 32, true, true], ["setlist", 890 - 64 - 12, false, false]]);
    assert.deepEqual(all.children[2].frame.fold, { dir: "col", on: false, can: false });
    // The No ar strip folded is its header; gone (no lyrics on air), no room at all.
    assert.deepEqual(fitDock(d, 1908, 1000, { folded: ["onair"], locked: { onair: 150 }, head: 28 }).children.map((c) => c.size), [1000 - 6 - 28, 28]);
    assert.deepEqual(fitDock(d, 1908, 1000, { folded: ["onair"], gone: ["onair"] }).children.map((c) => c.size), [1000, 0]);
    // The Programa, the Prévia and the player never fold; as a tab beside
    // another module, or alone at the root, a module has no fold either.
    assert.deepEqual(["programa", "previa", "player", "lib", "setlist", "reading", "air"].map(canFoldModule), [false, false, false, true, true, false, false]);
    const plain = fitDock(d, 1908, 1000);
    assert.equal(JSON.stringify(fitDock(d, 1908, 1000, { folded: ["programa", "previa"] })), JSON.stringify(plain));
    const live = plain.children[0].frame.children[2].frame;
    assert.equal(live.children[0].frame.fold, undefined, "the Programa has no chevron");
    const tab = moveModules(d, ["camadas"], { kind: "group", path: pathOf(d.tree, "setlist"), zone: "center" });
    const tabSide = fitDock(tab, 1908, 1000, { folded: ["camadas", "setlist"] }).children[0].frame.children[3].frame;
    assert.deepEqual(tabSide.children[1].frame.tabs, ["setlist", "camadas"]);
    assert.equal(tabSide.children[1].frame.fold, undefined);
    assert.equal(tabSide.children[1].folded, undefined);
    assert.equal(fitDock(normalizeDock({ tree: g("programa", "previa", "setlist") }), 800, 600, { folded: ["setlist"] }).fold, undefined);
    // Nothing folded: the frames are the same as before, but for `fold`.
    assert.equal(JSON.stringify(plain).includes('"folded"'), false);
});

test("the Bíblia's panels never fold (owner 2026-10-16)", () => {
    const d = defaultDock({ env: "biblia" });
    assert.equal(["books", "chapters", "verses", "reading", "air"].some(canFoldModule), false);
    // A fold saved before (layout.folded) is ignored: the same frames, and no chevron.
    const plain = fitDock(d, 1908, 1000);
    assert.equal(JSON.stringify(fitDock(d, 1908, 1000, { folded: ["books", "chapters", "verses", "reading", "air"] })), JSON.stringify(plain));
    assert.equal(plain.children[1].frame.fold, undefined);
    assert.equal(plain.children[0].frame.children[0].frame.fold, undefined);
});

test("the No ar strip is as tall as the slide with the most lines", () => {
    assert.equal(onAirHeight([]), ONAIR_H, "never under the default strip");
    assert.equal(onAirHeight([{ text: "a\nb" }]), Math.max(ONAIR_H, 72 + 2 * 18));
    assert.equal(onAirHeight([{ text: "a\nb" }, { text: "a\nb\nc\nd" }]), 72 + 4 * 18, "4 lines a slide (the song's editor)");
    assert.ok(onAirHeight([{ text: "1\n2\n3\n4\n5\n6" }]) > onAirHeight([{ text: "1\n2\n3\n4" }]), "a whole stanza");
    assert.equal(onAirHeight([{ text: "a\nb\nc" }], 28), 72 + 3 * 18 - 4, "a compact header is 4 px shorter");
    assert.equal(onAirHeight([{ text: "", image_url: "p1.jpg", label: "Página 1" }]), 72 + ONAIR_PAGE_LINES * 18, "a presentation's page: a thumbnail of ONAIR_PAGE_LINES lines");
});

// The Bíblia's dock: the same engine, its own modules.
const bible = () => split("row", [
    split("col", [g("books"), g("chapters"), g("verses")], [320, 200, null]),
    g("reading"),
    g("air"),
], [300, null, 400]);

test("the Bíblia: its default dock is the three columns it had", () => {
    assert.deepEqual(defaultDock({ env: "biblia" }), { env: "biblia", tree: bible(), hidden: [] });
    // An old arrangement: the text first, the pickers in another order, a wider picker column.
    const d = fromBibleArrangement({ order: { biblia: ["reading", "picker", "air"] }, stacks: { picker: ["verses", "books", "chapters"] }, bibleSelW: 340 });
    assert.deepEqual(d.tree, split("row", [
        g("reading"),
        split("col", [g("verses"), g("books"), g("chapters")], [200, 320, null]),
        g("air"),
    ], [null, 340, 400]));
});

test("the Bíblia: only its modules, its required ones back, the environment kept", () => {
    const d = normalizeDock({ env: "biblia", tree: split("row", [g("reading", "lib"), g("programa")], [null, 300]), hidden: ["slides", "books"] });
    assert.equal(d.env, "biblia");
    assert.deepEqual(leaves(d.tree), ["reading", "air"], "culto modules are not the Bíblia's; No ar comes back");
    // "Versão e busca" (bhead) folded into Livros and the text's header (2026-10-14): an old save loses it.
    const old = normalizeDock({ env: "biblia", tree: split("row", [split("col", [g("bhead"), g("books"), g("chapters"), g("verses")], [132, 320, 200, null]), g("reading"), g("air")], [300, null, 400]) });
    assert.deepEqual(old.tree, bible(), "the picker column closes up without it");
    assert.deepEqual(d.hidden, ["books", "chapters", "verses"]);
    // The culto never takes the Bíblia's modules.
    assert.equal(leaves(normalizeDock({ tree: g("programa", "reading") }).tree).includes("reading"), false);
    const off = hideModule(defaultDock({ env: "biblia" }), "books");
    assert.equal(off.env, "biblia");
    assert.deepEqual(off.hidden, ["books"]);
    assert.deepEqual(hideModule(defaultDock({ env: "biblia" }), "air"), defaultDock({ env: "biblia" }), "No ar never leaves");
    assert.deepEqual(returnModule(off, "books", W), defaultDock({ env: "biblia" }));
    const tabs = moveModules(defaultDock({ env: "biblia" }), ["chapters"], { kind: "group", path: [0, 0], zone: "center" });
    assert.equal(tabs.env, "biblia");
    assert.deepEqual(nodeAt(tabs.tree, [0, 0]), group(["books", "chapters"], "chapters"));
    assert.equal(defaultSize(defaultDock({ env: "biblia" }), [], 2), 400);
});

test("the Bíblia fits the smallest window side by side", () => {
    const f = fitDock(defaultDock({ env: "biblia" }), 960, 600);
    assert.equal(JSON.stringify(f).includes('"collapsed"'), false);
    // 948 px: the side columns give way in proportion to their room (100 px
    // each: the pickers column is 200 px at least since "Versão e busca" left).
    assert.deepEqual(f.children.map((c) => Math.round(c.size)), [244, 360, 344]);
});

test("a console never edited opens as it looked at its width: medium and narrow", () => {
    // A 1366 screen (grid 1354): no right column; Camadas is a drawer, the
    // Setlist beside the Prévia. centre = 1354 − 266 − 306 = 782; 44 % = 344.
    const medium = fromArrangement({}, { width: 1354, height: 768, tier: "medium" });
    assert.deepEqual(medium.tree, split("row", [
        g("lib"), g("slides"),
        split("col", [g("programa"), split("row", [g("previa"), g("setlist")], [344, null])], [null, 200]),
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
        split("col", [g("programa"), split("row", [g("previa"), g("setlist")], [305, null])], [null, 200]),
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
    const d = defaultDock(W);
    assert.deepEqual(trayFlags(d, ids), { lib: false, slides: false, camadas: false });
    const off = applyTrayFlags(d, { camadas: true }, ids, W);
    assert.deepEqual(off.hidden, ["camadas"]);
    assert.deepEqual(trayFlags(off, ids), { lib: false, slides: false, camadas: true });
    assert.deepEqual(applyTrayFlags(off, {}, ids), d, "back over the Setlist");
    assert.equal(applyTrayFlags(d, { lib: false }, ids), d, "nothing changed: the same dock");
    // The Painel de abas is not one of Ver's switches: its tray stays.
    const abas = hideModule(d, "abas");
    assert.deepEqual(applyTrayFlags(abas, {}, ids).hidden, ["abas"]);
});

test("Por %: the proportions survive a smaller box (owner 2026-10-15, Rodada D)", () => {
    const free = normalizeDock({ tree: fourColumns(), hidden: [] });
    assert.equal(dockMode(free), "free");
    const pct = setDockMode(free, "pct", 1908, 1000);
    assert.equal(dockMode(pct), "pct");
    assert.deepEqual(pct.ref, { w: 1908, h: 1000 });
    // Normalizing (a save read back, any edit) keeps the mode.
    assert.deepEqual(normalizeDock(pct).ref, { w: 1908, h: 1000 });
    assert.equal(dockMode(hideModule(pct, "temas")), "pct");
    const cols = (f) => f.children[0].frame.children.map((c) => c.size);
    // At the box it was made for, pct draws what free draws.
    assert.deepEqual(cols(fitDock(pct, 1908, 1000)), cols(fitDock(free, 1908, 1000)));
    // In a box 0.9 as wide, the fixed columns keep their share; free keeps pixels.
    const small = cols(fitDock(pct, 1717, 1000));
    assert.equal(small[0], MODULES.lib.minW); // 195 would be under its minimum
    assert.ok(Math.abs(small[3] - 288) <= 1, `side ${small[3]}`);
    assert.equal(cols(fitDock(free, 1717, 1000))[3], 320);
    // Minimums still win: the Slides never go under theirs.
    const tiny = cols(fitDock(pct, 1000, 1000));
    assert.ok(tiny[1] >= MODULES.slides.minW || tiny.length < 4);
});

test("Por %: rebase makes the sizes the ones drawn, and Livre keeps them", () => {
    const pct = setDockMode(normalizeDock({ tree: fourColumns(), hidden: [] }), "pct", 1908, 1000);
    const re = rebaseDock(pct, 954, 1000);
    assert.deepEqual(re.ref, { w: 954, h: 1000 });
    assert.equal(nodeAt(re.tree, [0]).sizes[3], 160);
    // Back to Livre: the pixels on screen stay, the mode goes.
    const free = setDockMode(pct, "free", 954, 1000);
    assert.equal(dockMode(free), "free");
    assert.equal(free.ref, undefined);
    assert.equal(nodeAt(free.tree, [0]).sizes[3], 160);
    // A free dock is never rebased.
    assert.equal(rebaseDock(free, 100, 100), free);
    // A save with a broken ref keeps pct and draws as free until rebased.
    const odd = normalizeDock({ ...pct, ref: { w: 0, h: "x" } });
    assert.equal(dockMode(odd), "pct");
    assert.equal(odd.ref, undefined);
    assert.deepEqual(fitDock(odd, 1000, 900).w, 1000);
});

test("Por %: splitters snap to 5 %", () => {
    assert.equal(PCT_STEP, 5);
    assert.equal(snapPct(312, 1000), 300);
    assert.equal(snapPct(326, 1000), 350);
    assert.equal(snapPct(324, 1000), 300);
    assert.equal(snapPct(5, 1000), 50);
    assert.equal(snapPct(999, 1000), 950);
    assert.equal(snapPct(100, 0), 100);
});

test("dockMotion: folds, the strip and measured heights ease; a new window or shape does not (POL-01)", () => {
    const d = defaultDock(W);
    const locked = { camadas: 152, temas: 220 };
    const open = dockMotion(fitDock(d, 1908, 1000, { locked, gone: ["onair"] }));
    // Folding the Setlist (the right column's flexible child) eases, and
    // every cell keeps a size to ease from and to (none collapses to 0).
    const shut = dockMotion(fitDock(d, 1908, 1000, { locked, gone: ["onair"], folded: ["setlist"] }));
    assert.equal(easesBetween(open, shut), true);
    assert.equal(easesBetween(shut, open), true);
    assert.equal(open.shape, shut.shape);
    const changed = Object.keys(open.sizes).filter((k) => Math.abs(open.sizes[k] - shut.sizes[k]) > 1);
    assert.ok(changed.length >= 2);
    assert.ok(changed.every((k) => open.sizes[k] > 0 && shut.sizes[k] > 0));
    // The No ar strip coming: eased; Camadas measuring another height: eased.
    assert.equal(easesBetween(open, dockMotion(fitDock(d, 1908, 1000, { locked }))), true);
    assert.equal(easesBetween(open, dockMotion(fitDock(d, 1908, 1000, { locked: { ...locked, camadas: 300 }, gone: ["onair"] }))), true);
    // Nothing changed, another window size, another arrangement: drawn at once.
    assert.equal(easesBetween(open, dockMotion(fitDock(d, 1908, 1000, { locked, gone: ["onair"] }))), false);
    assert.equal(easesBetween(open, dockMotion(fitDock(d, 1600, 900, { locked, gone: ["onair"], folded: ["setlist"] }))), false);
    const moved = moveModules(d, ["camadas"], { kind: "group", path: [0, 2, 0], zone: "center" });
    assert.equal(easesBetween(open, dockMotion(fitDock(moved, 1908, 1000, { locked, gone: ["onair"] }))), false);
    assert.equal(easesBetween(null, open), false);
});
