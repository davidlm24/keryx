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

// Mostrar (2026-10-12, as in Holyrics): the kinds of content an output can
// leave out, on top of its page's view. Each is a live-state layer, or a
// kind of the content layer. A hidden kind on air leaves the output on what
// is under it (another layer, else the idle look); a song's playback track
// keeps playing when its words are hidden.
export const SHOW_KINDS = [
    { id: "lyrics", name: "Letras", layer: "content", kind: "lyrics" },
    { id: "bible", name: "Bíblia", layer: "content", kind: "bible" },
    { id: "text", name: "Texto", layer: "content", kind: "text" },
    { id: "media", name: "Imagens e vídeos", layer: "media" },
    { id: "tool", name: "Relógio e timer", layer: "tool" },
    { id: "communication", name: "Avisos", layer: "communication" },
    { id: "alert", name: "Aviso rápido", layer: "alert" },
];
// The kinds each view can show at all (views.js): only those are offered.
const VIEW_KINDS = {
    "/Projection": ["lyrics", "bible", "text", "media", "tool", "communication", "alert"],
    "/LyricProjection": ["lyrics", "bible", "text", "alert"],
    "/VideoProjection": [],
    "/CommunicationProjection": [],
};
export const showKindsFor = (page, pref) => {
    const ids = VIEW_KINDS[prefViewKey(page, pref)] || [];
    return SHOW_KINDS.filter((k) => ids.includes(k.id));
};

// The live state without the kinds an output hides. The same object back when
// nothing is hidden or nothing hidden is on air.
export function hideKinds(state, hidden) {
    if (!state || !hidden?.length) return state;
    let out = state;
    const drop = (layer) => { if (out[layer]) out = { ...out, [layer]: null }; };
    for (const k of SHOW_KINDS) {
        if (!hidden.includes(k.id)) continue;
        if (k.layer !== "content") drop(k.layer);
        else if (out.content?.kind === k.kind) {
            // The words go; a song's playback track stays (ScreenRenderer plays `track`).
            const { audio, startedAt } = out.content;
            out = { ...out, content: null, ...(audio ? { track: { src: audio, startedAt } } : {}) };
        }
    }
    return out;
}

// A prepared stage (src/lib/console/stage.js) on an output that hides its
// kind: the kind's name, else null. A stage kind with no Mostrar entry
// (audio, the video channel) is never hidden.
const STAGE_KIND = { lyrics: "lyrics", bible: "bible", text: "text", media: "media", tool: "tool", piece: "communication" };
export function stageHidden(stageKind, pref) {
    const id = STAGE_KIND[stageKind];
    return id && pref?.hidden?.includes(id) ? SHOW_KINDS.find((k) => k.id === id).name : null;
}

// What an output would leave out of a state: the name of the hidden kind on
// air there (the console's Prévia says "A saída X não mostra …"), else null.
export function hiddenOnAir(state, pref) {
    if (!state || !pref?.hidden?.length) return null;
    const k = SHOW_KINDS.find((x) => pref.hidden.includes(x.id) && (x.layer === "content" ? state.content?.kind === x.kind : Boolean(state[x.layer])));
    return k ? k.name : null;
}

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
    const known = SHOW_KINDS.map((k) => k.id);
    const hidden = Array.isArray(row?.hidden_kinds) ? known.filter((id) => row.hidden_kinds.includes(id)) : [];
    return {
        content,
        hidden,
        scale: clamp(Math.round(num(row?.text_scale, 100)), SCALE_RANGE) / 100,
        margin: clamp(num(row?.margin_pct, 0), MARGIN_RANGE),
        showLogo: row?.show_logo !== false,
        themeId: typeof row?.theme_id === "string" ? row.theme_id : "",
        name: typeof row?.name === "string" ? row.name.trim().slice(0, 40) : "",
        icon: typeof row?.icon === "string" && ICON_RE.test(row.icon) ? row.icon : "",
        options: row?.options && typeof row.options === "object" && !Array.isArray(row.options) ? row.options : {},
    };
}

export const isDefaultPref = (p) => !p.content && !p.hidden?.length && p.scale === 1 && p.margin === 0 && p.showLogo && !p.themeId && !p.name && !p.icon && !Object.keys(p.options || {}).length;

// Palco and Pastor draw their own layouts; OutputPref.options says which
// parts (Configurações › Telas e saídas › Ajustes). Missing keys are the
// screen as it always was.
export const STAGE_DEFAULTS = { chords: true, clock: true, notes: true, next: true };
export const PASTOR_DEFAULTS = { clock: true, next_count: 3 };
const onOff = (v, d) => (typeof v === "boolean" ? v : d);
export const stageOptions = (pref) => ({
    chords: onOff(pref?.options?.chords, true),
    clock: onOff(pref?.options?.clock, true),
    notes: onOff(pref?.options?.notes, true),
    next: onOff(pref?.options?.next, true),
});
export const pastorOptions = (pref) => {
    const n = Number(pref?.options?.next_count);
    return { clock: onOff(pref?.options?.clock, true), next_count: Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 3 };
};

// Transmissão (/StreamView): the band of the lower third. Missing keys are
// the band as it always was.
export const STREAM_DEFAULTS = { band: "#0a0a0c", band_opacity: 0.78, size: "auto", position: "bottom", show_ref: true };
const HEX6 = /^#[0-9a-f]{6}$/i;
export function streamOptions(pref) {
    const o = pref?.options || {};
    const op = Number(o.band_opacity);
    return {
        band: typeof o.band === "string" && HEX6.test(o.band) ? o.band.toLowerCase() : STREAM_DEFAULTS.band,
        band_opacity: o.band_opacity != null && o.band_opacity !== "" && Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : STREAM_DEFAULTS.band_opacity,
        size: ["auto", "s", "m", "l"].includes(o.size) ? o.size : "auto",
        position: ["bottom", "middle", "top"].includes(o.position) ? o.position : "bottom",
        show_ref: onOff(o.show_ref, true),
    };
}
// The band's background, rgba from the colour and the opacity (the page
// itself stays transparent for OBS).
export function bandBackground(opts) {
    const hex = opts.band.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${opts.band_opacity})`;
}

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
    state = hideKinds(state, pref.hidden);
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
