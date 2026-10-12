// The console's layout: which modules are shown, which are collapsed, the
// splitter sizes and where the columns go (order/stacks, arrange.js; Ver ›
// Editar layout). Saved per operator profile in localStorage; "Restaurar
// layout" returns to DEFAULT_LAYOUT.
import { DEFAULT_ORDER, DEFAULT_STACKS, normalizeArrangement } from "./arrange.js";
import { DEFAULT_TILES, normalizeTiles } from "./multiview.js";

// Camadas is a section above the Setlist in the wide tier's right column
// (owner's request, 2026-10-10); narrower, it is a drawer opened from the
// Programa.
export const MODULES = [
    ["lib", "Biblioteca"],
    ["slides", "Slides"],
    ["camadas", "Camadas"],
    ["temas", "Temas"],
    ["roteiro", "Setlist"],
];

// The console's width tiers, measured on its grid (.main), not the window:
// wide shows Biblioteca | Slides | Programa | Camadas over Setlist; medium puts the
// Setlist in the Biblioteca's tabs; narrow stacks Biblioteca over Slides in
// one column beside the Programa. The live column is never stacked below
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
    camadasH: 300,
    bibleSelW: 300,
    bibleAirW: 400,
    density: "comfortable",
    order: DEFAULT_ORDER,
    stacks: DEFAULT_STACKS,
    // The Programa as four outputs at once (multiview.js), and which.
    multiview: false,
    mvTiles: DEFAULT_TILES,
};

// What "Restaurar posições" (the edit mode's banner) puts back: the order,
// the stacks and the sizes; which modules are shown and the density stay.
export const ARRANGEMENT_KEYS = ["order", "stacks", "libW", "slidesW", "rightW", "camadasH", "bibleSelW", "bibleAirW"];
export const restoreArrangement = (layout) => ({ ...layout, ...Object.fromEntries(ARRANGEMENT_KEYS.map((k) => [k, DEFAULT_LAYOUT[k]])) });

export const densityOf = (layout) => (DENSITIES.some(([k]) => k === layout?.density) ? layout.density : DEFAULT_LAYOUT.density);

export const LIMITS = { libW: [200, 480], slidesW: [200, 520], rightW: [280, 520], camadasH: [120, 600], bibleSelW: [240, 520], bibleAirW: [300, 560] };

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
        return { ...DEFAULT_LAYOUT, ...saved, hidden: { ...(saved.hidden || {}) }, collapsed: { ...(saved.collapsed || {}) }, ...normalizeArrangement(saved), multiview: saved.multiview === true, mvTiles: normalizeTiles(saved.mvTiles) };
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
