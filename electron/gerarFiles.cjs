// The files attached to a GERAR request (owner 2026-11-18, wave 4; the
// brief's item 6): listed in the GERAR's `attachments` (owner_type
// live_request, the private bucket service-attachments, which the device
// reads through its RLS), downloaded here one at a time to a temporary file,
// copied into the media folder by importMedia (the same door as every file),
// and handed to the console, which makes the Media row and ties the first
// video or audio to the pedido (useGerarImport). The card says "baixando…"
// meanwhile.
//
// Kept in settings.json "gerar".files ([{ requestId, done: [attachment ids] }]):
// a download cut short (KERYX closed, no internet) goes on at the next pass,
// never twice the same attachment.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const KEY = "gerar";
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB, as the .keryx package
const MAX_QUEUE = 100;
const enc = encodeURIComponent;
// What the Mídia takes (a video, an audio, a picture, a PDF); any other
// attachment stays in the GERAR (src/lib/console/gerarImport.js gerarMediaType).
const MEDIA_EXT = /\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav|ogg|aac|flac|jpe?g|png|webp|gif|pdf)$/i;
// A storage path, each segment encoded, its slashes kept.
const storagePath = (p) => String(p || "").split("/").map(enc).join("/");

function createGerarFiles({ link, settings, config, deliver, importFile, tmpDir, fetchImpl = globalThis.fetch, log = console.warn }) {
    let running = null;

    const cfg = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const list = () => (Array.isArray(cfg().files) ? cfg().files : []);
    const save = (next) => {
        const c = cfg();
        if (!c.device) return;
        settings.set(KEY, { ...c, files: next.slice(-MAX_QUEUE) });
    };
    const update = (requestId, fn) => save(list().map((e) => (e.requestId === requestId ? fn(e) : e)));
    const remove = (requestId) => save(list().filter((e) => e.requestId !== requestId));

    // Say the pedido's file state on its card ("downloading" | "failed" | "").
    const tell = (requestId, state) => deliver({ items: [{ type: "fileState", requestId, state }] }).catch(() => null);

    async function download(att) {
        const token = await link.token();
        const url = `${config.url}/storage/v1/object/authenticated/${enc(att.bucket_id || "service-attachments")}/${storagePath(att.storage_path)}`;
        let res;
        try {
            res = await fetchImpl(url, { headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
        } catch {
            throw Object.assign(new Error("O GERAR não respondeu."), { code: "offline" });
        }
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error("O GERAR recusou o arquivo."), { status: res.status, code: "refused" });
        if (res.status === 404 || res.status === 400) throw Object.assign(new Error("O arquivo não está mais no GERAR."), { status: res.status, code: "gone" });
        if (res.status !== 200 || !res.body) throw Object.assign(new Error("O GERAR não respondeu."), { status: res.status, code: "offline" });
        const declared = Number(res.headers && res.headers.get && res.headers.get("content-length")) || 0;
        if (declared > MAX_BYTES) throw Object.assign(new Error("O arquivo passa de 1 GB."), { code: "big" });
        await fsp.mkdir(tmpDir, { recursive: true });
        const tmp = path.join(tmpDir, `${att.id}.part`);
        try {
            await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
            const name = att.file_name || path.basename(att.storage_path || "arquivo");
            const out = await importFile({ sourcePath: tmp, name });
            if (!out || out.error || !out.fileName) throw Object.assign(new Error((out && out.error && out.error.message) || "O arquivo não foi salvo."), { code: "import" });
            const size = (await fsp.stat(tmp).catch(() => null))?.size || declared || 0;
            return { fileName: out.fileName, name, size };
        } finally {
            await fsp.rm(tmp, { force: true }).catch(() => {});
        }
    }

    async function one(entry) {
        const atts = await link.rest("GET", `attachments?select=id,file_name,storage_path,bucket_id,kind&owner_type=eq.live_request&owner_id=eq.${enc(entry.requestId)}&order=created_at.asc`);
        const todo = (Array.isArray(atts) ? atts : []).filter((a) => a && a.id && a.storage_path && MEDIA_EXT.test(a.file_name || a.storage_path) && !(entry.done || []).includes(a.id));
        if (!todo.length) {
            if ((entry.done || []).length) await tell(entry.requestId, "");
            remove(entry.requestId);
            return true;
        }
        await tell(entry.requestId, "downloading");
        let failed = false;
        for (const att of todo) {
            try {
                const file = await download(att);
                await deliver({ items: [{ type: "file", requestId: entry.requestId, attachmentId: att.id, ...file }] });
            } catch (err) {
                if (err.code === "offline") return false; // stays, tried again on the next pass
                if (err.pg === "42501") throw err;
                log(`[gerar] anexo ${att.id}: ${err.message}`);
                failed = true;
            }
            update(entry.requestId, (e) => ({ ...e, done: [...(e.done || []), att.id] }));
        }
        await tell(entry.requestId, failed ? "failed" : "");
        remove(entry.requestId);
        return true;
    }

    return {
        // A request this computer brought: its files come down next.
        queue(requestId) {
            if (!requestId || list().some((e) => e.requestId === requestId)) return;
            save([...list(), { requestId: String(requestId), done: [] }]);
        },
        // One pass over the queue, one file at a time; stops when the GERAR
        // cannot be reached.
        run() {
            if (running) return running;
            running = (async () => {
                for (const entry of list()) {
                    const ok = await one(entry);
                    if (!ok) return;
                }
            })().finally(() => { running = null; });
            return running;
        },
        pending: () => list().length,
    };
}

module.exports = { createGerarFiles, MAX_BYTES };
