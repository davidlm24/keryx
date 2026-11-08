import { useCallback, useEffect, useRef, useState } from "react";
import { quantise, frameKey, containBox, makeLru, FRAME_W, FRAME_H, FRAME_CACHE } from "@/lib/console/seekPreview";

const SEEK_TIMEOUT_MS = 3000;

// The frames of the progress bar's hover tip (Rodada N1): a video element of
// the console's own per file — muted, never played, never on the page —
// made on the first hover and let go when the file changes or the player
// goes. Never the window's pool (`videos.claim`, mediaPool.js): that element
// is the one on air. It seeks to the second under the pointer, one seek at a
// time (the latest wish wins when `seeked` comes), draws the frame at
// 160 × 90 and keeps the last ones as bitmaps (makeLru). Same pattern as
// capturePoster (mediaPosterCapture.js): CORS mode, the media server allows
// any origin, so the canvas is never tainted.
//
// -> { canvasRef, show(t), failed }: `show` paints the frame of `t` on the
// canvas (at once when it is cached); `failed` once the file cannot be read.
export function useFramePreview(url, on) {
    const canvasRef = useRef(null);
    const state = useRef(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
        return () => { close(state.current); state.current = null; };
    }, [url]);

    const show = useCallback((t) => {
        if (!on || !url || typeof document === "undefined") return;
        let s = state.current;
        if (!s || s.url !== url) {
            close(s);
            s = state.current = open(url, canvasRef, () => setFailed(true));
        }
        if (s.dead) return;
        s.want = quantise(t);
        pump(s);
    }, [url, on]);

    return { canvasRef, show, failed };
}

function open(url, canvasRef, onFail) {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    const work = document.createElement("canvas");
    work.width = FRAME_W;
    work.height = FRAME_H;
    const s = {
        url, video, work, canvasRef, want: null, busy: null, timer: 0, ready: false, dead: false,
        cache: makeLru(FRAME_CACHE, (bmp) => bmp?.close?.()),
    };
    video.addEventListener("loadedmetadata", () => { s.ready = true; pump(s); }, { once: true });
    video.addEventListener("error", () => { s.dead = true; onFail(); });
    video.addEventListener("seeked", () => grab(s));
    video.src = url;
    return s;
}

function close(s) {
    if (!s) return;
    s.dead = true;
    clearTimeout(s.timer);
    s.cache.clear();
    s.video.removeAttribute("src");
    s.video.load();
}

function paint(canvas, bmp) {
    const g = canvas?.getContext("2d");
    if (!g || !bmp) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
}

// Asks the file for the frame wished for, unless it is drawn already or a
// seek is still on its way (its `seeked` asks for the latest wish).
function pump(s) {
    if (s.dead || s.want == null) return;
    const hit = s.cache.get(frameKey(s.url, s.want));
    if (hit) { paint(s.canvasRef.current, hit); return; }
    if (!s.ready || s.busy != null) return;
    const second = s.want;
    const end = Number.isFinite(s.video.duration) ? Math.max(0, s.video.duration - 0.1) : second;
    s.busy = second;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.busy = null; pump(s); }, SEEK_TIMEOUT_MS);
    s.video.currentTime = Math.min(second, end);
}

function grab(s) {
    if (s.dead || s.busy == null) return;
    const second = s.busy;
    clearTimeout(s.timer);
    const g = s.work.getContext("2d");
    const box = containBox(s.video.videoWidth, s.video.videoHeight);
    try {
        g.fillStyle = "#000";
        g.fillRect(0, 0, FRAME_W, FRAME_H);
        g.drawImage(s.video, box.x, box.y, box.w, box.h);
    } catch {
        s.busy = null;
        return;
    }
    createImageBitmap(s.work).then((bmp) => {
        if (s.dead) { bmp.close?.(); return; }
        s.cache.set(frameKey(s.url, second), bmp);
        s.busy = null;
        pump(s);
    }, () => { s.busy = null; });
}
