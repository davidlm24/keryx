// Per-output settings (Configurações › Telas e saídas, OutputPref rows): what
// one output shows and how, on top of the live state every screen shares.
// One row per output page ("/Projection", "/LyricProjection", ...): the
// desktop window and a network screen showing the same page share it. No row,
// or a row with nothing set, is the output exactly as before.
import { outputView, RAIL_VIEWS } from "./network/views.js";

// Conteúdo: which view of the live state the output draws (views.js).
export const PREF_CONTENTS = [
    { id: "", name: "Padrão da saída" },
    { id: "all", name: "Tudo (como a projeção)", view: "/Projection" },
    { id: "lyrics", name: "Só letras", view: "/LyricProjection" },
    { id: "video", name: "Só vídeo", view: "/VideoProjection" },
    { id: "notices", name: "Só avisos", view: "/CommunicationProjection" },
];

// The outputs drawn by ScreenRenderer, the ones these settings apply to.
export const PREF_OUTPUTS = ["/Projection", "/LyricProjection", "/VideoProjection", "/CommunicationProjection"];

// Every output's factory name and icon: the rail's list (views.js) plus
// Transmissão, which only exists on the network. "No row" means these.
const META = Object.fromEntries(RAIL_VIEWS.map((v) => [v.key, { name: v.name, icon: v.icon }]));
META["/StreamView"] = { name: "Transmissão", icon: "external" };
export const outputMeta = (path) => META[path] || { name: path, icon: "monitor" };
// The icons an output may pick (Configurações › Telas e saídas › Ajustes);
// every name exists in the design-system set.
export const ICON_CHOICES = ["projector", "tv", "monitor", "tablet", "film", "megaphone", "book", "image", "text", "star", "layers", "external"];
const ICON_RE = /^[a-z0-9-]{1,32}$/;
// The name and icon an output shows everywhere (the rail, Saídas, Telas e
// saídas, the network pages). Each surface has its own factory label
// ("Projeção principal" on the window row, "Projeção" on the rail), so
// `custom` is empty when the operator named nothing and the surface keeps
// its own label; `name` falls back to the rail's.
export function outputLook(path, row) {
    const meta = outputMeta(path);
    const custom = typeof row?.name === "string" && row.name.trim() ? row.name.trim().slice(0, 40) : "";
    return {
        name: custom || meta.name,
        custom,
        icon: typeof row?.icon === "string" && ICON_RE.test(row.icon) ? row.icon : meta.icon,
    };
}

export const SCALE_RANGE = [80, 140];
export const MARGIN_RANGE = [0, 10];

const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => (v === "" || v == null || !Number.isFinite(Number(v)) ? fallback : Number(v));

// A row as settings: anything missing or out of range falls back to the default.
export function normalizePref(row) {
    const content = PREF_CONTENTS.some((c) => c.id && c.id === row?.content) ? row.content : "";
    return {
        content,
        scale: clamp(Math.round(num(row?.text_scale, 100)), SCALE_RANGE) / 100,
        margin: clamp(num(row?.margin_pct, 0), MARGIN_RANGE),
        showLogo: row?.show_logo !== false,
        themeId: typeof row?.theme_id === "string" ? row.theme_id : "",
        name: typeof row?.name === "string" ? row.name.trim().slice(0, 40) : "",
        icon: typeof row?.icon === "string" && ICON_RE.test(row.icon) ? row.icon : "",
    };
}

export const isDefaultPref = (p) => !p.content && p.scale === 1 && p.margin === 0 && p.showLogo && !p.themeId && !p.name && !p.icon;

// The page view an output draws: its own, unless Conteúdo picks another.
export function prefViewKey(page, pref) {
    return PREF_CONTENTS.find((c) => c.id && c.id === pref?.content)?.view || page;
}

// The text look of a theme, only the keys it sets (a theme's empty key leaves
// the operator's choice in place).
const LOOK_KEYS = ["font_size", "font_family", "text_effect", "text_color", "text_color_2", "text_opacity", "text_max_width",
    "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge"];
export const themeLook = (theme) => Object.fromEntries(LOOK_KEYS.filter((k) => theme?.[k] != null && theme[k] !== "").map((k) => [k, theme[k]]));

// What the output draws: the live state through the page's view, then the
// output's own logo and theme. `theme` is the ProjectionTheme row of themeId.
export function prefState(page, live, pref, theme = null) {
    let state = outputView(prefViewKey(page, pref), live);
    if (!state || !pref) return state;
    if (!pref.showLogo && state.logo?.visible) state = { ...state, logo: { ...state.logo, visible: false } };
    if (pref.themeId && theme) {
        if (state.content) state = { ...state, content: { ...state.content, style: { ...state.content.style, ...themeLook(theme) } } };
        if (theme.background_image) {
            const look = Object.fromEntries([["fit", theme.background_fit], ["dim", theme.background_dim], ["blur", theme.background_blur]].filter(([, v]) => v != null && v !== ""));
            state = { ...state, background: { kind: "image", value: theme.background_image, title: theme.name || "", ...look } };
        }
    }
    return state;
}

// Scale and margins reach the renderer as CSS variables on a wrapper
// (src/components/screen/output-prefs.css); null when both are the default.
export function prefVars(pref) {
    if (!pref || (pref.scale === 1 && pref.margin === 0)) return null;
    return { "--kp-text": String(pref.scale), "--kp-margin": `${pref.margin}cqw` };
}
