// The sound's wave under Marcar os tempos' marks (owner 2026-11-12, T4):
// the file's samples squeezed into `buckets` peaks once (0–1, the loudest
// 1), then one height per pixel column of the window on screen. Pure;
// SyncTimeline decodes the file and draws. Console only.
export const BUCKETS = 4000;

// The loudest sample of each bucket across the channels, normalised.
export function peaks(channels, buckets = BUCKETS) {
    const len = channels[0]?.length || 0;
    const out = new Float32Array(buckets);
    if (!len) return out;
    const per = len / buckets;
    let top = 0;
    for (let b = 0; b < buckets; b++) {
        const start = Math.floor(b * per);
        const end = Math.max(start + 1, Math.floor((b + 1) * per));
        // At most ~64 samples a bucket: enough for the shape, fast on a long file.
        const step = Math.max(1, Math.floor((end - start) / 64));
        let m = 0;
        for (const ch of channels) for (let i = start; i < end && i < len; i += step) { const v = Math.abs(ch[i]); if (v > m) m = v; }
        out[b] = m;
        if (m > top) top = m;
    }
    if (top > 0) for (let b = 0; b < buckets; b++) out[b] /= top;
    return out;
}

// One height (0–1) per column of a window `span` seconds wide from `from`,
// over a song `duration` seconds long; beyond the file, 0.
export function columns(p, duration, from, span, width) {
    const out = new Float32Array(Math.max(0, Math.floor(width)));
    if (!p?.length || !(duration > 0) || !(span > 0)) return out;
    const n = p.length;
    for (let x = 0; x < out.length; x++) {
        const t0 = from + (x / out.length) * span;
        const t1 = from + ((x + 1) / out.length) * span;
        if (t1 <= 0 || t0 >= duration) continue;
        const a = Math.max(0, Math.floor((t0 / duration) * n));
        const b = Math.min(n, Math.max(a + 1, Math.ceil((t1 / duration) * n)));
        let m = 0;
        for (let i = a; i < b; i++) if (p[i] > m) m = p[i];
        out[x] = m;
    }
    return out;
}
