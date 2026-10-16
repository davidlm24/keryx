// Layouts das telas (ScreenLayout rows, 2026-10-12): what a stage monitor or
// the pastor's tablet draws and where, designed by the operator on a canvas
// (ScreenEditor) and drawn by LayoutRenderer on the output, on a network
// screen, in the console's Prévia rail and in the editor itself, all from
// the same description. An output (OutputPref.layout_id) and a network
// screen (?layout=) pick a layout; "" is the page's own screen (StageScreen,
// PastorScreen), exactly as before.
//
// A layout is a 16:9 canvas with elements placed in % of the screen (x, y,
// w, h), each with a rule for when it shows, a text look (size in cqmin,
// font, weight, colour, alignment) and the options of its type. Pure (no
// React, tested in layouts.test.mjs): the renderer and the editor only draw.
import { toolTime } from "../../shared/live-state.mjs";
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
export const SIZE_RANGE = [1, 30];
export const MIN_SIDE = 2;
export const MAX_ELEMENTS = 40;

// The kinds of element, with the defaults a new one gets. `text` elements
// are one string drawn by the renderer (elementText); the others draw
// themselves (a list, chords, the projection's monitor, dots, pictures).
// `group` sorts the editor's Adicionar picker (ELEMENT_GROUPS).
export const ELEMENT_TYPES = [
    { id: "screen", name: "Projeção", icon: "projector", group: "tela", hint: "o que esta saída projeta (letras, Bíblia, mídia, avisos), em tela cheia ou numa parte; com um elemento Relógio ou timer no layout, o timer sai daqui e fica nele", w: 100, h: 100, size: 2, when: "always", props: {} },
    { id: "clock", name: "Hora", icon: "clock", group: "tempo", hint: "a hora de agora", w: 20, h: 10, size: 6, when: "always", props: { seconds: false } },
    { id: "date", name: "Data", icon: "clock", group: "tempo", hint: "sábado, 10 de outubro", w: 30, h: 6, size: 2.2, when: "always", props: {} },
    { id: "timer", name: "Relógio ou timer no ar", icon: "clock", group: "tempo", hint: "o que a ferramenta no ar mostra: o tempo restante, o cronômetro, a hora, o texto livre", w: 30, h: 14, size: 8, when: "tool", props: {} },
    { id: "service_time", name: "Tempo de culto", icon: "clock", group: "tempo", hint: "há quanto tempo o culto começou", w: 20, h: 6, size: 2.4, when: "always", label: "Culto há", props: {} },
    { id: "air_for", name: "No ar há", icon: "history", group: "tempo", hint: "há quanto tempo o item está no ar", w: 16, h: 6, size: 2.4, when: "always", label: "No ar há", props: {} },
    { id: "air_title", name: "O que está no ar", icon: "eye", group: "setlist", hint: "o nome do item no ar e a posição (2/6)", w: 40, h: 6, size: 3, when: "always", label: "No ar", props: {} },
    { id: "church", name: "Igreja", icon: "logo", group: "tela", hint: "o nome e a cidade da igreja", w: 40, h: 8, size: 2.6, when: "always", props: {} },
    { id: "title", name: "Título da música", icon: "music", group: "musica", hint: "o título e o artista do que está no ar", w: 50, h: 10, size: 4.2, weight: "bold", when: "content", props: { artist: true } },
    { id: "current", name: "Letra atual", icon: "text", group: "musica", hint: "o slide no ar; com a cifra sobre as sílabas quando a letra a tem", w: 60, h: 50, size: 7.4, weight: "bold", align: "center", valign: "middle", when: "content", props: { chords: true } },
    { id: "next", name: "Próximo slide", icon: "list", group: "musica", hint: "o slide seguinte", w: 94, h: 12, size: 3, when: "content", label: "Próximo", props: {} },
    { id: "next_items", name: "Próximos da Setlist", icon: "list", group: "setlist", hint: "os itens que vêm depois do que está no ar", w: 30, h: 60, size: 2.8, when: "always", label: "Próximo", props: { count: 3 } },
    { id: "song_key", name: "Tom", icon: "music", group: "musica", hint: "o tom da música", w: 9, h: 10, size: 3.4, weight: "bold", when: "content", label: "Tom", box: true, props: {} },
    { id: "bpm", name: "BPM", icon: "music", group: "musica", hint: "o andamento da música", w: 9, h: 10, size: 3.4, weight: "bold", when: "content", label: "BPM", box: true, props: {} },
    { id: "song_time", name: "Tempo na música", icon: "clock", group: "musica", hint: "há quanto tempo a música está no ar", w: 12, h: 10, size: 3.4, weight: "bold", when: "content", label: "Na música", box: true, props: {} },
    { id: "chords", name: "Cifra", icon: "music", group: "musica", hint: "o bloco de cifra da música, transponível", w: 31, h: 50, size: 2.2, font: "mono", when: "content", label: "Cifra", box: true, props: {} },
    { id: "notes", name: "Notas para músicos", icon: "edit", group: "musica", hint: "as notas da música para a banda", w: 94, h: 8, size: 2.4, when: "content", props: {} },
    { id: "monitor", name: "Monitor da projeção", icon: "projector", group: "tela", hint: "o que o projetor mostra, em miniatura", w: 60, h: 58, size: 2, when: "always", props: {} },
    { id: "progress", name: "Progresso dos slides", icon: "dot", group: "setlist", hint: "um ponto por slide, o do ar em vermelho", w: 94, h: 3, size: 1, when: "content", props: {} },
    { id: "logo", name: "Logo da igreja", icon: "logo", group: "tela", hint: "o logo de Configurações › Igreja", w: 10, h: 16, size: 2, when: "always", props: {} },
    { id: "text", name: "Texto fixo", icon: "text", group: "tela", hint: "um texto seu, sempre o mesmo", w: 40, h: 8, size: 3, when: "always", props: { text: "Texto" } },
    { id: "image", name: "Imagem", icon: "image", group: "tela", hint: "uma imagem da Mídia", w: 30, h: 30, size: 2, when: "always", props: { url: "" } },
];
export const typeOf = (id) => ELEMENT_TYPES.find((t) => t.id === id) || null;
// The Adicionar picker's groups, in its order.
export const ELEMENT_GROUPS = [["tempo", "Tempo"], ["musica", "Música"], ["setlist", "Setlist"], ["tela", "Tela"]];
// The elements drawn as one string (elementText).
export const TEXT_TYPES = new Set(["clock", "date", "timer", "service_time", "air_for", "air_title", "church", "title", "next", "song_key", "bpm", "song_time", "notes", "text"]);
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
        // The full package (owner's pick, Rodada C fase d2): an element can
        // be hidden without losing its place, and faded.
        hidden: onOff(raw.hidden, false),
        opacity: clamp(num(raw.opacity, 1), 0.1, 1),
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
export const FACTORY_LAYOUTS = [
    normalizeLayout({
        id: "factory:palco", factory: true, name: "Palco (modelo)", category: "palco",
        background: { song_image: true, dim: 0.72 },
        elements: [
            el("title", 3, 3, 50, 11, { size: 4.2, weight: "bold", props: { artist: true } }),
            el("song_key", 55, 3, 8, 11), el("bpm", 64, 3, 8, 11), el("song_time", 73, 3, 11, 11),
            el("clock", 85, 3, 12, 11, { size: 4.2, weight: "bold", box: true, label: "Hora", when: "content" }),
            el("notes", 3, 16, 94, 7, { size: 2.4, box: true }),
            el("current", 3, 25, 61, 50, { size: 7.4, weight: "bold", align: "center", valign: "middle", props: { chords: true } }),
            el("chords", 66, 25, 31, 50),
            el("next", 3, 78, 94, 12, { size: 3, box: true, label: "Próximo" }),
            el("progress", 3, 93, 94, 3),
            el("clock", 20, 30, 60, 24, { size: 16, align: "center", valign: "middle", when: "idle" }),
            el("text", 20, 56, 60, 8, { size: 3, align: "center", when: "idle", props: { text: "Aguardando projeção" } }),
        ],
    }),
    normalizeLayout({
        id: "factory:pastor", factory: true, name: "Pastor (modelo)", category: "pastor",
        background: { song_image: false },
        elements: [
            el("church", 3, 3, 50, 6, { size: 2.6, weight: "bold" }),
            el("date", 3, 9, 50, 5, { size: 1.9 }),
            el("clock", 60, 3, 37, 8, { size: 6, align: "right" }),
            el("service_time", 60, 11, 37, 5, { size: 1.9, align: "right", label: "Culto há" }),
            el("air_title", 3, 17, 58, 5, { size: 3, weight: "bold", label: "No ar" }),
            el("monitor", 3, 23, 58, 58),
            el("progress", 3, 83, 58, 3),
            el("next_items", 65, 17, 32, 80, { size: 2.8, label: "Próximo", props: { count: 3 } }),
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
    return {
        live, now, content, slides, index, song,
        current: content ? slides[index] || null : null,
        next: content ? slides[index + 1] || null : null,
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
        case "title": return ctx.content ? `${song.title || "Música"}${el.props.artist && song.artist ? `\n${song.artist}` : ""}` : "";
        case "next": return ctx.next ? ctx.next.text || "" : "";
        case "song_key": return song.song_key ? String(song.song_key) : "";
        case "bpm": return song.bpm ? String(song.bpm) : "";
        case "song_time": return ctx.content ? formatSpan(ctx.elapsed) : "";
        case "notes": return song.musician_notes || "";
        case "text": return el.props.text || "";
        default: return undefined;
    }
}

// The next Setlist items an element lists.
export const elementItems = (el, ctx) => ctx.upcoming.slice(0, Math.max(1, el.props.count || 1));

// Whether an element has anything to draw now: a text element with a
// string, a chords block with chords, dots with more than one slide, a logo
// or image with a file. Empty, the renderer draws nothing (no empty box).
export function elementHasContent(el, ctx, { logoUrl = "" } = {}) {
    // The next page of a presentation draws its picture (LayoutRenderer).
    if (el.type === "next" && slidePage(ctx.next)) return true;
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
