// A screen on the church network (a tablet, a TV) showing an output page
// (owner 2026-11-01, after the first service with network screens: S1, S2
// and M4 = A). Pure rules; ScreenStart.jsx and LiveVideo apply them, and
// only while keryx.isNetworkScreen: the output windows on the KERYX
// computer never change.
import { livePosition } from "../../../shared/live-state.mjs";

// S2: the stage is the projector's, 16:9, centred on black (letterbox): a
// 4:3 iPad shows the whole picture with bars above and below, never a
// picture cut at the sides. -> { width, height, left, top } in whole px.
export const STAGE_RATIO = 16 / 9;
export function letterbox(width, height, ratio = STAGE_RATIO) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return { width: 0, height: 0, left: 0, top: 0 };
    const boxW = Math.floor(Math.min(w, h * ratio));
    const boxH = Math.floor(Math.min(h, boxW / ratio));
    return { width: boxW, height: boxH, left: Math.floor((w - boxW) / 2), top: Math.floor((h - boxH) / 2) };
}

// The slight delay (a clip a second behind the projector): LiveVideo seeks
// only past the live state's tolerance (playbackPlan, 1.5 s), which a jump
// on screen would show. Under it the clip catches up by playing a little
// faster or slower: `drift` is the element's time minus the shared one, in
// seconds (positive = ahead). The rate is proportional to the drift (it
// closes in about NUDGE_SPAN seconds), at most ±NUDGE_MAX, and exactly 1 in
// the dead band, so a clip in step is never touched.
export const NUDGE_MAX = 0.04;
export const NUDGE_DEAD = 0.06;
const NUDGE_SPAN = 4;
export function nudgeRate(drift) {
    if (!Number.isFinite(drift) || Math.abs(drift) <= NUDGE_DEAD) return 1;
    const step = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, drift / NUDGE_SPAN));
    return Math.round((1 - step) * 1000) / 1000;
}

// The rate a playing <video> (`el`: currentTime, paused, duration) takes now,
// against the shared playback (as playbackPlan reads it): 1 while paused,
// held by a pause or at its end, and past `tolerance` (the seek's job).
export function clipRate(el, playback, now, { loop = false, tolerance = 1.5 } = {}) {
    if (!playback || playback.paused || el.paused) return 1;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
    let target = livePosition(playback, now);
    if (duration) {
        if (!loop && target >= duration) return 1;
        target = loop ? target % duration : target;
    }
    const drift = (el.currentTime || 0) - target;
    return Math.abs(drift) > tolerance ? 1 : nudgeRate(drift);
}

// M4: "Toque para começar", once per load. A browser that refuses to start a
// video even muted waits for one tap; every player it refused registers how
// to start again (`refused(retry)`, which returns the way to take it back),
// the overlay shows while any waits (`needed`), and the tap (`start`) hands
// back every retry and closes the gate for good: after it the overlay never
// shows again in this load (`started`; a later refusal is the player's own).
export function createTapGate() {
    let started = false;
    const waiting = new Set();
    const subs = new Set();
    const emit = () => { for (const fn of subs) fn(); };
    return {
        get started() { return started; },
        needed: () => !started && waiting.size > 0,
        refused(retry) {
            if (started) return () => {};
            waiting.add(retry);
            emit();
            return () => { if (waiting.delete(retry)) emit(); };
        },
        start() {
            if (started) return [];
            started = true;
            const retries = [...waiting];
            waiting.clear();
            emit();
            return retries;
        },
        subscribe(fn) {
            subs.add(fn);
            return () => subs.delete(fn);
        },
    };
}

// The one gate of this page (LiveVideo registers, ScreenStart draws it).
export const tapGate = createTapGate();
