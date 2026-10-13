// The console's arrangement as a tree (Ver › Editar disposição; the
// 2026-10-13 prototype "Disposição do console", model Livre): every module
// of the culto environment can go anywhere. Pure: the console renders what
// fitDock returns and reports drops and splitter moves; this module decides
// what they do. It takes over from arrange.js's fixed columns for the culto
// environment (the Bíblia keeps arrange.js for now).
//
// A dock is { tree, hidden }:
//   - tree: a node, either
//       a group  { tabs: [moduleId…], active }   modules as tabs, one showing
//       a split  { dir: "row"|"col", children: [node…], sizes: [px|null…] }
//     In a split exactly one child is flexible (size null: it takes what is
//     left); every other one has a size in pixels along the split, as the
//     side columns have today, so widening the window grows the flexible
//     one. Nodes have no ids: a place is a path of child indices from the
//     root ([] is the root), recomputed on every render.
//   - hidden: the modules in the tray (Ver › Editar disposição), in order.
// The player is the one module with a home: while it is not in the tree it
// rides under the Programa (owner's decision 2026-10-13, always visible), so
// it is never in the tray. The Programa and the Prévia are never in the
// tray either: without them the culto cannot run.
import { DEFAULT_ORDER, normalizeOrder } from "./arrange.js";

// The gutter between two children: the splitter is the gap (console.css).
export const GUTTER = 6;
const G = GUTTER;
// The player's slot under the Programa (.pslot 36 + the gap above it).
export const PLAYER_SLOT = 44;
const PX_MIN = 40;
const PX_MAX = 4000;
// A new group's size along its split when nothing better is known.
export const NEW_PX = 320;

// The smallest size each module is usable at, its panel's header included.
export const MODULES = {
    lib: { name: "Biblioteca", minW: 200, minH: 160 },
    slides: { name: "Slides", minW: 200, minH: 140 },
    programa: { name: "Programa", minW: 320, minH: 200, required: true },
    previa: { name: "Prévia", minW: 220, minH: 200, required: true },
    setlist: { name: "Setlist", minW: 180, minH: 120 },
    camadas: { name: "Camadas", minW: 280, minH: 160 },
    player: { name: "Player", minW: 280, minH: 36, home: "programa" },
};
export const MODULE_IDS = Object.keys(MODULES);
export const ZONES = ["center", "left", "right", "top", "bottom"];

export const isGroup = (n) => Boolean(n) && Array.isArray(n.tabs);
export const isSplit = (n) => Boolean(n) && Array.isArray(n.children);
export const group = (tabs, active = tabs[0]) => ({ tabs: [...tabs], active });
export const split = (dir, children, sizes) => ({ dir, children, sizes });
const clone = (x) => JSON.parse(JSON.stringify(x));
const pxOrNull = (v) => (Number.isFinite(v) && v > 0 ? Math.min(PX_MAX, Math.max(PX_MIN, Math.round(v))) : null);

// The modules in a node, in order (tabs left to right, children in order).
export function leaves(node) {
    if (isGroup(node)) return [...node.tabs];
    if (isSplit(node)) return node.children.flatMap(leaves);
    return [];
}

export function nodeAt(tree, path) {
    let n = tree;
    for (const i of path || []) {
        if (!isSplit(n)) return null;
        n = n.children[i];
    }
    return n || null;
}

// The path of the group holding a module, or null.
export function pathOf(tree, id, path = []) {
    if (isGroup(tree)) return tree.tabs.includes(id) ? path : null;
    if (!isSplit(tree)) return null;
    for (let i = 0; i < tree.children.length; i++) {
        const p = pathOf(tree.children[i], id, [...path, i]);
        if (p) return p;
    }
    return null;
}

const firstGroupPath = (node, path = []) => (isSplit(node) ? firstGroupPath(node.children[0], [...path, 0]) : path);

// One flexible child per split: the one holding the Programa when there is a
// choice, else the largest (none flexible) or the first (several).
function withOneFlex(sp) {
    const sizes = [...sp.sizes];
    const prog = sp.children.findIndex((c) => leaves(c).includes("programa"));
    const flex = sizes.map((s, i) => (s === null ? i : -1)).filter((i) => i >= 0);
    let keep;
    if (flex.length === 1) return sp;
    if (flex.length === 0) keep = prog >= 0 ? prog : sizes.indexOf(Math.max(...sizes));
    else keep = flex.includes(prog) ? prog : flex[0];
    return { ...sp, sizes: sizes.map((s, i) => (i === keep ? null : s === null ? NEW_PX : s)) };
}

// A saved node made safe: unknown and repeated modules go, empty groups go,
// a split of one becomes its child, a split inside a split of the same
// direction merges into it.
function clean(node, seen) {
    if (isGroup(node)) {
        const tabs = [];
        for (const id of node.tabs) {
            if (MODULES[id] && !seen.has(id)) { seen.add(id); tabs.push(id); }
        }
        if (!tabs.length) return null;
        return group(tabs, tabs.includes(node.active) ? node.active : tabs[0]);
    }
    if (!isSplit(node)) return null;
    const dir = node.dir === "col" ? "col" : "row";
    const kids = [];
    const sizes = [];
    node.children.forEach((c, i) => {
        const k = clean(c, seen);
        if (!k) return;
        const s = pxOrNull(Array.isArray(node.sizes) ? node.sizes[i] : null);
        if (isSplit(k) && k.dir === dir) {
            // The merged split's flexible child takes the slot's size when
            // the slot had one (what is left of it after its siblings).
            const fixed = k.sizes.reduce((a, x) => a + (x ?? 0), 0) + G * (k.children.length - 1);
            k.children.forEach((cc, j) => {
                kids.push(cc);
                sizes.push(k.sizes[j] === null && s !== null ? pxOrNull(s - fixed) ?? PX_MIN : k.sizes[j]);
            });
        } else {
            kids.push(k);
            sizes.push(s);
        }
    });
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return withOneFlex({ dir, children: kids, sizes });
}

// A required module that is missing comes back at the right of the console.
function addBeside(tree, id) {
    if (!tree) return group([id]);
    if (isSplit(tree) && tree.dir === "row") return withOneFlex({ ...tree, children: [...tree.children, group([id])], sizes: [...tree.sizes, NEW_PX] });
    return split("row", [tree, group([id])], [null, NEW_PX]);
}

// A saved dock made safe. Every module ends up in exactly one place: the
// tree, the tray, or (the player) its home.
export function normalizeDock(saved) {
    const seen = new Set();
    let tree = clean(saved?.tree, seen);
    for (const id of MODULE_IDS) {
        if (MODULES[id].required && !seen.has(id)) { tree = addBeside(tree, id); seen.add(id); }
    }
    const trayable = (id) => MODULES[id] && !MODULES[id].required && !MODULES[id].home && !seen.has(id);
    const hidden = [];
    for (const id of Array.isArray(saved?.hidden) ? saved.hidden : []) if (trayable(id) && !hidden.includes(id)) hidden.push(id);
    // A module the save does not know (a newer KERYX) starts in the tray.
    for (const id of MODULE_IDS) if (trayable(id) && !hidden.includes(id)) hidden.push(id);
    return { tree, hidden };
}

// The dock that matches the console before Editar disposição became a tree
// (the 2026-10-13 two bands), from the layout saved then: the column order,
// the hidden modules and the widths. `width`: the console's grid width, to
// turn the Prévia's percentage into pixels (the band was a share of it).
export function fromArrangement(layout = {}, { width = 1908 } = {}) {
    const hidden = layout?.hidden || {};
    const px = (k, d) => pxOrNull(layout?.[k]) ?? d;
    const libW = px("libW", 260);
    const slidesW = px("slidesW", 300);
    const rightW = px("rightW", 320);
    let band = width;
    if (!hidden.lib) band -= libW + G;
    if (!hidden.slides) band -= slidesW + G;
    const pct = Number.isFinite(layout?.prevPct) ? layout.prevPct : 30;
    const prevW = Math.round(Math.min(900, Math.max(MODULES.previa.minW, (band * pct) / 100)));
    // The bottom band was as tall as the Prévia's column: its 16:9 monitor,
    // Enviar ao ar and the panel's header and padding.
    const bottomH = Math.round((prevW * 9) / 16 + 84);
    const top = hidden.camadas ? group(["programa"]) : split("row", [group(["programa"]), group(["camadas"])], [null, rightW]);
    const live = split("col", [top, split("row", [group(["previa"]), group(["setlist"])], [prevW, null])], [null, bottomH]);
    const cols = [];
    const sizes = [];
    for (const id of normalizeOrder(layout?.order?.culto, DEFAULT_ORDER.culto)) {
        if (id === "live") { cols.push(live); sizes.push(null); }
        else if (!hidden[id]) { cols.push(group([id])); sizes.push(id === "lib" ? libW : slidesW); }
    }
    return normalizeDock({ tree: split("row", cols, sizes), hidden: ["lib", "slides", "camadas"].filter((id) => hidden[id]) });
}

export const defaultDock = (opts) => fromArrangement({}, opts);

// ---------- changes (each returns a new, normalized dock) ----------

function strip(node, mods) {
    if (isGroup(node)) node.tabs = node.tabs.filter((m) => !mods.includes(m));
    else if (isSplit(node)) node.children.forEach((c) => strip(c, mods));
}

// Modules moved to a place:
//   { kind: "group", path, zone }  zone "center": as tabs of that group;
//                                  "left"/"right"/"top"/"bottom": a new group
//                                  on that side, splitting the space;
//   { kind: "tray" }               out of the console (never the Programa or
//                                  the Prévia; the player goes home instead);
//   { kind: "home" }               the player back under the Programa.
// `px`: the new group's size when it cannot take half of its neighbour's
// (the neighbour is the flexible one, or a new split is made).
export function moveModules(dock, mods, target, { px = NEW_PX } = {}) {
    const d = normalizeDock(dock);
    const list = (mods || []).filter((m, i, a) => MODULES[m] && a.indexOf(m) === i);
    if (!list.length || !target) return d;
    if (target.kind === "tray" || target.kind === "home") {
        if (list.some((m) => MODULES[m].required)) return d;
        if (target.kind === "home" && list.some((m) => !MODULES[m].home)) return d;
        const tree = clone(d.tree);
        strip(tree, list);
        return normalizeDock({ tree, hidden: [...d.hidden, ...list.filter((m) => !MODULES[m].home)] });
    }
    if (target.kind !== "group") return d;
    const tg = nodeAt(d.tree, target.path);
    if (!isGroup(tg)) return d;
    const zone = ZONES.includes(target.zone) ? target.zone : "center";
    const rest = tg.tabs.filter((m) => !list.includes(m));
    // Onto the group it comes from: as tabs there, or all of it beside itself.
    if (rest.length < tg.tabs.length && (zone === "center" || !rest.length)) return d;
    let tree = clone(d.tree);
    strip(tree, list); // paths stay valid: nothing is restructured before normalizing
    const node = nodeAt(tree, target.path);
    const fresh = group(list);
    if (zone === "center") {
        node.tabs.push(...list);
        node.active = list[0];
    } else {
        const axis = zone === "left" || zone === "right" ? "row" : "col";
        const before = zone === "left" || zone === "top";
        const i = target.path[target.path.length - 1];
        const parent = target.path.length ? nodeAt(tree, target.path.slice(0, -1)) : null;
        const size = pxOrNull(px) ?? NEW_PX;
        if (parent && parent.dir === axis) {
            const s = parent.sizes[i];
            let mine = size;
            if (s !== null) { mine = Math.max(PX_MIN, Math.round((s - G) / 2)); parent.sizes[i] = mine; }
            const at = before ? i : i + 1;
            parent.children.splice(at, 0, fresh);
            parent.sizes.splice(at, 0, mine);
        } else {
            const wrapped = split(axis, before ? [fresh, node] : [node, fresh], before ? [size, null] : [null, size]);
            if (parent) parent.children[i] = wrapped;
            else tree = wrapped;
        }
    }
    return normalizeDock({ tree, hidden: d.hidden.filter((m) => !list.includes(m)) });
}

export const hideModule = (dock, id) => moveModules(dock, [id], { kind: "tray" });

export function setActive(dock, path, id) {
    const d = normalizeDock(dock);
    const tree = clone(d.tree);
    const n = nodeAt(tree, path);
    if (!isGroup(n) || !n.tabs.includes(id) || n.active === id) return d;
    n.active = id;
    return { tree, hidden: d.hidden };
}

// A splitter moved: the fixed child at `index` of the split at `path` gets
// `px` along the split, never under its minimum. The flexible one has no
// size of its own (it takes the rest).
export function resizeChild(dock, path, index, px) {
    const d = normalizeDock(dock);
    const tree = clone(d.tree);
    const sp = nodeAt(tree, path);
    if (!isSplit(sp) || !(index in sp.sizes) || sp.sizes[index] === null) return d;
    const ctx = contextOf(tree);
    const min = minSize(sp.children[index], sp.dir === "row", ctx, false);
    const v = pxOrNull(px);
    if (v === null) return d;
    sp.sizes[index] = Math.max(min, v);
    return { tree, hidden: d.hidden };
}

// ---------- sizes and fitting ----------

const contextOf = (tree) => ({ playerDocked: !leaves(tree).includes("player") });

function groupMin(tabs, row, ctx) {
    let m = Math.max(...tabs.map((id) => (row ? MODULES[id].minW : MODULES[id].minH)));
    if (!row && ctx.playerDocked && tabs.includes("programa")) m += PLAYER_SLOT;
    return m;
}

// The smallest a node can be along an axis (row: its width). eff: a split
// may also become one group of tabs (fitDock), so it is never bigger than that.
export function minSize(node, row, ctx = contextOf(node), eff = true) {
    if (isGroup(node)) return groupMin(node.tabs, row, ctx);
    const along = (node.dir === "row") === row;
    const ms = node.children.map((c) => minSize(c, row, ctx, eff));
    const normal = along ? ms.reduce((a, b) => a + b, 0) + G * (ms.length - 1) : Math.max(...ms);
    return eff ? Math.min(normal, groupMin(leaves(node), row, ctx)) : normal;
}

// The children's sizes along a split of `avail` pixels (gutters taken out):
// the fixed ones keep theirs and the flexible one takes the rest; when that
// is not enough, the fixed ones give way toward their minimums, each in
// proportion to the room it has, as the side columns shrink today.
export function allocate(sizes, mins, avail) {
    const fi = sizes.indexOf(null);
    const out = sizes.map((s, i) => (i === fi ? 0 : Math.max(mins[i], s)));
    const flexMin = fi >= 0 ? mins[fi] : 0;
    const fixed = () => out.reduce((a, b, i) => (i === fi ? a : a + b), 0);
    const over = fixed() + flexMin - avail;
    if (over > 0) {
        const room = out.map((s, i) => (i === fi ? 0 : s - mins[i]));
        const total = room.reduce((a, b) => a + b, 0);
        const k = total > 0 ? Math.min(1, over / total) : 0;
        room.forEach((r, i) => { if (i !== fi) out[i] -= r * k; });
    }
    if (fi >= 0) out[fi] = Math.max(flexMin, avail - fixed());
    return out;
}

// What goes on screen in a box of w × h pixels: the tree with each node's
// size, where a split whose children cannot all fit side by side (or one
// over the other) at their minimums becomes one group holding all of its
// modules as tabs. Nothing in the dock changes: a bigger screen splits them
// again. -> a frame:
//   { kind: "group", path, tabs, active, w, h }
//   { kind: "group", path, tabs, active, w, h, collapsed: true, target }
//       (target: the first real group inside, where a drop lands)
//   { kind: "split", path, dir, w, h, children: [{ size, fixed, frame }] }
export function fitDock(dock, w, h) {
    if (!dock?.tree) return null;
    return fitNode(dock.tree, [], w, h, contextOf(dock.tree));
}

function fitNode(node, path, w, h, ctx) {
    if (isGroup(node)) return { kind: "group", path, tabs: node.tabs, active: node.active, w, h };
    const row = node.dir === "row";
    const avail = (row ? w : h) - G * (node.children.length - 1);
    const mins = node.children.map((c) => minSize(c, row, ctx));
    if (mins.reduce((a, b) => a + b, 0) > avail + 0.5) {
        const target = firstGroupPath(node, path);
        return { kind: "group", path, tabs: leaves(node), active: nodeAt(node, target.slice(path.length)).active, w, h, collapsed: true, target };
    }
    const dims = allocate(node.sizes, mins, avail);
    return {
        kind: "split", path, dir: node.dir, w, h,
        children: node.children.map((c, i) => ({
            size: dims[i],
            fixed: node.sizes[i] !== null,
            frame: fitNode(c, [...path, i], row ? dims[i] : w, row ? h : dims[i], ctx),
        })),
    };
}
