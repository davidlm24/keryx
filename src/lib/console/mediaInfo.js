// The Mídia's Informações (owner 2026-11-09, mockup "Identificar, Mídia e
// tema da música", board 2): a file's name, description and — for one
// downloaded from YouTube — the link it came from, edited in the side
// panel and saved on blur. Pure, tested (mediaInfo.test.mjs).

export const DESCRIPTION_MAX = 500;
export const TITLE_MAX = 200;

// The link a downloaded file came from: "" (none: not from the internet any
// more), an http(s) address as typed, or null when it is not one (the field
// says so and nothing is saved).
export function cleanSourceUrl(value) {
    const v = String(value ?? "").trim();
    if (!v) return "";
    try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch { return null; }
}

// What changed between the row and the draft -> the fields to save, or null
// when nothing did (or what changed is not valid: an empty name, a link
// that is not one). The name keeps the row's when left empty.
export function mediaInfoPatch(row, draft) {
    if (!row || !draft) return null;
    const patch = {};
    if (draft.title != null) {
        const t = String(draft.title).trim().slice(0, TITLE_MAX);
        if (t && t !== (row.title || "")) patch.title = t;
    }
    if (draft.description != null) {
        const d = String(draft.description).trim().slice(0, DESCRIPTION_MAX);
        if (d !== (row.description || "")) patch.description = d;
    }
    if (draft.source_url != null) {
        const s = cleanSourceUrl(draft.source_url);
        if (s !== null && s !== (row.source_url || "")) patch.source_url = s;
    }
    return Object.keys(patch).length ? patch : null;
}

