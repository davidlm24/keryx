// One background, wherever it is kept (a song, a theme, the Fundo layer):
//   { kind: "image" | "video" | "generator" | "color", value, gen?, dim?, blur?, fit?, position? }
// — the shape of the live state's background.set. Rows saved before it
// keep a picture in `background_image` (with background_dim/_blur/_fit) or a
// generated background in `background_generator`; bgSpec reads both, and
// bgFields writes the new field with the old ones beside it, so anything
// that still reads background_image keeps working.
//
// Rule of the Fundo (2026-10-12): an item that brings a background of its
// own (its own, its theme's, the default theme's) puts it in the Fundo
// layer when it goes on air — background.set before content.show — instead
// of painting it inside the content, so the background stays after Esc.
// With the Fundo held by Camadas' padlock it is left alone. fundoOps is that
// rule; the console's send and its Prévia both go through it. Pure.
import { applyOp, layerLocked } from "../../../shared/live-state.mjs";
import { GENERATOR_IDS, normalizeGenerator } from "../../../shared/generators.mjs";

export const BG_KINDS = ["image", "video", "generator", "color"];
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// A spec cleaned up: known kind, a value, a complete generator; null if
// it is not a background.
export function cleanSpec(v) {
    if (!isObj(v) || !BG_KINDS.includes(v.kind)) return null;
    const out = { kind: v.kind };
    if (v.kind === "generator") {
        const id = isObj(v.gen) && typeof v.gen.id === "string" ? v.gen.id : v.value;
        if (!GENERATOR_IDS.includes(id)) return null;
        out.value = id;
        out.gen = normalizeGenerator({ ...(isObj(v.gen) ? v.gen : {}), id });
    } else {
        const value = typeof v.value === "string" ? v.value.trim() : "";
        if (!value || (v.kind === "color" && !HEX.test(value))) return null;
        out.value = v.kind === "color" ? value.toLowerCase() : value;
    }
    const dim = num(v.dim, 0, 0.9);
    const blur = num(v.blur, 0, 20);
    if (dim !== null) out.dim = dim;
    if (blur !== null) out.blur = blur;
    if (v.fit === "cover" || v.fit === "contain") out.fit = v.fit;
    if (["top", "center", "bottom"].includes(v.position)) out.position = v.position;
    return out;
}

// A row's background (Song, ProjectionTheme…): the `background` field, else
// the old picture, else the old generated background; null for none.
export function bgSpec(row) {
    if (!row) return null;
    const own = cleanSpec(row.background);
    if (own) return own;
    if (typeof row.background_image === "string" && row.background_image.trim()) {
        return cleanSpec({ kind: "image", value: row.background_image, dim: row.background_dim, blur: row.background_blur, fit: row.background_fit });
    }
    const gen = row.background_generator;
    if (isObj(gen) && typeof gen.id === "string") return cleanSpec({ kind: "generator", value: gen.id, gen, dim: row.background_dim });
    return null;
}

// What to save on a row for a spec (null: no background of its own): the
// new field and the old ones, kept in step.
export function bgFields(spec) {
    const s = cleanSpec(spec);
    return {
        background: s,
        background_image: s?.kind === "image" ? s.value : "",
        background_generator: s?.kind === "generator" ? s.gen : null,
        background_dim: s && s.dim !== undefined && (s.kind === "image" || s.kind === "generator") ? s.dim : null,
        background_blur: s?.kind === "image" && s.blur !== undefined ? s.blur : null,
        background_fit: s?.kind === "image" && s.fit ? s.fit : "",
    };
}

// background.set's arguments for a spec (null for none).
export function bgArgs(spec, title = "") {
    const s = cleanSpec(spec);
    if (!s) return null;
    return { ...s, title: String(title || s.title || "").slice(0, 500) };
}

// The same background? (value and generator id; the look may differ.)
export const sameBg = (a, b) => Boolean(a && b) && a.kind === b.kind && (a.kind === "generator" ? a.gen?.id === b.gen?.id || a.value === b.value : a.value === b.value);

// A short name for a spec: "Imagem", "Vídeo", "Gerado · Fluido", "Cor #0f1a2e".
// `names` maps a generator id to its name (src/lib/generators.js).
export function bgLabel(spec, names = {}) {
    const s = cleanSpec(spec);
    if (!s) return "Nenhum";
    if (s.kind === "generator") return `Gerado · ${names[s.value] || s.value}`;
    if (s.kind === "color") return `Cor ${s.value}`;
    return s.kind === "video" ? "Vídeo" : "Imagem";
}

// The operations that put content.show's `args` on air under the rule of the
// Fundo: the item's background (args.fundo, or a picture in its style) goes
// to the Fundo layer first; the content goes without it. Other ops pass
// through. `state` is the live state (its padlock); -> [[op, args], ...].
export function fundoOps(op, args, state = null) {
    // A timer dressed by its theme brings the theme's background too.
    if (op === "tool.show" && args?.fundo) {
        const { fundo, ...rest } = args;
        const set = !layerLocked(state, "background") ? bgArgs(fundo, fundo.title || "") : null;
        return set ? [["background.set", set], ["tool.show", rest]] : [["tool.show", rest]];
    }
    if (op !== "content.show" || !args) return [[op, args]];
    const { fundo = null, ...rest } = args;
    const style = rest.style || {};
    const pic = typeof style.background_image === "string" && style.background_image.trim() ? style.background_image : "";
    const own = fundo || (pic ? { kind: "image", value: pic, dim: style.background_dim, blur: style.background_blur } : null);
    if (pic || "background_dim" in style || "background_blur" in style) {
        const { background_image: _i, background_dim: _d, background_blur: _b, ...left } = style;
        rest.style = left;
    }
    const set = own && !layerLocked(state, "background") ? bgArgs(own, own.title || rest.title || "") : null;
    return set ? [["background.set", set], ["content.show", rest]] : [["content.show", rest]];
}

// The document after fundoOps on `state` (the Prévia, editors' samples).
export function applyWithFundo(state, op, args, now) {
    return fundoOps(op, args, state).reduce((s, [o, a]) => applyOp(s, o, a, now), state);
}
