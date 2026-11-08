import { useEffect, useState } from "react";
import { retryDelay, wokeUp, START_TIMEOUT_MS, DEVICE_SETTLE_MS } from "@/lib/console/meterRetry";

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

// The capture never stays off (meterRetry.js, owner 2026-11-08): one that
// fails, never answers or ends tries again on a backoff, and the devices
// changing (a projector's HDMI, a mixer's USB: Windows' default output moves
// and the old capture goes silent) or the PC waking start it over at once.
let session = null; // { stream, ctx }
let pending = null; // the attempt in flight
let attempt = 0;
let retryTimer = null;
let watching = false;

const supported = () => typeof window !== "undefined" && Boolean(window.keryxDesktop) && !window.keryxDesktop.isPreview
    && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

function stopCapture() {
    pending = null;
    if (session) {
        session.stream.getTracks().forEach((t) => t.stop());
        session.ctx.close().catch(() => {});
    }
    session = null;
    analysers = null;
}

function failed() {
    stopCapture();
    capture = "off";
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; startCapture(); }, retryDelay(attempt));
    attempt += 1;
}

function restart() {
    if (!supported()) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;
    stopCapture();
    capture = "idle";
    startCapture();
}

function watch() {
    if (watching) return;
    watching = true;
    let settle = null;
    navigator.mediaDevices.addEventListener?.("devicechange", () => {
        clearTimeout(settle);
        settle = setTimeout(restart, DEVICE_SETTLE_MS);
    });
    let last = Date.now();
    setInterval(() => {
        const now = Date.now();
        if (wokeUp(last, now)) restart();
        last = now;
    }, 5000);
}

function startCapture() {
    if (capture === "starting" || capture === "on") return;
    // The browser preview (npm run dev) has no system loopback: no meters
    // there, and no capture prompt.
    if (!supported()) { capture = "off"; return; }
    watch();
    capture = "starting";
    const token = {};
    pending = token;
    const timeout = setTimeout(() => { if (pending === token) failed(); }, START_TIMEOUT_MS);
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then((stream) => {
        clearTimeout(timeout);
        if (pending !== token) { stream.getTracks().forEach((t) => t.stop()); return; }
        pending = null;
        // Only the sound matters; the granted video track (our own frame) goes.
        stream.getVideoTracks().forEach((t) => t.stop());
        const track = stream.getAudioTracks()[0];
        if (!track) { stream.getTracks().forEach((t) => t.stop()); failed(); return; }
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
        session = { stream, ctx };
        track.addEventListener("ended", () => { if (session && session.stream === stream) failed(); });
        // Windows may suspend the context (a device change, the PC asleep):
        // the analysers would read silence. Back to running at once.
        const wake = () => { if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => {}); };
        ctx.addEventListener("statechange", wake);
        wake();
        capture = "on";
        attempt = 0;
    }).catch(() => {
        clearTimeout(timeout);
        if (pending === token) failed();
    });
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

// The same, read once (the controle remoto's player: ±10 s within the file).
export function reportedDuration(layer, url) {
    ensureDurations();
    return layer && url ? durations.get(`${layer}|${url}`) || null : null;
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
