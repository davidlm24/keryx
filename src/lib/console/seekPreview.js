// The player's progress bar shows the moment under the pointer, as on
// YouTube (owner 2026-10-20, Rodada N1): the time, the slide of the letra
// automática there and, for a video of the computer, a frame of the file.
// The frames come from an element of the console's own, never the one on
// air (useFramePreview.js); this is the arithmetic. Plain JS, no imports,
// so node --test can check it.

// The frame's size on the tip (n2_tamanho: 160 × 90).
export const FRAME_W = 160;
export const FRAME_H = 90;
// How many frames stay drawn (one per second of the file).
export const FRAME_CACHE = 40;

// The second a frame stands for: one frame per second, so a hand that moves
// a pixel does not ask the file for another one.
export function quantise(t, step = 1) {
    if (!Number.isFinite(t) || t <= 0) return 0;
    return Math.floor(t / step) * step;
}

// A frame's key in the cache: the file and its second.
export const frameKey = (url, second) => `${url}#${second}`;

// The slide the letra automática shows at `t` seconds: the last mark at or
// before it (followTicks, player.js). null before the first mark or with none.
export function slideNameAt(ticks, t) {
    let name = null;
    for (const tick of ticks || []) {
        if (Number.isFinite(tick?.t) && tick.t <= t) name = tick.name || null;
    }
    return name;
}

// Where the tip's centre goes on a bar `width` wide for a pointer at `x`
// (both from the bar's left edge), so a tip `half` wide each side stays
// inside the bar; a bar narrower than the tip centres it.
export function tipLeft(x, width, half) {
    if (!(width > 0)) return 0;
    if (2 * half >= width) return width / 2;
    return Math.min(width - half, Math.max(half, x));
}

// The frame drawn inside the tip's box, contained (bars where the shapes differ).
export function containBox(srcW, srcH, boxW = FRAME_W, boxH = FRAME_H) {
    if (!(srcW > 0) || !(srcH > 0)) return { x: 0, y: 0, w: boxW, h: boxH };
    const s = Math.min(boxW / srcW, boxH / srcH);
    const w = Math.round(srcW * s);
    const h = Math.round(srcH * s);
    return { x: Math.round((boxW - w) / 2), y: Math.round((boxH - h) / 2), w, h };
}

// A small least-recently-used cache; `drop` gets what falls out (the
// console closes the frame's bitmap there).
export function makeLru(limit = FRAME_CACHE, drop = () => {}) {
    const map = new Map();
    return {
        get(key) {
            if (!map.has(key)) return undefined;
            const value = map.get(key);
            map.delete(key);
            map.set(key, value);
            return value;
        },
        set(key, value) {
            if (map.has(key)) { const old = map.get(key); map.delete(key); if (old !== value) drop(old); }
            map.set(key, value);
            while (map.size > limit) {
                const [oldest, gone] = map.entries().next().value;
                map.delete(oldest);
                drop(gone);
            }
        },
        has: (key) => map.has(key),
        get size() { return map.size; },
        clear() { for (const value of map.values()) drop(value); map.clear(); },
    };
}
