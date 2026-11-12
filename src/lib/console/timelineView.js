// Marcar os tempos' timeline (owner 2026-11-12, mockup "Fim da música com
// fade", T1–T4): a window of `span` seconds from `from` over the song, the
// ruler's ticks, the zoom steps and the page turning while it plays. Pure;
// SyncView draws it. Console only.
import { fmtTime } from "./lyricSync.js";

// The zoom's steps, in seconds on screen; Infinity = the whole song.
export const SPANS = [5, 10, 20, 30, 60, 120, Infinity];
export const DEFAULT_SPAN = 30;

// The seconds on screen for a step: never more than the song.
export const spanOf = (step, duration) => (duration > 0 ? Math.min(step, duration) : Number.isFinite(step) ? step : DEFAULT_SPAN);

// The window's start, kept inside the song.
export function clampFrom(from, span, duration) {
    if (!(duration > 0)) return Math.max(0, from || 0);
    return Math.max(0, Math.min(Math.max(0, duration - span), from || 0));
}

// Where `t` sits in the window (0 = left edge, 1 = right edge), and back.
export const fracOf = (t, from, span) => (span > 0 ? (t - from) / span : 0);
export const timeOf = (frac, from, span) => from + frac * span;

// While it plays the window turns a page: the time past 85 % of it (or
// before it) brings it back to 15 %.
export function followView(from, span, t, duration) {
    if (t < from || t > from + span * 0.85) return clampFrom(t - span * 0.15, span, duration);
    return from;
}

// Zooming keeps the time under the pointer (or the playhead) where it is.
export function zoomTo(from, span, nextSpan, anchor, duration) {
    const frac = span > 0 ? (anchor - from) / span : 0;
    return clampFrom(anchor - frac * nextSpan, nextSpan, duration);
}

// The next zoom step: dir −1 closer (fewer seconds), +1 farther; a step that
// is the whole song already counts as the last.
export function stepAfter(step, dir, duration) {
    const list = SPANS.filter((s, i) => i === SPANS.length - 1 || !(duration > 0) || s < duration);
    const at = Math.max(0, list.findIndex((s) => s >= step));
    return list[Math.max(0, Math.min(list.length - 1, at + dir))];
}

// The words for a step ("30 s", "2 min", "Inteira").
export function spanWord(step, duration) {
    if (!Number.isFinite(step) || (duration > 0 && step >= duration)) return "Inteira";
    return step >= 60 ? `${step / 60} min` : `${step} s`;
}

// The ruler's ticks in the window: a label every `major` seconds, a short
// tick every `minor`, chosen for the span on screen.
const STEPS = [[15, 1, 0.5], [40, 5, 1], [90, 10, 2], [200, 30, 5], [600, 60, 15], [Infinity, 120, 30]];
export function ticks(from, span) {
    const [, major, minor] = STEPS.find(([max]) => span <= max);
    const out = [];
    const first = Math.ceil(from / minor - 1e-9) * minor;
    for (let t = first; t <= from + span + 1e-9; t = Math.round((t + minor) * 1000) / 1000) {
        const big = Math.abs(t / major - Math.round(t / major)) < 1e-6;
        out.push({ t, major: big, label: big ? fmtTime(t).slice(0, -3) : "" });
    }
    return out;
}
