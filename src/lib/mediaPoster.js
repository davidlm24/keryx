// A video's still (Media.thumbnail_url): which rows need one, which second
// to take and how big. Pure, so node --test can check it (mediaPoster.test.mjs);
// the capture itself is src/lib/mediaPosterCapture.js.

const isYouTube = (url) => /youtu\.?be/.test(String(url || ""));

// A video file of the library without a still yet. Links (YouTube, the web)
// and files that are not on this computer are left alone.
export function needsPoster(row) {
    if (!row || row.type !== "video" || row.missing || row.thumbnail_url) return false;
    const url = String(row.file_url || "");
    return url.startsWith("http") && !isYouTube(url);
}

// The second to take: a tenth of the way in (past a fade from black), at
// least 1 s and at most 5 s; the start of a clip too short for that.
export function posterTime(duration) {
    const d = Number(duration);
    if (!Number.isFinite(d) || d <= 0) return 0;
    if (d < 2) return d / 2;
    return Math.min(5, Math.max(1, d / 10));
}

// The still's size: the video's shape, at most max px wide or high.
export function posterSize(width, height, max = 480) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return { width: max, height: Math.round(max * 9 / 16) };
    const k = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
