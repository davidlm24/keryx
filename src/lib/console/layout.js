// The console's layout: which modules are shown, which are collapsed, the
// splitter sizes and where the columns go (order/stacks, arrange.js; Ver ›
// Editar layout). Saved per operator profile in localStorage; "Restaurar
// layout" returns to DEFAULT_LAYOUT.
import { DEFAULT_ORDER, DEFAULT_STACKS, normalizeArrangement } from "./arrange.js";
import { DEFAULT_TILES, normalizeTiles } from "./multiview.js";
import { DEFAULT_TABS, normalizeTabs } from "./panelTabs.js";
import { normalizeDock } from "./dock.js";
import { normalizePresets } from "./dockPresets.js";

// Camadas is a section above the Setlist in the wide tier's right column
// (owner's request, 2026-10-10; back there 2026-10-13); narrower, it is a
// drawer opened from the Programa. The Setlist is not a module: it is
// always on screen (the right column, else beside the Prévia).
export const MODULES = [
    ["lib", "Biblioteca"],
    ["slides", "Slides"],
    ["camadas", "Camadas"],
];

// The console's width tiers, measured on its grid (.main), not the window:
// wide shows Biblioteca | Slides | Programa | Camadas over Setlist; medium puts the
// Setlist beside the Prévia (Camadas is a drawer); narrow also stacks
// Biblioteca over Slides in one column beside the Programa. The live column is never stacked below
// anything and the page never scrolls.
export const TIER_WIDE = 1400;
export const TIER_MEDIUM = 1100;
export const tierFor = (width) => (width >= TIER_WIDE ? "wide" : width >= TIER_MEDIUM ? "medium" : "narrow");

// List density (Ver › Densidade): confortável, 32 px rows with titles up to
// two lines; compacta, today's 28 px single lines. Saved with the layout.
export const DENSITIES = [["comfortable", "Confortável"], ["compact", "Compacta"]];

export const DEFAULT_LAYOUT = {
    hidden: {},
    collapsed: {},
    libW: 260,
    slidesW: 300,
    rightW: 320,
    // Camadas' height over the Setlist (the splitter between them); the
    // Setlist takes the rest, most of the column.
    camadasH: 360,
    bibleSelW: 300,
    bibleAirW: 400,
    // The Prévia's width, % of the centre's bottom band (the splitter
    // beside it; the Programa above gives way when the window is short).
    prevPct: 44,
    density: "comfortable",
    order: DEFAULT_ORDER,
    stacks: DEFAULT_STACKS,
    // The tabs each trimmable row shows (panelTabs.js): the panel beside
    // the Prévia and the Biblioteca.
    tabs: DEFAULT_TABS,
    // The culto environment's arrangement as a tree (dock.js, Ver › Editar
    // disposição); null until the operator changes it: the console builds it
    // from the columns above (fromArrangement), so an old save keeps its look.
    dock: null,
    // The Bíblia's, the same way (fromBibleArrangement until it changes).
    bibleDock: null,
    // A console never edited starts with the modules the church's old
    // preference hid (console_hidden_modules) in the tray; after a restore,
    // with every module (false).
    trayFromChurch: true,
    // Named arrangements (dockPresets.js, Ver › Disposição) and the one in
    // use (null = Padrão).
    dockPresets: [],
    dockPreset: null,
    bibleDockPreset: null,
    // The Programa as four outputs at once (multiview.js), and which.
    multiview: false,
    mvTiles: DEFAULT_TILES,
};

// What "Restaurar posições" (the edit mode's banner) puts back: the order,
// the stacks and the sizes; which modules are shown and the density stay.
export const ARRANGEMENT_KEYS = ["dock", "bibleDock", "dockPreset", "bibleDockPreset", "order", "stacks", "libW", "slidesW", "rightW", "camadasH", "bibleSelW", "bibleAirW", "prevPct"];
export const restoreArrangement = (layout) => ({ ...layout, ...Object.fromEntries(ARRANGEMENT_KEYS.map((k) => [k, DEFAULT_LAYOUT[k]])) });

// One environment's arrangement back to the console's own (Padrão, the edit
// banner's Restaurar posições), the other's left as it is.
const ENV_KEYS = {
    culto: { keys: ["dock", "dockPreset", "libW", "slidesW", "rightW", "camadasH", "prevPct"], order: "culto", stacks: ["side", "source"], also: { trayFromChurch: false } },
    biblia: { keys: ["bibleDock", "bibleDockPreset", "bibleSelW", "bibleAirW"], order: "biblia", stacks: ["picker"] },
};
export function restoreEnv(layout, env) {
    const k = ENV_KEYS[env] || ENV_KEYS.culto;
    return {
        ...layout,
        ...Object.fromEntries(k.keys.map((key) => [key, DEFAULT_LAYOUT[key]])),
        order: { ...layout.order, [k.order]: DEFAULT_LAYOUT.order[k.order] },
        stacks: { ...layout.stacks, ...Object.fromEntries(k.stacks.map((s) => [s, DEFAULT_LAYOUT.stacks[s]])) },
        ...(k.also || {}),
    };
}

export const densityOf = (layout) => (DENSITIES.some(([k]) => k === layout?.density) ? layout.density : DEFAULT_LAYOUT.density);

// The Slides' minimum keeps a slide's lines as written: squeezed, a 2-line
// verse showed as 3 and looked split wrong. "Uma estrofe de exemplo" wraps
// below 220 px (measured in the preview, Geist 14 px); 300 leaves room for
// ~33 letters a line. Longer lines still wrap, never cut with an ellipsis.
// The narrow tier's source column (Biblioteca over Slides) uses it too.
export const LIMITS = { libW: [200, 480], slidesW: [300, 520], rightW: [280, 520], camadasH: [120, 640], bibleSelW: [240, 520], bibleAirW: [300, 560], prevPct: [18, 45] };

// A side column: its saved width is the flex basis, and it may shrink down
// to its minimum when the window narrows, so it never spills over the center
// or out of the window.
export const sideCol = (key, width) => ({ flex: `0 1 ${width}px`, minWidth: LIMITS[key][0] });

const KEY = (profile) => `keryx.console.layout.${profile || "default"}`;

export function loadLayout(profile) {
    try {
        const raw = localStorage.getItem(KEY(profile));
        if (!raw) return { ...DEFAULT_LAYOUT };
        const saved = JSON.parse(raw);
        return { ...DEFAULT_LAYOUT, ...saved, hidden: { ...(saved.hidden || {}) }, collapsed: { ...(saved.collapsed || {}) }, ...normalizeArrangement(saved), tabs: normalizeTabs(saved.tabs), dock: saved.dock ? normalizeDock(saved.dock) : null, bibleDock: saved.bibleDock ? normalizeDock({ ...saved.bibleDock, env: "biblia" }) : null, dockPresets: normalizePresets(saved.dockPresets), dockPreset: typeof saved.dockPreset === "string" ? saved.dockPreset : null, trayFromChurch: saved.trayFromChurch !== false, bibleDockPreset: typeof saved.bibleDockPreset === "string" ? saved.bibleDockPreset : null, multiview: saved.multiview === true, mvTiles: normalizeTiles(saved.mvTiles) };
    } catch {
        return { ...DEFAULT_LAYOUT };
    }
}

export function saveLayout(profile, layout) {
    try {
        localStorage.setItem(KEY(profile), JSON.stringify(layout));
    } catch { /* private mode or quota: the layout just isn't remembered */ }
}

export const clampSize = (key, value) => {
    const [min, max] = LIMITS[key];
    return Math.max(min, Math.min(max, Math.round(value)));
};
