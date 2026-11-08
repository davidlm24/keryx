import { useEffect } from "react";

const REPORT_MS = 1000;

// An output tells the console how long the item it plays is (files the
// library has no duration for, so the player's seek bar works), through
// window.keryxDesktop.meters, relayed by the main process. Nothing here
// touches the element or its sound: levels are measured by the console
// itself from the system output (src/components/console/meterStore.js).
//
// elRef: the <video>; layer: "media" | "video" | "audio"; url: the item, so
// the console can ignore a report about the previous one.
export function useDurationReport(elRef, { layer, url, enabled }) {
    useEffect(() => {
        const bridge = window.keryxDesktop;
        const el = elRef.current;
        if (!enabled || !layer || !el || !bridge?.meters) return undefined;
        const meters = bridge.meters;
        const tick = () => {
            if (Number.isFinite(el.duration) && el.duration > 0) meters.report({ layer, url, duration: el.duration });
        };
        const id = setInterval(tick, REPORT_MS);
        el.addEventListener("loadedmetadata", tick);
        tick();
        return () => {
            clearInterval(id);
            el.removeEventListener("loadedmetadata", tick);
        };
    }, [elRef, layer, url, enabled]);
}
