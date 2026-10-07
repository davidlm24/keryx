// The console's layout: which modules are shown, which are collapsed, and
// the splitter sizes. Saved per operator profile in localStorage; "Restaurar
// layout" returns to DEFAULT_LAYOUT.

export const MODULES = [
    ["lib", "Biblioteca"],
    ["slides", "Slides"],
    ["camadas", "Camadas"],
    ["roteiro", "Roteiro"],
    ["tl", "Linha do tempo"],
];

export const DEFAULT_LAYOUT = {
    hidden: {},
    collapsed: {},
    libW: 300,
    slidesW: 320,
    rightW: 360,
    camadasH: 300,
    tlOpen: false,
};

export const LIMITS = { libW: [200, 480], slidesW: [200, 520], rightW: [280, 520], camadasH: [120, 600] };

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
