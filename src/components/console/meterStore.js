import { useEffect, useState } from "react";

// The player's level meters and reported durations.
//
// Levels: the console itself captures the PC's sound output (system
// loopback, granted by the main process to app pages only) and measures
// L/R peaks with two analysers. Nothing touches the media elements in the
// output windows, so measuring can never disturb playback. The meters show
// everything the computer is putting out — which is what reaches the PA.
//
// Durations: the outputs report how long the item they play is
// (window.keryxDesktop.meters, relayed by the main process), for files the
// library has no length for and for YouTube links.

const FLOOR_DB = -60;
const FFT = 1024;

// A peak (0..1 linear) as a meter position: -60 dBFS is empty, 0 dBFS full.
export const meterLevel = (peak) => (peak <= 0.001 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(peak) - FLOOR_DB) / -FLOOR_DB)));

// -- Levels (local loopback capture) ------------------------------------------

let capture = "idle"; // "idle" | "starting" | "on" | "off"
let analysers = null;
const buf = typeof Float32Array === "undefined" ? null : new Float32Array(FFT);

function startCapture() {
    // The browser preview (npm run dev) has no system loopback: no meters
    // there, and no capture prompt.
    if (capture !== "idle" || typeof window === "undefined" || !window.keryxDesktop || window.keryxDesktop.isPreview) {
        if (capture === "idle") capture = "off";
        return;
    }
    capture = "starting";
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((stream) => {
        // Only the sound matters; the granted video track (our own frame) goes.
        stream.getVideoTracks().forEach((t) => t.stop());
        if (stream.getAudioTracks().length === 0) { capture = "off"; return; }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const split = ctx.createChannelSplitter(2);
        source.connect(split); // never to the destination: it would echo
        analysers = [0, 1].map((channel) => {
            const a = ctx.createAnalyser();
            a.fftSize = FFT;
            split.connect(a, channel);
            return a;
        });
        const done = () => { capture = "off"; analysers = null; ctx.close().catch(() => {}); };
        stream.getAudioTracks()[0].addEventListener("ended", done);
        capture = "on";
    }).catch(() => { capture = "off"; });
}

const peak = (a) => {
    a.getFloatTimeDomainData(buf);
    let m = 0;
    for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > m) m = v;
    }
    return m;
};

// state: "on" (measuring), "wait" (starting), "off" (no loopback here).
export function levelsNow() {
    if (capture === "on" && analysers) {
        let l = meterLevel(peak(analysers[0]));
        let r = meterLevel(peak(analysers[1]));
        // A mono source: the splitter leaves the right channel silent.
        if (r === 0 && l > 0) r = l;
        return { l, r, state: "on" };
    }
    return { l: 0, r: 0, state: capture === "starting" || capture === "idle" ? "wait" : "off" };
}

export function useMeterFeed() {
    useEffect(() => { startCapture(); ensureDurations(); }, []);
}

// -- Durations (reported by the outputs over IPC) ------------------------------

const durations = new Map(); // `${layer}|${url}` -> seconds
let unsubscribe = null;
const listeners = new Set();

function ensureDurations() {
    if (unsubscribe || typeof window === "undefined") return;
    const meters = window.keryxDesktop?.meters;
    if (!meters) return;
    unsubscribe = meters.onLevel((rep) => {
        if (!rep.duration) return;
        const key = `${rep.layer}|${rep.url}`;
        if (Math.round(durations.get(key) || 0) !== Math.round(rep.duration)) {
            durations.set(key, rep.duration);
            for (const l of listeners) l();
        }
    });
}

// The duration an output reported for this item, re-rendering only when it
// changes.
export function useReportedDuration(layer, url) {
    const [, bump] = useState(0);
    useEffect(() => {
        ensureDurations();
        const l = () => bump((n) => n + 1);
        listeners.add(l);
        return () => listeners.delete(l);
    }, []);
    return layer && url ? durations.get(`${layer}|${url}`) || null : null;
}
