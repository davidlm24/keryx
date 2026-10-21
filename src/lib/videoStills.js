// Each video file's still (Media.thumbnail_url), by file, for the screens
// that only show a picture of a video background (Rodada O, item 11): the
// Prévia, the Temas thumbnails, the library's samples. A playing <video> in
// each of them decoded one file 15 times at once; they draw this still
// instead, and only the outputs and the Programa monitor play the file. The
// windows that list the media (the console, a detached /Janela) fill it
// with setVideoStills; a screen that never does draws the paused first frame.

// A file's key, whatever form its URL is in: keryx-media://f.mp4 and
// http://127.0.0.1:7700/media/f.mp4 are the same file.
export function fileKey(url) {
    const u = String(url || "").split(/[?#]/)[0];
    return u.replace(/^keryx-media:\/\//, "").replace(/^https?:\/\/[^/]+\/media\//, "");
}

// The map of file key -> still from Media rows (the videos that have one).
export function stillsFrom(rows = []) {
    const out = new Map();
    for (const m of rows || []) {
        if (m?.type === "video" && m.file_url && m.thumbnail_url) out.set(fileKey(m.file_url), m.thumbnail_url);
    }
    return out;
}

let stills = new Map();
const listeners = new Set();
const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export function setVideoStills(rows) {
    const next = stillsFrom(rows);
    if (same(next, stills)) return;
    stills = next;
    for (const fn of listeners) fn();
}
export const stillOf = (url) => (url ? stills.get(fileKey(url)) || null : null);
export const subscribeStills = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
