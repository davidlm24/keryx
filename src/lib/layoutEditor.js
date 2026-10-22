// The Editor de telas' own logic (Rodada P, P8-3 = A, owner 2026-10-22), kept
// apart from layouts.js so the outputs that draw a layout never load it: the
// Adicionar picker's hints, the text bar's mapping, marking several elements
// to align and distribute them, the optional grid and the church's own models
// (ScreenLayout rows: "Salvar como modelo", beside the factory ones in
// "Começar de um modelo…" — owner's choice 2026-10-22, the old catalog's rows
// become the church's models). Pure (tested in layoutEditor.test.mjs).
import { normalizeLayout, layoutFields, clampRect, LAYOUT_CATEGORIES } from "./layouts.js";

// One line per element type in the Adicionar picker.
export const ELEMENT_HINTS = {
    screen: "o que esta saída projeta (letras, Bíblia, mídia, avisos), em tela cheia ou numa parte; com um elemento Relógio ou timer no layout, o timer sai daqui e fica nele",
    clock: "a hora de agora",
    date: "sábado, 10 de outubro",
    timer: "o que a ferramenta no ar mostra: o tempo restante, o cronômetro, a hora, o texto livre",
    service_time: "há quanto tempo o culto começou",
    air_for: "há quanto tempo o item está no ar",
    air_title: "o nome do item no ar e a posição (2/6)",
    church: "o nome e a cidade da igreja",
    title: "o título e o artista do que está no ar",
    current: "o slide no ar; com a cifra sobre as sílabas quando a letra a tem",
    next: "o slide seguinte",
    next_items: "os itens que vêm depois do que está no ar",
    song_key: "o tom da música",
    bpm: "o andamento da música",
    song_time: "há quanto tempo a música está no ar",
    chords: "o bloco de cifra da música, transponível",
    notes: "as notas da música para a banda",
    monitor: "o que o projetor mostra, em miniatura",
    progress: "um ponto por slide, o do ar em vermelho",
    logo: "o logo de Configurações › Igreja",
    text: "um texto seu, sempre o mesmo",
    image: "uma imagem da Mídia",
};

// ---- The text bar (TextBar.jsx speaks the theme's keys) ----
// What the bar shows for an element: its weight, align and colour under the
// theme's names, the rest as they are.
export const elementBar = (el) => ({
    font_weight: el?.weight === "bold" ? "bold" : "",
    font_style: el?.font_style || "", text_decoration: el?.text_decoration || "", text_case: el?.text_case || "",
    text_align: el?.align || "left", text_justify: el?.text_justify || "",
    text_color: el?.color || "", text_outline_px: el?.text_outline_px ?? "", text_outline_color: el?.text_outline_color || "",
    line_height: el?.line_height ?? "", letter_spacing: el?.letter_spacing ?? "",
});
// A change from the bar, in the element's fields.
const RENAME = { font_weight: "weight", text_align: "align", text_color: "color" };
export function barToElement(patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch || {})) {
        if (k === "font_weight") out.weight = v === "bold" ? "bold" : "normal";
        else out[RENAME[k] || k] = v;
    }
    return out;
}

// ---- Several elements marked (Ctrl/Shift + click) ----
const round1 = (n) => Math.round(n * 10) / 10;
// The box around some elements, in % of the screen.
export function boxOf(els) {
    if (!els.length) return null;
    const x = Math.min(...els.map((e) => e.x)), y = Math.min(...els.map((e) => e.y));
    return { x, y, w: Math.max(...els.map((e) => e.x + e.w)) - x, h: Math.max(...els.map((e) => e.y + e.h)) - y };
}

// The Alinhar menu: [how, label]. With two or more marked they line up on
// the box around them; one alone lines up on the screen.
export const ALIGN_ACTIONS = [["left", "À esquerda"], ["hcenter", "Ao centro"], ["right", "À direita"], ["top", "Ao alto"], ["vmiddle", "Ao meio"], ["bottom", "Embaixo"]];
export function alignElements(elements, ids, how) {
    const marked = elements.filter((e) => ids.includes(e.id));
    if (!marked.length) return elements;
    const box = marked.length > 1 ? boxOf(marked) : { x: 0, y: 0, w: 100, h: 100 };
    const at = (e) => {
        switch (how) {
            case "left": return { x: box.x };
            case "hcenter": return { x: box.x + (box.w - e.w) / 2 };
            case "right": return { x: box.x + box.w - e.w };
            case "top": return { y: box.y };
            case "vmiddle": return { y: box.y + (box.h - e.h) / 2 };
            case "bottom": return { y: box.y + box.h - e.h };
            default: return {};
        }
    };
    return elements.map((e) => (ids.includes(e.id) ? { ...e, ...clampRect({ ...e, ...at(e) }) } : e));
}

// Distribuir: three or more marked, the first and the last stay and the
// others move so the gaps between them are equal ("x" across, "y" down).
export function distributeElements(elements, ids, axis = "x") {
    const pos = axis === "x" ? "x" : "y", size = axis === "x" ? "w" : "h";
    const marked = elements.filter((e) => ids.includes(e.id)).sort((a, b) => a[pos] - b[pos]);
    if (marked.length < 3) return elements;
    const first = marked[0], last = marked[marked.length - 1];
    const span = last[pos] + last[size] - first[pos];
    const gap = (span - marked.reduce((n, e) => n + e[size], 0)) / (marked.length - 1);
    const next = new Map();
    let at = first[pos];
    for (const e of marked) { next.set(e.id, round1(at)); at += e[size] + gap; }
    return elements.map((e) => (next.has(e.id) ? { ...e, ...clampRect({ ...e, [pos]: next.get(e.id) }) } : e));
}

// Everything marked moved by dx, dy (%), as one: the group stops at the
// screen's edge instead of squeezing.
export function moveElements(elements, ids, dx, dy) {
    const marked = elements.filter((e) => ids.includes(e.id));
    const box = boxOf(marked);
    if (!box) return elements;
    const mx = Math.min(100 - box.x - box.w, Math.max(-box.x, dx));
    const my = Math.min(100 - box.y - box.h, Math.max(-box.y, dy));
    return elements.map((e) => (ids.includes(e.id) ? { ...e, ...clampRect({ ...e, x: e.x + mx, y: e.y + my }) } : e));
}

// ---- The grid (optional; kept on this computer, never in the design) ----
export const GRID_STEPS = [["2.5", "2,5 %"], ["5", "5 %"], ["10", "10 %"]];
export const DEFAULT_GRID = { on: false, step: 5 };
// The grid as kept in localStorage: { on, step } with a step it offers.
export function cleanGrid(v) {
    const step = Number(v?.step);
    return { on: v?.on === true, step: GRID_STEPS.some(([k]) => Number(k) === step) ? step : DEFAULT_GRID.step };
}
const toGrid = (n, step) => Math.round(n / step) * step;
// A move or resize on the grid: a move puts the corner on it, a resize the
// edges its handle drags ("n", "se"…); never thinner than a grid square.
export function gridRect(rect, step, handle = null) {
    if (!step) return rect;
    let { x, y, w, h } = rect;
    if (!handle) return clampRect({ x: toGrid(x, step), y: toGrid(y, step), w, h });
    if (handle.includes("e")) w = Math.max(step, toGrid(x + w, step) - x);
    if (handle.includes("s")) h = Math.max(step, toGrid(y + h, step) - y);
    if (handle.includes("w")) { const nx = Math.min(toGrid(x, step), x + w - step); w += x - nx; x = nx; }
    if (handle.includes("n")) { const ny = Math.min(toGrid(y, step), y + h - step); h += y - ny; y = ny; }
    return clampRect({ x, y, w, h });
}

// ---- The church's models (ScreenLayout rows) ----
// The rows as models, by name; an unnamed one is "Modelo sem nome".
export function churchModels(rows) {
    return (rows || []).map((r) => normalizeLayout(r)).filter((l) => l.id && l.elements.length)
        .map((l) => ({ ...l, name: l.name || "Modelo sem nome" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
// The category a screen's model is filed under.
const CATEGORY = { "/StageView": "palco", "/PastorView": "pastor" };
export const modelCategory = (path) => CATEGORY[path] || "publico";
export const categoryLabel = (cat) => LAYOUT_CATEGORIES.find(([k]) => k === cat)?.[1] || "Outros";
// What "Salvar como modelo" writes: the drawing with a name and a category.
export function modelFields(draft, name, path) {
    const f = layoutFields(normalizeLayout({ ...draft, name, category: modelCategory(path) }));
    return { ...f, elements: f.elements.map(({ id: _id, ...e }) => e) };
}
// A name already taken by another model (asked again, never overwritten).
export const modelNameTaken = (models, name) => (models || []).some((m) => m.name.trim().toLocaleLowerCase("pt-BR") === String(name || "").trim().toLocaleLowerCase("pt-BR"));
