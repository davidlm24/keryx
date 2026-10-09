// The console's layout: which modules are shown, which are collapsed, and
// the splitter sizes. Saved per operator profile in localStorage; "Restaurar
// layout" returns to DEFAULT_LAYOUT.

// Camadas is not a module any more: it is a drawer opened from the Programa
// (docs/presenter-layout-proposal-2026-10-09.md, P0).
export const MODULES = [
    ["lib", "Biblioteca"],
    ["slides", "Slides"],
    ["roteiro", "Setlist"],
    ["tl", "Linha do tempo"],
];

// The console's width tiers, measured on its grid (.main), not the window:
// wide shows Biblioteca | Slides | Programa | Setlist; medium puts the
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
    tlOpen: false,
    density: "comfortable",
};

export const densityOf = (layout) => (DENSITIES.some(([k]) => k === layout?.density) ? layout.density : DEFAULT_LAYOUT.density);

export const LIMITS = { libW: [200, 480], slidesW: [200, 520], rightW: [280, 520], camadasH: [120, 600] };

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
        return { ...DEFAULT_LAYOUT, ...saved, hidden: { ...(saved.hidden || {}) }, collapsed: { ...(saved.collapsed || {}) } };
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
