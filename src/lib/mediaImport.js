import { keryx } from "@/api/keryxClient";

// The Media type of a picked file, by MIME type and extension.
export function mediaTypeOf(file) {
    const name = String(file?.name || "");
    const type = String(file?.type || "");
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)$/i.test(name)) return "audio";
    if (type === "image/gif" || /\.gif$/i.test(name)) return "gif";
    if (type.startsWith("image/")) return "image";
    if (/\.pptx?$/i.test(name)) return "powerpoint";
    if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
    return "other";
}

// Files from the computer into the media library: each one is copied (on
// desktop, into the media folder) and becomes a Media row. One failure does
// not stop the rest. -> { created: [rows], failed: [{ name, message }] }
// A YouTube link as a Media row, so the Setlist and the planner can hold
// it; a link already in the library is reused, never duplicated.
export async function mediaFromYouTube(url, { title = "Vídeo do YouTube", category = "other" } = {}) {
    const u = String(url || "").trim();
    if (!/youtu\.?be/.test(u)) throw new Error("Cole um link do YouTube.");
    const existing = await keryx.entities.Media.filter({ file_url: u });
    if (existing?.[0]) return existing[0];
    return keryx.entities.Media.create({ title, type: "video", file_url: u, category, duration: 0 });
}

export async function importMediaFiles(files, { title = "", description = "", category = "other", onProgress } = {}) {
    const list = Array.from(files || []);
    const created = [];
    const failed = [];
    for (const [i, file] of list.entries()) {
        onProgress?.(i, list.length, file.name);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const row = await keryx.entities.Media.create({
                title: title ? (list.length > 1 ? `${title} - ${file.name}` : title) : baseName,
                description,
                type: mediaTypeOf(file),
                file_url,
                category,
                duration: 0,
            });
            created.push(row);
        } catch (err) {
            failed.push({ name: file.name, message: err?.message || "falhou" });
        }
    }
    return { created, failed };
}
