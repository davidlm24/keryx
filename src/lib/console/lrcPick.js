// Buscar marcas (owner 2026-10-22, the mockup "Sincronizar · marcas do
// LRCLIB", S1–S4): the marks of a recording found on LRCLIB, moved onto the
// church's playback by one tap on the first slide. A playback made from the
// record (most of them) has the same length as the recording, so its lines
// come in the same places; only the intro of the file may differ, which the
// tap absorbs. Pure: the dialog is SyncMarks.jsx, the page SyncView.jsx, the
// search electron/lyrics.cjs (op `recordings`).
import { lrcMarks } from "../songImport.js";
import { snap } from "./lyricSync.js";

const isMark = (v) => Number.isFinite(v);

// A recording "has the same length" as the playback within this many seconds.
export const SAME_LENGTH_S = 3;
// Under this share of the slides found, the lyrics are another song's.
export const FEW_LINES = 0.5;
// S2 = B: the best recording is used without the list when its length is the
// playback's and at least this share of the slides is found in it.
export const AUTO_LINES = 0.8;

// The recordings of a search ({ id, title, artist, album, duration, synced })
// measured against the song: `marks` (one per slide, its recording's times),
// `matched` of `total` slides found, `diff` (its length minus the playback's,
// null when either is unknown), `length` same | other | unknown, `few` (the
// lyrics do not match: another song with the same name) and `usable`. Best
// first: usable, then the lyrics that match, the closest length, the most
// slides found; the ones with no times (or none of ours) last.
export function rankRecordings(recordings, { slides = [], duration = null } = {}) {
    const total = (slides || []).length;
    const known = Number.isFinite(duration) && duration > 0;
    const out = (recordings || []).map((r) => {
        const timed = Boolean(String(r?.synced || "").trim());
        const marks = timed ? lrcMarks(slides, r.synced) : Array(total).fill(null);
        const matched = marks.filter(isMark).length;
        const diff = known && r.duration > 0 ? Math.round(r.duration - duration) : null;
        const length = diff === null ? "unknown" : Math.abs(diff) <= SAME_LENGTH_S ? "same" : "other";
        const few = timed && total > 0 && matched / total < FEW_LINES;
        return { ...r, timed, marks, matched, total, diff, length, few, usable: timed && matched > 0 };
    });
    const far = (r) => (r.diff === null ? Infinity : Math.abs(r.diff));
    return out.sort((a, b) => (b.usable - a.usable) || (b.timed - a.timed) || (a.few - b.few) || (far(a) - far(b)) || (b.matched - a.matched));
}

// S2 = B: the recording to use at once, or null to show the list.
export function autoPick(ranked) {
    const best = ranked?.[0];
    return best && best.usable && !best.few && best.length === "same" && best.matched / Math.max(1, best.total) >= AUTO_LINES ? best : null;
}

const secs = (n) => `${Math.abs(n)} s`;
// The chips of a recording in the list: [text, tone] (ok | warn).
export function lengthChip(r) {
    if (r.length === "same") return ["Mesma duração do playback", "ok"];
    if (r.length === "unknown") return null;
    return [r.diff > 0 ? `${secs(r.diff)} mais longa` : `${secs(r.diff)} mais curta`, "warn"];
}
export const linesChip = (r) => [r.few ? `Só ${r.matched} de ${r.total} slides batem` : `${r.matched} de ${r.total} slides batem`, r.few ? "warn" : "ok"];

// "m:ss" for a recording's length.
export const fmtLength = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

// The slide Espaço anchors: the first one with a mark (-1: none).
export const anchorIndex = (starts) => (starts || []).findIndex(isMark);

// Every mark moved by `delta` seconds, to a tenth, never under 0; the slides
// with no mark stay without one.
export const shiftMarks = (starts, delta) => (starts || []).map((v) => (isMark(v) ? snap(v + delta) : null));

// The tap: slide `i` begins at `t` on the playback (where the tap was, to a
// tenth), and every other mark follows by the same amount. -> { starts, delta }
export function anchorMarks(starts, i, t) {
    if (!isMark(starts?.[i]) || !Number.isFinite(t)) return { starts: (starts || []).slice(), delta: 0 };
    const at = snap(t);
    const delta = Math.round((t - starts[i]) * 10) / 10;
    const out = shiftMarks(starts, delta);
    out[i] = at;
    return { starts: out, delta };
}

// "+5,1 s" / "−0,8 s" / "0 s".
export function fmtDelta(d) {
    if (!d) return "0 s";
    return `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")} s`;
}
