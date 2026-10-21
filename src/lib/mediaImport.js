import { keryx } from "@/api/keryxClient";
import { PPTX_HINT } from "@/lib/presentation";
import { FONTS_IN_EDITOR_HINT, FONT_EXTENSIONS } from "@/lib/fonts";
import { readVideoCodec, fileReader } from "@/lib/videoCodec";

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
    // A font file is not media: it enters through the Editor de temas (Rodada HF1).
    if (type.startsWith("font/") || FONT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) return "font";
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

// The Media rows made in this window, so a PDF sent here gets its pages at
// once and one that came from another computer waits for that one's
// (pagesWait in presentation.js).
export const madeHere = new Set();

// Mídia can be detached into its own BrowserWindow. A module Set belongs to
// one renderer only, so remember locally-created rows in this computer's
// storage too: the Console renderer then knows this is not a PDF arriving
// from another KERYX and must not wait for the sync grace period.
const MADE_HERE_KEY = "keryx.media.made-here.v1";
const MADE_HERE_LIMIT = 200;
const madeHereListeners = new Set();
const tellMadeHere = () => { for (const fn of madeHereListeners) fn(); };
const savedMadeHere = () => {
    try {
        const list = JSON.parse(window.localStorage.getItem(MADE_HERE_KEY) || "[]");
        return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
    } catch { return []; }
};
export function restoreMadeHere() {
    if (typeof window === "undefined") return;
    for (const id of savedMadeHere()) madeHere.add(id);
}
export function rememberMadeHere(id) {
    if (!id) return;
    madeHere.add(id);
    try {
        const next = [...new Set([...savedMadeHere(), id])].slice(-MADE_HERE_LIMIT);
        window.localStorage.setItem(MADE_HERE_KEY, JSON.stringify(next));
    } catch { /* this renderer still knows its own import */ }
    tellMadeHere();
}
export const subscribeMadeHere = (fn) => { madeHereListeners.add(fn); return () => madeHereListeners.delete(fn); };

if (typeof window !== "undefined") {
    restoreMadeHere();
    window.addEventListener("storage", (event) => {
        if (event.key !== MADE_HERE_KEY) return;
        restoreMadeHere();
        tellMadeHere();
    });
}

// The files being copied right now (Rodada H, HB): the Biblioteca and the
// Mídia list a row "Copiando o arquivo…" for each while UploadFile runs
// (before, the row only appeared once the copy was done). Each entry is
// { key, name, title, type, category, waiting, rowId }: waiting until its
// turn comes, rowId once its Media row is made. The lists stop drawing an
// entry as soon as that row is in them (copyingRows in libraryRows.js), so
// the real row replaces it in place. This window only.
const COPY_LINGER_MS = 4000;
let copying = [];
const copyingListeners = new Set();
const setCopying = (next) => { copying = next; for (const fn of copyingListeners) fn(); };
const dropCopying = (key) => setCopying(copying.filter((c) => c.key !== key));
export const copyingNow = () => copying;
export const subscribeCopying = (fn) => { copyingListeners.add(fn); return () => copyingListeners.delete(fn); };
let batches = 0;

// A video's codec, read from the picked file (src/lib/videoCodec.js): the
// Media row's video_codec / video_bit_depth. A file it cannot read is copied
// all the same; the console's backfill tries again from the media folder.
async function codecFields(file) {
    try {
        const found = await readVideoCodec(fileReader(file), file.size);
        if (!found) return {};
        return { video_codec: found.codec, ...(found.bitDepth ? { video_bit_depth: found.bitDepth } : {}) };
    } catch {
        return {};
    }
}

// A PowerPoint file is not copied (Rodada F3, "Só PDF"): it comes back in
// `refused`, and the caller says how to save it as PDF (PPTX_HINT). A PDF's
// pages are made after, by the console (usePagesBackfill).
export async function importMediaFiles(files, { title = "", description = "", category = "other", onProgress } = {}) {
    const list = Array.from(files || []);
    const created = [];
    const failed = [];
    const refused = [];
    const batch = ++batches;
    const keyOf = (i) => `${batch}:${i}`;
    const titleOf = (file) => (title ? (list.length > 1 ? `${title} - ${file.name}` : title) : file.name.replace(/\.[^.]+$/, ""));
    // Every file of the batch is listed at once; each one leaves the list
    // when its row arrives (or when it fails).
    setCopying([...copying, ...list.flatMap((file, i) => (mediaTypeOf(file) === "powerpoint" ? [] : [{ key: keyOf(i), name: file.name, title: titleOf(file), type: mediaTypeOf(file), category, waiting: i > 0, rowId: null }]))]);
    for (const [i, file] of list.entries()) {
        onProgress?.(i, list.length, file.name);
        const kind = mediaTypeOf(file);
        if (kind === "powerpoint") { refused.push({ name: file.name, message: PPTX_HINT }); continue; }
        if (kind === "font") { refused.push({ name: file.name, message: FONTS_IN_EDITOR_HINT }); continue; }
        try {
            if (i > 0) setCopying(copying.map((c) => (c.key === keyOf(i) ? { ...c, waiting: false } : c)));
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            const row = await keryx.entities.Media.create({
                title: titleOf(file),
                description,
                type: kind,
                file_url,
                category,
                duration: 0,
                ...(kind === "video" ? await codecFields(file) : {}),
            });
            if (row?.id) rememberMadeHere(row.id);
            created.push(row);
            // The real row replaces the entry as soon as the lists have it;
            // this only clears an entry a list never shows (a filter).
            const key = keyOf(i);
            setCopying(copying.map((c) => (c.key === key ? { ...c, rowId: row?.id || null } : c)));
            setTimeout(() => dropCopying(key), COPY_LINGER_MS);
        } catch (err) {
            dropCopying(keyOf(i));
            failed.push({ name: file.name, message: err?.message || "falhou" });
        }
    }
    return { created, failed, refused };
}

// Why the failed files failed, when they all failed for one reason: no space
// on the disk, a file too big to come that way (electron/mediaImport.cjs
// says it in a sentence the operator can act on). "" when the reasons differ.
export function failureReason(failed = []) {
    const reasons = new Set(failed.map((x) => x?.message).filter((m) => m && m !== "falhou"));
    return reasons.size === 1 ? [...reasons][0] : "";
}

// What the Mídia says after an import: how many came in, which failed (and
// why, when it is one reason) and, for the files refused (PowerPoint, a
// font file), what to do instead — each reason once.
export function importSummary({ created = [], failed = [], refused = [] }, where = "") {
    const parts = [];
    if (created.length || !refused.length) parts.push(`${created.length} ${created.length === 1 ? "arquivo adicionado" : "arquivos adicionados"}${where}`);
    if (failed.length) parts.push(`falhou: ${failed.map((x) => x.name).join(", ")}`);
    const why = failureReason(failed);
    if (why) parts.push(why);
    for (const hint of new Set(refused.map((x) => x.message || PPTX_HINT))) parts.push(hint);
    return parts.join(" · ").replace(/([^.])$/, "$1.");
}
