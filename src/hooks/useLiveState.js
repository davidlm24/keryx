import { useEffect, useState, useSyncExternalStore } from "react";
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

// "Now" on the live state's clock, ticking: for timers, stopwatches and
// video positions, so every screen counts the same seconds.
export function useLiveNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => keryx.live.now());
    useEffect(() => {
        const id = setInterval(() => setNow(keryx.live.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
