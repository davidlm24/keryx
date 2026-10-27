// The level of the PC's sound output (0..1), for the audio-reactive
// generated backgrounds (shared/generators.mjs gen.audio): the console
// measures it with its level meters (meterStore.js) and sets it here for
// its own monitors, and sends it over IPC (keryx:audio-level) to the
// output windows, which read it here through window.keryxDesktop. Nothing
// is stored and the network never sees it: a screen on the network draws
// the generator without the sound. Pure parts (follow) are tested.

let level = 0;
let heard = 0;
let listening = null;

// Every surface's own copy of the level (the console's monitors get it
// straight from the meters; an output, from IPC).
export function setLevel(v) {
    level = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    heard = Date.now();
}

// The level now: what was last set, or 0 when nothing arrived for a while
// (the console stopped sending: no generator follows the sound any more).
export function getLevel(now = Date.now()) {
    return now - heard > 1500 ? 0 : level;
}

// Starts listening to the console's level once (an output window); nothing
// to do where the level is set locally or where there is no bridge.
export function listenSystemLevel() {
    if (listening || typeof window === "undefined") return;
    const bridge = window.keryxDesktop?.meters;
    if (!bridge?.onSystemLevel) { listening = () => {}; return; }
    listening = bridge.onSystemLevel((v) => setLevel(v));
}

// The level a frame draws: it jumps up with the sound and falls slowly
// (`release` per frame), so a beat lands and fades instead of flickering.
export const follow = (shown, now, release = 0.06) => (now >= shown ? now : Math.round(Math.max(now, shown - release) * 1000) / 1000);
