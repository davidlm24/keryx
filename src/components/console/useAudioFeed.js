import { useEffect } from "react";
import { levelsNow, useMeterFeed } from "./meterStore";
import { setLevel } from "@/lib/audioLevel";

const EVERY_MS = 50;

// While a generated background on air follows the sound (gen.audio), the
// console measures the PC's output (meterStore's loopback capture) twenty
// times a second, keeps the level for its own monitors (audioLevel.js) and
// sends it to the output windows (keryx:audio-level). Otherwise nothing is
// sent. The browser preview has no loopback: there the level stays 0.
export function useAudioFeed(live) {
    const on = Boolean(live?.background?.kind === "generator" && live.background.gen?.audio);
    useMeterFeed();
    useEffect(() => {
        if (!on) return undefined;
        const bridge = typeof window !== "undefined" ? window.keryxDesktop?.meters : null;
        const tick = () => {
            const lv = levelsNow();
            const v = lv.state === "on" ? Math.max(lv.l, lv.r) : 0;
            setLevel(v);
            bridge?.sendLevel?.(v);
        };
        tick();
        const id = setInterval(tick, EVERY_MS);
        return () => { clearInterval(id); setLevel(0); bridge?.sendLevel?.(0); };
    }, [on]);
}
