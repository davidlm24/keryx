// Layouts das telas: what a stage monitor or the pastor's tablet draws and
// where, designed by the operator on a canvas (ScreenEditor) and drawn by
// LayoutRenderer on the output, on a network screen, in the console's Prévia
// rail and in the editor itself, all from the same description. Each screen
// owns its design (OutputPref.design, outputPrefs.js designOf; the old
// layout_id still reads); ScreenLayout rows are the church's models to start
// from (layoutEditor.js, Rodada P).
//
// A layout is a 16:9 canvas with elements placed in % of the screen (x, y,
// w, h), each with a rule for when it shows, a text look (size in cqmin,
// font, weight, colour, alignment) and the options of its type. Pure (no
// React, tested in layouts.test.mjs): the renderer and the editor only draw.
import { toolTime, slideProgress } from "../../shared/live-state.mjs";
import { captionParts, airFor } from "./console/caption.js";

export const LAYOUT_CATEGORIES = [["palco", "Palco"], ["pastor", "Pastor"], ["publico", "Público"], ["outro", "Outros"]];
// When an element shows: always, only with content on air (a song, a
// passage, a text), only with a clock or timer on air, or only when nothing
// is on air (an idle clock, "Aguardando projeção").
export const WHEN = [["always", "Sempre"], ["content", "Com algo no ar"], ["tool", "Com relógio ou timer no ar"], ["idle", "Sem nada no ar"]];
// The same families every theme offers (FONT_MAP in deviceStyles); the
// screens' designs knew only three until the Rodada C (fase d2).
export const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["georgia", "Georgia"], ["times", "Times"], ["arial", "Arial"], ["verdana", "Verdana"], ["mono", "Monoespaçada"], ["cursive", "Cursiva"]];
export const ALIGNS = [["left", "Esq."], ["center", "Centro"], ["right", "Dir."]];
export const VALIGNS = [["top", "Topo"], ["middle", "Meio"], ["bottom", "Base"]];
// What a Próximo slide element shows: the text and a PDF's page, or one of them.
export const NEXT_SHOWS = [["both", "Texto e página"], ["text", "Só texto"], ["page", "Só página"]];
export const SIZE_RANGE = [1, 30];
export const MIN_SIDE = 2;
export const MAX_ELEMENTS = 40;

// The kinds of element, with the defaults a new one gets. `text` elements
// are one string drawn by the renderer (elementText); the others draw
// themselves (a list, chords, the projection's monitor, dots, pictures).
// `group` sorts the editor's Adicionar picker (ELEMENT_GROUPS); each type's
// one-line hint there is the editor's (layoutEditor.js ELEMENT_HINTS), so the
// outputs that draw a layout never load the editor's words.
export const ELEMENT_TYPES = [
    { id: "screen", name: "Projeção", icon: "projector", group: "tela", w: 100, h: 100, size: 2, when: "always", props: {} },
    { id: "clock", name: "Hora", icon: "clock", group: "tempo", w: 20, h: 10, size: 6, when: "always", props: { seconds: false } },
    { id: "date", name: "Data", icon: "clock", group: "tempo", w: 30, h: 6, size: 2.2, when: "always", props: {} },
    { id: "timer", name: "Relógio ou timer no ar", icon: "clock", group: "tempo", w: 30, h: 14, size: 8, when: "tool", props: {} },
    { id: "service_time", name: "Tempo de culto", icon: "clock", group: "tempo", w: 20, h: 6, size: 2.4, when: "always", label: "Culto há", props: {} },
    { id: "air_for", name: "No ar há", icon: "history", group: "tempo", w: 16, h: 6, size: 2.4, when: "always", label: "No ar há", props: {} },
    { id: "air_title", name: "O que está no ar", icon: "eye", group: "setlist", w: 40, h: 6, size: 3, when: "always", label: "No ar", props: {} },
    { id: "church", name: "Igreja", icon: "logo", group: "tela", w: 40, h: 8, size: 2.6, when: "always", props: {} },
    { id: "title", name: "Título da música", icon: "music", group: "musica", w: 50, h: 10, size: 4.2, weight: "bold", when: "content", props: { artist: true } },
    { id: "current", name: "Letra atual", icon: "text", group: "musica", w: 60, h: 50, size: 7.4, weight: "bold", align: "center", valign: "middle", when: "content", props: { chords: true } },
    { id: "next", name: "Próximo slide", icon: "list", group: "musica", w: 94, h: 12, size: 3, when: "content", label: "Próximo", props: { show: "both" } },
    { id: "part", name: "Nome da parte", icon: "music", group: "musica", w: 13, h: 8, size: 3, weight: "bold", when: "content", label: "Parte", props: {} },
    { id: "next_items", name: "Próximos da Setlist", icon: "list", group: "setlist", w: 30, h: 60, size: 2.8, when: "always", label: "Próximo", props: { count: 3 } },
    { id: "song_key", name: "Tom", icon: "music", group: "musica", w: 9, h: 10, size: 3.4, weight: "bold", when: "content", label: "Tom", box: true, props: {} },
    { id: "bpm", name: "BPM", icon: "music", group: "musica", w: 9, h: 10, size: 3.4, weight: "bold", when: "content", label: "BPM", box: true, props: {} },
    { id: "song_time", name: "Tempo na música", icon: "clock", group: "musica", w: 12, h: 10, size: 3.4, weight: "bold", when: "content", label: "Na música", box: true, props: {} },
    { id: "chords", name: "Cifra", icon: "music", group: "musica", w: 31, h: 50, size: 2.2, font: "mono", when: "content", label: "Cifra", box: true, props: {} },
    { id: "notes", name: "Notas para músicos", icon: "edit", group: "musica", w: 94, h: 8, size: 2.4, when: "content", props: {} },
    { id: "monitor", name: "Monitor da projeção", icon: "projector", group: "tela", w: 60, h: 58, size: 2, when: "always", props: { chords: false, labels: false } },
    { id: "progress", name: "Progresso dos slides", icon: "dot", group: "setlist", w: 94, h: 3, size: 1, when: "content", props: { line: false } },
    { id: "logo", name: "Logo da igreja", icon: "logo", group: "tela", w: 10, h: 16, size: 2, when: "always", props: {} },
    { id: "text", name: "Texto fixo", icon: "text", group: "tela", w: 40, h: 8, size: 3, when: "always", props: { text: "Texto" } },
    { id: "image", name: "Imagem", icon: "image", group: "tela", w: 30, h: 30, size: 2, when: "always", props: { url: "" } },
    // A strip from edge to edge behind other elements (owner 2026-11-12,
    // "Editor de telas · Palco"): drawn only while it carries something.
    { id: "band", name: "Faixa", icon: "rows", group: "tela", w: 100, h: 10, size: 2, when: "content", props: {} },
];
export const typeOf = (id) => ELEMENT_TYPES.find((t) => t.id === id) || null;
// The Adicionar picker's groups, in its order.
export const ELEMENT_GROUPS = [["tempo", "Tempo"], ["musica", "Música"], ["setlist", "Setlist"], ["tela", "Tela"]];
// The elements drawn as one string (elementText).
export const TEXT_TYPES = new Set(["clock", "date", "timer", "service_time", "air_for", "air_title", "church", "title", "next", "song_key", "bpm", "song_time", "notes", "text", "part"]);
// The elements whose panel shows the text look (Rótulo, tamanho, fonte, cor,
// alinhamento, caixa): the string ones plus the blocks that draw text
// themselves. The others (Projeção, monitor, logo, imagem, progresso) only
// take position, size and the "Aparece" rule — the editor must not offer
// fields the renderer ignores.
export const LOOK_TYPES = new Set([...TEXT_TYPES, "current", "chords", "next_items"]);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, d) => (v === "" || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const round1 = (n) => Math.round(n * 10) / 10;
const HEX6 = /^#[0-9a-f]{6}$/i;
const oneOf = (v, choices, d) => (choices.some(([k]) => k === v) ? v : d);
const onOff = (v, d) => (typeof v === "boolean" ? v : d);
const newId = () => `el_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
// A number in a range, or "" (unset: the screen's own).
const optNum = (v, lo, hi) => (v === "" || v == null || !Number.isFinite(Number(v)) ? "" : clamp(Number(v), lo, hi));

// An element as the renderer draws it: every field present and in range.
export function normalizeElement(raw) {
    const t = typeOf(raw?.type);
    if (!t) return null;
    const w = clamp(round1(num(raw.w, t.w)), MIN_SIDE, 100);
    const h = clamp(round1(num(raw.h, t.h)), MIN_SIDE, 100);
    const props = { ...t.props };
    for (const k of Object.keys(t.props)) {
        const v = raw.props?.[k];
        if (typeof t.props[k] === "boolean") props[k] = onOff(v, t.props[k]);
        else if (typeof t.props[k] === "number") props[k] = clamp(Math.round(num(v, t.props[k])), 0, 10);
        else props[k] = typeof v === "string" ? v.slice(0, k === "url" ? 2000 : 400) : t.props[k];
    }
    if (t.id === "next" && !NEXT_SHOWS.some(([k]) => k === props.show)) props.show = "both";
    return {
        id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : newId(),
        type: t.id,
        x: clamp(round1(num(raw.x, 0)), 0, 100 - w),
        y: clamp(round1(num(raw.y, 0)), 0, 100 - h),
        w, h,
        when: oneOf(raw.when, WHEN, t.when || "always"),
        label: typeof raw.label === "string" ? raw.label.slice(0, 24) : (t.label || ""),
        size: clamp(round1(num(raw.size, t.size)), SIZE_RANGE[0], SIZE_RANGE[1]),
        color: typeof raw.color === "string" && HEX6.test(raw.color) ? raw.color.toLowerCase() : "",
        font: oneOf(raw.font, FONTS, t.font || "sans"),
        weight: raw.weight === "bold" || (raw.weight == null && t.weight === "bold") ? "bold" : "normal",
        align: oneOf(raw.align, ALIGNS, t.align || "left"),
        valign: oneOf(raw.valign, VALIGNS, t.valign || "top"),
        box: onOff(raw.box, Boolean(t.box)),
        // "Rótulo ao lado": RÓTULO valor on one line, "…" past the box.
        inline: onOff(raw.inline, false),
        // "Ocupa o lugar vazio": on the screen it takes the room of the
        // neighbours that are not drawn now (grownRect).
        grow: onOff(raw.grow, false),
        // The full package (owner's pick, Rodada C fase d2): an element can
        // be hidden without losing its place, and faded.
        hidden: onOff(raw.hidden, false),
        opacity: clamp(num(raw.opacity, 1), 0.1, 1),
        // The text bar's look (Rodada P, P8-3), in the theme's keys so the
        // renderer reads them with typography() (deviceStyles.js); "" = unset.
        font_style: raw.font_style === "italic" ? "italic" : "",
        text_decoration: raw.text_decoration === "underline" ? "underline" : "",
        text_case: raw.text_case === "upper" || raw.text_case === "capitalize" ? raw.text_case : "",
        text_justify: raw.text_justify === "justify" ? "justify" : "",
        line_height: optNum(raw.line_height, 0.9, 2),
        letter_spacing: optNum(raw.letter_spacing, -0.1, 0.5),
        text_outline_px: Math.round(optNum(raw.text_outline_px, 0, 8) || 0) || "",
        text_outline_color: typeof raw.text_outline_color === "string" && HEX6.test(raw.text_outline_color) ? raw.text_outline_color.toLowerCase() : "",
        props,
    };
}

// A new element of a type, at a spot (the canvas's centre by default).
export function newElement(type, at = null) {
    const t = typeOf(type);
    if (!t) return null;
    const x = at ? at.x - t.w / 2 : 50 - t.w / 2;
    const y = at ? at.y - t.h / 2 : 50 - t.h / 2;
    return normalizeElement({ type, x, y, w: t.w, h: t.h });
}

// A layout as the renderer and the editor use it. `id` is kept (a row, or a
// factory id); unknown elements are dropped, the rest clamped.
export function normalizeLayout(row) {
    const bg = row?.background && typeof row.background === "object" ? row.background : {};
    return {
        id: typeof row?.id === "string" ? row.id : "",
        name: typeof row?.name === "string" ? row.name.trim().slice(0, 60) : "",
        category: oneOf(row?.category, LAYOUT_CATEGORIES, "palco"),
        factory: Boolean(row?.factory),
        elements: (Array.isArray(row?.elements) ? row.elements : []).map(normalizeElement).filter(Boolean).slice(0, MAX_ELEMENTS),
        background: {
            color: typeof bg.color === "string" && HEX6.test(bg.color) ? bg.color.toLowerCase() : "",
            image: typeof bg.image === "string" ? bg.image.slice(0, 2000) : "",
            // The song's own background image behind everything, dimmed.
            song_image: onOff(bg.song_image, true),
            dim: clamp(num(bg.dim, 0.72), 0, 0.95),
        },
    };
}

// A fresh layout to edit.
export const newLayout = (category = "palco") => normalizeLayout({ name: "", category, elements: [], background: {} });
export const duplicateLayout = (layout) => normalizeLayout({ ...layout, id: "", factory: false, name: `${layout.name} (cópia)`.slice(0, 60), elements: layout.elements.map(({ id: _id, ...e }) => e) });

// What a row keeps of a layout (never ids or dates).
export const layoutFields = (layout) => ({ name: layout.name, category: layout.category, elements: layout.elements, background: layout.background });

// The factory layouts: the Palco and Pastor screens redrawn as layouts, so
// the operator starts from something that works (Duplicar makes a copy to
// edit). Never rows: always there, never deleted.
const el = (type, x, y, w, h, extra = {}) => ({ id: `f_${type}_${x}_${y}`, type, x, y, w, h, ...extra });
// The Palco's parts by the switches of its Ajustes (stageOptions): what each
// one hides while the Palco has no design of its own (outputPrefs pageDesign).
export const PALCO_PARTS = {
    chords: ["palco_chords"],
    labels: ["palco_part"],
    clock: ["palco_clock", "palco_song_time"],
    notes: ["palco_notes"],
    next: ["palco_next", "palco_next_page"],
};
// The Pastor's (pastorOptions): the Relógio hides the clock and the
// service's time; Próximos itens "Não" hides the list (its count is the
// list's count; Cifra and Nome da parte dress the monitor).
export const PASTOR_PARTS = {
    clock: ["pastor_clock", "pastor_service_time"],
    next: ["pastor_next"],
};
const chip = (id, type, x, w, extra = {}) => ({ id, type, x, y: 1, w, h: 8, size: 3, valign: "middle", inline: true, box: false, ...extra });
export const FACTORY_LAYOUTS = [
    normalizeLayout({
        id: "factory:palco", factory: true, name: "Palco (modelo)", category: "palco",
        background: { song_image: true, dim: 0.72 },
        elements: [
            // One drawing for the Palco (owner 2026-11-12, mockups "Palco
            // compacto" and "Editor de telas · Palco"): the screen with no
            // design of its own draws this, and the Editor shows it as it
            // is. A strip on top, edge to edge (title, then RÓTULO valor),
            // the lyrics with the most room, the next slide on one line in
            // a bar at the bottom with the dots beside it; no cards.
            { id: "palco_strip", type: "band", x: 0, y: 0, w: 100, h: 10 },
            chip("palco_title", "title", 3, 40, { size: 3.2, weight: "bold", label: "", props: { artist: true } }),
            chip("palco_part", "part", 44, 13),
            chip("palco_key", "song_key", 58, 7),
            chip("palco_bpm", "bpm", 66, 8),
            chip("palco_song_time", "song_time", 75, 11),
            chip("palco_clock", "clock", 87, 10, { size: 3.6, weight: "bold", label: "", align: "right", when: "content" }),
            { id: "palco_notes", type: "notes", x: 3, y: 11.5, w: 94, h: 6, size: 2.2, box: true, valign: "middle" },
            { id: "palco_current", type: "current", x: 3, y: 18, w: 61, h: 69, size: 7.4, weight: "bold", align: "center", valign: "middle", grow: true, props: { chords: true } },
            { id: "palco_chords", type: "chords", x: 66, y: 18, w: 31, h: 69 },
            { id: "palco_next_page", type: "next", x: 66, y: 18, w: 31, h: 69, size: 2.4, label: "Próxima", props: { show: "page" } },
            { id: "palco_bar", type: "band", x: 0, y: 89, w: 100, h: 11 },
            // The slides as segments along the bar's top edge, the time left at
            // its right (owner 2026-11-14, mockup "Pontos do Palco", P1 A, P2 A,
            // P3 B, P4 A1); under the Próximo so it never covers it.
            { id: "palco_progress", type: "progress", x: 0, y: 89, w: 100, h: 11, props: { line: true } },
            { id: "palco_next", type: "next", x: 3, y: 90, w: 80, h: 9, size: 4.2, weight: "bold", align: "left", valign: "middle", inline: true, label: "Próximo", props: { show: "text" } },
            el("clock", 20, 30, 60, 24, { size: 16, align: "center", valign: "middle", when: "idle" }),
            el("text", 20, 56, 60, 8, { size: 3, align: "center", when: "idle", props: { text: "Aguardando projeção" } }),
        ],
    }),
    normalizeLayout({
        id: "factory:pastor", factory: true, name: "Pastor (modelo)", category: "pastor",
        background: { song_image: false },
        elements: [
            // One drawing for the Pastor too (owner 2026-11-12, mockup
            // "Telas · fase 2", P = A): a strip on top with the church, the
            // date, the service's time and the clock; what is on air and how
            // long, the congregation's screen big, and the next items as a
            // list. Stable ids: PASTOR_PARTS and its switches name them.
            { id: "pastor_strip", type: "band", x: 0, y: 0, w: 100, h: 10 },
            chip("pastor_church", "church", 3, 36, { size: 3.2, weight: "bold" }),
            chip("pastor_date", "date", 40, 26, { size: 2.2, color: "#a19b90" }),
            chip("pastor_service_time", "service_time", 67, 17, { size: 2.6, align: "right", when: "always" }),
            chip("pastor_clock", "clock", 86, 11, { size: 4, weight: "bold", align: "right", when: "always" }),
            { id: "pastor_air", type: "air_title", x: 3, y: 12, w: 50, h: 6, size: 2.8, weight: "bold", valign: "middle", inline: true, label: "No ar" },
            { id: "pastor_air_for", type: "air_for", x: 54, y: 12, w: 12, h: 6, size: 2.2, align: "right", valign: "middle", inline: true, label: "Há" },
            { id: "pastor_monitor", type: "monitor", x: 3, y: 19, w: 63, h: 63 },
            { id: "pastor_progress", type: "progress", x: 3, y: 85, w: 63, h: 3 },
            { id: "pastor_next", type: "next_items", x: 69, y: 12, w: 28, h: 80, size: 2.6, label: "Próximo", props: { count: 3 } },
        ],
    }),
    // The projector as it is, with a clock or timer on air in the corner
    // instead of taking the whole screen (as Holyrics' panel).
    normalizeLayout({
        id: "factory:projecao", factory: true, name: "Projeção com timer no canto (modelo)", category: "publico",
        background: { song_image: false },
        elements: [
            el("screen", 0, 0, 100, 100),
            el("clock", 56, 70, 41, 7, { size: 2.6, align: "right", when: "tool", label: "Hora" }),
            el("timer", 56, 78, 41, 17, { size: 8, weight: "bold", align: "right", valign: "middle", when: "tool", box: true }),
        ],
    }),
    // The output's own view, full screen: Letras, Vídeo and Comunicação as
    // their pages draw themselves (Rodada E3: their start in the Editor; the
    // timer model would add a clock their views never show).
    normalizeLayout({
        id: "factory:tela", factory: true, name: "Projeção em tela cheia (modelo)", category: "publico",
        background: { song_image: false },
        elements: [el("screen", 0, 0, 100, 100)],
    }),
];
// The ready design a screen starts from in the Editor de telas, before it
// has one of its own: the Palco's and the Pastor's, the Projeção with the
// timer in the corner, every other output its view full screen.
const SEEDS = { "/StageView": "factory:palco", "/PastorView": "factory:pastor", "/Projection": "factory:projecao" };
export const seedLayoutId = (path) => SEEDS[path] || "factory:tela";
// A layout with a timer element shows the tool (clock, timer, texto livre)
// there, so its Projeção element leaves the full-screen tool layer out.
export const layoutHasTimer = (layout) => (layout?.elements || []).some((e) => e.type === "timer");

// The elements that count time (a clock, the date, a timer, the service's
// or the song's time, how long the item is on air): a still preview of a
// design ticks only when it has one (owner 2026-11-09: only the Programa
// moves; the rest of the console's previews are still frames).
export const TIME_TYPES = new Set(["clock", "date", "timer", "service_time", "air_for", "song_time"]);
export const layoutCountsTime = (layout) => (layout?.elements || []).some((e) => TIME_TYPES.has(e.type));
export const isFactoryId = (id) => typeof id === "string" && id.startsWith("factory:");

// The layout an id names: a factory one, or a row (normalized); null when
// the id is empty or names nothing (the output falls back to its page).
export function findLayout(id, rows = []) {
    if (!id) return null;
    const f = FACTORY_LAYOUTS.find((l) => l.id === id);
    if (f) return f;
    const row = (rows || []).find((r) => r?.id === id);
    return row ? normalizeLayout(row) : null;
}

// The choices of an output's Layout select: the page's own screen, the
// factory layouts, then the operator's by category.
export function layoutChoices(rows = []) {
    const own = (rows || []).map(normalizeLayout).filter((l) => l.id).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "pt-BR"));
    return [{ id: "", name: "Padrão da página" }, ...FACTORY_LAYOUTS.map((l) => ({ id: l.id, name: l.name })), ...own.map((l) => ({ id: l.id, name: l.name }))];
}

// ---- What the elements show ----
const two = (n) => String(n).padStart(2, "0");
export const hhmm = (ms, seconds = false) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}${seconds ? `:${two(d.getSeconds())}` : ""}`; };
// "0:42" or "1:02:05": a span of seconds.
export const formatSpan = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`);
// "00:03:00": what a tool shows.
const clockOf = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`; };
const upperFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// Everything the elements read, computed once per frame from the live state
// (and what the page adds: the Setlist's next items, the church). Pure.
export function layoutContext({ live, now, upcoming = [], hasService = false, church = null } = {}) {
    const content = live?.content || null;
    const slides = content ? (content.slides?.length ? content.slides : [{ text: "" }]) : [];
    const index = content ? Math.min(content.index || 0, slides.length - 1) : 0;
    const song = content ? { title: content.title, artist: content.artist, background_image: content.style?.background_image, ...(content.stage || {}) } : null;
    const session = live?.session || null;
    const tool = live?.tool || null;
    // The introduction (live-state's currentSlide/nextSlide): no slide on
    // screen yet, the first one next; "Letra atual" says "Introdução".
    const intro = Boolean(content?.intro);
    return {
        live, now, content, slides, index, song, intro,
        // How far the slide on air is through its time (null: nothing says).
        progress: slideProgress(live, now),
        presentation: content?.kind === "presentation",
        current: !content ? null : intro ? { text: "", label: "Introdução", intro: true } : slides[index] || null,
        next: !content ? null : intro ? slides[index] || null : slides[index + 1] || null,
        slideNote: content?.stage?.slide_notes?.[index] || "",
        elapsed: content?.startedAt ? Math.max(0, Math.floor((now - content.startedAt) / 1000)) : 0,
        running: session?.startedAt ? Math.max(0, Math.floor((now - session.startedAt) / 1000)) : null,
        tool,
        caption: captionParts(live),
        airFor: airFor(live, now),
        upcoming: Array.isArray(upcoming) ? upcoming : [],
        hasService: Boolean(hasService),
        church,
    };
}

// A presentation's page (a PDF's, Rodada F3): its picture when the slide is
// one, else "". "Letra atual" and "Próximo slide" draw it.
export const slidePage = (slide) => (slide && !slide.text && typeof slide.image_url === "string" ? slide.image_url : "");

// Whether an element shows now, by its rule.
export function elementVisible(el, ctx) {
    if (el.when === "content") return Boolean(ctx.content);
    if (el.when === "tool") return Boolean(ctx.tool);
    if (el.when === "idle") return !ctx.content && !ctx.tool;
    return true;
}

// The string a text element shows; "" when it has nothing to say (the
// renderer then draws nothing, not an empty box); undefined for the other
// types.
export function elementText(el, ctx) {
    const song = ctx.song || {};
    switch (el.type) {
        case "clock": return hhmm(ctx.now, el.props.seconds);
        case "date": return upperFirst(new Date(ctx.now).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
        case "timer": {
            const t = ctx.tool;
            if (!t) return "";
            if (t.mode === "freetext") return t.text || "";
            if (t.mode === "clock") return hhmm(ctx.now, true);
            return clockOf(toolTime(t, ctx.now));
        }
        case "service_time": return ctx.running == null ? "" : formatSpan(ctx.running);
        case "air_for": return ctx.airFor || "";
        case "air_title": return ctx.caption.title === "nada" ? "" : `${ctx.caption.title}${ctx.caption.pos ? ` · ${ctx.caption.pos}` : ""}`;
        case "church": return [ctx.church?.name, ctx.church?.city].filter(Boolean).join(" · ");
        case "title": {
            if (!ctx.content) return "";
            const sub = ctx.presentation ? "Apresentação" : el.props.artist ? song.artist : "";
            return `${song.title || (ctx.presentation ? "Apresentação" : "Música")}${sub ? `\n${sub}` : ""}`;
        }
        case "next": {
            if (!ctx.next || el.props.show === "page") return "";
            const t = ctx.next.text || "";
            return el.inline ? oneLine(t) : t;
        }
        case "part": return ctx.presentation ? `${ctx.index + 1}/${ctx.slides.length}` : ctx.current?.label || "";
        case "song_key": return song.song_key ? String(song.song_key) : "";
        case "bpm": return song.bpm ? String(song.bpm) : "";
        case "song_time": return ctx.content ? formatSpan(ctx.elapsed) : "";
        case "notes": return [song.musician_notes, ctx.slideNote].filter(Boolean).join("\n");
        case "text": return el.props.text || "";
        default: return undefined;
    }
}

// A slide's lines as one line ("…" past the box): the Palco's Próximo.
export const oneLine = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean).join(" / ");

// An element's label now: what the operator typed, else its type's; with a
// presentation on air the type's own words change ("No ar", "Página").
export function elementLabel(el, ctx) {
    const t = typeOf(el.type);
    if (!ctx?.presentation || el.label !== (t?.label || "")) return el.label;
    if (el.type === "song_time") return "No ar";
    if (el.type === "part") return "Página";
    return el.label;
}

// The next Setlist items an element lists.
export const elementItems = (el, ctx) => ctx.upcoming.slice(0, Math.max(1, el.props.count || 1));

// Whether an element has anything to draw now: a text element with a
// string, a chords block with chords, dots with more than one slide, a logo
// or image with a file. Empty, the renderer draws nothing (no empty box).
export function elementHasContent(el, ctx, extra = {}) {
    const { logoUrl = "" } = extra;
    // The next page of a presentation draws its picture (LayoutRenderer).
    if (el.type === "next") {
        const page = el.props.show !== "text" && Boolean(slidePage(ctx.next));
        return page || Boolean(elementText(el, ctx));
    }
    if (el.type === "band") return bandCarries(el, ctx, extra);
    if (TEXT_TYPES.has(el.type)) return Boolean(elementText(el, ctx));
    switch (el.type) {
        case "current": return Boolean(ctx.current);
        case "chords": return Boolean(ctx.song?.chords);
        case "progress": return ctx.slides.length > 1;
        case "logo": return Boolean(logoUrl);
        case "image": return Boolean(el.props.url);
        default: return true; // next_items says "Fim da setlist."; monitor and screen draw the idle look
    }
}

// A band carries an element whose centre is inside it: drawn only while
// one of them is (with nothing on air, or no next slide and one slide, the
// Palco's bar goes, as its page's did).
const inside = (o, b) => { const cx = o.x + o.w / 2, cy = o.y + o.h / 2; return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h; };
function bandCarries(band, ctx, extra) {
    return (extra.elements || []).some((o) => o.type !== "band" && o.id !== band.id && inside(o, band) && !o.hidden && elementVisible(o, ctx) && elementHasContent(o, ctx, extra));
}

// "Ocupa o lugar vazio" (owner 2026-11-12, E4): the rect a `grow` element
// takes now. Toward each side, over the neighbours beyond its edge that are
// not drawn (hidden, left out by their rule, empty), up to the farthest of
// them — at the canvas's edge keeping the gap it had — and never past a
// neighbour that is drawn, a band drawn included (the Palco's strip and
// bar: before, a drawn neighbour's DISTANCE was taken for its edge, and the
// lyrics grew up to 8,5 % over the strip, owner 2026-11-12). `isShown(el)`
// says which are.
const overlaps = (a0, a1, b0, b1) => a0 < b1 - 0.01 && b0 < a1 - 0.01;
export function grownRect(el, elements, isShown) {
    if (!el?.grow) return { x: el.x, y: el.y, w: el.w, h: el.h };
    let x0 = el.x, y0 = el.y, x1 = el.x + el.w, y1 = el.y + el.h;
    const all = (elements || []).filter((o) => o.id !== el.id);
    // What may be taken: elements not drawn (never a band: a band not drawn
    // has nothing in it to measure by). What stops it: anything drawn.
    const others = all.filter((o) => o.type !== "band");
    const walls = all.filter((o) => isShown(o));
    // `fwd`: growing toward higher coordinates (right, down). `lo`/`len`
    // read an element along the axis, `across` keeps those in its way.
    const side = (fwd, lo, len, across, from) => {
        const near = (o) => (fwd ? lo(o) : lo(o) + len(o));
        const far = (o) => (fwd ? lo(o) + len(o) : lo(o));
        const beyond = (o) => (fwd ? lo(o) >= from - 0.5 : lo(o) + len(o) <= from + 0.5);
        const empty = others.filter((o) => across(o) && beyond(o) && !isShown(o));
        if (!empty.length) return null;
        const gap = Math.max(0, Math.min(...empty.map((o) => Math.abs(near(o) - from))));
        let to = fwd ? Math.max(...empty.map(far)) : Math.min(...empty.map(far));
        if (fwd && to >= 99.9) to = 100 - gap;
        if (!fwd && to <= 0.1) to = gap;
        const wall = walls.filter((o) => across(o) && beyond(o));
        if (wall.length) to = fwd ? Math.min(to, Math.min(...wall.map(near)) - gap) : Math.max(to, Math.max(...wall.map(near)) + gap);
        return to;
    };
    const X = (o) => o.x, W = (o) => o.w, Y = (o) => o.y, H = (o) => o.h;
    const vert = (o) => overlaps(o.y, o.y + o.h, y0, y1);
    const right = side(true, X, W, vert, x1);
    if (right !== null && right > x1) x1 = right;
    const left = side(false, X, W, vert, x0);
    if (left !== null && left < x0) x0 = left;
    const horiz = (o) => overlaps(o.x, o.x + o.w, x0, x1);
    const down = side(true, Y, H, horiz, y1);
    if (down !== null && down > y1) y1 = down;
    const up = side(false, Y, H, horiz, y0);
    if (up !== null && up < y0) y0 = up;
    return { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0) };
}

// Where the Aviso rápido goes in a design (owner 2026-11-12): beside a band
// drawn at that edge — above the bar at the bottom, under the strip on top —
// and the elements whose edge meets that band (current, chords…) make room
// for it (`cut`). No band there: the whole screen, as before.
export function alertDock(elements, position = "top", isShown = () => true) {
    const bands = (elements || []).filter((e) => e.type === "band" && isShown(e));
    const content = (elements || []).filter((e) => e.type !== "band" && isShown(e));
    const bottom = position === "bottom";
    const b = bands.find((e) => (bottom ? e.y + e.h >= 99.5 : e.y <= 0.5));
    if (!b) return { top: 0, bottom: 0, cut: [] };
    const line = bottom ? b.y : b.y + b.h;
    // The nearest elements on the open side of the band make room.
    const edgeOf = (e) => (bottom ? e.y + e.h : e.y);
    const near = content.filter((e) => (bottom ? edgeOf(e) <= line + 0.5 : edgeOf(e) >= line - 0.5));
    const best = near.length ? (bottom ? Math.max(...near.map(edgeOf)) : Math.min(...near.map(edgeOf))) : null;
    const cut = best === null ? [] : near.filter((e) => Math.abs(edgeOf(e) - best) <= 1).map((e) => e.id);
    return bottom ? { top: 0, bottom: round1(100 - line), cut } : { top: round1(line), bottom: 0, cut };
}

// Why an element is (or is not) drawn now — the Editor de telas tells the
// three ghosts apart (Rodada G2): "off" = its eye in the list hides it,
// "rule" = its Aparece rule leaves it out in this state, "empty" = it has
// nothing to say now (a Cifra on a song without chords), "shown" = drawn.
export function elementState(el, ctx, extra) {
    if (el.hidden) return "off";
    if (!elementVisible(el, ctx)) return "rule";
    if (!elementHasContent(el, ctx, extra)) return "empty";
    return "shown";
}
// The rule as the editor's list says it, "" for Sempre (the Aparece select's words).
export const whenLabel = (when) => (when && when !== "always" ? WHEN.find(([k]) => k === when)?.[1] || "" : "");
// The editor's "Mostrar com" state where a rule shows its element.
export const WHEN_STATE = { content: "Exemplo (letra)", tool: "Timer", idle: "Sem nada no ar" };
// Why the editor draws an element faint, and what to do about it; "" when
// it is drawn (the canvas's tooltip and the line under it).
export function ghostReason(el, state) {
    if (state === "off") return "Esmaecido: escondido pelo olho na lista. Ligue o olho para ele voltar.";
    if (state === "rule") return `Esmaecido: aparece só ${(whenLabel(el.when) || "").toLowerCase()}. Veja em “${WHEN_STATE[el.when] || "No ar"}” ou troque Aparece para Sempre.`;
    if (state === "empty") return "Esmaecido: nada para mostrar neste estado (uma Cifra numa música sem cifra, o Logo sem logo da igreja). Na tela ele só aparece quando tiver o que mostrar.";
    return "";
}

// ---- The editor's geometry (in % of the canvas) ----
export const clampRect = (r) => {
    const w = clamp(round1(num(r.w, MIN_SIDE)), MIN_SIDE, 100);
    const h = clamp(round1(num(r.h, MIN_SIDE)), MIN_SIDE, 100);
    return { x: clamp(round1(num(r.x, 0)), 0, 100 - w), y: clamp(round1(num(r.y, 0)), 0, 100 - h), w, h };
};

// A move or a resize snapped to the canvas's edges and centre and to the
// other elements' edges and centres, within `tol` %. -> { rect, guides }:
// the guides ([{ axis: "x" | "y", at }]) are the lines the editor draws.
export function snapRect(rect, others = [], { tol = 1.2, resize = null } = {}) {
    const xs = [0, 50, 100], ys = [0, 50, 100];
    for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
    const guides = [];
    let { x, y, w, h } = rect;
    const nearest = (cands, v) => { let best = null; for (const c of cands) { const d = Math.abs(c - v); if (d <= tol && (best === null || d < best.d)) best = { c, d }; } return best; };
    if (!resize) {
        // Moving: whichever of the left edge, centre and right edge is nearest a guide.
        const hx = [[x, 0], [x + w / 2, w / 2], [x + w, w]].map(([v, off]) => ({ off, hit: nearest(xs, v) })).filter((c) => c.hit).sort((a, b) => a.hit.d - b.hit.d)[0];
        if (hx) { x = hx.hit.c - hx.off; guides.push({ axis: "x", at: hx.hit.c }); }
        const hy = [[y, 0], [y + h / 2, h / 2], [y + h, h]].map(([v, off]) => ({ off, hit: nearest(ys, v) })).filter((c) => c.hit).sort((a, b) => a.hit.d - b.hit.d)[0];
        if (hy) { y = hy.hit.c - hy.off; guides.push({ axis: "y", at: hy.hit.c }); }
    } else {
        // Resizing: the edge being dragged snaps; the opposite edge stays.
        if (resize.includes("e")) { const hit = nearest(xs, x + w); if (hit) { w = hit.c - x; guides.push({ axis: "x", at: hit.c }); } }
        if (resize.includes("w")) { const hit = nearest(xs, x); if (hit) { w = x + w - hit.c; x = hit.c; guides.push({ axis: "x", at: hit.c }); } }
        if (resize.includes("s")) { const hit = nearest(ys, y + h); if (hit) { h = hit.c - y; guides.push({ axis: "y", at: hit.c }); } }
        if (resize.includes("n")) { const hit = nearest(ys, y); if (hit) { h = y + h - hit.c; y = hit.c; guides.push({ axis: "y", at: hit.c }); } }
    }
    return { rect: clampRect({ x, y, w, h }), guides };
}

// The rect after dragging a handle ("n", "s", "e", "w", "ne", "nw", "se",
// "sw") by dx, dy (%), never thinner than MIN_SIDE and never off the canvas.
export function resizeRect(rect, handle, dx, dy) {
    let { x, y, w, h } = rect;
    if (handle.includes("e")) w = clamp(w + dx, MIN_SIDE, 100 - x);
    if (handle.includes("s")) h = clamp(h + dy, MIN_SIDE, 100 - y);
    if (handle.includes("w")) { const nx = clamp(x + dx, 0, x + w - MIN_SIDE); w += x - nx; x = nx; }
    if (handle.includes("n")) { const ny = clamp(y + dy, 0, y + h - MIN_SIDE); h += y - ny; y = ny; }
    return clampRect({ x, y, w, h });
}

export const moveRect = (rect, dx, dy) => clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });

// The elements with one moved a step up or down the stack (later is on top).
export function reorderElement(elements, id, dir) {
    const i = elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= elements.length) return elements;
    const out = elements.slice();
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

// One element dropped at another place in the stack (the editor's list,
// dragged): `to` is the index it lands on after the move.
export function moveElement(elements, id, to) {
    const i = elements.findIndex((e) => e.id === id);
    if (i < 0) return elements;
    const j = Math.max(0, Math.min(elements.length - 1, to));
    if (i === j) return elements;
    const out = elements.slice();
    const [el] = out.splice(i, 1);
    out.splice(j, 0, el);
    return out;
}
