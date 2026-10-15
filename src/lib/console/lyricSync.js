// Sincronizar (owner 2026-10-15, Rodada D4): the marks of a song — where
// each slide comes in, in seconds — made against its video, its playback or
// a live clock, and the slide on air follows them (content.follow,
// shared/live-state.mjs). `starts` is one entry per slide: seconds, or null
// for a slide with no mark. Pure: the page (SyncView.jsx) keeps the media.

export const STEP = 0.1;
export const SEEK_SECONDS = 2;
export const SPEEDS = [0.5, 0.75, 1];

const round = (t) => Math.round(t * 100) / 100;
export const snap = (t, step = STEP) => round(Math.round(Math.max(0, t) / step) * step);
const isMark = (v) => Number.isFinite(v);

// "m:ss.cc" (1:01.80); "—" with no time.
export function fmtTime(t) {
    if (!isMark(t)) return "—";
    const cs = Math.round(Math.max(0, t) * 100);
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

// What the operator typed: "1:01.8", "1:01", "61.8" or "61" -> seconds;
// "" -> null (no mark); undefined when it cannot be read.
export function parseTime(text) {
    const v = String(text ?? "").trim().replace(",", ".");
    if (!v) return null;
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v);
    if (!m) return undefined;
    const sec = Number(m[2]);
    if (m[1] !== undefined && sec >= 60) return undefined;
    return round((m[1] ? Number(m[1]) * 60 : 0) + sec);
}

// The marks of saved slides, one per slide.
export const marksOf = (slides) => (slides || []).map((it) => (isMark(it?.start) ? it.start : null));
export const markedCount = (starts) => (starts || []).filter(isMark).length;

// The slide playing at `t`: the last one marked at or before it (-1: none yet).
export function indexAt(starts, t) {
    let at = -1;
    (starts || []).forEach((v, i) => { if (isMark(v) && v <= t + 1e-6) at = i; });
    return at;
}

// The first slide from `from` on with no mark (-1: all marked).
export function nextUnmarked(starts, from = 0) {
    for (let i = Math.max(0, from); i < (starts || []).length; i++) if (!isMark(starts[i])) return i;
    return -1;
}

// One slide's mark, kept in order: between its neighbours' marks (a tenth
// of a second apart), never under 0. null clears it.
export function setMark(starts, i, t) {
    const out = starts.slice();
    if (i < 0 || i >= out.length) return out;
    if (t === null || t === undefined) { out[i] = null; return out; }
    const before = out.slice(0, i).filter(isMark);
    const after = out.slice(i + 1).filter(isMark);
    const lo = before.length ? before[before.length - 1] + STEP : 0;
    const hi = after.length ? after[0] - STEP : Infinity;
    out[i] = snap(Math.min(hi, Math.max(lo, t)));
    return out;
}

// − / + (and dragging a marker): the same, by `d` seconds.
export const nudge = (starts, i, d) => (isMark(starts[i]) ? setMark(starts, i, starts[i] + d) : starts.slice());

// Recording (Espaço): slide `i` comes in at `t`. Later marks the new one
// passes are cleared (they would be out of order); earlier ones stay — a
// mistake on slide 12 never means redoing the song.
export function recordMark(starts, i, t) {
    const out = starts.slice();
    if (i < 0 || i >= out.length) return out;
    const v = snap(t);
    out[i] = v;
    for (let k = i + 1; k < out.length; k++) if (isMark(out[k]) && out[k] <= v) out[k] = null;
    for (let k = 0; k < i; k++) if (isMark(out[k]) && out[k] >= v) out[k] = null;
    return out;
}

// "Distribuir pelo tempo da música": the slides spread evenly over `total`
// seconds (the first at `intro`), a start to adjust from.
export function distribute(count, total, intro = 0) {
    if (!(count > 0) || !(total > intro)) return Array(Math.max(0, count)).fill(null);
    const span = (total - intro) / count;
    return Array.from({ length: count }, (_, i) => snap(intro + i * span));
}

// Marks fitted to another slide count (the lyrics changed): kept by index,
// the extra ones dropped, new slides unmarked.
export const fitMarks = (starts, count) => Array.from({ length: count }, (_, i) => (isMark(starts?.[i]) ? starts[i] : null));

export const sameMarks = (a, b) => a.length === b.length && a.every((v, i) => (isMark(v) ? v === b[i] : !isMark(b[i])));
