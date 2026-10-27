// Per-output settings (Configurações › Telas e saídas, OutputPref rows): what
// one output shows and how, on top of the live state every screen shares.
// One row per output page ("/Projection", "/LyricProjection", ...): the
// desktop window and a network screen showing the same page share it. No row,
// or a row with nothing set, is the output exactly as before.
import { RAIL_VIEWS, OUTPUT_NAMES } from "./network/views.js";
import { themeBackgroundArgs } from "./console/themeCore.js";
import { normalizeLayout, findLayout } from "./layouts.js";
import { RULE_KIND_IDS, TEXT_KINDS, ruleKind, ruleKindOf, stageRuleKind } from "./contentKinds.js";
import { mainLayer } from "../../shared/live-state.mjs";

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

// The old Mostrar (2026-10-12, OutputPref.hidden_kinds) and Conteúdo
// (OutputPref.content): read only by the lazy migration into the rule below
// (ruleOf). The ids are the saved ones, so pictures and videos stay one entry
// ("media") and the avisos keep their layer's name.
const HIDDEN_KINDS = {
    lyrics: ["lyrics"], bible: ["bible"], text: ["text"], media: ["image", "video", "youtube"],
    presentation: ["presentation"], tool: ["tool"], communication: ["notice"], alert: [],
};
const HIDDEN_IDS = Object.keys(HIDDEN_KINDS);

// "O que esta tela recebe" (Rodada H2 / G10, owner 2026-10-19): ONE content
// rule per output, the same list of kinds on every output
// (src/lib/contentKinds.js RULE_KINDS), saved as OutputPref.content_rule:
//   { kinds: [ids], top: { alert, logo }, empty: "wall" | "black" | "logo" }
//   - kinds: what the screen shows; anything else on air leaves it on what
//     is under it;
//   - top: the Aviso rápido and the Logo no canto go OVER whatever is shown
//     (the Logo is the Camadas layer; it replaces show_logo);
//   - empty: with nothing from the list on air, the screen shows the papel
//     de parede (as always), the Tela preta, or the Logo.
// No saved rule is the page's own (PAGE_RULES, what lyricView, videoView and
// noticeView drew) with the old Mostrar / Conteúdo / show_logo applied: no row
// or an old row draws the exact same screen as before.
export const RULE_SHORTCUTS = [
    { id: "all", name: "Tudo", kinds: RULE_KIND_IDS },
    { id: "letters", name: "Letra e Bíblia", kinds: TEXT_KINDS },
    { id: "videos", name: "Vídeos", kinds: ["video", "youtube"] },
    { id: "notices", name: "Avisos", kinds: ["notice"] },
];
export const RULE_EMPTY = [["wall", "Papel de parede"], ["black", "Tela preta"], ["logo", "Logo"]];
const PAGE_RULES = {
    "/Projection": { kinds: RULE_KIND_IDS, logo: true },
    "/LyricProjection": { kinds: TEXT_KINDS, logo: true },
    "/VideoProjection": { kinds: ["video", "youtube"], logo: false },
    "/CommunicationProjection": { kinds: ["notice"], logo: false },
};
// The rule a page starts with (the Palco, the Pastor and the Transmissão
// draw their own thing: their rule only carries the Aviso rápido).
export function defaultRule(page) {
    const base = PAGE_RULES[page];
    return { kinds: [...(base ? base.kinds : RULE_KIND_IDS)], top: { alert: true, logo: Boolean(base?.logo) }, empty: "wall" };
}
// A saved rule checked (kinds in the list's order, unknown ones dropped), else
// null = no rule saved.
export function normalizeRule(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray(raw.kinds)) return null;
    const top = raw.top && typeof raw.top === "object" && !Array.isArray(raw.top) ? raw.top : {};
    return {
        kinds: RULE_KIND_IDS.filter((id) => raw.kinds.includes(id)),
        top: { alert: top.alert !== false, logo: top.logo === true },
        empty: RULE_EMPTY.some(([id]) => id === raw.empty) ? raw.empty : "wall",
    };
}
// The rule of an output: the saved one, else the page's with the old fields
// (the lazy migration; nothing is written).
export function ruleOf(pref, page) {
    if (pref?.rule) return pref.rule;
    const base = defaultRule(prefViewKey(page, pref));
    const hidden = pref?.hidden || [];
    const gone = new Set(hidden.flatMap((id) => HIDDEN_KINDS[id] || []));
    return { kinds: base.kinds.filter((id) => !gone.has(id)), top: { alert: !hidden.includes("alert"), logo: base.top.logo && pref?.showLogo !== false }, empty: "wall" };
}
// The shortcut a rule's kinds are exactly, else "custom" (Personalizado).
export function ruleShortcut(rule) {
    const set = new Set(rule?.kinds || []);
    const hit = RULE_SHORTCUTS.find((s) => s.kinds.length === set.size && s.kinds.every((k) => set.has(k)));
    return hit ? hit.id : "custom";
}
// The short label of a rule: its shortcut's name, else "Personalizado" (the
// Multiview's quadrant label).
export function ruleLabel(rule) {
    const hit = RULE_SHORTCUTS.find((s) => s.id === ruleShortcut(rule));
    return hit ? hit.name : rule?.kinds?.length ? "Personalizado" : "Nada";
}
// One line: what the screen receives and what goes over it ("Letra e Bíblia ·
// por cima: Aviso rápido"); a custom list names its kinds.
export function ruleSummary(rule) {
    const hit = RULE_SHORTCUTS.find((s) => s.id === ruleShortcut(rule));
    const names = (rule?.kinds || []).map((id) => ruleKind(id).label);
    const what = hit ? hit.name : names.length ? `Personalizado: ${names.length > 3 ? `${names.length} tipos` : names.join(", ")}` : "Nada";
    const top = [rule?.top?.alert && "Aviso rápido", rule?.top?.logo && "Logo"].filter(Boolean);
    return what + (top.length ? ` · por cima: ${top.join(", ")}` : "");
}

// The live state as an output with this rule draws it: the layers whose kind
// is not in the list go (a song's playback track keeps playing when its words
// do not), the Aviso rápido and the Logo follow "Por cima de tudo", and with
// nothing from the list on air the screen is the Tela preta or the Logo if the
// rule says so. The console's own Tela preta and Logo reach the screens that
// ever showed them (a screen of avisos only ignored both, a screen of videos
// only the Logo: lyricView, videoView and noticeView before this rule). The
// same object back when nothing changes.
export function applyRule(state, rule) {
    if (!state || !rule) return state;
    const has = (id) => rule.kinds.includes(id);
    const out = (layer, item) => { const k = ruleKindOf(layer, item); return k && !has(k); };
    const patch = {};
    if (state.content && out("content", state.content)) {
        patch.content = null;
        // The words go; a song's playback track stays where text kinds are
        // received (ScreenRenderer plays `track`), never on a screen of videos
        // or avisos alone.
        if (state.content.audio && TEXT_KINDS.some(has)) patch.track = { src: state.content.audio, startedAt: state.content.startedAt };
    }
    if (state.media && out("media", state.media)) patch.media = null;
    if (state.video && out("video", state.video)) patch.video = null;
    if (state.communication && !has("notice")) patch.communication = null;
    if (state.tool && !has("tool")) patch.tool = null;
    if (state.alert && !rule.top.alert) patch.alert = null;
    if (state.logo?.visible && !rule.top.logo) patch.logo = { ...state.logo, visible: false };
    if (state.overlays?.length && !TEXT_KINDS.some(has)) patch.overlays = [];
    const only = (ids) => rule.kinds.length > 0 && rule.kinds.every((k) => ids.includes(k));
    if (state.screen === "black" && only(["notice"])) patch.screen = "show";
    if (state.screen === "logo" && only(["video", "youtube", "notice"])) patch.screen = "show";
    const next = Object.keys(patch).length ? { ...state, ...patch } : state;
    if (rule.empty !== "wall" && !next.video && mainLayer(next) === "none") return { ...next, screen: rule.empty };
    return next;
}

// Whether a rule receives avisos and nothing else (the Avisos screen's example in
// a still with no aviso on air).
export const noticeOnly = (rule) => Boolean(rule?.kinds?.length) && rule.kinds.every((k) => k === "notice");

// The rule with a shortcut's kinds (the Editor's atalhos, the Saídas popover
// and the Multiview's quadrants, owner 2026-10-27, S1/S2 = A): what goes over
// everything and Sem item da lista stay as they were.
export function ruleWithShortcut(rule, id) {
    const s = RULE_SHORTCUTS.find((x) => x.id === id);
    return s ? { ...rule, kinds: [...s.kinds] } : rule;
}
// The rule receiving `kind` too (the Prévia's "Mostrar … também", P1 = A).
export function ruleWithKind(rule, kind) {
    if (!RULE_KIND_IDS.includes(kind) || rule.kinds.includes(kind)) return rule;
    return { ...rule, kinds: RULE_KIND_IDS.filter((id) => id === kind || rule.kinds.includes(id)) };
}

// What a screen shows instead of what its rule leaves out.
export const RULE_INSTEAD = { wall: "o papel de parede", black: "a tela preta", logo: "o logo" };

// Whether an output that normally shows `kind` (its page's own rule) leaves
// it out by its rule: the one test behind every warning, so a Vídeo screen
// without lyrics by design never warns. Palco, Pastor and Transmissão draw
// their own thing: never.
export const leavesOut = (page, rule, kind) => PREF_OUTPUTS.includes(page) && Boolean(kind) && defaultRule(page).kinds.includes(kind) && !(rule?.kinds || []).includes(kind);

// The rule kinds of what fills the screens now (the text, a picture or
// video, the video channel, a tool, an aviso); none under Tela preta or the
// Logo, which every screen shows.
export function airKinds(live) {
    if (!live || live.screen === "black" || live.screen === "logo") return [];
    const out = [];
    for (const layer of ["content", "media", "video", "tool", "communication"]) {
        const k = ruleKindOf(layer, live[layer]);
        if (k && !out.includes(k)) out.push(k);
    }
    return out;
}

// What of the air an output leaves out by its rule, or null:
// { kind, label, instead } (the Multiview's quadrant, P3 = A).
export function leftOutNow(page, rule, live) {
    const kind = airKinds(live).find((k) => leavesOut(page, rule, k));
    return kind ? { kind, label: ruleKind(kind).label, instead: RULE_INSTEAD[rule.empty] || RULE_INSTEAD.wall } : null;
}

// Every output that leaves out what is on air now, by its rule (the
// Programa's "em 1 de 2 telas", P2 = A). `rows` are the OutputPref rows.
// -> [{ page, name, kind, receives }]: the kind's name and the rule's.
export function outputsLeavingAir(live, rows = []) {
    return PREF_OUTPUTS.flatMap((page) => {
        const row = rows.find((r) => r?.screen_path === page) || null;
        const rule = ruleOf(normalizePref(row), page);
        const hit = leftOutNow(page, rule, live);
        return hit ? [{ page, name: outputLook(page, row).name, kind: hit.label, receives: ruleLabel(rule) }] : [];
    });
}

// The kinds on air a change of rule takes off a screen now (S3 = A: the
// toast says so, with Desfazer), by their names.
export function ruleDrops(before, after, live) {
    return airKinds(live).filter((k) => before.kinds.includes(k) && !after.kinds.includes(k)).map((k) => ruleKind(k).label);
}

// The outputs that normally show what is prepared and, by their rule, will
// not (the Prévia says so before it goes on air, with the fix: P1 = A).
// `rows` are the OutputPref rows. -> [{ page, name, kind, kindId, instead }]:
// the output's name, the kind's name and id and what the screen shows instead.
export function outputsNotShowing(stage, rows = []) {
    const kind = stageRuleKind(stage);
    if (!kind) return [];
    return PREF_OUTPUTS.flatMap((page) => {
        const row = rows.find((r) => r?.screen_path === page) || null;
        const rule = ruleOf(normalizePref(row), page);
        if (!leavesOut(page, rule, kind)) return [];
        return [{ page, name: outputLook(page, row).name, kind: ruleKind(kind).label, kindId: kind, instead: RULE_INSTEAD[rule.empty] }];
    });
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
    const hidden = Array.isArray(row?.hidden_kinds) ? HIDDEN_IDS.filter((id) => row.hidden_kinds.includes(id)) : [];
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
        // O que esta tela recebe: the saved rule, else null (ruleOf migrates
        // the old content / hidden / showLogo above, per page).
        rule: normalizeRule(row?.content_rule),
    };
}

export const isDefaultPref = (p) => !p.rule && !p.content && !p.hidden?.length && p.scale === 1 && p.margin === 0 && p.showLogo && !p.themeId && !p.design && !p.layoutId && !p.name && !p.icon && !Object.keys(p.options || {}).length;
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
// (its rule can still leave it out, "Por cima de tudo") and the Palco's own
// page; never the Pastor's or the Transmissão.
export function showsAlert(page, pref) {
    return PREF_OUTPUTS.includes(prefViewKey(page, pref)) || page === "/StageView";
}
// The alert as this screen draws it (with its look), else null: for the
// pages that draw the bar over something of their own (the Palco, the
// Vídeo's clip). Renderer views get it from prefState.
export function alertOf(live, pref, page) {
    if (!live?.alert || !ruleOf(pref, page).top.alert) return null;
    const look = alertOptions(pref, page);
    return isDefaultAlert(look) ? live.alert : { ...live.alert, look };
}

// The page view an output draws: its own, unless an old Conteúdo choice (a
// Palco or Pastor turned into a renderer view; no UI picks one any more) says
// another.
export function prefViewKey(page, pref) {
    return PREF_CONTENTS.find((c) => c.id && c.id === pref?.content)?.view || page;
}

// The text look of a theme, only the keys it sets (a theme's empty key leaves
// the operator's choice in place).
const LOOK_KEYS = ["font_size", "font_family", "text_effect", "text_color", "text_color_2", "text_opacity", "text_max_width",
    "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge", "text_align", "text_position",
    "font_weight", "font_style", "letter_spacing", "text_outline_px", "text_outline_color", "text_decoration", "text_justify"];
export const themeLook = (theme) => Object.fromEntries(LOOK_KEYS.filter((k) => theme?.[k] != null && theme[k] !== "").map((k) => [k, theme[k]]));

// What the output draws: the live state through the output's rule (what it
// receives), then its own look. `theme` is the ProjectionTheme row of themeId.
export function prefState(page, live, pref, theme = null) {
    pref = pref || normalizePref(null);
    let state = applyRule(live, ruleOf(pref, page));
    if (!state) return state;
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
