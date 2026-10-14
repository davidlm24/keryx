import { keryx } from "@/api/keryxClient";
import { needsPoster, posterTime, posterSize } from "@/lib/mediaPoster";

const TIMEOUT_MS = 15_000;

// One frame of a video file as a JPEG blob, from an element that is never
// on the page (muted, never played). Media comes from KERYX's own server,
// so the canvas may be read. -> { blob, duration }
export function capturePoster(url) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
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
        video.addEventListener("loadedmetadata", () => {
            const at = posterTime(video.duration);
            if (at > 0) video.currentTime = at;
            else video.addEventListener("loadeddata", draw, { once: true });
        }, { once: true });
        video.addEventListener("seeked", draw, { once: true });
        function draw() {
            try {
                const { width, height } = posterSize(video.videoWidth, video.videoHeight);
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(video, 0, 0, width, height);
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                canvas.toBlob((blob) => (blob ? finish(null, { blob, duration }) : finish(new Error("Sem imagem do vídeo."))), "image/jpeg", 0.8);
            } catch (err) {
                finish(err);
            }
        }
        video.src = url;
    });
}

// Takes a Media row's still and saves it as a media file of its own
// (UploadFile: the adapter stores it as keryx-media://, never the http form),
// filling the duration too when the row has none. -> the updated row
export async function savePoster(row) {
    if (!needsPoster(row)) return row;
    const { blob, duration } = await capturePoster(row.file_url);
    const file = new File([blob], `${row.id || "video"}-miniatura.jpg`, { type: "image/jpeg" });
    const { file_url } = await keryx.integrations.Core.UploadFile({ file });
    const patch = { thumbnail_url: file_url };
    if (!row.duration && duration > 0) patch.duration = Math.round(duration);
    return keryx.entities.Media.update(row.id, patch);
}
