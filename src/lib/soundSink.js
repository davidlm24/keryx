// The device this window's sound goes to (Saída de som, owner 2026-11-08,
// electron/soundOut.cjs). Only the sound engine (src/pages/SoundEngine.jsx)
// sets it; every other window stays on Windows' default (outputs are muted).
// "" = Windows' default. A device that is not there now: setSinkId refuses
// and the element keeps playing where it was, never silent.
let sink = "";

export const soundSink = () => sink;

// An element joins the device chosen as it is made (LiveVideo's pool, the
// engine's <audio>s), so it never starts on another one.
export function applySink(el) {
    if (!el || typeof el.setSinkId !== "function" || el.sinkId === sink) return;
    el.setSinkId(sink).catch(() => {});
}

export function setSoundSink(id) {
    sink = typeof id === "string" ? id : "";
    if (typeof document === "undefined") return;
    for (const el of document.querySelectorAll("video, audio")) applySink(el);
}

// The AudioContext options for the chime (bell.js): on the device chosen.
export const sinkOptions = () => (sink ? { sinkId: sink } : undefined);
