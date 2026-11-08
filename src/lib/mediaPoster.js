// A video's still and a picture's small copy (Media.thumbnail_url): which
// rows need one, which second to take and how big. Pure, so node --test can
// check it (mediaPoster.test.mjs); the capture itself is
// src/lib/mediaPosterCapture.js.

const isYouTube = (url) => /youtu\.?be/.test(String(url || ""));
// A GIF moves and an SVG is drawn at any size: their tiles keep the file.
const stillPicture = (url) => !/\.(gif|svg)(?:[?#]|$)/i.test(url);

// A video file, or a picture (owner 2026-10-23: the galleries decoded each
// photo whole for a 160 px tile), of the library without a small copy yet.
// Links (YouTube, the web) and files that are not on this computer are left
// alone.
export function needsPoster(row) {
    if (!row || row.missing || row.thumbnail_url) return false;
    const url = String(row.file_url || "");
    if (!url.startsWith("http")) return false;
    if (row.type === "video") return !isYouTube(url);
    // A picture only from this computer's media (another site's would taint the canvas).
    return row.type === "image" && /\/media\//.test(url) && stillPicture(url);
}

// What a gallery tile draws for a picture: its small copy once it is here,
// else the file. (A video's tile is its still, VideoStill or the row's.)
export const tileUrl = (row) => (row?.thumbnail_url && !row.posterSyncing ? row.thumbnail_url : row?.file_url || "");

// The second to take: a tenth of the way in (past a fade from black), at
// least 1 s and at most 5 s; the start of a clip too short for that.
export function posterTime(duration) {
    const d = Number(duration);
    if (!Number.isFinite(d) || d <= 0) return 0;
    if (d < 2) return d / 2;
    return Math.min(5, Math.max(1, d / 10));
}

// The seconds worth trying for a still, best guess first: a clip that fades in
// or starts on a dark scene is black at a tenth of the way, so the capture
// looks at a few more places and keeps the brightest frame (owner 2026-10-29:
// some background videos were a black tile until the pointer was over them).
export function posterTimes(duration) {
    const d = Number(duration);
    const first = posterTime(d);
    if (!Number.isFinite(d) || d <= 0) return [0];
    if (d < 2) return [first];
    return [...new Set([first, d * 0.25, d * 0.5, d * 0.75].map((t) => Math.round(Math.min(t, d - 0.1) * 10) / 10))];
}

// How bright a frame is, 0-255: the mean of the luma of RGBA pixels (a small
// sample of the picture is enough).
export function frameBrightness(rgba) {
    const px = rgba?.length ? Math.floor(rgba.length / 4) : 0;
    if (px === 0) return 0;
    let sum = 0;
    for (let i = 0; i < px * 4; i += 4) sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    return sum / px;
}

// Below this a frame is a black tile (a fade, a dark scene): look further.
export const DARK_FRAME = 10;

// The still's size: the video's shape, at most max px wide or high.
export function posterSize(width, height, max = 480) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return { width: max, height: Math.round(max * 9 / 16) };
    const k = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
