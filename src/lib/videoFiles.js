// What this window knows of each video file, by file (Rodada O, item 11):
// its still (Media.thumbnail_url), for the screens that only show a picture
// of a video background — the Prévia, the Temas thumbnails, the library's
// samples (a playing <video> in each of them decoded one file 15 times at
// once; only the outputs and the Programa monitor play the file) — and its
// codec (Media.video_codec…, src/lib/videoCodec.js), for the mark on a
// background that may not play. The windows that list the media (the
// console, a detached /Janela) fill it with setVideoFiles; a screen that
// never does draws the paused first frame and no mark. Nothing here imports
// the codec reader: the renderer (VideoStill) loads this on every output,
// within the outputs' bundle budget.

// A file's key, whatever form its URL is in: keryx-media://f.mp4 and
// http://127.0.0.1:7700/media/f.mp4 are the same file.
export function fileKey(url) {
    const u = String(url || "").split(/[?#]/)[0];
    return u.replace(/^keryx-media:\/\//, "").replace(/^https?:\/\/[^/]+\/media\//, "");
}

// The map of file key -> { still, codec } from Media rows (the videos).
export function filesFrom(rows = []) {
    const out = new Map();
    for (const m of rows || []) {
        if (m?.type !== "video" || !m.file_url) continue;
        // The row's codec fields, as videoCodec.js's codecOfRow reads them.
        const codec = { codec: m.video_codec || null, bitDepth: m.video_bit_depth ?? null, chroma: m.video_chroma || null };
        if (m.thumbnail_url || codec.codec) out.set(fileKey(m.file_url), { still: m.thumbnail_url || null, codec });
    }
    return out;
}

let files = new Map();
const listeners = new Set();
const sig = (v) => `${v.still}|${v.codec.codec}|${v.codec.bitDepth}|${v.codec.chroma}`;
const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && sig(b.get(k)) === sig(v));

export function setVideoFiles(rows) {
    const next = filesFrom(rows);
    if (same(next, files)) return;
    files = next;
    for (const fn of listeners) fn();
}
export const stillOf = (url) => (url ? files.get(fileKey(url))?.still || null : null);
export const codecOf = (url) => (url ? files.get(fileKey(url))?.codec || null : null);
export const subscribeFiles = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
