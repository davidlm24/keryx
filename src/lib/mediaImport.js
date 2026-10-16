import { keryx } from "@/api/keryxClient";
import { PPTX_HINT } from "@/lib/presentation";

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

// A PowerPoint file is not copied (Rodada F3, "Só PDF"): it comes back in
// `refused`, and the caller says how to save it as PDF (PPTX_HINT). A PDF's
// pages are made after, by the console (usePagesBackfill).
export async function importMediaFiles(files, { title = "", description = "", category = "other", onProgress } = {}) {
    const list = Array.from(files || []);
    const created = [];
    const failed = [];
    const refused = [];
    for (const [i, file] of list.entries()) {
        onProgress?.(i, list.length, file.name);
        if (mediaTypeOf(file) === "powerpoint") { refused.push({ name: file.name, message: PPTX_HINT }); continue; }
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
    return { created, failed, refused };
}

// What the Mídia says after an import: how many came in, which failed and,
// for PowerPoint files, how to send them as PDF.
export function importSummary({ created = [], failed = [], refused = [] }, where = "") {
    const parts = [];
    if (created.length || !refused.length) parts.push(`${created.length} ${created.length === 1 ? "arquivo adicionado" : "arquivos adicionados"}${where}`);
    if (failed.length) parts.push(`falhou: ${failed.map((x) => x.name).join(", ")}`);
    if (refused.length) parts.push(PPTX_HINT);
    return parts.join(" · ").replace(/([^.])$/, "$1.");
}
