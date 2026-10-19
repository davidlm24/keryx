// Per-output settings (Configurações › Telas e saídas, OutputPref rows): what
// one output shows and how, on top of the live state every screen shares.
// One row per output page ("/Projection", "/LyricProjection", ...): the
// desktop window and a network screen showing the same page share it. No row,
// or a row with nothing set, is the output exactly as before.
import { outputView, RAIL_VIEWS, OUTPUT_NAMES } from "./network/views.js";
import { themeBackgroundArgs } from "./console/themes.js";
import { normalizeLayout, findLayout } from "./layouts.js";
import { contentType } from "./contentKinds.js";

// Conteúdo: which view of the live state the output draws (views.js).
export const PREF_CONTENTS = [
    { id: "", name: "Padrão da página" },
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
// keeps playing when its words are hidden. Built from the one list of
// content kinds (src/lib/contentKinds.js, Rodada G5); the ids are the saved
// ones (OutputPref.hidden_kinds), so pictures and videos stay one entry
// ("media") and the avisos keep their layer's name.
const showKind = (typeId, id = typeId) => {
    const t = contentType(typeId);
    return t.layer === "content" ? { id, name: t.short, layer: t.layer, kind: t.kinds[0] } : { id, name: t.short, layer: t.layer };
};
export const SHOW_KINDS = [
    showKind("lyrics"),
    showKind("bible"),
    showKind("text"),
    { id: "media", name: "Imagens e vídeos", layer: "media" },
    // A PDF's pages (Rodada F3): shown where Imagens e vídeos are.
    showKind("presentation"),
    showKind("tool"),
    showKind("notice", "communication"),
    showKind("alert"),
];
// The kinds each view can show at all (views.js): only those are offered.
// The Aviso rápido rides on every view (Rodada E3: one bar, every screen).
const VIEW_KINDS = {
    "/Projection": ["lyrics", "bible", "text", "media", "presentation", "tool", "communication", "alert"],
    "/LyricProjection": ["lyrics", "bible", "text", "alert"],
    "/VideoProjection": ["alert"],
    "/CommunicationProjection": ["alert"],
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
const STAGE_KIND = { lyrics: "lyrics", bible: "bible", text: "text", presentation: "presentation", media: "media", tool: "tool", piece: "communication" };
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
META["/StreamView"] = { name: OUTPUT_NAMES["/StreamView"], icon: "external" };
export const outputMeta = (path) => META[path] || { name: path, icon: "monitor" };
// The icons an output may pick (Configurações › Telas e saídas › Ajustes);
// every name exists in the design-system set.
export const ICON_CHOICES = ["projector", "tv", "monitor", "tablet", "film", "megaphone", "book", "image", "text", "star", "layers", "external"];
const ICON_RE = /^[a-z0-9-]{1,32}$/;
// The name and icon an output shows everywhere (the rail, Saídas, Telas e
// saídas, the network pages). `custom` is empty when the operator named
// nothing, and the surface keeps the factory name (shared/outputNames.json,
// one for every surface); `name` falls back to it.
export function outputLook(path, row) {
    const meta = outputMeta(path);
    const custom = typeof row?.name === "string" && row.name.trim() ? row.name.trim().slice(0, 40) : "";
    return {
        name: custom || meta.name,
        custom,
        icon: typeof row?.icon === "string" && ICON_RE.test(row.icon) ? row.icon : meta.icon,
    };
}

// Whether an output may pick a theme of its own. The main Projeção never
// does (it always follows the console); Letras, Vídeo and Avisos may.
export const ownsTheme = (page) => page !== "/Projection";

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
        // The Projeção has no theme of its own (owner 2026-10-14): it follows
        // the console. An old theme_id on its row stays in the database, unread.
        themeId: ownsTheme(row?.screen_path) && typeof row?.theme_id === "string" ? row.theme_id : "",
        // The screen's own drawing (owner 2026-10-13: each screen owns its
        // design; the layout catalog died). layoutId is only the old field,
        // read by designOf when design is empty.
        design: row?.design && typeof row.design === "object" && !Array.isArray(row.design) ? normalizeLayout({ ...row.design, id: "design", name: "" }) : null,
        layoutId: typeof row?.layout_id === "string" ? row.layout_id.slice(0, 80) : "",
        name: typeof row?.name === "string" ? row.name.trim().slice(0, 40) : "",
        icon: typeof row?.icon === "string" && ICON_RE.test(row.icon) ? row.icon : "",
        options: row?.options && typeof row.options === "object" && !Array.isArray(row.options) ? row.options : {},
    };
}

export const isDefaultPref = (p) => !p.content && !p.hidden?.length && p.scale === 1 && p.margin === 0 && p.showLogo && !p.themeId && !p.design && !p.layoutId && !p.name && !p.icon && !Object.keys(p.options || {}).length;
// The settings alone, the drawing aside: what "Restaurar padrão" puts back
// (the drawing stays; the Editor's "Voltar à página padrão" is for it).
export const isDefaultSettings = (p) => isDefaultPref({ ...p, design: null, layoutId: "" });

// The drawing this screen uses: its own design; else (an old save) the
// ScreenLayout row or factory layout its layout_id still names — the lazy
// migration, nothing written. Null = the page as before.
export function designOf(pref, layoutRows) {
    if (pref?.design) return pref.design;
    if (pref?.layoutId) return findLayout(pref.layoutId, layoutRows) || null;
    return null;
}

// Palco and Pastor draw their own layouts; OutputPref.options says which
// parts (Configurações › Telas e saídas › Ajustes). Missing keys are the
// screen as it always was.
export const STAGE_DEFAULTS = { chords: true, labels: true, clock: true, notes: true, next: true };
export const PASTOR_DEFAULTS = { chords: false, labels: false, clock: true, next_count: 3 };
const onOff = (v, d) => (typeof v === "boolean" ? v : d);
export const stageOptions = (pref) => ({
    chords: onOff(pref?.options?.chords, true),
    labels: onOff(pref?.options?.labels, true),
    clock: onOff(pref?.options?.clock, true),
    notes: onOff(pref?.options?.notes, true),
    next: onOff(pref?.options?.next, true),
});
export const pastorOptions = (pref) => {
    const n = Number(pref?.options?.next_count);
    return {
        chords: onOff(pref?.options?.chords, false),
        labels: onOff(pref?.options?.labels, false),
        clock: onOff(pref?.options?.clock, true),
        next_count: Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 3,
    };
};

// What a screen adds to a song's text (owner 2026-10-14): `chords`, the
// lyrics' [G] chords over the syllables, and `labels`, the part's name
// ([Refrão], [Ponte]…) over the slide. Each screen's own choice
// (OutputPref.options); the Palco shows both unless told otherwise, every
// other output neither (the congregation sees only the lyrics).
export function lyricsOptions(page, pref) {
    const on = page === "/StageView";
    return { chords: onOff(pref?.options?.chords, on), labels: onOff(pref?.options?.labels, on) };
}

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

// Aviso rápido (alert.show; Rodada E3, owner 2026-10-16): how each screen
// draws the bar — Posição (Alto | Baixo), Estilo (Faixa: the full width |
// Pílula: centred), the colours, Tamanho (P/M/G) and Entrada (Deslizar |
// Aparecer | Nenhuma). Flat `alert_*` keys of OutputPref.options; a missing
// or unknown key is the bar as the Projeção always drew it — AlertBar draws
// ALERT_DEFAULTS when the alert brings no look.
export const ALERT_DEFAULTS = { position: "top", style: "band", bg: "#f5a524", fg: "#1a1300", size: "m", entrance: "slide" };
// A screen whose bar starts elsewhere (owner 2026-10-16): the Palco puts it
// at the bottom, where its old pill sat — its header (title, Tom, BPM, the
// clock) is what the musicians read. Its Ajustes can still say Alto.
const PAGE_ALERT_DEFAULTS = { "/StageView": { position: "bottom" } };
export const alertDefaults = (page) => ({ ...ALERT_DEFAULTS, ...(PAGE_ALERT_DEFAULTS[page] || {}) });
const ALERT_CHOICES = { position: ["top", "bottom"], style: ["band", "pill"], size: ["s", "m", "l"], entrance: ["slide", "fade", "none"] };
const alertValue = (k, v) => {
    if (k === "bg" || k === "fg") return typeof v === "string" && HEX6.test(v) ? v.toLowerCase() : undefined;
    return ALERT_CHOICES[k]?.includes(v) ? v : undefined;
};
// One screen's bar: its own choices over its page's defaults.
export function alertOptions(pref, page) {
    const o = pref?.options || {};
    const d = alertDefaults(page);
    return Object.fromEntries(Object.keys(d).map((k) => [k, alertValue(k, o[`alert_${k}`]) ?? d[k]]));
}
// Whether a look is what AlertBar draws with none (ALERT_DEFAULTS), so the
// alert can go without one.
export const isDefaultAlert = (opts) => Object.keys(ALERT_DEFAULTS).every((k) => opts?.[k] === ALERT_DEFAULTS[k]);
// The options with their alert_* keys checked: a valid one kept (a colour
// in lower case), anything else dropped (the Exportar/Importar file).
export function cleanAlertOptions(options) {
    const o = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
        if (!k.startsWith("alert_")) { out[k] = v; continue; }
        const clean = alertValue(k.slice(6), v);
        if (clean !== undefined) out[k] = clean;
    }
    return out;
}
// Whether this screen draws the Aviso rápido at all: every renderer view
// (its Mostrar can still leave it out) and the Palco's own page; never the
// Pastor's or the Transmissão.
export function showsAlert(page, pref) {
    const kinds = VIEW_KINDS[prefViewKey(page, pref)];
    return kinds ? kinds.includes("alert") : page === "/StageView";
}
// The alert as this screen draws it (with its look), else null: for the
// pages that draw the bar over something of their own (the Palco, the
// Vídeo's clip). Renderer views get it from prefState.
export function alertOf(live, pref, page) {
    if (!live?.alert || pref?.hidden?.includes("alert")) return null;
    const look = alertOptions(pref, page);
    return isDefaultAlert(look) ? live.alert : { ...live.alert, look };
}

// The page view an output draws: its own, unless Conteúdo picks another.
export function prefViewKey(page, pref) {
    return PREF_CONTENTS.find((c) => c.id && c.id === pref?.content)?.view || page;
}

// The text look of a theme, only the keys it sets (a theme's empty key leaves
// the operator's choice in place).
const LOOK_KEYS = ["font_size", "font_family", "text_effect", "text_color", "text_color_2", "text_opacity", "text_max_width",
    "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge", "text_align", "text_position",
    "font_weight", "font_style", "letter_spacing", "text_outline_px", "text_outline_color"];
export const themeLook = (theme) => Object.fromEntries(LOOK_KEYS.filter((k) => theme?.[k] != null && theme[k] !== "").map((k) => [k, theme[k]]));

// What the output draws: the live state through the page's view, then the
// output's own logo and theme. `theme` is the ProjectionTheme row of themeId.
export function prefState(page, live, pref, theme = null) {
    let state = outputView(prefViewKey(page, pref), live);
    if (!state || !pref) return state;
    state = hideKinds(state, pref.hidden);
    // The Aviso rápido in this output's look (none set: the bar as always).
    if (state.alert) {
        const look = alertOptions(pref, page);
        if (!isDefaultAlert(look)) state = { ...state, alert: { ...state.alert, look } };
    }
    // The renderer draws chords and part names only where this output asks.
    if (state.content) {
        const show = lyricsOptions(page, pref);
        if (show.chords || show.labels) state = { ...state, content: { ...state.content, show } };
    }
    if (!pref.showLogo && state.logo?.visible) state = { ...state, logo: { ...state.logo, visible: false } };
    if (ownsTheme(page) && pref.themeId && theme) {
        // The output's theme wins over the song's parts too: their own looks go.
        if (state.content) state = { ...state, content: { ...state.content, style: { ...state.content.style, ...themeLook(theme) }, slides: (state.content.slides || []).map(({ style: _own, ...s }) => s) } };
        const bg = themeBackgroundArgs(theme);
        if (bg) state = { ...state, background: bg };
    }
    return state;
}

// Scale and margins reach the renderer as CSS variables on a wrapper
// (src/components/screen/output-prefs.css); null when both are the default.
export function prefVars(pref) {
    if (!pref || (pref.scale === 1 && pref.margin === 0)) return null;
    return { "--kp-text": String(pref.scale), "--kp-margin": `${pref.margin}cqw` };
}
