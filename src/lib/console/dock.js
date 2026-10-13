// The console's arrangement as a tree (Ver › Editar disposição; the
// 2026-10-13 prototype "Disposição do console", model Livre): every module
// of an environment (the culto, the Bíblia) can go anywhere in it. Pure:
// the console renders what fitDock returns and reports drops and splitter
// moves; this module decides what they do. It took over from arrange.js's
// fixed columns.
//
// A dock is { env?, tree, hidden } (env "biblia" for the Bíblia's; absent:
// the culto's):
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
// it is never in the tray. The Programa, the Prévia and the Setlist are
// never in the tray either: without them the culto cannot run.
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

// The smallest size each module is usable at, its panel's header included,
// and its environment (env; absent: the culto). The Slides keep a slide's
// lines whole down to 300 px ("Uma estrofe de exemplo" wraps below 220 px;
// 300 leaves room for ~33 letters a line).
export const MODULES = {
    lib: { name: "Biblioteca", minW: 200, minH: 160 },
    slides: { name: "Slides", minW: 300, minH: 140 },
    programa: { name: "Programa", minW: 320, minH: 200, required: true },
    previa: { name: "Prévia", minW: 220, minH: 200, required: true },
    abas: { name: "Painel de abas", minW: 220, minH: 140 },
    // Never out of reach (the console audit, 2026-10-13).
    setlist: { name: "Setlist", minW: 220, minH: 120, required: true },
    camadas: { name: "Camadas", minW: 280, minH: 120 },
    // As a module of its own: the panel's header (32) over the slot (36); in
    // a column it comes in at its own height (`size.col`), not half of its
    // neighbour's.
    player: { name: "Player", minW: 280, minH: 76, home: "programa", size: { col: 80 } },
    // The Bíblia (BibleEnv.jsx): the version, theme and search; the three
    // pickers; the text; what is on air with Enviar ao ar.
    bhead: { name: "Versão e busca", minW: 240, minH: 100, required: true, env: "biblia" },
    books: { name: "Livros", minW: 200, minH: 120, env: "biblia" },
    chapters: { name: "Capítulos", minW: 200, minH: 90, env: "biblia" },
    verses: { name: "Versículos", minW: 200, minH: 96, env: "biblia" },
    reading: { name: "Texto", minW: 360, minH: 200, required: true, env: "biblia" },
    air: { name: "No ar", minW: 300, minH: 300, required: true, env: "biblia" },
};
export const ENVS = ["culto", "biblia"];
const envOf = (id) => MODULES[id]?.env || "culto";
export const envModules = (env) => Object.keys(MODULES).filter((id) => envOf(id) === env);
export const dockEnv = (d) => (d?.env === "biblia" ? "biblia" : "culto");
// A dock object for an environment (the culto's carries no env).
const make = (env, tree, hidden) => (env === "culto" ? { tree, hidden } : { env, tree, hidden });
export const MODULE_IDS = envModules("culto");
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
function clean(node, seen, env) {
    if (isGroup(node)) {
        const tabs = [];
        for (const id of node.tabs) {
            if (MODULES[id] && envOf(id) === env && !seen.has(id)) { seen.add(id); tabs.push(id); }
        }
        if (!tabs.length) return null;
        return group(tabs, tabs.includes(node.active) ? node.active : tabs[0]);
    }
    if (!isSplit(node)) return null;
    const dir = node.dir === "col" ? "col" : "row";
    const kids = [];
    const sizes = [];
    node.children.forEach((c, i) => {
        const k = clean(c, seen, env);
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
    const env = dockEnv(saved);
    const ids = envModules(env);
    const seen = new Set();
    let tree = clean(saved?.tree, seen, env);
    for (const id of ids) {
        if (MODULES[id].required && !seen.has(id)) { tree = addBeside(tree, id); seen.add(id); }
    }
    const trayable = (id) => ids.includes(id) && !MODULES[id].required && !MODULES[id].home && !seen.has(id);
    const hidden = [];
    for (const id of Array.isArray(saved?.hidden) ? saved.hidden : []) if (trayable(id) && !hidden.includes(id)) hidden.push(id);
    // A module the save does not know (a newer KERYX) starts in the tray.
    for (const id of ids) if (trayable(id) && !hidden.includes(id)) hidden.push(id);
    return make(env, tree, hidden);
}

// The dock that matches the console before Editar disposição became a tree,
// from the layout saved then (the column order, the order of the stacked
// cards, the hidden modules, the sizes) and, as the console did then, the
// width it is shown at (`tier`, layout.js tierFor):
//   wide    the four columns of the 2026-10-13 console audit;
//   medium  no right column: Camadas is a drawer (in the tray) and the
//           Setlist sits beside the Prévia, where the Painel de abas was;
//   narrow  the same, and the Biblioteca over the Slides in one column.
// `width`, `height`: the console's grid, to turn the Prévia's percentage
// and a stacked column into pixels.
export function fromArrangement(layout = {}, { width = 1908, height = 900, tier = "wide" } = {}) {
    const hidden = layout?.hidden || {};
    const px = (k, d) => pxOrNull(layout?.[k]) ?? d;
    const libW = px("libW", 260);
    const slidesW = px("slidesW", 300);
    const rightW = px("rightW", 320);
    const camadasH = px("camadasH", 360);
    const wide = tier !== "medium" && tier !== "narrow";
    const narrow = tier === "narrow";
    // Narrow: the Biblioteca and the Slides share a column, in the stack's order.
    const pair = normalizeOrder(layout?.stacks?.source, ["lib", "slides"]).filter((id) => !hidden[id]);
    let centre = width - (wide ? rightW + G : 0);
    if (narrow) { if (pair.length) centre -= slidesW + G; }
    else {
        if (!hidden.lib) centre -= libW + G;
        if (!hidden.slides) centre -= slidesW + G;
    }
    const pct = Number.isFinite(layout?.prevPct) ? layout.prevPct : 44;
    const prevW = Math.round(Math.min(900, Math.max(MODULES.previa.minW, (centre * pct) / 100)));
    // The bottom band was as tall as the Prévia's column: its 16:9 monitor,
    // Enviar ao ar and the panel's header and padding.
    const bottomH = Math.round((prevW * 9) / 16 + 84);
    const live = split("col", [group(["programa"]), split("row", [group(["previa"]), group([wide ? "abas" : "setlist"])], [prevW, null])], [null, bottomH]);
    // Camadas over the Setlist (or under it), Camadas with its own height.
    const stack = normalizeOrder(layout?.stacks?.side, ["camadas", "roteiro"]).filter((id) => id !== "camadas" || !hidden.camadas);
    const side = split("col", stack.map((id) => group([id === "roteiro" ? "setlist" : id])), stack.map((id) => (id === "camadas" ? camadasH : null)));
    const cols = [];
    const sizes = [];
    let pairDone = false;
    for (const id of normalizeOrder(layout?.order?.culto, DEFAULT_ORDER.culto)) {
        if (id === "live") { cols.push(live); sizes.push(null); }
        else if (id === "side") { if (wide) { cols.push(side); sizes.push(rightW); } }
        else if (narrow) {
            if (pairDone || !pair.length) continue;
            pairDone = true;
            cols.push(pair.length === 1 ? group(pair) : split("col", pair.map((m) => group([m])), [Math.max(PX_MIN, Math.round((height - G) / 2)), null]));
            sizes.push(slidesW);
        }
        else if (!hidden[id]) { cols.push(group([id])); sizes.push(id === "lib" ? libW : slidesW); }
    }
    const tray = ["lib", "slides", "camadas"].filter((id) => hidden[id]);
    if (!wide) tray.push("camadas", "abas");
    return normalizeDock({ tree: split("row", cols, sizes), hidden: tray });
}

// The Bíblia's dock from the columns it had before (2026-10-12: Livro ·
// Capítulo · Versículo stacked on the left under the version and search,
// the text, No ar), with their saved order and widths.
export function fromBibleArrangement(layout = {}) {
    const px = (k, d) => pxOrNull(layout?.[k]) ?? d;
    const HEIGHT = { books: 320, chapters: 200, verses: null };
    const stack = normalizeOrder(layout?.stacks?.picker, ["books", "chapters", "verses"]);
    // The last picker takes the rest of the column; the others their height.
    const sizes = stack.map((id, i) => (i === stack.length - 1 ? null : HEIGHT[id] ?? 200));
    const picker = split("col", [group(["bhead"]), ...stack.map((id) => group([id]))], [132, ...sizes]);
    const cols = [];
    const widths = [];
    for (const id of normalizeOrder(layout?.order?.biblia, DEFAULT_ORDER.biblia)) {
        if (id === "picker") { cols.push(picker); widths.push(px("bibleSelW", 300)); }
        else if (id === "reading") { cols.push(group(["reading"])); widths.push(null); }
        else if (id === "air") { cols.push(group(["air"])); widths.push(px("bibleAirW", 400)); }
    }
    return normalizeDock({ env: "biblia", tree: split("row", cols, widths), hidden: [] });
}

export const defaultDock = (opts) => (opts?.env === "biblia" ? fromBibleArrangement({}) : fromArrangement({}, opts));

// ---------- changes (each returns a new, normalized dock) ----------

function strip(node, mods) {
    if (isGroup(node)) node.tabs = node.tabs.filter((m) => !mods.includes(m));
    else if (isSplit(node)) node.children.forEach((c) => strip(c, mods));
}

// Modules moved to a place:
//   { kind: "group", path, zone }  zone "center": as tabs of that group;
//                                  "left"/"right"/"top"/"bottom": a new group
//                                  on that side, splitting the space;
//   { kind: "tray" }               out of the console (never a required
//                                  module; the player goes home instead);
//   { kind: "home" }               the player back under the Programa.
// Beside a fixed neighbour the new group takes half of its size (each kept
// at its minimum at least); beside the flexible one, or when a new split is
// made, it gets `px`. share: false gives it `px` and leaves the neighbour be.
export function moveModules(dock, mods, target, { px = NEW_PX, share = true } = {}) {
    const d = normalizeDock(dock);
    const list = (mods || []).filter((m, i, a) => MODULES[m] && a.indexOf(m) === i);
    if (!list.length || !target) return d;
    if (target.kind === "tray" || target.kind === "home") {
        if (list.some((m) => MODULES[m].required)) return d;
        if (target.kind === "home" && list.some((m) => !MODULES[m].home)) return d;
        const tree = clone(d.tree);
        strip(tree, list);
        return normalizeDock(make(dockEnv(d), tree, [...d.hidden, ...list.filter((m) => !MODULES[m].home)]));
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
        // A module with a size of its own along this axis (the player in a column) takes it.
        const own = list.length === 1 ? MODULES[list[0]].size?.[axis] ?? null : null;
        const size = own ?? pxOrNull(px) ?? NEW_PX;
        if (parent && parent.dir === axis) {
            const s = parent.sizes[i];
            let mine = size;
            if (s !== null && own !== null) parent.sizes[i] = Math.max(minSize(node, axis === "row", contextOf(tree), false), s - G - own);
            else if (s !== null && share) {
                const row = axis === "row";
                const ctx = contextOf(tree);
                mine = Math.max(minSize(fresh, row, ctx, false), Math.round((s - G) / 2));
                parent.sizes[i] = Math.max(minSize(node, row, ctx, false), s - G - mine);
            }
            const at = before ? i : i + 1;
            parent.children.splice(at, 0, fresh);
            parent.sizes.splice(at, 0, mine);
        } else {
            const wrapped = split(axis, before ? [fresh, node] : [node, fresh], before ? [size, null] : [null, size]);
            if (parent) parent.children[i] = wrapped;
            else tree = wrapped;
        }
    }
    return normalizeDock(make(dockEnv(d), tree, d.hidden.filter((m) => !list.includes(m))));
}

export const hideModule = (dock, id) => moveModules(dock, [id], { kind: "tray" });

// A module back from the tray to where the default console has it (the
// wide one: every module has a place there): beside the first module after
// it in its default split that is on screen now (or the last one before
// it), with its default size; failing that, one level up. `opts`: as
// defaultDock's.
export function returnModule(dock, id, opts) {
    const d = normalizeDock(dock);
    if (!d.hidden.includes(id)) return d;
    const def = defaultDock({ ...opts, tier: "wide", env: dockEnv(d) }).tree;
    const onScreen = (m) => m !== id && pathOf(d.tree, m);
    let p = pathOf(def, id);
    while (p && p.length) {
        const parent = nodeAt(def, p.slice(0, -1));
        const i = p[p.length - 1];
        const row = parent.dir === "row";
        const px = parent.sizes[i] ?? NEW_PX;
        const after = parent.children.slice(i + 1).flatMap(leaves).find(onScreen);
        if (after) return moveModules(d, [id], { kind: "group", path: pathOf(d.tree, after), zone: row ? "left" : "top" }, { px, share: false });
        const before = parent.children.slice(0, i).flatMap(leaves).reverse().find(onScreen);
        if (before) return moveModules(d, [id], { kind: "group", path: pathOf(d.tree, before), zone: row ? "right" : "bottom" }, { px, share: false });
        p = p.slice(0, -1);
    }
    return moveModules(d, [id], { kind: "group", path: firstGroupPath(d.tree), zone: "left" }, { share: false });
}

// Ver's module switches over the tray: { id: true } = hidden. -> the modules
// of `ids` as they are in the dock, and the dock after a switch: each one
// switched off goes to the tray, each switched on comes back to its place
// (the same dock when nothing changed).
export const trayFlags = (dock, ids) => Object.fromEntries(ids.map((id) => [id, Boolean(dock?.hidden?.includes(id))]));
export function applyTrayFlags(dock, flags = {}, ids = [], opts) {
    const now = trayFlags(dock, ids);
    let d = dock;
    for (const id of ids) {
        const want = Boolean(flags[id]);
        if (want !== now[id]) d = want ? hideModule(d, id) : returnModule(d, id, opts);
    }
    return d;
}

// A fixed child's size in the default console, for a splitter's "restore":
// the slot there that holds the same modules; null when there is none.
export function defaultSize(dock, path, index, opts) {
    const sp = nodeAt(dock?.tree, path);
    if (!isSplit(sp) || !sp.children[index]) return null;
    const want = leaves(sp.children[index]).join();
    const find = (n) => {
        if (!isSplit(n)) return null;
        for (let i = 0; i < n.children.length; i++) {
            if (n.dir === sp.dir && leaves(n.children[i]).join() === want) return n.sizes[i];
            const r = find(n.children[i]);
            if (r !== null) return r;
        }
        return null;
    };
    return find(defaultDock({ ...opts, env: dockEnv(dock) }).tree);
}

// Every module's place on screen, for "Mover para…" and the tray:
// [{ id, path }] in the tree's order.
export const placed = (dock) => leaves(dock?.tree).map((id) => ({ id, path: pathOf(dock.tree, id) }));
export const canTray = (id) => Boolean(MODULES[id]) && !MODULES[id].required;

export function setActive(dock, path, id) {
    const d = normalizeDock(dock);
    const tree = clone(d.tree);
    const n = nodeAt(tree, path);
    if (!isGroup(n) || !n.tabs.includes(id) || n.active === id) return d;
    n.active = id;
    return make(dockEnv(d), tree, d.hidden);
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
    if (!Number.isFinite(px)) return d;
    // A drag far past the edge (even below zero) stops at the minimum.
    sp.sizes[index] = Math.min(PX_MAX, Math.max(min, Math.round(px)));
    return make(dockEnv(d), tree, d.hidden);
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
// size. When the children of a split cannot all fit side by side (or one
// over the other) at their minimums, neighbours join as the tabs of one
// group, a pair at a time, until they fit: first the pair that gives back
// the most room without touching the Programa, the Programa's last. Nothing
// in the dock changes: a bigger screen splits them again. -> a frame:
//   { kind: "group", path, tabs, active, w, h }
//   { kind: "group", path, tabs, active, w, h, collapsed: true, target }
//       (target: the first real group inside, where a drop lands)
//   { kind: "split", path, dir, w, h, children: [{ index, at, size, fixed, frame }] }
//       (at: the children of the dock's split this one stands for — several
//       when they joined as tabs — and index the first of them)
export function fitDock(dock, w, h) {
    if (!dock?.tree) return null;
    return fitNode(dock.tree, [], w, h, contextOf(dock.tree));
}

// Several nodes shown as the tabs of one group (the first one's tab in front).
function tabsFrame(nodes, path, w, h, target) {
    const tabs = nodes.flatMap(leaves);
    const first = nodeAt(nodes[0], target.slice(path.length));
    return { kind: "group", path, tabs, active: first?.active || tabs[0], w, h, collapsed: true, target };
}

function fitNode(node, path, w, h, ctx) {
    if (isGroup(node)) return { kind: "group", path, tabs: node.tabs, active: node.active, w, h };
    const row = node.dir === "row";
    let items = node.children.map((c, i) => ({ at: [i], min: minSize(c, row, ctx), size: node.sizes[i] }));
    const need = () => items.reduce((a, it) => a + it.min, 0) + G * (items.length - 1);
    const avail = row ? w : h;
    while (items.length > 1 && need() > avail + 0.5) {
        let best = -1;
        let bestGain = -Infinity;
        let bestProg = true;
        for (let k = 0; k < items.length - 1; k++) {
            const mods = [...items[k].at, ...items[k + 1].at].flatMap((i) => leaves(node.children[i]));
            const prog = mods.includes("programa");
            const gain = items[k].min + items[k + 1].min + G - groupMin(mods, row, ctx);
            if ((bestProg && !prog) || (prog === bestProg && gain > bestGain)) { best = k; bestGain = gain; bestProg = prog; }
        }
        const a = items[best];
        const b = items[best + 1];
        const at = [...a.at, ...b.at];
        const size = a.size === null || b.size === null ? null : Math.max(a.size, b.size);
        items.splice(best, 2, { at, min: groupMin(at.flatMap((i) => leaves(node.children[i])), row, ctx), size });
    }
    if (items.length === 1 && node.children.length > 1) {
        const target = firstGroupPath(node, path);
        return tabsFrame([node], path, w, h, target);
    }
    const dims = allocate(items.map((it) => it.size), items.map((it) => it.min), avail - G * (items.length - 1));
    return {
        kind: "split", path, dir: node.dir, w, h,
        children: items.map((it, k) => {
            const cw = row ? dims[k] : w;
            const ch = row ? h : dims[k];
            const first = [...path, it.at[0]];
            const frame = it.at.length === 1
                ? fitNode(node.children[it.at[0]], first, cw, ch, ctx)
                : tabsFrame(it.at.map((i) => node.children[i]), first, cw, ch, firstGroupPath(node.children[it.at[0]], first));
            return { index: it.at[0], at: it.at, size: dims[k], fixed: it.size !== null, frame };
        }),
    };
}
