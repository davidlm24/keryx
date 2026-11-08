// Ctrl+wheel on the console (audit C-91): Chromium would zoom the page
// freely, with no way back (and a precision touchpad's pinch arrives as
// Ctrl+wheel). The page blocks it everywhere on the desktop (src/main.jsx);
// on the console it steps the same saved zoom as Ctrl+= / Ctrl+−
// (electron/consoleZoom.cjs). A mouse notch is about 100 px of deltaY; a
// touchpad sends many small deltas, added up until they make one.
export const WHEEL_STEP = 100;

// acc: what has added up so far; deltaY: this event's (negative = up/in).
// -> { acc, dir }: dir 1 (in), -1 (out) or 0 (not yet).
export function wheelZoomStep(acc, deltaY) {
    const sum = (Number.isFinite(acc) ? acc : 0) + (Number.isFinite(deltaY) ? deltaY : 0);
    if (sum <= -WHEEL_STEP) return { acc: 0, dir: 1 };
    if (sum >= WHEEL_STEP) return { acc: 0, dir: -1 };
    return { acc: sum, dir: 0 };
}
