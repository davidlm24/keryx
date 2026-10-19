import { useCallback, useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";

const subscribe = (callback) => keryx.live.subscribe(callback);
const getSnapshot = () => keryx.live.current();

// What every output shows right now (shared/live-state.mjs), re-rendering on
// each change. Null until the first read arrives. With a selector, the
// component gets just that part: useLiveState((s) => s?.content).
export function useLiveState(selector) {
    const state = useSyncExternalStore(subscribe, getSnapshot);
    return selector ? selector(state) : state;
}

// One timer per interval for the whole window, shared by every component
// that counts, so they all change on the same tick (the top bar's clock and
// a timer on the Programa) and a grid of previews runs one timer, not one
// each. It runs while someone listens.
const tickers = new Map();
function tickerOf(ms) {
    let t = tickers.get(ms);
    if (!t) { t = { ms, now: null, fns: new Set(), id: null }; tickers.set(ms, t); }
    return t;
}
// The tick's time; with nobody listening, a fresh one at most one interval
// old (two reads in one render agree, as useSyncExternalStore asks).
function readTicker(t) {
    if (!t.fns.size) {
        const n = keryx.live.now();
        if (t.now === null || Math.abs(n - t.now) >= t.ms) t.now = n;
    }
    return t.now;
}
function listen(t, fn) {
    t.fns.add(fn);
    if (t.id === null) {
        t.now = keryx.live.now();
        t.id = setInterval(() => {
            t.now = keryx.live.now();
            for (const f of t.fns) f();
        }, t.ms);
    }
    return () => {
        t.fns.delete(fn);
        if (!t.fns.size && t.id !== null) { clearInterval(t.id); t.id = null; }
    };
}
const idle = () => () => {};

// "Now" on the live state's clock, ticking: for timers, stopwatches, clocks
// and video positions, so every screen counts the same seconds. Only the
// component that shows the time should call it (the console's top bar clock,
// a timer, a monitor drawing a timer): its tick re-renders that component,
// never the whole console. `on` false stops the ticking (nothing on screen
// counts); the value is then the time of the last render.
export function useLiveNow(intervalMs = 1000, on = true) {
    const t = tickerOf(intervalMs);
    const sub = useCallback((fn) => listen(t, fn), [t]);
    return useSyncExternalStore(on ? sub : idle, () => readTicker(t));
}
