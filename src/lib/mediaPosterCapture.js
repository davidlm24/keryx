import { keryx } from "@/api/keryxClient";
import { needsPoster, posterTimes, posterSize, frameBrightness, DARK_FRAME } from "@/lib/mediaPoster";

const TIMEOUT_MS = 25_000;

// One frame of a video file as a JPEG blob, from an element that is never
// on the page (muted, never played). -> { blob, duration }
export function capturePoster(url) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        // Asked for in CORS mode (the media server allows any origin): the
        // console may be on another origin than the files (desktop:dev runs
        // it on the Vite server), and a frame from another origin taints the
        // canvas, so toBlob would refuse it.
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.preload = "auto";
        video.playsInline = true;
        let done = false;
        const finish = (err, value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            video.removeAttribute("src");
            video.load();
            if (err) reject(err);
            else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error("O vídeo demorou demais para abrir.")), TIMEOUT_MS);
        video.addEventListener("error", () => finish(new Error("Não foi possível abrir o vídeo.")));
        // Frames are taken at a few places and the brightest kept: a clip that
        // starts with a fade (or a dark scene) gave a black tile (2026-10-29).
        let times = [0];
        let tried = 0;
        let best = null;
        video.addEventListener("loadedmetadata", () => {
            times = posterTimes(video.duration);
            seek();
        }, { once: true });
        video.addEventListener("seeked", look);
        function seek() {
            if (times[tried] > 0) video.currentTime = times[tried];
            else if (video.readyState >= 2) look();
            else video.addEventListener("loadeddata", look, { once: true });
        }
        function look() {
            try {
                const { width, height } = posterSize(video.videoWidth, video.videoHeight);
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(video, 0, 0, width, height);
                // A small sample is enough to tell a black frame from a picture.
                const probe = document.createElement("canvas");
                probe.width = 32;
                probe.height = 18;
                const pctx = probe.getContext("2d");
                pctx.drawImage(canvas, 0, 0, 32, 18);
                const light = frameBrightness(pctx.getImageData(0, 0, 32, 18).data);
                if (!best || light > best.light) best = { canvas, light };
                tried += 1;
                if (best.light >= DARK_FRAME || tried >= times.length) { save(); return; }
                seek();
            } catch (err) {
                finish(err);
            }
        }
        function save() {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            best.canvas.toBlob((blob) => (blob ? finish(null, { blob, duration, light: best.light }) : finish(new Error("Sem imagem do vídeo."))), "image/jpeg", 0.8);
        }
        video.src = url;
    });
}

// A picture made small (owner 2026-10-23): at most 480 px, as WebP (it keeps
// a logo's transparency). Asked for in CORS mode, as the video above.
// -> { blob, duration: 0 }
export function capturePicture(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        const timer = setTimeout(() => reject(new Error("A imagem demorou demais para abrir.")), TIMEOUT_MS);
        img.onerror = () => { clearTimeout(timer); reject(new Error("Não foi possível abrir a imagem.")); };
        img.onload = () => {
            clearTimeout(timer);
            try {
                const { width, height } = posterSize(img.naturalWidth, img.naturalHeight);
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const g = canvas.getContext("2d");
                g.imageSmoothingQuality = "high";
                g.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => (blob ? resolve({ blob, duration: 0 }) : reject(new Error("Sem imagem."))), "image/webp", 0.82);
            } catch (err) {
                reject(err);
            }
        };
        img.src = url;
    });
}

// Takes a Media row's still (a video) or small copy (a picture) and saves it
// as a media file of its own (UploadFile: the adapter stores it as
// keryx-media://, never the http form), filling a video's duration too when
// the row has none. -> the updated row
export async function savePoster(row, { again = false } = {}) {
    // again: a video that has a still but a black one (stillIsDark): make it anew.
    if (again ? !(row?.type === "video" && String(row.file_url || "").startsWith("http")) : !needsPoster(row)) return row;
    const picture = row.type === "image";
    const { blob, duration } = picture ? await capturePicture(row.file_url) : await capturePoster(row.file_url);
    const file = picture
        ? new File([blob], `${row.id || "imagem"}-miniatura.webp`, { type: "image/webp" })
        : new File([blob], `${row.id || "video"}-miniatura.jpg`, { type: "image/jpeg" });
    const { file_url } = await keryx.integrations.Core.UploadFile({ file });
    const patch = { thumbnail_url: file_url };
    if (!row.duration && duration > 0) patch.duration = Math.round(duration);
    return keryx.entities.Media.update(row.id, patch);
}

// Whether a video's saved still is a black tile (made before the capture looked
// past a fade). A file this computer cannot read counts as fine.
export function stillIsDark(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = 32;
                c.height = 18;
                const ctx = c.getContext("2d");
                ctx.drawImage(img, 0, 0, 32, 18);
                resolve(frameBrightness(ctx.getImageData(0, 0, 32, 18).data) < DARK_FRAME);
            } catch { resolve(false); }
        };
        img.onerror = () => resolve(false);
        img.src = url;
    });
}
