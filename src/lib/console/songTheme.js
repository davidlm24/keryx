// The parts of a song's lyrics ([Refrão], [Ponte]…). A song had a theme of
// its own and one per part (2026-10-12, Song.theme_id / part_themes); since
// 2026-11-09 (owner) it wears the theme in use and those fields stay stored,
// unread: what is left here only names the parts. Pure.

// The part a slide belongs to: its "[Label]", or "Refrão" for a chorus with
// no label of its own; "" when it has neither.
export const partOf = (slide) => String(slide?.label || "").trim() || (slide?.is_chorus ? "Refrão" : "");

// How a part is keyed in part_themes: the name trimmed, in lower case, so
// "Refrão" and "refrão" are the same part.
export const partKey = (name) => String(name || "").trim().toLocaleLowerCase("pt-BR");

// The song's parts in the order they first appear, one per key.
export function songParts(slides = []) {
    const seen = new Set();
    const out = [];
    for (const s of slides) {
        const name = partOf(s);
        const key = partKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name, slides: slides.filter((x) => partKey(partOf(x)) === key).length });
    }
    return out;
}
