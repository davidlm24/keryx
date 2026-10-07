import { useEffect, useState } from "react";
import { meterLevels } from "@/lib/console/player";

// The outputs' level reports (window.keryxDesktop.meters), kept for the
// player: one subscription for the whole console, a few recent reports per
// layer. Components read levels at their own frame rate, so a dozen reports
// a second never re-render the console.
const KEEP = 12;
const reports = [];
const durations = new Map(); // `${layer}|${url}` -> seconds
let unsubscribe = null;
const listeners = new Set();

function ensure() {
    if (unsubscribe || typeof window === "undefined") return;
    const meters = window.keryxDesktop?.meters;
    if (!meters) return;
    unsubscribe = meters.onLevel((rep) => {
        reports.push({ ...rep, at: Date.now() });
        if (reports.length > KEEP * 3) reports.splice(0, reports.length - KEEP * 3);
        if (rep.duration) {
            const key = `${rep.layer}|${rep.url}`;
            if (Math.round(durations.get(key) || 0) !== Math.round(rep.duration)) {
                durations.set(key, rep.duration);
                for (const l of listeners) l();
            }
        }
    });
}

export const levelsNow = (layer, url) => meterLevels(reports, layer, url, Date.now());

// The duration an output reported for this item (files the library does not
// know the length of, YouTube links), re-rendering only when it changes.
export function useReportedDuration(layer, url) {
    const [, bump] = useState(0);
    useEffect(() => {
        ensure();
        const l = () => bump((n) => n + 1);
        listeners.add(l);
        return () => listeners.delete(l);
    }, []);
    return layer && url ? durations.get(`${layer}|${url}`) || null : null;
}

export function useMeterFeed() {
    useEffect(() => { ensure(); }, []);
}
